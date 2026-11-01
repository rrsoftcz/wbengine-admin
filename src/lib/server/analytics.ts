import { RemoteFailure, type ApiCall, type ApiReply } from './api-contract.ts';
import type { Capabilities, Role } from './content.ts';

export type AnalyticsGranularity = 'day' | 'week' | 'month';
export interface AnalyticsRange { from: string; to: string; granularity: AnalyticsGranularity }
export interface AnalyticsCounts { page_views: number; article_views: number; box_appearances: number }
export interface AnalyticsSeriesPoint extends AnalyticsCounts { period_start: string }
/** The period of one language. A null locale is the views counted before the site recorded languages. */
export interface AnalyticsLocaleRow extends AnalyticsCounts { locale: string | null }
export interface AnalyticsOverview {
    timezone: string;
    period: AnalyticsRange & { complete: boolean };
    totals: AnalyticsCounts;
    lifetime_totals: AnalyticsCounts;
    series: AnalyticsSeriesPoint[];
    top_pages: { id: number; title: string; views: number }[];
    top_articles: { id: number; title: string; views: number }[];
    top_boxes: { id: number; name: string; appearances: number }[];
    /** Present when the site is WBengine 6.7 or newer: whether it records views per language, and the split. */
    per_locale?: boolean;
    by_locale?: AnalyticsLocaleRow[];
}
interface AnalyticsOptions {
    role: Role;
    scopes: string[];
    capabilities: Capabilities;
    call: (call: ApiCall) => Promise<ApiReply>;
}

