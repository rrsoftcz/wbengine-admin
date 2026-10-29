import { liveUrl } from '#lib/content-format.ts';
import { apiCall, RemoteFailure } from './remote.ts';
import { resources, type Resource, type ApiCall, type ApiReply, type Operation } from './api-contract.ts';
import { schemas, translationFields, idOf } from '../content-schema.ts';
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
        throw Error('Unknown content');
    return value as Resource;
}
export function siteId(value: string) {
    if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value)))
        throw Error('Invalid site');
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
/** Field holding the numeric ID of another record: which list offers the choice and how it is described. */
export const referenceFields: Partial<Record<Resource, Record<string, { source: Resource; zero?: string }>>> = {
    articles: { site_id: { source: 'pages', zero: 'Not selected yet (the article cannot be published)' } },
    pages: { parent_id: { source: 'pages', zero: 'None (root)' } },
    menu: { site_id: { source: 'pages', zero: 'Not selected yet' }, parent: { source: 'menu', zero: 'None (root)' } },
    boxes: { section_id: { source: 'sections', zero: 'Not selected yet' }, sites: { source: 'pages' } }
};
function optionLabel(source: Resource, row: Record<string, unknown>): string {
    const text = (v: unknown) => typeof v === 'string' ? v.slice(0, 120) : '';
    if (source === 'pages')
        return `${text(row.title) || 'Untitled'} (${text(row.link) || '?'})`;
    if (source === 'sections')
        return text(row.title) ? `${text(row.title)} (${text(row.key)})` : text(row.key) || 'Untitled';
    return text(row.name) || text(row.title) || 'Untitled';
}
/**
 * Loads the options for fields that refer to other records. On error or unavailability it returns null and the field
 * stays numeric. It queries in pages of 100 records, at most 5 pages.
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
/** Sensible default page for a new record: the first one that is not the root "/", otherwise the first. */
export function defaultPageOption(options: ReferenceOption[]): number {
    const pick = options.find(o => o.link !== '/') ?? options[0];
    return pick?.value ?? 0;
}
/**
 * Normalises a page link to the form the site uses: leading and trailing slash (/about/), the root stays "/".
 * With invalid characters it adds nothing, so the API validation decides.
 */
export function normalizePageLink(raw: string): string {
    const link = raw.trim();
    if (!link || link === '/' || !/^[\p{L}\p{N}_\-./~%]+$/u.test(link))
        return link;
    return (link.startsWith('/') ? '' : '/') + link + (link.endsWith('/') ? '' : '/');
}
/** Whether the site offers the article box type (story) and we may write boxes. */
export function offersArticleBox(gateway: Pick<ReturnType<typeof createContentGateway>, 'role' | 'scopes' | 'capabilities'>, boxTypes: BoxType[]): boolean {
    return gateway.capabilities.boxes?.write === true && canOperate(gateway.role, gateway.scopes, gateway.capabilities, 'save', 'boxes') && boxTypes.some(x => x.type === 'story' && x.sections.includes('central'));
}
/** Finds the ID of the section with the key central in the site's section list (at most 5 pages of 100 records). */
export async function findCentralSection(gateway: Pick<ReturnType<typeof createContentGateway>, 'list'>): Promise<number | null> {
    for (let page = 1; page <= 5; page++) {
        const reply = await gateway.list('sections', page, 100);
        if (!Array.isArray(reply.data))
            return null;
        const found = (reply.data as Record<string, unknown>[]).find(row => row?.key === 'central' && Number.isSafeInteger(Number(row.section_id)) && Number(row.section_id) > 0);
        if (found)
            return Number(found.section_id);
        if (!reply.pagination || page >= reply.pagination.total_pages)
            break;
    }
    return null;
}
/**
 * After a page is created, adds a box that renders articles on it. Never throws: the page already exists.
 * Returns 'skipped' (the site does not offer the box), 'created' or 'failed'.
 */
