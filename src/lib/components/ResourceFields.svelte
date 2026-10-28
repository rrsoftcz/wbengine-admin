<script lang="ts">
 import {schemas,translationFields,type Field} from '#lib/content-schema.ts';import type {Resource} from '#lib/server/api-contract.ts';
 let {resource,values,translation=false,boxTypes=[]}: {resource:Resource;values:Record<string,unknown>;translation?:boolean;boxTypes?:{type:string;settings:Record<string,string[]>;sections:string[]}[]}=$props();
 let selectedType=$derived(String(values.type??''));
 let lengths=$state<Record<string,number>>({});
 const fields=$derived(schemas[resource].filter(f=>!translation||translationFields[resource]?.includes(f.name)));
 // Prázdný text je v API platný. Neprázdnost vyžaduje jen URL/klíč se samostatnou validací.
 function requiresValue(f:Field){return !translation&&(f.name==='link'||f.name==='key');}
 function value(f:Field){const v=values[f.name];return f.kind==='json'?JSON.stringify(v??{},null,2):f.kind==='ids'?Array.isArray(v)?v.join(', '):String(v??''):String(v??((f.kind==='number'||f.kind==='boolean')?0:''));}
 const nf=new Intl.NumberFormat('cs-CZ');
 function count(f:Field){return lengths[f.name]??value(f).length;}
 function wide(f:Field){return f.kind==='textarea'||f.kind==='json'||f.kind==='format'||(f.kind===undefined&&(f.max??0)>=100);}
</script>
<div class="grid gap-5 sm:grid-cols-2">
{#each fields as spec}
 {#if resource==='boxes'&&spec.name==='type'}<label class="field sm:col-span-2"><span>{spec.label}</span><select name="type" bind:value={selectedType} required><option value="">Vyberte registrovaný typ</option>{#each boxTypes as type}<option value={type.type}>{type.type} (sekce: {type.sections.join(', ')})</option>{/each}</select>
</label>
 {:else if resource==='boxes'&&spec.name==='settings'}{#each Object.entries(boxTypes.find(x=>x.type===selectedType)?.settings??{}) as [name,options]}<label class="field"><span>{name}</span><select name={'setting_'+name}>
<option value="">Výchozí hodnota</option>{#each options as option}<option value={option} selected={(values.settings as Record<string,unknown>|undefined)?.[name]===option}>{option}</option>{/each}</select>
</label>{/each}
 {:else if spec.kind==='textarea'}<label class="field sm:col-span-2"><span>{spec.label}</span><textarea class="resize-y font-mono text-[.9rem] leading-relaxed {spec.name==='bodytext'?'min-h-96':'min-h-36'}" name={spec.name} rows={spec.name==='bodytext'?16:5} maxlength={spec.max} spellcheck="true" oninput={(e)=>{lengths[spec.name]=e.currentTarget.value.length;}}>{value(spec)}</textarea>
<span class="hint flex justify-between gap-3"><span>Markdown: **tučně**, *kurzíva*, [odkaz](https://), ![obrázek](/cesta)</span><span aria-live="polite">{nf.format(count(spec))}{#if spec.max} / {nf.format(spec.max)}{/if} znaků</span></span>
</label>
 {:else if spec.kind==='boolean'}<label class="field"><span>{spec.label}</span><select name={spec.name}>
<option value="0" selected={Number(values[spec.name])!==1}>Ne</option>
<option value="1" selected={Number(values[spec.name])===1}>Ano</option>
</select>
</label>
 {:else if spec.kind==='format'}<label class="field sm:col-span-2"><span>{spec.label}</span><select name={spec.name}>
<option value="markdown" selected={values.content_format!=='legacy_html'}>Markdown</option>{#if values.content_format==='legacy_html'}<option value="legacy_html" selected>Stávající HTML, pouze změna metadat</option>{/if}</select>
<span class="hint">Pro změnu původního HTML výslovně vyberte Markdown a nahraďte úvod i celý text.</span>
</label>
 {:else if spec.kind==='json'}<label class="field sm:col-span-2"><span>{spec.label}</span><input class="font-mono text-[.9rem]" type="text" name={spec.name} value={value(spec)} maxlength={spec.max}/></label>
 {:else}<label class="field {wide(spec)?'sm:col-span-2':''}"><span>{spec.label}</span><input type={spec.kind==='number'?'number':'text'} min={spec.kind==='number'?0:undefined} step={spec.kind==='number'?1:undefined} name={spec.name} value={value(spec)} maxlength={spec.max} required={requiresValue(spec)}/>
</label>{/if}
{/each}
</div>
