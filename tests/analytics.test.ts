import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planApiCall } from '../src/lib/server/api-contract.ts';
import { canReadAnalytics, createAnalyticsGateway, parseAnalyticsRange, validateAnalyticsOverview } from '../src/lib/server/analytics.ts';

test('range defaults to 30 dates ending yesterday UTC to avoid future site-local dates', () => {
    const now = new Date('2026-10-27T12:00:00Z');
    assert.deepEqual(parseAnalyticsRange(new URLSearchParams(), now), { from: '2026-09-27', to: '2026-10-26', granularity: 'day' });
    assert.deepEqual(parseAnalyticsRange(new URLSearchParams('from=2026-08-27&to=2026-10-27&granularity=month'), now), { from: '2026-08-27', to: '2026-10-27', granularity: 'month' });
});

test('range rejects malformed ISO dates, reversed ranges, unsupported granularity and more than 62 dates', () => {
    const now = new Date('2026-10-27T12:00:00Z');
    for (const params of ['from=2026-02-30&to=2026-03-01', 'from=2026-10-27&to=2026-10-26', 'from=2026-10-01&to=2026-10-27&granularity=year', 'from=2026-08-26&to=2026-10-27']) {
        assert.throws(() => parseAnalyticsRange(new URLSearchParams(params), now));
    }
});

const validRange = { from: '2026-10-25', to: '2026-10-26', granularity: 'day' as const };
const validOverview = {
    timezone: 'UTC',
    period: { ...validRange, complete: true },
    totals: { page_views: 5, article_views: 3, box_appearances: 4 },
    lifetime_totals: { page_views: 90, article_views: 123, box_appearances: 40 },
    series: [
        { period_start: '2026-10-25', page_views: 2, article_views: 1, box_appearances: 3 },
        { period_start: '2026-10-26', page_views: 3, article_views: 2, box_appearances: 1 },
    ],
    top_pages: [{ id: 1, title: '<script>alert(1)</script>', views: 5 }],
    top_articles: [{ id: 2, title: 'Story', views: 3 }],
    top_boxes: [{ id: 3, name: 'Header', appearances: 4 }],
};

test('overview validates dates, timezone, non-negative integer counts, complete series and top item limits', () => {
    assert.deepEqual(validateAnalyticsOverview(validOverview, validRange), validOverview);
    const invalid = [
        { ...validOverview, timezone: 'Invalid/Timezone' },
        { ...validOverview, period: { ...validOverview.period, from: '2026-10-24' } },
        { ...validOverview, totals: { ...validOverview.totals, page_views: -1 } },
        { ...validOverview, totals: { ...validOverview.totals, article_views: 1.5 } },
        { ...validOverview, series: validOverview.series.slice(1) },
        { ...validOverview, top_pages: Array.from({ length: 11 }, (_, id) => ({ id: id + 1, title: 'Page', views: 1 })) },
        { ...validOverview, top_boxes: Array.from({ length: 11 }, (_, id) => ({ id: id + 1, name: 'Box', appearances: 1 })) },
        { ...validOverview, totals: { ...validOverview.totals, page_views: 6 } },
    ];
    for (const value of invalid) assert.throws(() => validateAnalyticsOverview(value, validRange));
});

test('overview projection strips unexpected fields before data can reach browser rendering', () => {
    const projected = validateAnalyticsOverview({ ...validOverview, visitor_id: 'private', top_pages: [{ ...validOverview.top_pages[0]!, internal_secret: 'private' }] }, validRange);
    assert.equal('visitor_id' in projected, false);
    assert.equal('internal_secret' in projected.top_pages[0]!, false);
});

test('analytics operation creates one encoded read-only overview URL', () => {
    assert.deepEqual(planApiCall({ operation: 'analyticsOverview', from: validRange.from, to: validRange.to, granularity: validRange.granularity }), {
        path: 'analytics/overview?from=2026-10-25&to=2026-10-26&granularity=day', method: 'GET',
    });
    assert.throws(() => planApiCall({ operation: 'analyticsOverview', from: '2026-02-30', to: '2026-03-01', granularity: 'day' }));
});

test('analytics requires read role, scope and API capability before remote callback', async () => {
    assert.equal(canReadAnalytics('editor', ['analytics:read'], { analytics: { read: true } }), true);
    assert.equal(canReadAnalytics('editor', [], { analytics: { read: true } }), false);
    assert.equal(canReadAnalytics('siteadmin', ['analytics:read'], { analytics: { read: false } }), false);
    let calls = 0;
    const gateway = createAnalyticsGateway({ role: 'editor', scopes: [], capabilities: { analytics: { read: true } }, call: async () => { calls++; return { data: validOverview, etag: null }; } });
    await assert.rejects(gateway.overview(validRange));
    assert.equal(calls, 0);
});

test('gateway returns zero results and preserves incomplete history', async () => {
    const empty = { ...validOverview, period: { ...validOverview.period, complete: false }, totals: { page_views: 0, article_views: 0, box_appearances: 0 }, series: validOverview.series.map(row => ({ ...row, page_views: 0, article_views: 0, box_appearances: 0 })), top_pages: [], top_articles: [], top_boxes: [] };
    const gateway = createAnalyticsGateway({ role: 'siteadmin', scopes: ['analytics:read'], capabilities: { analytics: { read: true } }, call: async () => ({ data: empty, etag: null }) });
    assert.deepEqual(await gateway.overview(validRange), empty);
});

import { analyticsBlockers } from '../src/lib/server/analytics.ts';
test('analytics blockers distinguish disabled site capability from missing key scope', () => {
    assert.deepEqual(analyticsBlockers('editor', ['analytics:read'], { analytics: { read: true } }), []);
    assert.deepEqual(analyticsBlockers('editor', ['analytics:read'], {}), ['disabled']);
    assert.deepEqual(analyticsBlockers('editor', ['articles:read'], { analytics: { read: true } }), ['scope']);
    assert.deepEqual(analyticsBlockers('siteadmin', [], {}), ['disabled', 'scope']);
});

test('overview keeps the split by language of WBengine 6.7 and never fails on a malformed split', () => {
    const split = [
        { locale: 'en', page_views: 3, article_views: 2, box_appearances: 0 },
        { locale: 'cs', page_views: 2, article_views: 1, box_appearances: 0 },
        { locale: null, page_views: 10, article_views: 0, box_appearances: 0 },
    ];
    const valid = validateAnalyticsOverview({ ...validOverview, per_locale: true, by_locale: split }, validRange);
    assert.equal(valid.per_locale, true);
    assert.deepEqual(valid.by_locale, split);
    // Anything unexpected drops the split, the rest of the overview is still shown.
    for (const bad of [[{ locale: 'x"><script>', page_views: 1, article_views: 0, box_appearances: 0 }], [{ locale: 'en', page_views: -1, article_views: 0, box_appearances: 0 }], 'not a list', Array.from({ length: 51 }, () => split[0]), [{ locale: 5, page_views: 1, article_views: 0, box_appearances: 0 }]]) {
        const dropped = validateAnalyticsOverview({ ...validOverview, per_locale: true, by_locale: bad }, validRange);
        assert.deepEqual(dropped.by_locale, []);
        assert.deepEqual(dropped.totals, validOverview.totals);
    }
    // A site that does not record languages says so and has no split.
    const none = validateAnalyticsOverview({ ...validOverview, per_locale: false, by_locale: split }, validRange);
    assert.equal(none.per_locale, false);
    assert.deepEqual(none.by_locale, []);
    // A site older than 6.7 sends neither field: the result has neither.
    assert.equal('per_locale' in validateAnalyticsOverview(validOverview, validRange), false);
});
