<script lang="ts">
    import { onMount } from 'svelte';
    import SiteCard from '#lib/components/sites/SiteCard.svelte';
    let { data } = $props();
    let query = $state('');
    let mounted = $state(false);
    onMount(() => (mounted = true));
    const filtered = $derived(data.sites.filter(s => (s.name + ' ' + s.base_url).toLowerCase().includes(query.trim().toLowerCase())));
    const steps = [
        { title: 'Vydejte klíč na webu', text: 'Na cílovém webu otevřete stránku Integrace a vydejte klíč s profilem Správa webu.' },
        { title: 'Vložte klíč do Adminu', text: 'Zadejte název, adresu a klíč. Klíč se ověří a uloží šifrovaně.' },
        { title: 'Spravujte obsah', text: 'Web se objeví v přehledu a můžete upravovat jeho obsah.' }
    ];
</script>

<svelte:head><title>Weby | WBengine administrace</title></svelte:head>

<header class="mb-8 flex flex-wrap items-end justify-between gap-4">
    <div>
        <p class="eyebrow">Přehled</p>
        <h1>Weby</h1>
        <p class="lead mt-2">
            {#if data.sites.length}
                Vyberte web, jehož obsah chcete upravit, nebo si zobrazte jeho statistiky.
            {:else}
                Vítejte v centrální administraci WBengine. Odtud spravujete obsah všech svých webů na jednom místě.
            {/if}
        </p>
    </div>
    {#if data.user.globalAdmin}
        <a class="btn btn-primary" href="/sites#pridat-web">Přidat web</a>
    {/if}
</header>

{#if data.sites.length}
    {#if mounted && data.sites.length > 6}
        <div class="mb-5 max-w-sm">
            <label class="field"><span>Hledat web</span><input type="search" bind:value={query} placeholder="Název nebo adresa" autocomplete="off" /></label>
        </div>
    {/if}
    {#if filtered.length}
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {#each filtered as site (site.id)}<SiteCard {site} />{/each}
        </div>
    {:else}
        <p class="card-flat text-muted" role="status">Žádný web neodpovídá hledání „{query}“.</p>
    {/if}
    <p class="mt-6 text-sm text-muted" aria-live="polite">{data.sites.length === 1 ? 'Máte 1 web.' : data.sites.length < 5 ? `Máte ${data.sites.length} weby.` : `Máte ${data.sites.length} webů.`}</p>
{:else if data.user.globalAdmin}
    <section class="card" aria-labelledby="first">
        <p class="eyebrow">Začínáme</p>
        <h2 id="first" class="mt-1 text-2xl">Připojte první web</h2>
        <p class="lead mt-2">Zatím tu není žádný web. Připojení trvá asi dvě minuty a probíhá ve třech krocích.</p>
        <ol class="mt-6 grid gap-4 md:grid-cols-3">
            {#each steps as step, i}
                <li class="rounded-xl border border-line bg-surface-2 p-4">
                    <span class="grid size-8 place-items-center rounded-full bg-brand text-sm font-bold text-brand-contrast" aria-hidden="true">{i + 1}</span>
                    <h3 class="mt-3">{step.title}</h3>
                    <p class="mt-1 text-sm text-muted">{step.text}</p>
                </li>
            {/each}
        </ol>
        <a class="btn btn-primary mt-6" href="/sites#pridat-web">Připojit první web</a>
    </section>
{:else}
    <section class="card" aria-labelledby="wait" role="status">
        <h2 id="wait">Čekáte na přidělení oprávnění</h2>
        <p class="lead mt-2">Váš účet zatím nemá přístup k žádnému webu. Požádejte globálního správce, aby vám u příslušného webu přidělil roli Editor nebo Správce webu. Po přidělení se web v tomto přehledu objeví a budete se muset znovu přihlásit.</p>
        <p class="mt-3 text-sm text-muted">Přihlášen jako {data.user.email}</p>
    </section>
{/if}
