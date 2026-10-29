export const resourceLabels: Record<string, string> = {
    discovery: 'Capability overview',
    articles: 'Articles',
    pages: 'Pages',
    menu: 'Menu',
    sections: 'Sections',
    boxes: 'Boxes',
    translations: 'Translations',
    images: 'Images',
    templates: 'Templates',
    preview: 'Preview',
    publish: 'Publishing'
};
export type Resource = { name: string; read: boolean; write: boolean };
export const siteHost = (url: string) => { try { return new URL(url).host; } catch { return url.replace(/^https?:\/\//, '').replace(/\/$/, ''); } };
export const roleLabel = (role: string) => role === 'global' ? 'Global admin' : role === 'siteadmin' ? 'Site admin' : 'Editor';
