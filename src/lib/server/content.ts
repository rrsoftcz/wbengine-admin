import { apiCall, RemoteFailure } from './remote.ts';
import { resources, type Resource, type ApiCall, type ApiReply, type Operation } from './api-contract.ts';
import { schemas, translationFields } from '../content-schema.ts';
import { transaction, rows } from './db.ts';
import { requireSite, vault, type Session } from './auth.ts';
import { createAnalyticsGateway } from './analytics.ts';
export { resources, RemoteFailure };
export type { Resource };
export type Role = 'editor' | 'siteadmin' | 'global';
export type Capabilities = Record<string, {
    read?: boolean;
    write?: boolean;
}>;
export interface BoxType {
    type: string;
    settings: Record<string, string[]>;
    sections: string[];
}
export function resourceName(value: string): Resource {
    if (!resources.includes(value as Resource))
        throw Error('Neznámý obsah');
    return value as Resource;
}
export function siteId(value: string) {
    if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value)))
        throw Error('Neplatný web');
    return Number(value);
}
export function canOperate(role: Role, scopes: string[], caps: Capabilities, action: string, r: Resource) {
    const writing = ['save', 'delete', 'publish', 'restore', 'structureRestore', 'translationSave', 'translationDelete', 'upload'].includes(action), access = writing ? 'write' : 'read';
    if (role === 'editor' && (action === 'publish' || action === 'delete' || action === 'structureRestore' || writing && !['articles', 'images'].includes(r)))
        return false;
    const required = [`${r}:${access}`];
    if (action.startsWith('translation'))
        required.push(`translations:${access}`);
    if (action === 'publish')
        required.push('publish:write');
    if (action === 'preview')
        required.push('preview:read');
    return required.every(scope => {
        const [name, mode] = scope.split(':');
        return scopes.includes(scope) && caps[name]?.[mode as 'read' | 'write'] === true;
    });
}
export interface ReferenceOption {
    value: number;
    label: string;
    link?: string;
}
/** Pole s číselným ID jiného záznamu: z kterého seznamu se nabízí volba a jak se popisuje. */
export const referenceFields: Partial<Record<Resource, Record<string, { source: Resource; zero?: string }>>> = {
    articles: { site_id: { source: 'pages', zero: 'Zatím nevybráno (článek nepůjde publikovat)' } },
    pages: { parent_id: { source: 'pages', zero: 'Žádná (kořen)' } },
    menu: { site_id: { source: 'pages', zero: 'Zatím nevybráno' }, parent: { source: 'menu', zero: 'Žádná (kořen)' } },
    boxes: { section_id: { source: 'sections', zero: 'Zatím nevybráno' } }
};
function optionLabel(source: Resource, row: Record<string, unknown>): string {
    const text = (v: unknown) => typeof v === 'string' ? v.slice(0, 120) : '';
    if (source === 'pages')
        return `${text(row.title) || 'Bez názvu'} (${text(row.link) || '?'})`;
    if (source === 'sections')
        return text(row.title) ? `${text(row.title)} (${text(row.key)})` : text(row.key) || 'Bez názvu';
    return text(row.name) || text(row.title) || 'Bez názvu';
}
/**
 * Načte možnosti pro pole odkazující na jiné záznamy. Při chybě nebo nedostupnosti vrací null a pole
 * zůstane číselné. Dotazuje se jen po stránkách po 100 záznamech, nejvýše 5 stránek.
 */
