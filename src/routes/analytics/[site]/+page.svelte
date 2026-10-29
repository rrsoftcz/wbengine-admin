<script lang="ts">
    import AnalyticsChart from '#lib/components/AnalyticsChart.svelte';
    import Breadcrumbs from '#lib/components/content/Breadcrumbs.svelte';
    import PageHeader from '#lib/components/content/PageHeader.svelte';
    import type { PageData } from './$types';
    let { data }: { data: PageData } = $props();
    const number = (value: number) => new Intl.NumberFormat('en-GB').format(value);
    type Metric = 'page_views' | 'article_views' | 'box_appearances';
    const metrics: { key: Metric; label: string; chart: string }[] = [
        { key: 'page_views', label: 'Page views', chart: 'Page views' },
        { key: 'article_views', label: 'Article views', chart: 'Article views' },
        { key: 'box_appearances', label: 'Box appearances', chart: 'Box appearances' }
    ];
    let metric = $state<Metric>('page_views');
    const current = $derived(metrics.find(item => item.key === metric) ?? metrics[0]);

    const day = 86400000;
    const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const yesterday = () => { const now = new Date(); return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - day; };
    const presets = [{ days: 7, label: '7 days' }, { days: 14, label: '14 days' }, { days: 30, label: '30 days' }, { days: 60, label: '60 days' }];
    const presetHref = (days: number) => `?from=${iso(yesterday() - (days - 1) * day)}&to=${iso(yesterday())}&granularity=${days > 31 ? 'week' : 'day'}`;
    const span = $derived(Math.round((Date.parse(data.range.to) - Date.parse(data.range.from)) / day) + 1);
    const activePreset = $derived(data.range.to === iso(yesterday()) ? presets.find(p => p.days === span)?.days : undefined);

    // Trend: sum of the second half of the period against the first half.
    function trend(key: Metric) {
        const series = data.overview?.series ?? [];
        const half = Math.floor(series.length / 2);
        if (half < 1) return null;
        const sum = (items: typeof series) => items.reduce((total, point) => total + point[key], 0);
        const first = sum(series.slice(0, half)), second = sum(series.slice(series.length - half));
        if (first === 0) return second > 0 ? { text: 'Up from zero', tone: 'badge-ok' } : null;
        const pct = Math.round((second - first) * 100 / first);
        if (pct === 0) return { text: 'No change', tone: '' };
        return pct > 0 ? { text: `Up ${pct}%`, tone: 'badge-ok' } : { text: `Down ${-pct}%`, tone: 'badge-danger' };
    }
    const sparkline = (key: Metric) => {
        const series = data.overview?.series ?? [];
        const max = Math.max(1, ...series.map(p => p[key]));
        return series.map((p, i) => `${series.length < 2 ? 50 : (i * 100 / (series.length - 1)).toFixed(1)},${(22 - p[key] * 20 / max).toFixed(1)}`).join(' ');
    };
    const granularityLabel = { day: 'daily', week: 'weekly', month: 'monthly' } as const;
    const empty = $derived(!!data.overview && data.overview.totals.page_views + data.overview.totals.article_views + data.overview.totals.box_appearances === 0);
</script>