export async function createArticleBox(gateway: ReturnType<typeof createContentGateway>, boxTypes: BoxType[], pageId: number, pageTitle: string): Promise<'skipped' | 'created' | 'failed'> {
    if (!offersArticleBox(gateway, boxTypes))
        return 'skipped';
    try {
        const section = await findCentralSection(gateway);
        if (!section || !Number.isSafeInteger(pageId) || pageId < 1)
            return 'failed';
        await gateway.save('boxes', null, { name: ('Article: ' + pageTitle).slice(0, 100), type: 'story', settings: {}, section_id: section, static: 1, shared: 0, device_min: 1, device_strict: 0, order: 0, sites: [pageId] });
        return 'created';
    }
    catch {
        return 'failed';
    }
}
/** IDs of pages that have a box rendering articles. Null if it cannot be determined (the box is then not reported). */
export type BoxCoverage = { story: number[]; other: number[]; shared: boolean; sharedArticles: boolean };
/**
 * Pages covered by boxes. A box is known to display articles when it is a registered story box or when the site (WBengine 4.8
 * and later) flags it with renders_articles. Other boxes (for example a custom module that renders the article of its page
 * itself) are collected separately, because the site does not tell whether they show articles. A shared box appears on every
 * page of its section, so it is reported as a flag, and sharedArticles means such a box renders articles everywhere.
 */
