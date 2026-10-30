<script lang="ts">
    import {enhance} from '$app/forms';
    import {onMount} from 'svelte';
    import {labels,idOf} from '#lib/content-schema.ts';
    import {t,intl} from '#lib/i18n/client.ts';
    import type {MessageKey} from '#lib/i18n/index.ts';
    import Breadcrumbs from '#lib/components/content/Breadcrumbs.svelte';
    import PageHeader from '#lib/components/content/PageHeader.svelte';
    import StatusBadge from '#lib/components/content/StatusBadge.svelte';
    import Pager from '#lib/components/content/Pager.svelte';
    import SubmitButton from '#lib/components/content/SubmitButton.svelte';
    import {createPending} from '#lib/components/content/pending.svelte.ts';
    let {data,form}=$props();
    const base=$derived('/content/'+data.site.id+'/'+data.resource);
    const pending=createPending({reset:true});
    let query=$state('');let js=$state(false);onMount(()=>{js=true;});
    const newKey=(r:string):MessageKey=>Object.hasOwn(labels,r)?('content.list.new.'+r) as MessageKey:'content.list.createRecord';
    const firstKey=(r:string):MessageKey=>('content.list.createFirst.'+r) as MessageKey;
    const title=(row:Record<string,unknown>)=>String(row.draft_title??row.title??row.name??row.image_id??row.key??idOf(data.resource,row));
    const rows=$derived(data.items.filter((row:Record<string,unknown>)=>!query.trim()||(title(row)+' '+idOf(data.resource,row)+' '+String(row.link??'')).toLowerCase().includes(query.trim().toLowerCase())));
    const hasLangs=$derived(Object.keys(data.langs??{}).length>0);
    const size=(n:unknown)=>{const v=Number(n);return v>=1024?t('content.size.kib',{value:new Intl.NumberFormat(intl(),{maximumFractionDigits:1}).format(v/1024)}):t('content.size.bytes',{value:String(v)});};
</script>

