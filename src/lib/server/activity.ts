import { RemoteFailure, type ApiCall, type ApiReply } from './api-contract.ts';
import type { Capabilities, Role } from './content.ts';

export const activityPerPage = 25;
export const feedSources = ['v2', 'v1', 'cli'] as const;
export type FeedSource = (typeof feedSources)[number];
export type FeedOutcome = 'applied' | 'rejected';

export interface FeedQuery { outcome: FeedOutcome; resource: string | null; source: FeedSource | null; page: number }
export interface AppliedChange {
    change_id: number;
    created_at: number;
    resource: string;
    resource_id: string;
    action: string;
    source: string;
    actor: string | null;
    integration_id: number | null;
    local_user_id: number | null;
}
export interface RejectedWrite {
    audit_id: number;
    created_at: number;
    action: string;
    outcome: string;
    detail: string | null;
    actor: string | null;
}
export interface FeedPage<T> { items: T[]; page: number; perPage: number; total: number; totalPages: number }

/** Parses and bounds the filters of the Activity page; anything unknown is ignored, never passed on. */
export function parseFeedQuery(params: URLSearchParams): FeedQuery {
    const resource = params.get('resource'), source = params.get('source'), page = Number(params.get('page'));
    return {
        outcome: params.get('outcome') === 'rejected' ? 'rejected' : 'applied',
        resource: resource && /^[a-z_]{1,32}$/.test(resource) ? resource : null,
        source: (feedSources as readonly string[]).includes(source ?? '') ? source as FeedSource : null,
        page: Number.isInteger(page) && page > 0 ? Math.min(page, 1000000) : 1
    };
}

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const maybeText = (value: unknown, max: number) => value === null || value === undefined || text(value, max);
const maybeCount = (value: unknown) => value === null || value === undefined || count(value);

function appliedChange(value: unknown): AppliedChange {
    if (!isObject(value) || !count(value.change_id) || !count(value.created_at) || !text(value.resource, 32) || !text(value.resource_id, 64) || !text(value.action, 64) || !maybeText(value.actor, 128) || !maybeCount(value.integration_id) || !maybeCount(value.local_user_id))
        throw Error('Invalid change entry');
    return {
        change_id: value.change_id, created_at: value.created_at, resource: value.resource, resource_id: value.resource_id, action: value.action,
        source: typeof value.source === 'string' && (feedSources as readonly string[]).includes(value.source) ? value.source : 'v2',
        actor: (value.actor as string | null | undefined) ?? null, integration_id: (value.integration_id as number | null | undefined) ?? null, local_user_id: (value.local_user_id as number | null | undefined) ?? null
    };
}
function rejectedWrite(value: unknown): RejectedWrite {
    if (!isObject(value) || !count(value.audit_id) || !count(value.created_at) || !text(value.action, 64) || !text(value.outcome, 64) || !maybeText(value.detail, 128) || !maybeText(value.actor, 128))
        throw Error('Invalid audit entry');
    return { audit_id: value.audit_id, created_at: value.created_at, action: value.action, outcome: value.outcome, detail: (value.detail as string | null | undefined) ?? null, actor: (value.actor as string | null | undefined) ?? null };
}

/** Validates one page of the remote feed: bounded sizes and types, nothing else is kept. */
export function validateFeed<T>(reply: unknown, pagination: unknown, entry: (value: unknown) => T): FeedPage<T> {
    if (!Array.isArray(reply) || reply.length > 100 || !isObject(pagination) || !count(pagination.page) || !count(pagination.per_page) || !count(pagination.total) || !count(pagination.total_pages))
        throw Error('Invalid activity response');
    return { items: reply.map(entry), page: pagination.page, perPage: pagination.per_page, total: pagination.total, totalPages: Math.max(1, pagination.total_pages) };
}

export function canReadActivity(role: Role, scopes: string[], capabilities: Capabilities): boolean {
    // Who edited what is for site administrators only, and needs the key to carry the scope.
    return ['siteadmin', 'global'].includes(role) && scopes.includes('audit:read') && capabilities.audit?.read === true;
}

interface ActivityOptions { role: Role; scopes: string[]; capabilities: Capabilities; call: (call: ApiCall) => Promise<ApiReply> }
export function createActivityGateway(options: ActivityOptions) {
    return {
        canRead() { return canReadActivity(options.role, options.scopes, options.capabilities); },
        /** True when the site API offers the feed and the role may read it, but the key lacks the scope (rotate the key). */
        needsNewKey() { return ['siteadmin', 'global'].includes(options.role) && options.capabilities.audit?.read === true && !options.scopes.includes('audit:read'); },
        async applied(query: FeedQuery): Promise<FeedPage<AppliedChange>> {
            if (!this.canRead()) throw new RemoteFailure(403, 'forbidden');
            const reply = await options.call({ operation: 'activity', page: query.page, perPage: activityPerPage, feed: { outcome: 'applied', ...(query.resource ? { resource: query.resource } : {}), ...(query.source ? { source: query.source } : {}) } });
            return validateFeed(reply.data, reply.pagination, appliedChange);
        },
        async rejected(query: FeedQuery): Promise<FeedPage<RejectedWrite>> {
            if (!this.canRead()) throw new RemoteFailure(403, 'forbidden');
            const reply = await options.call({ operation: 'activity', page: query.page, perPage: activityPerPage, feed: { outcome: 'rejected' } });
            return validateFeed(reply.data, reply.pagination, rejectedWrite);
        }
    };
}
