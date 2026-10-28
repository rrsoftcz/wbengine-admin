import type { Resource } from './server/api-contract.ts';
export interface Field {
    name: string;
    label: string;
    kind?: 'number' | 'textarea' | 'boolean' | 'format' | 'json' | 'ids';
    /** Povinná přítomnost JSON klíče při založení, nikoli zákaz prázdného textu. */
    required?: boolean;
    max?: number;
}
export const labels: Record<Resource, string> = { articles: 'Články', pages: 'Stránky', menu: 'Menu', sections: 'Sekce', boxes: 'Boxy', images: 'Obrázky' };
const text = (name: string, label: string, max: number, required = false): Field => ({ name, label, max, required });
const num = (name: string, label: string): Field => ({ name, label, kind: 'number' });
const bool = (name: string, label: string): Field => ({ name, label, kind: 'boolean' });
export const schemas: Record<Resource, Field[]> = {
    articles: [num('site_id', 'Stránka, na které se článek zobrazí'), text('title', 'Titulek', 255, true), { name: 'introtext', label: 'Úvod', kind: 'textarea', max: 65535, required: true }, { name: 'bodytext', label: 'Text článku', kind: 'textarea', max: 65535, required: true }, { name: 'content_format', label: 'Formát textu', kind: 'format' }, text('author', 'Autor', 255), text('source', 'Zdroj', 255)],
    pages: [num('parent_id', 'Nadřazená stránka'), text('link', 'Místní URL, například /o-nas', 100, true), text('title', 'Název', 120, true), text('html_title', 'SEO titulek', 120), text('html_description', 'SEO popis', 170), text('html_keywords', 'Klíčová slova', 255), bool('visible', 'Viditelnost'), bool('strict', 'Přesná shoda URL'), bool('acl', 'Vyžadovat oprávnění')],
    menu: [num('site_id', 'Stránka webu'), text('name', 'Název položky', 100, true), text('description', 'Popis', 50), num('parent', 'Nadřazená položka menu'), num('type', 'Typ menu, 0–127'), num('order', 'Pořadí, 0–127'), bool('visible', 'Viditelnost')],
    sections: [text('key', 'Klíč sekce', 45, true), text('title', 'Název', 100, true), text('description', 'Popis', 150), bool('active', 'Aktivní'), num('return_error_code', 'Chybový HTTP stav, 0 nebo 400–599')],
    boxes: [text('name', 'Název boxu', 100, true), text('type', 'Registrovaný typ', 45, true), num('section_id', 'Sekce'), { name: 'settings', label: 'Nastavení registrovaného typu', kind: 'json' }, bool('static', 'Statický'), bool('shared', 'Sdílený'), num('device_min', 'Minimální zařízení, 0–3'), bool('device_strict', 'Přesná shoda zařízení'), num('order', 'Pořadí, 0–127'), { name: 'sites', label: 'ID stránek oddělená čárkou', kind: 'ids' }], images: []
};
export const translationFields: Partial<Record<Resource, string[]>> = { articles: ['title', 'introtext', 'bodytext', 'content_format'], pages: ['title', 'html_title', 'html_description', 'html_keywords'], menu: ['name', 'description'] };
export function defaults(resource: Resource): Record<string, unknown> {
    return Object.fromEntries(schemas[resource].map(f => [f.name, f.kind === 'number' || f.kind === 'boolean' ? 0 : f.kind === 'ids' ? [] : f.kind === 'json' ? {} : f.kind === 'format' ? 'markdown' : '']));
}
export function idOf(resource: Resource, row: Record<string, unknown>): string {
    return String(row[({ pages: 'site_id', menu: 'menu_id', sections: 'section_id', images: 'image_id' } as Partial<Record<Resource, string>>)[resource] ?? 'id']);
}
