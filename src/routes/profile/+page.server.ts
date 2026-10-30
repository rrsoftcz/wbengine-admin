import { fail, redirect } from '@sveltejs/kit';
import { form, field, signedIn, sessionCookie } from '#lib/server/web.ts';
import { changePassword, regenerateBackupCodes, resetMfa, setLocale, profileInfo, accountActivity, activityPageSize, ProfileError } from '#lib/server/profile.ts';
import { activityCategories, type ActivityCategory } from '#lib/activity.ts';
import { isLocale, localeCookie, locales, localeNames } from '#lib/i18n/index.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (e) => {
    const s = signedIn(e);
    const requested = e.url.searchParams.get('activity');
    const category = (activityCategories as readonly string[]).includes(requested ?? '') ? requested as ActivityCategory : null;
    const requestedPage = Number(e.url.searchParams.get('activityPage'));
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100000) : 1;
    let activity = await accountActivity(s.user.id, category, page);
    // A page past the end (for example after the filter changed) shows the last page instead of nothing.
    if (!activity.items.length && page > 1)
        activity = await accountActivity(s.user.id, category, activity.totalPages);
    return {
        csrf: e.locals.csrf,
        info: await profileInfo(s.user.id),
        activity: { ...activity, category, page: Math.min(page, activity.totalPages), perPage: activityPageSize },
        locale: s.user.locale,
        languages: locales.map((value) => ({ value, name: localeNames[value] }))
    };
};

/** Maps a failed action to a translated message; unexpected errors never leak their text. */
function failure(e: Parameters<Actions[string]>[0], section: string, error: unknown) {
    const code = error instanceof ProfileError ? error.code : 'failed';
    return fail(400, { section, error: e.locals.t(`profile.error.${code}` as 'profile.error.failed') });
}

export const actions: Actions = {
    password: async (e) => {
        const s = signedIn(e);
        try {
            const f = await form(e);
            const next = field(f, 'next', 256);
            if (next !== field(f, 'confirm', 256))
                throw new ProfileError('mismatch');
            await changePassword(s, field(f, 'current', 256), next);
        }
        catch (error) {
            return failure(e, 'password', error);
        }
        return { section: 'password', ok: e.locals.t('profile.password.changed') };
    },
    codes: async (e) => {
        const s = signedIn(e);
        try {
            const f = await form(e);
            return { section: 'codes', codes: await regenerateBackupCodes(s, field(f, 'current', 256)) };
        }
        catch (error) {
            return failure(e, 'codes', error);
        }
    },
    resetMfa: async (e) => {
        const s = signedIn(e);
        try {
            const f = await form(e);
            await resetMfa(s, field(f, 'current', 256));
        }
        catch (error) {
            return failure(e, 'mfa', error);
        }
        e.cookies.delete(sessionCookie, { path: '/' });
        redirect(303, '/login');
    },
    language: async (e) => {
        const s = signedIn(e);
        try {
            const f = await form(e);
            const value = field(f, 'locale', 8);
            const chosen = value === '' ? null : value;
            if (chosen !== null && !isLocale(chosen))
                throw new ProfileError('invalidLocale');
            await setLocale(s.user.id, chosen);
            if (chosen)
                e.cookies.set(localeCookie, chosen, { path: '/', secure: true, sameSite: 'lax', maxAge: 365 * 24 * 3600 });
            else
                e.cookies.delete(localeCookie, { path: '/' });
        }
        catch (error) {
            return failure(e, 'language', error);
        }
        redirect(303, '/profile?saved=language');
    }
};
