<script lang="ts">
    import { onMount } from 'svelte';
    import SiteCard from '#lib/components/sites/SiteCard.svelte';
    let { data } = $props();
    let query = $state('');
    let mounted = $state(false);
    onMount(() => (mounted = true));
    const filtered = $derived(data.sites.filter(s => (s.name + ' ' + s.base_url).toLowerCase().includes(query.trim().toLowerCase())));
    const steps = [
        { title: 'Issue a key on the site', text: 'On the target site, open the Integrations page and issue a key with the Site management profile.' },
        { title: 'Paste the key into Admin', text: 'Enter the name, address and key. The key is verified and stored encrypted.' },
        { title: 'Manage content', text: 'The site appears in the overview and you can edit its content.' }
    ];
</script>

<svelte:head><title>Sites | WBengine Admin</title></svelte:head>

<header class="mb-8 flex flex-wrap items-end justify-between gap-4">
    <div>
        <p class="eyebrow">Overview</p>
        <h1>Sites</h1>
        <p class="lead mt-2">
            {#if data.sites.length}
                Choose a site to edit its content, or view its statistics.
            {:else}
                Welcome to the WBengine central administration. From here you manage the content of all your sites in one place.
            {/if}
        </p>
    </div>
    {#if data.user.globalAdmin}
        <a class="btn btn-primary" href="/sites#pridat-web">Add site</a>
    {/if}
</header>

{#if data.sites.length}
    {#if mounted && data.sites.length > 6}
        <div class="mb-5 max-w-sm">
            <label class="field"><span>Search sites</span><input type="search" bind:value={query} placeholder="Name or address" autocomplete="off" /></label>
        </div>
    {/if}
    {#if filtered.length}
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {#each filtered as site (site.id)}<SiteCard {site} />{/each}
        </div>
    {:else}
        <p class="card-flat text-muted" role="status">No site matches the search "{query}".</p>
    {/if}
    <p class="mt-6 text-sm text-muted" aria-live="polite">{data.sites.length === 1 ? 'You have 1 site.' : `You have ${data.sites.length} sites.`}</p>
{:else if data.user.globalAdmin}
    <section class="card" aria-labelledby="first">
        <p class="eyebrow">Getting started</p>
        <h2 id="first" class="mt-1 text-2xl">Connect your first site</h2>
        <p class="lead mt-2">There are no sites yet. Connecting takes about two minutes and has three steps.</p>
        <ol class="mt-6 grid gap-4 md:grid-cols-3">
            {#each steps as step, i}
                <li class="rounded-xl border border-line bg-surface-2 p-4">
                    <span class="grid size-8 place-items-center rounded-full bg-brand text-sm font-bold text-brand-contrast" aria-hidden="true">{i + 1}</span>
                    <h3 class="mt-3">{step.title}</h3>
                    <p class="mt-1 text-sm text-muted">{step.text}</p>
                </li>
            {/each}
        </ol>
        <a class="btn btn-primary mt-6" href="/sites#pridat-web">Connect first site</a>
    </section>
{:else}
    <section class="card" aria-labelledby="wait" role="status">
        <h2 id="wait">Waiting for permissions</h2>
        <p class="lead mt-2">Your account does not have access to any site yet. Ask a global administrator to give you the Editor or Site admin role on the relevant site. Once granted, the site will appear in this overview and you will need to sign in again.</p>
        <p class="mt-3 text-sm text-muted">Signed in as {data.user.email}</p>
    </section>
{/if}
