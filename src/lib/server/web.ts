import { redirect, type RequestEvent } from '@sveltejs/kit';
import { checkCsrf, requireAuthenticated, requireGlobal } from './auth.ts';
export const sessionCookie = '__Host-wbadmin';
export function setSession(e: RequestEvent, raw: string) {
    e.cookies.set(sessionCookie, raw, { path: '/', httpOnly: true, secure: true, sameSite: 'strict', maxAge: 8 * 3600 });
}
export async function form(e: RequestEvent) {
    const f = await e.request.formData();
    checkCsrf(e.request, e.url.origin, e.locals.csrf, String(f.get('csrf') ?? ''));
    return f;
}
export function signedIn(e: RequestEvent) {
    if (!e.locals.session)
        redirect(303, '/login');
    if (!e.locals.session.mfaVerified)
        redirect(303, '/mfa');
    return requireAuthenticated(e.locals.session);
}
export function globalAdmin(e: RequestEvent) {
    signedIn(e);
    return requireGlobal(e.locals.session);
}
export const field = (f: FormData, name: string, max = 2048) => {
    const value = f.get(name);
    if (typeof value !== 'string' || value.length > max)
        throw Error('Invalid field');
    return value;
};