<Breadcrumbs items={[{ label: 'Sites', href: '/' }, { label: data.site.name, href: '/content/' + data.site.id }, { label: 'Analytics' }]} />
<PageHeader title={'Analytics: ' + data.site.name} description="We count views, not unique people.">
    {#snippet actions()}<a class="btn btn-secondary" href={'/content/' + data.site.id}>Back to site</a>{/snippet}
</PageHeader>

{#if !data.available}
    <div class="card text-center" role="status">
        <h2>Analytics is not available for this site</h2>
        <div class="mx-auto mt-3 grid max-w-2xl gap-3 text-left">
            {#if data.blockers.includes('disabled')}
                <p class="alert alert-warn">Analytics is turned off on the site: in Settings.json set <code>analytics.enabled</code> to <code>true</code> (and apply the framework migration <code>4.0.0/006-analytics.sql</code>), then reload the page.</p>
            {/if}
            {#if data.blockers.includes('scope')}
                <p class="alert alert-warn">The site key is not allowed to read analytics: on the site's Integrations page issue a new key with the Analytics option ticked and replace it in the Site registry (Replace key).</p>
            {/if}
        </div>
        <a class="btn btn-secondary mt-4" href={'/content/' + data.site.id}>Back to site</a>
    </div>
{:else if data.overview}
    <section class="card-flat mb-6" aria-labelledby="obdobi">
        <div class="flex flex-wrap items-center justify-between gap-3">
            <h2 id="obdobi" class="text-base">Period</h2>
            <div class="inline-flex rounded-xl border border-line-strong bg-surface-2 p-1" role="group" aria-label="Period presets">
                {#each presets as preset}
                    <a href={presetHref(preset.days)} aria-current={activePreset === preset.days ? 'true' : undefined}
                       class="rounded-lg px-3 py-1.5 text-sm font-semibold no-underline {activePreset === preset.days ? 'bg-surface text-brand shadow-sm' : 'text-muted hover:text-text'}">{preset.label}</a>
                {/each}
            </div>
        </div>
        <p class="hint mt-2">Shown: {data.range.from} to {data.range.to}, {granularityLabel[data.range.granularity]} summary. Site time zone: {data.overview.timezone}.</p>
        <details class="mt-3" open={activePreset === undefined}>
            <summary class="text-sm font-semibold">Custom range</summary>
            <form method="GET" class="mt-3 flex flex-wrap items-end gap-3">
                <label class="field"><span>From</span><input type="date" name="from" value={data.range.from} required /></label>
                <label class="field"><span>To</span><input type="date" name="to" value={data.range.to} required /></label>
                <label class="field"><span>Summary</span>
                    <select name="granularity" value={data.range.granularity}>
                        <option value="day">Daily</option>
                        <option value="week">Weekly</option>
                        <option value="month">Monthly</option>
                    </select>
                </label>
                <button class="btn btn-primary" type="submit">Show</button>
            </form>
            <p class="hint mt-2">The longest possible period is 62 days.</p>
        </details>
    </section>

    {#if !data.overview.period.complete}
        <p class="alert alert-warn mb-6" role="status">Data is not available for part of the period.</p>
    {/if}

    <section aria-labelledby="souhrn" class="mb-6">
        <h2 id="souhrn" class="sr-only">Traffic summary</h2>
        <ul class="grid gap-4 sm:grid-cols-3">
            {#each metrics as item}
                {@const t = trend(item.key)}
                <li class="card-flat">
                    <p class="text-sm font-semibold text-muted">{item.label}</p>
                    <p class="mt-1 text-3xl font-bold tracking-tight">{number(data.overview.totals[item.key])}</p>
                    <div class="mt-2 flex items-center justify-between gap-2">
                        {#if t}<span class="badge {t.tone}" title="Second half of the period compared with the first">{t.text}</span>{:else}<span class="hint">No trend</span>{/if}
                        <svg viewBox="0 0 100 24" class="h-6 w-20 overflow-visible" aria-hidden="true" focusable="false"><polyline points={sparkline(item.key)} fill="none" class="stroke-brand" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" /></svg>
                    </div>
                    <p class="hint mt-2">Since measuring began: {number(data.overview.lifetime_totals[item.key])}</p>
                </li>
            {/each}
        </ul>
        <p class="hint mt-2">Figures for the selected period. The trend compares the second half of the period with the first.</p>
    </section>

    {#if empty}
        <div class="card mb-6 text-center" role="status">
            <h2>There are no recorded views in the selected period</h2>
            <p class="lead mx-auto mt-1">Try a longer period or come back later, once the site has visitors.</p>
        </div>
    {:else}
        <section class="card mb-6" aria-labelledby="trend">
            <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 id="trend">Trend: {current.label.toLowerCase()}</h2>
                <div class="inline-flex rounded-xl border border-line-strong bg-surface-2 p-1" role="group" aria-label="Displayed metric">
                    {#each metrics as item}
                        <button type="button" class="cursor-pointer rounded-lg border-0 px-3 py-1.5 text-sm font-semibold {metric === item.key ? 'bg-surface text-brand shadow-sm' : 'bg-transparent text-muted hover:text-text'}"aria-pressed={metric === item.key} onclick={() => (metric = item.key)}>{item.label}</button>
                    {/each}
                </div>
            </div>
            <AnalyticsChart series={data.overview.series} metric={metric} label={current.chart} />
        </section>
    {/if}

    <section class="card-flat mb-6" aria-labelledby="rada">
        <details>
            <summary id="rada" class="font-semibold">Time series as a table</summary>
            <div class="mt-3 overflow-x-auto">
                <table class="table">
                    <caption class="sr-only">Views by period</caption>
                    <thead><tr><th scope="col">Period from</th><th scope="col" class="text-right">Pages</th><th scope="col" class="text-right">Articles</th><th scope="col" class="text-right">Boxes</th></tr></thead>
                    <tbody>{#each data.overview.series as point (point.period_start)}
                        <tr><th scope="row" class="whitespace-nowrap font-medium">{point.period_start}</th><td class="text-right">{number(point.page_views)}</td><td class="text-right">{number(point.article_views)}</td><td class="text-right">{number(point.box_appearances)}</td></tr>
                    {/each}</tbody>
                </table>
            </div>
        </details>
    </section>

    {#snippet ranking(heading: string, rows: { id: number; label: string; value: number }[], emptyText: string)}
        {@const max = Math.max(1, ...rows.map(row => row.value))}
        <section class="card-flat" aria-label={heading}>
            <h2 class="mb-3 text-base">{heading}</h2>
            {#if rows.length}
                <ol class="grid gap-3">
                    {#each rows as row (row.id)}
                        <li>
                            <div class="flex items-baseline justify-between gap-3 text-sm"><span class="min-w-0 truncate font-medium" title={row.label}>{row.label}</span><span class="shrink-0 font-semibold">{number(row.value)}</span></div>
                            <div class="mt-1 h-2 rounded-full bg-surface-2" aria-hidden="true"><div class="h-2 rounded-full bg-brand" style="width: {Math.max(2, row.value * 100 / max)}%"></div></div>
                        </li>
                    {/each}
                </ol>
            {:else}<p class="hint">{emptyText}</p>{/if}
        </section>
    {/snippet}
    <div class="grid gap-4 lg:grid-cols-3">
        {@render ranking('Most viewed pages', data.overview.top_pages.map(i => ({ id: i.id, label: i.title, value: i.views })), 'No views.')}
        {@render ranking('Most viewed articles', data.overview.top_articles.map(i => ({ id: i.id, label: i.title, value: i.views })), 'No views.')}
        {@render ranking('Most frequent box appearances', data.overview.top_boxes.map(i => ({ id: i.id, label: i.name, value: i.appearances })), 'No appearances.')}
    </div>
{/if}
