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
const pickerSource=await readFile(new URL('../src/lib/components/PagePicker.svelte',import.meta.url),'utf8');
await writeFile(join(directory,'PagePicker.mjs'),compile(pickerSource,{generate:'server',filename:'PagePicker.svelte'}).js.code);
const modulePath=join(directory,'ResourceFields.mjs');await writeFile(modulePath,compiled.js.code.replace("./PagePicker.svelte","./PagePicker.mjs"));
const {default:Component}=await import(pathToFileURL(modulePath).href);
function controls(resource:Resource,values:Record<string,unknown>,translation=false){const html=render(Component,{props:{resource,values,translation}}).body;return [...html.matchAll(/<(?:input|textarea|select)\b[^>]*>/g)].map(m=>m[0]);}
function byName(nodes:string[],name:string){const node=nodes.find(s=>s.includes(`name="${name}"`));assert.ok(node,`Control ${name} must be rendered`);return node;}
const isRequired=(node:string)=>/\srequired(?:\s|=|\/?>)/.test(node);
test('rendered article form permits empty title/intro/body while including all create keys',()=>{const nodes=controls('articles',defaults('articles'));for(const name of ['title','introtext','bodytext'])assert.equal(isRequired(byName(nodes,name)),false,`${name} must not be rejected by native required validation`);const f=new FormData();f.set('title','');f.set('introtext','');f.set('bodytext','');f.set('content_format','markdown');const payload=parseFields('articles',f);assert.deepEqual(payload,{title:'',introtext:'',bodytext:'',content_format:'markdown'});});
test('rendered legacy metadata edit permits an existing empty intro',()=>{const nodes=controls('articles',{...defaults('articles'),content_format:'legacy_html',title:'Metadata edit',introtext:'',bodytext:'<p>Existing body</p>'});assert.equal(isRequired(byName(nodes,'introtext')),false);});
test('all rendered article/page/menu translation controls are optional',()=>{for(const resource of ['articles','pages','menu'] as const){const nodes=controls(resource,{},true);for(const name of translationFields[resource]!)assert.equal(isRequired(byName(nodes,name)),false,`${resource}.${name} permits empty/partial translation`);}});
test('semantic nonempty link/key constraints remain separate from required JSON keys',()=>{assert.equal(isRequired(byName(controls('pages',defaults('pages')),'link')),true);assert.equal(isRequired(byName(controls('sections',defaults('sections')),'key')),true);assert.equal(isRequired(byName(controls('pages',defaults('pages')),'title')),false);assert.equal(isRequired(byName(controls('menu',defaults('menu')),'name')),false);});
test('boolean fields render as accessible switches that submit 1 only when checked',()=>{const nodes=controls('pages',{...defaults('pages'),visible:1});const on=byName(nodes,'visible'),off=byName(nodes,'strict');assert.ok(on.includes('type="checkbox"')&&on.includes('role="switch"')&&on.includes('value="1"')&&/\schecked/.test(on));assert.equal(/\schecked/.test(off),false);});
test('reference fields render a labelled select, empty-site call to action, or numeric fallback',()=>{const render1=(refs:Record<string,{value:number;label:string}[]|null>,site=2)=>render(Component,{props:{resource:'articles' as Resource,values:{...defaults('articles'),site_id:site},refs,siteId:7}}).body;const withOptions=render1({site_id:[{value:2,label:'About (/about)'}]});assert.match(withOptions,/<select[^>]*name="site_id"/);assert.ok(withOptions.includes('About (/about)'));assert.ok(withOptions.includes('Page the article is shown on'));const empty=render1({site_id:[]},0);assert.ok(empty.includes('/content/7/pages/new'));const fallback=render1({site_id:null});assert.match(fallback,/<input[^>]*type="number"[^>]*name="site_id"/);assert.ok(fallback.includes('The list could not be loaded'));});
test('source and author are optional free text, article-box switch appears only when offered',()=>{const nodes=controls('articles',defaults('articles'));for(const n of ['author','source']){const c=byName(nodes,n);assert.equal(isRequired(c),false);assert.ok(!/pattern=|type="url"/.test(c));}
const page=(props:Record<string,unknown>)=>render(Component,{props:{resource:'pages' as Resource,values:defaults('pages'),...props}}).body;
assert.match(page({offerArticleBox:true}),/name="show_article"[^>]*checked|checked[^>]*name="show_article"/);assert.ok(page({offerArticleBox:true}).includes('Show an article on this page'));
assert.ok(!page({}).includes('show_article'));assert.ok(page({noArticleBox:true}).includes('the page will not display any article on its own'));
assert.ok(page({}).includes('/about-us/'));
const art=render(Component,{props:{resource:'articles' as Resource,values:{...defaults('articles'),site_id:2},refs:{site_id:[{value:2,label:'A'},{value:3,label:'B'}]},siteId:7,articleBoxPages:[3]}}).body;
assert.ok(art.includes('This page does not have a box that displays articles yet'));assert.ok(art.includes('/content/7/boxes/new'));
const fine=render(Component,{props:{resource:'articles' as Resource,values:{...defaults('articles'),site_id:3},refs:{site_id:[{value:2,label:'A'},{value:3,label:'B'}]},siteId:7,articleBoxPages:[3]}}).body;assert.ok(!fine.includes('does not have a box'));});

test('box device is a named select and pages are a picker with chips and a shared notice',()=>{
const render2=(values:Record<string,unknown>)=>render(Component,{props:{resource:'boxes' as Resource,values:{...defaults('boxes'),...values},refs:{sites:[{value:1,label:'Home (/)'},{value:2,label:'About (/about/)'}]},boxTypes:[]}}).body;
const html=render2({device_min:2,sites:[2],shared:0});
assert.ok(/<select[^>]*name="device_min"/.test(html));
for(const label of ['Any device','Mobile','Tablet','Desktop PC'])assert.ok(html.includes(label));
assert.ok(/<option(?=[^>]*value="2")(?=[^>]*selected)[^>]*>Tablet/.test(html.replace(/<!---->/g,'')));
assert.ok(html.includes('About (/about/)')&&/name="sites"[^>]*value="2"|value="2"[^>]*name="sites"/.test(html));
assert.ok(!html.includes('The box is shared'));
assert.ok(render2({shared:1,sites:[]}).includes('The box is shared'));
});
