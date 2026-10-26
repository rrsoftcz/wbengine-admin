<script lang="ts">
 import ResourceFields from '#lib/components/ResourceFields.svelte';import {labels,translationFields} from '#lib/content-schema.ts';
 let {data,form}=$props();const base=$derived('/content/'+data.site.id+'/'+data.resource),here=$derived(base+'/'+data.id);let previewVisible=$state(false);
 const editingTranslation=$derived(form?.action?.startsWith('translation')??false);
 const values=$derived(form?.values&&form?.action==='save'&&Object.keys(form.values).length?form.values:data.values);
 const tag=$derived(form?.action==='save'&&form?.etag?form.etag:data.etag);
 const translationValues=$derived(form?.translationValues&&editingTranslation?form.translationValues:data.translation??{});
 const translationTag=$derived(form?.translationEtag&&editingTranslation?form.translationEtag:data.translationEtag);
</script>
<p>
<a href={base}>{labels[data.resource]}, {data.site.name}</a>
</p>
<h1>{data.id==='new'?'Nový záznam':String(data.values.title??data.values.name??data.id)}</h1>
{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}{#if form?.message}<p>{form.message}</p>{/if}
{#if form?.conflict}<section class="conflict">
<h2>Konflikt verzí</h2>
<p>Váš rozepsaný obsah zůstal ve formuláři. Neprovedli jsme automatické opakování zápisu. Níže porovnejte aktuální obsah a upravte svůj formulář.</p>
<details open>
<summary>Aktuální obsah na webu</summary>
<pre>{JSON.stringify(editingTranslation?data.translation:data.values,null,2)}</pre>
</details>
<p>
<a data-sveltekit-reload href={here+(data.locale?'?locale='+encodeURIComponent(data.locale):'')}>Zahodit svoje změny a načíst aktuální obsah</a>
</p>
</section>{/if}
{#if data.unavailable}
<section role="alert"><h2>Web je nedostupný nebo odmítl připojení</h2><p>Vaše odeslané údaje jsou zachované níže. Vzdálený stav nyní nelze ověřit. Zápis neopakujeme automaticky; nejprve obnovte připojení a pak odešlete formulář výslovně. Opakovaný zápis znovu ověří oprávnění i původní ETag.</p></section>
{#if data.offlineEditable}<form method="POST" action={'?/'+data.offlineAction} class="editor"><input type="hidden" name="csrf" value={data.csrf}/>{#each Object.entries(data.offlineFields) as [name,value]}{#if ['etag','locale'].includes(name)}<input type="hidden" {name} {value}/>{:else if !['confirm','mergeConsent','change_id'].includes(name)}<label>{name}{#if ['introtext','bodytext'].includes(name)}<textarea {name} rows={name==='bodytext'?16:5}>{value}</textarea>{:else}<input type="text" {name} {value}/>{/if}</label>{/if}{/each}<button>Po obnovení připojení zkusit uložit zachované údaje</button></form>{:else}<pre>{JSON.stringify(data.offlineFields,null,2)}</pre>{/if}
{:else}
{#if data.deleted}<p>Záznam je odstraněný. Jeho historii lze použít pro obnovu.</p>
{:else if data.resource==='images'}{#if data.image}<img src={data.image} alt="Náhled nahraného obrázku" style="max-width:100%;max-height:450px"/>{/if}<p>Veřejný obrázek: <code>{String(data.row.url)}</code>
</p>
<p>{String(data.row.mime)}, {String(data.row.size)} bajtů</p>
<p>Markdown vložení: <code>![Popis obrázku]({String(data.row.url)})</code>
</p>
{:else}
{#if data.resource==='articles'}<p>{data.row.draft?'Upravujete nepublikovaný koncept. Veřejný obsah se změní až po publikování.':'Uložením vznikne nepublikovaný koncept.'}</p>{#if data.id!=='new'}<details>
<summary>Publikovaný obsah</summary>
<pre>{JSON.stringify({title:data.row.title,introtext:data.row.introtext,bodytext:data.row.bodytext},null,2)}</pre>
</details>{/if}{/if}
{#if data.permissions.save}<form method="POST" action="?/save" class="editor">
<input type="hidden" name="csrf" value={data.csrf}/>
<input type="hidden" name="etag" value={tag??''}/>{#key JSON.stringify(values)}<ResourceFields resource={data.resource} {values} boxTypes={data.boxTypes}/>{/key}<button>{data.resource==='articles'?'Uložit koncept':'Uložit změny'}</button>{#if form?.conflict&&!editingTranslation}<label>
<input name="mergeConsent" type="checkbox" value="yes"/> Zkontroloval jsem aktuální obsah a chci jej ručně sloučit</label>
<button formaction="?/merge">Převzít aktuální verzi pro ruční sloučení bez uložení</button>{/if}</form>{:else}<p>Úpravy nejsou povoleny vaší rolí, scopes klíče nebo capabilities webu.</p>
<pre>{JSON.stringify(data.values,null,2)}</pre>{/if}
{/if}
{#if data.id!=='new'&&!data.deleted}
{#if data.resource==='articles'&&data.permissions.preview}<button onclick={()=>previewVisible=!previewVisible}>{previewVisible?'Skrýt náhled':'Zobrazit soukromý náhled uloženého konceptu'}</button>{#if previewVisible}<p>Náhled vychází z posledního uloženého konceptu. Externí média a skripty jsou v náhledu blokované.</p>
<iframe title="Soukromý náhled článku" sandbox="" referrerpolicy="no-referrer" src={here+'/preview'+(data.locale?'?locale='+encodeURIComponent(data.locale):'')}>
</iframe>{/if}{/if}
{#if data.resource==='articles'&&data.row.draft&&data.permissions.publish}<form method="POST" action="?/publish">
<h2>Publikovat koncept</h2>
<p>Publikování změní veřejný obsah i jeho překlady. Koncept musí být přiřazen ke stránce.</p>
<input name="csrf" type="hidden" value={data.csrf}/>
<input name="etag" type="hidden" value={tag??''}/>
<label>
<input name="confirm" value="yes" type="checkbox" required/> Potvrzuji publikování uloženého konceptu</label>
<button>Publikovat</button>
</form>{/if}
{#if translationFields[data.resource]&&data.permissions.translationGet}<h2>Překlady</h2>
<form method="GET">
<label>Jazyk, například cs nebo en_GB<input name="locale" value={data.locale} pattern={'[a-z]{2,3}(_[A-Z]{2})?'} required/>
</label>
<button>Načíst překlad</button>
</form>{#if data.locale}<p>Jazyk {data.locale}. Prázdná pole ukládají prázdný překlad. Odstranění překladu obnoví dědění původního obsahu. Překlady článků se nejprve ukládají do konceptu.</p>{#if data.permissions.translationSave}<form method="POST" action="?/translationSave" class="editor">
<input name="csrf" type="hidden" value={data.csrf}/>
<input name="locale" type="hidden" value={data.locale}/>
<input name="etag" type="hidden" value={translationTag??''}/>{#key JSON.stringify(translationValues)}<ResourceFields resource={data.resource} values={translationValues} translation/>{/key}<button>Uložit překlad</button>{#if form?.conflict&&editingTranslation}<label>
<input name="mergeConsent" type="checkbox" value="yes"/> Zkontroloval jsem aktuální překlad pro ruční sloučení</label>
<button formaction="?/merge">Převzít aktuální verzi překladu bez uložení</button>{/if}</form>{/if}{#if data.permissions.translationDelete}<form method="POST" action="?/translationDelete">
<input name="csrf" type="hidden" value={data.csrf}/>
<input name="locale" type="hidden" value={data.locale}/>
<input name="etag" type="hidden" value={translationTag??''}/>
<button>Odstranit překlad {data.locale}</button>
</form>{/if}{/if}{/if}
{#if data.permissions.delete}<form method="POST" action="?/delete">
<h2>Odstranit záznam</h2>
<p>Odstranění je změna veřejného obsahu. Předem ověřte návaznosti a odkazy.</p>
<input name="csrf" type="hidden" value={data.csrf}/>
<input name="etag" type="hidden" value={tag??''}/>
<label>
<input name="confirm" value="yes" type="checkbox" required/> Potvrzuji odstranění</label>
<button>Odstranit</button>
</form>{/if}
{/if}
{#if data.id!=='new'&&data.resource!=='images'}<h2>{data.resource==='articles'?'Revize článku':'Historie a obnova struktury'}</h2>
<p>{data.resource==='articles'?'Obnova revize vytvoří koncept. Veřejná verze se nezmění bez publikování.':'Obnova vychází ze snapshotu před zvolenou změnou, u založení ze stavu po vytvoření. Kontrolují se aktuální vazby a překlady.'}</p>{#each data.history as change}<article>
<h3>{data.resource==='articles'?'Revize':'Změna'} {String(change.revision_id??change.change_id)}: {String(change.action??'')}</h3>
<p>{String(change.created_at??'')}</p>
<details>
<summary>Zobrazit uložený stav</summary>
<pre>{JSON.stringify(change.payload??change,null,2)}</pre>
</details>{#if data.permissions[data.resource==='articles'?'restore':'structureRestore']}<form method="POST" action="?/restore">
<input name="csrf" type="hidden" value={data.csrf}/>
<input name="change_id" type="hidden" value={String(change.revision_id??change.change_id)}/>
<input name="etag" type="hidden" value={(data.resource==='articles'?tag:data.historyEtag)??''}/>
<label>
<input name="confirm" value="yes" type="checkbox" required/> Potvrzuji obnovu tohoto stavu</label>
<button>{data.resource==='articles'?'Obnovit do konceptu':'Obnovit strukturu'}</button>
</form>{/if}</article>{:else}<p>Historie je prázdná.</p>{/each}{#if data.pagination}<nav>{#if data.pagination.page>1}<a href={here+'?historyPage='+(data.pagination.page-1)}>Novější záznamy</a>{/if}{#if data.pagination.page<data.pagination.total_pages}<a href={here+'?historyPage='+(data.pagination.page+1)}>Starší záznamy</a>{/if}</nav>{/if}{/if}
{/if}
<style>.editor{max-width:900px}iframe{display:block;width:100%;height:650px;border:1px solid #a8b7c3;margin:1rem 0}.conflict{border:2px solid #a66b00;padding:1rem;background:#fff5dc}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style>
