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
