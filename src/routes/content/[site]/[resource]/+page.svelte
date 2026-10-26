<script lang="ts">import {labels,idOf} from '#lib/content-schema.ts';let {data,form}=$props();const base=$derived('/content/'+data.site.id+'/'+data.resource);</script>
<p>
<a href={'/content/'+data.site.id}>{data.site.name}</a>
</p>
<h1>{labels[data.resource]}</h1>{#if data.canCreate&&data.resource!=='images'}<a href={base+'/new'}>Vytvořit záznam</a>{/if}{#if data.resource==='images'&&data.canCreate}<p>Nahrané obrázky jsou veřejné soubory. Odstranění může poškodit existující odkazy v obsahu.</p>
<form method="POST" action="?/upload" enctype="multipart/form-data">
<input type="hidden" name="csrf" value={data.csrf}/>
<label>Obrázek, nejvýše 512 KiB<input type="file" name="image" accept="image/png,image/jpeg,image/webp" required/>
</label>
<label>
<input name="publicConsent" value="yes" type="checkbox" required/> Souhlasím s veřejnou dostupností obrázku</label>
<button>Nahrát obrázek</button>
</form>{/if}{#if form?.error}<p class="error">{form.error}</p>{/if}{#if form?.uploaded}<p>Obrázek nahrán. Veřejná cesta na webu: <code>{String(form.uploaded.url)}</code>
</p>{/if}{#each data.items as row}<article>
<h2>
<a href={base+'/'+idOf(data.resource,row)}>{String(row.draft_title??row.title??row.name??row.image_id??row.key??idOf(data.resource,row))}</a>
</h2>
<p>ID {idOf(data.resource,row)} {#if row.has_draft}, nepublikovaný koncept{/if}</p>{#if row.link}<p>{String(row.link)}</p>{/if}{#if data.resource==='images'}<p>{String(row.mime)}, {String(row.size)} bajtů, veřejný soubor</p>
<code>{String(row.url)}</code>{/if}</article>{:else}<p>Žádné záznamy.</p>{/each}{#if data.pagination}<nav>{#if data.pagination.page>1}<a href={base+'?page='+(data.pagination.page-1)}>Předchozí</a>{/if} Strana {data.pagination.page} z {Math.max(1,data.pagination.total_pages)} {#if data.pagination.page<data.pagination.total_pages}<a href={base+'?page='+(data.pagination.page+1)}>Další</a>{/if}</nav>{/if}{#if !['articles','images'].includes(data.resource)}<form method="GET" action={base+'/recover'}>
<label>ID odstraněného záznamu<input name="recoverId" type="number" min="1" required/>
</label>
<button>Vyhledat historii pro obnovu</button>
</form>{/if}
