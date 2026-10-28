<script lang="ts">
    import '../app.css';
    import Shell from '#lib/components/Shell.svelte';
    let { data, children } = $props();
</script>

<svelte:head><title>WBengine administrace</title></svelte:head>

{#if data.shell}
    <Shell user={data.shell} csrf={data.shellCsrf}>{@render children()}</Shell>
{:else}
    <div class="grid min-h-dvh place-items-center px-4 py-10">
        <div class="w-full max-w-md">
            <a href="/" class="mb-8 flex items-center justify-center gap-3 text-text no-underline">
                <span class="grid size-11 place-items-center rounded-xl bg-brand text-lg font-bold text-brand-contrast">W</span>
                <span class="leading-tight"><span class="block text-lg font-bold">WBengine</span><span class="block text-sm text-muted">Centrální administrace</span></span>
            </a>
            {@render children()}
        </div>
    </div>
{/if}
