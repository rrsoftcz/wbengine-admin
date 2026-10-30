import { fail } from '@sveltejs/kit';
import { resetPassword } from '#lib/server/auth.ts';
import { form, field } from '#lib/server/web.ts';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = ({ locals }) => ({ csrf: locals.csrf });
export const actions: Actions = { default: async (e) => {
        try {
            const f = await form(e);
            await resetPassword(field(f, 'token', 128), field(f, 'password', 256));
            return { success: true };
        }
        catch {
            return fail(400, { error: e.locals.t('auth.recover.error') });
        }
    } };
