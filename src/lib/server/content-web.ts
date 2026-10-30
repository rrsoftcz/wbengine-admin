import { error } from '@sveltejs/kit';
import { getRequestEvent } from '$app/server';
import { RemoteFailure, remoteMessage } from './api-contract.ts';

export { remoteMessage };

/** Runs a load function and turns a remote failure into a SvelteKit error with a translated message. */
export async function contentLoad<T>(action: () => Promise<T>): Promise<T> {
    const { locals } = getRequestEvent();
    try {
        return await action();
    }
    catch (cause) {
        if (cause instanceof RemoteFailure)
            error(cause.status >= 400 && cause.status <= 599 ? cause.status : 502, remoteMessage(locals.t, cause));
        throw cause;
    }
}
