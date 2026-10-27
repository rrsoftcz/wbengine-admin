export const resources = ['articles', 'pages', 'menu', 'sections', 'boxes', 'images'] as const;
export type Resource = typeof resources[number];
export type Operation = 'capabilities' | 'identity' | 'list' | 'get' | 'create' | 'update' | 'delete' | 'revisions' | 'restore' | 'publish' | 'preview' | 'changes' | 'structureRestore' | 'translationGet' | 'translationSave' | 'translationDelete' | 'imageContent' | 'analyticsOverview';
export interface ApiCall {
    operation: Operation;
    resource?: Resource;
    id?: string;
    locale?: string;
    page?: number;
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
export class RemoteFailure extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string) {
        super(status === 412 ? 'Obsah se mezitím změnil. Vaše úpravy zůstaly zachovány.' : status === 428 ? 'Chybí verze obsahu. Načtěte jej znovu.' : status === 403 ? 'Chybí oprávnění nebo scope.' : status === 404 ? 'Záznam nebyl nalezen.' : status === 409 ? 'Operace koliduje s aktuálním stavem nebo vazbami.' : 'Vzdálené API požadavek odmítlo.');
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
            throw Error('Neplatné období analytiky');
        return { path: `analytics/overview?from=${encodeURIComponent(call.from)}&to=${encodeURIComponent(call.to)}&granularity=${encodeURIComponent(call.granularity!)}`, method: 'GET' };
    }
    if (!resources.includes(r as Resource))
        throw Error('Nepovolený prostředek');
    const id = call.id;
    const paged = () => {
        const page = call.page ?? 1;
        if (!Number.isInteger(page) || page < 1 || page > 1000000)
            throw Error('Neplatná stránka');
        return `?page=${page}&per_page=25`;
    };
    if (op === 'list')
        return { path: r + paged(), method: 'GET' };
    if (op === 'create') {
        if (!call.data || Array.isArray(call.data))
            throw Error('Chybí data');
        return { path: r!, method: 'POST', data: call.data };
    }
    if (r === 'images' ? !/^[a-f0-9]{32}$/.test(id ?? '') : !/^[1-9][0-9]{0,9}$/.test(id ?? '') || Number(id) > 2147483647)
        throw Error('Neplatné ID');
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
            throw Error('Neplatný jazyk');
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
            throw Error('Nepovolený překlad');
        path = `translations/${entity}/${id}/${call.locale}`;
        method = op === 'translationGet' ? 'GET' : op === 'translationSave' ? 'PUT' : 'DELETE';
        if (method === 'GET')
            return { path, method };
    }
    else
        throw Error('Nepovolená operace');
    if (!strongEtag(call.etag))
        throw new RemoteFailure(428, 'precondition_required');
    return { path, method, etag: call.etag, ...(method === 'DELETE' ? {} : { data: call.data ?? {} }) };
}
function isIsoDate(value: unknown): value is string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
