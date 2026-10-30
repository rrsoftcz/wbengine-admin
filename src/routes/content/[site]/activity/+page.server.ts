import { error } from '@sveltejs/kit';
import { connectContent, siteId, loadActors } from '#lib/server/content.ts';
import { contentLoad } from '#lib/server/content-web.ts';
import { parseFeedQuery } from '#lib/server/activity.ts';
import { signedIn } from '#lib/server/web.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (e) => {
    e.setHeaders({ 'Cache-Control': 'no-store, private' });
    return contentLoad(async () => {
        const session = signedIn(e);
        const connection = await connectContent(session, siteId(e.params.site));
        const feed = connection.activity;
        if (!feed?.canRead()) {
            if (feed?.needsNewKey())
                return { site: connection.site, available: false as const, reason: 'key' as const };
            error(403, e.locals.t('errors.forbidden'));
        }
        const query = parseFeedQuery(e.url.searchParams);
        if (query.outcome === 'rejected') {
            const page = await feed.rejected(query);
            const actors = await loadActors(page.items.map(x => ({ central_actor: x.actor })), e.locals.t);
            return { site: connection.site, available: true as const, query, kind: 'rejected' as const, page, actors };
        }
        const page = await feed.applied(query);
        const actors = await loadActors(page.items.map(x => ({ central_actor: x.actor })), e.locals.t);
        return { site: connection.site, available: true as const, query, kind: 'applied' as const, page, actors };
    });
};
