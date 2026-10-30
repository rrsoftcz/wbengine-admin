<script lang="ts">
    import { labels } from '#lib/content-schema.ts';
    import { changeLabel } from '#lib/content-format.ts';
    import { t, intl } from '#lib/i18n/client.ts';
    import { page as route } from '$app/state';
    import type { MessageKey } from '#lib/i18n/index.ts';
    import Breadcrumbs from '#lib/components/content/Breadcrumbs.svelte';
    import PageHeader from '#lib/components/content/PageHeader.svelte';
    import Pager from '#lib/components/content/Pager.svelte';
    let { data } = $props();
    const base = $derived('/content/' + data.site.id);
    const contentResources = ['articles', 'pages', 'menu', 'sections', 'boxes', 'images'];
    const filterResources = [...contentResources, 'user', 'section', 'translation', 'cache'];
    const resourceName = (name: string) => (name in labels ? t(labels[name as keyof typeof labels]) : (`activity.resource.${name}` in route.data.uiMessages ? t(`activity.resource.${name}` as MessageKey) : name));
    const when = (epoch: number) => new Intl.DateTimeFormat(intl(), { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Europe/Prague' }).format(new Date(epoch * 1000));
    const who = (change: { actor: string | null; local_user_id?: number | null; source?: string }) => {
        if (change.actor) return (data.available ? data.actors[change.actor] : undefined) ?? change.actor;
        if (change.local_user_id) return t('activity.actor.localUser', { id: change.local_user_id });
        return t('activity.actor.direct');
    };
    const href = (patch: Record<string, string | number | null>) => {
        const q = new URLSearchParams(route.url.search);
        for (const [k, v] of Object.entries(patch)) { if (v === null || v === '') q.delete(k); else q.set(k, String(v)); }
        if (!('page' in patch)) q.delete('page');
        const text = q.toString();
        return text ? `?${text}` : '?';
    };
    const reason = (detail: string | null) => (detail ? ((`errors.${detail}` in route.data.uiMessages) ? t(`errors.${detail}` as MessageKey) : detail) : t('activity.rejected.noReason'));
    const link = (c: { resource: string; resource_id: string; action: string }) =>
        contentResources.includes(c.resource) && /^[1-9][0-9]{0,9}$/.test(c.resource_id) && c.action !== 'delete' ? `${base}/${c.resource}/${c.resource_id}` : null;
</script>

<svelte:head><title>{t('activity.title')} | WBengine</title></svelte:head>

<Breadcrumbs items={[{ label: t('content.breadcrumb.sites'), href: '/' }, { label: data.site.name, href: base }, { label: t('activity.title') }]} />
<PageHeader title={t('activity.title')} description={t('activity.description')} />

{#if !data.available}
    <div class="alert alert-warn" role="status">{t('activity.needsNewKey')}</div>
{:else}
    <nav class="mb-4 flex flex-wrap gap-2" aria-label={t('activity.tabs.label')}>
        <a class="btn btn-sm {data.kind === 'applied' ? 'btn-primary' : 'btn-secondary'}" href={href({ outcome: null })} aria-current={data.kind === 'applied' ? 'page' : undefined}>{t('activity.tabs.applied')}</a>
        <a class="btn btn-sm {data.kind === 'rejected' ? 'btn-primary' : 'btn-secondary'}" href={href({ outcome: 'rejected', resource: null, source: null })} aria-current={data.kind === 'rejected' ? 'page' : undefined}>{t('activity.tabs.rejected')}</a>
    </nav>

    {#if data.kind === 'applied'}
        <form method="GET" class="card-flat mb-5 flex flex-wrap items-end gap-3">
            <div class="field w-48">
                <label for="f-resource" class="text-sm font-semibold">{t('activity.filter.resource')}</label>
                <select id="f-resource" name="resource" value={data.query.resource ?? ''}>
                    <option value="">{t('activity.filter.any')}</option>
                    {#each filterResources as r}<option value={r}>{resourceName(r)}</option>{/each}
                </select>
            </div>
            <div class="field w-48">
                <label for="f-source" class="text-sm font-semibold">{t('activity.filter.source')}</label>
                <select id="f-source" name="source" value={data.query.source ?? ''}>
                    <option value="">{t('activity.filter.any')}</option>
                    {#each ['v2', 'v1', 'cli'] as s}<option value={s}>{t(`activity.source.${s}` as MessageKey)}</option>{/each}
                </select>
            </div>
            <button class="btn btn-secondary">{t('activity.filter.apply')}</button>
            {#if data.query.resource || data.query.source}<a class="btn btn-ghost" href={href({ resource: null, source: null })}>{t('activity.filter.reset')}</a>{/if}
        </form>
    {:else}
        <p class="hint mb-4">{t('activity.rejected.hint')}</p>
    {/if}

    {#if data.page.items.length}
        <p class="mb-3 text-sm text-muted" aria-live="polite">{t('activity.range', { from: (data.page.page - 1) * data.page.perPage + 1, to: (data.page.page - 1) * data.page.perPage + data.page.items.length, total: data.page.total })}</p>
        <div class="overflow-x-auto rounded-xl border border-line">
            <table class="w-full text-left text-sm">
                <thead class="bg-surface-2 text-xs uppercase tracking-wide text-muted">
                    <tr>
                        <th scope="col" class="px-3 py-2 font-semibold">{t('activity.col.when')}</th>
                        <th scope="col" class="px-3 py-2 font-semibold">{t('activity.col.who')}</th>
                        {#if data.kind === 'applied'}
                            <th scope="col" class="px-3 py-2 font-semibold">{t('activity.col.what')}</th>
                            <th scope="col" class="px-3 py-2 font-semibold">{t('activity.col.source')}</th>
                        {:else}
                            <th scope="col" class="px-3 py-2 font-semibold">{t('activity.col.operation')}</th>
                            <th scope="col" class="px-3 py-2 font-semibold">{t('activity.col.reason')}</th>
                        {/if}
                    </tr>
                </thead>
                <tbody class="divide-y divide-line">
                    {#if data.kind === 'applied'}
                        {#each data.page.items as c (c.change_id)}
                            <tr>
                                <td class="whitespace-nowrap px-3 py-2 tabular-nums text-muted">{when(c.created_at)}</td>
                                <td class="px-3 py-2">{who(c)}</td>
                                <td class="px-3 py-2">
                                    <span class="font-medium">{changeLabel(c.action, t)}</span>
                                    <span class="text-muted"> &middot; {resourceName(c.resource)}
                                        {#if link(c)}<a href={link(c)}>#{c.resource_id}</a>{:else}#{c.resource_id}{/if}</span>
                                </td>
                                <td class="px-3 py-2"><span class="badge badge-{c.source === 'v2' ? 'brand' : c.source === 'v1' ? 'info' : 'warn'}">{t(`activity.source.${c.source}` as MessageKey)}</span></td>
                            </tr>
                        {/each}
                    {:else}
                        {#each data.page.items as c (c.audit_id)}
                            <tr>
                                <td class="whitespace-nowrap px-3 py-2 tabular-nums text-muted">{when(c.created_at)}</td>
                                <td class="px-3 py-2">{who(c)}</td>
                                <td class="px-3 py-2 font-mono text-xs">{c.action}</td>
                                <td class="px-3 py-2"><span class="badge badge-{c.outcome === 'error' ? 'danger' : 'warn'}">{reason(c.detail)}</span></td>
                            </tr>
                        {/each}
                    {/if}
                </tbody>
            </table>
        </div>
        {#if data.page.totalPages > 1}<Pager page={data.page.page} totalPages={data.page.totalPages} href={(n) => href({ page: n })} />{/if}
    {:else}
        <p class="text-sm text-muted">{data.kind === 'applied' && (data.query.resource || data.query.source) ? t('activity.emptyFiltered') : t('activity.empty')}</p>
    {/if}
{/if}
