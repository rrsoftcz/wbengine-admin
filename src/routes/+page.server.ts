import { redirect } from '@sveltejs/kit';
import { listSites } from '#lib/server/sites.ts';
import { logout } from '#lib/server/auth.ts';
import { signedIn, form, sessionCookie } from '#lib/server/web.ts';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = async (e) => {
    const s = signedIn(e);
    return { user: s.user, csrf: e.locals.csrf, sites: await listSites(s) };
};
export const actions: Actions = { logout: async (e) => {
        const s = signedIn(e);
        await form(e);
        await logout(s);
        e.cookies.delete(sessionCookie, { path: '/' });
        redirect(303, '/login');
    } };
