import type { SubmitFunction } from '$app/forms';

/**
 * Shared progressive enhancement for authentication forms.
 * Shows the pending state, never resets e-mail style fields, and always wipes secrets
 * (passwords, codes, tokens marked with data-secret) after the server answers.
 */
export function authEnhance(setPending: (value: boolean) => void): SubmitFunction {
    return ({ formElement }) => {
        setPending(true);
        return async ({ update }) => {
            await update({ reset: false });
            formElement.querySelectorAll<HTMLInputElement>('input[type="password"], input[data-secret]').forEach((input) => {
                input.value = '';
                input.dispatchEvent(new Event('input', { bubbles: true }));
            });
            setPending(false);
        };
    };
}
