<script lang="ts">
    import { onMount } from 'svelte';
    import CopyButton from './CopyButton.svelte';
    let { codes }: { codes: string[] } = $props();
    let mounted = $state(false), confirmed = $state(false);
    onMount(() => (mounted = true));
    function download() {
        const body = `WBengine: záložní kódy\nKaždý kód lze použít jen jednou.\n\n${codes.join('\n')}\n`;
        const url = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url; a.download = 'wbengine-zalozni-kody.txt'; a.click();
        URL.revokeObjectURL(url);
    }
</script>

<div class="alert alert-warn mb-4" role="alert">
    <strong>Tyto kódy se zobrazí jen jednou.</strong> Uložte si je teď, například do správce hesel. Každý kód lze použít jednou, když nebudete mít po ruce telefon.
</div>
<ul class="mb-4 grid grid-cols-2 gap-2 font-mono" aria-label="Záložní kódy">
    {#each codes as c}<li class="rounded-lg border border-line bg-surface-2 px-3 py-2 text-center text-sm tracking-wider">{c}</li>{/each}
</ul>
{#if mounted}
    <div class="mb-4 flex flex-wrap gap-2">
        <CopyButton text={codes.join('\n')} label="Kopírovat vše" />
        <button type="button" class="btn btn-secondary btn-sm" onclick={download}>Stáhnout jako .txt</button>
    </div>
    <label class="mb-4 flex items-start gap-3 text-sm"><input type="checkbox" bind:checked={confirmed} class="mt-0.5" /> <span>Kódy jsem si uložil(a) na bezpečné místo.</span></label>
    <a href="/" class="btn btn-primary btn-block {confirmed ? '' : 'pointer-events-none opacity-50'}" aria-disabled={!confirmed} tabindex={confirmed ? 0 : -1}>Pokračovat do administrace</a>
{:else}
    <a href="/" class="btn btn-primary btn-block">Pokračovat do administrace</a>
{/if}
