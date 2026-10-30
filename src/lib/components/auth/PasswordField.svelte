<script lang="ts">
    import { onMount } from 'svelte';
    import { t } from '#lib/i18n/client.ts';
    let { name = 'password', label, autocomplete, minlength, hint, showMeter = false, id }: {
        name?: string; label: string; autocomplete: 'current-password' | 'new-password'; minlength?: number; hint?: string; showMeter?: boolean; id: string;
    } = $props();
    let visible = $state(false), mounted = $state(false), length = $state(0);
    onMount(() => (mounted = true));
    const need = $derived(minlength ?? 0);
    const ok = $derived(need > 0 && length >= need);
</script>

<div class="field">
    <label for={id} class="text-sm font-semibold">{label}</label>
    <div class="relative">
        <input {id} {name} type={visible ? 'text' : 'password'} {autocomplete} minlength={minlength} maxlength="256" required data-secret
               autocapitalize="off" spellcheck="false" class={mounted ? 'pr-24' : ''} aria-describedby="{id}-hint"
               oninput={(e) => (length = e.currentTarget.value.length)} />
        {#if mounted}
            <button type="button" class="btn btn-ghost btn-sm absolute right-1.5 top-1/2 -translate-y-1/2" aria-pressed={visible} aria-controls={id} onclick={() => (visible = !visible)}>
                {visible ? t('auth.password.hide') : t('auth.password.show')}
            </button>
        {/if}
    </div>
    <p id="{id}-hint" class="hint">
        {#if hint}{hint}{/if}
        {#if showMeter && need > 0}
            <span class="mt-1 block" aria-live="polite">
                <span class="block h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                    <span class="block h-full rounded-full transition-all {ok ? 'bg-ok' : 'bg-warn'}" style="width: {Math.min(100, (length / need) * 100)}%"></span>
                </span>
                <span class="mt-1 block {ok ? 'text-ok' : ''}">{ok ? t('auth.password.lengthOk') : t('auth.password.progress', { length, need, remaining: need - length })}</span>
            </span>
        {/if}
    </p>
</div>
