export const resourceLabels: Record<string, string> = {
    discovery: 'Přehled schopností',
    articles: 'Články',
    pages: 'Stránky',
    menu: 'Menu',
    sections: 'Sekce',
    boxes: 'Boxy',
    translations: 'Překlady',
    images: 'Obrázky',
    templates: 'Šablony',
    preview: 'Náhled',
    publish: 'Publikování'
};
export type Resource = { name: string; read: boolean; write: boolean };
export const siteHost = (url: string) => { try { return new URL(url).host; } catch { return url.replace(/^https?:\/\//, '').replace(/\/$/, ''); } };
export const roleLabel = (role: string) => role === 'global' ? 'Globální správce' : role === 'siteadmin' ? 'Správce webu' : 'Editor';