export async function loadBoxCoverage(gateway: Pick<ReturnType<typeof createContentGateway>, 'list'>, boxTypes: BoxType[]): Promise<BoxCoverage | null> {
    const hasStory = boxTypes.some(x => x.type === 'story');
    const story = new Set<number>(), other = new Set<number>();
    let shared = false, sharedArticles = false, flagged = false;
    try {
        for (let page = 1; page <= 5; page++) {
            const reply = await gateway.list('boxes', page, 100);
            if (!Array.isArray(reply.data))
                return null;
            for (const row of reply.data as Record<string, unknown>[]) {
                if (!row || typeof row !== 'object')
                    continue;
                if ('renders_articles' in row)
                    flagged = true;
                const renders = row.type === 'story' || row.renders_articles === true;
                if (Number(row.shared) === 1) {
                    if (renders)
                        sharedArticles = true;
                    else
                        shared = true;
                }
                for (const site of Array.isArray(row.sites) ? row.sites : []) {
                    const id = Number(site && typeof site === 'object' ? (site as Record<string, unknown>).site_id ?? (site as Record<string, unknown>).id : site);
                    if (Number.isSafeInteger(id) && id > 0)
                        (renders ? story : other).add(id);
                }
            }
            if (!reply.pagination || page >= reply.pagination.total_pages)
                break;
        }
    }
    catch {
        return null;
    }
    return hasStory || flagged ? { story: [...story], other: [...other], shared, sharedArticles } : null;
}
export async function loadArticleBoxPages(gateway: Pick<ReturnType<typeof createContentGateway>, 'list'>, boxTypes: BoxType[]): Promise<number[] | null> {
    return (await loadBoxCoverage(gateway, boxTypes))?.story ?? null;
}
export function parseFields(r: Resource, f: FormData, translation = false, boxTypes: BoxType[] = []) {
    const output: Record<string, unknown> = {};
    for (const spec of schemas[r]) {
        if (translation && !translationFields[r]?.includes(spec.name))
            continue;
        const raw = f.get(spec.name);
        // The browser does not submit an unchecked toggle: when saving a whole record that means 0.
        if (spec.kind === 'boolean' && raw === null && !translation) {
            output[spec.name] = 0;
            continue;
        }
        if (typeof raw !== 'string')
            continue;
        if (spec.max && Buffer.byteLength(raw) > spec.max)
            throw Error(`Field ${spec.label} is too long`);
        if (spec.kind === 'number' || spec.kind === 'boolean' || spec.kind === 'device') {
            if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || (spec.kind === 'device' && Number(raw) > 3))
                throw Error(`Invalid field ${spec.label}`);
            output[spec.name] = Number(raw);
        }
        else if (spec.kind === 'format') {
            if (raw === 'markdown')
                output.content_format = 'markdown';
            else if (raw !== 'legacy_html')
                throw Error('Invalid format');
        }
        else if (spec.kind === 'ids') {
            output[spec.name] = raw.trim() ? raw.split(',').map(x => {
                if (!/^[1-9][0-9]*$/.test(x.trim()))
                    throw Error('Invalid page ID');
                return Number(x.trim());
            }) : [];
        }
        else if (spec.kind === 'json') {
            const value = JSON.parse(raw || '{}');
            if (!value || Array.isArray(value) || typeof value !== 'object')
                throw Error('Settings must be an object');
            output[spec.name] = value;
        }
        else
            output[spec.name] = r === 'pages' && spec.name === 'link' && !translation ? normalizePageLink(raw) : raw;
    }
    if (r === 'boxes') {
        const type = boxTypes.find(x => x.type === output.type);
        if (!type)
            throw Error('Box type is not registered');
        const settings: Record<string, string> = {};
        for (const [name, values] of Object.entries(type.settings)) {
            const value = f.get('setting_' + name);
            if (typeof value === 'string' && value) {
                if (!values.includes(value))
                    throw Error('Disallowed box settings');
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
                throw Error('Invalid revision');
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
    locales?: { default: string; list: string[] } | null;
    baseUrl?: string;
    gateway: ReturnType<typeof createContentGateway>;
    analytics?: ReturnType<typeof createAnalyticsGateway>;
}> {
    const site = await transaction(async (c) => {
        try {
            await requireSite(c, s, id, 'read');
        }
        catch (cause) {
            if (cause instanceof Error && cause.message === 'Missing site permission')
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
            i18n?: unknown;
        }, user = identity.data as {
            scopes?: unknown;
        };
        if (caps.api_version !== '2.0' || !caps.capabilities || !Array.isArray(user.scopes) || !user.scopes.every(x => typeof x === 'string'))
            throw Error('Invalid discovery response');
        const scopes = user.scopes as string[];
        if (!scopes.includes('discovery:read'))
            throw new RemoteFailure(403, 'forbidden');
        const gatewayOptions = { role, scopes, capabilities: caps.capabilities, call };
        return { site: { id, name: site.name }, boxTypes: projectBoxTypes(caps.box_types), locales: projectLocales(caps.i18n), baseUrl: site.base_url, gateway: createContentGateway(gatewayOptions), analytics: createAnalyticsGateway(gatewayOptions) };
    }
    catch (cause) {
        throw new ContentConnectionFailure({ id, name: site.name }, role, cause);
    }
}
/**
 * Language versions of a record from the translation_locales field, which the site returns in both list and detail. The default language is the original.
 * For a site without this field (older than 4.7) the state is not probed and exists is null: probing per language would mean hundreds of requests with dozens of languages.
 */
export function languageVersions(locales: { default: string; list: string[] }, present: unknown): { locale: string; original: boolean; exists: boolean | null }[] {
    const known = Array.isArray(present) ? new Set(present.filter((x): x is string => typeof x === 'string')) : null;
    return locales.list.map(locale => ({ locale, original: locale === locales.default, exists: locale === locales.default ? true : known ? known.has(locale) : null }));
}
/** Languages the site really serves. Null for older sites without the i18n field (the form then keeps manual entry). */
export function projectLocales(raw: unknown): { default: string; list: string[] } | null {
    const value = raw as { default?: unknown; locales?: unknown } | null;
    const valid = (x: unknown): x is string => typeof x === 'string' && /^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(x);
    if (!value || !valid(value.default) || !Array.isArray(value.locales))
        return null;
    return { default: value.default, list: value.locales.filter(valid) };
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

/** Who made the changes: the site stores central_actor as admin:ID, the e-mail is looked up in Admin. A change without an actor was made directly on the site. */
export async function loadActors(history: Record<string, unknown>[]): Promise<Record<string, string>> {
    const ids = [...new Set(history.map(h => /^admin:([1-9][0-9]{0,18})$/.exec(String(h.central_actor ?? ''))?.[1]).filter((x): x is string => !!x))].slice(0, 50);
    if (!ids.length)
        return {};
    const found = await transaction(c => rows<{ id: number | string; email: string }>(c, `SELECT id,email FROM users WHERE id IN (${ids.map(() => '?').join(',')})`, ids));
    const map = Object.fromEntries(found.map(u => [`admin:${u.id}`, u.email]));
    return Object.fromEntries(ids.map(id => [`admin:${id}`, map[`admin:${id}`] ?? `deleted user #${id}`]));
}

export type Dependents = { resource: Resource; label: string; count: number; items: { id: string; label: string }[]; truncated: boolean }[];
/**
 * What still depends on a page, section or menu item. The site rejects deleting with dependencies (resource_in_use), Admin shows it up front
 * and offers links to the dependent records. Null: cannot be verified (missing read permission or the site did not respond), the site decides.
 */
export async function loadDependents(gateway: Pick<ReturnType<typeof createContentGateway>, 'list' | 'role' | 'scopes' | 'capabilities'>, r: Resource, id: string): Promise<Dependents | null> {
    const targets: { resource: Resource; label: string; match: (row: Record<string, unknown>) => boolean }[] = [];
    const num = (v: unknown) => Number(v && typeof v === 'object' ? (v as Record<string, unknown>).site_id ?? (v as Record<string, unknown>).id : v);
    if (r === 'pages')
        targets.push({ resource: 'articles', label: 'Articles', match: row => String(row.site_id) === id }, { resource: 'boxes', label: 'Boxes', match: row => Array.isArray(row.sites) && row.sites.some(x => String(num(x)) === id) }, { resource: 'menu', label: 'Menu items', match: row => String(row.site_id) === id }, { resource: 'pages', label: 'Subpages', match: row => String(row.parent_id) === id });
    else if (r === 'sections')
        targets.push({ resource: 'boxes', label: 'Boxy v sekci', match: row => String(row.section_id) === id });
    else if (r === 'menu')
        targets.push({ resource: 'menu', label: 'Child menu items', match: row => String(row.parent) === id });
    if (!targets.length)
        return [];
    const out: Dependents = [];
    try {
        for (const t of targets) {
            if (!canOperate(gateway.role, gateway.scopes, gateway.capabilities, 'list', t.resource))
                return null;
            const group = { resource: t.resource, label: t.label, count: 0, items: [] as { id: string; label: string }[], truncated: false };
            for (let page = 1; page <= 5; page++) {
                const reply = await gateway.list(t.resource, page, 100);
                if (!Array.isArray(reply.data))
                    return null;
                for (const row of reply.data as Record<string, unknown>[]) {
                    if (!t.match(row))
                        continue;
                    group.count++;
                    if (group.items.length < 10)
                        group.items.push({ id: idOf(t.resource, row), label: (t.resource === 'articles' && typeof row.draft_title === 'string' && row.draft_title) || optionLabel(t.resource, row) });
                    else
                        group.truncated = true;
                }
                if (!reply.pagination || page >= reply.pagination.total_pages)
                    break;
                if (page === 5)
                    return null;
            }
            if (group.count)
                out.push(group);
        }
    }
    catch {
        return null;
    }
    return out;
}

export type LiveLink = { label: string; url: string; note: string | null };
/**
 * Addresses where a record is visible on the live site. A page and a menu item have one, an article has the page it is placed on,
 * a box has all pages from its list. The note says why the content does not show at the address yet (hidden page, missing article box).
 * Empty list: the record has no address of its own (section, image, box without pages).
 */
export async function loadLiveLinks(gateway: Pick<ReturnType<typeof createContentGateway>, 'get'>, baseUrl: string | undefined, r: Resource, row: Record<string, unknown>, options: { locale?: string; defaultLocale?: string; articleBoxPages?: number[] | null } = {}): Promise<LiveLink[]> {
    if (!baseUrl)
        return [];
    const ids = (r === 'pages' ? [] : r === 'boxes'
        ? (Array.isArray(row.sites) ? row.sites : []).map(x => Number(x && typeof x === 'object' ? (x as Record<string, unknown>).site_id ?? (x as Record<string, unknown>).id : x))
        : r === 'articles' || r === 'menu' ? [Number(row.site_id)] : []).filter(x => Number.isSafeInteger(x) && x > 0).slice(0, 10);
    const pages: Record<string, unknown>[] = r === 'pages' ? [row] : (await Promise.all(ids.map(async id => {
        try {
            return (await gateway.get('pages', String(id))).data as Record<string, unknown>;
        }
        catch {
            return null;
        }
    }))).filter((x): x is Record<string, unknown> => !!x && typeof x === 'object');
    const links: LiveLink[] = [];
    for (const page of pages) {
        const url = liveUrl(baseUrl, page.link, options.locale, options.defaultLocale);
        if (!url)
            continue;
        const id = Number(page.site_id ?? page.id);
        const notes = [
            Number(page.visible) === 0 ? 'the page is hidden, the site will not show it' : '',
            r === 'articles' && options.articleBoxPages && !options.articleBoxPages.includes(id) ? 'the page has no article box, the article will not be shown' : '',
            r === 'articles' && row.draft ? 'only the published version is publicly visible' : ''
        ].filter(Boolean);
        links.push({ label: String(page.title ?? page.link), url, note: notes.length ? notes.join('; ') : null });
    }
    return links;
}
