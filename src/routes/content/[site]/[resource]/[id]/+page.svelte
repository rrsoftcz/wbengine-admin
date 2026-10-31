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
 import {t,intl} from '#lib/i18n/client.ts';
 import type {MessageKey} from '#lib/i18n/index.ts';
 let {data,form}=$props();
 const base=$derived('/content/'+data.site.id+'/'+data.resource),here=$derived(base+'/'+data.id);
 let previewVisible=$state(false),dirty=$state(false),publishOpen=$state(false),deleteOpen=$state(false),visibilityOpen=$state(false);
 const pending=createPending({onResult:(r)=>{if(r.type==='redirect')dirty=false;}});
 const editingTranslation=$derived(form?.action?.startsWith('translation')??false);
 const values=$derived(form?.values&&form?.action==='save'&&Object.keys(form.values).length?form.values:data.values);
 const tag=$derived(form?.action==='save'&&form?.etag?form.etag:data.etag);
 const translationValues=$derived(form?.translationValues&&editingTranslation?form.translationValues:data.translation??{});
 const translationTag=$derived(form?.translationEtag&&editingTranslation?form.translationEtag:data.translationEtag);
 // A write rejected because the site is unavailable does not reload the page via use:enhance, so this is also derived from the response status.
 const offline=$derived(pending.status>=500||pending.status===401);
 const resourceLabel=$derived(t(labels[data.resource as keyof typeof labels]));
 const dn=$derived(deleteName(data.resource,t));
 const title=$derived(data.id==='new'?t('content.status.new'):String(data.values.title??data.values.name??data.id));
 const badge=$derived(data.deleted?'deleted':data.id==='new'?'new':data.resource==='articles'?(data.row.hidden===true?'hidden':data.row.draft?'draft':'published'):null);
 const localeQuery=$derived(data.locale?'?locale='+encodeURIComponent(data.locale):'');
 const articles=$derived(data.resource==='articles');
 const translating=$derived(data.id!=='new'&&!data.deleted&&!data.unavailable&&!!translationFields[data.resource]&&!!data.permissions.translationGet&&!!data.locale);
 const missing=$derived((data.versions??[]).filter((v)=>v.exists===false).map((v)=>v.locale));
 const canEdit=$derived(!data.deleted&&!data.unavailable&&data.resource!=='images'&&(translating?data.permissions.translationSave:data.permissions.save));
 beforeNavigate((n)=>{
  if(!dirty)return;
  if(n.type==='leave'){n.cancel();return;}
  if(!confirm(t('content.detail.leaveConfirm')))n.cancel();
 });
 const knownLanguages=new Set(['cs','en','sk','de','pl','fr','es','it','pt','ru','uk','nl','hu']);
 function localeName(l:string){const base=l.split('_')[0];return knownLanguages.has(base)?t(('content.lang.'+base) as MessageKey)+' ('+l+')':l;}
 const cannotRemoveKey=(r:string):MessageKey=>('content.dependents.cannotRemove.'+(Object.hasOwn(labels,r)?r:'record')) as MessageKey;
 function open(kind:'publish'|'delete'){if(kind==='publish')publishOpen=true;else deleteOpen=true;}
</script>

