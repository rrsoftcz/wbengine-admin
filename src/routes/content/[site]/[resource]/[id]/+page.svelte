<script lang="ts">
 import {changeTime,changeActor,changeLabel,deleteName} from '#lib/content-format.ts';
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
 // A write rejected because the site is unavailable does not reload the page via use:enhance, so this is also derived from the response status.
 const offline=$derived(pending.status>=500||pending.status===401);
 const title=$derived(data.id==='new'?'New record':String(data.values.title??data.values.name??data.id));
 const badge=$derived(data.deleted?'deleted':data.id==='new'?'new':data.resource==='articles'?(data.row.draft?'draft':'published'):null);
 const localeQuery=$derived(data.locale?'?locale='+encodeURIComponent(data.locale):'');
 const articles=$derived(data.resource==='articles');
 const translating=$derived(data.id!=='new'&&!data.deleted&&!data.unavailable&&!!translationFields[data.resource]&&!!data.permissions.translationGet&&!!data.locale);
 const missing=$derived((data.versions??[]).filter((v)=>v.exists===false).map((v)=>v.locale));
 const canEdit=$derived(!data.deleted&&!data.unavailable&&data.resource!=='images'&&(translating?data.permissions.translationSave:data.permissions.save));
 beforeNavigate((n)=>{
  if(!dirty)return;
  if(n.type==='leave'){n.cancel();return;}
  if(!confirm('You have unsaved changes. Do you really want to leave this page?'))n.cancel();
 });
 const localeNames:Record<string,string>={cs:'Czech',en:'English',sk:'Slovak',de:'German',pl:'Polish',fr:'French',es:'Spanish',it:'Italian',pt:'Portuguese',ru:'Russian',uk:'Ukrainian',nl:'Dutch',hu:'Hungarian'};
 function localeName(l:string){const n=localeNames[l.split('_')[0]];return n?n+' ('+l+')':l;}
 const cannotRemove:Record<string,string>={articles:'This article cannot be removed',pages:'This page cannot be removed',menu:'This menu item cannot be removed',sections:'This section cannot be removed',boxes:'This box cannot be removed',images:'This image cannot be removed'};
 function open(kind:'publish'|'delete'){if(kind==='publish')publishOpen=true;else deleteOpen=true;}
</script>

