import { test } from 'node:test';
import assert from 'node:assert/strict';
import { permitted } from '../src/lib/server/security.ts';
import { normalizeEmail, checkCsrf, safeUser } from '../src/lib/server/auth.ts';
test('site permission cannot come from actor label or another site', () => {
    assert.equal(permitted(false, null, 'read'), false);
    assert.equal(permitted(false, 'editor', 'manage'), false);
    assert.equal(permitted(false, 'editor', 'read'), true);
    assert.equal(permitted(false, 'siteadmin', 'manage'), true);
    assert.equal(permitted(true, null, 'manage'), true);
});
test('CSRF requires exact session token and same origin', () => {
    const req = new Request('https://admin.example', { method: 'POST', headers: { origin: 'https://evil.example' } });
    assert.throws(() => checkCsrf(req, 'https://admin.example', 'abc', 'abc'));
    assert.throws(() => checkCsrf(new Request('https://admin.example', { method: 'POST', headers: { origin: 'https://admin.example' } }), 'https://admin.example', 'abc', 'bad'));
});
test('public user projection never serializes credentials', () => {
    assert.deepEqual(safeUser({ id: 1, email: 'a@example.com', global_admin: 1, mfa_enabled: 1, password_hash: 'SECRET', mfa_secret: 'SECRET' } as never), { id: 1, email: 'a@example.com', globalAdmin: true, mfaEnabled: true, locale: null });
    assert.equal(normalizeEmail(' A@Example.COM '), 'a@example.com');
    assert.throws(() => normalizeEmail('bad'));
});
test('capability projection ignores unknown and secret fields', async () => {
    const { projectCapabilities } = await import('../src/lib/server/sites.ts');
    const result = projectCapabilities({ success: true, data: { api_version: '2.0', key: 'wbv2_secret', capabilities: { discovery: { read: true, write: false }, articles: { read: false, write: false }, secret: { read: 'wbv2_secret' } } } });
    assert.ok(!JSON.stringify(result).includes('wbv2_secret'));
    assert.equal(result.resources.find(x => x.name === 'articles')?.write, false);
    assert.throws(() => projectCapabilities({ success: true, data: { api_version: '1' } }));
});
