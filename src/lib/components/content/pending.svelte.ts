import { tick } from 'svelte';
import type { ActionResult, SubmitFunction } from '$app/forms';

/**
 * Společný stav odesílání formulářů přes use:enhance: která akce právě běží, stav posledního
 * neúspěšného výsledku a přesun fokusu na zprávu s výsledkem (#vysledek).
 */
export function createPending(options: { reset?: boolean; onResult?: (result: ActionResult) => void } = {}) {
    let current = $state('');
    let status = $state(0);
    const submit: SubmitFunction = ({ action }) => {
        current = action.search || '?';
        status = 0;
        return async ({ result, update }) => {
            status = result.type === 'failure' ? result.status : result.type === 'error' ? 599 : 0;
            options.onResult?.(result);
            await update({ reset: options.reset ?? false });
            current = '';
            await tick();
            document.getElementById('vysledek')?.focus();
        };
    };
    return {
        get current() { return current; },
        get status() { return status; },
        submit,
        is: (action: string) => current === action
    };
}
