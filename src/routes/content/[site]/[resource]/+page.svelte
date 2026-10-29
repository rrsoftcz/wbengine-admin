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
    const noun:Record<string,string>={articles:'článek',pages:'stránku',menu:'položku menu',sections:'sekci',boxes:'box',images:'obrázek'};
    const nounNew:Record<string,string>={articles:'Nový článek',pages:'Nová stránka',menu:'Nová položka menu',sections:'Nová sekce',boxes:'Nový box',images:'Nový obrázek'};
    const title=(row:Record<string,unknown>)=>String(row.draft_title??row.title??row.name??row.image_id??row.key??idOf(data.resource,row));
    const rows=$derived(data.items.filter((row:Record<string,unknown>)=>!query.trim()||(title(row)+' '+idOf(data.resource,row)+' '+String(row.link??'')).toLowerCase().includes(query.trim().toLowerCase())));
    const hasLangs=$derived(Object.keys(data.langs??{}).length>0);
    const size=(n:unknown)=>{const v=Number(n);return v>=1024?new Intl.NumberFormat('cs-CZ',{maximumFractionDigits:1}).format(v/1024)+' KiB':String(v)+' B';};
</script>

<Breadcrumbs items={[{label:'Weby',href:'/'},{label:data.site.name,href:'/content/'+data.site.id},{label:labels[data.resource]}]}/>
<PageHeader title={labels[data.resource]} description={data.site.name}>
    {#snippet actions()}{#if data.canCreate&&data.resource!=='images'}<a class="btn btn-primary" href={base+'/new'}>{nounNew[data.resource]??'Vytvořit záznam'}<span class="sr-only"> (vytvořit záznam)</span></a>{/if}{/snippet}
</PageHeader>

<div id="vysledek" tabindex="-1" class="outline-none">
    {#if form?.error}<p class="alert alert-error mb-4" role="alert">{form.error}</p>{/if}
    {#if form?.uploaded}<p class="alert alert-ok mb-4" role="status">Obrázek nahrán. Veřejná cesta na webu: <code>{String(form.uploaded.url)}</code></p>{/if}
</div>

{#if data.resource==='images'&&data.canCreate}
    <section class="card mb-6" aria-labelledby="nahrat">
        <h2 id="nahrat" class="mb-1">Nahrát obrázek</h2>
        <p class="alert alert-warn mb-4">Nahrané obrázky jsou veřejné soubory. Odstranění může poškodit existující odkazy v obsahu.</p>
        <form method="POST" action="?/upload" enctype="multipart/form-data" use:enhance={pending.submit} class="grid gap-4">
            <input type="hidden" name="csrf" value={data.csrf}/>
            <label class="field"><span>Obrázek, nejvýše 512 KiB</span><input type="file" name="image" accept="image/png,image/jpeg,image/webp" required class="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:font-semibold file:text-brand"/><span class="hint">Povolené formáty: PNG, JPEG a WebP.</span></label>
            <label class="flex items-center gap-2 text-sm">
                <input name="publicConsent" value="yes" type="checkbox" required/> Souhlasím s veřejnou dostupností obrázku</label>
            <div><SubmitButton busy={pending.is('?/upload')}>Nahrát obrázek</SubmitButton></div>
        </form>
    </section>
{/if}

{#if data.items.length}
    {#if js&&data.items.length>4}
        <div class="mb-4 max-w-sm">
            <label class="field"><span class="sr-only">Hledat na této stránce</span><input type="search" placeholder="Hledat podle názvu, ID nebo adresy" bind:value={query}/></label>
        </div>
    {/if}
    <div class="card-flat overflow-x-auto p-0">
        <table class="table">
            <caption class="sr-only">{labels[data.resource]}, {data.site.name}</caption>
            <thead><tr><th scope="col">Název</th>{#if data.resource==='articles'}<th scope="col">Stav</th>{/if}{#if hasLangs}<th scope="col">Jazyky</th>{/if}{#if data.resource==='images'}<th scope="col">Soubor</th>{:else}<th scope="col" class="hidden sm:table-cell">Adresa</th>{/if}<th scope="col" class="text-right">ID</th></tr></thead>
            <tbody>
                {#each rows as row}
                    <tr>
                        <td class="max-w-xs font-semibold"><a class="block truncate" href={base+'/'+idOf(data.resource,row)}>{title(row)}</a></td>
                        {#if data.resource==='articles'}<td>{#if row.has_draft}<StatusBadge state="draft"/>{:else}<StatusBadge state="published"/>{/if}</td>{/if}
                        {#if hasLangs}{@const vs=data.langs[idOf(data.resource,row)]??[]}{@const have=vs.filter((v:{exists:boolean})=>v.exists)}{@const lack=vs.filter((v:{exists:boolean})=>!v.exists)}<td><span class="grid gap-1"><span class="text-sm font-semibold {lack.length?'text-warn':'text-ok'}">{have.length} z {vs.length} jazyků</span><span class="flex flex-wrap gap-1">{#each have as v}<a class="badge {v.original?'badge-info':'badge-ok'} no-underline" href={base+'/'+idOf(data.resource,row)+(v.original?'':'?locale='+encodeURIComponent(v.locale))} title={v.original?'Upravit originál':'Upravit překlad'}>{v.locale}{v.original?' originál':''}</a>{/each}</span>{#if lack.length}<span class="text-xs text-muted">chybí: {#each lack as v, n}<a href={base+'/'+idOf(data.resource,row)+'?locale='+encodeURIComponent(v.locale)} title="Přidat překlad">{v.locale}</a>{n<lack.length-1?', ':''}{/each}</span>{/if}</span></td>{/if}
                        {#if data.resource==='images'}<td class="text-muted"><span class="block">{String(row.mime)}, {size(row.size)}, veřejný soubor</span><code class="break-all">{String(row.url)}</code></td>
                        {:else}<td class="hidden text-muted sm:table-cell">{#if row.link}<code>{String(row.link)}</code>{/if}</td>{/if}
                        <td class="text-right text-muted">{idOf(data.resource,row)}</td>
                    </tr>
                {:else}
                    <tr><td colspan="5" class="text-center text-muted">Nic neodpovídá hledání „{query}“.</td></tr>
                {/each}
            </tbody>
        </table>
    </div>
{:else}
    <div class="card text-center">
        <h2>Zatím tu nejsou žádné záznamy</h2>
        <p class="lead mx-auto mt-1">{labels[data.resource]} na webu {data.site.name} zatím nic neobsahují.</p>
        {#if data.canCreate&&data.resource!=='images'}<a class="btn btn-primary mt-4" href={base+'/new'}>Vytvořit první {noun[data.resource]}</a>
        {:else if data.resource==='images'&&data.canCreate}<p class="hint mt-3">Nahrajte první obrázek ve formuláři výše.</p>
        {:else}<p class="hint mt-3">K vytváření záznamů nemáte oprávnění.</p>{/if}
    </div>
{/if}

{#if data.pagination}<Pager page={data.pagination.page} totalPages={data.pagination.total_pages} href={(p)=>base+'?page='+p}/>{/if}

{#if !['articles','images'].includes(data.resource)}
    <section class="card-flat mt-8" aria-labelledby="obnova">
        <h2 id="obnova" class="mb-1 text-base">Obnovit odstraněný záznam</h2>
        <p class="hint mb-3">Zadejte ID odstraněného záznamu. Zobrazí se jeho historie, ze které lze strukturu obnovit.</p>
        <form method="GET" action={base+'/recover'} class="flex flex-wrap items-end gap-3">
            <label class="field w-48"><span>ID odstraněného záznamu</span><input name="recoverId" type="number" min="1" required/></label>
            <button class="btn btn-secondary">Vyhledat historii pro obnovu</button>
        </form>
    </section>
{/if}
