<script lang="ts">
    import { roleLabel, siteHost } from './resources';
    let { site }: { site: { id: number; name: string; base_url: string; role: string; integrationId: number | null } } = $props();
</script>

<article class="card-flat flex flex-col gap-4 transition hover:border-line-strong">
    <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
            <h2 class="truncate text-lg" title={site.name}>{site.name}</h2>
            <a href={site.base_url} rel="noopener noreferrer" target="_blank" class="block truncate text-sm text-muted" title={site.base_url}>{siteHost(site.base_url)}</a>
        </div>
        {#if site.integrationId}
            <span class="badge badge-ok shrink-0">Ověřeno</span>
        {:else}
            <span class="badge badge-warn shrink-0">Bez ověření</span>
        {/if}
    </div>
    <dl class="grid grid-cols-2 gap-3 text-sm">
        <div><dt class="text-xs text-muted">Vaše role</dt><dd class="font-semibold">{roleLabel(site.role)}</dd></div>
        <div><dt class="text-xs text-muted">Integrace</dt><dd class="font-semibold">{site.integrationId ? 'č. ' + site.integrationId : 'neověřená'}</dd></div>
    </dl>
    <div class="mt-auto flex flex-wrap gap-2">
        <a class="btn btn-primary btn-sm" href={'/content/' + site.id}>Spravovat obsah</a>
        <a class="btn btn-secondary btn-sm" href={'/analytics/' + site.id}>Analytika</a>
    </div>
</article>
