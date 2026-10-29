<script lang="ts">
    import { onMount } from 'svelte';
    let { text, label = 'Copy', doneLabel = 'Copied' }: { text: string; label?: string; doneLabel?: string } = $props();
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
    <button type="button" class="btn btn-secondary btn-sm" onclick={copy}>{done ? doneLabel : label}</button>
    <span class="sr-only" aria-live="polite">{done ? doneLabel : failed ? 'Copying failed, select the text manually.' : ''}</span>
    {#if failed}<span class="hint">Copying failed, select the text manually.</span>{/if}
{/if}
