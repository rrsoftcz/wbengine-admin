import type { Resource } from './server/api-contract.ts';
import type { MessageKey } from './i18n/index.ts';
export interface Field {
    name: string;
    /** Catalog key of the label (fields.<resource>.<field>); translate it where it is displayed. */
    label: MessageKey;
    kind?: 'number' | 'textarea' | 'boolean' | 'format' | 'json' | 'ids' | 'device';
    /** The JSON key must be present on creation; this does not forbid empty text. */
    required?: boolean;
    max?: number;
}
/** Catalog keys of the content type names. */
export const labels: Record<Resource, MessageKey> = { articles: 'content.resource.articles', pages: 'content.resource.pages', menu: 'content.resource.menu', sections: 'content.resource.sections', boxes: 'content.resource.boxes', images: 'content.resource.images' };
const key = (resource: Resource, name: string) => `fields.${resource}.${name}` as MessageKey;
const text = (resource: Resource, name: string, max: number, required = false): Field => ({ name, label: key(resource, name), max, required });
const num = (resource: Resource, name: string): Field => ({ name, label: key(resource, name), kind: 'number' });
const bool = (resource: Resource, name: string): Field => ({ name, label: key(resource, name), kind: 'boolean' });
const other = (resource: Resource, name: string, kind: NonNullable<Field['kind']>, max?: number, required?: boolean): Field => ({ name, label: key(resource, name), kind, ...(max ? { max } : {}), ...(required !== undefined ? { required } : {}) });
export const schemas: Record<Resource, Field[]> = {
    articles: [num('articles', 'site_id'), text('articles', 'title', 255, true), other('articles', 'introtext', 'textarea', 65535, true), other('articles', 'bodytext', 'textarea', 65535, true), other('articles', 'content_format', 'format'), text('articles', 'author', 255), text('articles', 'source', 255)],
    pages: [num('pages', 'parent_id'), text('pages', 'link', 100, true), text('pages', 'title', 120, true), text('pages', 'html_title', 120), text('pages', 'html_description', 170), text('pages', 'html_keywords', 255), bool('pages', 'visible'), bool('pages', 'strict'), bool('pages', 'acl')],
    menu: [num('menu', 'site_id'), text('menu', 'name', 100, true), text('menu', 'description', 50), num('menu', 'parent'), num('menu', 'type'), num('menu', 'order'), bool('menu', 'visible')],
    sections: [text('sections', 'key', 45, true), text('sections', 'title', 100, true), text('sections', 'description', 150), bool('sections', 'active'), num('sections', 'return_error_code')],
    boxes: [text('boxes', 'name', 100, true), text('boxes', 'type', 45, true), num('boxes', 'section_id'), other('boxes', 'settings', 'json'), bool('boxes', 'static'), bool('boxes', 'shared'), other('boxes', 'device_min', 'device'), bool('boxes', 'device_strict'), num('boxes', 'order'), other('boxes', 'sites', 'ids')], images: []
};
export const translationFields: Partial<Record<Resource, string[]>> = { articles: ['title', 'introtext', 'bodytext', 'content_format'], pages: ['title', 'html_title', 'html_description', 'html_keywords'], menu: ['name', 'description'] };
export function defaults(resource: Resource): Record<string, unknown> {
    return Object.fromEntries(schemas[resource].map(f => [f.name, f.kind === 'number' || f.kind === 'boolean' ? 0 : f.kind === 'ids' ? [] : f.kind === 'json' ? {} : f.kind === 'format' ? 'markdown' : '']));
}
export function idOf(resource: Resource, row: Record<string, unknown>): string {
    return String(row[({ pages: 'site_id', menu: 'menu_id', sections: 'section_id', images: 'image_id' } as Partial<Record<Resource, string>>)[resource] ?? 'id']);
}

/** Device classes of the framework (Application/Env/Const.php): the value is the minimum class a box is meant for. */
export const deviceOptions: { value: number; label: MessageKey }[] = [
    { value: 0, label: 'fields.device.any' },
    { value: 1, label: 'fields.device.mobile' },
    { value: 2, label: 'fields.device.tablet' },
    { value: 3, label: 'fields.device.desktop' }
];
