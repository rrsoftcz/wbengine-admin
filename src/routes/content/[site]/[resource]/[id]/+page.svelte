<script lang="ts">
 import {changeTime,changeActor} from '#lib/content-format.ts';
 import {enhance} from '$app/forms';
 import {beforeNavigate} from '$app/navigation';
 import ResourceFields from '#lib/components/ResourceFields.svelte';
 import Breadcrumbs from '#lib/components/content/Breadcrumbs.svelte';
 import PageHeader from '#lib/components/content/PageHeader.svelte';
 import StatusBadge from '#lib/components/content/StatusBadge.svelte';
 import SubmitButton from '#lib/components/content/SubmitButton.svelte';
 import Pager from '#lib/components/content/Pager.svelte';
 import {createPending} from '#lib/components/content/pending.svelte.ts';
 import {labels,translationFields} from '#lib/content-schema.ts';
 let {data,form}=$props();
 const base=$derived('/content/'+data.site.id+'/'+data.resource),here=$derived(base+'/'+data.id);
 let previewVisible=$state(false),dirty=$state(false),publishOpen=$state(false),deleteOpen=$state(false);
 const pending=createPending({onResult:(r)=>{if(r.type==='redirect')dirty=false;}});
 const editingTranslation=$derived(form?.action?.startsWith('translation')??false);
 const values=$derived(form?.values&&form?.action==='save'&&Object.keys(form.values).length?form.values:data.values);
 const tag=$derived(form?.action==='save'&&form?.etag?form.etag:data.etag);
 const translationValues=$derived(form?.translationValues&&editingTranslation?form.translationValues:data.translation??{});
 const translationTag=$derived(form?.translationEtag&&editingTranslation?form.translationEtag:data.translationEtag);
 // Odmítnutí zápisu kvůli nedostupnosti webu přes use:enhance nenačte stránku znovu, proto vychází i ze stavu odpovědi.
 const offline=$derived(pending.status>=500||pending.status===401);
 const title=$derived(data.id==='new'?'Nový záznam':String(data.values.title??data.values.name??data.id));
 const badge=$derived(data.deleted?'deleted':data.id==='new'?'new':data.resource==='articles'?(data.row.draft?'draft':'published'):null);
 const localeQuery=$derived(data.locale?'?locale='+encodeURIComponent(data.locale):'');
 const articles=$derived(data.resource==='articles');
 const translating=$derived(data.id!=='new'&&!data.deleted&&!data.unavailable&&!!translationFields[data.resource]&&!!data.permissions.translationGet&&!!data.locale);
 const missing=$derived((data.versions??[]).filter((v)=>v.exists===false).map((v)=>v.locale));
 const canEdit=$derived(!data.deleted&&!data.unavailable&&data.resource!=='images'&&(translating?data.permissions.translationSave:data.permissions.save));
 beforeNavigate((n)=>{
  if(!dirty)return;
  if(n.type==='leave'){n.cancel();return;}
  if(!confirm('Máte neuložené změny. Opravdu chcete stránku opustit?'))n.cancel();
 });
 const localeNames:Record<string,string>={cs:'Čeština',en:'Angličtina',sk:'Slovenština',de:'Němčina',pl:'Polština',fr:'Francouzština',es:'Španělština',it:'Italština',pt:'Portugalština',ru:'Ruština',uk:'Ukrajinština',nl:'Nizozemština',hu:'Maďarština'};
 function localeName(l:string){const n=localeNames[l.split('_')[0]];return n?n+' ('+l+')':l;}
 function open(kind:'publish'|'delete'){if(kind==='publish')publishOpen=true;else deleteOpen=true;}
</script>

