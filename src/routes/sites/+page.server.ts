import { fail } from '@sveltejs/kit';
import { listSites, listAccounts, grantSite, inspectSite, registerSite, replaceSiteKey } from '#lib/server/sites.ts';
import { RegistrationError, registrationMessage, scopeProfiles } from '#lib/server/registration-contract.ts';
import { globalAdmin, form, field } from '#lib/server/web.ts';
import { transaction, rows } from '#lib/server/db.ts';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = async (e) => {
    const s = globalAdmin(e);
    const sites = await listSites(s);
    /* Display data only: non-secret integration ids and the current grants (no key material is read). */
    const integrations = await transaction(c => rows<{ id: number; integration_id: number | null }>(c, 'SELECT id,integration_id FROM sites'));
    const grants = await transaction(c => rows<{ user_id: number; site_id: number; role: string; email: string }>(c, 'SELECT g.user_id,g.site_id,g.role,u.email FROM grants g JOIN users u ON u.id=g.user_id ORDER BY u.email'));
    return {
        sites: sites.map(site => ({ ...site, integrationId: integrations.find(i => i.id === site.id)?.integration_id ?? null })),
        accounts: await listAccounts(s),
        grants: grants.map(g => ({ user: g.user_id, site: g.site_id, role: g.role, email: g.email })),
        profile: scopeProfiles.management.label,
        scopes: [...scopeProfiles.management.scopes],
        csrf: e.locals.csrf
    };
};
/** Never echoes the key: only the catalog message, the missing scope names and non-secret fields come back to the page. */
function rejected(e: unknown, values: Record<string, string> = {}, action = 'register', site = 0) {
    const { code, message } = registrationMessage(e);
    return fail(code === 'rate_limited' ? 429 : 400, { error: message, code, missing: e instanceof RegistrationError ? e.missing : [], values, action, site });
}
async function readForm(e: Parameters<typeof form>[0]) {
    try {
        return await form(e);
    }
    catch {
        return null;
    }
}
const stale = (action: string) => fail(403, { error: 'Formulář je neplatný nebo prošel. Načtěte stránku znovu.', code: 'csrf', missing: [] as string[], values: {} as Record<string, string>, action, site: 0 });
export const actions: Actions = {
    register: async (e) => {
        const s = globalAdmin(e), f = await readForm(e);
        if (!f)
            return stale('register');
        const values = { name: field(f, 'name'), url: field(f, 'url') };
        try {
            const result = await registerSite(s, values.name, values.url, field(f, 'key'));
            return { registered: { id: result.id, name: values.name.trim(), url: result.url, integrationId: result.integrationId, version: result.version, resources: result.resources, extras: result.extras } };
        }
        catch (err) {
            return rejected(err, values, 'register');
        }
    },
    rotate: async (e) => {
        const s = globalAdmin(e), f = await readForm(e);
        if (!f)
            return stale('rotate');
        const site = Number(field(f, 'site'));
        try {
            if (!Number.isSafeInteger(site) || site < 1)
                throw new RegistrationError('invalid_input');
            return { rotated: { site, ...await replaceSiteKey(s, site, field(f, 'key')) } };
        }
        catch (err) {
            return rejected(err, {}, 'rotate', Number.isSafeInteger(site) ? site : 0);
        }
    },
    grant: async (e) => {
        const s = globalAdmin(e), f = await readForm(e);
        if (!f)
            return stale('grant');
        try {
            const user = Number(field(f, 'user')), site = Number(field(f, 'site'));
            if (!Number.isSafeInteger(user) || user < 1 || !Number.isSafeInteger(site) || site < 1)
                throw Error();
            await grantSite(s, user, site, field(f, 'role') as 'editor' | 'siteadmin');
            return { success: 'Oprávnění uloženo', action: 'grant' };
        }
        catch {
            return fail(400, { error: 'Oprávnění se nepodařilo uložit', action: 'grant' });
        }
    },
    inspect: async (e) => {
        const s = globalAdmin(e), f = await readForm(e);
        if (!f)
            return stale('inspect');
        const site = Number(field(f, 'site'));
        try {
            return { discovery: await inspectSite(s, site), site };
        }
        catch {
            return fail(400, { error: 'Discovery se nezdařilo. Ověřte TLS, DNS a scope discovery:read.', action: 'inspect', site });
        }
    }
};