<Breadcrumbs items={[{label:t('content.breadcrumb.sites'),href:'/'},{label:data.site.name,href:'/content/'+data.site.id},{label:t(labels[data.resource as keyof typeof labels])}]}/>
<PageHeader title={t(labels[data.resource as keyof typeof labels])} description={data.site.name}>
    {#snippet actions()}{#if data.canCreate&&data.resource!=='images'}<a class="btn btn-primary" href={base+'/new'}>{t(newKey(data.resource))}<span class="sr-only">{t('content.list.createRecordSr')}</span></a>{/if}{/snippet}
</PageHeader>

<div id="vysledek" tabindex="-1" class="outline-none">
    {#if form?.error}<p class="alert alert-error mb-4" role="alert">{form.error}</p>{/if}
    {#if form?.uploaded}<p class="alert alert-ok mb-4" role="status">{t('content.list.uploaded')} <code>{String(form.uploaded.url)}</code></p>{/if}
</div>

{#if data.resource==='images'&&data.canCreate}
    <section class="card mb-6" aria-labelledby="nahrat">
        <h2 id="nahrat" class="mb-1">{t('content.upload.title')}</h2>
        <p class="alert alert-warn mb-4">{t('content.upload.warning')}</p>
        <form method="POST" action="?/upload" enctype="multipart/form-data" use:enhance={pending.submit} class="grid gap-4">
            <input type="hidden" name="csrf" value={data.csrf}/>
            <label class="field"><span>{t('content.upload.fileLabel')}</span><input type="file" name="image" accept="image/png,image/jpeg,image/webp" required class="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:font-semibold file:text-brand"/><span class="hint">{t('content.upload.formats')}</span></label>
            <label class="flex items-center gap-2 text-sm">
                <input name="publicConsent" value="yes" type="checkbox" required/> {t('content.upload.consent')}</label>
            <div><SubmitButton busy={pending.is('?/upload')}>{t('content.upload.submit')}</SubmitButton></div>
        </form>
    </section>
{/if}

{#if data.items.length}
    {#if js&&data.items.length>4}
        <div class="mb-4 max-w-sm">
            <label class="field"><span class="sr-only">{t('content.list.searchLabel')}</span><input type="search" placeholder={t('content.list.searchPlaceholder')} bind:value={query}/></label>
        </div>
    {/if}
    <div class="card-flat overflow-x-auto p-0">
        <table class="table">
            <caption class="sr-only">{t('content.list.caption',{type:t(labels[data.resource as keyof typeof labels]),site:data.site.name})}</caption>
            <thead><tr><th scope="col">{t('content.list.col.name')}</th>{#if data.resource==='articles'}<th scope="col">{t('content.list.col.status')}</th>{/if}{#if hasLangs}<th scope="col">{t('content.list.col.languages')}</th>{/if}{#if data.resource==='images'}<th scope="col">{t('content.list.col.file')}</th>{:else}<th scope="col" class="hidden sm:table-cell">{t('content.list.col.address')}</th>{/if}<th scope="col" class="text-right">{t('content.list.col.id')}</th></tr></thead>
            <tbody>
                {#each rows as row}
                    <tr>
                        <td class="max-w-xs font-semibold"><a class="block truncate" href={base+'/'+idOf(data.resource,row)}>{title(row)}</a></td>
                        {#if data.resource==='articles'}<td>{#if row.has_draft}<StatusBadge state="draft"/>{:else}<StatusBadge state="published"/>{/if}</td>{/if}
                        {#if hasLangs}{@const vs=data.langs[idOf(data.resource,row)]??[]}{@const lack=vs.filter((v:{exists:boolean|null})=>v.exists===false)}<td class="text-sm"><details><summary class="cursor-pointer font-semibold {lack.length?'text-warn':'text-ok'}">{t('content.list.languagesOf',{done:vs.length-lack.length,total:vs.length})}</summary><p class="mt-1 text-xs text-muted">{#if lack.length}{t('content.list.missing')} {#each lack as v, n}<a href={base+'/'+idOf(data.resource,row)+'?locale='+encodeURIComponent(v.locale)} title={t('content.list.addTranslation')}>{v.locale}</a>{n<lack.length-1?', ':''}{/each}{:else}{t('content.list.allTranslated')}{/if}</p></details></td>{/if}
                        {#if data.resource==='images'}<td class="text-muted"><span class="block">{t('content.list.imageRow',{mime:String(row.mime),size:size(row.size)})}</span><code class="break-all">{String(row.url)}</code></td>
                        {:else}<td class="hidden text-muted sm:table-cell">{#if row.link}<code>{String(row.link)}</code>{/if}</td>{/if}
                        <td class="text-right text-muted">{idOf(data.resource,row)}</td>
                    </tr>
                {:else}
                    <tr><td colspan="5" class="text-center text-muted">{t('content.list.noMatch',{query})}</td></tr>
                {/each}
            </tbody>
        </table>
    </div>
{:else}
    <div class="card text-center">
        <h2>{t('content.list.emptyTitle')}</h2>
        <p class="lead mx-auto mt-1">{t('content.list.emptyText',{type:t(labels[data.resource as keyof typeof labels]),site:data.site.name})}</p>
        {#if data.canCreate&&data.resource!=='images'}<a class="btn btn-primary mt-4" href={base+'/new'}>{t(firstKey(data.resource))}</a>
        {:else if data.resource==='images'&&data.canCreate}<p class="hint mt-3">{t('content.list.uploadFirst')}</p>
        {:else}<p class="hint mt-3">{t('content.list.noPermission')}</p>{/if}
    </div>
{/if}

{#if data.pagination}<Pager page={data.pagination.page} totalPages={data.pagination.total_pages} href={(p)=>base+'?page='+p}/>{/if}

{#if !['articles','images'].includes(data.resource)}
    <section class="card-flat mt-8" aria-labelledby="obnova">
        <h2 id="obnova" class="mb-1 text-base">{t('content.recover.title')}</h2>
        <p class="hint mb-3">{t('content.recover.hint')}</p>
        <form method="GET" action={base+'/recover'} class="flex flex-wrap items-end gap-3">
            <label class="field w-48"><span>{t('content.recover.label')}</span><input name="recoverId" type="number" min="1" required/></label>
            <button class="btn btn-secondary">{t('content.recover.submit')}</button>
        </form>
    </section>
{/if}
