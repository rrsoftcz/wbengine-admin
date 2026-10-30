<script lang="ts">
    import { enhance } from '$app/forms';
    import { t } from '#lib/i18n/client.ts';
    import CapabilityChips from './CapabilityChips.svelte';
    import RotateKey from './RotateKey.svelte';
    import ErrorBox from './ErrorBox.svelte';
    import { focusOnMount } from './focus';
    import { siteHost, type Resource } from './resources';
    type Site = { id: number; name: string; base_url: string; integrationId: number | null };
    type Form = { action?: string; site?: number; error?: string; code?: string; missing?: string[]; discovery?: { version: string; resources: Resource[] }; rotated?: { site: number; integrationId: number; previousIntegrationId?: number | null } } | null | undefined;
    let { sites, csrf, form }: { sites: Site[]; csrf: string; form: Form } = $props();
    let busy = $state<number | null>(null);
    const orphan = $derived(form?.error && (form.action === 'inspect' || form.action === 'rotate') && !sites.some(s => s.id === form!.site));
</script>

{#if orphan && form?.error}<div class="mb-4"><ErrorBox error={form.error} code={form.code} /></div>{/if}

{#if sites.length}
    <ul class="grid gap-4">
        {#each sites as site (site.id)}
            <li class="rounded-xl border border-line p-4">
                <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="min-w-0">
                        <h3 class="truncate">{site.name}</h3>
                        <a href={site.base_url} target="_blank" rel="noopener noreferrer" class="text-sm text-muted">{siteHost(site.base_url)}</a>
                    </div>
                    <div class="flex items-center gap-2">
                        {#if site.integrationId}<span class="badge badge-ok">{t('sites.list.integrationBadge', { id: site.integrationId })}</span>{:else}<span class="badge badge-warn">{t('sites.card.unverified')}</span>{/if}
                        <a class="btn btn-ghost btn-sm" href={'/content/' + site.id}>{t('sites.list.content')}</a>
                    </div>
                </div>
                <form method="POST" action="?/inspect" class="mt-3" aria-busy={busy === site.id}
                    use:enhance={() => { busy = site.id; return async ({ update }) => { busy = null; await update({ reset: false }); }; }}>
                    <input type="hidden" name="csrf" value={csrf} />
                    <input type="hidden" name="site" value={site.id} />
                    <button class="btn btn-secondary btn-sm" disabled={busy === site.id} aria-busy={busy === site.id}>{#if busy === site.id}<span class="spinner" aria-hidden="true"></span>{t('sites.list.loading')}{:else}{t('sites.list.inspect')}{/if}</button>
                </form>
                {#key form}
                    {#if form?.action === 'inspect' && form.site === site.id}
                        {#if form.error}
                            <div class="mt-3"><ErrorBox error={form.error} /></div>
                        {:else if form.discovery}
                            <div class="mt-3 rounded-xl bg-surface-2 p-4" role="status" tabindex="-1" use:focusOnMount>
                                <p class="text-sm font-semibold">{t('sites.list.valid', { version: form.discovery.version })}</p>
                                <div class="mt-2"><CapabilityChips resources={form.discovery.resources} /></div>
                            </div>
                        {/if}
                    {/if}
                {/key}
                <div class="mt-3"><RotateKey {site} {csrf} {form} /></div>
            </li>
        {/each}
    </ul>
{:else}
    <p class="text-muted">{t('sites.list.empty')}</p>
{/if}
