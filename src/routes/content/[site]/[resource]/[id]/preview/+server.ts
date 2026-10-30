import { error } from '@sveltejs/kit';
import { signedIn } from '#lib/server/web.ts';
import { connectContent, siteId, renderPreviewDocument } from '#lib/server/content.ts';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async (e) => {
    if (e.params.resource !== 'articles')
        error(404);
    const { gateway } = await connectContent(signedIn(e), siteId(e.params.site)), result = await gateway.preview(e.params.id, e.url.searchParams.get('locale') ?? undefined), v = result.data as {
        title: string;
        introtext: string;
        bodytext: string;
        private: boolean;
    };
    if (v?.private !== true || ![v.title, v.introtext, v.bodytext].every(x => typeof x === 'string'))
        error(502, e.locals.t('content.preview.invalid'));
    return new Response(renderPreviewDocument(v, e.locals.locale), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox; frame-ancestors 'self'", 'X-Content-Type-Options': 'nosniff' } });
};
