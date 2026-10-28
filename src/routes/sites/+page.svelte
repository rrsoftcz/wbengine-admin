<script lang="ts">
    import AddSiteWizard from '#lib/components/sites/AddSiteWizard.svelte';
    import SiteList from '#lib/components/sites/SiteList.svelte';
    import GrantForm from '#lib/components/sites/GrantForm.svelte';
    let { data, form } = $props();
</script>

<svelte:head><title>Registr webů | WBengine administrace</title></svelte:head>

<header class="mb-6">
    <p class="eyebrow">Správa</p>
    <h1>Registr webů</h1>
    <p class="lead mt-2">Zde připojujete nové weby, měníte jejich klíče a určujete, kdo ke kterému webu smí.</p>
    <nav class="mt-4 flex flex-wrap gap-2" aria-label="Sekce stránky">
        <a class="btn btn-secondary btn-sm" href="#pridat-web">Přidat web</a>
        <a class="btn btn-secondary btn-sm" href="#weby">Připojené weby ({data.sites.length})</a>
        <a class="btn btn-secondary btn-sm" href="#opravneni">Oprávnění účtů</a>
    </nav>
</header>

<div class="grid gap-6">
    <section id="pridat-web" class="card scroll-mt-20" aria-labelledby="h-add">
        <h2 id="h-add" class="mb-1 text-xl">Přidat web</h2>
        <p class="mb-5 text-sm text-muted">Průvodce ve třech krocích. Klíč se ověří přímo na webu ještě před uložením.</p>
        <AddSiteWizard csrf={data.csrf} profile={data.profile} scopes={data.scopes} {form} />
    </section>

    <section id="weby" class="card scroll-mt-20" aria-labelledby="h-sites">
        <h2 id="h-sites" class="mb-4 text-xl">Připojené weby</h2>
        <SiteList sites={data.sites} csrf={data.csrf} {form} />
    </section>

    <section id="opravneni" class="card scroll-mt-20" aria-labelledby="h-grants">
        <h2 id="h-grants" class="mb-4 text-xl">Oprávnění účtů</h2>
        <GrantForm csrf={data.csrf} accounts={data.accounts} sites={data.sites} grants={data.grants} {form} />
    </section>
</div>
