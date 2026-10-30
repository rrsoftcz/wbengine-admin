<script lang="ts">
    import { enhance } from '$app/forms';
    import { t } from '#lib/i18n/client.ts';
    import Breadcrumbs from '#lib/components/content/Breadcrumbs.svelte';
    import PageHeader from '#lib/components/content/PageHeader.svelte';
    import FormAlert from '#lib/components/auth/FormAlert.svelte';
    let { data, form } = $props();
    let filter = $state('');
    const base = $derived('/content/' + data.site.id);
    const rows = $derived(data.available && data.rows ? data.rows.filter((r) => !filter || r.path.toLowerCase().includes(filter.toLowerCase())) : []);
</script>

<svelte:head><title>{t('sitesettings.title')} | WBengine</title></svelte:head>

<Breadcrumbs items={[{ label: t('content.breadcrumb.sites'), href: '/' }, { label: data.site.name, href: base }, { label: t('sitesettings.title') }]} />
<PageHeader title={t('sitesettings.title')} description={t('sitesettings.description')} />

{#if !data.available}
    <div class="alert alert-warn" role="status">{t('siteusers.needsNewKey')}</div>
{:else}
    {#if form && 'error' in form && form.error}<FormAlert message={form.error} />{/if}
    {#if form && 'done' in form && form.done}<p class="alert alert-ok mb-4" role="status">{form.done}</p>{/if}

    {#if data.canFlush}
        <section class="card mb-6" aria-labelledby="ss-cache">
            <h2 id="ss-cache" class="mb-2">{t('sitesettings.cache.heading')}</h2>
            <p class="hint mb-3">{t('sitesettings.cache.hint')}</p>
            <form method="POST" action="?/flush" use:enhance>
                <input type="hidden" name="csrf" value={data.csrf} />
                <button class="btn btn-secondary">{t('sitesettings.cache.submit')}</button>
            </form>
        </section>
    {/if}

    {#if data.rows}
        <section aria-labelledby="ss-config">
            <h2 id="ss-config" class="mb-2">{t('sitesettings.config.heading')}</h2>
            <p class="hint mb-3">{t('sitesettings.config.hint')}</p>
            <div class="field mb-4 w-72 max-w-full"><label for="cf" class="text-sm font-semibold">{t('sitesettings.config.filter')}</label><input id="cf" type="search" bind:value={filter} autocomplete="off" /></div>
            {#if rows.length}
                <div class="overflow-x-auto rounded-xl border border-line">
                    <table class="w-full text-left text-sm">
                        <thead class="bg-surface-2 text-xs uppercase tracking-wide text-muted"><tr><th scope="col" class="px-3 py-2 font-semibold">{t('sitesettings.col.key')}</th><th scope="col" class="px-3 py-2 font-semibold">{t('sitesettings.col.value')}</th></tr></thead>
                        <tbody class="divide-y divide-line">
                            {#each rows as r (r.path)}
                                <tr><td class="px-3 py-2 font-mono text-xs break-all">{r.path}</td><td class="px-3 py-2 break-all">{#if r.secret}<span class="badge badge-warn">{t('sitesettings.secret')}</span>{:else}{r.value}{/if}</td></tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {:else}<p class="text-sm text-muted">{t('sitesettings.config.none')}</p>{/if}
        </section>
    {/if}
{/if}
