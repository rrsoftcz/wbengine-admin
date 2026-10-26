import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {compile} from 'svelte/compiler';
import {render} from 'svelte/server';
import {defaults,translationFields} from '../src/lib/content-schema.ts';
import {parseFields} from '../src/lib/server/content.ts';
import type {Resource} from '../src/lib/server/api-contract.ts';
await mkdir('.svelte-kit',{recursive:true});
const directory=await mkdtemp(join(process.cwd(),'.svelte-kit','tmp-resource-fields-'));
after(()=>rm(directory,{recursive:true,force:true}));
const source=await readFile(new URL('../src/lib/components/ResourceFields.svelte',import.meta.url),'utf8');
const compiled=compile(source,{generate:'server',filename:'ResourceFields.svelte'});
const modulePath=join(directory,'ResourceFields.mjs');await writeFile(modulePath,compiled.js.code);
const {default:Component}=await import(pathToFileURL(modulePath).href);
function controls(resource:Resource,values:Record<string,unknown>,translation=false){const html=render(Component,{props:{resource,values,translation}}).body;return [...html.matchAll(/<(?:input|textarea|select)\b[^>]*>/g)].map(m=>m[0]);}
function byName(nodes:string[],name:string){const node=nodes.find(s=>s.includes(`name="${name}"`));assert.ok(node,`Control ${name} must be rendered`);return node;}
const isRequired=(node:string)=>/\srequired(?:\s|=|\/?>)/.test(node);
test('rendered article form permits empty title/intro/body while including all create keys',()=>{const nodes=controls('articles',defaults('articles'));for(const name of ['title','introtext','bodytext'])assert.equal(isRequired(byName(nodes,name)),false,`${name} must not be rejected by native required validation`);const f=new FormData();f.set('title','');f.set('introtext','');f.set('bodytext','');f.set('content_format','markdown');const payload=parseFields('articles',f);assert.deepEqual(payload,{title:'',introtext:'',bodytext:'',content_format:'markdown'});});
test('rendered legacy metadata edit permits an existing empty intro',()=>{const nodes=controls('articles',{...defaults('articles'),content_format:'legacy_html',title:'Metadata edit',introtext:'',bodytext:'<p>Existing body</p>'});assert.equal(isRequired(byName(nodes,'introtext')),false);});
test('all rendered article/page/menu translation controls are optional',()=>{for(const resource of ['articles','pages','menu'] as const){const nodes=controls(resource,{},true);for(const name of translationFields[resource]!)assert.equal(isRequired(byName(nodes,name)),false,`${resource}.${name} permits empty/partial translation`);}});
test('semantic nonempty link/key constraints remain separate from required JSON keys',()=>{assert.equal(isRequired(byName(controls('pages',defaults('pages')),'link')),true);assert.equal(isRequired(byName(controls('sections',defaults('sections')),'key')),true);assert.equal(isRequired(byName(controls('pages',defaults('pages')),'title')),false);assert.equal(isRequired(byName(controls('menu',defaults('menu')),'name')),false);});
