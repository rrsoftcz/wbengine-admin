/** Čas změny z webu: epocha v sekundách (číslo nebo číselný řetězec), případně hotový text. */
export function changeTime(value: unknown): string {
    const n = typeof value === 'number' ? value : /^[0-9]{9,12}$/.test(String(value ?? '')) ? Number(value) : NaN;
    if (!Number.isFinite(n))
        return String(value ?? '');
    return new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague' }).format(new Date(n * 1000));
}
/** Text "kdo": e-mail uživatele Adminu, nebo informace, že změna vznikla přímo na webu. */
export function changeActor(change: Record<string, unknown>, actors: Record<string, string>): string {
    const actor = String(change.central_actor ?? '');
    return actor ? (actors[actor] ?? actor) : 'přímo na webu';
}
/** Český popis typu změny z webu (action: create, update, delete, restore:N, draft.save, publish ...). */
export function changeLabel(action: unknown): string {
    const a = String(action ?? '');
    const known: Record<string, string> = { create: 'Vytvoření', update: 'Úprava', delete: 'Smazání', publish: 'Publikace', 'draft.create': 'Nový koncept', 'draft.save': 'Uložení konceptu', 'draft.restore': 'Obnovení konceptu', save: 'Uložení konceptu', restore: 'Obnovení' };
    return known[a] ?? (a.startsWith('restore:') ? 'Obnovení stavu' : a || 'Změna');
}
/** Názvy akcí odstranění podle typu záznamu: tlačítko, potvrzení (2. pád) a objekt věty (4. pád). */
export const deleteNames: Record<string, { button: string; confirm: string; object: string }> = {
    articles: { button: 'Smazat článek', confirm: 'Potvrzuji smazání článku', object: 'Článek' },
    pages: { button: 'Odstranit stránku', confirm: 'Potvrzuji odstranění stránky', object: 'Stránku' },
    menu: { button: 'Odstranit položku menu', confirm: 'Potvrzuji odstranění položky menu', object: 'Položku menu' },
    sections: { button: 'Odstranit sekci', confirm: 'Potvrzuji odstranění sekce', object: 'Sekci' },
    boxes: { button: 'Zrušit box', confirm: 'Potvrzuji zrušení boxu', object: 'Box' },
    images: { button: 'Odstranit obrázek', confirm: 'Potvrzuji odstranění obrázku', object: 'Obrázek' },
};
export function deleteName(resource: string) {
    return deleteNames[resource] ?? { button: 'Odstranit záznam', confirm: 'Potvrzuji odstranění', object: 'Záznam' };
}

/** Živá adresa stránky na webu: základ webu + odkaz stránky, u jiného než výchozího jazyka s jeho předponou. Null: odkaz nelze složit. */
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
