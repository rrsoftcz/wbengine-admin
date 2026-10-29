import { fail, redirect } from '@sveltejs/kit';
import { login } from '#lib/server/auth.ts';
import { form, field, setSession } from '#lib/server/web.ts';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = ({ locals }) => ({ csrf: locals.csrf });
export const actions: Actions = { default: async (e) => {
        try {
            const f = await form(e), email = field(f, 'email', 254), raw = await login(email, field(f, 'password', 256));
            if (!raw)
                return fail(400, { error: 'Sign-in failed or is temporarily restricted', email });
            setSession(e, raw);
        }
        catch {
            return fail(400, { error: 'Sign-in failed' });
        }
        redirect(303, '/mfa');
    } };
