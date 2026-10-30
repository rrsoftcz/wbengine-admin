import { error, fail } from '@sveltejs/kit';
import { RemoteFailure } from '#lib/server/api-contract.ts';
import { connectContent, siteId } from '#lib/server/content.ts';
import { contentLoad, remoteMessage } from '#lib/server/content-web.ts';
import { parseUsersQuery, userRoles, type UserRole } from '#lib/server/siteadmin.ts';
import { transaction } from '#lib/server/db.ts';
import { form, field, signedIn } from '#lib/server/web.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (e) => {
    e.setHeaders({ 'Cache-Control': 'no-store, private' });
    return contentLoad(async () => {
        const c = await connectContent(signedIn(e), siteId(e.params.site));
        const admin = c.admin;
        const access = admin?.users() ?? { read: false, write: false };
        if (!admin || !access.read) {
            if (admin?.needsNewKey())
                return { site: c.site, available: false as const };
            error(403, e.locals.t('errors.forbidden'));
        }
        const query = parseUsersQuery(e.url.searchParams);
        return { site: c.site, available: true as const, query, page: await admin.list(query), canWrite: access.write, csrf: e.locals.csrf, baseUrl: c.baseUrl ?? '' };
    });
};

type Admin = NonNullable<Awaited<ReturnType<typeof connectContent>>['admin']>;

/** Runs one user action against the site: CSRF, access, then a translated outcome. Every success is also recorded in Admin's audit. */
async function act(e: Parameters<Actions[string]>[0], auditEvent: string, done: string, action: (admin: Admin, f: FormData) => Promise<Record<string, unknown> | void>) {
    const id = siteId(e.params.site!);
    try {
        const f = await form(e);
        const session = signedIn(e);
        const c = await connectContent(session, id);
        if (!c.admin) throw new RemoteFailure(403, 'forbidden');
        const extra = await action(c.admin, f);
        await transaction(conn => conn.execute('INSERT INTO audit(user_id,site_id,event) VALUES (?,?,?)', [session.user.id, id, auditEvent]));
        return { done: e.locals.t(done as 'siteusers.done.created'), ...(extra ?? {}) };
    }
    catch (cause) {
        const c = cause as { cause?: unknown };
        const remote = cause instanceof RemoteFailure ? cause : c?.cause instanceof RemoteFailure ? c.cause : null;
        return fail(remote && remote.status >= 400 && remote.status <= 499 ? remote.status : 400, { error: remote ? remoteMessage(e.locals.t, remote) : e.locals.t('siteusers.error.failed') });
    }
}

const userId = (f: FormData) => {
    const id = Number(field(f, 'user', 12));
    if (!Number.isInteger(id) || id < 1) throw new RemoteFailure(404, 'not_found');
    return id;
};
const roleOf = (f: FormData): UserRole => {
    const role = field(f, 'role', 12);
    if (!(userRoles as readonly string[]).includes(role)) throw new RemoteFailure(400, 'invalid_role');
    return role as UserRole;
};

export const actions: Actions = {
    create: (e) => act(e, 'site.user.created', 'siteusers.done.created', async (admin, f) => {
        const first = field(f, 'firstname', 45).trim(), last = field(f, 'lastname', 150).trim();
        const created = await admin.create({ email: field(f, 'email', 100).trim(), role: roleOf(f), ...(first ? { firstname: first } : {}), ...(last ? { lastname: last } : {}) });
        return { link: { email: created.user.email, token: created.link.token, expiresAt: created.link.expires_at } };
    }),
    role: (e) => act(e, 'site.user.role', 'siteusers.done.role', async (admin, f) => { await admin.update(userId(f), { role: roleOf(f) }); }),
    disable: (e) => act(e, 'site.user.disabled', 'siteusers.done.disabled', async (admin, f) => { await admin.update(userId(f), { disabled: true }); }),
    enable: (e) => act(e, 'site.user.enabled', 'siteusers.done.enabled', async (admin, f) => { await admin.update(userId(f), { disabled: false }); }),
    reset: (e) => act(e, 'site.user.reset', 'siteusers.done.reset', async (admin, f) => {
        const id = userId(f), link = await admin.resetLink(id);
        return { link: { email: field(f, 'email', 100), token: link.token, expiresAt: link.expires_at } };
    })
};
