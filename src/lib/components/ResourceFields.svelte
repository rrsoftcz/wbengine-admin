<script lang="ts">
 import PagePicker from './PagePicker.svelte';
 import {schemas,translationFields,deviceOptions,type Field} from '#lib/content-schema.ts';import type {Resource} from '#lib/server/api-contract.ts';
 import {t,intl} from '#lib/i18n/client.ts';import type {MessageKey} from '#lib/i18n/index.ts';
 let {resource,values,translation=false,boxTypes=[],refs={},siteId,offerArticleBox=false,noArticleBox=false,canAddArticleBox=false,articleBoxPages=null,otherBoxPages=null,fieldError=undefined}: {offerArticleBox?:boolean;canAddArticleBox?:boolean;noArticleBox?:boolean;articleBoxPages?:number[]|null;otherBoxPages?:number[]|null;fieldError?:{field:string;message:string};resource:Resource;values:Record<string,unknown>;translation?:boolean;refs?:Record<string,{value:number;label:string}[]|null>;siteId?:number;boxTypes?:{type:string;settings:Record<string,string[]>;sections:string[]}[]}=$props();
 let selectedType=$derived(String(values.type??''));
 let pickedSite=$state<number|null>(null);
 let articleOn=$state(true);
 const currentSite=$derived(pickedSite??Number(values.site_id??0));
 let flags=$state<Record<string,boolean>>({});
 let lengths=$state<Record<string,number>>({});
 const fields=$derived(schemas[resource].filter(f=>!translation||translationFields[resource]?.includes(f.name)));
 // Empty text is valid in the API. Only the URL/key requires a non-empty value, with its own validation.
 function requiresValue(f:Field){return !translation&&(f.name==='link'||f.name==='key');}
 function value(f:Field){const v=values[f.name];return f.kind==='json'?JSON.stringify(v??{},null,2):f.kind==='ids'?Array.isArray(v)?v.join(', '):String(v??''):String(v??((f.kind==='number'||f.kind==='boolean')?0:''));}
 function isOn(f:Field){return flags[f.name]??Number(values[f.name])===1;}
 const hintKey=(f:Field):MessageKey|null=>{const k='fields.hint.'+resource+'.'+f.name;return hintKeys.has(k)?k as MessageKey:null;};
 const hintKeys=new Set(['articles.site_id','pages.parent_id','menu.site_id','menu.parent','boxes.section_id','articles.author','articles.source','pages.link'].map(x=>'fields.hint.'+x));
 const hintText=(f:Field)=>{const k=hintKey(f);return k?t(k):'';};
 const placeholders:Record<string,string>={'pages.link':'/about-us/'};
 const toggleKeys=new Set(['visible','strict','acl','active','static','shared','device_strict']);
 const toggleHint=(f:Field)=>toggleKeys.has(f.name)?t(('fields.toggle.'+f.name) as MessageKey):'';
 function options(f:Field){const list=refs[f.name];if(!Array.isArray(list))return null;const current=Number(values[f.name]);return current>0&&!list.some(o=>o.value===current)?[...list,{value:current,label:t('fields.recordNotFound',{id:current})}]:list;}
 const zeroKeys=new Set(['articles.site_id','pages.parent_id','menu.site_id','menu.parent','boxes.section_id']);
 function zeroLabel(f:Field){const k=resource+'.'+f.name;return zeroKeys.has(k)?t(('fields.zero.'+k) as MessageKey):t('fields.notSelected');}
 const nf=$derived(new Intl.NumberFormat(intl()));
 function count(f:Field){return lengths[f.name]??value(f).length;}
 function wide(f:Field){return f.kind==='textarea'||f.kind==='json'||f.kind==='format'||(f.kind===undefined&&(f.max??0)>=100);}

 $effect(()=>{if(!fieldError)return;const el=document.querySelector<HTMLElement>('[name="'+fieldError.field+'"]');if(el){el.setAttribute('aria-invalid','true');el.scrollIntoView({block:'center',behavior:'smooth'});el.focus({preventScroll:true})}});
