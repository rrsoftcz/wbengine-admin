<script lang="ts">
    import { onMount } from 'svelte';
    import CopyButton from './CopyButton.svelte';
    let { codes }: { codes: string[] } = $props();
    let mounted = $state(false), confirmed = $state(false);
    onMount(() => (mounted = true));
    function download() {
        const body = `WBengine: backup codes\nEach code can be used only once.\n\n${codes.join('\n')}\n`;
        const url = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url; a.download = 'wbengine-backup-codes.txt'; a.click();
        URL.revokeObjectURL(url);
    }
</script>

<div class="alert alert-warn mb-4" role="alert">
    <strong>These codes are shown only once.</strong> Save them now, for example in a password manager. Each code can be used once if you do not have your phone at hand.
</div>
<ul class="mb-4 grid grid-cols-2 gap-2 font-mono" aria-label="Backup codes">
    {#each codes as c}<li class="rounded-lg border border-line bg-surface-2 px-3 py-2 text-center text-sm tracking-wider">{c}</li>{/each}
</ul>
{#if mounted}
    <div class="mb-4 flex flex-wrap gap-2">
        <CopyButton text={codes.join('\n')} label="Copy all" />
        <button type="button" class="btn btn-secondary btn-sm" onclick={download}>Download as .txt</button>
    </div>
    <label class="mb-4 flex items-start gap-3 text-sm"><input type="checkbox" bind:checked={confirmed} class="mt-0.5" /> <span>I have saved the codes in a safe place.</span></label>
    <a href="/" class="btn btn-primary btn-block {confirmed ? '' : 'pointer-events-none opacity-50'}" aria-disabled={!confirmed} tabindex={confirmed ? 0 : -1}>Continue to the admin</a>
{:else}
    <a href="/" class="btn btn-primary btn-block">Continue to the admin</a>
{/if}
