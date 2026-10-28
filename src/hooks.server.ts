import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import { loadSession } from '#lib/server/auth.ts';
import { tokenHash, token } from '#lib/server/security.ts';
import { sessionCookie } from '#lib/server/web.ts';
export const handle: Handle = async ({ event, resolve }) => {
    const canonical = process.env.ORIGIN;
    if (!canonical || new URL(canonical).protocol !== 'https:' || new URL(canonical).origin !== canonical)
        throw Error('Chybí HTTPS ORIGIN');
    if (event.url.origin !== canonical)
        return new Response('Neplatný původ požadavku', { status: 400 });
    event.locals.session = await loadSession(event.cookies.get(sessionCookie));
    let csrf = event.cookies.get('__Host-wbcsrf');
    if (!csrf || !/^[A-Za-z0-9_-]{43}$/.test(csrf)) {
        csrf = token();
        event.cookies.set('__Host-wbcsrf', csrf, { path: '/', httpOnly: true, secure: true, sameSite: 'strict', maxAge: 3600 });
    }
    event.locals.csrf = event.locals.session?.csrf ?? tokenHash(csrf);
    const response = await resolve(event);
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'same-origin');
    if(!response.headers.has('Content-Security-Policy'))response.headers.set('Content-Security-Policy', "frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    return response;
};
export const handleError: HandleServerError = () => ({ message: 'Požadavek se nepodařilo zpracovat' });
