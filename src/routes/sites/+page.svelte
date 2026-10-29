<script lang="ts">
    import AddSiteWizard from '#lib/components/sites/AddSiteWizard.svelte';
    import SiteList from '#lib/components/sites/SiteList.svelte';
    import GrantForm from '#lib/components/sites/GrantForm.svelte';
    let { data, form } = $props();
</script>

<svelte:head><title>Site registry | WBengine Admin</title></svelte:head>

<header class="mb-6">
    <p class="eyebrow">Administration</p>
    <h1>Site registry</h1>
    <p class="lead mt-2">Here you connect new sites, change their keys and decide who may access which site.</p>
    <nav class="mt-4 flex flex-wrap gap-2" aria-label="Page sections">
        <a class="btn btn-secondary btn-sm" href="#pridat-web">Add site</a>
        <a class="btn btn-secondary btn-sm" href="#weby">Connected sites ({data.sites.length})</a>
        <a class="btn btn-secondary btn-sm" href="#opravneni">Account permissions</a>
    </nav>
</header>

<div class="grid gap-6">
    <section id="pridat-web" class="card scroll-mt-20" aria-labelledby="h-add">
        <h2 id="h-add" class="mb-1 text-xl">Add site</h2>
        <p class="mb-5 text-sm text-muted">A three-step wizard. The key is verified on the site itself before it is saved.</p>
        <AddSiteWizard csrf={data.csrf} profile={data.profile} scopes={data.scopes} {form} />
    </section>

    <section id="weby" class="card scroll-mt-20" aria-labelledby="h-sites">
        <h2 id="h-sites" class="mb-4 text-xl">Connected sites</h2>
        <SiteList sites={data.sites} csrf={data.csrf} {form} />
    </section>

    <section id="opravneni" class="card scroll-mt-20" aria-labelledby="h-grants">
        <h2 id="h-grants" class="mb-4 text-xl">Account permissions</h2>
        <GrantForm csrf={data.csrf} accounts={data.accounts} sites={data.sites} grants={data.grants} {form} />
    </section>
</div>
