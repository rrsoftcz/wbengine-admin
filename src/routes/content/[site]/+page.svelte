<script lang="ts">import {labels} from '#lib/content-schema.ts';let {data}=$props();</script>
<p>
<a href="/">Všechny weby</a>
</p>
<h1>{data.site.name}</h1>
<p>Obsah a revize jsou uložené na webu. Dostupnost závisí na oprávněních vašeho účtu, scopes klíče a capabilities vzdáleného API.</p>
{#if data.analytics}<p><a href={'/analytics/'+data.site.id}>Analytika webu</a></p>{/if}
{#each data.resources as resource}<article>
<h2>{labels[resource.name]}</h2>{#if resource.read}<a href={'/content/'+data.site.id+'/'+resource.name}>Otevřít</a>
<p>{resource.write?'Úpravy jsou dostupné.':'Dostupné pouze pro čtení.'}</p>{:else}<p>Čtení není povoleno nebo jej web nepodporuje.</p>{/if}</article>{/each}