<Breadcrumbs items={[{label:'Weby',href:'/'},{label:data.site.name,href:'/content/'+data.site.id},{label:labels[data.resource],href:base},{label:title}]}/>
<PageHeader {title} description={data.site.name}>
 {#snippet badges()}{#if badge}<StatusBadge state={badge}/>{:else if data.permissions.save===false&&data.id!=='new'&&!data.unavailable}<StatusBadge state="readonly"/>{/if}{/snippet}
</PageHeader>

<div id="vysledek" tabindex="-1" class="outline-none">
 {#if data.boxWarning}<section class="mb-6 rounded-2xl border-2 border-warn bg-warn-soft p-5 text-text" role="alert" aria-labelledby="box-varovani"><h2 id="box-varovani" class="text-warn">Stránka je uložená, ale článek se na ní zatím nezobrazí</h2><p class="mt-1">Nepodařilo se automaticky přidat box, který na stránce vykresluje články. Přidejte ho ručně: otevřete část Boxy, vytvořte nový box typu <code>story</code> v sekci <code>central</code> a přiřaďte mu tuto stránku.</p><p class="mt-3"><a class="btn btn-secondary btn-sm" href={'/content/'+data.site.id+'/boxes/new'}>Přidat box ručně</a></p></section>{/if}
 {#if form?.error&&!form?.conflict}<p class="alert alert-error mb-4" role="alert">{form.error}</p>{/if}
 {#if form?.message}<p class="alert alert-ok mb-4" role="status">{form.message}</p>{/if}
 {#if form?.conflict}<section class="mb-6 rounded-2xl border-2 border-warn bg-warn-soft p-5 text-text" role="alert" aria-labelledby="konflikt">
  <h2 id="konflikt" class="text-warn">Konflikt verzí: záznam mezitím někdo změnil</h2>
  <p class="mt-1">Váš rozepsaný obsah zůstal ve formuláři a nic se neztratilo. Neprovedli jsme automatické opakování zápisu, aby nebyly přepsány cizí změny. Níže porovnejte aktuální obsah, upravte svůj formulář a ručně jej sloučte.</p>
  <details class="mt-3" open>
   <summary class="font-semibold">Aktuální obsah na webu</summary>
   <pre class="mt-2 whitespace-pre-wrap break-words">{JSON.stringify(editingTranslation?data.translation:data.values,null,2)}</pre>
  </details>
  <p class="mt-3"><a data-sveltekit-reload href={here+localeQuery}>Zahodit svoje změny a načíst aktuální obsah</a></p>
 </section>{/if}
</div>

{#if data.unavailable||offline}
 <section class="alert alert-warn mb-6 flex-col" role="alert"><h2 class="text-warn">Web je nedostupný nebo odmítl připojení</h2><p>Vaše odeslané údaje jsou zachované níže. Vzdálený stav nyní nelze ověřit. Zápis neopakujeme automaticky; nejprve obnovte připojení a pak odešlete formulář výslovně. Opakovaný zápis znovu ověří oprávnění i původní ETag.</p>
  {#if !data.unavailable}<p>Zkuste uložení zopakovat tlačítkem Uložit, až bude web dostupný.</p>{/if}</section>
{/if}
{#if data.unavailable}
 {#if data.offlineEditable}<form method="POST" action={'?/'+data.offlineAction} class="card grid gap-4"><input type="hidden" name="csrf" value={data.csrf}/>{#each Object.entries(data.offlineFields) as [name,value]}{#if ['etag','locale'].includes(name)}<input type="hidden" {name} {value}/>{:else if !['confirm','mergeConsent','change_id'].includes(name)}<label class="field"><span>{name}</span>{#if ['introtext','bodytext'].includes(name)}<textarea class="font-mono text-[.9rem]" {name} rows={name==='bodytext'?16:5}>{value}</textarea>{:else}<input type="text" {name} {value}/>{/if}</label>{/if}{/each}<div class="flex flex-wrap gap-3"><button class="btn btn-primary">Po obnovení připojení zkusit uložit zachované údaje</button><a class="btn btn-secondary" data-sveltekit-reload href={here+localeQuery}>Načíst stránku znovu</a></div></form>{:else}<pre class="whitespace-pre-wrap break-words">{JSON.stringify(data.offlineFields,null,2)}</pre>{/if}
{:else}

{#if canEdit||(data.id!=='new'&&!data.deleted&&(data.permissions.publish||data.permissions.delete||data.permissions.preview))}
 <div class="sticky top-[3.4rem] z-10 mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface/95 px-4 py-3 shadow-card backdrop-blur md:top-0" role="toolbar" aria-label="Akce záznamu">
  <p class="text-sm" role="status" aria-live="polite">{#if dirty}<span class="badge badge-warn">Neuložené změny</span>{:else}<span class="text-muted">Bez neuložených změn</span>{/if}</p>
  <div class="flex flex-wrap items-center gap-2">
   {#if articles&&data.id!=='new'&&data.permissions.preview}<a class="btn btn-secondary btn-sm" href={here+'/preview'+localeQuery} target="_blank" rel="noopener noreferrer" onclick={(e)=>{e.preventDefault();previewVisible=!previewVisible;}}>{previewVisible?'Skrýt náhled':'Náhled'}</a>{/if}
   {#if articles&&data.row.draft&&data.permissions.publish}<a class="btn btn-secondary btn-sm" href="#publikace" onclick={()=>open('publish')}>Publikovat</a>{/if}
   {#if data.id!=='new'&&data.permissions.delete}<a class="btn btn-ghost btn-sm text-danger" href="#smazat" onclick={()=>open('delete')}>Smazat</a>{/if}
   {#if canEdit}<SubmitButton form="save-form" busy={pending.is(translating?'?/translationSave':'?/save')} small>{translating?'Uložit překlad':articles?'Uložit koncept':'Uložit změny'}</SubmitButton>{/if}
  </div>
 </div>
{/if}

<div class={['grid items-start gap-6',data.id!=='new'&&!data.deleted&&'xl:grid-cols-[minmax(0,1fr)_17rem]']}>
<div class="grid min-w-0 gap-6">
{#if data.deleted}<p class="alert alert-error" role="status">Záznam je odstraněný. Jeho historii lze použít pro obnovu.</p>
{:else if data.resource==='images'}
 <section class="card grid gap-3">
  {#if data.image}<div class="grid place-items-center rounded-xl bg-surface-2 p-4"><img src={data.image} alt="Náhled nahraného obrázku" class="max-h-[28rem] max-w-full rounded-lg" style="max-width:100%;max-height:450px"/></div>{/if}
  <p class="alert alert-warn">Tento obrázek je veřejný soubor na webu.</p>
  <p>Veřejný obrázek: <code>{String(data.row.url)}</code></p>
  <p class="text-muted">{String(data.row.mime)}, {String(data.row.size)} bajtů</p>
  <p>Markdown vložení: <code>![Popis obrázku]({String(data.row.url)})</code></p>
 </section>
{:else}
{#if data.id!=='new'&&!data.deleted&&translationFields[data.resource]&&data.permissions.translationGet}
 {#if data.versions}
 {@const orig=data.versions.filter((v)=>v.original)}{@const done=data.versions.filter((v)=>!v.original&&v.exists===true)}{@const todo=data.versions.filter((v)=>!v.original&&v.exists!==true)}
 <section class="flex flex-wrap items-end gap-x-6 gap-y-2" aria-label="Jazyková verze">
  <form method="GET" class="flex flex-wrap items-end gap-3"><label class="field w-64"><span>Jazyk obsahu</span><select name="locale" onchange={(e)=>e.currentTarget.form?.requestSubmit()}>
   {#each orig as v}<option value="" selected={!data.locale}>{localeName(v.locale)} (originál)</option>{/each}
   {#if done.length}<optgroup label="Přeloženo ({done.length})">{#each done as v}<option value={v.locale} selected={v.locale===data.locale}>{localeName(v.locale)}</option>{/each}</optgroup>{/if}
   {#if todo.length}<optgroup label={data.versions.some((v)=>v.exists===null)?'Překlady':'Chybí ('+todo.length+')'}>{#each todo as v}<option value={v.locale} selected={v.locale===data.locale}>{localeName(v.locale)}{v.exists===false?' (zatím chybí)':''}</option>{/each}</optgroup>{/if}
  </select></label><noscript><button class="btn btn-secondary btn-sm">Načíst jazyk</button></noscript></form>
  {#if data.versions.every((v)=>v.exists!==null)}<p class="pb-2 text-sm"><strong>Přeloženo {data.versions.filter((v)=>v.exists).length} z {data.versions.length} jazyků</strong>{#if missing.length}<span class="text-muted">, chybí: {missing.slice(0,6).join(', ')}{missing.length>6?' a '+(missing.length-6)+' dalších':''}</span>{/if}</p>{/if}
 </section>
 {:else}
 <form method="GET" class="flex flex-wrap items-end gap-3"><label class="field w-56"><span>Jazyk překladu, například cs nebo en_GB</span><input name="locale" value={data.locale} pattern={'[a-z]{2,3}(_[A-Z]{2})?'}/></label><button class="btn btn-secondary btn-sm">Načíst jazyk</button>{#if data.locale}<a class="btn btn-ghost btn-sm" href={here}>Zpět na originál</a>{/if}</form>
 {/if}
{/if}
{#if !translating}
 {#if articles}<p class="alert alert-info">{data.row.draft?'Upravujete nepublikovaný koncept. Veřejný obsah se změní až po publikování.':'Uložením vznikne nepublikovaný koncept.'}</p>{/if}
 {#if data.permissions.save}<form id="save-form" method="POST" action="?/save" use:enhance={pending.submit} oninput={()=>{dirty=true;}} class="card grid gap-5">
<input type="hidden" name="csrf" value={data.csrf}/>
<input type="hidden" name="etag" value={tag??''}/>{#key JSON.stringify(values)}<ResourceFields resource={data.resource} {values} boxTypes={data.boxTypes} refs={data.refs} siteId={data.site.id} offerArticleBox={data.offerArticleBox} canAddArticleBox={data.canAddArticleBox} articleBoxPages={data.articleBoxPages} noArticleBox={data.resource==='pages'&&data.id==='new'&&!data.offerArticleBox} fieldError={form?.field&&!editingTranslation?{field:form.field,message:form.error}:undefined}/>{/key}{#if form?.conflict&&!editingTranslation}<div class="grid gap-3 rounded-xl border border-warn bg-warn-soft p-4"><label class="flex items-start gap-2 text-sm">
<input name="mergeConsent" type="checkbox" value="yes"/> Zkontroloval jsem aktuální obsah a chci jej ručně sloučit</label>
<div><SubmitButton formaction="?/merge" variant="secondary" busy={pending.is('?/merge')}>Převzít aktuální verzi pro ruční sloučení bez uložení</SubmitButton></div></div>{/if}
<div class="flex flex-wrap items-center gap-3"><SubmitButton busy={pending.is('?/save')}>{articles?'Uložit koncept':'Uložit změny'}</SubmitButton><span class="hint">{articles?'Ukládá se jako koncept, veřejný obsah zůstává beze změny.':'Změna se projeví na webu okamžitě.'}</span></div></form>
 {:else}<section class="card"><p class="alert alert-info mb-3">Úpravy nejsou povoleny vaší rolí, scopes klíče nebo capabilities webu.</p>
<pre class="whitespace-pre-wrap break-words">{JSON.stringify(data.values,null,2)}</pre></section>{/if}
{:else}
  <section class="card grid gap-4" aria-labelledby="preklad">
   <h2 id="preklad">Překlad: {data.locale}</h2>
   <p class="hint">Jazyk {data.locale}. Prázdná pole ukládají prázdný překlad. Odstranění překladu obnoví dědění původního obsahu. Překlady článků se nejprve ukládají do konceptu.</p>
   {#if data.permissions.translationSave}<form id="save-form" method="POST" action="?/translationSave" use:enhance={pending.submit} oninput={()=>{dirty=true;}} class="grid gap-5">
<input name="csrf" type="hidden" value={data.csrf}/>
<input name="locale" type="hidden" value={data.locale}/>
<input name="etag" type="hidden" value={translationTag??''}/>{#key JSON.stringify(translationValues)}<ResourceFields resource={data.resource} values={translationValues} translation fieldError={form?.field&&editingTranslation?{field:form.field,message:form.error}:undefined}/>{/key}{#if form?.conflict&&editingTranslation}<div class="grid gap-3 rounded-xl border border-warn bg-warn-soft p-4"><label class="flex items-start gap-2 text-sm">
<input name="mergeConsent" type="checkbox" value="yes"/> Zkontroloval jsem aktuální překlad pro ruční sloučení</label>
<div><SubmitButton formaction="?/merge" variant="secondary" busy={pending.is('?/merge')}>Převzít aktuální verzi překladu bez uložení</SubmitButton></div></div>{/if}<div><SubmitButton busy={pending.is('?/translationSave')}>Uložit překlad</SubmitButton></div></form>{/if}
   {#if data.permissions.translationDelete}<details class="rounded-xl border border-line p-3"><summary class="text-sm font-semibold text-danger">Odstranit překlad {data.locale}</summary>
<form method="POST" action="?/translationDelete" use:enhance={pending.submit} class="mt-3 grid gap-3">
<p class="hint">Původní obsah se začne zobrazovat i v jazyce {data.locale}.</p>
<input name="csrf" type="hidden" value={data.csrf}/>
<input name="locale" type="hidden" value={data.locale}/>
<input name="etag" type="hidden" value={translationTag??''}/>
<div><SubmitButton variant="danger" small busy={pending.is('?/translationDelete')}>Odstranit překlad {data.locale}</SubmitButton></div>
</form></details>{/if}
  </section>
{/if}
{/if}

{#if data.id!=='new'&&!data.deleted}
 {#if articles&&data.permissions.preview&&previewVisible}<section class="card grid gap-3" aria-labelledby="nahled"><h2 id="nahled">Soukromý náhled uloženého konceptu</h2><p class="hint">Náhled vychází z posledního uloženého konceptu. Externí média a skripty jsou v náhledu blokované.</p>
<iframe title="Soukromý náhled článku" sandbox="" referrerpolicy="no-referrer" src={here+'/preview'+localeQuery} class="block h-[40rem] w-full rounded-xl border border-line bg-white">
</iframe></section>{/if}


{/if}

{#if data.id!=='new'&&data.resource!=='images'}
{#if data.historyOpen}
  <section class="card" aria-labelledby="historie">
   <h2 id="historie">{articles?'Revize článku':'Historie a obnova struktury'}</h2>
   <p class="hint mb-4">{articles?'Obnova revize vytvoří koncept. Veřejná verze se nezmění bez publikování.':'Obnova vychází ze snapshotu před zvolenou změnou, u založení ze stavu po vytvoření. Kontrolují se aktuální vazby a překlady.'}</p>
   {#if data.history.length}<ol class="relative ml-2 grid gap-5 border-l border-line-strong pl-6">{#each data.history as change}<li class="relative">
<span class="absolute -left-[1.95rem] top-1.5 size-3 rounded-full border-2 border-brand bg-surface" aria-hidden="true"></span>
<h3 class="flex flex-wrap items-center gap-2">{articles?'Revize':'Změna'} {String(change.revision_id??change.change_id)} <span class="badge badge-brand">{String(change.action??'')}</span></h3>
<p class="hint">{changeTime(change.created_at)}, {changeActor(change,data.actors)}</p>
<details class="mt-2">
<summary class="text-sm">Zobrazit uložený stav</summary>
<pre class="mt-2 whitespace-pre-wrap break-words">{JSON.stringify(change.payload??change,null,2)}</pre>
</details>{#if data.permissions[articles?'restore':'structureRestore']}<details class="mt-2"><summary class="text-sm font-semibold">Obnovit tento stav</summary><form method="POST" action="?/restore" use:enhance={pending.submit} class="mt-2 grid gap-3 rounded-xl bg-surface-2 p-3">
<input name="csrf" type="hidden" value={data.csrf}/>
<input name="change_id" type="hidden" value={String(change.revision_id??change.change_id)}/>
<input name="etag" type="hidden" value={(articles?tag:data.historyEtag)??''}/>
<label class="flex items-start gap-2 text-sm">
<input name="confirm" value="yes" type="checkbox" required/> Potvrzuji obnovu tohoto stavu</label>
<div><SubmitButton variant="secondary" small busy={pending.is('?/restore')}>{articles?'Obnovit do konceptu':'Obnovit strukturu'}</SubmitButton></div>
</form></details>{/if}</li>{/each}</ol>{:else}<p class="text-muted">Historie je prázdná.</p>{/if}
   {#if data.pagination}<Pager page={data.pagination.page} totalPages={data.pagination.total_pages} href={(p)=>here+'?historyPage='+p} previous="Novější záznamy" next="Starší záznamy"/>{/if}
  </section>
  {#if !data.deleted}<p class="mt-3"><a class="btn btn-ghost btn-sm" href={here+(data.locale?'?locale='+encodeURIComponent(data.locale):'')} data-sveltekit-noscroll>Skrýt historii</a></p>{/if}
{/if}
{/if}
</div>

{#if data.id!=='new'&&!data.deleted}
<aside class="grid gap-4 xl:sticky xl:top-20" aria-label="Publikace, stav a překlady">
 <section class="card-flat grid gap-2 text-sm">
  <h2 class="text-base">Stav</h2>
  <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
   <dt class="text-muted">ID</dt><dd>{data.id}</dd>
   <dt class="text-muted">Typ</dt><dd>{labels[data.resource]}</dd>
   {#if articles}<dt class="text-muted">Stav</dt><dd>{data.row.draft?'Koncept':'Publikováno'}</dd>{/if}
  </dl>
  {#if articles}<details class="mt-1"><summary class="font-semibold">Publikovaný obsah</summary>
<pre class="mt-2 whitespace-pre-wrap break-words">{JSON.stringify({title:data.row.title,introtext:data.row.introtext,bodytext:data.row.bodytext},null,2)}</pre>
</details>{/if}
 </section>

 {#if data.history.length}
  <section class="card-flat grid gap-2 text-sm" aria-labelledby="posledni-zmeny">
   <h2 id="posledni-zmeny" class="text-base">Poslední změny</h2>
   <ol class="grid gap-1.5">{#each data.history.slice(0,5) as change}<li class="flex items-center justify-between gap-2"><span class="flex items-center gap-2"><span class="badge badge-brand">{String(change.action??'')}</span><span class="text-muted">{articles?'revize':'změna'} {String(change.revision_id??change.change_id)}</span></span><span class="grid justify-items-end text-xs text-muted"><span>{changeTime(change.created_at)}</span><span class="max-w-[10rem] truncate" title={changeActor(change,data.actors)}>{changeActor(change,data.actors)}</span></span></li>{/each}</ol>
   <a href={here+'?'+(data.locale?'locale='+encodeURIComponent(data.locale)+'&':'')+'history=1#historie'} data-sveltekit-noscroll>Všechny změny a obnova</a>
  </section>
 {/if}

 {#if articles&&data.row.draft&&data.permissions.publish}
  <details id="publikace" bind:open={publishOpen} class="card-flat">
   <summary class="font-semibold">Publikovat koncept</summary>
   <form method="POST" action="?/publish" use:enhance={pending.submit} class="mt-3 grid gap-3">
<p class="hint">Publikování změní veřejný obsah i jeho překlady. Koncept musí být přiřazen ke stránce.{#if dirty} Publikuje se uložený koncept, neuložené změny ve formuláři se nepromítnou.{/if}</p>
<input type="hidden" name="csrf" value={data.csrf}/>
<input type="hidden" name="etag" value={tag??''}/>
<label class="flex items-start gap-2 text-sm">
<input name="confirm" value="yes" type="checkbox" required/> Potvrzuji publikování uloženého konceptu</label>
<div><SubmitButton busy={pending.is('?/publish')}>Publikovat</SubmitButton></div>
</form>
  </details>
 {/if}

 {#if data.permissions.delete}
  <details id="smazat" bind:open={deleteOpen} class="card-flat border-danger/40">
   <summary class="font-semibold text-danger">Odstranit záznam</summary>
   <form method="POST" action="?/delete" use:enhance={pending.submit} class="mt-3 grid gap-3">
<p class="hint">Odstranění je změna veřejného obsahu. Předem ověřte návaznosti a odkazy.</p>
<input name="csrf" type="hidden" value={data.csrf}/>
<input name="etag" type="hidden" value={tag??''}/>
<label class="flex items-start gap-2 text-sm">
<input name="confirm" value="yes" type="checkbox" required/> Potvrzuji odstranění</label>
<div><SubmitButton variant="danger" busy={pending.is('?/delete')}>Odstranit</SubmitButton></div>
</form>
  </details>
 {/if}
</aside>
{/if}
</div>
{/if}
