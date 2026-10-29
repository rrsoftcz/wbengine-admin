<script lang="ts">
    import { enhance } from '$app/forms';
    import ErrorBox from './ErrorBox.svelte';
    import { focusOnMount } from './focus';
    type Form = { action?: string; site?: number; error?: string; code?: string; missing?: string[]; rotated?: { site: number; integrationId: number; previousIntegrationId?: number | null } } | null | undefined;
    let { site, csrf, form }: { site: { id: number; name: string; integrationId: number | null }; csrf: string; form: Form } = $props();
    let pending = $state(false);
    let confirmed = false;
    let dialog: HTMLDialogElement;
    let formEl: HTMLFormElement;
    let keyEl: HTMLInputElement;
    const mine = $derived(form?.site === site.id || form?.rotated?.site === site.id);
</script>

<details class="rounded-xl border border-line bg-surface-2 px-4 py-3" open={mine && !!form?.error}>
    <summary class="text-sm font-semibold">Replace integration key</summary>
    <ol class="mt-3 space-y-1 pl-5 text-sm text-muted [list-style:decimal]">
        <li>On the target site, issue a new key with the Site administration profile. Do not delete the old one yet.</li>
        <li>Paste the new key here. It is verified first and only then replaces the old one, so there is no downtime.</li>
        <li>Once the replacement is confirmed, revoke the old key on the target site.</li>
    </ol>
    <form bind:this={formEl} method="POST" action="?/rotate" autocomplete="off" class="mt-4 grid gap-3" aria-busy={pending}
        use:enhance={({ cancel }) => {
            if (!confirmed) { cancel(); dialog.showModal(); return; }
            confirmed = false;
            pending = true;
            queueMicrotask(() => (keyEl.value = ''));
            return async ({ update }) => { pending = false; keyEl.value = ''; await update({ reset: false }); };
        }}>
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="site" value={site.id} />
        <label class="field"><span>New integration key</span>
            <input bind:this={keyEl} name="key" type="password" autocomplete="off" required minlength="25" maxlength="205" spellcheck="false" data-1p-ignore disabled={pending} />
        </label>
        <div><button class="btn btn-primary btn-sm" disabled={pending} aria-busy={pending}>{#if pending}<span class="spinner" aria-hidden="true"></span>Verifying key{:else}Verify and replace key{/if}</button></div>
    </form>
    <dialog bind:this={dialog} class="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-6 text-text shadow-card backdrop:bg-black/50" aria-labelledby={'rot-' + site.id}>
        <h3 id={'rot-' + site.id}>Replace the key of site {site.name}?</h3>
        <p class="mt-2 text-sm text-muted">The new key is verified first. If that fails, the original key stays unchanged. After a successful replacement you must revoke the old key on the target site.</p>
        <div class="mt-5 flex justify-end gap-2">
            <button type="button" class="btn btn-secondary btn-sm" onclick={() => dialog.close()}>Cancel</button>
            <button type="button" class="btn btn-primary btn-sm" onclick={() => { confirmed = true; dialog.close(); formEl.requestSubmit(); }}>Yes, replace</button>
        </div>
    </dialog>
</details>

{#key form}
    {#if mine && form?.action === 'rotate' && form.error}
        <div class="mt-3"><ErrorBox error={form.error} code={form.code} missing={form.missing} /></div>
    {:else if form?.rotated?.site === site.id}
        <div class="mt-3 rounded-xl border-2 border-warn bg-warn-soft p-4 text-warn" role="status" tabindex="-1" use:focusOnMount>
            <p class="font-bold">The key has been replaced. One last step remains.</p>
            <p class="mt-1 text-sm">The new key is verified (integration no. {form.rotated.integrationId}).
                {#if form.rotated.previousIntegrationId}
                    Now revoke the original key on the target site, integration no. <strong>{form.rotated.previousIntegrationId}</strong>.
                {:else}
                    Now revoke the original key on the target site.
                {/if}
                Until you do, the old key remains valid.</p>
        </div>
    {/if}
{/key}
