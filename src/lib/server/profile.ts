import { transaction, rows, NOW, minutesAgo, type Connection } from './db.ts';
import { token, tokenHash, hashPassword, verifyPassword } from './security.ts';
import { isLocale } from '../i18n/index.ts';
import type { Session } from './auth.ts';
import { activityCategories, type ActivityCategory } from '../activity.ts';

/** A rejected profile action; `code` selects the translated message `profile.error.<code>`. */
export class ProfileError extends Error {
    code: string;
    constructor(code: string) {
        super(code);
        this.code = code;
    }
}

const attemptWindowMinutes = 15, attemptLimit = 8;

async function audit(c: Connection, userId: number, event: string) {
    await c.execute('INSERT INTO audit (user_id,event,site_id) VALUES (?,?,NULL)', [userId, event]);
}

/** Locks the account and verifies the current password, with a failure counter per account. */
async function confirmPassword(c: Connection, userId: number, password: string) {
    const subject = tokenHash(`pw:${userId}`);
    await c.execute(`INSERT OR IGNORE INTO login_attempts(subject_hash,window_start) VALUES (?,${NOW})`, [subject]);
    const [rate] = await rows<{ failures: number; old: number }>(c, `SELECT failures,(window_start<${minutesAgo(attemptWindowMinutes)}) AS old FROM login_attempts WHERE subject_hash=?`, [subject]);
    if (rate.old)
        await c.execute(`UPDATE login_attempts SET failures=0,window_start=${NOW} WHERE subject_hash=?`, [subject]);
    else if (rate.failures >= attemptLimit)
        throw new ProfileError('restricted');
    const [u] = await rows<{ id: number; password_hash: string; mfa_enabled: number }>(c, 'SELECT id,password_hash,mfa_enabled FROM users WHERE id=? AND disabled=FALSE', [userId]);
    if (!u)
        throw new ProfileError('unavailable');
    if (!await verifyPassword(password, u.password_hash)) {
        await c.execute('UPDATE login_attempts SET failures=failures+1 WHERE subject_hash=?', [subject]);
        // The failure must survive the rollback caused by the thrown error.
        await c.commit();
        throw new ProfileError('wrongPassword');
    }
    await c.execute('DELETE FROM login_attempts WHERE subject_hash=?', [subject]);
    return u;
}

/** Changes the password after confirming the current one and ends every other session of the account. */
export async function changePassword(s: Session, current: string, next: string) {
    if (next.length < 14 || next.length > 256)
        throw new ProfileError('weakPassword');
    if (next === current)
        throw new ProfileError('samePassword');
    const hash = await hashPassword(next);
    await transaction(async (c) => {
        await confirmPassword(c, s.user.id, current);
        await c.execute(`UPDATE users SET password_hash=?,password_changed_at=${NOW} WHERE id=?`, [hash, s.user.id]);
        await c.execute('DELETE FROM sessions WHERE user_id=? AND token_hash<>?', [s.user.id, s.hash]);
        await audit(c, s.user.id, 'password.changed');
    });
}

/** Replaces the backup codes; the new codes are returned once. */
export async function regenerateBackupCodes(s: Session, password: string) {
    return transaction(async (c) => {
        const u = await confirmPassword(c, s.user.id, password);
        if (!u.mfa_enabled)
            throw new ProfileError('mfaOff');
        await c.execute('DELETE FROM backup_codes WHERE user_id=?', [s.user.id]);
        const codes: string[] = [];
        for (let i = 0; i < 10; i++) {
            const code = token().slice(0, 16);
            codes.push(code);
            await c.execute('INSERT INTO backup_codes(user_id,code_hash) VALUES (?,?)', [s.user.id, tokenHash(code)]);
        }
        await audit(c, s.user.id, 'mfa.codes.regenerated');
        return codes;
    });
}

