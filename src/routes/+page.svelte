<script lang="ts">
    import { onMount } from 'svelte';
    import { t } from '#lib/i18n/client.ts';
    import SiteCard from '#lib/components/sites/SiteCard.svelte';
    let { data } = $props();
    let query = $state('');
    let mounted = $state(false);
    onMount(() => (mounted = true));
    const filtered = $derived(data.sites.filter(s => (s.name + ' ' + s.base_url).toLowerCase().includes(query.trim().toLowerCase())));
    const steps = $derived([
        { title: t('app.home.step1.title'), text: t('app.home.step1.text') },
        { title: t('app.home.step2.title'), text: t('app.home.step2.text') },
        { title: t('app.home.step3.title'), text: t('app.home.step3.text') }
    ]);
</script>

<svelte:head><title>{t('app.home.title')}</title></svelte:head>

<header class="mb-8 flex flex-wrap items-end justify-between gap-4">
    <div>
        <p class="eyebrow">{t('app.home.eyebrow')}</p>
        <h1>{t('app.home.heading')}</h1>
        <p class="lead mt-2">
            {#if data.sites.length}
                {t('app.home.leadSites')}
            {:else}
                {t('app.home.leadEmpty')}
            {/if}
        </p>
    </div>
    {#if data.user.globalAdmin}
        <a class="btn btn-primary" href="/sites#add-site">{t('app.home.addSite')}</a>
    {/if}
</header>

{#if data.sites.length}
    {#if mounted && data.sites.length > 6}
        <div class="mb-5 max-w-sm">
            <label class="field"><span>{t('app.home.searchLabel')}</span><input type="search" bind:value={query} placeholder={t('app.home.searchPlaceholder')} autocomplete="off" /></label>
        </div>
    {/if}
    {#if filtered.length}
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {#each filtered as site (site.id)}<SiteCard {site} />{/each}
        </div>
    {:else}
        <p class="card-flat text-muted" role="status">{t('app.home.noMatch', { query })}</p>
    {/if}
    <p class="mt-6 text-sm text-muted" aria-live="polite">{t('app.home.count', { count: data.sites.length })}</p>
{:else if data.user.globalAdmin}
    <section class="card" aria-labelledby="first">
        <p class="eyebrow">{t('app.home.start.eyebrow')}</p>
        <h2 id="first" class="mt-1 text-2xl">{t('app.home.start.title')}</h2>
        <p class="lead mt-2">{t('app.home.start.lead')}</p>
        <ol class="mt-6 grid gap-4 md:grid-cols-3">
            {#each steps as step, i}
                <li class="rounded-xl border border-line bg-surface-2 p-4">
                    <span class="grid size-8 place-items-center rounded-full bg-brand text-sm font-bold text-brand-contrast" aria-hidden="true">{i + 1}</span>
                    <h3 class="mt-3">{step.title}</h3>
                    <p class="mt-1 text-sm text-muted">{step.text}</p>
                </li>
            {/each}
        </ol>
        <a class="btn btn-primary mt-6" href="/sites#add-site">{t('app.home.start.connect')}</a>
    </section>
{:else}
    <section class="card" aria-labelledby="wait" role="status">
        <h2 id="wait">{t('app.home.wait.title')}</h2>
        <p class="lead mt-2">{t('app.home.wait.body')}</p>
        <p class="mt-3 text-sm text-muted">{t('app.home.wait.signedIn', { email: data.user.email })}</p>
    </section>
{/if}
