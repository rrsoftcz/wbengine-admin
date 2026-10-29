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

import { loadReferenceOptions, defaultPageOption, referenceFields } from '../src/lib/server/content.ts';
test('unchecked switch is read as 0 for a full save but ignored for translations', () => {
    const f = new FormData();
    f.set('parent_id', '0'); f.set('link', '/a'); f.set('title', 'A'); f.set('visible', '1');
    const data = parseFields('pages', f);
    assert.equal(data.visible, 1);
    assert.equal(data.strict, 0);
    assert.equal(data.acl, 0);
    const t = new FormData();
    t.set('title', 'A');
    assert.deepEqual(parseFields('pages', t, true), { title: 'A' });
    const bad = new FormData();
    bad.set('visible', 'yes');
    assert.throws(() => parseFields('pages', bad));
});
test('reference options are labelled for people, exclude the edited record and fall back to null on failure', async () => {
    const calls: [string, number, number | undefined][] = [];
    const gateway = { list: async (r: string, page = 1, perPage?: number) => {
        calls.push([r, page, perPage]);
        return { etag: null, data: page === 1 ? [{ site_id: 1, title: 'Home', link: '/' }, { site_id: 2, title: 'About', link: '/about' }] : [{ site_id: 3, title: 'Contact', link: '/contact' }], pagination: { page, per_page: 100, total: 3, total_pages: 2 } };
    } };
    const all = await loadReferenceOptions(gateway as never, 'pages');
    assert.deepEqual(all?.map(o => o.label), ['Home (/)', 'About (/about)', 'Contact (/contact)']);
    assert.deepEqual(calls, [['pages', 1, 100], ['pages', 2, 100]]);
    assert.equal(defaultPageOption(all!), 2);
    assert.equal(defaultPageOption([{ value: 5, label: 'Home (/)', link: '/' }]), 5);
    assert.equal(defaultPageOption([]), 0);
    assert.deepEqual((await loadReferenceOptions(gateway as never, 'pages', '2'))?.map(o => o.value), [1, 3]);
    assert.equal(await loadReferenceOptions({ list: async () => { throw new Error('down'); } } as never, 'pages'), null);
    assert.equal(await loadReferenceOptions({ list: async () => ({ etag: null, data: {} }) } as never, 'pages'), null);
    assert.equal(referenceFields.articles?.site_id?.source, 'pages');
});
test('every error code tied to a field names a real schema field, and the source message names the field', async () => {
    const { errorFields, errorMessages, fieldOfError } = await import('../src/lib/server/api-contract.ts');
    const { schemas } = await import('../src/lib/content-schema.ts');
    const known = new Set(Object.values(schemas).flat().map(f => f.name));
    for (const [code, field] of Object.entries(errorFields)) {
        assert.ok(known.has(field), `${code} -> ${field}`);
        assert.ok(Object.hasOwn(errorMessages, code), `${code} needs a catalog message`);
    }
    assert.equal(fieldOfError('invalid_source'), 'source');
    assert.equal(fieldOfError('unknown_code'), undefined);
    assert.match(errorMessages.invalid_source, /^The source /);
    assert.ok(!errorMessages.invalid_source.includes('in the text'));
});

