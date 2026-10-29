import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { database, transaction, rows } from '../src/lib/server/db.ts';
import { invite, acceptInvitation, loadSession, login, setupMfa, completeMfa, issueRecovery, resetPassword, requireSite, logout } from '../src/lib/server/auth.ts';
import { migrate } from '../src/lib/server/migrate.ts';
import { totp, tokenHash } from '../src/lib/server/security.ts';
import { registerSite, listSites, grantSite, replaceSiteKey } from '../src/lib/server/sites.ts';
import { RegistrationError, type VerifiedSite } from '../src/lib/server/registration-contract.ts';
import { validateBaseUrl } from '../src/lib/server/remote.ts';
if (!process.env.DATABASE_URL?.includes('wbengine_admin_test'))
    throw Error('The integration test requires the isolated wbengine_admin_test DB');
await transaction(async (c) => {
    await migrate(c);
    for (const table of ['audit', 'backup_codes', 'recovery', 'sessions', 'invitations', 'grants', 'sites', 'login_attempts', 'users'])
        await c.query('DELETE FROM ' + table);
});
const verified = (integrationId: number): VerifiedSite => ({ integrationId, scopes: [], version: '2.0', resources: [], extras: [] });
const stubs = (integrationId = 7, calls: string[] = []) => ({
    resolve: async (raw: string) => ({ url: validateBaseUrl(raw), hostname: 'example.test', address: '93.184.216.34', family: 4 }),
    verify: async (_base: string, key: string) => {
        calls.push(key);
        return verified(integrationId);
    }
});
after(async () => {
    await database().end();
});
test('persistent account lifecycle, MFA replay/backup, recovery, permissions and secret storage', async () => {
    const invitation = await invite('admin@example.test', true);
    let sessionRaw = await acceptInvitation(invitation, 'a very long password 123');
    await assert.rejects(acceptInvitation(invitation, 'another long password 12'));
    let session = (await loadSession(sessionRaw))!;
    assert.equal(session.mfaVerified, false);
    const secret = await setupMfa(session);
    const enrollment = await completeMfa(session, totp(secret, Math.floor(Date.now() / 30000)));
    const codes = enrollment.codes;
    assert.equal(await loadSession(sessionRaw), null);
    sessionRaw = enrollment.sessionToken;
    assert.equal(codes.length, 10);
    await assert.rejects(completeMfa(session, totp(secret, Math.floor(Date.now() / 30000))));
    session = (await loadSession(sessionRaw))!;
    assert.equal(session.mfaVerified, true);
    const loginRaw = await login('admin@example.test', 'a very long password 123');
    assert.ok(loginRaw);
    let second = (await loadSession(loginRaw!))!;
    const backup = await completeMfa(second, codes[0]);
    assert.ok(await loadSession(backup.sessionToken));
    const replaySession = (await loadSession((await login('admin@example.test', 'a very long password 123'))!))!;
    await assert.rejects(completeMfa(replaySession, codes[0]));
    await assert.rejects(completeMfa(replaySession, totp(secret, Math.floor(Date.now() / 30000))));
    await registerSite(session, 'Public site', 'https://example.com', 'wbv2_' + 'a'.repeat(40), stubs());
    const sites = await listSites(session), site = Number(sites[0].id);
    const invitation2 = await invite('editor@example.test', false, site, 'editor');
    let raw2 = await acceptInvitation(invitation2, 'editor long password 123');
    let editor = (await loadSession(raw2))!;
    const secret2 = await setupMfa(editor);
    raw2 = (await completeMfa(editor, totp(secret2, Math.floor(Date.now() / 30000)))).sessionToken;
    editor = (await loadSession(raw2))!;
    await transaction(async (c) => {
        await requireSite(c, editor, site, 'read');
        await assert.rejects(requireSite(c, editor, site, 'manage'));
        await assert.rejects(requireSite(c, editor, site + 1000, 'read'));
    });
    const dumped = await transaction(c => rows(c, 'SELECT key_cipher FROM sites'));
    assert.ok(!JSON.stringify(dumped).includes('wbv2_'));
    const stored = await transaction(c => rows<{
        token_hash: string;
    }>(c, 'SELECT token_hash FROM sessions'));
    assert.ok(!JSON.stringify(stored).includes(sessionRaw));
    assert.equal(stored[0].token_hash.length, 64);
    const recovery = await issueRecovery('admin@example.test');
    await resetPassword(recovery, 'a different password 123');
    assert.equal(await loadSession(sessionRaw), null);
    await assert.rejects(resetPassword(recovery, 'another password 1234'));
    assert.equal(await login('admin@example.test', 'a very long password 123'), null);
    const recoveredRaw = await login('admin@example.test', 'a different password 123');
    assert.ok(recoveredRaw);
    const recovered = (await loadSession(recoveredRaw!))!;
    assert.equal(recovered.user.mfaEnabled, true);
    assert.equal(recovered.mfaVerified, false);
    await grantSite(session, editor.user.id, site, 'siteadmin');
    assert.equal(await loadSession(raw2), null);
    await logout(recovered);
    assert.equal(await loadSession(recoveredRaw!), null);
});
test('expired and concurrent one-use invitation; expired session and recovery reject', async () => {
    const expired = await invite('expired@example.test', false);
    await transaction(c => c.execute('UPDATE invitations SET expires_at=DATE_SUB(NOW(3),INTERVAL 1 SECOND) WHERE token_hash=?', [tokenHash(expired)]));
    await assert.rejects(acceptInvitation(expired, 'a valid long password 123'));
    const once = await invite('concurrent@example.test', false);
    const results = await Promise.allSettled([acceptInvitation(once, 'a valid long password 123'), acceptInvitation(once, 'a valid long password 123')]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    const raw = (results.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<string>).value;
    await transaction(c => c.execute('UPDATE sessions SET expires_at=DATE_SUB(NOW(3),INTERVAL 1 SECOND) WHERE token_hash=?', [tokenHash(raw)]));
    assert.equal(await loadSession(raw), null);
    const recovery = await issueRecovery('concurrent@example.test');
    await transaction(c => c.execute('UPDATE recovery SET expires_at=DATE_SUB(NOW(3),INTERVAL 1 SECOND) WHERE token_hash=?', [tokenHash(recovery)]));
    await assert.rejects(resetPassword(recovery, 'a valid long password 123'));
});
test('persisted password and MFA limits survive separate operations', async () => {
    const raw = await acceptInvitation(await invite('limited@example.test', false), 'limited account password 123');
    const s = (await loadSession(raw))!, secret = await setupMfa(s);
    for (let n = 0; n < 8; n++)
        assert.equal(await login('limited@example.test', 'wrong'), null);
    assert.equal(await login('limited@example.test', 'limited account password 123'), null);
    await transaction(c => c.execute('UPDATE login_attempts SET window_start=DATE_SUB(NOW(3),INTERVAL 16 MINUTE) WHERE subject_hash=?', [tokenHash('limited@example.test')]));
    assert.ok(await login('limited@example.test', 'limited account password 123'));
    const correct = totp(secret, Math.floor(Date.now() / 30000));
    const wrong = correct === '000000' ? '999999' : '000000';
    for (let n = 0; n < 12; n++)
        await assert.rejects(completeMfa(s, wrong));
    await assert.rejects(completeMfa(s, correct));
    await transaction(c => c.execute('UPDATE login_attempts SET window_start=DATE_SUB(NOW(3),INTERVAL 16 MINUTE) WHERE subject_hash=?', [tokenHash(`mfa:${s.user.id}`)]));
    const completed = await completeMfa(s, correct);
    assert.equal((await loadSession(completed.sessionToken))?.mfaVerified, true);
});
async function raceLoginAgainstAccountChange(disable: boolean) {
    const email = disable ? 'disable-race@example.test' : 'password-race@example.test';
    const oldPassword = 'old race password 1234', newPassword = 'new race password 5678';
    const raw = await acceptInvitation(await invite(email, false), oldPassword), user = (await loadSession(raw))!.user;
    const { hashPassword } = await import('../src/lib/server/security.ts');
    const changedHash = await hashPassword(newPassword);
    const locker = await database().getConnection(), observer = await database().getConnection();
    let pending: Promise<string | null> | undefined;
    try {
        await locker.beginTransaction();
        await locker.execute('SELECT id FROM users WHERE id=? FOR UPDATE', [user.id]);
        pending = login(email, oldPassword);
        let waiting = false;
        for (let n = 0; n < 100; n++) {
            const [locks] = await observer.query<import('mysql2').RowDataPacket[]>('SELECT COUNT(*) AS n FROM performance_schema.data_lock_waits w JOIN performance_schema.data_locks l ON l.ENGINE_LOCK_ID=w.REQUESTING_ENGINE_LOCK_ID WHERE l.OBJECT_SCHEMA=DATABASE() AND l.OBJECT_NAME="users"');
            if (Number(locks[0].n) > 0) {
                waiting = true;
                break;
            }
            await new Promise(r => setTimeout(r, 20));
        }
        assert.ok(waiting, 'login must wait on the locked account before the concurrent account change');
        if (disable)
            await locker.execute('UPDATE users SET disabled=TRUE WHERE id=?', [user.id]);
        else
            await locker.execute('UPDATE users SET password_hash=? WHERE id=?', [changedHash, user.id]);
        await locker.execute('DELETE FROM sessions WHERE user_id=?', [user.id]);
        await locker.commit();
        assert.equal(await pending, null, 'an account change must prevent a session authenticated with the earlier account state');
        const [sessions] = await observer.execute<import('mysql2').RowDataPacket[]>('SELECT COUNT(*) AS n FROM sessions WHERE user_id=?', [user.id]);
        assert.equal(Number(sessions[0].n), 0);
    }
    finally {
        await locker.rollback();
        locker.release();
        observer.release();
        if (pending)
            await pending.catch(() => {
            });
    }
}
test('concurrent password reset cannot be followed by an old-password session', () => raceLoginAgainstAccountChange(false));
test('concurrent disabling cannot be followed by a fresh session', () => raceLoginAgainstAccountChange(true));

test('web registration: verified before write, unique normalized URL, no grant, rate limit, atomic rotation', async () => {
    await transaction(async (c) => { for (const table of ['audit', 'grants', 'invitations', 'sites', 'login_attempts']) await c.query('DELETE FROM ' + table); });
    const admin = { user: { id: 1, globalAdmin: true, mfaEnabled: true }, mfaVerified: true, csrf: 'x', hash: 'h' } as never;
    const member = { user: { id: 2, globalAdmin: false, mfaEnabled: true }, mfaVerified: true, csrf: 'x', hash: 'h' } as never;
    const key = 'wbv2_' + 'b'.repeat(64), calls: string[] = [];
    await assert.rejects(registerSite(member, 'Nope', 'https://a.example.test/', key, stubs(7, calls)));
    assert.equal(calls.length, 0);
    await assert.rejects(registerSite(admin, 'Bad key', 'https://a.example.test/', 'secret', stubs(7, calls)), (e: RegistrationError) => e.code === 'invalid_input');
    const failing = { ...stubs(), verify: async () => { throw new RegistrationError('invalid_key'); } };
    await assert.rejects(registerSite(admin, 'Rejected', 'https://a.example.test/', key, failing), (e: RegistrationError) => e.code === 'invalid_key');
    assert.equal((await transaction(c => rows(c, 'SELECT id FROM sites'))).length, 0);
    assert.equal((await transaction(c => rows(c, 'SELECT user_id FROM grants'))).length, 0);
    const result = await registerSite(admin, 'Site A', 'https://A.Example.test', key, stubs(7, calls));
    assert.equal(result.integrationId, 7);
    const [row] = await transaction(c => rows<{ key_cipher: string; integration_id: number; url_hash: string; base_url: string }>(c, 'SELECT * FROM sites WHERE id=?', [result.id]));
    assert.equal(row.base_url, 'https://a.example.test/');
    assert.equal(Number(row.integration_id), 7);
    assert.equal(row.url_hash.length, 64);
    assert.ok(!row.key_cipher.includes(key));
    assert.equal((await transaction(c => rows(c, 'SELECT user_id FROM grants'))).length, 0);
    assert.equal((await transaction(c => rows(c, "SELECT id FROM audit WHERE event='site.registered' AND user_id=1"))).length, 1);
    for (const again of ['https://a.example.test/', 'https://A.EXAMPLE.TEST', 'https://a.example.test:443/'])
        await assert.rejects(registerSite(admin, 'Dup', again, key, stubs(8)), (e: RegistrationError) => e.code === 'duplicate_url');
    const audits = JSON.stringify(await transaction(c => rows(c, 'SELECT event FROM audit')));
    assert.ok(!audits.includes(key));
    const concurrent = await Promise.allSettled([1, 2, 3].map(() => registerSite(admin, 'Race', 'https://race.example.test/', key, stubs(9))));
    assert.equal(concurrent.filter(r => r.status === 'fulfilled').length, 1);
    await assert.rejects(replaceSiteKey(admin, result.id, key, stubs(7)), (e: RegistrationError) => e.code === 'same_key');
    const next = 'wbv2_' + 'c'.repeat(64);
    assert.deepEqual(await replaceSiteKey(admin, result.id, next, stubs(11)), { previousIntegrationId: 7, integrationId: 11 });
    const [after] = await transaction(c => rows<{ key_cipher: string; integration_id: number }>(c, 'SELECT key_cipher,integration_id FROM sites WHERE id=?', [result.id]));
    assert.equal(Number(after.integration_id), 11);
    assert.notEqual(after.key_cipher, row.key_cipher);
    await assert.rejects(replaceSiteKey(admin, result.id, next, failing));
    assert.equal(Number((await transaction(c => rows<{ integration_id: number }>(c, 'SELECT integration_id FROM sites WHERE id=?', [result.id])))[0].integration_id), 11);
    await transaction(c => c.execute('DELETE FROM login_attempts'));
    let limited = 0;
    for (let i = 0; i < 12; i++)
        await registerSite(admin, 'Limit' + i, `https://limit${i}.example.test/`, key, failing).catch((e: RegistrationError) => { if (e.code === 'rate_limited') limited++; });
    assert.ok(limited >= 3);
});
