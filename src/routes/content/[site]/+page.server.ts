import {contentLoad} from '#lib/server/content-web.ts';
import { connectContent, siteId, canOperate, resources } from '#lib/server/content.ts';
import { signedIn } from '#lib/server/web.ts';
import { canReadAnalytics } from '#lib/server/analytics.ts';
import { canReadActivity } from '#lib/server/activity.ts';
import { canManageUsers, canReadConfig, canFlushCache } from '#lib/server/siteadmin.ts';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async (e) => contentLoad(async()=>{
    const { site, gateway } = await connectContent(signedIn(e), siteId(e.params.site));
    return { site, analytics: canReadAnalytics(gateway.role, gateway.scopes, gateway.capabilities), activity: canReadActivity(gateway.role, gateway.scopes, gateway.capabilities), siteUsers: canManageUsers(gateway.role, gateway.scopes, gateway.capabilities).read, siteSettings: canReadConfig(gateway.role, gateway.scopes, gateway.capabilities) || canFlushCache(gateway.role, gateway.scopes, gateway.capabilities), resources: resources.map(name => ({ name, read: canOperate(gateway.role, gateway.scopes, gateway.capabilities, 'read', name), write: canOperate(gateway.role, gateway.scopes, gateway.capabilities, 'save', name) })) };
});
