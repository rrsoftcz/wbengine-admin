import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeedQuery, validateFeed, canReadActivity, createActivityGateway, type AppliedChange } from '../src/lib/server/activity.ts';
import { planApiCall, RemoteFailure } from '../src/lib/server/api-contract.ts';

const entry = { change_id: 5, created_at: 1790000000, resource: 'articles', resource_id: '3', action: 'update', source: 'v2', actor: 'admin:1', integration_id: 2, local_user_id: null };
const pagination = { page: 1, per_page: 25, total: 1, total_pages: 1 };

test('the feed query keeps only known filters and bounded paging', () => {
    assert.deepEqual(parseFeedQuery(new URLSearchParams('')), { outcome: 'applied', resource: null, source: null, page: 1 });
    assert.deepEqual(parseFeedQuery(new URLSearchParams('outcome=rejected&resource=articles&source=cli&page=3')), { outcome: 'rejected', resource: 'articles', source: 'cli', page: 3 });
    assert.deepEqual(parseFeedQuery(new URLSearchParams("outcome=x&resource=a'b&source=web&page=-2")), { outcome: 'applied', resource: null, source: null, page: 1 });
    assert.equal(parseFeedQuery(new URLSearchParams('page=99999999999')).page, 1000000);
    assert.equal(parseFeedQuery(new URLSearchParams('page=1.5')).page, 1);
});

test('the request path carries only validated filters', () => {
    assert.equal(planApiCall({ operation: 'activity', page: 2, perPage: 25, feed: { outcome: 'applied', resource: 'pages', source: 'v1' } }).path, 'changes?page=2&per_page=25&outcome=applied&resource=pages&source=v1');
    assert.equal(planApiCall({ operation: 'activity' }).path, 'changes?page=1&per_page=25');
    for (const feed of [{ resource: 'a/b' }, { resource: 'x?y=1' }, { source: 'web' }, { outcome: 'all' as never }, { actor: 'bad\nactor' }])
        assert.throws(() => planApiCall({ operation: 'activity', feed }));
    assert.throws(() => planApiCall({ operation: 'activity', page: 0 }));
    assert.throws(() => planApiCall({ operation: 'activity', perPage: 101 }));
});

test('a feed response is validated and projected; extra or malformed data is rejected', () => {
    const page = validateFeed([{ ...entry, before_data: '{"secret":1}' }], pagination, (v) => v as AppliedChange);
    assert.equal(page.total, 1);
    assert.throws(() => validateFeed('x', pagination, (v) => v));
    assert.throws(() => validateFeed([], { page: 1 }, (v) => v));
    assert.throws(() => validateFeed(new Array(101).fill(entry), pagination, (v) => v));
});

test('who may read the activity: site admins and global admins with the scope and the capability', () => {
    const caps = { audit: { read: true } };
    assert.equal(canReadActivity('siteadmin', ['audit:read'], caps), true);
    assert.equal(canReadActivity('global', ['audit:read'], caps), true);
    assert.equal(canReadActivity('editor', ['audit:read'], caps), false);
    assert.equal(canReadActivity('siteadmin', ['discovery:read'], caps), false);
    assert.equal(canReadActivity('siteadmin', ['audit:read'], {}), false);
});

test('the gateway refuses without access, flags an old key and parses applied and rejected pages', async () => {
    const calls: unknown[] = [];
    const call = async (c: unknown) => { calls.push(c); return { data: [entry], pagination, path: '', method: 'GET' } as never; };
    const open = createActivityGateway({ role: 'siteadmin', scopes: ['audit:read'], capabilities: { audit: { read: true } }, call });
    const page = await open.applied({ outcome: 'applied', resource: 'articles', source: null, page: 1 });
    assert.equal(page.items[0].actor, 'admin:1');
    assert.deepEqual((calls[0] as { feed: unknown }).feed, { outcome: 'applied', resource: 'articles' });
    const oldKey = createActivityGateway({ role: 'siteadmin', scopes: ['discovery:read'], capabilities: { audit: { read: true } }, call });
    assert.equal(oldKey.canRead(), false);
    assert.equal(oldKey.needsNewKey(), true);
    await assert.rejects(oldKey.applied({ outcome: 'applied', resource: null, source: null, page: 1 }), (e) => e instanceof RemoteFailure && e.status === 403);
    const editor = createActivityGateway({ role: 'editor', scopes: ['audit:read'], capabilities: { audit: { read: true } }, call });
    assert.equal(editor.needsNewKey(), false);
});
