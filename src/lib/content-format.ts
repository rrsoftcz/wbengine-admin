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