/** Removes the authenticator so the next sign-in enrols a new one. Ends all sessions of the account. */
export async function resetMfa(s: Session, password: string) {
    await transaction(async (c) => {
        await confirmPassword(c, s.user.id, password);
        await c.execute('UPDATE users SET mfa_secret=NULL,mfa_enabled=FALSE,mfa_counter=-1 WHERE id=?', [s.user.id]);
        await c.execute('DELETE FROM backup_codes WHERE user_id=?', [s.user.id]);
        await c.execute('DELETE FROM sessions WHERE user_id=?', [s.user.id]);
        await audit(c, s.user.id, 'mfa.reset');
    });
}

/** Stores the interface language; null means "follow the cookie or the browser". */
export async function setLocale(userId: number, locale: string | null) {
    if (locale !== null && !isLocale(locale))
        throw new ProfileError('invalidLocale');
    await transaction(async (c) => {
        await c.execute('UPDATE users SET locale=? WHERE id=?', [locale, userId]);
        await audit(c, userId, 'profile.locale');
    });
}

export interface ProfileInfo {
    email: string;
    globalAdmin: boolean;
    mfaEnabled: boolean;
    backupCodesLeft: number;
    createdAt: string;
    passwordChangedAt: string | null;
    grants: { site: string; role: string }[];
}

export async function profileInfo(userId: number): Promise<ProfileInfo> {
    return transaction(async (c) => {
        const [u] = await rows<{ email: string; global_admin: number; mfa_enabled: number; created_at: string; password_changed_at: string | null }>(c, 'SELECT email,global_admin,mfa_enabled,created_at,password_changed_at FROM users WHERE id=?', [userId]);
        if (!u)
            throw new ProfileError('unavailable');
        const [codes] = await rows<{ n: number }>(c, 'SELECT COUNT(*) AS n FROM backup_codes WHERE user_id=?', [userId]);
        const grants = await rows<{ site: string; role: string }>(c, 'SELECT s.name AS site,g.role FROM grants g JOIN sites s ON s.id=g.site_id WHERE g.user_id=? ORDER BY s.name', [userId]);
        return { email: u.email, globalAdmin: !!u.global_admin, mfaEnabled: !!u.mfa_enabled, backupCodesLeft: Number(codes?.n ?? 0), createdAt: u.created_at, passwordChangedAt: u.password_changed_at, grants };
    });
}

const categoryFilter: Record<ActivityCategory, string> = {
    signin: "event IN ('login.password','login.mfa','logout')",
    account: "(event LIKE 'password.%' OR event LIKE 'mfa.%' OR event LIKE 'user.%' OR event='recovery.issued' OR event='profile.locale')",
    sites: "(event LIKE 'site.%' OR event LIKE 'grant.%' OR event LIKE 'invite.%')"
};
export const activityPageSize = 20;

export interface ActivityEntry {
    event: string;
    at: string;
    site: string | null;
}

/** One page of the account's own audit trail, newest first, optionally limited to a category. */
export async function accountActivity(userId: number, category: ActivityCategory | null, page: number, perPage = activityPageSize) {
    const where = 'a.user_id=?' + (category ? ' AND ' + categoryFilter[category].replaceAll('event', 'a.event') : '');
    const offset = (Math.max(1, Math.floor(page)) - 1) * perPage;
    return transaction(async (c) => {
        const [count] = await rows<{ n: number }>(c, `SELECT COUNT(*) AS n FROM audit a WHERE ${where}`, [userId]);
        const total = Number(count?.n ?? 0);
        // LIMIT and OFFSET are validated integers, not user text.
        const items = await rows<ActivityEntry>(c, `SELECT a.event,a.created_at AS at,s.name AS site FROM audit a LEFT JOIN sites s ON s.id=a.site_id WHERE ${where} ORDER BY a.id DESC LIMIT ${Number(perPage)} OFFSET ${Number(offset)}`, [userId]);
        return { items, total, totalPages: Math.max(1, Math.ceil(total / perPage)) };
    });
}
