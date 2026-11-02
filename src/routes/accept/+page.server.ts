import { fail, redirect } from '@sveltejs/kit';
import { acceptInvitation, AcceptError } from '#lib/server/auth.ts';
import { form, field, setSession } from '#lib/server/web.ts';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = ({ locals }) => ({ csrf: locals.csrf });
export const actions: Actions = { default: async (e) => {
        try {
            const f = await form(e);
            setSession(e, await acceptInvitation(field(f, 'token', 128), field(f, 'password', 256)));
        }
        catch (error) {
            const key = error instanceof AcceptError ? (error.code === 'password' ? 'auth.accept.errorPassword' : 'auth.accept.errorInvitation') : 'auth.accept.error';
            return fail(400, { error: e.locals.t(key) });
        }
        redirect(303, '/mfa');
    } };
