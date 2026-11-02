import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { database, transaction, rows } from '../src/lib/server/db.ts';
import { invite, acceptInvitation, loadSession, login, setupMfa, completeMfa, acceptInvitation as accept } from '../src/lib/server/auth.ts';
import { migrate } from '../src/lib/server/migrate.ts';
import { totp } from '../src/lib/server/security.ts';
import { listUsers, userDetail, inviteUser, issueRecoveryFor, setDisabled, setGlobalAdmin, revokeGrant, resetUserMfa, mailInvitation, UserError } from '../src/lib/server/users.ts';
import type { MailConfig, MailTransport } from '../src/lib/server/mail.ts';
import { messagesFor, translate, type Translate } from '../src/lib/i18n/index.ts';
if (!process.env.DATABASE_URL?.includes('wbengine_admin_test'))
    throw Error('The integration test requires the isolated wbengine_admin_test DB');
await transaction(async (c) => { await migrate(c); });
after(async () => { await database().end(); });

const password = 'users test password 12', code = (secret: string) => totp(secret, Math.floor(Date.now() / 30000));
const tag = Math.random().toString(36).slice(2, 8);
async function member(email: string, globalAdmin = false) {
    let raw = await acceptInvitation(await invite(email, globalAdmin), password);
    const session = (await loadSession(raw))!;
    const secret = await setupMfa(session);
    raw = (await completeMfa(session, code(secret))).sessionToken;
    return { raw, session: (await loadSession(raw))! };
}
const rejectsWith = (promise: Promise<unknown>, expected: string) => assert.rejects(promise, (e) => e instanceof UserError && e.code === expected);

test('an admin cannot change their own role or status, and a demoted admin can no longer act', async () => {
    const a = await member(`ga-a-${tag}@example.test`, true);
    const b = await member(`ga-b-${tag}@example.test`, true);
    await rejectsWith(setGlobalAdmin(a.session, a.session.user.id, false), 'self');
    await rejectsWith(setDisabled(a.session, a.session.user.id, true), 'self');
    await rejectsWith(resetUserMfa(a.session, a.session.user.id), 'self');
    await setGlobalAdmin(a.session, b.session.user.id, false);
    // b's sessions ended with the demotion and a stale session object has no global permission.
    assert.equal(await loadSession(b.raw), null);
    await assert.rejects(setDisabled({ ...b.session, user: { ...b.session.user, globalAdmin: false } }, a.session.user.id, true));
    await setGlobalAdmin(a.session, b.session.user.id, true);
    assert.equal((await userDetail(a.session, b.session.user.id)).globalAdmin, true);
});

test('disabling ends sessions and blocks sign-in, enabling restores it', async () => {
    const admin = await member(`adm-${tag}@example.test`, true);
    const user = await member(`dis-${tag}@example.test`);
    await setDisabled(admin.session, user.session.user.id, true);
    assert.equal(await loadSession(user.raw), null);
    assert.equal(await login(`dis-${tag}@example.test`, password), null);
    assert.equal((await userDetail(admin.session, user.session.user.id)).disabled, true);
    await rejectsWith(issueRecoveryFor(admin.session, user.session.user.id), 'disabled');
    await setDisabled(admin.session, user.session.user.id, false);
    assert.ok(await login(`dis-${tag}@example.test`, password));
});

test('promote and demote change the role and end the sessions of that user', async () => {
    const admin = await member(`adm2-${tag}@example.test`, true);
    const user = await member(`pro-${tag}@example.test`);
    await setGlobalAdmin(admin.session, user.session.user.id, true);
    assert.equal(await loadSession(user.raw), null);
    assert.equal((await userDetail(admin.session, user.session.user.id)).globalAdmin, true);
    await setGlobalAdmin(admin.session, user.session.user.id, false);
    assert.equal((await userDetail(admin.session, user.session.user.id)).globalAdmin, false);
});