<Breadcrumbs items={[{label:'Sites',href:'/'},{label:data.site.name,href:'/content/'+data.site.id},{label:labels[data.resource],href:base},{label:title}]}/>
<PageHeader {title} description={data.site.name}>
 {#snippet badges()}{#if badge}<StatusBadge state={badge}/>{:else if data.permissions.save===false&&data.id!=='new'&&!data.unavailable}<StatusBadge state="readonly"/>{/if}{/snippet}
</PageHeader>

<div id="vysledek" tabindex="-1" class="outline-none">
 {#if data.boxWarning}<section class="mb-6 rounded-2xl border-2 border-warn bg-warn-soft p-5 text-text" role="alert" aria-labelledby="box-varovani"><h2 id="box-varovani" class="text-warn">The page is saved, but the article will not appear on it yet</h2><p class="mt-1">The box that renders articles on the page could not be added automatically. Add it manually: open Boxes, create a new box of type <code>story</code> in the <code>central</code> section and assign this page to it.</p><p class="mt-3"><a class="btn btn-secondary btn-sm" href={'/content/'+data.site.id+'/boxes/new'}>Add box manually</a></p></section>{/if}
 {#if form?.error&&!form?.conflict}<p class="alert alert-error mb-4" role="alert">{form.error}</p>{/if}
 {#if form?.message}<p class="alert alert-ok mb-4" role="status">{form.message}</p>{/if}
 {#if form?.conflict}<section class="mb-6 rounded-2xl border-2 border-warn bg-warn-soft p-5 text-text" role="alert" aria-labelledby="konflikt">
  <h2 id="konflikt" class="text-warn">Version conflict: someone has changed the record in the meantime</h2>
  <p class="mt-1">Your unsaved content is still in the form and nothing was lost. We did not retry the write automatically, so that other people's changes are not overwritten. Compare the current content below, edit your form and merge it manually.</p>
  <details class="mt-3" open>
   <summary class="font-semibold">Current content on the site</summary>
   <pre class="mt-2 whitespace-pre-wrap break-words">{JSON.stringify(editingTranslation?data.translation:data.values,null,2)}</pre>
  </details>
  <p class="mt-3"><a data-sveltekit-reload href={here+localeQuery}>Discard your changes and load the current content</a></p>
 </section>{/if}
</div>

{#if data.unavailable||offline}
 <section class="alert alert-warn mb-6 flex-col" role="alert"><h2 class="text-warn">The site is unavailable or refused the connection</h2><p>The data you submitted is kept below. The remote state cannot be verified right now. We do not retry the write automatically: restore the connection first, then submit the form explicitly. A repeated write verifies the permissions and the original ETag again.</p>
  {#if !data.unavailable}<p>Try saving again with the Save button once the site is available.</p>{/if}</section>
{/if}
{#if data.unavailable}
 {#if data.offlineEditable}<form method="POST" action={'?/'+data.offlineAction} class="card grid gap-4"><input type="hidden" name="csrf" value={data.csrf}/>{#each Object.entries(data.offlineFields) as [name,value]}{#if ['etag','locale'].includes(name)}<input type="hidden" {name} {value}/>{:else if !['confirm','mergeConsent','change_id'].includes(name)}<label class="field"><span>{name}</span>{#if ['introtext','bodytext'].includes(name)}<textarea class="font-mono text-[.9rem]" {name} rows={name==='bodytext'?16:5}>{value}</textarea>{:else}<input type="text" {name} {value}/>{/if}</label>{/if}{/each}<div class="flex flex-wrap gap-3"><button class="btn btn-primary">Try to save the kept data after the connection is restored</button><a class="btn btn-secondary" data-sveltekit-reload href={here+localeQuery}>Reload the page</a></div></form>{:else}<pre class="whitespace-pre-wrap break-words">{JSON.stringify(data.offlineFields,null,2)}</pre>{/if}
{:else}

{#if canEdit||(data.id!=='new'&&!data.deleted&&(data.permissions.publish||data.permissions.delete||data.permissions.preview))}
 <div class="sticky top-[3.4rem] z-10 mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface/95 px-4 py-3 shadow-card backdrop-blur md:top-0" role="toolbar" aria-label="Record actions">
  <p class="text-sm" role="status" aria-live="polite">{#if dirty}<span class="badge badge-warn">Unsaved changes</span>{:else}<span class="text-muted">No unsaved changes</span>{/if}</p>
  <div class="flex flex-wrap items-center gap-2">
   {#if articles&&data.id!=='new'&&data.permissions.preview}<a class="btn btn-secondary btn-sm" href={here+'/preview'+localeQuery} target="_blank" rel="noopener noreferrer" onclick={(e)=>{e.preventDefault();previewVisible=!previewVisible;}}>{previewVisible?'Hide preview':'Preview'}</a>{/if}
   {#if articles&&data.row.draft&&data.permissions.publish}<a class="btn btn-secondary btn-sm" href="#publikace" onclick={()=>open('publish')}>Publish</a>{/if}
   {#if data.id!=='new'&&data.permissions.delete}<a class="btn btn-ghost btn-sm text-danger" href={data.dependents?.length?'#vazby':'#smazat'} onclick={()=>{if(!data.dependents?.length)open('delete');}}>{data.dependents?.length?deleteName(data.resource).button+' (blocked by dependents)':deleteName(data.resource).button}</a>{/if}
   {#if canEdit}<SubmitButton form="save-form" busy={pending.is(translating?'?/translationSave':'?/save')} small>{translating?'Save translation':articles?'Save draft':'Save changes'}</SubmitButton>{/if}
  </div>
 </div>
{/if}

<div class={['grid items-start gap-6',data.id!=='new'&&!data.deleted&&'xl:grid-cols-[minmax(0,1fr)_17rem]']}>
<div class="grid min-w-0 gap-6">
{#if data.deleted}<p class="alert alert-error" role="status">The record has been removed. Its history can be used to restore it.</p>
{:else if data.resource==='images'}
 <section class="card grid gap-3">
  {#if data.image}<div class="grid place-items-center rounded-xl bg-surface-2 p-4"><img src={data.image} alt="Uploaded file, enlarged" class="max-h-[28rem] max-w-full rounded-lg" style="max-width:100%;max-height:450px"/></div>{/if}
  <p class="alert alert-warn">This image is a public file on the site.</p>
  <p>Public image: <code>{String(data.row.url)}</code></p>
  <p class="text-muted">{String(data.row.mime)}, {String(data.row.size)} bytes</p>
  <p>Markdown embed: <code>![Image description]({String(data.row.url)})</code></p>
 </section>
{:else}
{#if data.id!=='new'&&!data.deleted&&translationFields[data.resource]&&data.permissions.translationGet}
 {#if data.versions}
 {@const orig=data.versions.filter((v)=>v.original)}{@const done=data.versions.filter((v)=>!v.original&&v.exists===true)}{@const todo=data.versions.filter((v)=>!v.original&&v.exists!==true)}
 <section class="flex flex-wrap items-end gap-x-6 gap-y-2" aria-label="Language version">
  <form method="GET" class="flex flex-wrap items-end gap-3"><label class="field w-64"><span>Content language</span><select name="locale" onchange={(e)=>e.currentTarget.form?.requestSubmit()}>
   {#each orig as v}<option value="" selected={!data.locale}>{localeName(v.locale)} (original)</option>{/each}
   {#if done.length}<optgroup label="Translated ({done.length})">{#each done as v}<option value={v.locale} selected={v.locale===data.locale}>{localeName(v.locale)}</option>{/each}</optgroup>{/if}
   {#if todo.length}<optgroup label={data.versions.some((v)=>v.exists===null)?'Translations':'Missing ('+todo.length+')'}>{#each todo as v}<option value={v.locale} selected={v.locale===data.locale}>{localeName(v.locale)}{v.exists===false?' (missing so far)':''}</option>{/each}</optgroup>{/if}
  </select></label><noscript><button class="btn btn-secondary btn-sm">Load language</button></noscript></form>
  {#if data.versions.every((v)=>v.exists!==null)}<p class="pb-2 text-sm"><strong>Translated {data.versions.filter((v)=>v.exists).length} of {data.versions.length} languages</strong>{#if missing.length}<span class="text-muted">, missing: {missing.slice(0,6).join(', ')}{missing.length>6?' and '+(missing.length-6)+' more':''}</span>{/if}</p>{/if}
 </section>
 {:else}
 <form method="GET" class="flex flex-wrap items-end gap-3"><label class="field w-56"><span>Translation language, for example cs or en_GB</span><input name="locale" value={data.locale} pattern={'[a-z]{2,3}(_[A-Z]{2})?'}/></label><button class="btn btn-secondary btn-sm">Load language</button>{#if data.locale}<a class="btn btn-ghost btn-sm" href={here}>Back to original</a>{/if}</form>
 {/if}
{/if}
{#if !translating}
 {#if articles}<p class="alert alert-info">{data.row.draft?'You are editing an unpublished draft. Public content changes only after publishing.':'Saving creates an unpublished draft.'}</p>{/if}
 {#if data.permissions.save}<form id="save-form" method="POST" action="?/save" use:enhance={pending.submit} oninput={()=>{dirty=true;}} class="card grid gap-5">
<input type="hidden" name="csrf" value={data.csrf}/>
<input type="hidden" name="etag" value={tag??''}/>{#key JSON.stringify(values)}<ResourceFields resource={data.resource} {values} boxTypes={data.boxTypes} refs={data.refs} siteId={data.site.id} offerArticleBox={data.offerArticleBox} canAddArticleBox={data.canAddArticleBox} articleBoxPages={data.articleBoxPages} otherBoxPages={data.otherBoxPages} noArticleBox={data.resource==='pages'&&data.id==='new'&&!data.offerArticleBox} fieldError={form?.field&&!editingTranslation?{field:form.field,message:form.error}:undefined}/>{/key}{#if form?.conflict&&!editingTranslation}<div class="grid gap-3 rounded-xl border border-warn bg-warn-soft p-4"><label class="flex items-start gap-2 text-sm">
<input name="mergeConsent" type="checkbox" value="yes"/> I have checked the current content and want to merge it manually</label>
<div><SubmitButton formaction="?/merge" variant="secondary" busy={pending.is('?/merge')}>Take the current version for manual merging without saving</SubmitButton></div></div>{/if}
<div class="flex flex-wrap items-center gap-3"><SubmitButton busy={pending.is('?/save')}>{articles?'Save draft':'Save changes'}</SubmitButton><span class="hint">{articles?'Saved as a draft, public content stays unchanged.':'The change appears on the site immediately.'}</span></div></form>
 {:else}<section class="card"><p class="alert alert-info mb-3">Editing is not allowed by your role, the key scopes or the site capabilities.</p>
<pre class="whitespace-pre-wrap break-words">{JSON.stringify(data.values,null,2)}</pre></section>{/if}
{:else}
  <section class="card grid gap-4" aria-labelledby="preklad">
   <h2 id="preklad">Translation: {data.locale}</h2>
   <p class="hint">Language {data.locale}. Empty fields save an empty translation. Removing the translation restores inheritance of the original content. Article translations are saved to the draft first.</p>
   {#if data.permissions.translationSave}<form id="save-form" method="POST" action="?/translationSave" use:enhance={pending.submit} oninput={()=>{dirty=true;}} class="grid gap-5">
<input name="csrf" type="hidden" value={data.csrf}/>
<input name="locale" type="hidden" value={data.locale}/>
<input name="etag" type="hidden" value={translationTag??''}/>{#key JSON.stringify(translationValues)}<ResourceFields resource={data.resource} values={translationValues} translation fieldError={form?.field&&editingTranslation?{field:form.field,message:form.error}:undefined}/>{/key}{#if form?.conflict&&editingTranslation}<div class="grid gap-3 rounded-xl border border-warn bg-warn-soft p-4"><label class="flex items-start gap-2 text-sm">
<input name="mergeConsent" type="checkbox" value="yes"/> I have checked the current translation and want to merge it manually</label>
<div><SubmitButton formaction="?/merge" variant="secondary" busy={pending.is('?/merge')}>Take the current version of the translation without saving</SubmitButton></div></div>{/if}<div><SubmitButton busy={pending.is('?/translationSave')}>Save translation</SubmitButton></div></form>{/if}
   {#if data.permissions.translationDelete}<details class="rounded-xl border border-line p-3"><summary class="text-sm font-semibold text-danger">Remove translation {data.locale}</summary>
<form method="POST" action="?/translationDelete" use:enhance={pending.submit} class="mt-3 grid gap-3">
<p class="hint">The original content will also be shown in {data.locale}.</p>
<input name="csrf" type="hidden" value={data.csrf}/>
<input name="locale" type="hidden" value={data.locale}/>
<input name="etag" type="hidden" value={translationTag??''}/>
<div><SubmitButton variant="danger" small busy={pending.is('?/translationDelete')}>Remove translation {data.locale}</SubmitButton></div>
</form></details>{/if}
  </section>
{/if}
{/if}

{#if data.id!=='new'&&!data.deleted}
 {#if articles&&data.permissions.preview&&previewVisible}<section class="card grid gap-3" aria-labelledby="nahled"><h2 id="nahled">Private preview of the saved draft</h2><p class="hint">The preview is based on the last saved draft. External media and scripts are blocked in the preview.</p>
<iframe title="Private article preview" sandbox="" referrerpolicy="no-referrer" src={here+'/preview'+localeQuery} class="block h-[40rem] w-full rounded-xl border border-line bg-white">
</iframe></section>{/if}


{/if}

{#if data.id!=='new'&&data.resource!=='images'}
{#if data.historyOpen}
  <section class="card" aria-labelledby="historie">
   <h2 id="historie">{articles?'Article revisions':'History and structure restore'}</h2>
   <p class="hint mb-4">{articles?'Restoring a revision creates a draft. The public version does not change without publishing.':'Restore uses the snapshot from before the chosen change, or the state after creation for the initial change. Current dependents and translations are checked.'}</p>
   {#if data.history.length}<ol class="relative ml-2 grid gap-5 border-l border-line-strong pl-6">{#each data.history as change}<li class="relative">
<span class="absolute -left-[1.95rem] top-1.5 size-3 rounded-full border-2 border-brand bg-surface" aria-hidden="true"></span>
<h3 class="flex flex-wrap items-center gap-2">{articles?'Revision':'Change'} {String(change.revision_id??change.change_id)} <span class="badge badge-brand">{changeLabel(change.action)}</span></h3>
<p class="hint">{changeTime(change.created_at)}, {changeActor(change,data.actors)}</p>
<details class="mt-2">
<summary class="text-sm">Show saved state</summary>
<pre class="mt-2 whitespace-pre-wrap break-words">{JSON.stringify(change.payload??change,null,2)}</pre>
</details>{#if data.permissions[articles?'restore':'structureRestore']}<details class="mt-2"><summary class="text-sm font-semibold">Restore this state</summary><form method="POST" action="?/restore" use:enhance={pending.submit} class="mt-2 grid gap-3 rounded-xl bg-surface-2 p-3">
<input name="csrf" type="hidden" value={data.csrf}/>
<input name="change_id" type="hidden" value={String(change.revision_id??change.change_id)}/>
<input name="etag" type="hidden" value={(articles?tag:data.historyEtag)??''}/>
<label class="flex items-start gap-2 text-sm">
<input name="confirm" value="yes" type="checkbox" required/> I confirm restoring this state</label>
<div><SubmitButton variant="secondary" small busy={pending.is('?/restore')}>{articles?'Restore to draft':'Restore structure'}</SubmitButton></div>
</form></details>{/if}</li>{/each}</ol>{:else}<p class="text-muted">History is empty.</p>{/if}
   {#if data.pagination}<Pager page={data.pagination.page} totalPages={data.pagination.total_pages} href={(p)=>here+'?historyPage='+p} previous="Newer entries" next="Older entries"/>{/if}
  </section>
  {#if !data.deleted}<p class="mt-3"><a class="btn btn-ghost btn-sm" href={here+(data.locale?'?locale='+encodeURIComponent(data.locale):'')} data-sveltekit-noscroll>Hide history</a></p>{/if}
{/if}
{/if}
</div>

{#if data.id!=='new'&&!data.deleted}
<aside class="grid gap-4 xl:sticky xl:top-20" aria-label="Publishing, status and translations">
 <section class="card-flat grid gap-2 text-sm">
  <h2 class="text-base">Status</h2>
  <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
   <dt class="text-muted">ID</dt><dd>{data.id}</dd>
   <dt class="text-muted">Type</dt><dd>{labels[data.resource]}</dd>
   {#if articles}<dt class="text-muted">Status</dt><dd>{data.row.draft?'Draft':'Published'}</dd>{/if}
  </dl>
  {#if articles}<details class="mt-1"><summary class="font-semibold">Published content</summary>
<pre class="mt-2 whitespace-pre-wrap break-words">{JSON.stringify({title:data.row.title,introtext:data.row.introtext,bodytext:data.row.bodytext},null,2)}</pre>
</details>{/if}
 </section>

 {#if data.liveLinks.length}
  <section class="card-flat grid gap-2 text-sm" aria-labelledby="ziva-adresa">
   <h2 id="ziva-adresa" class="text-base">{data.liveLinks.length>1?'Live URLs':'Live URL'}</h2>
   <ul class="grid gap-2">{#each data.liveLinks as link}<li class="grid gap-0.5"><a href={link.url} target="_blank" rel="noopener noreferrer" class="break-all font-semibold">{link.url}</a><span class="text-xs text-muted">{link.label}</span>{#if link.note}<span class="text-xs text-muted">{link.note}</span>{/if}</li>{/each}</ul>
  </section>
 {/if}

 {#if data.history.length}
  <section class="card-flat grid gap-2 text-sm" aria-labelledby="posledni-zmeny">
   <h2 id="posledni-zmeny" class="text-base">Latest changes</h2>
   <ol class="divide-y divide-line overflow-hidden rounded-xl border border-line">{#each data.history.slice(0,5) as change}<li class="grid gap-0.5 bg-surface px-3 py-2"><span class="flex items-center justify-between gap-2"><span class="font-semibold">{changeLabel(change.action)}</span><span class="text-xs text-muted">{articles?'revision':'change'} {String(change.revision_id??change.change_id)}</span></span><span>{changeTime(change.created_at)}</span><span class="break-all text-xs text-muted">{changeActor(change,data.actors)}</span></li>{/each}</ol>
   <a href={here+'?'+(data.locale?'locale='+encodeURIComponent(data.locale)+'&':'')+'history=1#historie'} data-sveltekit-noscroll>All changes and restore</a>
  </section>
 {/if}

 {#if articles&&data.row.draft&&data.permissions.publish}
  <details id="publikace" bind:open={publishOpen} class="card-flat">
   <summary class="font-semibold">Publish draft</summary>
   <form method="POST" action="?/publish" use:enhance={pending.submit} class="mt-3 grid gap-3">
<p class="hint">Publishing changes the public content and its translations. The draft must be assigned to a page.{#if dirty} The saved draft is published; unsaved changes in the form are not included.{/if}</p>
<input type="hidden" name="csrf" value={data.csrf}/>
<input type="hidden" name="etag" value={tag??''}/>
<label class="flex items-start gap-2 text-sm">
<input name="confirm" value="yes" type="checkbox" required/> I confirm publishing the saved draft</label>
<div><SubmitButton busy={pending.is('?/publish')}>Publish</SubmitButton></div>
</form>
  </details>
 {/if}

 {#if data.permissions.delete}
 {#if data.dependents&&data.dependents.length}
  <section id="vazby" class="card-flat grid gap-3 border-warn text-sm" aria-labelledby="vazby-nadpis">
   <h2 id="vazby-nadpis" class="text-base text-warn">{cannotRemove[data.resource]??'This record cannot be removed'}</h2>
   <p>Other content depends on it. Remove or move that content first, then the record can be removed. The site would refuse the removal.</p>
   {#each data.dependents??[] as group}<section class="grid gap-1"><h3 class="text-sm">{group.label} ({group.count})</h3><ul class="grid gap-1">{#each group.items as item}<li><a href={'/content/'+data.site.id+'/'+group.resource+'/'+item.id}>{item.label}</a></li>{/each}{#if group.truncated}<li class="text-muted">and more ({group.count-group.items.length})</li>{/if}</ul></section>{/each}
  </section>
 {:else}
  <details id="smazat" bind:open={deleteOpen} class="card-flat border-danger/40">
   <summary class="font-semibold text-danger">{deleteName(data.resource).button}</summary>
   <form method="POST" action="?/delete" use:enhance={pending.submit} class="mt-3 grid gap-3">
<p class="hint">Removal changes public content. Check dependents and links beforehand.</p>
<input name="csrf" type="hidden" value={data.csrf}/>
<input name="etag" type="hidden" value={tag??''}/>
<label class="flex items-start gap-2 text-sm">
<input name="confirm" value="yes" type="checkbox" required/> {deleteName(data.resource).confirm}</label>
<div><SubmitButton variant="danger" busy={pending.is('?/delete')}>{deleteName(data.resource).button}</SubmitButton></div>
</form>
    </details>
 {/if}

 {/if}
</aside>
{/if}
</div>
{/if}
