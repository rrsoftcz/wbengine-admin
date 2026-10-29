<script lang="ts">
 import {untrack} from 'svelte';
 let {name,label,options,selected,shared=false}: {name:string;label:string;options:{value:number;label:string}[];selected:number[];shared?:boolean}=$props();
 let ids=$state<number[]>(untrack(()=>[...selected]));
 let filter=$state('');
 let choice=$state('');
 const known=$derived(new Map(options.map(o=>[o.value,o.label])));
 const free=$derived(options.filter(o=>!ids.includes(o.value)&&(!filter.trim()||o.label.toLowerCase().includes(filter.trim().toLowerCase()))));
 function add(){const id=Number(choice);if(id>0&&!ids.includes(id))ids=[...ids,id];choice='';}
 function remove(id:number){ids=ids.filter(x=>x!==id);}
</script>
<div class="field sm:col-span-2">
 <span>{label}</span>
 <input type="hidden" {name} value={ids.join(', ')}/>
 {#if shared}
  <p class="hint rounded-lg border border-line bg-surface-2 px-3 py-2" role="status">The box is shared, so it appears on every page of its section and the page list below is ignored.</p>
 {/if}
 {#if ids.length}
  <ul class="flex flex-wrap gap-2" aria-label="Pages the box appears on">
   {#each ids as id}<li class="flex items-center gap-2 rounded-full border border-line bg-surface-2 py-1 pl-3 pr-1 text-sm"><span>{known.get(id)??'Page '+id}</span><button type="button" class="btn btn-ghost btn-sm" aria-label={'Remove '+(known.get(id)??'page '+id)} onclick={()=>remove(id)}>Remove</button></li>{/each}
  </ul>
 {:else}
  <p class="hint">No page selected yet, so the box is not shown anywhere unless it is shared.</p>
 {/if}
 <div class="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
  <input type="search" placeholder="Filter pages" aria-label="Filter pages" bind:value={filter} autocomplete="off"/>
  <select aria-label="Page to add" bind:value={choice}><option value="">Select a page</option>{#each free as option}<option value={option.value}>{option.label}</option>{/each}</select>
  <button type="button" class="btn btn-sm" disabled={!choice} onclick={add}>Add page</button>
 </div>
 <span class="hint">Pick the pages where the box should appear. Use the shared switch for a box that belongs on every page.</span>
</div>