test('MFA reset, recovery code and grant revocation are audited with the acting admin', async () => {
    const admin = await member(`adm3-${tag}@example.test`, true);
    const user = await member(`mfa-${tag}@example.test`);
    await transaction(async (c) => { await c.query("INSERT INTO sites(name,base_url,key_cipher) VALUES ('Revoke site','https://revoke.example','x')"); });
    const [site] = await transaction(c => rows<{ id: number }>(c, "SELECT id FROM sites WHERE name='Revoke site' ORDER BY id DESC LIMIT 1"));
    await transaction(async (c) => { await c.execute("INSERT INTO grants(user_id,site_id,role) VALUES (?,?,'editor')", [user.session.user.id, site.id]); });
    await revokeGrant(admin.session, user.session.user.id, Number(site.id));
    await rejectsWith(revokeGrant(admin.session, user.session.user.id, Number(site.id)), 'noGrant');
    const recovery = await issueRecoveryFor(admin.session, user.session.user.id);
    assert.equal(recovery.email, `mfa-${tag}@example.test`);
    assert.ok(recovery.token.length > 20);
    await resetUserMfa(admin.session, user.session.user.id);
    const detail = await userDetail(admin.session, user.session.user.id);
    assert.equal(detail.mfaEnabled, false);
    assert.equal(detail.grants.length, 0);
    const events = await transaction(c => rows<{ event: string }>(c, 'SELECT event FROM audit WHERE user_id=? ORDER BY id', [admin.session.user.id]));
    for (const wanted of [`grant.revoked:${user.session.user.id}`, `user.recovery:${user.session.user.id}`, `user.mfa_reset:${user.session.user.id}`])
        assert.ok(events.some(e => e.event === wanted), wanted);
});

test('invitations are audited with the actor, refuse existing accounts and unknown sites', async () => {
    const admin = await member(`adm4-${tag}@example.test`, true);
    const result = await inviteUser(admin.session, ` New-${tag}@Example.test `, false, null, null);
    assert.equal(result.email, `new-${tag}@example.test`);
    assert.ok(result.token);
    assert.ok(await accept(result.token, password));
    await rejectsWith(inviteUser(admin.session, `new-${tag}@example.test`, false, null, null), 'exists');
    await rejectsWith(inviteUser(admin.session, `x-${tag}@example.test`, false, 999999, 'editor'), 'noSite');
    const [row] = await transaction(c => rows<{ n: number }>(c, "SELECT COUNT(*) AS n FROM audit WHERE user_id=? AND event='invite.created'", [admin.session.user.id]));
    assert.equal(Number(row.n), 1);
    const editor = await member(`ed-${tag}@example.test`);
    await assert.rejects(listUsers(editor.session, 1, null));
});

test('the user list pages, searches and treats wildcards as text', async () => {
    const admin = await member(`adm5-${tag}@example.test`, true);
    for (let i = 0; i < 3; i++) await member(`page${i}-${tag}@example.test`);
    const all = await listUsers(admin.session, 1, null);
    assert.ok(all.total >= 4 && all.users.length <= 25);
    const found = await listUsers(admin.session, 1, `page1-${tag}`);
    assert.equal(found.total, 1);
    assert.equal((await listUsers(admin.session, 1, '%')).total, 0);
    assert.equal((await listUsers(admin.session, 1, '_')).total, 0);
    assert.equal((await listUsers(admin.session, 9999, null)).users.length, 0);
});

test('mailing an invitation records the audit event, and a failed send leaves the invitation usable', async () => {
    const admin = await member(`mail-${tag}@example.test`, true);
    const config: MailConfig = { host: 'smtp.example.test', port: 587, user: 'u@example.test', password: 'smtp-secret', from: 'u@example.test' };
    const t: Translate = (key, params) => translate('en', messagesFor('en'), key, params);
    const sent: { to: string; text: string }[] = [];
    const ok: MailTransport = { sendMail: async (m) => { sent.push(m); return {}; }, close: () => {} };
    const broken: MailTransport = { sendMail: async () => { throw Object.assign(Error('login failed smtp-secret'), { code: 'EAUTH', responseCode: 535 }); }, close: () => {} };
    const lastEvent = async () => (await transaction(c => rows<{ event: string }>(c, 'SELECT event FROM audit WHERE user_id=? ORDER BY id DESC LIMIT 1', [admin.session.user.id])))[0]?.event;

    const first = await inviteUser(admin.session, `mail-ok-${tag}@example.test`, false, null, null);
    assert.deepEqual(await mailInvitation(admin.session, first, null, 'https://admin.example.test', t, config, () => ok), { ok: true });
    assert.equal(await lastEvent(), 'invite.mailed');
    assert.equal(sent[0].to, first.email);
    assert.ok(sent[0].text.includes(first.token));

    const second = await inviteUser(admin.session, `mail-bad-${tag}@example.test`, false, null, null);
    assert.deepEqual(await mailInvitation(admin.session, second, null, 'https://admin.example.test', t, config, () => broken), { ok: false, reason: 'auth' });
    assert.equal(await lastEvent(), 'invite.mail_failed');
    await acceptInvitation(second.token, password);

    assert.equal(await mailInvitation(admin.session, first, null, 'https://admin.example.test', t, null), null);
});
