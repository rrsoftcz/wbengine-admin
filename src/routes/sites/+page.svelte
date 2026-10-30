<script lang="ts">
    import { t } from '#lib/i18n/client.ts';
    import AddSiteWizard from '#lib/components/sites/AddSiteWizard.svelte';
    import SiteList from '#lib/components/sites/SiteList.svelte';
    import GrantForm from '#lib/components/sites/GrantForm.svelte';
    let { data, form } = $props();
</script>

<svelte:head><title>{t('sites.title')}</title></svelte:head>

<header class="mb-6">
    <p class="eyebrow">{t('sites.eyebrow')}</p>
    <h1>{t('sites.heading')}</h1>
    <p class="lead mt-2">{t('sites.lead')}</p>
    <nav class="mt-4 flex flex-wrap gap-2" aria-label={t('sites.sectionsLabel')}>
        <a class="btn btn-secondary btn-sm" href="#add-site">{t('sites.nav.add')}</a>
        <a class="btn btn-secondary btn-sm" href="#sites-list">{t('sites.nav.connected', { count: data.sites.length })}</a>
        <a class="btn btn-secondary btn-sm" href="#permissions">{t('sites.nav.permissions')}</a>
    </nav>
</header>

<div class="grid gap-6">
    <section id="add-site" class="card scroll-mt-20" aria-labelledby="h-add">
        <h2 id="h-add" class="mb-1 text-xl">{t('sites.add.heading')}</h2>
        <p class="mb-5 text-sm text-muted">{t('sites.add.lead')}</p>
        <AddSiteWizard csrf={data.csrf} profile={data.profile} scopes={data.scopes} {form} />
    </section>

    <section id="sites-list" class="card scroll-mt-20" aria-labelledby="h-sites">
        <h2 id="h-sites" class="mb-4 text-xl">{t('sites.connected.heading')}</h2>
        <SiteList sites={data.sites} csrf={data.csrf} {form} />
    </section>

    <section id="permissions" class="card scroll-mt-20" aria-labelledby="h-grants">
        <h2 id="h-grants" class="mb-4 text-xl">{t('sites.permissions.heading')}</h2>
        <GrantForm csrf={data.csrf} accounts={data.accounts} sites={data.sites} grants={data.grants} {form} />
    </section>
</div>
