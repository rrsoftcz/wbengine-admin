import type { Translate } from '#lib/i18n/index.ts';
const resourceKeys = {
    discovery: 'sites.resource.discovery',
    articles: 'sites.resource.articles',
    pages: 'sites.resource.pages',
    menu: 'sites.resource.menu',
    sections: 'sites.resource.sections',
    boxes: 'sites.resource.boxes',
    translations: 'sites.resource.translations',
    images: 'sites.resource.images',
    templates: 'sites.resource.templates',
    preview: 'sites.resource.preview',
    publish: 'sites.resource.publish'
} as const;

export type Resource = { name: string; read: boolean; write: boolean };
export const siteHost = (url: string) => { try { return new URL(url).host; } catch { return url.replace(/^https?:\/\//, '').replace(/\/$/, ''); } };
export const resourceLabel = (name: string, t: Translate) => name in resourceKeys ? t(resourceKeys[name as keyof typeof resourceKeys]) : name;
export const roleLabel = (role: string, t: Translate) => role === 'global' ? t('sites.role.global') : role === 'siteadmin' ? t('sites.role.siteadmin') : t('sites.role.editor');
