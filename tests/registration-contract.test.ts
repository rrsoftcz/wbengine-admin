import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyticsScope, classifyRegistrationError, frameworkScopes, registrationErrors, RegistrationError, scopeProfiles, verifyRegistration } from '../src/lib/server/registration-contract.ts';
import { canOperate, resources, type Capabilities } from '../src/lib/server/content.ts';
import { RemoteFailure } from '../src/lib/server/remote.ts';
const key = 'wbv2_' + 'a'.repeat(64);
const caps = { success: true, data: { api_version: '2.0', capabilities: { discovery: { read: true, write: false }, articles: { read: true, write: true } } } };
const identity = (scopes: string[], id: unknown = 7) => ({ success: true, data: { integration_id: id, name: 'Admin', scopes } });
const getter = (scopes: string[], id: unknown = 7) => async (_b: string, resource: string) => resource === 'capabilities' ? caps : identity(scopes, id);
test('management profile equals the framework whitelist and excludes analytics', () => {
    assert.deepEqual([...scopeProfiles.management.scopes].sort(), [...frameworkScopes].sort());
    assert.ok(!scopeProfiles.management.scopes.includes(analyticsScope));
});
test('canOperate never requires a scope outside the management profile', () => {
    const asked = new Set<string>();
    class Recorder extends Array<string> {
        override includes(scope: string) {
            asked.add(scope);
            return true;
        }
    }
    const all: Capabilities = new Proxy({}, { get: () => ({ read: true, write: true }) });
    const actions = ['list', 'get', 'save', 'delete', 'publish', 'restore', 'structureRestore', 'preview', 'translationGet', 'translationSave', 'translationDelete', 'upload', 'changes', 'revisions'];
    for (const role of ['editor', 'siteadmin', 'global'] as const)
        for (const r of resources)
            for (const action of actions)
                canOperate(role, new Recorder(), all, action, r);
    assert.ok(asked.size > 10);
    for (const scope of asked)
        assert.ok(scopeProfiles.management.scopes.includes(scope), `scope mimo profil: ${scope}`);
});
test('verification returns identity and resources for a complete key', async () => {
    const result = await verifyRegistration('https://example.com/', key, [], 'management', getter([...scopeProfiles.management.scopes]));
    assert.equal(result.integrationId, 7);
    assert.deepEqual(result.extras, []);
    assert.equal(result.resources.find(r => r.name === 'articles')?.write, true);
});
test('verification accepts analytics as optional extra only', async () => {
    const result = await verifyRegistration('https://example.com/', key, [], 'management', getter([...scopeProfiles.management.scopes, analyticsScope]));
    assert.deepEqual(result.extras, [analyticsScope]);
    await assert.rejects(verifyRegistration('https://example.com/', key, [], 'management', getter([...scopeProfiles.management.scopes, 'evil:write'])), (e: RegistrationError) => e.code === 'bad_contract');
});
test('verification reports missing scopes without exposing the key', async () => {
    await assert.rejects(verifyRegistration('https://example.com/', key, [], 'management', getter(['discovery:read', 'articles:read'])), (e: RegistrationError) => {
        assert.equal(e.code, 'missing_scope');
        assert.ok(e.missing.includes('publish:write') && !e.missing.includes('discovery:read'));
        assert.ok(!e.message.includes(key));
        return true;
    });
    await assert.rejects(verifyRegistration('https://example.com/', key, [], 'management', getter(['articles:read'])), (e: RegistrationError) => e.code === 'missing_scope' && e.missing[0] === 'discovery:read');
});
test('verification rejects malformed identity', async () => {
    for (const id of [0, -1, 1.5, '7', null])
        await assert.rejects(verifyRegistration('https://example.com/', key, [], 'management', getter([...scopeProfiles.management.scopes], id)), (e: RegistrationError) => e.code === 'bad_contract');
});
test('remote failures map to a finite catalog and never leak details', async () => {
    const cases: [unknown, string][] = [[new RemoteFailure(401, 'remote_rejected'), 'invalid_key'], [new RemoteFailure(403, 'remote_rejected'), 'forbidden'], [new RemoteFailure(404, 'remote_rejected'), 'api_unavailable'], [new RemoteFailure(503, 'remote_rejected'), 'api_unavailable'], [new RemoteFailure(429, 'remote_rejected'), 'rate_limited'], [new RemoteFailure(500, 'remote_rejected'), 'remote_error'], [Error('Vypršel čas API'), 'timeout'], [Error('Spojení s API selhalo'), 'unreachable'], [Error('DNS adresa není povolena'), 'unsafe_target'], [Error('Nepovolená adresa webu'), 'invalid_url'], [new TypeError('Invalid URL'), 'invalid_url'], [Error('ECONNREFUSED 10.0.0.5:443 ' + key), 'remote_error']];
    for (const [error, code] of cases) {
        assert.equal(classifyRegistrationError(error), code);
        await assert.rejects(verifyRegistration('https://example.com/', key, [], 'management', async () => { throw error; }), (e: RegistrationError) => {
            assert.equal(e.code, code);
            assert.equal(e.message, registrationErrors[code as keyof typeof registrationErrors]);
            assert.ok(!e.message.includes(key) && !e.message.includes('10.0.0.5'));
            return true;
        });
    }
});
test('projectLocales keeps only well formed locales and tolerates old sites', async () => {
    const { projectLocales } = await import('../src/lib/server/content.ts');
    assert.deepEqual(projectLocales({ default: 'en', locales: ['en', 'cs', 'pt_BR', 'x', '<b>'] }), { default: 'en', list: ['en', 'cs', 'pt_BR'] });
    assert.equal(projectLocales(undefined), null);
    assert.equal(projectLocales({ default: 'EN', locales: [] }), null);
});
