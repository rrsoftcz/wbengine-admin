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
/** Konečný katalog kódů chyb API verze 2 s českými hláškami. Jiný kód se nikdy nezobrazí. */
export const errorMessages: Record<string, string> = {
    missing_site: 'Vyberte stránku, na které se článek zobrazí, a zkuste to znovu.',
    article_site_conflict: 'Na vybrané stránce už je zobrazen jiný článek. Vyberte jinou stránku.',
    missing_field: 'Chybí povinné pole. Vyplňte všechna povinná pole a zkuste to znovu.',
    invalid_field: 'Formulář obsahuje pole, které web nepodporuje.',
    invalid_body: 'Web odeslaná data nepřijal. Načtěte stránku znovu a zkuste to ještě jednou.',
    invalid_format: 'Nový obsah musí být ve formátu Markdown.',
    format_replacement_required: 'Původní text je ve starém formátu HTML. Pro publikování jej nahraďte Markdownem (úvod i celý text).',
    invalid_link: 'Odkaz stránky musí být místní adresa začínající lomítkem, například /o-nas/.',
    duplicate_link: 'Stránka s tímto odkazem už existuje. Zvolte jiný odkaz.',
    invalid_key: 'Klíč sekce smí obsahovat malá písmena, číslice a podtržítko a musí začínat písmenem.',
    duplicate_key: 'Sekce s tímto klíčem už existuje. Zvolte jiný klíč.',
    invalid_name: 'Název má neplatnou délku nebo obsah.',
    invalid_status: 'Chybový stav sekce musí být 0 nebo HTTP chyba od 400.',
    invalid_parent: 'Nadřazená položka je neplatná. Položka nemůže být svým vlastním rodičem.',
    invalid_source: 'Zdroj nesmí obsahovat řídicí znaky ani zalomení řádku.',
    invalid_box_type: 'Tento typ boxu není na webu registrován.',
    invalid_box_section: 'Tento typ boxu nelze použít v zvolené sekci.',
    invalid_box_settings: 'Nastavení boxu obsahuje nepodporovanou hodnotu.',
    invalid_locale: 'Jazyk překladu je neplatný.',
    invalid_id: 'Identifikátor záznamu je neplatný.',
    invalid_resource: 'Tento druh obsahu nepodporuje požadovanou operaci.',
    invalid_recovery: 'Tento druh obsahu nepodporuje obnovu překladu.',
    invalid_pagination: 'Stránkování seznamu je neplatné.',
    invalid_image: 'Obrázek je poškozený nebo má neplatný formát.',
    unsupported_image: 'Podporované jsou pouze obrázky PNG, JPEG a WebP.',
    image_too_large: 'Obrázek je příliš velký. Nejvýše 512 KiB.',
    image_storage_unconfigured: 'Na webu není nastaveno úložiště obrázků.',
    image_storage_unavailable: 'Úložiště obrázků na webu je teď nedostupné.',
    no_draft: 'Článek nemá žádný koncept k publikování.',
    draft_too_large: 'Koncept je příliš rozsáhlý.',
    body_too_large: 'Odeslaná data jsou příliš velká.',
    resource_in_use: 'Záznam nelze odstranit, protože na něj odkazují jiné záznamy. Nejdřív odstraňte závislé položky.',
    precondition_failed: 'Obsah se mezitím změnil. Vaše úpravy zůstaly zachovány.',
    precondition_required: 'Chybí verze obsahu. Načtěte jej znovu.',
    not_found: 'Záznam nebyl nalezen.',
    forbidden: 'Chybí oprávnění nebo scope.',
    rate_limited: 'Příliš mnoho požadavků. Zkuste to za chvíli.',
    unavailable: 'API webu je dočasně nedostupné. Zkuste to později.'
};
/** Pole formuláře, kterého se kód chyby týká (název pole schématu), aby je editor mohl označit. */
export const errorFields: Record<string, string> = {
    missing_site: 'site_id', article_site_conflict: 'site_id', invalid_link: 'link', duplicate_link: 'link', invalid_key: 'key', duplicate_key: 'key',
    invalid_name: 'name', invalid_status: 'return_error_code', invalid_parent: 'parent_id', invalid_source: 'source', invalid_box_type: 'type',
    invalid_box_section: 'section_id', invalid_box_settings: 'settings', invalid_format: 'content_format'
};
export const fieldOfError = (code: unknown): string | undefined => typeof code === 'string' && Object.hasOwn(errorFields, code) ? errorFields[code] : undefined;
/** Vrací kód jen pokud je v katalogu, jinak obecný kód odmítnutí. */
export function safeErrorCode(value: unknown): string {
    return typeof value === 'string' && Object.hasOwn(errorMessages, value) ? value : 'remote_rejected';
}
export class RemoteFailure extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string) {
        super(status === 412 ? 'Obsah se mezitím změnil. Vaše úpravy zůstaly zachovány.' : status === 428 ? 'Chybí verze obsahu. Načtěte jej znovu.' : status === 403 ? 'Chybí oprávnění nebo scope.' : status === 404 ? 'Záznam nebyl nalezen.' : Object.hasOwn(errorMessages, code) ? errorMessages[code] : status === 409 ? 'Operace koliduje s aktuálním stavem nebo vazbami.' : 'Vzdálené API požadavek odmítlo.');
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
        const perPage = call.perPage ?? 25;
        if (!Number.isInteger(perPage) || perPage < 1 || perPage > 100)
            throw Error('Neplatný počet na stránku');
        return `?page=${page}&per_page=${perPage}`;
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
