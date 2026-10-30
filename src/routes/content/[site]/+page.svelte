<script lang="ts">
    import {labels} from '#lib/content-schema.ts';
    import {t} from '#lib/i18n/client.ts';
    import type {MessageKey} from '#lib/i18n/index.ts';
    import Breadcrumbs from '#lib/components/content/Breadcrumbs.svelte';
    import PageHeader from '#lib/components/content/PageHeader.svelte';
    let {data}=$props();
    const info:Record<string,MessageKey>={
        articles:'content.overview.info.articles',
        pages:'content.overview.info.pages',
        menu:'content.overview.info.menu',
        sections:'content.overview.info.sections',
        boxes:'content.overview.info.boxes',
        images:'content.overview.info.images'
    };
</script>

<Breadcrumbs items={[{label:t('content.breadcrumb.sites'),href:'/'},{label:data.site.name}]}/>
<PageHeader title={data.site.name} description={t('content.overview.description')}>
    {#snippet actions()}{#if data.analytics}<a class="btn btn-secondary" href={'/analytics/'+data.site.id}>{t('content.overview.analytics')}</a>{/if}{/snippet}
</PageHeader>

<h2 class="sr-only">{t('content.overview.typesHeading')}</h2>
<ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {#each data.resources as resource}
        <li class="card-flat flex flex-col gap-3">
            <div class="flex items-start justify-between gap-2">
                <h3 class="text-lg">{t(labels[resource.name as keyof typeof labels])}</h3>
                {#if !resource.read}<span class="badge badge-warn">{t('content.overview.unavailable')}</span>
                {:else if resource.write}<span class="badge badge-ok">{t('content.overview.editing')}</span>
                {:else}<span class="badge">{t('content.status.readonly')}</span>{/if}
            </div>
            <p class="hint grow">{info[resource.name]?t(info[resource.name]):''}</p>
            {#if resource.read}
                <a class="btn btn-secondary btn-sm self-start" href={'/content/'+data.site.id+'/'+resource.name}>{t('content.overview.open')}<span class="sr-only">{t('content.overview.openSuffix',{type:t(labels[resource.name as keyof typeof labels])})}</span></a>
                <p class="hint">{resource.write?t('content.overview.editAvailable'):t('content.overview.readAvailable')}</p>
            {:else}
                <p class="hint">{t('content.overview.noRead')}</p>
            {/if}
        </li>
    {/each}
</ul>
