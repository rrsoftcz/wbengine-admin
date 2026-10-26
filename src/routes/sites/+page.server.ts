import { fail } from '@sveltejs/kit';
import { listSites, grantSite, inspectSite } from '#lib/server/sites.ts';
import { globalAdmin, form, field } from '#lib/server/web.ts';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = async (e) => {
    const s = globalAdmin(e);
    return { sites: await listSites(s), csrf: e.locals.csrf };
};
export const actions: Actions = { grant: async (e) => {
        try {
            const s = globalAdmin(e), f = await form(e);
            const user = Number(field(f, 'user')), site = Number(field(f, 'site'));
            if (!Number.isSafeInteger(user) || user < 1 || !Number.isSafeInteger(site) || site < 1)
                throw Error();
            await grantSite(s, user, site, field(f, 'role') as 'editor' | 'siteadmin');
            return { success: 'Oprávnění uloženo' };
        }
        catch {
            return fail(400, { error: 'Oprávnění se nepodařilo uložit' });
        }
    }, inspect: async (e) => {
        try {
            const s = globalAdmin(e), f = await form(e);
            const discovery = await inspectSite(s, Number(field(f, 'site')));
            return { discovery };
        }
        catch {
            return fail(400, { error: 'Discovery se nezdařilo. Ověřte TLS, DNS a scope discovery:read.' });
        }
    } };
