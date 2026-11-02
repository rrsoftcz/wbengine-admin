import { transaction, rows, type Connection } from './db.ts';
import { invite, issueRecovery, normalizeEmail, recordAudit, requireGlobal, type Session } from './auth.ts';
import { mailConfig, sendInvitationMail, type MailConfig, type MailResult, type TransportFactory } from './mail.ts';
import type { Translate } from '../i18n/index.ts';
/** Rows per page of the user list. */
export const PAGE_SIZE_USERS = 25;

/** A rejected user-management action; `code` selects the translated message `users.error.<code>`. */
export class UserError extends Error {
    code: string;
    constructor(code: string) {
        super(code);
        this.code = code;
    }
}

async function audit(c: Connection, actor: number, event: string, siteId: number | null = null) {
    await c.execute('INSERT INTO audit (user_id,event,site_id) VALUES (?,?,?)', [actor, event, siteId]);
}

/** Counts the enabled global administrators, locking them so two concurrent changes cannot remove the last one. */
async function lockedAdminCount(c: Connection) {
    const admins = await rows<{ id: number }>(c, 'SELECT id FROM users WHERE global_admin=TRUE AND disabled=FALSE FOR UPDATE');
    return admins.length;
}

async function target(c: Connection, id: number) {
    const [u] = await rows<{ id: number; email: string; global_admin: number; disabled: number; mfa_enabled: number }>(c, 'SELECT id,email,global_admin,disabled,mfa_enabled FROM users WHERE id=? FOR UPDATE', [id]);
    if (!u)
        throw new UserError('notFound');
    return u;
}

export interface UserRow {
    id: number;
    email: string;
    globalAdmin: boolean;
    mfaEnabled: boolean;
    disabled: boolean;
    createdAt: string;
    lastSignIn: string | null;
    sites: number;
}

export async function listUsers(s: Session, page: number, search: string | null) {
    requireGlobal(s);
    const where = search ? "WHERE u.email LIKE ? ESCAPE '\\\\'" : '';
    const args = search ? [`%${search.replace(/[\\%_]/g, '\\$&')}%`] : [];
    const offset = (Math.max(1, Math.floor(page)) - 1) * PAGE_SIZE_USERS;
    return transaction(async (c) => {
        const [count] = await rows<{ n: number }>(c, `SELECT COUNT(*) AS n FROM users u ${where}`, args);
        const total = Number(count?.n ?? 0);
        const list = await rows<{ id: number; email: string; global_admin: number; mfa_enabled: number; disabled: number; created_at: string; last_in: string | null; sites: number }>(c,
            `SELECT u.id,u.email,u.global_admin,u.mfa_enabled,u.disabled,u.created_at,
                    (SELECT MAX(a.created_at) FROM audit a WHERE a.user_id=u.id AND a.event='login.mfa') AS last_in,
                    (SELECT COUNT(*) FROM grants g WHERE g.user_id=u.id) AS sites
             FROM users u ${where} ORDER BY u.email LIMIT ${PAGE_SIZE_USERS} OFFSET ${Number(offset)}`, args);
        const users: UserRow[] = list.map(u => ({ id: Number(u.id), email: u.email, globalAdmin: !!u.global_admin, mfaEnabled: !!u.mfa_enabled, disabled: !!u.disabled, createdAt: u.created_at, lastSignIn: u.last_in, sites: Number(u.sites) }));
        return { users, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE_USERS)) };
    });
}

export async function userDetail(s: Session, id: number) {
    requireGlobal(s);
    return transaction(async (c) => {
        const [u] = await rows<{ id: number; email: string; global_admin: number; mfa_enabled: number; disabled: number; created_at: string; password_changed_at: string | null }>(c, 'SELECT id,email,global_admin,mfa_enabled,disabled,created_at,password_changed_at FROM users WHERE id=?', [id]);
        if (!u)
            throw new UserError('notFound');
        const grants = await rows<{ site_id: number; site: string; role: string }>(c, 'SELECT g.site_id,s.name AS site,g.role FROM grants g JOIN sites s ON s.id=g.site_id WHERE g.user_id=? ORDER BY s.name', [id]);
        const [last] = await rows<{ at: string | null }>(c, "SELECT MAX(created_at) AS at FROM audit WHERE user_id=? AND event='login.mfa'", [id]);
        const [codes] = await rows<{ n: number }>(c, 'SELECT COUNT(*) AS n FROM backup_codes WHERE user_id=?', [id]);
        return { id: Number(u.id), email: u.email, globalAdmin: !!u.global_admin, mfaEnabled: !!u.mfa_enabled, disabled: !!u.disabled, createdAt: u.created_at, passwordChangedAt: u.password_changed_at, lastSignIn: last?.at ?? null, backupCodesLeft: Number(codes?.n ?? 0), grants: grants.map(g => ({ siteId: Number(g.site_id), site: g.site, role: g.role })) };
    });
}

