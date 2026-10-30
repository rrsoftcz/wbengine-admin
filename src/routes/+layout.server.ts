import type { LayoutServerLoad } from './$types';
/** Shell data only: the navigation is shown for fully authenticated sessions (password and MFA). */
export const load: LayoutServerLoad = ({ locals }) => {
    const s = locals.session;
    const ready = !!s && s.mfaVerified && s.user.mfaEnabled;
    return { shell: ready ? { email: s.user.email, globalAdmin: s.user.globalAdmin } : null, shellCsrf: locals.csrf, locale: locals.locale, messages: locals.messages };
};
