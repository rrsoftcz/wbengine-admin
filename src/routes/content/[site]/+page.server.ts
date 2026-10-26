import {contentLoad} from '#lib/server/content-web.ts';
import { connectContent, siteId, canOperate, resources } from '#lib/server/content.ts';
import { signedIn } from '#lib/server/web.ts';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async (e) => contentLoad(async()=>{
    const { site, gateway } = await connectContent(signedIn(e), siteId(e.params.site));
    return { site, resources: resources.map(name => ({ name, read: canOperate(gateway.role, gateway.scopes, gateway.capabilities, 'read', name), write: canOperate(gateway.role, gateway.scopes, gateway.capabilities, 'save', name) })) };
});
