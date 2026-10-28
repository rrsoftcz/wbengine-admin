import { fail } from '@sveltejs/kit';
import { listSites, listAccounts, grantSite, inspectSite, registerSite, replaceSiteKey } from '#lib/server/sites.ts';
import { RegistrationError, registrationMessage, scopeProfiles } from '#lib/server/registration-contract.ts';
import { globalAdmin, form, field } from '#lib/server/web.ts';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = async (e) => {
    const s = globalAdmin(e);
    return { sites: await listSites(s), accounts: await listAccounts(s), profile: scopeProfiles.management.label, csrf: e.locals.csrf };
};
/** Never echoes the key: only the catalog message, the missing scope names and non-secret fields come back to the page. */
function rejected(e: unknown, values: Record<string, string> = {}) {
    const { code, message } = registrationMessage(e);
    return fail(code === 'rate_limited' ? 429 : 400, { error: message, code, missing: e instanceof RegistrationError ? e.missing : [], values });
}
async function readForm(e: Parameters<typeof form>[0]) {
    try {
        return await form(e);
    }
    catch {
        return null;
    }
}
const stale = () => fail(403, { error: 'Formulář je neplatný nebo prošel. Načtěte stránku znovu.', code: 'csrf', missing: [] as string[], values: {} as Record<string, string> });
export const actions: Actions = {
    register: async (e) => {
        const s = globalAdmin(e), f = await readForm(e);
        if (!f)
            return stale();
        const values = { name: field(f, 'name'), url: field(f, 'url') };
        try {
            const result = await registerSite(s, values.name, values.url, field(f, 'key'));
            return { registered: { id: result.id, name: values.name.trim(), url: result.url, integrationId: result.integrationId, version: result.version, resources: result.resources, extras: result.extras } };
        }
        catch (err) {
            return rejected(err, values);
        }
    },
    rotate: async (e) => {
        const s = globalAdmin(e), f = await readForm(e);
        if (!f)
            return stale();
        try {
            const site = Number(field(f, 'site'));
            if (!Number.isSafeInteger(site) || site < 1)
                throw new RegistrationError('invalid_input');
            return { rotated: { site, ...await replaceSiteKey(s, site, field(f, 'key')) } };
        }
        catch (err) {
            return rejected(err);
        }
    },
    grant: async (e) => {
        const s = globalAdmin(e), f = await readForm(e);
        if (!f)
            return stale();
        try {
            const user = Number(field(f, 'user')), site = Number(field(f, 'site'));
            if (!Number.isSafeInteger(user) || user < 1 || !Number.isSafeInteger(site) || site < 1)
                throw Error();
            await grantSite(s, user, site, field(f, 'role') as 'editor' | 'siteadmin');
            return { success: 'Oprávnění uloženo' };
        }
        catch {
            return fail(400, { error: 'Oprávnění se nepodařilo uložit' });
        }
    },
    inspect: async (e) => {
        const s = globalAdmin(e), f = await readForm(e);
        if (!f)
            return stale();
        try {
            return { discovery: await inspectSite(s, Number(field(f, 'site'))) };
        }
        catch {
            return fail(400, { error: 'Discovery se nezdařilo. Ověřte TLS, DNS a scope discovery:read.' });
        }
    }
};
