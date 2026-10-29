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
        catch { error(400, 'Choose a valid period of up to 62 days.'); }
        const connection = await connectContent(session, id);
        const blockers = connection.analytics?.blockers() ?? ['disabled'];
        if (!connection.analytics || blockers.length) return { site: connection.site, available: false, blockers, range };
        const overview = await connection.analytics.overview(range);
        return { site: connection.site, available: true, blockers: [] as string[], range, overview };
    });
};
