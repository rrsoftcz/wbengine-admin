import { fail, redirect } from '@sveltejs/kit';
import { acceptInvitation } from '#lib/server/auth.ts';
import { form, field, setSession } from '#lib/server/web.ts';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = ({ locals }) => ({ csrf: locals.csrf });
export const actions: Actions = { default: async (e) => {
        try {
            const f = await form(e);
            setSession(e, await acceptInvitation(field(f, 'token', 128), field(f, 'password', 256)));
        }
        catch {
            return fail(400, { error: 'Pozvánka není platná nebo heslo nesplňuje požadavky' });
        }
        redirect(303, '/mfa');
    } };
