import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mailConfig, sendMail, sendInvitationMail, invitationMessage, mailReason, assertSingleLine, type MailConfig, type MailTransport } from '../src/lib/server/mail.ts';
import { messagesFor, translate, type Translate } from '../src/lib/i18n/index.ts';

const full = { MAIL_SMTP_HOST: 'smtp.gmail.com', MAIL_SMTP_USER: 'admin@example.com', MAIL_SMTP_PASSWORD: 'app-password-secret', MAIL_FROM: 'WBengine Admin <admin@example.com>' };
const config: MailConfig = { host: 'smtp.gmail.com', port: 587, user: 'admin@example.com', password: 'app password secret', from: 'admin@example.com' };
const t = (locale: 'en' | 'cs'): Translate => (key, params) => translate(locale, messagesFor(locale), key, params);
const fake = (outcome?: unknown) => {
    const sent: unknown[] = [];
    let closed = false;
    const transport: MailTransport = { sendMail: async (m) => { sent.push(m); if (outcome) throw outcome; return {}; }, close: () => { closed = true; } };
    return { factory: () => transport, sent, closed: () => closed };
};

test('configuration: off when empty, off with a warning when partial, on when complete', () => {
    const warnings: string[] = [];
    assert.equal(mailConfig({}, (m) => warnings.push(m)), null);
    assert.equal(warnings.length, 0);
    assert.equal(mailConfig({ MAIL_SMTP_HOST: 'smtp.gmail.com' }, (m) => warnings.push(m)), null);
    assert.equal(warnings.length, 1);
    assert.equal(mailConfig({ ...full, MAIL_SMTP_PORT: 'abc' }, () => {}), null);
    assert.deepEqual(mailConfig(full), { host: 'smtp.gmail.com', port: 587, user: 'admin@example.com', password: 'app-password-secret', from: 'WBengine Admin <admin@example.com>' });
    assert.equal(mailConfig({ ...full, MAIL_SMTP_PORT: '465' })?.port, 465);
});

test('spaces of a Google app password are dropped, other hosts keep the password as it is', () => {
    assert.equal(mailConfig({ ...full, MAIL_SMTP_PASSWORD: 'abcd efgh ijkl mnop' })?.password, 'abcdefghijklmnop');
    assert.equal(mailConfig({ ...full, MAIL_SMTP_PASSWORD: ' abcd\tefgh ijkl mnop ' })?.password, 'abcdefghijklmnop');
    assert.equal(mailConfig({ ...full, MAIL_SMTP_HOST: 'mail.example.com', MAIL_SMTP_PASSWORD: 'a pass phrase' })?.password, 'a pass phrase');
});

test('header injection is rejected before anything is sent', async () => {
    assert.throws(() => assertSingleLine('a@example.com\r\nBcc: x@example.com'));
    const f = fake();
    const r = await sendMail(config, { to: 'a@example.com\nBcc: x@example.com', subject: 's', text: 't' }, f.factory, () => {});
    assert.deepEqual(r, { ok: false, reason: 'unknown' });
    assert.equal(f.sent.length, 0);
});

test('a send passes the exact message, closes the transport and reports success', async () => {
    const f = fake();
    const r = await sendInvitationMail(config, 'new@example.com', 'https://admin.example.com/', 'TOKEN123', t('en'), f.factory);
    assert.deepEqual(r, { ok: true });
    const m = f.sent[0] as { from: string; to: string; subject: string; text: string };
    assert.equal(m.to, 'new@example.com');
    assert.equal(m.from, 'admin@example.com');
    assert.equal(m.subject, 'Invitation to WBengine Admin');
    assert.match(m.text, /https:\/\/admin\.example\.com\/accept\n/);
    assert.ok(m.text.split('\n').includes('TOKEN123'));
    assert.ok(f.closed());
});

test('the message follows the language of the administrator', () => {
    const m = invitationMessage('a@example.com', 'https://admin.example.com', 'T', t('cs'));
    assert.equal(m.subject, 'Pozvánka do WBengine Admin');
    assert.match(m.text, /Stránka pozvánky: https:\/\/admin\.example\.com\/accept/);
});

test('errors map to a reason and never expose the password or the token', async () => {
    assert.equal(mailReason({ code: 'EAUTH', responseCode: 535 }), 'auth');
    assert.equal(mailReason({ code: 'EENVELOPE' }), 'recipient');
    assert.equal(mailReason({ code: 'ETIMEDOUT' }), 'timeout');
    assert.equal(mailReason({ code: 'ECONNECTION' }), 'connection');
    assert.equal(mailReason(Error('boom')), 'unknown');
    const logs: string[] = [];
    const f = fake(Object.assign(Error('Invalid login: app password secret TOKEN123'), { code: 'EAUTH', responseCode: 535 }));
    const r = await sendInvitationMail(config, 'new@example.com', 'https://admin.example.com', 'TOKEN123', t('en'), f.factory);
    assert.deepEqual(r, { ok: false, reason: 'auth' });
    assert.ok(f.closed());
    const r2 = await sendMail(config, { to: 'new@example.com', subject: 's', text: 'TOKEN123' }, fake(Object.assign(Error('app password secret'), { code: 'EAUTH' })).factory, (l) => logs.push(l));
    assert.equal(r2.ok, false);
    assert.ok(logs.length === 1 && !logs[0].includes('app password secret') && !logs[0].includes('TOKEN123'));
});
