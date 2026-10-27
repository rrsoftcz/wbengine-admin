import { error } from '@sveltejs/kit';
import { connectContent, siteId } from '#lib/server/content.ts';
import { contentLoad } from '#lib/server/content-web.ts';
import { parseAnalyticsRange } from '#lib/server/analytics.ts';
import { signedIn } from '#lib/server/web.ts';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async (e) => {
    e.setHeaders({ 'Cache-Control': 'no-store, private' });
    return contentLoad(async () => {
        const session = signedIn(e);
        const id = siteId(e.params.site);
        let range;
        try { range = parseAnalyticsRange(e.url.searchParams); }
        catch { error(400, 'Vyberte platné období do 62 dnů.'); }
        const connection = await connectContent(session, id);
        if (!connection.analytics?.supported()) return { site: connection.site, available: false, range };
        if (!connection.analytics.canRead()) error(403, 'Pro analytiku chybí oprávnění integračního klíče.');
        const overview = await connection.analytics.overview(range);
        return { site: connection.site, available: true, range, overview };
    });
};
