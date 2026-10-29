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
test('change time and actor are readable', async () => {
    const { changeTime, changeActor } = await import('../src/lib/content-format.ts');
    assert.match(changeTime(1793292721), /^\d{1,2}\. \d{1,2}\. \d{4}/);
    assert.equal(changeTime('2026-10-29 10:00'), '2026-10-29 10:00');
    assert.equal(changeActor({ central_actor: 'admin:7' }, { 'admin:7': 'a@b.cz' }), 'a@b.cz');
    assert.equal(changeActor({ central_actor: 'admin:9' }, {}), 'admin:9');
    assert.equal(changeActor({ central_actor: null }, {}), 'přímo na webu');
});
test('dependents of a page list articles, boxes, menu items and child pages', async () => {
    const { loadDependents } = await import('../src/lib/server/content.ts');
    const data: Record<string, Record<string, unknown>[]> = {
        articles: [{ id: 1, site_id: 5, title: 'A', draft_title: 'Koncept A' }, { id: 2, site_id: 6, title: 'B' }],
        boxes: [{ id: 3, name: 'Box', sites: [5, 9] }, { id: 4, name: 'Jiný', sites: [{ site_id: 7 }] }],
        menu: [{ menu_id: 8, site_id: 5, name: 'Menu' }],
        pages: [{ site_id: 5, parent_id: 0, title: 'Sama', link: '/a/' }, { site_id: 10, parent_id: 5, title: 'Pod', link: '/a/b/' }],
    };
    const all: Capabilities = new Proxy({}, { get: () => ({ read: true, write: true }) });
    const gateway = { role: 'global' as const, scopes: [...scopeProfiles.management.scopes], capabilities: all, list: async (r: string) => ({ data: data[r], pagination: { page: 1, total_pages: 1 } }) } as never;
    const result = await loadDependents(gateway, 'pages', '5');
    assert.deepEqual(result?.map(g => [g.resource, g.count]), [['articles', 1], ['boxes', 1], ['menu', 1], ['pages', 1]]);
    assert.equal(result?.[0].items[0].label, 'Koncept A');
    assert.deepEqual(await loadDependents(gateway, 'pages', '99'), []);
    assert.deepEqual(await loadDependents(gateway, 'articles', '1'), []);
});
test('liveUrl and loadLiveLinks build the public address of a record', async () => {
    const { liveUrl } = await import('../src/lib/content-format.ts');
    const { loadLiveLinks } = await import('../src/lib/server/content.ts');
    assert.equal(liveUrl('https://www.wbengine.org/', '/test-2/'), 'https://www.wbengine.org/test-2/');
    assert.equal(liveUrl('https://www.wbengine.org', '/test-2/', 'cs', 'en'), 'https://www.wbengine.org/cs/test-2/');
    assert.equal(liveUrl('https://www.wbengine.org', '/test-2/', 'en', 'en'), 'https://www.wbengine.org/test-2/');
    assert.equal(liveUrl('https://www.wbengine.org', 'https://evil.example/'), null);
    assert.equal(liveUrl('https://www.wbengine.org', ''), null);
    const pages: Record<string, Record<string, unknown>> = { 5: { site_id: 5, title: 'Test 2', link: '/test-2/', visible: 1 }, 6: { site_id: 6, title: 'Skryta', link: '/skryta/', visible: 0 } };
    const gateway = { async get(_r: string, id: string) { if (!pages[id]) throw new RemoteFailure(404, 'not_found'); return { data: pages[id], etag: null }; } } as never;
    const base = 'https://www.wbengine.org/';
    assert.deepEqual((await loadLiveLinks(gateway, base, 'pages', pages[5])).map(x => x.url), ['https://www.wbengine.org/test-2/']);
    const article = await loadLiveLinks(gateway, base, 'articles', { site_id: 5, draft: { content: {} } }, { articleBoxPages: [] });
    assert.match(article[0].note ?? '', /chybí box/);
    assert.match(article[0].note ?? '', /publikovaná/);
    const box = await loadLiveLinks(gateway, base, 'boxes', { sites: [{ site_id: 5 }, 6, 99] });
    assert.equal(box.length, 2);
    assert.match(box[1].note ?? '', /skrytá/);
    assert.deepEqual(await loadLiveLinks(gateway, base, 'sections', { section_id: 1 }), []);
});
