import { timingSafeEqual } from 'node:crypto';
import { transaction, read, rows, NOW, minutesAgo, type Connection } from './db.ts';
import { SecretVault, token, tokenHash, hashPassword, verifyPassword, newTotpSecret, verifyTotp, permitted } from './security.ts';
export interface User {
    id: number;
    email: string;
    global_admin: number;
    mfa_secret: string | null;
    mfa_enabled: number;
    mfa_counter: number;
    password_hash: string;
    disabled: number;
    locale: string | null;
}
export interface Session {
    user: ReturnType<typeof safeUser>;
    csrf: string;
    mfaVerified: boolean;
    hash: string;
}
export function safeUser(u: User) {
    return { id: u.id, email: u.email, globalAdmin: !!u.global_admin, mfaEnabled: !!u.mfa_enabled, locale: u.locale ?? null };
}
export function normalizeEmail(s: string) {
    const email = s.trim().toLowerCase();
    if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(email) || email.length > 254)
        throw Error('Invalid e-mail');
    return email;
}
export function vault() {
    const raw = process.env.MASTER_KEY;
    if (!raw || !/^[0-9a-f]{64}$/i.test(raw))
        throw Error('Missing valid MASTER_KEY');
    return new SecretVault(Buffer.from(raw, 'hex'));
}
export function checkCsrf(request: Request, origin: string, expected: string, submitted: string) {
    const a = Buffer.from(expected), b = Buffer.from(submitted);
    if (request.headers.get('origin') !== origin || !expected || a.length !== b.length || !timingSafeEqual(a, b))
        throw Error('Invalid CSRF token');
}
async function audit(c: Connection, userId: number | null, event: string, siteId: number | null = null) {
    await c.execute('INSERT INTO audit (user_id,event,site_id) VALUES (?,?,?)', [userId, event, siteId]);
}
/** Records one audit event outside of another transaction (used after an invitation mail). */
export function recordAudit(userId: number | null, event: string, siteId: number | null = null) {
    return transaction((c) => audit(c, userId, event, siteId));
}
async function newSession(c: Connection, userId: number) {
    const raw = token(), csrf = tokenHash(token());
    await c.execute('INSERT INTO sessions (token_hash,user_id,csrf,expires_at) VALUES (?,?,?,?)', [tokenHash(raw), userId, csrf, new Date(Date.now() + 8 * 3600000)]);
    return raw;
}
async function lockedUser(c: Connection, id: number) {
    const [u] = await rows<User>(c, 'SELECT * FROM users WHERE id=? AND disabled=FALSE', [id]);
    if (!u)
        throw Error('Account is not available');
    return u;
}
export async function loadSession(raw: string | undefined): Promise<Session | null> {
    if (!raw || raw.length > 128)
        return null;
    return read(async (c) => {
        const [r] = await rows<User & {
            csrf: string;
            mfa_verified: number;
        }>(c, `SELECT u.*,s.csrf,s.mfa_verified FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>${NOW} AND u.disabled=FALSE`, [tokenHash(raw)]);
        return r ? { user: safeUser(r), csrf: r.csrf, mfaVerified: !!r.mfa_verified, hash: tokenHash(raw) } : null;
    });
}
export async function login(email: string, password: string) {
    const subject = tokenHash(normalizeEmail(email));
    return transaction(async (c) => {
        await c.execute(`INSERT OR IGNORE INTO login_attempts(subject_hash,window_start) VALUES (?,${NOW})`, [subject]);
        const [rate] = await rows<{
            failures: number;
            window_start: string;
        }>(c, 'SELECT * FROM login_attempts WHERE subject_hash=?', [subject]);
        if (new Date(rate.window_start + 'Z').getTime() < Date.now() - 900000) {
            rate.failures = 0;
            await c.execute(`UPDATE login_attempts SET failures=0,window_start=${NOW} WHERE subject_hash=?`, [subject]);
        }
        if (rate.failures >= 8)
            return null;
        // Lock the current account state through password verification and session creation.
        // Recovery/deactivation must serialize with this operation.
        const [u] = await rows<User>(c, 'SELECT * FROM users WHERE email=? AND disabled=FALSE', [normalizeEmail(email)]);
        const valid = await verifyPassword(password, u?.password_hash ?? 'scrypt:00000000000000000000000000000000:' + '00'.repeat(64));
        if (!u || !valid) {
            await c.execute('UPDATE login_attempts SET failures=failures+1 WHERE subject_hash=?', [subject]);
            return null;
        }
        await c.execute('DELETE FROM login_attempts WHERE subject_hash=?', [subject]);
        await audit(c, u.id, 'login.password');
        return newSession(c, u.id);
    });
}
export async function logout(s: Session) {
    await transaction(async (c) => {
        await c.execute('DELETE FROM sessions WHERE token_hash=?', [s.hash]);
        await audit(c, s.user.id, 'logout');
    });
}
export async function setupMfa(s: Session) {
    return transaction(async (c) => {
        const u = await lockedUser(c, s.user.id);
        if (u.mfa_enabled)
            throw Error('MFA is active');
        if (u.mfa_secret)
            return vault().decrypt(u.mfa_secret, `mfa:${u.id}`);
        const secret = newTotpSecret();
        await c.execute('UPDATE users SET mfa_secret=? WHERE id=?', [vault().encrypt(secret, `mfa:${u.id}`), u.id]);
        return secret;
    });
}
export async function completeMfa(s: Session, code: string) {
    if (!await consumeMfaAttempt(s.user.id))
        throw Error('MFA is temporarily restricted');
    return transaction(async (c) => {
        const [active] = await rows(c, `SELECT token_hash FROM sessions WHERE token_hash=? AND user_id=? AND expires_at>${NOW}`, [s.hash, s.user.id]);
        if (!active)
            throw Error('Session expired');
        const u = await lockedUser(c, s.user.id);
        if (!u.mfa_secret)
            throw Error('MFA is not ready');
        const counter = verifyTotp(vault().decrypt(u.mfa_secret, `mfa:${u.id}`), code, Date.now(), Number(u.mfa_counter));
        let valid = counter !== null;
        if (!valid && u.mfa_enabled) {
            const [result] = await c.execute('DELETE FROM backup_codes WHERE user_id=? AND code_hash=?', [u.id, tokenHash(code)]);
            valid = (result as {
                affectedRows: number;
            }).affectedRows === 1;
        }
        if (!valid)
            throw Error('Invalid or already used MFA code');
        const codes: string[] = [];
        if (!u.mfa_enabled) {
            for (let i = 0; i < 10; i++) {
                const code = token().slice(0, 16);
                codes.push(code);
                await c.execute('INSERT INTO backup_codes(user_id,code_hash) VALUES (?,?)', [u.id, tokenHash(code)]);
            }
        }
        await c.execute('UPDATE users SET mfa_enabled=TRUE,mfa_counter=? WHERE id=?', [counter ?? u.mfa_counter, u.id]);
        const sessionToken = await newSession(c, u.id);
        await c.execute('UPDATE sessions SET mfa_verified=TRUE WHERE token_hash=?', [tokenHash(sessionToken)]);
        await c.execute('DELETE FROM sessions WHERE token_hash=?', [s.hash]);
        await audit(c, u.id, 'login.mfa');
        return { codes, sessionToken };
    });
}
export function requireAuthenticated(s: Session | null): Session {
    if (!s || !s.mfaVerified || !s.user.mfaEnabled)
        throw Error('Sign-in with MFA is required');
    return s;
}
export function requireGlobal(s: Session | null) {
    const valid = requireAuthenticated(s);
    if (!valid.user.globalAdmin)
        throw Error('Missing global permission');
    return valid;
}
export async function requireSite(c: Connection, s: Session, site: number, level: 'read' | 'manage') {
    requireAuthenticated(s);
    const [g] = await rows<{
        role: string;
    }>(c, 'SELECT role FROM grants WHERE user_id=? AND site_id=?', [s.user.id, site]);
    if (!permitted(s.user.globalAdmin, g?.role ?? null, level))
        throw Error('Missing site permission');
}
export async function invite(email: string, globalAdmin: boolean, siteId: number | null = null, role: 'editor' | 'siteadmin' | null = null, actorId: number | null = null) {
    email = normalizeEmail(email);
    if (siteId === null && role !== null || siteId !== null && role === null)
        throw Error('Invalid invitation permission');
    const raw = token();
    await transaction(async (c) => {
        await c.execute('INSERT INTO invitations (token_hash,email,global_admin,site_id,role,expires_at) VALUES (?,?,?,?,?,?)', [tokenHash(raw), email, globalAdmin, siteId, role, new Date(Date.now() + 48 * 3600000)]);
        await audit(c, actorId, 'invite.created', siteId);
    });
    return raw;
}
/** Why accepting an invitation failed in a way the person can fix: the password policy or the code. */
export class AcceptError extends Error {
    code: 'password' | 'invitation';
    constructor(code: 'password' | 'invitation') {
        super(code === 'password' ? 'Password must be 14 to 256 characters' : 'Invitation is not valid');
        this.code = code;
    }
}
export async function acceptInvitation(raw: string, password: string) {
    // A code copied from an email often carries spaces or line breaks around it; the code itself never contains any.
    raw = raw.replace(/\s+/g, '');
    if (password.length < 14 || password.length > 256)
        throw new AcceptError('password');
    const hash = await hashPassword(password);
    return transaction(async (c) => {
        const [i] = await rows<{
            email: string;
            global_admin: number;
            site_id: number | null;
            role: string | null;
        }>(c, `SELECT * FROM invitations WHERE token_hash=? AND used_at IS NULL AND expires_at>${NOW}`, [tokenHash(raw)]);
        if (!i)
            throw new AcceptError('invitation');
        const [r] = await c.execute('INSERT INTO users(email,password_hash,global_admin) VALUES (?,?,?)', [i.email, hash, i.global_admin]);
        const id = (r as {
            insertId: number;
        }).insertId;
        if (i.site_id)
            await c.execute('INSERT INTO grants(user_id,site_id,role) VALUES (?,?,?)', [id, i.site_id, i.role]);
        await c.execute(`UPDATE invitations SET used_at=${NOW} WHERE token_hash=?`, [tokenHash(raw)]);
        await audit(c, id, 'invite.accepted');
        return newSession(c, id);
    });
}
export async function issueRecovery(email: string) {
    return transaction(async (c) => {
        // Lock the current account state through password verification and session creation.
        // Recovery/deactivation must serialize with this operation.
        const [u] = await rows<User>(c, 'SELECT * FROM users WHERE email=? AND disabled=FALSE', [normalizeEmail(email)]);
        if (!u)
            throw Error('Account does not exist');
        const raw = token();
        await c.execute(`UPDATE recovery SET used_at=${NOW} WHERE user_id=? AND used_at IS NULL`, [u.id]);
        await c.execute('INSERT INTO recovery(token_hash,user_id,expires_at) VALUES (?,?,?)', [tokenHash(raw), u.id, new Date(Date.now() + 1800000)]);
        await audit(c, u.id, 'recovery.issued');
        return raw;
    });
}
export async function resetPassword(raw: string, password: string) {
    const hash = await hashPassword(password);
    await transaction(async (c) => {
        const [r] = await rows<{
            user_id: number;
        }>(c, `SELECT * FROM recovery WHERE token_hash=? AND used_at IS NULL AND expires_at>${NOW}`, [tokenHash(raw)]);
        if (!r)
            throw Error('Recovery link is not valid');
        await lockedUser(c, r.user_id);
        await c.execute('UPDATE users SET password_hash=? WHERE id=?', [hash, r.user_id]);
        await c.execute(`UPDATE recovery SET used_at=${NOW} WHERE user_id=? AND used_at IS NULL`, [r.user_id]);
        await c.execute('DELETE FROM sessions WHERE user_id=?', [r.user_id]);
        await audit(c, r.user_id, 'password.reset');
    });
}
async function consumeMfaAttempt(userId: number) {
    return transaction(async (c) => {
        const subject = tokenHash(`mfa:${userId}`);
        await c.execute(`INSERT OR IGNORE INTO login_attempts(subject_hash,window_start) VALUES (?,${NOW})`, [subject]);
        const [r] = await rows<{
            failures: number;
            old: number;
        }>(c, `SELECT failures,(window_start<${minutesAgo(15)}) AS old FROM login_attempts WHERE subject_hash=?`, [subject]);
        if (r.old) {
            await c.execute(`UPDATE login_attempts SET failures=1,window_start=${NOW} WHERE subject_hash=?`, [subject]);
            return true;
        }
        if (r.failures >= 12)
            return false;
        await c.execute('UPDATE login_attempts SET failures=failures+1 WHERE subject_hash=?', [subject]);
        return true;
    });
}