export async function loadReferenceOptions(gateway: Pick<ReturnType<typeof createContentGateway>, 'list'>, source: Resource, excludeId?: string): Promise<ReferenceOption[] | null> {
    const found: ReferenceOption[] = [];
    try {
        for (let page = 1; page <= 5; page++) {
            const reply = await gateway.list(source, page, 100);
            if (!Array.isArray(reply.data))
                return null;
            for (const row of reply.data as Record<string, unknown>[]) {
                const id = Number(row?.[({ pages: 'site_id', menu: 'menu_id', sections: 'section_id' } as Record<string, string>)[source] ?? 'id']);
                if (Number.isSafeInteger(id) && id > 0 && String(id) !== excludeId)
                    found.push({ value: id, label: optionLabel(source, row), ...(source === 'pages' && typeof row.link === 'string' ? { link: row.link } : {}) });
            }
            if (!reply.pagination || page >= reply.pagination.total_pages)
                break;
        }
    }
    catch {
        return null;
    }
    return found;
}
/** Rozumná výchozí stránka pro nový záznam: první, která není kořen "/", jinak první. */
export function defaultPageOption(options: ReferenceOption[]): number {
    const pick = options.find(o => o.link !== '/') ?? options[0];
    return pick?.value ?? 0;
}
export function parseFields(r: Resource, f: FormData, translation = false, boxTypes: BoxType[] = []) {
    const output: Record<string, unknown> = {};
    for (const spec of schemas[r]) {
        if (translation && !translationFields[r]?.includes(spec.name))
            continue;
        const raw = f.get(spec.name);
        // Nezaškrtnutý přepínač prohlížeč do formuláře neposílá: u ukládání celého záznamu to znamená 0.
        if (spec.kind === 'boolean' && raw === null && !translation) {
            output[spec.name] = 0;
            continue;
        }
        if (typeof raw !== 'string')
            continue;
        if (spec.max && Buffer.byteLength(raw) > spec.max)
            throw Error(`Pole ${spec.label} je příliš dlouhé`);
        if (spec.kind === 'number' || spec.kind === 'boolean') {
            if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)))
                throw Error(`Neplatné pole ${spec.label}`);
            output[spec.name] = Number(raw);
        }
        else if (spec.kind === 'format') {
            if (raw === 'markdown')
                output.content_format = 'markdown';
            else if (raw !== 'legacy_html')
                throw Error('Neplatný formát');
        }
        else if (spec.kind === 'ids') {
            output[spec.name] = raw.trim() ? raw.split(',').map(x => {
                if (!/^[1-9][0-9]*$/.test(x.trim()))
                    throw Error('Neplatné ID stránky');
                return Number(x.trim());
            }) : [];
        }
        else if (spec.kind === 'json') {
            const value = JSON.parse(raw || '{}');
            if (!value || Array.isArray(value) || typeof value !== 'object')
                throw Error('Nastavení musí být objekt');
            output[spec.name] = value;
        }
        else
            output[spec.name] = raw;
    }
    if (r === 'boxes') {
        const type = boxTypes.find(x => x.type === output.type);
        if (!type)
            throw Error('Typ boxu není registrovaný');
        const settings: Record<string, string> = {};
        for (const [name, values] of Object.entries(type.settings)) {
            const value = f.get('setting_' + name);
            if (typeof value === 'string' && value) {
                if (!values.includes(value))
                    throw Error('Nepovolené nastavení boxu');
                settings[name] = value;
            }
        }
        output.settings = settings;
    }
    return output;
}
interface GatewayOptions {
    role: Role;
    scopes: string[];
    capabilities: Capabilities;
    call: (call: ApiCall) => Promise<ApiReply>;
}
export function createContentGateway(options: GatewayOptions) {
    const check = (action: string, r: Resource) => {
        if (!canOperate(options.role, options.scopes, options.capabilities, action, r))
            throw new RemoteFailure(403, 'forbidden');
    };
    return {
        ...options,
        list(r: Resource, page = 1, perPage?: number) {
            check('read', r);
            return options.call({ operation: 'list', resource: r, page, ...(perPage ? { perPage } : {}) });
        },
        get(r: Resource, id: string) {
            check('read', r);
            return options.call({ operation: 'get', resource: r, id });
        },
        save(r: Resource, id: string | null, data: Record<string, unknown>, etag?: string) {
            check('save', r);
            return options.call({ operation: id ? 'update' : 'create', resource: r, id: id ?? undefined, data, etag });
        },
        remove(r: Resource, id: string, etag: string) {
            check('delete', r);
            return options.call({ operation: 'delete', resource: r, id, etag });
        },
        history(r: Resource, id: string, page = 1) {
            check('read', r);
            return options.call({ operation: r === 'articles' ? 'revisions' : 'changes', resource: r, id, page });
        },
        restore(r: Resource, id: string, changeId: string, etag: string) {
            check(r === 'articles' ? 'restore' : 'structureRestore', r);
            if (!/^[1-9][0-9]*$/.test(changeId))
                throw Error('Neplatná revize');
            return options.call({ operation: r === 'articles' ? 'restore' : 'structureRestore', resource: r, id, etag, data: r === 'articles' ? { revision_id: Number(changeId) } : { change_id: Number(changeId) } });
        },
        publish(id: string, etag: string) {
            check('publish', 'articles');
            return options.call({ operation: 'publish', resource: 'articles', id, etag, data: {} });
        },
        preview(id: string, locale?: string) {
            check('preview', 'articles');
            return options.call({ operation: 'preview', resource: 'articles', id, locale });
        },
        translation(r: Resource, id: string, locale: string) {
            check('translationGet', r);
            return options.call({ operation: 'translationGet', resource: r, id, locale });
        },
        saveTranslation(r: Resource, id: string, locale: string, data: Record<string, unknown> | null, etag: string) {
            check(data ? 'translationSave' : 'translationDelete', r);
            return options.call({ operation: data ? 'translationSave' : 'translationDelete', resource: r, id, locale, etag, data: data ?? undefined });
        },
        image(id: string) {
            check('read', 'images');
            return options.call({ operation: 'imageContent', resource: 'images', id });
        },
        upload(data: Record<string, unknown>) {
            check('upload', 'images');
            return options.call({ operation: 'create', resource: 'images', data });
        }
    };
}
export interface ContentFormFailure {
    site: {
        id: number;
        name: string;
    };
    role: Role;
    resource: Resource;
    id: string;
    action: 'save' | 'translationSave';
    fields: Record<string, string>;
}
/** Contains only locally authorized display metadata, never credentials or the original error. */
export class ContentConnectionFailure extends RemoteFailure {
    site: {
        id: number;
        name: string;
    };
    role: Role;
    constructor(site: {
        id: number;
        name: string;
    }, role: Role, cause: unknown) {
        super(cause instanceof RemoteFailure ? cause.status : 503, 'content_unavailable');
        this.site = { id: site.id, name: site.name };
        this.role = role;
    }
}
export async function connectContent(s: Session, id: number): Promise<{
    site: { id: number; name: string };
    boxTypes: BoxType[];
    gateway: ReturnType<typeof createContentGateway>;
    analytics?: ReturnType<typeof createAnalyticsGateway>;
}> {
    const site = await transaction(async (c) => {
        try {
            await requireSite(c, s, id, 'read');
        }
        catch (cause) {
            if (cause instanceof Error && cause.message === 'Chybí oprávnění k webu')
                throw new RemoteFailure(403, 'forbidden');
            throw cause;
        }
        const [site] = await rows<{
            name: string;
            base_url: string;
            key_cipher: string;
            role: Role;
        }>(c, 'SELECT s.name,s.base_url,s.key_cipher,g.role FROM sites s LEFT JOIN grants g ON g.site_id=s.id AND g.user_id=? WHERE s.id=?', [s.user.id, id]);
        if (!site)
            throw new RemoteFailure(404, 'not_found');
        return site;
    });
    const role: Role = s.user.globalAdmin ? 'global' : site.role;
    try {
        const key = vault().decrypt(site.key_cipher, `site:${id}`), allowed = (process.env.REMOTE_IP_ALLOWLIST ?? '').split(',').filter(Boolean);
        const call = (request: ApiCall) => apiCall(site.base_url, request, key, allowed, undefined, `admin:${s.user.id}`);
        const [discovery, identity] = await Promise.all([call({ operation: 'capabilities' }), call({ operation: 'identity' })]);
        const caps = discovery.data as {
            api_version?: string;
            capabilities: Capabilities;
            box_types?: BoxType[];
        }, user = identity.data as {
            scopes?: unknown;
        };
        if (caps.api_version !== '2.0' || !caps.capabilities || !Array.isArray(user.scopes) || !user.scopes.every(x => typeof x === 'string'))
            throw Error('Neplatná discovery odpověď');
        const scopes = user.scopes as string[];
        if (!scopes.includes('discovery:read'))
            throw new RemoteFailure(403, 'forbidden');
        const gatewayOptions = { role, scopes, capabilities: caps.capabilities, call };
        return { site: { id, name: site.name }, boxTypes: projectBoxTypes(caps.box_types), gateway: createContentGateway(gatewayOptions), analytics: createAnalyticsGateway(gatewayOptions) };
    }
    catch (cause) {
        throw new ContentConnectionFailure({ id, name: site.name }, role, cause);
    }
}
function projectBoxTypes(raw: unknown): BoxType[] {
    if (!Array.isArray(raw))
        return [];
    return raw.filter(x => x && typeof x.type === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,44}$/.test(x.type) && x.settings && typeof x.settings === 'object' && Array.isArray(x.sections)).map(x => ({ type: x.type, settings: Object.fromEntries(Object.entries(x.settings).filter(([name, value]) => /^[a-z][a-z0-9_]{0,44}$/.test(name) && Array.isArray(value) && value.every(v => typeof v === 'string'))) as Record<string, string[]>, sections: x.sections.filter((v: unknown) => typeof v === 'string') }));
}
export function renderPreviewDocument(value: {
    title: string;
    introtext: string;
    bodytext: string;
    private?: boolean;
}) {
    const title = value.title.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
    return `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; sandbox"><title>${title}</title><style>body{max-width:75ch;margin:2rem auto;font:17px/1.6 system-ui;overflow-wrap:anywhere}pre{white-space:pre-wrap}</style></head><body><h1>${title}</h1>${value.introtext}${value.bodytext}</body></html>`;
}
