<script lang="ts">
    import {labels} from '#lib/content-schema.ts';
    import Breadcrumbs from '#lib/components/content/Breadcrumbs.svelte';
    import PageHeader from '#lib/components/content/PageHeader.svelte';
    let {data}=$props();
    const info:Record<string,string>={
        articles:'Texty, novinky a odborné články s koncepty, revizemi a překlady.',
        pages:'Stránky webu, jejich adresy, titulky a nastavení pro vyhledávače.',
        menu:'Položky navigace webu a jejich pořadí.',
        sections:'Oblasti stránky, do kterých se vkládají boxy.',
        boxes:'Znovupoužitelné bloky obsahu a jejich nastavení.',
        images:'Veřejné obrázky, které lze vložit do textů.'
    };
</script>

<Breadcrumbs items={[{label:'Weby',href:'/'},{label:data.site.name}]}/>
<PageHeader title={data.site.name} description="Obsah a revize jsou uložené na webu. Dostupnost závisí na oprávněních vašeho účtu, scopes klíče a capabilities vzdáleného API.">
    {#snippet actions()}{#if data.analytics}<a class="btn btn-secondary" href={'/analytics/'+data.site.id}>Analytika webu</a>{/if}{/snippet}
</PageHeader>

<h2 class="sr-only">Typy obsahu</h2>
<ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {#each data.resources as resource}
        <li class="card-flat flex flex-col gap-3">
            <div class="flex items-start justify-between gap-2">
                <h3 class="text-lg">{labels[resource.name]}</h3>
                {#if !resource.read}<span class="badge badge-warn">Nedostupné</span>
                {:else if resource.write}<span class="badge badge-ok">Úpravy</span>
                {:else}<span class="badge">Pouze čtení</span>{/if}
            </div>
            <p class="hint grow">{info[resource.name]??''}</p>
            {#if resource.read}
                <a class="btn btn-secondary btn-sm self-start" href={'/content/'+data.site.id+'/'+resource.name}>Otevřít<span class="sr-only">: {labels[resource.name]}</span></a>
                <p class="hint">{resource.write?'Úpravy jsou dostupné.':'Dostupné pouze pro čtení.'}</p>
            {:else}
                <p class="hint">Čtení není povoleno nebo jej web nepodporuje.</p>
            {/if}
        </li>
    {/each}
</ul>
