import type { Resource } from './server/api-contract.ts';
export interface Field {
    name: string;
    label: string;
    kind?: 'number' | 'textarea' | 'boolean' | 'format' | 'json' | 'ids' | 'device';
    /** The JSON key must be present on creation; this does not forbid empty text. */
    required?: boolean;
    max?: number;
}
export const labels: Record<Resource, string> = { articles: 'Articles', pages: 'Pages', menu: 'Menu', sections: 'Sections', boxes: 'Boxes', images: 'Images' };
const text = (name: string, label: string, max: number, required = false): Field => ({ name, label, max, required });
const num = (name: string, label: string): Field => ({ name, label, kind: 'number' });
const bool = (name: string, label: string): Field => ({ name, label, kind: 'boolean' });
export const schemas: Record<Resource, Field[]> = {
    articles: [num('site_id', 'Page the article is shown on'), text('title', 'Title', 255, true), { name: 'introtext', label: 'Intro', kind: 'textarea', max: 65535, required: true }, { name: 'bodytext', label: 'Article text', kind: 'textarea', max: 65535, required: true }, { name: 'content_format', label: 'Text format', kind: 'format' }, text('author', 'Author', 255), text('source', 'Source', 255)],
    pages: [num('parent_id', 'Parent page'), text('link', 'Page address, for example /about/', 100, true), text('title', 'Name', 120, true), text('html_title', 'SEO title', 120), text('html_description', 'SEO description', 170), text('html_keywords', 'Keywords', 255), bool('visible', 'Visibility'), bool('strict', 'Exact URL match'), bool('acl', 'Require permission')],
    menu: [num('site_id', 'Site page'), text('name', 'Item name', 100, true), text('description', 'Description', 50), num('parent', 'Parent menu item'), num('type', 'Menu type, 0–127'), num('order', 'Order, 0–127'), bool('visible', 'Visibility')],
    sections: [text('key', 'Section key', 45, true), text('title', 'Name', 100, true), text('description', 'Description', 150), bool('active', 'Active'), num('return_error_code', 'HTTP error status, 0 or 400–599')],
    boxes: [text('name', 'Box name', 100, true), text('type', 'Registered type', 45, true), num('section_id', 'Section'), { name: 'settings', label: 'Registered type settings', kind: 'json' }, bool('static', 'Static'), bool('shared', 'Shared'), { name: 'device_min', label: 'Minimum device', kind: 'device' }, bool('device_strict', 'Exact device match'), num('order', 'Order, 0–127'), { name: 'sites', label: 'Pages the box appears on (IDs separated by commas)', kind: 'ids' }], images: []
};
export const translationFields: Partial<Record<Resource, string[]>> = { articles: ['title', 'introtext', 'bodytext', 'content_format'], pages: ['title', 'html_title', 'html_description', 'html_keywords'], menu: ['name', 'description'] };
export function defaults(resource: Resource): Record<string, unknown> {
    return Object.fromEntries(schemas[resource].map(f => [f.name, f.kind === 'number' || f.kind === 'boolean' ? 0 : f.kind === 'ids' ? [] : f.kind === 'json' ? {} : f.kind === 'format' ? 'markdown' : '']));
}
export function idOf(resource: Resource, row: Record<string, unknown>): string {
    return String(row[({ pages: 'site_id', menu: 'menu_id', sections: 'section_id', images: 'image_id' } as Partial<Record<Resource, string>>)[resource] ?? 'id']);
}

/** Device classes of the framework (Application/Env/Const.php): the value is the minimum class a box is meant for. */
export const deviceOptions = [
    { value: 0, label: 'Any device' },
    { value: 1, label: 'Mobile' },
    { value: 2, label: 'Tablet' },
    { value: 3, label: 'Desktop PC' }
];
