import { error, fail } from '@sveltejs/kit';
import { form, globalAdmin } from '#lib/server/web.ts';
import { userDetail, issueRecoveryFor, setDisabled, setGlobalAdmin, revokeGrant, resetUserMfa, UserError } from '#lib/server/users.ts';
import { accountActivity } from '#lib/server/profile.ts';
import type { Actions, PageServerLoad } from './$types';

const userId = (raw: string) => {
    const id = Number(raw);
    if (!Number.isInteger(id) || id < 1)
        error(404, 'Not found');
    return id;
};

export const load: PageServerLoad = async (e) => {
    const s = globalAdmin(e);
    const id = userId(e.params.id);
    try {
        const user = await userDetail(s, id);
        const activity = await accountActivity(id, null, 1, 10);
        return { csrf: e.locals.csrf, user, activity: activity.items, self: id === s.user.id };
    }
    catch (cause) {
        if (cause instanceof UserError)
            error(404, e.locals.t('users.error.notFound'));
        throw cause;
    }
};

/** Runs one action, turning a rejected one into a translated message and a successful one into `done`. */
async function run(e: Parameters<Actions[string]>[0], done: string, action: (s: ReturnType<typeof globalAdmin>, f: FormData, id: number) => Promise<Record<string, unknown> | void>) {
    const s = globalAdmin(e);
    const id = userId(e.params.id!);
    try {
        const f = await form(e);
        const extra = await action(s, f, id);
        return { done: e.locals.t(done as 'users.done.disabled'), ...(extra ?? {}) };
    }
    catch (error) {
        const code = error instanceof UserError ? error.code : 'failed';
        return fail(400, { error: e.locals.t(`users.error.${code}` as 'users.error.failed') });
    }
}

export const actions: Actions = {
    disable: (e) => run(e, 'users.done.disabled', (s, _f, id) => setDisabled(s, id, true)),
    enable: (e) => run(e, 'users.done.enabled', (s, _f, id) => setDisabled(s, id, false)),
    promote: (e) => run(e, 'users.done.promoted', (s, _f, id) => setGlobalAdmin(s, id, true)),
    demote: (e) => run(e, 'users.done.demoted', (s, _f, id) => setGlobalAdmin(s, id, false)),
    resetMfa: (e) => run(e, 'users.done.mfaReset', (s, _f, id) => resetUserMfa(s, id)),
    recovery: (e) => run(e, 'users.done.recovery', async (s, _f, id) => ({ recovery: await issueRecoveryFor(s, id) })),
    revoke: (e) => run(e, 'users.done.revoked', async (s, f, id) => {
        const site = Number(f.get('site'));
        if (!Number.isInteger(site) || site < 1)
            throw new UserError('invalid');
        await revokeGrant(s, id, site);
    })
};
