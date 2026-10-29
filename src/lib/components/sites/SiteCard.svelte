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
            <span class="badge badge-ok shrink-0">Verified</span>
        {:else}
            <span class="badge badge-warn shrink-0">Unverified</span>
        {/if}
    </div>
    <dl class="grid grid-cols-2 gap-3 text-sm">
        <div><dt class="text-xs text-muted">Your role</dt><dd class="font-semibold">{roleLabel(site.role)}</dd></div>
        <div><dt class="text-xs text-muted">Integration</dt><dd class="font-semibold">{site.integrationId ? 'no. ' + site.integrationId : 'unverified'}</dd></div>
    </dl>
    <div class="mt-auto flex flex-wrap gap-2">
        <a class="btn btn-primary btn-sm" href={'/content/' + site.id}>Manage content</a>
        <a class="btn btn-secondary btn-sm" href={'/analytics/' + site.id}>Analytics</a>
    </div>
</article>
