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
/** Closed catalog of API v2 error codes with English messages. Any other code is never shown. */
export const errorMessages: Record<string, string> = {
    missing_site: 'Select the page the article is shown on and try again.',
    article_site_conflict: 'Another article is already shown on the selected page. Select a different page.',
    missing_field: 'A required field is missing. Fill in all required fields and try again.',
    invalid_field: 'The form contains a field the site does not support.',
    invalid_body: 'The site did not accept the submitted data. Reload the page and try again.',
    invalid_format: 'New content must be in Markdown format.',
    format_replacement_required: 'The original text is in the old HTML format. To publish, replace it with Markdown (both the intro and the full text).',
    invalid_link: 'The page link must be a local address starting with a slash, for example /about/.',
    duplicate_link: 'A page with this link already exists. Choose a different link.',
    invalid_key: 'The section key may contain lowercase letters, digits and underscores and must start with a letter.',
    duplicate_key: 'A section with this key already exists. Choose a different key.',
    invalid_name: 'The name has an invalid length or content.',
    invalid_status: 'The section error status must be 0 or an HTTP error from 400.',
    invalid_parent: 'The parent item is invalid. An item cannot be its own parent.',
    invalid_source: 'The source must not contain control characters or line breaks.',
    invalid_box_type: 'This box type is not registered on the site.',
    invalid_box_section: 'This box type cannot be used in the selected section.',
    invalid_box_settings: 'The box settings contain an unsupported value.',
    invalid_locale: 'The translation language is invalid.',
    invalid_id: 'The record identifier is invalid.',
    invalid_resource: 'This kind of content does not support the requested operation.',
    invalid_recovery: 'This kind of content does not support translation restore.',
    invalid_pagination: 'The list pagination is invalid.',
    invalid_image: 'The image is corrupted or has an invalid format.',
    unsupported_image: 'Only PNG, JPEG and WebP images are supported.',
    image_too_large: 'The image is too large. Maximum 512 KiB.',
    image_storage_unconfigured: 'Image storage is not configured on the site.',
    image_storage_unavailable: 'Image storage on the site is currently unavailable.',
    no_draft: 'The article has no draft to publish.',
    draft_too_large: 'The draft is too large.',
    body_too_large: 'The submitted data is too large.',
    resource_in_use: 'The record cannot be removed because other records refer to it. Remove the dependent items first.',
    precondition_failed: 'The content has changed in the meantime. Your edits have been kept.',
    precondition_required: 'The content version is missing. Reload it.',
    not_found: 'The record was not found.',
    forbidden: 'Missing permission or scope.',
    rate_limited: 'Too many requests. Try again in a moment.',
    unavailable: 'The site API is temporarily unavailable. Try again later.'
};
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
        super(status === 412 ? 'The content has changed in the meantime. Your edits have been kept.' : status === 428 ? 'The content version is missing. Reload it.' : status === 403 ? 'Missing permission or scope.' : status === 404 ? 'The record was not found.' : Object.hasOwn(errorMessages, code) ? errorMessages[code] : status === 409 ? 'The operation conflicts with the current state or dependencies.' : 'The remote API rejected the request.');
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