</script>
<div class="grid gap-5 sm:grid-cols-2">
{#each fields as spec}
 {#if resource==='boxes'&&spec.name==='type'}<label class="field sm:col-span-2"><span>{t(spec.label)}</span><select name="type" bind:value={selectedType} required><option value="">{t('fields.type.placeholder')}</option>{#each boxTypes as type}<option value={type.type}>{t('fields.type.option',{type:type.type,sections:type.sections.join(', ')})}</option>{/each}</select>
</label>
 {:else if resource==='boxes'&&spec.name==='settings'}{#each Object.entries(boxTypes.find(x=>x.type===selectedType)?.settings??{}) as [name,options]}<label class="field"><span>{name}</span><select name={'setting_'+name}>
<option value="">{t('fields.settings.default')}</option>{#each options as option}<option value={option} selected={(values.settings as Record<string,unknown>|undefined)?.[name]===option}>{option}</option>{/each}</select>
</label>{/each}
 {:else if spec.kind==='textarea'}<label class="field sm:col-span-2"><span>{t(spec.label)}</span><textarea autocomplete="off" class="resize-y font-mono text-[.9rem] leading-relaxed {spec.name==='bodytext'?'min-h-96':'min-h-36'}" name={spec.name} rows={spec.name==='bodytext'?16:5} maxlength={spec.max} spellcheck="true" oninput={(e)=>{lengths[spec.name]=e.currentTarget.value.length;}}>{value(spec)}</textarea>
<span class="hint flex justify-between gap-3"><span>{t('fields.markdownHint')}</span><span aria-live="polite">{spec.max?t('fields.charactersOf',{count:nf.format(count(spec)),max:nf.format(spec.max)}):t('fields.characters',{count:nf.format(count(spec))})}</span></span>
</label>
 {:else if spec.kind==='boolean'}<div class="toggle-row flex items-center justify-between gap-4 rounded-xl border border-line bg-surface-2 px-4 py-3"><label class="flex w-full cursor-pointer items-center justify-between gap-4"><span class="grid gap-0.5"><span class="font-semibold">{t(spec.label)}</span><span class="hint">{toggleHint(spec)}</span></span><span class="flex shrink-0 items-center gap-3"><span class="w-16 text-right text-sm font-semibold {isOn(spec)?'text-ok':'text-muted'}" aria-hidden="true">{isOn(spec)?t('fields.on'):t('fields.off')}</span><input type="checkbox" role="switch" class="peer sr-only" name={spec.name} value="1" checked={isOn(spec)} onchange={(e)=>{flags[spec.name]=e.currentTarget.checked;}}/><span class="relative h-6 w-11 rounded-full border border-line-strong bg-line-strong transition-colors peer-checked:border-brand peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-surface after:shadow after:transition-transform after:content-[''] peer-checked:after:translate-x-5" aria-hidden="true"></span></span></label></div>
 {:else if resource==='boxes'&&spec.name==='sites'&&Array.isArray(refs.sites)}<PagePicker name="sites" label={t(spec.label)} options={refs.sites} selected={Array.isArray(values.sites)?values.sites.map(Number).filter(n=>n>0):[]} shared={isOn({name:'shared',label:'fields.pages.visible',kind:'boolean'})}/>
 {:else if refs[spec.name]!==undefined}{@const list=options(spec)}{#if list&&list.length===0}<div class="field sm:col-span-2"><span>{t(spec.label)}</span><input type="hidden" name={spec.name} value={String(values[spec.name]??0)}/><p class="alert alert-warn" role="status">{t('fields.noPage')} {#if siteId}<a href={'/content/'+siteId+'/pages/new'}>{t('fields.createFirstPage')}</a>{:else}{t('fields.createPageFirst')}{/if} {t('fields.comeBack')}</p></div>
 {:else if list}<label class="field"><span>{t(spec.label)}</span><select name={spec.name} onchange={resource==='articles'&&spec.name==='site_id'?(e)=>{pickedSite=Number(e.currentTarget.value);}:undefined}><option value="0" selected={Number(values[spec.name]??0)===0}>{zeroLabel(spec)}</option>{#each list as option}<option value={option.value} selected={Number(values[spec.name])===option.value}>{option.label}</option>{/each}</select><span class="hint">{hintText(spec)}</span>{#if resource==='articles'&&spec.name==='site_id'&&Array.isArray(articleBoxPages)&&currentSite>0&&!articleBoxPages.includes(currentSite)}{@const customBoxes=Array.isArray(otherBoxPages)&&otherBoxPages.includes(currentSite)}<span class="hint rounded-lg border border-line bg-surface-2 px-3 py-2" role="status">{#if customBoxes}{t('fields.articleBox.custom')}{:else}{t('fields.articleBox.none')}{/if} {#if canAddArticleBox}<label class="mt-1 flex items-center gap-2 font-semibold text-text"><input type="checkbox" name="add_article_box" value="1" checked={!customBoxes}/> {t('fields.articleBox.addOnSave')}</label>{:else if siteId}<a href={'/content/'+siteId+'/boxes/new'}>{t('fields.articleBox.addBox')}</a>{/if}</span>{/if}</label>
 {:else}<label class="field"><span>{t('fields.numericId',{label:t(spec.label)})}</span><input type="number" min="0" step="1" name={spec.name} value={value(spec)}/><span class="hint">{hintText(spec)} {t('fields.listUnavailable')}</span></label>{/if}
 {:else if spec.kind==='device'}<label class="field"><span>{t(spec.label)}</span><select name={spec.name}>{#each deviceOptions as option}<option value={option.value} selected={Number(values[spec.name]??0)===option.value}>{t(option.label)}</option>{/each}</select><span class="hint">{t('fields.device.hint')}</span></label>
 {:else if spec.kind==='format'}<label class="field sm:col-span-2"><span>{t(spec.label)}</span><select name={spec.name}>
<option value="markdown" selected={values.content_format!=='legacy_html'}>Markdown</option>{#if values.content_format==='legacy_html'}<option value="legacy_html" selected>{t('fields.format.legacy')}</option>{/if}</select>
<span class="hint">{t('fields.format.hint')}</span>
</label>
 {:else if spec.kind==='json'}<label class="field sm:col-span-2"><span>{t(spec.label)}</span><input class="font-mono text-[.9rem]" type="text" name={spec.name} value={value(spec)} maxlength={spec.max}/></label>
 {:else}<label class="field {wide(spec)?'sm:col-span-2':''}"><span>{t(spec.label)}</span><input type={spec.kind==='number'?'number':'text'} min={spec.kind==='number'?0:undefined} step={spec.kind==='number'?1:undefined} name={spec.name} value={value(spec)} maxlength={spec.max} required={requiresValue(spec)} placeholder={placeholders[resource+'.'+spec.name]} autocomplete="off" aria-invalid={fieldError?.field===spec.name?'true':undefined}/>
{#if hintKey(spec)}<span class="hint">{hintText(spec)}</span>{/if}
</label>{/if}
{/each}
{#if offerArticleBox}<div class="toggle-row flex items-center justify-between gap-4 rounded-xl border border-line bg-surface-2 px-4 py-3 sm:col-span-2"><label class="flex w-full cursor-pointer items-center justify-between gap-4"><span class="grid gap-0.5"><span class="font-semibold">{t('fields.articleBox.offerTitle')}</span><span class="hint">{t('fields.articleBox.offerHint')}</span></span><span class="flex shrink-0 items-center gap-3"><span class="w-16 text-right text-sm font-semibold {articleOn?'text-ok':'text-muted'}" aria-hidden="true">{articleOn?t('fields.on'):t('fields.off')}</span><input type="checkbox" role="switch" class="peer sr-only" name="show_article" value="1" checked={articleOn} onchange={(e)=>{articleOn=e.currentTarget.checked;}}/><span class="relative h-6 w-11 rounded-full border border-line-strong bg-line-strong transition-colors peer-checked:border-brand peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-surface after:shadow after:transition-transform after:content-[''] peer-checked:after:translate-x-5" aria-hidden="true"></span></span></label></div>
{:else if noArticleBox}<p class="alert alert-info sm:col-span-2" role="status">{t('fields.articleBox.unsupported')}</p>{/if}
</div>