import { normalizePageLink, offersArticleBox, createArticleBox, findCentralSection, loadArticleBoxPages } from '../src/lib/server/content.ts';
test('page link is normalized to /slug/ form, root and invalid characters are left alone', () => {
    assert.equal(normalizePageLink('/testovaci-blog'), '/testovaci-blog/');
    assert.equal(normalizePageLink('about/'), '/about/');
    assert.equal(normalizePageLink('about'), '/about/');
    assert.equal(normalizePageLink('  /about  '), '/about/');
    assert.equal(normalizePageLink('/'), '/');
    assert.equal(normalizePageLink(' / '), '/');
    assert.equal(normalizePageLink('/about/'), '/about/');
    assert.equal(normalizePageLink(''), '');
    assert.equal(normalizePageLink('   '), '');
    assert.equal(normalizePageLink('/o nas'), '/o nas');
    assert.equal(normalizePageLink('/a?b=1'), '/a?b=1');
    const f = new FormData();
    f.set('link', 'blog'); f.set('title', 'Blog');
    assert.equal(parseFields('pages', f).link, '/blog/');
    assert.equal(parseFields('pages', f, true).link, undefined);
});
test('source message only concerns control characters', async () => {
    const { errorMessages } = await import('../src/lib/server/api-contract.ts');
    assert.equal(errorMessages.invalid_source, 'The source must not contain control characters or line breaks.');
});
const story = [{ type: 'story', settings: {}, sections: ['central'] }];
const boxGateway = (calls: unknown[], opts: { role?: 'global' | 'editor'; boxesWrite?: boolean; sections?: unknown[]; failSave?: boolean; boxes?: unknown[] } = {}) => createContentGateway({
    role: opts.role ?? 'global', scopes: ['pages:read', 'pages:write', 'boxes:read', 'boxes:write', 'sections:read'],
    capabilities: { pages: { read: true, write: true }, boxes: { read: true, write: opts.boxesWrite ?? true }, sections: { read: true } },
    call: async (call) => {
        calls.push(call);
        if (call.operation === 'create' && call.resource === 'boxes' && opts.failSave) throw new RemoteFailure(500, 'unavailable');
        if (call.resource === 'sections') return { etag: null, data: opts.sections ?? [{ section_id: 3, key: 'top' }, { section_id: 4, key: 'central' }], pagination: { page: 1, per_page: 100, total: 2, total_pages: 1 } };
        if (call.resource === 'boxes' && call.operation === 'list') return { etag: null, data: opts.boxes ?? [], pagination: { page: 1, per_page: 100, total: 0, total_pages: 1 } };
        return { etag: '"' + 'a'.repeat(64) + '"', data: { id: 9, site_id: 9 } };
    }
});
test('article box is offered only when the site registers story and boxes are writable', () => {
    assert.equal(offersArticleBox(boxGateway([]), story), true);
    assert.equal(offersArticleBox(boxGateway([]), []), false);
    assert.equal(offersArticleBox(boxGateway([], { boxesWrite: false }), story), false);
    assert.equal(offersArticleBox(boxGateway([], { role: 'editor' }), story), false);
});
test('article box is created in the central section through the ordinary create operation', async () => {
    const calls: { operation: string; resource?: string; data?: Record<string, unknown> }[] = [];
    assert.equal(await createArticleBox(boxGateway(calls), story, 12, 'Blog'), 'created');
    assert.deepEqual(calls.at(-1), { operation: 'create', resource: 'boxes', id: undefined, data: { name: 'Article: Blog', type: 'story', settings: {}, section_id: 4, static: 1, shared: 0, device_min: 1, device_strict: 0, order: 0, sites: [12] }, etag: undefined });
    const none: unknown[] = [];
    assert.equal(await createArticleBox(boxGateway(none), [], 12, 'Blog'), 'skipped');
    assert.equal(none.length, 0);
    assert.equal(await createArticleBox(boxGateway([], { sections: [{ section_id: 3, key: 'top' }] }), story, 12, 'Blog'), 'failed');
    assert.equal(await createArticleBox(boxGateway([], { failSave: true }), story, 12, 'Blog'), 'failed');
    assert.equal(await findCentralSection(boxGateway([])), 4);
});
test('creating a page keeps the page when the box fails and asks for manual follow-up', async () => {
    const { createContentActions } = await import('../src/lib/server/content-actions.ts');
    const { tokenHash } = await import('../src/lib/server/security.ts');
    const run = async (opts: Parameters<typeof boxGateway>[1], flag: string | null) => {
        const calls: { operation: string; resource?: string }[] = [];
        const gateway = boxGateway(calls, opts);
        const post = Object.assign({}, gateway, { save: gateway.save });
        const actions = createContentActions(async () => ({ site: { id: 1, name: 'Fixture' }, boxTypes: story, gateway: post }));
        const body = new URLSearchParams({ csrf: 'csrf', etag: '', parent_id: '0', link: 'blog', title: 'Blog', visible: '1' });
        if (flag) body.set('show_article', flag);
        const event = { params: { site: '1', resource: 'pages', id: 'new' }, url: new URL('https://admin.example/content/1/pages/new'), locals: { csrf: 'csrf', session: { user: { id: 1, email: 'a@example.test', globalAdmin: true, mfaEnabled: true }, mfaVerified: true, csrf: 'csrf', hash: tokenHash('session') } }, request: new Request('https://admin.example/content/1/pages/new', { method: 'POST', headers: { origin: 'https://admin.example' }, body }) } as never;
        try { const result = await actions.save(event); return { calls, location: JSON.stringify(result) }; } catch (e) { return { calls, location: (e as { location?: string }).location }; }
    };
    const ok = await run({}, '1');
    assert.equal(ok.calls.filter(c => c.operation === 'create').length, 2);
    assert.ok(!ok.location?.includes('boxWarning'));
    const failed = await run({ failSave: true }, '1');
    assert.equal(failed.calls.filter(c => c.resource === 'pages' && c.operation === 'create').length, 1);
    assert.equal(failed.location, '/content/1/pages/9?boxWarning=1');
    const off = await run({}, null);
    assert.equal(off.calls.filter(c => c.resource === 'boxes').length, 0);
});
test('article box pages are found from story boxes and failures hide the notice', async () => {
    const calls: unknown[] = [];
    const g = boxGateway(calls, { boxes: [{ type: 'story', sites: [5, { site_id: 6 }] }, { type: 'other', sites: [7] }] });
    assert.deepEqual(await loadArticleBoxPages(g, story), [5, 6]);
    assert.equal(await loadArticleBoxPages(g, []), null);
    const broken = createContentGateway({ role: 'global', scopes: ['boxes:read'], capabilities: { boxes: { read: true } }, call: async () => { throw new RemoteFailure(500, 'x'); } });
    assert.equal(await loadArticleBoxPages(broken, story), null);
});
