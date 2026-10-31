import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { connectContent, siteId, resourceName, parseFields, createArticleBox, loadArticleBoxPages, RemoteFailure, ContentConnectionFailure } from './content.ts';
import { signedIn, form, field } from './web.ts';
import { idOf, schemas } from '../content-schema.ts';
import { fieldOfError, remoteMessage, type Resource } from './api-contract.ts';
import { translator, type Translate } from '../i18n/index.ts';
export function createContentActions(connect: typeof connectContent = connectContent) {
    function dirty(f: FormData) {
        return Object.fromEntries([...f].filter(([name, value]) => typeof value === 'string' && name !== 'csrf').map(([name, value]) => [name, String(value)]));
    }
    function dirtyValues(f: FormData, r: Resource) {
        const v = dirty(f) as Record<string, unknown>;
        if (r === 'boxes') {
            v.settings = Object.fromEntries([...f].filter(([k]) => k.startsWith('setting_')).map(([k, v]) => [k.slice(8), String(v)]));
        }
        return v;
    }
    const execute = (action: 'save' | 'delete' | 'publish' | 'hide' | 'unhide' | 'restore' | 'translationSave' | 'translationDelete' | 'merge') => async (e: RequestEvent) => {
        const s = signedIn(e), t: Translate = e.locals.t ?? translator('en');
        let f: FormData | undefined;
        const r = resourceName(e.params.resource!), id = e.params.id!;
        let target = id, query = '';
        let context: {
            site: {
                id: number;
                name: string;
            };
            role: import('./content.ts').Role;
        } | undefined, submitting = false;
        try {
            f = await form(e);
            const connected = await connect(s, siteId(e.params.site!));
            const { gateway, boxTypes } = connected;
            context = { site: connected.site, role: gateway.role };
            const etag = field(f, 'etag', 100), locale = String(f.get('locale') ?? '');
            if (action === 'merge') {
                if (f.get('mergeConsent') !== 'yes')
                    throw Error('Confirm the manual merge');
                const current = locale ? await gateway.translation(r, id, locale) : await gateway.get(r, id);
                return { action: locale ? 'translationSave' : 'save', values: dirtyValues(f, r), translationValues: dirtyValues(f, r), etag: current.etag, translationEtag: current.etag, merged: true, message: t('content.action.merged') };
            }
            if (action === 'save') {
                const data = parseFields(r, f, false, boxTypes);
                submitting = true;
                const result = await gateway.save(r, id === 'new' ? null : id, data, etag);
                target = idOf(r, result.data as Record<string, unknown>);
                if (r === 'pages' && id === 'new' && f.get('show_article') === '1' && (await createArticleBox(gateway, boxTypes, Number(target), String(data.title ?? ''))) === 'failed')
                    query = 'boxWarning=1';
                if (r === 'articles' && f.get('add_article_box') === '1' && Number(data.site_id) > 0) {
                    const pageId = Number(data.site_id), covered = await loadArticleBoxPages(gateway, boxTypes);
                    if (covered && !covered.includes(pageId)) {
                        const page = await gateway.get('pages', String(pageId)).catch(() => null), row = page?.data as Record<string, unknown> | undefined;
                        await createArticleBox(gateway, boxTypes, pageId, String(row?.title ?? row?.name ?? pageId));
                    }
                }
            }
            else if (action === 'delete') {
                if (f.get('confirm') !== 'yes')
                    throw Error('Confirm the removal');
                await gateway.remove(r, id, etag);
                redirect(303, `/content/${e.params.site}/${r}` + (!['articles', 'images'].includes(r) ? '/' + id + '?deleted=1' : ''));
            }
            else if (action === 'publish') {
                if (f.get('confirm') !== 'yes')
                    throw Error('Confirm the publication');
                await gateway.publish(id, etag);
            }
            else if (action === 'hide' || action === 'unhide') {
                if (f.get('confirm') !== 'yes')
                    throw Error('Confirm the change of visibility');
                await gateway.setHidden(id, action === 'hide', etag);
            }
            else if (action === 'restore') {
                if (f.get('confirm') !== 'yes')
                    throw Error('Confirm the restore');
                await gateway.restore(r, id, field(f, 'change_id', 32), etag);
            }
            else {
                const data = action === 'translationDelete' ? null : parseFields(r, f, true);
                submitting = true;
                await gateway.saveTranslation(r, id, locale, data, etag);
            }
        }
        catch (cause) {
            const { isRedirect } = await import('@sveltejs/kit');
            if (isRedirect(cause))
                throw cause;
            const unavailable = cause instanceof ContentConnectionFailure || (submitting && (!(cause instanceof RemoteFailure) || cause.status >= 500 || cause.status === 401));
            if (f && unavailable && (action === 'save' || action === 'translationSave')) {
                const local = cause instanceof ContentConnectionFailure ? { site: cause.site, role: cause.role } : context;
                if (local)
                    e.locals.contentFailure = { ...local, resource: r, id, action, fields: dirty(f) };
            }
            const badField = cause instanceof RemoteFailure ? fieldOfError(cause.code) : undefined, badSpec = badField ? schemas[r].find(x => x.name === badField) : undefined, badLabel = badSpec ? t(badSpec.label) : undefined;
            return fail(cause instanceof RemoteFailure ? cause.status : unavailable ? 503 : 400, { error: cause instanceof RemoteFailure ? (badLabel ? t('content.action.fieldError', { field: badLabel, message: remoteMessage(t, cause) }) : remoteMessage(t, cause)) : t('content.action.failed'), field: badLabel ? badField : undefined, conflict: cause instanceof RemoteFailure && cause.status === 412, action, values: f ? dirtyValues(f, r) : {}, translationValues: f ? dirtyValues(f, r) : {}, etag: f ? String(f.get('etag') ?? '') : '', translationEtag: f ? String(f.get('etag') ?? '') : '', submitted: f ? dirty(f) : {} });
        }
        redirect(303, `/content/${e.params.site}/${r}/${target}` + (f?.get('locale') ? '?locale=' + encodeURIComponent(String(f.get('locale'))) : query ? '?' + query : ''));
    };
    return { save: execute('save'), delete: execute('delete'), publish: execute('publish'), hide: execute('hide'), unhide: execute('unhide'), restore: execute('restore'), translationSave: execute('translationSave'), translationDelete: execute('translationDelete'), merge: execute('merge') };
}
export const contentActions = createContentActions();
