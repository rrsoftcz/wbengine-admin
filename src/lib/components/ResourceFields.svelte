<script lang="ts">
 import {schemas,translationFields,type Field} from '#lib/content-schema.ts';import type {Resource} from '#lib/server/api-contract.ts';
 let {resource,values,translation=false,boxTypes=[]}: {resource:Resource;values:Record<string,unknown>;translation?:boolean;boxTypes?:{type:string;settings:Record<string,string[]>;sections:string[]}[]}=$props();
 let selectedType=$derived(String(values.type??''));
 const fields=$derived(schemas[resource].filter(f=>!translation||translationFields[resource]?.includes(f.name)));
 // Prázdný text je v API platný. Neprázdnost vyžaduje jen URL/klíč se samostatnou validací.
 function requiresValue(f:Field){return !translation&&(f.name==='link'||f.name==='key');}
 function value(f:Field){const v=values[f.name];return f.kind==='json'?JSON.stringify(v??{},null,2):f.kind==='ids'?Array.isArray(v)?v.join(', '):String(v??''):String(v??((f.kind==='number'||f.kind==='boolean')?0:''));}
</script>
{#each fields as spec}
 {#if resource==='boxes'&&spec.name==='type'}<label>{spec.label}<select name="type" bind:value={selectedType} required><option value="">Vyberte registrovaný typ</option>{#each boxTypes as type}<option value={type.type}>{type.type} (sekce: {type.sections.join(', ')})</option>{/each}</select>
</label>
 {:else if resource==='boxes'&&spec.name==='settings'}{#each Object.entries(boxTypes.find(x=>x.type===selectedType)?.settings??{}) as [name,options]}<label>{name}<select name={'setting_'+name}>
<option value="">Výchozí hodnota</option>{#each options as option}<option value={option} selected={(values.settings as Record<string,unknown>|undefined)?.[name]===option}>{option}</option>{/each}</select>
</label>{/each}
 {:else if spec.kind==='textarea'}<label>{spec.label}<textarea name={spec.name} rows={spec.name==='bodytext'?16:5} maxlength={spec.max}>{value(spec)}</textarea>
</label>
 {:else if spec.kind==='boolean'}<label>{spec.label}<select name={spec.name}>
<option value="0" selected={Number(values[spec.name])!==1}>Ne</option>
<option value="1" selected={Number(values[spec.name])===1}>Ano</option>
</select>
</label>
 {:else if spec.kind==='format'}<label>{spec.label}<select name={spec.name}>
<option value="markdown" selected={values.content_format!=='legacy_html'}>Markdown</option>{#if values.content_format==='legacy_html'}<option value="legacy_html" selected>Stávající HTML, pouze změna metadat</option>{/if}</select>
</label>
<p>Pro změnu původního HTML výslovně vyberte Markdown a nahraďte úvod i celý text.</p>
 {:else}<label>{spec.label}<input type={spec.kind==='number'?'number':'text'} min={spec.kind==='number'?0:undefined} step={spec.kind==='number'?1:undefined} name={spec.name} value={value(spec)} maxlength={spec.max} required={requiresValue(spec)}/>
</label>{/if}
{/each}
<style>textarea{font:inherit;padding:.7rem;border:1px solid #a8b7c3;border-radius:4px;resize:vertical;min-width:0;width:100%;box-sizing:border-box}</style>
