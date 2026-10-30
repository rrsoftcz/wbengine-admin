import { fail } from '@sveltejs/kit';
import { form, field, globalAdmin } from '#lib/server/web.ts';
import { listUsers, inviteUser, siteChoices, UserError } from '#lib/server/users.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (e) => {
    const s = globalAdmin(e);
    const requested = Number(e.url.searchParams.get('page'));
    const page = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 100000) : 1;
    const search = (e.url.searchParams.get('q') ?? '').trim().slice(0, 100) || null;
    const result = await listUsers(s, page, search);
    const sites = await siteChoices(s);
    return { csrf: e.locals.csrf, ...result, page: Math.min(page, result.totalPages), search: search ?? '', sites };
};

export const actions: Actions = {
    invite: async (e) => {
        const s = globalAdmin(e);
        try {
            const f = await form(e);
            const level = field(f, 'level', 16), siteRaw = field(f, 'site', 12), role = field(f, 'role', 12);
            const global = level === 'global';
            const siteId = !global && siteRaw ? Number(siteRaw) : null;
            if (siteId !== null && !Number.isInteger(siteId))
                throw new UserError('invalid');
            if (!global && siteId !== null && !['editor', 'siteadmin'].includes(role))
                throw new UserError('invalid');
            const result = await inviteUser(s, field(f, 'email', 254), global, siteId, siteId === null ? null : role as 'editor' | 'siteadmin');
            return { invited: result };
        }
        catch (error) {
            const code = error instanceof UserError ? error.code : 'failed';
            return fail(400, { error: e.locals.t(`users.error.${code}` as 'users.error.failed') });
        }
    }
};
