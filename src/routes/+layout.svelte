<script lang="ts">
    import '../app.css';
    import Shell from '#lib/components/Shell.svelte';
    import { t } from '#lib/i18n/client.ts';
    let { data, children } = $props();
</script>

<svelte:head><title>{t('app.title')}</title></svelte:head>

{#if data.shell}
    <Shell user={data.shell} csrf={data.shellCsrf}>{@render children()}</Shell>
{:else}
    <div class="grid min-h-dvh place-items-center px-4 py-10">
        <div class="w-full max-w-md">
            <a href="/" class="mb-8 flex items-center justify-center gap-3 text-text no-underline">
                <img src="/favicon.svg" alt="" width="44" height="44" class="size-11 rounded-xl">
                <span class="leading-tight"><span class="block text-lg font-bold">WBengine</span><span class="block text-sm text-muted">{t('app.brand.subtitle')}</span></span>
            </a>
            {@render children()}
        </div>
    </div>
{/if}
