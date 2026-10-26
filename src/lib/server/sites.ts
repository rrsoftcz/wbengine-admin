import { transaction, rows } from './db.ts';
import { requireGlobal, requireSite, vault, type Session } from './auth.ts';
import { remoteGet, resolveTarget } from './remote.ts';
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
export async function registerSite(s: Session, name: string, base: string, key: string) {
    requireGlobal(s);
    return provisionSite(name, base, key, s.user.id);
}
export async function provisionSite(name: string, base: string, key: string, actor: number | null = null) {
    if (!name.trim() || name.length > 160 || !/^wbv2_[A-Za-z0-9_-]{20,200}$/.test(key))
        throw Error('Neplatná konfigurace webu');
    const target = await resolveTarget(base, allowed());
    await transaction(async (c) => {
        const [r] = await c.execute('INSERT INTO sites(name,base_url,key_cipher) VALUES (?,?,?)', [name.trim(), target.url.href, '']);
        const id = (r as {
            insertId: number;
        }).insertId;
        await c.execute('UPDATE sites SET key_cipher=? WHERE id=?', [vault().encrypt(key, `site:${id}`), id]);
        await c.execute('INSERT INTO audit(user_id,site_id,event) VALUES (?,?,?)', [actor, id, 'site.registered']);
    });
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
export function projectCapabilities(raw: unknown) {
    const body = raw as {
        success?: boolean;
        data?: {
            api_version?: unknown;
            capabilities?: Record<string, {
                read?: unknown;
                write?: unknown;
            }>;
        };
    };
    if (body?.success !== true || body.data?.api_version !== '2.0' || !body.data.capabilities)
        throw Error('Neplatný discovery kontrakt');
    const names = ['discovery', 'articles', 'pages', 'menu', 'sections', 'boxes', 'translations', 'images', 'templates', 'preview', 'publish'];
    return { version: '2.0', resources: names.map(name => ({ name, read: body.data!.capabilities![name]?.read === true, write: body.data!.capabilities![name]?.write === true })) };
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
