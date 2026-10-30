import { translator, type Translate, type MessageKey } from './i18n/index.ts';

/** Time of a change from the site: epoch in seconds (number or numeric string), or ready-made text. `locale` is an Intl tag (intl() / intlLocale()). */
export function changeTime(value: unknown, locale = 'en-GB'): string {
    const n = typeof value === 'number' ? value : /^[0-9]{9,12}$/.test(String(value ?? '')) ? Number(value) : NaN;
    if (!Number.isFinite(n))
        return String(value ?? '');
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague' }).format(new Date(n * 1000));
}
/** The "who" text: the Admin user's e-mail, or a note that the change was made directly on the site. */
export function changeActor(change: Record<string, unknown>, actors: Record<string, string>, t: Translate = translator('en')): string {
    const actor = String(change.central_actor ?? '');
    return actor ? (actors[actor] ?? actor) : t('content.actor.direct');
}
/** Description of a change type from the site (action: create, update, delete, restore:N, draft.save, publish ...). */
export function changeLabel(action: unknown, t: Translate = translator('en')): string {
    const a = String(action ?? '');
    const known: Record<string, MessageKey> = { create: 'content.change.create', update: 'content.change.update', delete: 'content.change.delete', publish: 'content.change.publish', 'draft.create': 'content.change.draftCreate', 'draft.save': 'content.change.draftSave', 'draft.restore': 'content.change.draftRestore', save: 'content.change.save', restore: 'content.change.restore' };
    if (Object.hasOwn(known, a))
        return t(known[a]);
    return a.startsWith('restore:') ? t('content.change.restoreState') : a || t('content.change.generic');
}
const deleteResources = ['articles', 'pages', 'menu', 'sections', 'boxes', 'images'];
/** Texts of delete actions by record type: button, confirmation and the object of the sentence. */
export function deleteName(resource: string, t: Translate): { button: string; confirm: string; object: string } {
    const r = deleteResources.includes(resource) ? resource : 'record';
    return { button: t(`content.delete.${r}.button` as MessageKey), confirm: t(`content.delete.${r}.confirm` as MessageKey), object: t(`content.delete.${r}.object` as MessageKey) };
}

/** Live address of a page on the site: site base + page link, with a language prefix for a non-default language. Null: the link cannot be composed. */
export function liveUrl(baseUrl: string, link: unknown, locale = '', defaultLocale = ''): string | null {
    const path = String(link ?? '').trim();
    if (!path || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//'))
        return null;
    try {
        const prefix = locale && locale !== defaultLocale ? '/' + locale : '';
        return new URL(prefix + (path.startsWith('/') ? path : '/' + path), baseUrl).href;
    }
    catch {
        return null;
    }
}