<Breadcrumbs items={[{label:t('content.breadcrumb.sites'),href:'/'},{label:data.site.name,href:'/content/'+data.site.id},{label:resourceLabel,href:base},{label:title}]}/>
<PageHeader {title} description={data.site.name}>
 {#snippet badges()}{#if badge}<StatusBadge state={badge}/>{:else if data.permissions.save===false&&data.id!=='new'&&!data.unavailable}<StatusBadge state="readonly"/>{/if}{/snippet}
</PageHeader>

<div id="result" tabindex="-1" class="outline-none">
 {#if data.boxWarning}<section class="mb-6 rounded-2xl border-2 border-warn bg-warn-soft p-5 text-text" role="alert" aria-labelledby="box-varovani"><h2 id="box-varovani" class="text-warn">{t('content.detail.boxWarning.title')}</h2><p class="mt-1">{t('content.detail.boxWarning.text')}</p><p class="mt-3"><a class="btn btn-secondary btn-sm" href={'/content/'+data.site.id+'/boxes/new'}>{t('content.detail.boxWarning.action')}</a></p></section>{/if}
 {#if form?.error&&!form?.conflict}<p class="alert alert-error mb-4" role="alert">{form.error}</p>{/if}
 {#if form?.message}<p class="alert alert-ok mb-4" role="status">{form.message}</p>{/if}
 {#if form?.conflict}<section class="mb-6 rounded-2xl border-2 border-warn bg-warn-soft p-5 text-text" role="alert" aria-labelledby="conflict">
  <h2 id="conflict" class="text-warn">{t('content.detail.conflict.title')}</h2>
  <p class="mt-1">{t('content.detail.conflict.text')}</p>
  <details class="mt-3" open>
   <summary class="font-semibold">{t('content.detail.conflict.current')}</summary>
   <pre class="mt-2 whitespace-pre-wrap break-words">{JSON.stringify(editingTranslation?data.translation:data.values,null,2)}</pre>
  </details>
  <p class="mt-3"><a data-sveltekit-reload href={here+localeQuery}>{t('content.detail.conflict.discard')}</a></p>
 </section>{/if}
</div>

{#if data.unavailable||offline}
 <section class="alert alert-warn mb-6 flex-col" role="alert"><h2 class="text-warn">{t('content.detail.offline.title')}</h2><p>{t('content.detail.offline.text')}</p>
  {#if !data.unavailable}<p>{t('content.detail.offline.retry')}</p>{/if}</section>
{/if}
{#if data.unavailable}
 {#if data.offlineEditable}<form method="POST" action={'?/'+data.offlineAction} class="card grid gap-4"><input type="hidden" name="csrf" value={data.csrf}/>{#each Object.entries(data.offlineFields) as [name,value]}{#if ['etag','locale'].includes(name)}<input type="hidden" {name} {value}/>{:else if !['confirm','mergeConsent','change_id'].includes(name)}<label class="field"><span>{name}</span>{#if ['introtext','bodytext'].includes(name)}<textarea class="font-mono text-[.9rem]" {name} rows={name==='bodytext'?16:5}>{value}</textarea>{:else}<input type="text" {name} {value}/>{/if}</label>{/if}{/each}<div class="flex flex-wrap gap-3"><button class="btn btn-primary">{t('content.detail.offline.submit')}</button><a class="btn btn-secondary" data-sveltekit-reload href={here+localeQuery}>{t('content.detail.offline.reload')}</a></div></form>{:else}<pre class="whitespace-pre-wrap break-words">{JSON.stringify(data.offlineFields,null,2)}</pre>{/if}
{:else}

{#if canEdit||(data.id!=='new'&&!data.deleted&&(data.permissions.publish||data.permissions.delete||data.permissions.preview))}
 <div class="sticky top-[3.4rem] z-10 mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface/95 px-4 py-3 shadow-card backdrop-blur md:top-0" role="toolbar" aria-label={t('content.toolbar.label')}>
  <p class="text-sm" role="status" aria-live="polite">{#if dirty}<span class="badge badge-warn">{t('content.toolbar.dirty')}</span>{:else}<span class="text-muted">{t('content.toolbar.clean')}</span>{/if}</p>
  <div class="flex flex-wrap items-center gap-2">
   {#if articles&&data.id!=='new'&&data.permissions.preview}<a class="btn btn-secondary btn-sm" href={here+'/preview'+localeQuery} target="_blank" rel="noopener noreferrer" onclick={(e)=>{e.preventDefault();previewVisible=!previewVisible;}}>{previewVisible?t('content.toolbar.hidePreview'):t('content.toolbar.preview')}</a>{/if}
   {#if articles&&data.row.draft&&data.permissions.publish}<a class="btn btn-secondary btn-sm" href="#publikace" onclick={()=>open('publish')}>{t('content.toolbar.publish')}</a>{/if}
   {#if articles&&data.id!=='new'&&typeof data.row.hidden==='boolean'&&(data.row.hidden?data.permissions.unhide:data.permissions.hide)}<a class="btn btn-secondary btn-sm" href="#visibility" onclick={()=>{visibilityOpen=true;}}>{data.row.hidden?t('content.toolbar.unhide'):t('content.toolbar.hide')}</a>{/if}
   {#if data.id!=='new'&&data.permissions.delete}<a class="btn btn-ghost btn-sm text-danger" href={data.dependents?.length?'#dependents':'#delete'} onclick={()=>{if(!data.dependents?.length)open('delete');}}>{data.dependents?.length?t('content.toolbar.blocked',{button:dn.button}):dn.button}</a>{/if}
   {#if canEdit}<SubmitButton form="save-form" busy={pending.is(translating?'?/translationSave':'?/save')} small>{translating?t('content.toolbar.saveTranslation'):articles?t('content.toolbar.saveDraft'):t('content.toolbar.saveChanges')}</SubmitButton>{/if}
  </div>
 </div>
{/if}

<div class={['grid items-start gap-6',data.id!=='new'&&!data.deleted&&'xl:grid-cols-[minmax(0,1fr)_17rem]']}>
<div class="grid min-w-0 gap-6">
{#if data.deleted}<p class="alert alert-error" role="status">{t('content.detail.removed')}</p>
{:else if data.resource==='images'}
 <section class="card grid gap-3">
  {#if data.image}<div class="grid place-items-center rounded-xl bg-surface-2 p-4"><img src={data.image} alt={t('content.image.alt')} class="max-h-[28rem] max-w-full rounded-lg" style="max-width:100%;max-height:450px"/></div>{/if}
  <p class="alert alert-warn">{t('content.image.public')}</p>
  <p>{t('content.image.publicImage')} <code>{String(data.row.url)}</code></p>
  <p class="text-muted">{t('content.image.meta',{mime:String(data.row.mime),size:String(data.row.size)})}</p>
  <p>{t('content.image.markdown')} <code>![{t('content.image.markdownAlt')}]({String(data.row.url)})</code></p>
 </section>
{:else}
{#if data.id!=='new'&&!data.deleted&&translationFields[data.resource]&&data.permissions.translationGet}
 {#if data.versions}
 {@const orig=data.versions.filter((v)=>v.original)}{@const done=data.versions.filter((v)=>!v.original&&v.exists===true)}{@const todo=data.versions.filter((v)=>!v.original&&v.exists!==true)}
 <section class="flex flex-wrap items-end gap-x-6 gap-y-2" aria-label={t('content.lang.label')}>
  <form method="GET" class="flex flex-wrap items-end gap-3"><label class="field w-64"><span>{t('content.lang.content')}</span><select name="locale" onchange={(e)=>e.currentTarget.form?.requestSubmit()}>
   {#each orig as v}<option value="" selected={!data.locale}>{t('content.lang.original',{language:localeName(v.locale)})}</option>{/each}
   {#if done.length}<optgroup label={t('content.lang.translatedGroup',{count:done.length})}>{#each done as v}<option value={v.locale} selected={v.locale===data.locale}>{localeName(v.locale)}</option>{/each}</optgroup>{/if}
   {#if todo.length}<optgroup label={data.versions.some((v)=>v.exists===null)?t('content.lang.translations'):t('content.lang.missingGroup',{count:todo.length})}>{#each todo as v}<option value={v.locale} selected={v.locale===data.locale}>{v.exists===false?t('content.lang.missingSoFar',{language:localeName(v.locale)}):localeName(v.locale)}</option>{/each}</optgroup>{/if}
  </select></label><noscript><button class="btn btn-secondary btn-sm">{t('content.lang.load')}</button></noscript></form>
  {#if data.versions.every((v)=>v.exists!==null)}<p class="pb-2 text-sm"><strong>{t('content.lang.summary',{done:data.versions.filter((v)=>v.exists).length,total:data.versions.length})}</strong>{#if missing.length}<span class="text-muted">{t('content.lang.missingList',{list:missing.slice(0,6).join(', ')+(missing.length>6?t('content.lang.more',{count:missing.length-6}):'')})}</span>{/if}</p>{/if}
 </section>
 {:else}
 <form method="GET" class="flex flex-wrap items-end gap-3"><label class="field w-56"><span>{t('content.lang.manual')}</span><input name="locale" value={data.locale} pattern={'[a-z]{2,3}(_[A-Z]{2})?'}/></label><button class="btn btn-secondary btn-sm">{t('content.lang.load')}</button>{#if data.locale}<a class="btn btn-ghost btn-sm" href={here}>{t('content.lang.back')}</a>{/if}</form>
 {/if}
{/if}
{#if !translating}
 {#if articles}<p class="alert alert-info">{data.row.draft?t('content.detail.draftNotice'):t('content.detail.draftCreates')}</p>{/if}
 {#if data.permissions.save}<form id="save-form" method="POST" action="?/save" use:enhance={pending.submit} oninput={()=>{dirty=true;}} class="card grid gap-5">
<input type="hidden" name="csrf" value={data.csrf}/>
<input type="hidden" name="etag" value={tag??''}/>{#key JSON.stringify(values)}<ResourceFields resource={data.resource} {values} boxTypes={data.boxTypes} refs={data.refs} siteId={data.site.id} offerArticleBox={data.offerArticleBox} canAddArticleBox={data.canAddArticleBox} articleBoxPages={data.articleBoxPages} otherBoxPages={data.otherBoxPages} noArticleBox={data.resource==='pages'&&data.id==='new'&&!data.offerArticleBox} fieldError={form?.field&&!editingTranslation?{field:form.field,message:form.error}:undefined}/>{/key}{#if form?.conflict&&!editingTranslation}<div class="grid gap-3 rounded-xl border border-warn bg-warn-soft p-4"><label class="flex items-start gap-2 text-sm">
<input name="mergeConsent" type="checkbox" value="yes"/> {t('content.detail.mergeConsent')}</label>
<div><SubmitButton formaction="?/merge" variant="secondary" busy={pending.is('?/merge')}>{t('content.detail.mergeSubmit')}</SubmitButton></div></div>{/if}
<div class="flex flex-wrap items-center gap-3"><SubmitButton busy={pending.is('?/save')}>{articles?t('content.toolbar.saveDraft'):t('content.toolbar.saveChanges')}</SubmitButton><span class="hint">{articles?t('content.detail.savedAsDraft'):t('content.detail.savedLive')}</span></div></form>
 {:else}<section class="card"><p class="alert alert-info mb-3">{t('content.detail.readOnlyNotice')}</p>
<pre class="whitespace-pre-wrap break-words">{JSON.stringify(data.values,null,2)}</pre></section>{/if}
{:else}
  <section class="card grid gap-4" aria-labelledby="translation">
   <h2 id="translation">{t('content.translation.title',{locale:data.locale})}</h2>
   <p class="hint">{t('content.translation.hint',{locale:data.locale})}</p>
   {#if data.permissions.translationSave}<form id="save-form" method="POST" action="?/translationSave" use:enhance={pending.submit} oninput={()=>{dirty=true;}} class="grid gap-5">
<input name="csrf" type="hidden" value={data.csrf}/>
<input name="locale" type="hidden" value={data.locale}/>
<input name="etag" type="hidden" value={translationTag??''}/>{#key JSON.stringify(translationValues)}<ResourceFields resource={data.resource} values={translationValues} translation fieldError={form?.field&&editingTranslation?{field:form.field,message:form.error}:undefined}/>{/key}{#if form?.conflict&&editingTranslation}<div class="grid gap-3 rounded-xl border border-warn bg-warn-soft p-4"><label class="flex items-start gap-2 text-sm">
<input name="mergeConsent" type="checkbox" value="yes"/> {t('content.translation.mergeConsent')}</label>
<div><SubmitButton formaction="?/merge" variant="secondary" busy={pending.is('?/merge')}>{t('content.translation.mergeSubmit')}</SubmitButton></div></div>{/if}<div><SubmitButton busy={pending.is('?/translationSave')}>{t('content.translation.save')}</SubmitButton></div></form>{/if}
   {#if data.permissions.translationDelete}<details class="rounded-xl border border-line p-3"><summary class="text-sm font-semibold text-danger">{t('content.translation.remove',{locale:data.locale})}</summary>
<form method="POST" action="?/translationDelete" use:enhance={pending.submit} class="mt-3 grid gap-3">
<p class="hint">{t('content.translation.removeHint',{locale:data.locale})}</p>
<input name="csrf" type="hidden" value={data.csrf}/>
<input name="locale" type="hidden" value={data.locale}/>
<input name="etag" type="hidden" value={translationTag??''}/>
<div><SubmitButton variant="danger" small busy={pending.is('?/translationDelete')}>{t('content.translation.remove',{locale:data.locale})}</SubmitButton></div>
</form></details>{/if}
  </section>
{/if}
{/if}

{#if data.id!=='new'&&!data.deleted}
 {#if articles&&data.permissions.preview&&previewVisible}<section class="card grid gap-3" aria-labelledby="nahled"><h2 id="nahled">{t('content.preview.title')}</h2><p class="hint">{t('content.preview.hint')}</p>
<iframe title={t('content.preview.frame')} sandbox="" referrerpolicy="no-referrer" src={here+'/preview'+localeQuery} class="block h-[40rem] w-full rounded-xl border border-line bg-white">
</iframe></section>{/if}


{/if}

{#if data.id!=='new'&&data.resource!=='images'}
{#if data.historyOpen}
  <section class="card" aria-labelledby="history">
   <h2 id="history">{articles?t('content.history.titleArticle'):t('content.history.titleStructure')}</h2>
   <p class="hint mb-4">{articles?t('content.history.hintArticle'):t('content.history.hintStructure')}</p>
   {#if data.history.length}<ol class="relative ml-2 grid gap-5 border-l border-line-strong pl-6">{#each data.history as change}<li class="relative">
<span class="absolute -left-[1.95rem] top-1.5 size-3 rounded-full border-2 border-brand bg-surface" aria-hidden="true"></span>
<h3 class="flex flex-wrap items-center gap-2">{t(articles?'content.history.revisionEntry':'content.history.changeEntry',{id:String(change.revision_id??change.change_id)})} <span class="badge badge-brand">{changeLabel(change.action,t)}</span></h3>
<p class="hint">{changeTime(change.created_at,intl())}, {changeActor(change,data.actors,t)}</p>
<details class="mt-2">
<summary class="text-sm">{t('content.history.showState')}</summary>
<pre class="mt-2 whitespace-pre-wrap break-words">{JSON.stringify(change.payload??change,null,2)}</pre>
</details>{#if data.permissions[articles?'restore':'structureRestore']}<details class="mt-2"><summary class="text-sm font-semibold">{t('content.history.restoreState')}</summary><form method="POST" action="?/restore" use:enhance={pending.submit} class="mt-2 grid gap-3 rounded-xl bg-surface-2 p-3">
<input name="csrf" type="hidden" value={data.csrf}/>
<input name="change_id" type="hidden" value={String(change.revision_id??change.change_id)}/>
<input name="etag" type="hidden" value={(articles?tag:data.historyEtag)??''}/>
<label class="flex items-start gap-2 text-sm">
<input name="confirm" value="yes" type="checkbox" required/> {t('content.history.restoreConfirm')}</label>
<div><SubmitButton variant="secondary" small busy={pending.is('?/restore')}>{articles?t('content.history.restoreToDraft'):t('content.history.restoreStructure')}</SubmitButton></div>
</form></details>{/if}</li>{/each}</ol>{:else}<p class="text-muted">{t('content.history.empty')}</p>{/if}
   {#if data.pagination}<Pager page={data.pagination.page} totalPages={data.pagination.total_pages} href={(p)=>here+'?historyPage='+p} previous={t('content.history.newer')} next={t('content.history.older')}/>{/if}
  </section>
  {#if !data.deleted}<p class="mt-3"><a class="btn btn-ghost btn-sm" href={here+(data.locale?'?locale='+encodeURIComponent(data.locale):'')} data-sveltekit-noscroll>{t('content.history.hide')}</a></p>{/if}
{/if}
{/if}
</div>

{#if data.id!=='new'&&!data.deleted}
<aside class="grid gap-4 xl:sticky xl:top-20" aria-label={t('content.aside.label')}>
 <section class="card-flat grid gap-2 text-sm">
  <h2 class="text-base">{t('content.aside.status')}</h2>
  <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
   <dt class="text-muted">{t('content.aside.id')}</dt><dd>{data.id}</dd>
   <dt class="text-muted">{t('content.aside.type')}</dt><dd>{resourceLabel}</dd>
   {#if articles}<dt class="text-muted">{t('content.aside.status')}</dt><dd>{data.row.hidden===true?t('content.status.hidden'):data.row.draft?t('content.status.draft'):t('content.status.published')}</dd>{/if}
  </dl>
  {#if articles}<details class="mt-1"><summary class="font-semibold">{t('content.aside.publishedContent')}</summary>
<pre class="mt-2 whitespace-pre-wrap break-words">{JSON.stringify({title:data.row.title,introtext:data.row.introtext,bodytext:data.row.bodytext},null,2)}</pre>
</details>{/if}
 </section>

 {#if data.liveLinks.length}
  <section class="card-flat grid gap-2 text-sm" aria-labelledby="ziva-adresa">
   <h2 id="ziva-adresa" class="text-base">{t('content.aside.liveUrl',{count:data.liveLinks.length})}</h2>
   <ul class="grid gap-2">{#each data.liveLinks as link}<li class="grid gap-0.5"><a href={link.url} target="_blank" rel="noopener noreferrer" class="break-all font-semibold">{link.url}</a><span class="text-xs text-muted">{link.label}</span>{#if link.note}<span class="text-xs text-muted">{link.note}</span>{/if}</li>{/each}</ul>
  </section>
 {/if}

 {#if data.history.length}
  <section class="card-flat grid gap-2 text-sm" aria-labelledby="posledni-zmeny">
   <h2 id="posledni-zmeny" class="text-base">{t('content.aside.latest')}</h2>
   <ol class="divide-y divide-line overflow-hidden rounded-xl border border-line">{#each data.history.slice(0,5) as change}<li class="grid gap-0.5 bg-surface px-3 py-2"><span class="flex items-center justify-between gap-2"><span class="font-semibold">{changeLabel(change.action,t)}</span><span class="text-xs text-muted">{t(articles?'content.aside.revisionRef':'content.aside.changeRef',{id:String(change.revision_id??change.change_id)})}</span></span><span>{changeTime(change.created_at,intl())}</span><span class="break-all text-xs text-muted">{changeActor(change,data.actors,t)}</span></li>{/each}</ol>
   <a href={here+'?'+(data.locale?'locale='+encodeURIComponent(data.locale)+'&':'')+'history=1#history'} data-sveltekit-noscroll>{t('content.aside.allChanges')}</a>
  </section>
 {/if}

 {#if articles&&data.row.draft&&data.permissions.publish}
  <details id="publikace" bind:open={publishOpen} class="card-flat">
   <summary class="font-semibold">{t('content.aside.publishTitle')}</summary>
   <form method="POST" action="?/publish" use:enhance={pending.submit} class="mt-3 grid gap-3">
<p class="hint">{t('content.aside.publishHint')}{#if dirty}{t('content.aside.publishDirty')}{/if}</p>
<input type="hidden" name="csrf" value={data.csrf}/>
<input type="hidden" name="etag" value={tag??''}/>
<label class="flex items-start gap-2 text-sm">
<input name="confirm" value="yes" type="checkbox" required/> {t('content.aside.publishConfirm')}</label>
<div><SubmitButton busy={pending.is('?/publish')}>{t('content.aside.publish')}</SubmitButton></div>
</form>
  </details>
 {/if}

 {#if articles&&data.id!=='new'&&typeof data.row.hidden==='boolean'&&(data.row.hidden?data.permissions.unhide:data.permissions.hide)}
  <details id="visibility" bind:open={visibilityOpen} class="card-flat">
   <summary class="font-semibold">{data.row.hidden?t('content.aside.unhideTitle'):t('content.aside.hideTitle')}</summary>
   <form method="POST" action={data.row.hidden?'?/unhide':'?/hide'} use:enhance={pending.submit} class="mt-3 grid gap-3">
    <p class="hint">{data.row.hidden?t('content.aside.unhideHint'):t('content.aside.hideHint')}</p>
    <input type="hidden" name="csrf" value={data.csrf}/>
    <input type="hidden" name="etag" value={tag??''}/>
    <label class="flex items-start gap-2 text-sm"><input name="confirm" value="yes" type="checkbox" required/> {data.row.hidden?t('content.aside.unhideConfirm'):t('content.aside.hideConfirm')}</label>
    <div><SubmitButton busy={pending.is(data.row.hidden?'?/unhide':'?/hide')}>{data.row.hidden?t('content.aside.unhide'):t('content.aside.hide')}</SubmitButton></div>
   </form>
  </details>
 {/if}

 {#if data.permissions.delete}
 {#if data.dependents&&data.dependents.length}
  <section id="dependents" class="card-flat grid gap-3 border-warn text-sm" aria-labelledby="dependents-heading">
   <h2 id="dependents-heading" class="text-base text-warn">{t(cannotRemoveKey(data.resource))}</h2>
   <p>{t('content.dependents.text')}</p>
   {#each data.dependents??[] as group}<section class="grid gap-1"><h3 class="text-sm">{group.label} ({group.count})</h3><ul class="grid gap-1">{#each group.items as item}<li><a href={'/content/'+data.site.id+'/'+group.resource+'/'+item.id}>{item.label}</a></li>{/each}{#if group.truncated}<li class="text-muted">{t('content.dependents.andMore',{count:group.count-group.items.length})}</li>{/if}</ul></section>{/each}
  </section>
 {:else}
  <details id="delete" bind:open={deleteOpen} class="card-flat border-danger/40">
   <summary class="font-semibold text-danger">{dn.button}</summary>
   <form method="POST" action="?/delete" use:enhance={pending.submit} class="mt-3 grid gap-3">
<p class="hint">{t('content.delete.hint')}</p>
<input name="csrf" type="hidden" value={data.csrf}/>
<input name="etag" type="hidden" value={tag??''}/>
<label class="flex items-start gap-2 text-sm">
<input name="confirm" value="yes" type="checkbox" required/> {dn.confirm}</label>
<div><SubmitButton variant="danger" busy={pending.is('?/delete')}>{dn.button}</SubmitButton></div>
</form>
    </details>
 {/if}

 {/if}
</aside>
{/if}
</div>
{/if}
