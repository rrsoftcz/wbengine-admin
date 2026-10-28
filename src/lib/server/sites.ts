import { transaction, rows } from './db.ts';
import { createHash } from 'node:crypto';
import { requireGlobal, requireSite, vault, type Session } from './auth.ts';
import { tokenHash } from './security.ts';
import { remoteGet, resolveTarget } from './remote.ts';
import { classifyRegistrationError, projectCapabilities, RegistrationError, verifyRegistration } from './registration-contract.ts';
export { projectCapabilities };
const allowed = () => (process.env.REMOTE_IP_ALLOWLIST ?? '').split(',').map(x => x.trim()).filter(Boolean);
export async function listSites(s: Session) {
    return transaction(c => s.user.globalAdmin ? rows<{
        id: number;
        name: string;
        base_url: string;
    }>(c, 'SELECT id,name,base_url FROM sites ORDER BY name') : rows<{
        id: number;
        name: string;
        base_url: string;
    }>(c, 'SELECT s.id,s.name,s.base_url FROM sites s JOIN grants g ON g.site_id=s.id WHERE g.user_id=? ORDER BY s.name', [s.user.id]));
}
const keyPattern = /^wbv2_[A-Za-z0-9_-]{20,200}$/;
const urlHash = (href: string) => createHash('sha256').update(href).digest('hex');
interface RegistrationDeps {
    resolve?: typeof resolveTarget;
    verify?: typeof verifyRegistration;
}
/** Counts verification attempts per account so a mistyped key cannot exhaust the remote site's limit for the shared central IP. */
async function consumeAttempt(subject: string) {
    return transaction(async (c) => {
        const hash = tokenHash(subject);
        await c.execute('INSERT IGNORE INTO login_attempts(subject_hash,window_start) VALUES (?,NOW(3))', [hash]);
        const [r] = await rows<{
            failures: number;
            old: number;
        }>(c, 'SELECT failures,(window_start<DATE_SUB(NOW(3),INTERVAL 15 MINUTE)) AS old FROM login_attempts WHERE subject_hash=? FOR UPDATE', [hash]);
        if (r.old) {
            await c.execute('UPDATE login_attempts SET failures=1,window_start=NOW(3) WHERE subject_hash=?', [hash]);
            return true;
        }
        if (r.failures >= 8)
            return false;
        await c.execute('UPDATE login_attempts SET failures=failures+1 WHERE subject_hash=?', [hash]);
        return true;
    });
}
const clearAttempts = (subject: string) => transaction(c => c.execute('DELETE FROM login_attempts WHERE subject_hash=?', [tokenHash(subject)]));
async function failed(actor: number | null, site: number | null, e: unknown): Promise<never> {
    const code = classifyRegistrationError(e);
    await transaction(c => c.execute('INSERT INTO audit(user_id,site_id,event) VALUES (?,?,?)', [actor, site, `site.register.failed:${code}`])).catch(() => undefined);
    throw e instanceof RegistrationError ? e : new RegistrationError(code);
}
/** Web registration: global admin with MFA, remote verification before any write, one transaction for site, cipher and audit. */
export async function registerSite(s: Session, name: string, base: string, key: string, deps: RegistrationDeps = {}) {
    requireGlobal(s);
    if (!name.trim() || name.trim().length > 160 || !keyPattern.test(key))
        throw new RegistrationError('invalid_input');
    const subject = `register:${s.user.id}`;
    try {
        const target = await (deps.resolve ?? resolveTarget)(base, allowed());
        const hash = urlHash(target.url.href);
        if ((await transaction(c => rows(c, 'SELECT id FROM sites WHERE url_hash=?', [hash]))).length)
            throw new RegistrationError('duplicate_url');
        if (!await consumeAttempt(subject))
            throw new RegistrationError('rate_limited');
        const verified = await (deps.verify ?? verifyRegistration)(target.url.href, key, allowed());
        const id = await transaction(async (c) => {
            const [r] = await c.execute('INSERT INTO sites(name,base_url,key_cipher,url_hash,integration_id) VALUES (?,?,?,?,?)', [name.trim(), target.url.href, '', hash, verified.integrationId]);
            const siteId = (r as {
                insertId: number;
            }).insertId;
            await c.execute('UPDATE sites SET key_cipher=? WHERE id=?', [vault().encrypt(key, `site:${siteId}`), siteId]);
            await c.execute('INSERT INTO audit(user_id,site_id,event) VALUES (?,?,?)', [s.user.id, siteId, 'site.registered']);
            return siteId;
        }).catch(e => {
            throw (e as {
                errno?: number;
            }).errno === 1062 ? new RegistrationError('duplicate_url') : e;
        });
        await clearAttempts(subject);
        return { id, url: target.url.href, ...verified };
    }
    catch (e) {
        return failed(s.user.id, null, e);
    }
}
/** Trusted CLI path. Verification is on for the CLI; fixtures may opt out because they provision keys with a narrower profile. */
export async function provisionSite(name: string, base: string, key: string, actor: number | null = null, verify = false) {
    if (!name.trim() || name.length > 160 || !keyPattern.test(key))
        throw Error('Neplatná konfigurace webu');
    const target = await resolveTarget(base, allowed());
    const verified = verify ? await verifyRegistration(target.url.href, key, allowed()) : null;
    await transaction(async (c) => {
        const [r] = await c.execute('INSERT INTO sites(name,base_url,key_cipher,url_hash,integration_id) VALUES (?,?,?,?,?)', [name.trim(), target.url.href, '', urlHash(target.url.href), verified?.integrationId ?? null]);
        const id = (r as {
            insertId: number;
        }).insertId;
        await c.execute('UPDATE sites SET key_cipher=? WHERE id=?', [vault().encrypt(key, `site:${id}`), id]);
        await c.execute('INSERT INTO audit(user_id,site_id,event) VALUES (?,?,?)', [actor, id, 'site.registered']);
    });
}
/** Key rotation: verify the new key first, then swap the ciphertext. The old key is revoked by the owner afterwards on the target site. */
export async function replaceSiteKey(s: Session, id: number, key: string, deps: Pick<RegistrationDeps, 'verify'> = {}) {
    requireGlobal(s);
    if (!keyPattern.test(key))
        throw new RegistrationError('invalid_input');
    const subject = `register:${s.user.id}`;
    try {
        const [site] = await transaction(c => rows<{
            base_url: string;
            integration_id: number | null;
        }>(c, 'SELECT base_url,integration_id FROM sites WHERE id=?', [id]));
        if (!site)
            throw Error('Web není dostupný');
        if (!await consumeAttempt(subject))
            throw new RegistrationError('rate_limited');
        const verified = await (deps.verify ?? verifyRegistration)(site.base_url, key, allowed());
        if (site.integration_id !== null && Number(site.integration_id) === verified.integrationId)
            throw new RegistrationError('same_key');
        await transaction(async (c) => {
            await c.execute('UPDATE sites SET key_cipher=?,integration_id=? WHERE id=?', [vault().encrypt(key, `site:${id}`), verified.integrationId, id]);
            await c.execute('INSERT INTO audit(user_id,site_id,event) VALUES (?,?,?)', [s.user.id, id, 'site.key_rotated']);
        });
        await clearAttempts(subject);
        return { previousIntegrationId: site.integration_id === null ? null : Number(site.integration_id), integrationId: verified.integrationId };
    }
    catch (e) {
        return failed(s.user.id, id, e);
    }
}
/** Account picker for grants: id stays internal, people choose by e-mail. */
export async function listAccounts(s: Session) {
    requireGlobal(s);
    return transaction(c => rows<{
        id: number;
        email: string;
        global_admin: number;
    }>(c, 'SELECT id,email,global_admin FROM users WHERE disabled=FALSE ORDER BY email'));
}
export async function grantSite(s: Session, userId: number, siteId: number, role: 'editor' | 'siteadmin') {
    requireGlobal(s);
    if (!['editor', 'siteadmin'].includes(role))
        throw Error('Neplatná role');
    await transaction(async (c) => {
        await c.execute('INSERT INTO grants(user_id,site_id,role) VALUES (?,?,?) ON DUPLICATE KEY UPDATE role=VALUES(role)', [userId, siteId, role]);
        await c.execute('DELETE FROM sessions WHERE user_id=?', [userId]);
        await c.execute('INSERT INTO audit(user_id,site_id,event) VALUES (?,?,?)', [s.user.id, siteId, 'grant.changed']);
    });
}
export async function inspectSite(s: Session, id: number) {
    const site = await transaction(async (c) => {
        await requireSite(c, s, id, 'manage');
        const [site] = await rows<{
            base_url: string;
            key_cipher: string;
        }>(c, 'SELECT base_url,key_cipher FROM sites WHERE id=?', [id]);
        if (!site)
            throw Error('Web není dostupný');
        return site;
    });
    const key = vault().decrypt(site.key_cipher, `site:${id}`);
    const capabilities = projectCapabilities(await remoteGet(site.base_url, 'capabilities', key, allowed()));
    const identity = await remoteGet(site.base_url, 'identity', key, allowed()) as {
        success?: boolean;
        data?: {
            scopes?: unknown;
        };
    };
    if (identity?.success !== true || !Array.isArray(identity.data?.scopes) || !identity.data.scopes.includes('discovery:read'))
        throw Error('Integrační klíč nemá discovery:read');
    await transaction(c => c.execute('INSERT INTO audit(user_id,site_id,event) VALUES (?,?,?)', [s.user.id, id, 'site.discovered']));
    return { ...capabilities, authenticated: true };
}
