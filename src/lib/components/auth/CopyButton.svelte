<script lang="ts">
    import { onMount } from 'svelte';
    import { t } from '#lib/i18n/client.ts';
    let { text, label, doneLabel }: { text: string; label?: string; doneLabel?: string } = $props();
    const shownLabel = $derived(label ?? t('auth.copy.copy')), shownDone = $derived(doneLabel ?? t('auth.copy.copied'));
    let mounted = $state(false), done = $state(false), failed = $state(false);
    onMount(() => (mounted = true));
    async function copy() {
        try {
            await navigator.clipboard.writeText(text);
            done = true; failed = false;
            setTimeout(() => (done = false), 2000);
        } catch {
            failed = true;
        }
    }
</script>

{#if mounted}
    <button type="button" class="btn btn-secondary btn-sm" onclick={copy}>{done ? shownDone : shownLabel}</button>
    <span class="sr-only" aria-live="polite">{done ? shownDone : failed ? t('auth.copy.failed') : ''}</span>
    {#if failed}<span class="hint">{t('auth.copy.failed')}</span>{/if}
{/if}
