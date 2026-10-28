import { redirect } from '@sveltejs/kit';
import { listSites } from '#lib/server/sites.ts';
import { logout } from '#lib/server/auth.ts';
import { transaction, rows } from '#lib/server/db.ts';
import { signedIn, form, sessionCookie } from '#lib/server/web.ts';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = async (e) => {
    const s = signedIn(e);
    const sites = await listSites(s);
    /* Display data only: the caller's own roles and the non-secret integration ids of the sites they can see. */
    const roles = await transaction(c => rows<{ site_id: number; role: string }>(c, 'SELECT site_id,role FROM grants WHERE user_id=?', [s.user.id]));
    const integrations = await transaction(c => rows<{ id: number; integration_id: number | null }>(c, 'SELECT id,integration_id FROM sites'));
    return {
        user: s.user,
        csrf: e.locals.csrf,
        sites: sites.map(site => ({
            ...site,
            role: s.user.globalAdmin ? 'global' : roles.find(r => r.site_id === site.id)?.role ?? 'editor',
            integrationId: integrations.find(i => i.id === site.id)?.integration_id ?? null
        }))
    };
};
export const actions: Actions = { logout: async (e) => {
        const s = signedIn(e);
        await form(e);
        await logout(s);
        e.cookies.delete(sessionCookie, { path: '/' });
        redirect(303, '/login');
    } };
