import { fail, redirect } from '@sveltejs/kit';
import { setupMfa, completeMfa } from '#lib/server/auth.ts';
import { form, field, setSession } from '#lib/server/web.ts';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.session)
        redirect(303, '/login');
    if (locals.session.mfaVerified)
        redirect(303, '/');
    return { csrf: locals.csrf, enrollment: !locals.session.user.mfaEnabled, email: locals.session.user.email };
};
export const actions: Actions = { enroll: async (e) => {
        if (!e.locals.session)
            redirect(303, '/login');
        try {
            await form(e);
            return { secret: await setupMfa(e.locals.session) };
        }
        catch {
            return fail(400, { error: 'Nastavení se nezdařilo' });
        }
    }, verify: async (e) => {
        if (!e.locals.session)
            redirect(303, '/login');
        let result;
        try {
            const f = await form(e);
            result = await completeMfa(e.locals.session, field(f, 'code', 128));
            setSession(e, result.sessionToken);
        }
        catch {
            return fail(400, { error: 'Ověření se nezdařilo nebo je dočasně omezené' });
        }
        if (result.codes.length)
            return { codes: result.codes };
        redirect(303, '/');
    } };
