import {contentLoad} from '#lib/server/content-web.ts';
import { fail, redirect } from '@sveltejs/kit';
import { connectContent, siteId, resourceName, canOperate, languageVersions } from '#lib/server/content.ts';
import { translationFields, idOf } from '#lib/content-schema.ts';
import { signedIn, form } from '#lib/server/web.ts';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = async (e) => contentLoad(async()=>{
    const r = resourceName(e.params.resource), { site, gateway, locales } = await connectContent(signedIn(e), siteId(e.params.site)), page = Number(e.url.searchParams.get('page') ?? 1), list = await gateway.list(r, page);
    const items = list.data as Record<string, unknown>[], langs: Record<string, { locale: string; original: boolean; exists: boolean | null }[]> = {};
    if (locales && locales.list.length > 1 && translationFields[r] && canOperate(gateway.role, gateway.scopes, gateway.capabilities, 'translationGet', r))
        for (const row of items)
            if (Array.isArray(row.translation_locales))
                langs[idOf(r, row)] = languageVersions(locales, row.translation_locales);
    return { langs, site, resource: r, items, pagination: list.pagination, csrf: e.locals.csrf, canCreate: canOperate(gateway.role, gateway.scopes, gateway.capabilities, 'save', r) };
});
export const actions: Actions = { upload: async (e) => {
        const s = signedIn(e);
        try {
            if (e.params.resource !== 'images')
                throw Error();
            const f = await form(e), image = f.get('image');
            if (!(image instanceof File) || !image.size || image.size > 524288 || !['image/png', 'image/jpeg', 'image/webp'].includes(image.type))
                return fail(400, { error: 'Vyberte PNG, JPEG nebo WebP do 512 KiB.' });
            if (f.get('publicConsent') !== 'yes')
                return fail(400, { error: 'Potvrďte veřejný charakter obrázku.' });
            const { gateway } = await connectContent(s, siteId(e.params.site)), result = await gateway.upload({ base64: Buffer.from(await image.arrayBuffer()).toString('base64'), mime: image.type });
            return { uploaded: result.data as Record<string, unknown> };
        }
        catch {
            return fail(400, { error: 'Obrázek se nepodařilo nahrát. Ověřte oprávnění, formát a dostupné úložiště webu.' });
        }
    } };
