import { error, fail } from '@sveltejs/kit';
import { RemoteFailure } from '#lib/server/api-contract.ts';
import { connectContent, siteId } from '#lib/server/content.ts';
import { contentLoad, remoteMessage } from '#lib/server/content-web.ts';
import type { ConfigNode, ConfigValue } from '#lib/server/siteadmin.ts';
import { transaction } from '#lib/server/db.ts';
import { form, signedIn } from '#lib/server/web.ts';
import type { Actions, PageServerLoad } from './$types';

/** Dotted path and display text for every leaf of the settings tree, bounded. */
function flatten(node: ConfigValue, prefix = '', out: { path: string; value: string; secret: boolean }[] = []) {
    if (out.length >= 600) return out;
    if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
        for (const [k, v] of Object.entries(node)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
    } else {
        const value = Array.isArray(node) ? JSON.stringify(node) : node === null ? 'null' : String(node);
        out.push({ path: prefix, value, secret: value === 'set' });
    }
    return out;
}

export const load: PageServerLoad = async (e) => {
    e.setHeaders({ 'Cache-Control': 'no-store, private' });
    return contentLoad(async () => {
        const c = await connectContent(signedIn(e), siteId(e.params.site));
        const admin = c.admin;
        const canConfig = admin?.canReadConfig() ?? false, canFlush = admin?.canFlushCache() ?? false;
        if (!admin || (!canConfig && !canFlush)) {
            if (admin?.needsNewKey())
                return { site: c.site, available: false as const };
            error(403, e.locals.t('errors.forbidden'));
        }
        const settings: ConfigNode | null = canConfig ? await admin.config() : null;
        return { site: c.site, available: true as const, rows: settings ? flatten(settings) : null, canFlush, csrf: e.locals.csrf };
    });
};

export const actions: Actions = {
    flush: async (e) => {
        const id = siteId(e.params.site!);
        try {
            await form(e);
            const session = signedIn(e);
            const c = await connectContent(session, id);
            if (!c.admin) throw new RemoteFailure(403, 'forbidden');
            await c.admin.flushCache();
            await transaction(conn => conn.execute('INSERT INTO audit(user_id,site_id,event) VALUES (?,?,?)', [session.user.id, id, 'site.cache.flushed']));
            return { done: e.locals.t('sitesettings.flushed') };
        }
        catch (cause) {
            const c = cause as { cause?: unknown };
            const remote = cause instanceof RemoteFailure ? cause : c?.cause instanceof RemoteFailure ? c.cause : null;
            return fail(400, { error: remote ? remoteMessage(e.locals.t, remote) : e.locals.t('sitesettings.error.failed') });
        }
    }
};
