import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planApiCall, RemoteFailure } from '../src/lib/server/remote.ts';
import { createContentGateway, canOperate, parseFields, renderPreviewDocument } from '../src/lib/server/content.ts';
test('finite API route plan encodes pagination and rejects arbitrary paths, weak ETags and locale injection', () => {
    assert.deepEqual(planApiCall({ operation: 'list', resource: 'articles', page: 2 }), { path: 'articles?page=2&per_page=25', method: 'GET' });
    assert.throws(() => planApiCall({ operation: 'get', resource: 'https://evil.test', id: '1' } as never));
    assert.throws(() => planApiCall({ operation: 'update', resource: 'articles', id: '1', etag: 'W/"abc"', data: { title: 'x' } }));
    assert.throws(() => planApiCall({ operation: 'translationGet', resource: 'articles', id: '1', locale: 'cs/../../identity' }));
});
test('editor drafts but cannot publish or mutate structure; scopes and capabilities both gate operations', () => {
    assert.equal(canOperate('editor', ['articles:write'], { articles: { write: true } }, 'save', 'articles'), true);
    assert.equal(canOperate('editor', ['articles:write', 'publish:write'], { articles: { write: true }, publish: { write: true } }, 'publish', 'articles'), false);
    assert.equal(canOperate('editor', ['pages:write'], { pages: { write: true } }, 'save', 'pages'), false);
    assert.equal(canOperate('siteadmin', [], { articles: { write: true } }, 'save', 'articles'), false);
});
test('gateway never retries a conflict or changes supplied ETag', async () => {
    const calls: unknown[] = [];
    const gateway = createContentGateway({ role: 'editor', scopes: ['articles:read', 'articles:write'], capabilities: { articles: { read: true, write: true } }, call: async (call) => {
            calls.push(call);
            throw new RemoteFailure(412, 'precondition_failed');
        } });
    await assert.rejects(gateway.save('articles', '1', { title: 'dirty' }, '"' + 'a'.repeat(64) + '"'), e => e instanceof RemoteFailure && e.status === 412);
    assert.equal(calls.length, 1);
    assert.equal((calls[0] as {
        etag: string;
    }).etag, '"' + 'a'.repeat(64) + '"');
});
test('form schema accepts only editable fields and integer values', () => {
    const f = new FormData();
    f.set('title', 'Draft');
    f.set('site_id', '12');
    f.set('introtext', 'a');
    f.set('bodytext', 'b');
    f.set('content_format', 'markdown');
    assert.deepEqual(parseFields('articles', f), { site_id: 12, title: 'Draft', introtext: 'a', bodytext: 'b', content_format: 'markdown' });
    f.set('site_id', '1.5');
    assert.throws(() => parseFields('articles', f));
});
test('preview escapes title and includes restrictive scriptless sandbox', () => {
    const html = renderPreviewDocument({ title: '<script>x</script>', introtext: '<p>Text</p>', bodytext: '<script>alert(1)</script>', private: true });
    assert.ok(html.includes('&lt;script&gt;x'));
    assert.ok(html.includes("default-src 'none'"));
    assert.ok(html.includes('sandbox'));
});
test('form conflict preserves exact dirty text and ETag; explicit merge reads without writing', async () => {
    const { createContentActions } = await import('../src/lib/server/content-actions.ts');
    const { tokenHash } = await import('../src/lib/server/security.ts');
    const old = '"' + 'a'.repeat(64) + '"', fresh = '"' + 'b'.repeat(64) + '"';
    let writes = 0, reads = 0;
    const gateway = createContentGateway({ role: 'editor', scopes: ['articles:read', 'articles:write'], capabilities: { articles: { read: true, write: true } }, call: async (call) => {
            if (call.operation === 'update') {
                writes++;
                assert.equal(call.etag, old);
                throw new RemoteFailure(412, 'precondition_failed');
            }
            reads++;
            return { data: { title: 'Concurrent title' }, etag: fresh };
        } });
    const actions = createContentActions(async () => ({ site: { id: 1, name: 'Fixture' }, boxTypes: [], gateway }));
    const event = (extra: Record<string, string> = {}) => ({ params: { site: '1', resource: 'articles', id: '2' }, url: new URL('https://admin.example/content/1/articles/2'), locals: { csrf: 'csrf', session: { user: { id: 1, email: 'editor@example.test', globalAdmin: false, mfaEnabled: true }, mfaVerified: true, csrf: 'csrf', hash: tokenHash('session') } }, request: new Request('https://admin.example/content/1/articles/2', { method: 'POST', headers: { origin: 'https://admin.example' }, body: new URLSearchParams({ csrf: 'csrf', etag: old, title: 'Dirty title', introtext: 'Dirty intro', bodytext: 'Text <must stay> & intact', content_format: 'markdown', site_id: '1', ...extra }) }) }) as never;
    const result = await actions.save(event()) as {
        status: number;
        data: Record<string, unknown>;
    };
    assert.equal(result.status, 412);
    assert.equal((result.data.values as Record<string, string>).bodytext, 'Text <must stay> & intact');
    assert.equal(result.data.etag, old);
    assert.equal(writes, 1);
    const merged = await actions.merge(event({ mergeConsent: 'yes' })) as {
        etag: string;
        values: Record<string, string>;
    };
    assert.equal(merged.etag, fresh);
    assert.equal(merged.values.bodytext, 'Text <must stay> & intact');
    assert.equal(writes, 1);
    assert.equal(reads, 1);
    const rejected = await actions.save(event({ csrf: 'forged' })) as {
        status: number;
    };
    assert.equal(rejected.status, 400);
    assert.equal(writes, 1);
});
test('all resource operations are finite and preconditions distinguish structure recovery from detail', () => {
    const tag = '"' + 'c'.repeat(64) + '"';
    assert.deepEqual(planApiCall({ operation: 'translationGet', resource: 'pages', id: '3', locale: 'cs' }), { path: 'translations/site/3/cs', method: 'GET' });
    assert.deepEqual(planApiCall({ operation: 'structureRestore', resource: 'pages', id: '3', etag: tag, data: { change_id: 4 } }), { path: 'pages/3/restore', method: 'POST', etag: tag, data: { change_id: 4 } });
    for (const operation of ['preview', 'publish', 'revisions', 'restore'] as const)
        assert.throws(() => planApiCall({ operation, resource: 'pages', id: '1', etag: tag }));
    assert.throws(() => planApiCall({ operation: 'get', resource: 'images', id: '../../identity' }));
});
test('legacy text remains legacy until explicit Markdown selection; boxes accept registered enum settings only', () => {
    const legacy = new FormData();
    legacy.set('title', 'Metadata edit');
    legacy.set('introtext', '<p>Unchanged</p>');
    legacy.set('bodytext', '<p>Legacy body</p>');
    legacy.set('content_format', 'legacy_html');
    assert.equal('content_format' in parseFields('articles', legacy), false);
    legacy.set('content_format', 'markdown');
    assert.equal(parseFields('articles', legacy).content_format, 'markdown');
    const box = new FormData();
    box.set('name', 'Box');
    box.set('type', 'Story');
    box.set('section_id', '1');
    box.set('setting_theme', 'light');
    const catalog = [{ type: 'Story', settings: { theme: ['light', 'dark'] }, sections: ['central'] }];
    assert.deepEqual(parseFields('boxes', box, false, catalog).settings, { theme: 'light' });
    box.set('setting_theme', 'php:eval');
    assert.throws(() => parseFields('boxes', box, false, catalog));
    box.set('type', 'ArbitraryClass');
    assert.throws(() => parseFields('boxes', box, false, catalog));
});
test('permissions block before transport for editor publish/delete/structure and missing capability or scope', async () => {
    let calls = 0;
    const g = createContentGateway({ role: 'editor', scopes: ['articles:read', 'articles:write', 'publish:write', 'pages:write', 'images:write'], capabilities: { articles: { read: true, write: true }, pages: { write: true }, images: { write: false }, publish: { write: true } }, call: async () => {
            calls++;
            return { data: {}, etag: null };
        } });
    const tag = '"' + 'a'.repeat(64) + '"';
    for (const action of [() => g.publish('1', tag), () => g.remove('articles', '1', tag), () => g.save('pages', '1', { title: 'x' }, tag), () => g.upload({ base64: 'a', mime: 'image/png' }), () => g.saveTranslation('articles', '1', 'cs', { title: 'x' }, tag)])
        assert.throws(action);
    assert.equal(calls, 0);
});
test('translation action forwards own locale and ETag and redirects after success', async () => {
    const { createContentActions } = await import('../src/lib/server/content-actions.ts');
    const { isRedirect } = await import('@sveltejs/kit');
    const tag = '"' + 'd'.repeat(64) + '"';
    const calls: unknown[] = [];
    const gateway = createContentGateway({ role: 'global', scopes: ['articles:read', 'articles:write', 'translations:read', 'translations:write'], capabilities: { articles: { read: true, write: true }, translations: { read: true, write: true } }, call: async (call) => {
            calls.push(call);
            return { data: { id: 2 }, etag: tag };
        } });
    const actions = createContentActions(async () => ({ site: { id: 1, name: 'Fixture' }, boxTypes: [], gateway }));
    const event = { params: { site: '1', resource: 'articles', id: '2' }, url: new URL('https://admin.example/content/1/articles/2'), locals: { csrf: 'csrf', session: { user: { id: 1, email: 'a@example.test', globalAdmin: true, mfaEnabled: true }, mfaVerified: true, csrf: 'csrf', hash: 'abc' } }, request: new Request('https://admin.example/content/1/articles/2', { method: 'POST', headers: { origin: 'https://admin.example' }, body: new URLSearchParams({ csrf: 'csrf', etag: tag, locale: 'en', title: 'English', introtext: 'Intro', bodytext: 'Body', content_format: 'markdown' }) }) } as never;
    await assert.rejects(actions.translationSave(event), e => isRedirect(e) && e.status === 303 && e.location.endsWith('?locale=en'));
    assert.deepEqual(calls, [{ operation: 'translationSave', resource: 'articles', id: '2', locale: 'en', etag: tag, data: { title: 'English', introtext: 'Intro', bodytext: 'Body', content_format: 'markdown' } }]);
});
test('connection failure keeps submitted fields in request-local state for offline HTML without another remote read', async () => {
    const { createContentActions } = await import('../src/lib/server/content-actions.ts');
    const { ContentConnectionFailure } = await import('../src/lib/server/content.ts');
    let calls = 0;
    const actions = createContentActions(async () => {
        calls++;
        throw new ContentConnectionFailure({ id: 9, name: 'Offline site' }, 'editor', new RemoteFailure(502, 'unavailable'));
    });
    const event = { params: { site: '9', resource: 'articles', id: '2' }, url: new URL('https://admin.example/content/9/articles/2'), locals: { csrf: 'csrf', session: { user: { id: 1, email: 'e@example.test', globalAdmin: false, mfaEnabled: true }, mfaVerified: true, csrf: 'csrf', hash: 'abc' } }, request: new Request('https://admin.example/content/9/articles/2', { method: 'POST', headers: { origin: 'https://admin.example' }, body: new URLSearchParams({ csrf: 'csrf', etag: '"' + 'a'.repeat(64) + '"', title: 'Unsaved', introtext: '', bodytext: 'Keep <dirty> & exact', content_format: 'markdown', site_id: '1' }) }) } as unknown as import('@sveltejs/kit').RequestEvent;
    const result = await actions.save(event) as {
        status: number;
    };
    assert.equal(result.status, 502);
    assert.equal(calls, 1);
    const retained = event.locals.contentFailure;
    assert.ok(retained);
    assert.equal(retained.fields.bodytext, 'Keep <dirty> & exact');
    assert.equal(retained.fields.introtext, '');
    assert.equal(retained.site.name, 'Offline site');
    assert.equal('csrf' in retained.fields, false);
    assert.equal('key' in retained, false);
});
