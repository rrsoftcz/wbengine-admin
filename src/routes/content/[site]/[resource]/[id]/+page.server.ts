import { contentLoad } from '#lib/server/content-web.ts';
import { fail, redirect, error } from '@sveltejs/kit';
import { connectContent, siteId, resourceName, canOperate, parseFields, RemoteFailure, referenceFields, loadReferenceOptions, defaultPageOption, type ReferenceOption } from '#lib/server/content.ts';
import { signedIn, form, field } from '#lib/server/web.ts';
import { defaults, idOf, translationFields } from '#lib/content-schema.ts';
import type { Resource } from '#lib/server/api-contract.ts';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = async (e) => contentLoad(async () => {
    const s = signedIn(e), r = resourceName(e.params.resource), id = e.params.id, root = `/content/${e.params.site}/${r}`;
    const offline = e.locals.contentFailure;
    if (e.request.method === 'POST' && offline && offline.resource === r && offline.id === id && offline.site.id === siteId(e.params.site)) {
        const editable = offline.role !== 'editor' || r === 'articles';
        return { site: offline.site, resource: r, id, row: {} as Record<string, unknown>, values: { ...defaults(r), ...offline.fields }, etag: offline.fields.etag ?? null, deleted: false, boxTypes: [], csrf: e.locals.csrf, locale: offline.fields.locale ?? '', translation: null, translationEtag: null, history: [] as Record<string, unknown>[], historyEtag: null, pagination: undefined, image: null, permissions: {} as Record<string, boolean>, refs: {} as Record<string, ReferenceOption[] | null>, unavailable: true, offlineFields: offline.fields, offlineAction: offline.action, offlineEditable: editable };
    }
    if (id === 'recover') {
        const recovered = e.url.searchParams.get('recoverId');
        if (!/^[1-9][0-9]*$/.test(recovered ?? ''))
            error(400, 'Neplatné ID');
        redirect(303, root + '/' + recovered + '?history=1');
    }
    const { site, gateway, boxTypes } = await connectContent(s, siteId(e.params.site)), locale = e.url.searchParams.get('locale') ?? '';
    if (locale && !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(locale))
        error(400, 'Neplatný jazyk');
    let row: Record<string, unknown> = {}, etag: string | null = null, deleted = false;
    if (id !== 'new') {
        try {
            const result = r === 'images' ? await gateway.image(id) : await gateway.get(r, id);
            row = result.data as Record<string, unknown>;
            etag = result.etag;
        }
        catch (cause) {
            if (cause instanceof RemoteFailure && cause.status === 404 && !['articles', 'images'].includes(r))
                deleted = true;
            else
                throw cause;
        }
    }
    const draft = row.draft as {
        content?: Record<string, unknown>;
    } | undefined;
    let values = { ...defaults(r), ...(draft?.content ?? row) };
    if (r === 'articles' && id !== 'new')
        values.content_format = draft?.content?.content_format ?? row.content_format ?? 'legacy_html';
    let translation: Record<string, unknown> | null = null, translationEtag: string | null = null;
    if (locale && id !== 'new' && !deleted && translationFields[r]) {
        const result = await gateway.translation(r, id, locale);
        translation = result.data as Record<string, unknown>;
        translationEtag = result.etag;
    }
    let history: Record<string, unknown>[] = [], historyEtag: string | null = null, pagination;
    const historyPage = Number(e.url.searchParams.get('historyPage') ?? 1);
    if (id !== 'new' && r !== 'images') {
        const result = await gateway.history(r, id, historyPage);
        history = result.data as Record<string, unknown>[];
        historyEtag = result.etag;
        pagination = result.pagination;
    }
    const refs: Record<string, ReferenceOption[] | null> = {};
    await Promise.all(Object.entries(referenceFields[r] ?? {}).map(async ([name, spec]) => { refs[name] = await loadReferenceOptions(gateway, spec.source, spec.source === r ? id : undefined); }));
    if (id === 'new' && refs.site_id?.length && !Number(values.site_id) && (r === 'articles' || r === 'menu'))
        values = { ...values, site_id: defaultPageOption(refs.site_id) };
    let image: string | null = null;
    if (r === 'images' && ['image/png', 'image/jpeg', 'image/webp'].includes(String(row.mime)) && typeof row.base64 === 'string' && row.base64.length <= 699052 && /^[A-Za-z0-9+/]*={0,2}$/.test(row.base64))
        image = `data:${row.mime};base64,${row.base64}`;
    return { refs, unavailable: false, offlineFields: {} as Record<string, string>, offlineAction: 'save' as const, offlineEditable: false, site, resource: r, id, row: { ...row, base64: undefined } as Record<string, unknown>, values, etag, deleted, boxTypes, csrf: e.locals.csrf, locale, translation, translationEtag, history, historyEtag, pagination, image, permissions: Object.fromEntries(['save', 'delete', 'publish', 'restore', 'structureRestore', 'preview', 'translationGet', 'translationSave', 'translationDelete'].map(action => [action, canOperate(gateway.role, gateway.scopes, gateway.capabilities, action, r)])) };
});
export { contentActions as actions } from '#lib/server/content-actions.ts';
