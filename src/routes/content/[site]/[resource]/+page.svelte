<script lang="ts">
    import {enhance} from '$app/forms';
    import {onMount} from 'svelte';
    import {labels,idOf} from '#lib/content-schema.ts';
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
    const noun:Record<string,string>={articles:'article',pages:'page',menu:'menu item',sections:'section',boxes:'box',images:'image'};
    const nounNew:Record<string,string>={articles:'New article',pages:'New page',menu:'New menu item',sections:'New section',boxes:'New box',images:'New image'};
    const title=(row:Record<string,unknown>)=>String(row.draft_title??row.title??row.name??row.image_id??row.key??idOf(data.resource,row));
    const rows=$derived(data.items.filter((row:Record<string,unknown>)=>!query.trim()||(title(row)+' '+idOf(data.resource,row)+' '+String(row.link??'')).toLowerCase().includes(query.trim().toLowerCase())));
    const hasLangs=$derived(Object.keys(data.langs??{}).length>0);
    const size=(n:unknown)=>{const v=Number(n);return v>=1024?new Intl.NumberFormat('en-GB',{maximumFractionDigits:1}).format(v/1024)+' KiB':String(v)+' B';};
</script>

<Breadcrumbs items={[{label:'Sites',href:'/'},{label:data.site.name,href:'/content/'+data.site.id},{label:labels[data.resource]}]}/>
<PageHeader title={labels[data.resource]} description={data.site.name}>
    {#snippet actions()}{#if data.canCreate&&data.resource!=='images'}<a class="btn btn-primary" href={base+'/new'}>{nounNew[data.resource]??'Create record'}<span class="sr-only"> (create record)</span></a>{/if}{/snippet}
</PageHeader>

<div id="vysledek" tabindex="-1" class="outline-none">
    {#if form?.error}<p class="alert alert-error mb-4" role="alert">{form.error}</p>{/if}
    {#if form?.uploaded}<p class="alert alert-ok mb-4" role="status">Image uploaded. Public path on the site: <code>{String(form.uploaded.url)}</code></p>{/if}
</div>

{#if data.resource==='images'&&data.canCreate}
    <section class="card mb-6" aria-labelledby="nahrat">
        <h2 id="nahrat" class="mb-1">Upload image</h2>
        <p class="alert alert-warn mb-4">Uploaded images are public files. Removing one may break existing links in content.</p>
        <form method="POST" action="?/upload" enctype="multipart/form-data" use:enhance={pending.submit} class="grid gap-4">
            <input type="hidden" name="csrf" value={data.csrf}/>
            <label class="field"><span>Image, up to 512 KiB</span><input type="file" name="image" accept="image/png,image/jpeg,image/webp" required class="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:font-semibold file:text-brand"/><span class="hint">Allowed formats: PNG, JPEG and WebP.</span></label>
            <label class="flex items-center gap-2 text-sm">
                <input name="publicConsent" value="yes" type="checkbox" required/> I agree that the image is publicly available</label>
            <div><SubmitButton busy={pending.is('?/upload')}>Upload image</SubmitButton></div>
        </form>
    </section>
{/if}

{#if data.items.length}
    {#if js&&data.items.length>4}
        <div class="mb-4 max-w-sm">
            <label class="field"><span class="sr-only">Search this page</span><input type="search" placeholder="Search by name, ID or address" bind:value={query}/></label>
        </div>
    {/if}
    <div class="card-flat overflow-x-auto p-0">
        <table class="table">
            <caption class="sr-only">{labels[data.resource]}, {data.site.name}</caption>
            <thead><tr><th scope="col">Name</th>{#if data.resource==='articles'}<th scope="col">Status</th>{/if}{#if hasLangs}<th scope="col">Languages</th>{/if}{#if data.resource==='images'}<th scope="col">File</th>{:else}<th scope="col" class="hidden sm:table-cell">Address</th>{/if}<th scope="col" class="text-right">ID</th></tr></thead>
            <tbody>
                {#each rows as row}
                    <tr>
                        <td class="max-w-xs font-semibold"><a class="block truncate" href={base+'/'+idOf(data.resource,row)}>{title(row)}</a></td>
                        {#if data.resource==='articles'}<td>{#if row.has_draft}<StatusBadge state="draft"/>{:else}<StatusBadge state="published"/>{/if}</td>{/if}
                        {#if hasLangs}{@const vs=data.langs[idOf(data.resource,row)]??[]}{@const lack=vs.filter((v:{exists:boolean|null})=>v.exists===false)}<td class="text-sm"><details><summary class="cursor-pointer font-semibold {lack.length?'text-warn':'text-ok'}">{vs.length-lack.length} of {vs.length} languages</summary><p class="mt-1 text-xs text-muted">{#if lack.length}Missing: {#each lack as v, n}<a href={base+'/'+idOf(data.resource,row)+'?locale='+encodeURIComponent(v.locale)} title="Add translation">{v.locale}</a>{n<lack.length-1?', ':''}{/each}{:else}Translated into all languages.{/if}</p></details></td>{/if}
                        {#if data.resource==='images'}<td class="text-muted"><span class="block">{String(row.mime)}, {size(row.size)}, public file</span><code class="break-all">{String(row.url)}</code></td>
                        {:else}<td class="hidden text-muted sm:table-cell">{#if row.link}<code>{String(row.link)}</code>{/if}</td>{/if}
                        <td class="text-right text-muted">{idOf(data.resource,row)}</td>
                    </tr>
                {:else}
                    <tr><td colspan="5" class="text-center text-muted">Nothing matches the search "{query}".</td></tr>
                {/each}
            </tbody>
        </table>
    </div>
{:else}
    <div class="card text-center">
        <h2>There are no records yet</h2>
        <p class="lead mx-auto mt-1">{labels[data.resource]} on {data.site.name} are empty so far.</p>
        {#if data.canCreate&&data.resource!=='images'}<a class="btn btn-primary mt-4" href={base+'/new'}>Create the first {noun[data.resource]}</a>
        {:else if data.resource==='images'&&data.canCreate}<p class="hint mt-3">Upload the first image using the form above.</p>
        {:else}<p class="hint mt-3">You do not have permission to create records.</p>{/if}
    </div>
{/if}

{#if data.pagination}<Pager page={data.pagination.page} totalPages={data.pagination.total_pages} href={(p)=>base+'?page='+p}/>{/if}

{#if !['articles','images'].includes(data.resource)}
    <section class="card-flat mt-8" aria-labelledby="obnova">
        <h2 id="obnova" class="mb-1 text-base">Restore a removed record</h2>
        <p class="hint mb-3">Enter the ID of the removed record. Its history is shown, and the structure can be restored from it.</p>
        <form method="GET" action={base+'/recover'} class="flex flex-wrap items-end gap-3">
            <label class="field w-48"><span>ID of the removed record</span><input name="recoverId" type="number" min="1" required/></label>
            <button class="btn btn-secondary">Find history to restore</button>
        </form>
    </section>
{/if}
