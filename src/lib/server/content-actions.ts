import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { connectContent, siteId, resourceName, parseFields, RemoteFailure } from './content.ts';
import { signedIn, form, field } from './web.ts';
import { idOf } from '../content-schema.ts';
import type { Resource } from './api-contract.ts';
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
        let target = id;
        try {
            f = await form(e);
            const { gateway, boxTypes } = await connect(s, siteId(e.params.site!)), etag = field(f, 'etag', 100), locale = String(f.get('locale') ?? '');
            if (action === 'merge') {
                if (f.get('mergeConsent') !== 'yes')
                    throw Error('Potvrďte ruční sloučení');
                const current = locale ? await gateway.translation(r, id, locale) : await gateway.get(r, id);
                return { action: locale ? 'translationSave' : 'save', values: dirtyValues(f, r), translationValues: dirtyValues(f, r), etag: current.etag, translationEtag: current.etag, merged: true, message: 'Načtena aktuální verze. Ručně zkontrolujte a slučte svoje změny s obsahem níže, potom je uložte.' };
            }
            if (action === 'save') {
                const result = await gateway.save(r, id === 'new' ? null : id, parseFields(r, f, false, boxTypes), etag);
                target = idOf(r, result.data as Record<string, unknown>);
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
            else
                await gateway.saveTranslation(r, id, locale, action === 'translationDelete' ? null : parseFields(r, f, true), etag);
        }
        catch (cause) {
            const { isRedirect } = await import('@sveltejs/kit');
            if (isRedirect(cause))
                throw cause;
            return fail(cause instanceof RemoteFailure ? cause.status : 400, { error: cause instanceof RemoteFailure ? cause.message : 'Operace se nezdařila. Zkontrolujte pole, oprávnění a dostupnost webu.', conflict: cause instanceof RemoteFailure && cause.status === 412, action, values: f ? dirtyValues(f, r) : {}, translationValues: f ? dirtyValues(f, r) : {}, etag: f ? String(f.get('etag') ?? '') : '', translationEtag: f ? String(f.get('etag') ?? '') : '', submitted: f ? dirty(f) : {} });
        }
        redirect(303, `/content/${e.params.site}/${r}/${target}` + (f?.get('locale') ? '?locale=' + encodeURIComponent(String(f.get('locale'))) : ''));
    };
    return { save: execute('save'), delete: execute('delete'), publish: execute('publish'), restore: execute('restore'), translationSave: execute('translationSave'), translationDelete: execute('translationDelete'), merge: execute('merge') };
}
export const contentActions = createContentActions();
