import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { connectContent, siteId, resourceName, parseFields, createArticleBox, RemoteFailure, ContentConnectionFailure } from './content.ts';
import { signedIn, form, field } from './web.ts';
import { idOf, schemas } from '../content-schema.ts';
import { fieldOfError, type Resource } from './api-contract.ts';
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
    const execute = (action: 'save' | 'delete' | 'publish' | 'restore' | 'translationSave' | 'translationDelete' | 'merge') => async (e: RequestEvent) => {
        const s = signedIn(e);
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
                    throw Error('Potvrďte ruční sloučení');
                const current = locale ? await gateway.translation(r, id, locale) : await gateway.get(r, id);
                return { action: locale ? 'translationSave' : 'save', values: dirtyValues(f, r), translationValues: dirtyValues(f, r), etag: current.etag, translationEtag: current.etag, merged: true, message: 'Načtena aktuální verze. Ručně zkontrolujte a slučte svoje změny s obsahem níže, potom je uložte.' };
            }
            if (action === 'save') {
                const data = parseFields(r, f, false, boxTypes);
                submitting = true;
                const result = await gateway.save(r, id === 'new' ? null : id, data, etag);
                target = idOf(r, result.data as Record<string, unknown>);
                if (r === 'pages' && id === 'new' && f.get('show_article') === '1' && (await createArticleBox(gateway, boxTypes, Number(target), String(data.title ?? ''))) === 'failed')
                    query = 'boxWarning=1';
            }
            else if (action === 'delete') {
                if (f.get('confirm') !== 'yes')
                    throw Error('Potvrďte odstranění');
                await gateway.remove(r, id, etag);
                redirect(303, `/content/${e.params.site}/${r}` + (!['articles', 'images'].includes(r) ? '/' + id + '?deleted=1' : ''));
            }
            else if (action === 'publish') {
                if (f.get('confirm') !== 'yes')
                    throw Error('Potvrďte publikování');
                await gateway.publish(id, etag);
            }
            else if (action === 'restore') {
                if (f.get('confirm') !== 'yes')
                    throw Error('Potvrďte obnovu');
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
            const badField = cause instanceof RemoteFailure ? fieldOfError(cause.code) : undefined, badLabel = badField ? schemas[r].find(x => x.name === badField)?.label : undefined;
            return fail(cause instanceof RemoteFailure ? cause.status : unavailable ? 503 : 400, { error: cause instanceof RemoteFailure ? (badLabel ? `Pole „${badLabel}“: ${cause.message}` : cause.message) : 'Operace se nezdařila. Zkontrolujte pole, oprávnění a dostupnost webu.', field: badLabel ? badField : undefined, conflict: cause instanceof RemoteFailure && cause.status === 412, action, values: f ? dirtyValues(f, r) : {}, translationValues: f ? dirtyValues(f, r) : {}, etag: f ? String(f.get('etag') ?? '') : '', translationEtag: f ? String(f.get('etag') ?? '') : '', submitted: f ? dirty(f) : {} });
        }
        redirect(303, `/content/${e.params.site}/${r}/${target}` + (f?.get('locale') ? '?locale=' + encodeURIComponent(String(f.get('locale'))) : query ? '?' + query : ''));
    };
    return { save: execute('save'), delete: execute('delete'), publish: execute('publish'), restore: execute('restore'), translationSave: execute('translationSave'), translationDelete: execute('translationDelete'), merge: execute('merge') };
}
export const contentActions = createContentActions();
