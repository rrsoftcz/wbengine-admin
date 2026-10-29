<script lang="ts">
    import {labels} from '#lib/content-schema.ts';
    import Breadcrumbs from '#lib/components/content/Breadcrumbs.svelte';
    import PageHeader from '#lib/components/content/PageHeader.svelte';
    let {data}=$props();
    const info:Record<string,string>={
        articles:'Texts, news and specialist articles with drafts, revisions and translations.',
        pages:'Pages of the site, their addresses, titles and search engine settings.',
        menu:'Navigation items of the site and their order.',
        sections:'Page areas that boxes are placed into.',
        boxes:'Reusable content blocks and their settings.',
        images:'Public images that can be inserted into texts.'
    };
</script>

<Breadcrumbs items={[{label:'Sites',href:'/'},{label:data.site.name}]}/>
<PageHeader title={data.site.name} description="Content and revisions are stored on the site. Availability depends on your account permissions, the key scopes and the capabilities of the remote API.">
    {#snippet actions()}{#if data.analytics}<a class="btn btn-secondary" href={'/analytics/'+data.site.id}>Site analytics</a>{/if}{/snippet}
</PageHeader>

<h2 class="sr-only">Content types</h2>
<ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {#each data.resources as resource}
        <li class="card-flat flex flex-col gap-3">
            <div class="flex items-start justify-between gap-2">
                <h3 class="text-lg">{labels[resource.name]}</h3>
                {#if !resource.read}<span class="badge badge-warn">Unavailable</span>
                {:else if resource.write}<span class="badge badge-ok">Editing</span>
                {:else}<span class="badge">Read only</span>{/if}
            </div>
            <p class="hint grow">{info[resource.name]??''}</p>
            {#if resource.read}
                <a class="btn btn-secondary btn-sm self-start" href={'/content/'+data.site.id+'/'+resource.name}>Open<span class="sr-only">: {labels[resource.name]}</span></a>
                <p class="hint">{resource.write?'Editing is available.':'Available for reading only.'}</p>
            {:else}
                <p class="hint">Reading is not allowed or the site does not support it.</p>
            {/if}
        </li>
    {/each}
</ul>