/** Issues an invitation; the one-time token is returned once. */
export async function inviteUser(s: Session, email: string, globalAdmin: boolean, siteId: number | null, role: 'editor' | 'siteadmin' | null) {
    requireGlobal(s);
    const address = normalizeEmail(email);
    const exists = await transaction(c => rows(c, 'SELECT id FROM users WHERE email=?', [address]));
    if (exists.length)
        throw new UserError('exists');
    if (siteId !== null) {
        const found = await transaction(c => rows(c, 'SELECT id FROM sites WHERE id=?', [siteId]));
        if (!found.length)
            throw new UserError('noSite');
    }
    return { email: address, token: await invite(address, globalAdmin, siteId, role, s.user.id) };
}

/** Mails the invitation when the feature is configured; the invitation exists either way and the caller keeps showing the code. */
export async function mailInvitation(s: Session, invited: { email: string; token: string }, siteId: number | null, origin: string, t: Translate, config: MailConfig | null = mailConfig(), factory?: TransportFactory): Promise<MailResult | null> {
    requireGlobal(s);
    if (!config)
        return null;
    const result = await sendInvitationMail(config, invited.email, origin, invited.token, t, factory);
    await recordAudit(s.user.id, result.ok ? 'invite.mailed' : 'invite.mail_failed', siteId);
    return result;
}

/** One-time password reset token for another account. */
export async function issueRecoveryFor(s: Session, id: number) {
    requireGlobal(s);
    const email = await transaction(async (c) => {
        const u = await target(c, id);
        if (u.disabled)
            throw new UserError('disabled');
        return u.email;
    });
    const token = await issueRecovery(email);
    await transaction(c => audit(c, s.user.id, `user.recovery:${id}`));
    return { email, token };
}

export async function setDisabled(s: Session, id: number, disabled: boolean) {
    requireGlobal(s);
    if (id === s.user.id)
        throw new UserError('self');
    await transaction(async (c) => {
        const admins = await lockedAdminCount(c);
        const u = await target(c, id);
        if (disabled && u.global_admin && !u.disabled && admins <= 1)
            throw new UserError('lastAdmin');
        await c.execute('UPDATE users SET disabled=? WHERE id=?', [disabled, id]);
        if (disabled)
            await c.execute('DELETE FROM sessions WHERE user_id=?', [id]);
        await audit(c, s.user.id, `${disabled ? 'user.disabled' : 'user.enabled'}:${id}`);
    });
}

export async function setGlobalAdmin(s: Session, id: number, value: boolean) {
    requireGlobal(s);
    if (id === s.user.id)
        throw new UserError('self');
    await transaction(async (c) => {
        const admins = await lockedAdminCount(c);
        const u = await target(c, id);
        if (!value && u.global_admin && !u.disabled && admins <= 1)
            throw new UserError('lastAdmin');
        await c.execute('UPDATE users SET global_admin=? WHERE id=?', [value, id]);
        await c.execute('DELETE FROM sessions WHERE user_id=?', [id]);
        await audit(c, s.user.id, `${value ? 'user.promoted' : 'user.demoted'}:${id}`);
    });
}

export async function revokeGrant(s: Session, id: number, siteId: number) {
    requireGlobal(s);
    await transaction(async (c) => {
        await target(c, id);
        const [result] = await c.execute('DELETE FROM grants WHERE user_id=? AND site_id=?', [id, siteId]);
        if (!(result as { affectedRows: number }).affectedRows)
            throw new UserError('noGrant');
        await c.execute('DELETE FROM sessions WHERE user_id=?', [id]);
        await audit(c, s.user.id, `grant.revoked:${id}`, siteId);
    });
}

/** Removes another account's authenticator; it enrols a new one at the next sign-in. */
export async function resetUserMfa(s: Session, id: number) {
    requireGlobal(s);
    if (id === s.user.id)
        throw new UserError('self');
    await transaction(async (c) => {
        await target(c, id);
        await c.execute('UPDATE users SET mfa_secret=NULL,mfa_enabled=FALSE,mfa_counter=-1 WHERE id=?', [id]);
        await c.execute('DELETE FROM backup_codes WHERE user_id=?', [id]);
        await c.execute('DELETE FROM sessions WHERE user_id=?', [id]);
        await audit(c, s.user.id, `user.mfa_reset:${id}`);
    });
}

export async function siteChoices(s: Session) {
    requireGlobal(s);
    const list = await transaction(c => rows<{ id: number; name: string }>(c, 'SELECT id,name FROM sites ORDER BY name'));
    return list.map(x => ({ id: Number(x.id), name: x.name }));
}