const dayMs = 86400000;
function isoDate(value: unknown): value is string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function dateMs(value: string): number { return Date.parse(`${value}T00:00:00.000Z`); }
function formatDate(value: number): string { return new Date(value).toISOString().slice(0, 10); }
function assertRange(value: AnalyticsRange): AnalyticsRange {
    if (!value || !isoDate(value.from) || !isoDate(value.to) || !['day', 'week', 'month'].includes(value.granularity) || dateMs(value.to) < dateMs(value.from) || (dateMs(value.to) - dateMs(value.from)) / dayMs >= 62)
        throw Error('Invalid analytics period');
    return value;
}
export function parseAnalyticsRange(params: URLSearchParams, now: Date = new Date()): AnalyticsRange {
    if (!(params instanceof URLSearchParams) || !Number.isFinite(now.getTime())) throw Error('Invalid analytics period');
    const keys = [...params.keys()];
    if (keys.some((key, index) => !['from', 'to', 'granularity'].includes(key) || keys.indexOf(key) !== index)) throw Error('Invalid analytics parameters');
    const today = formatDate(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const to = params.get('to') ?? formatDate(dateMs(today) - dayMs);
    const from = params.get('from') ?? formatDate(dateMs(to) - 29 * dayMs);
    const granularity = params.get('granularity') ?? 'day';
    return assertRange({ from, to, granularity: granularity as AnalyticsGranularity });
}
function isObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function count(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
function counts(value: unknown): value is AnalyticsCounts {
    return isObject(value) && count(value.page_views) && count(value.article_views) && count(value.box_appearances);
}
/** The split by language is optional detail: anything unexpected in it drops the split, it never fails the overview. */
function localeRows(value: unknown): AnalyticsLocaleRow[] {
    if (!Array.isArray(value) || value.length > 50) return [];
    const rows: AnalyticsLocaleRow[] = [];
    for (const item of value) {
        if (!isObject(item) || !counts(item)) return [];
        if (item.locale !== null && (typeof item.locale !== 'string' || !/^[A-Za-z]{2,3}([_-][A-Za-z0-9]{2,5})?$/.test(item.locale))) return [];
        rows.push({ locale: item.locale as string | null, page_views: item.page_views, article_views: item.article_views, box_appearances: item.box_appearances });
    }
    return rows;
}
function validTimezone(value: unknown): value is string {
    if (typeof value !== 'string' || value.length > 100) return false;
    try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
}
function expectedPeriods(range: AnalyticsRange): string[] {
    let cursor = dateMs(range.from), end = dateMs(range.to), step = dayMs;
    if (range.granularity === 'week') {
        const weekday = (new Date(cursor).getUTCDay() + 6) % 7;
        cursor -= weekday * dayMs;
        end -= ((new Date(end).getUTCDay() + 6) % 7) * dayMs;
        step = 7 * dayMs;
    } else if (range.granularity === 'month') {
        const a = new Date(cursor), b = new Date(end);
        cursor = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 1);
        end = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 1);
    }
    const result: string[] = [];
    while (cursor <= end) {
        result.push(formatDate(cursor));
        if (range.granularity === 'month') {
            const date = new Date(cursor);
            cursor = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
        } else cursor += step;
    }
    return result;
}
function validTop(value: unknown, nameKey: 'title' | 'name', countKey: 'views' | 'appearances'): boolean {
    return Array.isArray(value) && value.length <= 10 && value.every(item => isObject(item) && Number.isSafeInteger(item.id) && (item.id as number) > 0 && typeof item[nameKey] === 'string' && Buffer.byteLength(item[nameKey] as string) <= 255 && count(item[countKey]));
}
export function validateAnalyticsOverview(value: unknown, expected: AnalyticsRange): AnalyticsOverview {
    const range = assertRange(expected);
    if (!isObject(value) || !validTimezone(value.timezone) || !isObject(value.period) || value.period.from !== range.from || value.period.to !== range.to || value.period.granularity !== range.granularity || typeof value.period.complete !== 'boolean' || !counts(value.totals) || !counts(value.lifetime_totals) || !Array.isArray(value.series) || !validTop(value.top_pages, 'title', 'views') || !validTop(value.top_articles, 'title', 'views') || !validTop(value.top_boxes, 'name', 'appearances'))
        throw Error('Invalid analytics response');
    const periods = expectedPeriods(range);
    if (value.series.length !== periods.length) throw Error('Incomplete analytics time series');
    const safe = value as unknown as AnalyticsOverview;
    const totals: AnalyticsCounts = { page_views: 0, article_views: 0, box_appearances: 0 };
    for (let i = 0; i < periods.length; i++) {
        const point = safe.series[i];
        if (!isObject(point) || point.period_start !== periods[i] || !counts(point)) throw Error('Invalid analytics time series');
        totals.page_views += point.page_views;
        totals.article_views += point.article_views;
        totals.box_appearances += point.box_appearances;
    }
    if (totals.page_views !== safe.totals.page_views || totals.article_views !== safe.totals.article_views || totals.box_appearances !== safe.totals.box_appearances) throw Error('Analytics totals do not match the time series');
    return {
        timezone: safe.timezone,
        period: { from: range.from, to: range.to, granularity: range.granularity, complete: safe.period.complete },
        totals: { page_views: safe.totals.page_views, article_views: safe.totals.article_views, box_appearances: safe.totals.box_appearances },
        lifetime_totals: { page_views: safe.lifetime_totals.page_views, article_views: safe.lifetime_totals.article_views, box_appearances: safe.lifetime_totals.box_appearances },
        series: periods.map((period_start, i) => {
            const point = safe.series[i];
            return { period_start, page_views: point.page_views, article_views: point.article_views, box_appearances: point.box_appearances };
        }),
        top_pages: safe.top_pages.map(item => ({ id: item.id, title: item.title, views: item.views })),
        top_articles: safe.top_articles.map(item => ({ id: item.id, title: item.title, views: item.views })),
        top_boxes: safe.top_boxes.map(item => ({ id: item.id, name: item.name, appearances: item.appearances })),
        ...(typeof value.per_locale === 'boolean' ? { per_locale: value.per_locale, by_locale: value.per_locale ? localeRows(value.by_locale) : [] } : {}),
    } as AnalyticsOverview;
}
export function canReadAnalytics(role: Role, scopes: string[], capabilities: Capabilities): boolean {
    return ['editor', 'siteadmin', 'global'].includes(role) && scopes.includes('analytics:read') && capabilities.analytics?.read === true;
}
export type AnalyticsBlocker = 'disabled' | 'scope';
/** Reasons why analytics is not readable, from already loaded discovery and identity data (no further calls). */
export function analyticsBlockers(role: Role, scopes: string[], capabilities: Capabilities): AnalyticsBlocker[] {
    const blockers: AnalyticsBlocker[] = [];
    if (capabilities.analytics?.read !== true) blockers.push('disabled');
    if (!['editor', 'siteadmin', 'global'].includes(role) || !scopes.includes('analytics:read')) blockers.push('scope');
    return blockers;
}
export function createAnalyticsGateway(options: AnalyticsOptions) {
    return {
        supported() { return options.capabilities.analytics?.read === true; },
        blockers() { return analyticsBlockers(options.role, options.scopes, options.capabilities); },
        canRead() { return canReadAnalytics(options.role, options.scopes, options.capabilities); },
        async overview(input: AnalyticsRange): Promise<AnalyticsOverview> {
            if (!this.canRead()) throw new RemoteFailure(403, 'forbidden');
            const range = assertRange(input);
            const reply = await options.call({ operation: 'analyticsOverview', ...range });
            return validateAnalyticsOverview(reply.data, range);
        },
    };
}
