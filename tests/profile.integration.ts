import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { database, transaction, rows } from '../src/lib/server/db.ts';
import { invite, acceptInvitation, loadSession, login, setupMfa, completeMfa } from '../src/lib/server/auth.ts';
import { migrate } from '../src/lib/server/migrate.ts';
import { totp } from '../src/lib/server/security.ts';
import { changePassword, regenerateBackupCodes, resetMfa, setLocale, profileInfo, accountActivity, ProfileError } from '../src/lib/server/profile.ts';
if (!process.env.DATABASE_PATH?.includes('wbengine-admin-test'))
    throw Error('The integration test requires the isolated temporary database');
await transaction(async (c) => { await migrate(c); });
after(async () => { await database().end(); });

const password = 'profile test password 1', code = (secret: string) => totp(secret, Math.floor(Date.now() / 30000));
async function enrolled(email: string) {
    let raw = await acceptInvitation(await invite(email, false), password);
    const session = (await loadSession(raw))!;
    const secret = await setupMfa(session);
    raw = (await completeMfa(session, code(secret))).sessionToken;
    return { raw, secret, session: (await loadSession(raw))! };
}
const rejectsWith = (promise: Promise<unknown>, expected: string) => assert.rejects(promise, (e) => e instanceof ProfileError && e.code === expected);

test('password change needs the current password, ends other sessions and is rate limited', async () => {
    const { session, raw } = await enrolled('pw@example.test');
    const other = (await login('pw@example.test', password))!;
    await rejectsWith(changePassword(session, 'wrong password value 12', 'brand new password 123'), 'wrongPassword');
    await rejectsWith(changePassword(session, password, 'short'), 'weakPassword');
    await rejectsWith(changePassword(session, password, password), 'samePassword');
    await changePassword(session, password, 'brand new password 123');
    assert.ok(await loadSession(raw), 'the current session survives');
    assert.equal(await loadSession(other), null, 'other sessions end');
    assert.equal(await login('pw@example.test', password), null);
    assert.ok(await login('pw@example.test', 'brand new password 123'));
    const info = await profileInfo(session.user.id);
    assert.ok(info.passwordChangedAt);
    for (let i = 0; i < 8; i++) await rejectsWith(changePassword(session, 'wrong password value 12', 'another new password 12'), i < 8 ? 'wrongPassword' : 'restricted').catch(() => undefined);
    await rejectsWith(changePassword(session, 'brand new password 123', 'another new password 12'), 'restricted');
});

test('backup codes are replaced only after the password is confirmed', async () => {
    const { session } = await enrolled('codes@example.test');
    await rejectsWith(regenerateBackupCodes(session, 'wrong password value 12'), 'wrongPassword');
    const before = (await profileInfo(session.user.id)).backupCodesLeft;
    assert.equal(before, 10);
    const fresh = await regenerateBackupCodes(session, password);
    assert.equal(fresh.length, 10);
    assert.equal((await profileInfo(session.user.id)).backupCodesLeft, 10);
});

test('MFA reset removes the authenticator, codes and every session', async () => {
    const { session, raw } = await enrolled('mfa@example.test');
    await rejectsWith(resetMfa(session, 'wrong password value 12'), 'wrongPassword');
    await resetMfa(session, password);
    assert.equal(await loadSession(raw), null);
    const [u] = await transaction((c) => rows<{ mfa_enabled: number; mfa_secret: string | null }>(c, 'SELECT mfa_enabled,mfa_secret FROM users WHERE id=?', [session.user.id]));
    assert.equal(u.mfa_enabled, 0);
    assert.equal(u.mfa_secret, null);
    const again = (await loadSession((await login('mfa@example.test', password))!))!;
    assert.equal(again.user.mfaEnabled, false, 'the next sign-in enrols a new authenticator');
});

test('interface language is stored per user and validated', async () => {
    const { session } = await enrolled('lang@example.test');
    await setLocale(session.user.id, 'de');
    assert.equal((await loadSession((await login('lang@example.test', password))!))!.user.locale, 'de');
    await setLocale(session.user.id, null);
    assert.equal((await loadSession((await login('lang@example.test', password))!))!.user.locale, null);
    await rejectsWith(setLocale(session.user.id, 'fr'), 'invalidLocale');
});

test('account activity pages newest first, filters by category and stays bounded', async () => {
    const { session } = await enrolled('activity@example.test');
    const id = session.user.id;
    await transaction(async (c) => {
        for (let i = 0; i < 45; i++)
            await c.execute('INSERT INTO audit(user_id,event) VALUES (?,?)', [id, i % 3 === 0 ? 'logout' : i % 3 === 1 ? 'password.changed' : 'site.registered']);
    });
    const all = await accountActivity(id, null, 1, 20);
    assert.equal(all.items.length, 20);
    assert.ok(all.total >= 45);
    assert.equal(all.totalPages, Math.ceil(all.total / 20));
    const last = await accountActivity(id, null, all.totalPages, 20);
    assert.ok(last.items.length >= 1 && last.items.length <= 20);
    const ids = new Set([...all.items, ...(await accountActivity(id, null, 2, 20)).items].map((x) => x.at + x.event));
    assert.ok(ids.size >= 2);
    const sites = await accountActivity(id, 'sites', 1, 20);
    // 15 inserted site events plus the invitation the account was created from.
    assert.equal(sites.total, 16);
    assert.ok(sites.items.every((x) => x.event === 'site.registered' || x.event === 'invite.accepted'));
    const account = await accountActivity(id, 'account', 1, 100);
    assert.ok(account.items.every((x) => /^(password|mfa)\./.test(x.event) || x.event === 'profile.locale' || x.event === 'recovery.issued'));
    assert.equal((await accountActivity(id, null, 9999, 20)).items.length, 0);
});
