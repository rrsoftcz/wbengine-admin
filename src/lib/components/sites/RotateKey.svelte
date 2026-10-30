<script lang="ts">
    import { enhance } from '$app/forms';
    import ErrorBox from './ErrorBox.svelte';
    import { focusOnMount } from './focus';
    import { t } from '#lib/i18n/client.ts';
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
    <summary class="text-sm font-semibold">{t('sites.rotate.summary')}</summary>
    <ol class="mt-3 space-y-1 pl-5 text-sm text-muted [list-style:decimal]">
        <li>{t('sites.rotate.step1')}</li>
        <li>{t('sites.rotate.step2')}</li>
        <li>{t('sites.rotate.step3')}</li>
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
        <label class="field"><span>{t('sites.rotate.keyLabel')}</span>
            <input bind:this={keyEl} name="key" type="password" autocomplete="off" required minlength="25" maxlength="205" spellcheck="false" data-1p-ignore disabled={pending} />
        </label>
        <div><button class="btn btn-primary btn-sm" disabled={pending} aria-busy={pending}>{#if pending}<span class="spinner" aria-hidden="true"></span>{t('sites.rotate.verifyingKey')}{:else}{t('sites.rotate.submit')}{/if}</button></div>
    </form>
    <dialog bind:this={dialog} class="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-6 text-text shadow-card backdrop:bg-black/50" aria-labelledby={'rot-' + site.id}>
        <h3 id={'rot-' + site.id}>{t('sites.rotate.confirmTitle', { name: site.name })}</h3>
        <p class="mt-2 text-sm text-muted">{t('sites.rotate.confirmText')}</p>
        <div class="mt-5 flex justify-end gap-2">
            <button type="button" class="btn btn-secondary btn-sm" onclick={() => dialog.close()}>{t('sites.rotate.cancel')}</button>
            <button type="button" class="btn btn-primary btn-sm" onclick={() => { confirmed = true; dialog.close(); formEl.requestSubmit(); }}>{t('sites.rotate.confirm')}</button>
        </div>
    </dialog>
</details>

{#key form}
    {#if mine && form?.action === 'rotate' && form.error}
        <div class="mt-3"><ErrorBox error={form.error} code={form.code} missing={form.missing} /></div>
    {:else if form?.rotated?.site === site.id}
        <div class="mt-3 rounded-xl border-2 border-warn bg-warn-soft p-4 text-warn" role="status" tabindex="-1" use:focusOnMount>
            <p class="font-bold">{t('sites.rotate.done')}</p>
            <p class="mt-1 text-sm">{t('sites.rotate.verified', { id: form.rotated.integrationId })}
                {#if form.rotated.previousIntegrationId}
                    {t('sites.rotate.revokePrevious', { id: form.rotated.previousIntegrationId })}
                {:else}
                    {t('sites.rotate.revoke')}
                {/if}
                {t('sites.rotate.stillValid')}</p>
        </div>
    {/if}
{/key}
