import errorCatalog from '../i18n/en/errors.ts';
import type { MessageKey, Translate } from '../i18n/index.ts';
export const resources = ['articles', 'pages', 'menu', 'sections', 'boxes', 'images'] as const;
export type Resource = typeof resources[number];
export type Operation = 'capabilities' | 'identity' | 'list' | 'get' | 'create' | 'update' | 'delete' | 'revisions' | 'restore' | 'publish' | 'preview' | 'changes' | 'structureRestore' | 'translationGet' | 'translationSave' | 'translationDelete' | 'imageContent' | 'analyticsOverview';
export interface ApiCall {
    operation: Operation;
    resource?: Resource;
    id?: string;
    locale?: string;
    page?: number;
    perPage?: number;
    etag?: string;
    data?: Record<string, unknown>;
    from?: string;
    to?: string;
    granularity?: 'day' | 'week' | 'month';
}
export interface ApiReply {
    data: unknown;
    etag: string | null;
    pagination?: {
        page: number;
        per_page: number;
        total: number;
        total_pages: number;
    };
}
/**
 * Closed catalog of API v2 error codes. The texts live in the message catalog (`errors.<code>`); this is the English
 * source, used for the (never displayed) Error message. The UI translates through remoteMessageKey.
 */
const statusKeys = ['errors.remote_rejected', 'errors.status_conflict'];
export const errorMessages: Record<string, string> = Object.fromEntries(Object.entries(errorCatalog).filter(([key]) => !statusKeys.includes(key)).map(([key, text]) => [key.slice('errors.'.length), text]));
/** Catalog key of the message for a remote failure: by HTTP status first, then by error code, then a generic one. */
export function remoteMessageKey(status: number, code: string): MessageKey {
    const byStatus: Record<number, string> = { 412: 'precondition_failed', 428: 'precondition_required', 403: 'forbidden', 404: 'not_found' };
    if (byStatus[status])
        return `errors.${byStatus[status]}` as MessageKey;
    if (Object.hasOwn(errorMessages, code))
        return `errors.${code}` as MessageKey;
    return status === 409 ? 'errors.status_conflict' : 'errors.remote_rejected';
}
/** The user-facing, translated message of a remote failure (by status first, then by the closed error code). */
export function remoteMessage(t: Translate, failure: { status: number; code: string }): string {
    return t(remoteMessageKey(failure.status, failure.code));
}
/** The form field a given error code relates to (schema field name), so the editor can mark it. */
export const errorFields: Record<string, string> = {
    missing_site: 'site_id', article_site_conflict: 'site_id', invalid_link: 'link', duplicate_link: 'link', invalid_key: 'key', duplicate_key: 'key',
    invalid_name: 'name', invalid_status: 'return_error_code', invalid_parent: 'parent_id', invalid_source: 'source', invalid_box_type: 'type',
    invalid_box_section: 'section_id', invalid_box_settings: 'settings', invalid_format: 'content_format'
};
export const fieldOfError = (code: unknown): string | undefined => typeof code === 'string' && Object.hasOwn(errorFields, code) ? errorFields[code] : undefined;
/** Returns the code only if it is in the catalog, otherwise the generic rejection code. */
export function safeErrorCode(value: unknown): string {
    return typeof value === 'string' && Object.hasOwn(errorMessages, value) ? value : 'remote_rejected';
}
export class RemoteFailure extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string) {
        super((errorCatalog as Record<string, string>)[remoteMessageKey(status, code)]);
        this.status = status;
        this.code = code;
    }
}
export const strongEtag = (value: unknown): value is string => typeof value === 'string' && /^"[a-f0-9]{64}"$/.test(value);
export function planApiCall(call: ApiCall): {
    path: string;
    method: string;
    data?: Record<string, unknown>;
    etag?: string;
} {
    const { operation: op, resource: r } = call;
    if (op === 'capabilities' || op === 'identity')
        return { path: op, method: 'GET' };
    if (op === 'analyticsOverview') {
        if (!isIsoDate(call.from) || !isIsoDate(call.to) || !['day', 'week', 'month'].includes(call.granularity ?? '') || Date.parse(`${call.to}T00:00:00Z`) < Date.parse(`${call.from}T00:00:00Z`) || (Date.parse(`${call.to}T00:00:00Z`) - Date.parse(`${call.from}T00:00:00Z`)) / 86400000 >= 62)
            throw Error('Invalid analytics period');
        return { path: `analytics/overview?from=${encodeURIComponent(call.from)}&to=${encodeURIComponent(call.to)}&granularity=${encodeURIComponent(call.granularity!)}`, method: 'GET' };
    }
    if (!resources.includes(r as Resource))
        throw Error('Disallowed resource');
    const id = call.id;
    const paged = () => {
        const page = call.page ?? 1;
        if (!Number.isInteger(page) || page < 1 || page > 1000000)
            throw Error('Invalid page');
        const perPage = call.perPage ?? 25;
        if (!Number.isInteger(perPage) || perPage < 1 || perPage > 100)
            throw Error('Invalid page size');
        return `?page=${page}&per_page=${perPage}`;
    };
    if (op === 'list')
        return { path: r + paged(), method: 'GET' };
    if (op === 'create') {
        if (!call.data || Array.isArray(call.data))
            throw Error('Missing data');
        return { path: r!, method: 'POST', data: call.data };
    }
    if (r === 'images' ? !/^[a-f0-9]{32}$/.test(id ?? '') : !/^[1-9][0-9]{0,9}$/.test(id ?? '') || Number(id) > 2147483647)
        throw Error('Invalid ID');
    let path = `${r}/${id}`, method = 'GET';
    if (op === 'get')
        return { path, method };
    if (op === 'imageContent' && r === 'images')
        return { path: path + '/content', method };
    if (op === 'update' && r !== 'images')
        method = 'PATCH';
    else if (op === 'delete')
        method = 'DELETE';
    else if (op === 'revisions' && r === 'articles')
        return { path: path + '/revisions' + paged(), method };
    else if (op === 'changes' && r !== 'articles' && r !== 'images')
        return { path: path + '/changes' + paged(), method };
    else if (op === 'preview' && r === 'articles') {
        if (call.locale && !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(call.locale))
            throw Error('Invalid language');
        return { path: path + '/preview' + (call.locale ? '?locale=' + encodeURIComponent(call.locale) : ''), method };
    }
    else if ((op === 'publish' || op === 'restore') && r === 'articles') {
        path += '/' + op;
        method = 'POST';
    }
    else if (op === 'structureRestore' && r !== 'articles' && r !== 'images') {
        path += '/restore';
        method = 'POST';
    }
    else if (op === 'translationGet' || op === 'translationSave' || op === 'translationDelete') {
        const entity = ({ articles: 'article', pages: 'site', menu: 'menu' } as Record<string, string>)[r!];
        if (!entity || !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(call.locale ?? ''))
            throw Error('Disallowed translation');
        path = `translations/${entity}/${id}/${call.locale}`;
        method = op === 'translationGet' ? 'GET' : op === 'translationSave' ? 'PUT' : 'DELETE';
        if (method === 'GET')
            return { path, method };
    }
    else
        throw Error('Disallowed operation');
    if (!strongEtag(call.etag))
        throw new RemoteFailure(428, 'precondition_required');
    return { path, method, etag: call.etag, ...(method === 'DELETE' ? {} : { data: call.data ?? {} }) };
}
function isIsoDate(value: unknown): value is string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
