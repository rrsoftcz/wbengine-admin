/** Time of a change from the site: epoch in seconds (number or numeric string), or ready-made text. */
export function changeTime(value: unknown): string {
    const n = typeof value === 'number' ? value : /^[0-9]{9,12}$/.test(String(value ?? '')) ? Number(value) : NaN;
    if (!Number.isFinite(n))
        return String(value ?? '');
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague' }).format(new Date(n * 1000));
}
/** The "who" text: the Admin user's e-mail, or a note that the change was made directly on the site. */
export function changeActor(change: Record<string, unknown>, actors: Record<string, string>): string {
    const actor = String(change.central_actor ?? '');
    return actor ? (actors[actor] ?? actor) : 'directly on the site';
}
/** English description of a change type from the site (action: create, update, delete, restore:N, draft.save, publish ...). */
export function changeLabel(action: unknown): string {
    const a = String(action ?? '');
    const known: Record<string, string> = { create: 'Creation', update: 'Edit', delete: 'Deletion', publish: 'Publication', 'draft.create': 'New draft', 'draft.save': 'Draft saved', 'draft.restore': 'Draft restored', save: 'Draft saved', restore: 'Restore' };
    return known[a] ?? (a.startsWith('restore:') ? 'Restore of state' : a || 'Change');
}
/** Names of delete actions by record type: button, confirmation and the object of the sentence. */
export const deleteNames: Record<string, { button: string; confirm: string; object: string }> = {
    articles: { button: 'Delete article', confirm: 'I confirm deleting the article', object: 'Article' },
    pages: { button: 'Remove page', confirm: 'I confirm removing the page', object: 'Page' },
    menu: { button: 'Remove menu item', confirm: 'I confirm removing the menu item', object: 'Menu item' },
    sections: { button: 'Remove section', confirm: 'I confirm removing the section', object: 'Section' },
    boxes: { button: 'Remove box', confirm: 'I confirm removing the box', object: 'Box' },
    images: { button: 'Remove image', confirm: 'I confirm removing the image', object: 'Image' },
};
export function deleteName(resource: string) {
    return deleteNames[resource] ?? { button: 'Remove record', confirm: 'I confirm removal', object: 'Record' };
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
