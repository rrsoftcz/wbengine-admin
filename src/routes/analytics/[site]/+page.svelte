<script lang="ts">
    import AnalyticsChart from '#lib/components/AnalyticsChart.svelte';
    import Breadcrumbs from '#lib/components/content/Breadcrumbs.svelte';
    import PageHeader from '#lib/components/content/PageHeader.svelte';
    import { t, intl } from '#lib/i18n/client.ts';
    import type { PageData } from './$types';
    let { data }: { data: PageData } = $props();
    const number = (value: number) => new Intl.NumberFormat(intl()).format(value);
    type Metric = 'page_views' | 'article_views' | 'box_appearances';
    const metrics = $derived<{ key: Metric; label: string; title: string }[]>([
        { key: 'page_views', label: t('analytics.metric.pageViews'), title: t('analytics.trend.title.pageViews') },
        { key: 'article_views', label: t('analytics.metric.articleViews'), title: t('analytics.trend.title.articleViews') },
        { key: 'box_appearances', label: t('analytics.metric.boxAppearances'), title: t('analytics.trend.title.boxAppearances') }
    ]);
    let metric = $state<Metric>('page_views');
    const current = $derived(metrics.find(item => item.key === metric) ?? metrics[0]);

    const day = 86400000;
    const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const yesterday = () => { const now = new Date(); return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - day; };
    const presets = [7, 14, 30, 60].map(days => ({ days }));
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
        if (first === 0) return second > 0 ? { text: t('analytics.trend.upFromZero'), tone: 'badge-ok' } : null;
        const pct = Math.round((second - first) * 100 / first);
        if (pct === 0) return { text: t('analytics.trend.noChange'), tone: '' };
        return pct > 0 ? { text: t('analytics.trend.up', { pct }), tone: 'badge-ok' } : { text: t('analytics.trend.down', { pct: -pct }), tone: 'badge-danger' };
    }
    const sparkline = (key: Metric) => {
        const series = data.overview?.series ?? [];
        const max = Math.max(1, ...series.map(p => p[key]));
        return series.map((p, i) => `${series.length < 2 ? 50 : (i * 100 / (series.length - 1)).toFixed(1)},${(22 - p[key] * 20 / max).toFixed(1)}`).join(' ');
    };
    const granularityLabel = $derived({ day: t('analytics.granularity.day'), week: t('analytics.granularity.week'), month: t('analytics.granularity.month') });
    const languageName = (code: string | null) => {
        if (code === null) return t('analytics.locale.none');
        try { return new Intl.DisplayNames([intl()], { type: 'language' }).of(code.replace('_', '-')) ?? code; } catch { return code; }
    };
    const languages = $derived(data.overview?.per_locale ? (data.overview.by_locale ?? []).map((row, i) => ({ id: i + 1, label: languageName(row.locale), value: row.page_views })) : []);
    const hasUnrecorded = $derived((data.overview?.by_locale ?? []).some(row => row.locale === null));
    const empty = $derived(!!data.overview && data.overview.totals.page_views + data.overview.totals.article_views + data.overview.totals.box_appearances === 0);
</script>

<Breadcrumbs items={[{ label: t('analytics.breadcrumb.sites'), href: '/' }, { label: data.site.name, href: '/content/' + data.site.id }, { label: t('analytics.breadcrumb.analytics') }]} />
<PageHeader title={t('analytics.title', { site: data.site.name })} description={t('analytics.description')}>
    {#snippet actions()}<a class="btn btn-secondary" href={'/content/' + data.site.id}>{t('analytics.backToSite')}</a>{/snippet}
</PageHeader>

{#if !data.available}
    <div class="card text-center" role="status">
        <h2>{t('analytics.unavailable.title')}</h2>
        <div class="mx-auto mt-3 grid max-w-2xl gap-3 text-left">
            {#if data.blockers.includes('disabled')}
                <p class="alert alert-warn">{@html t('analytics.unavailable.disabled', { enabled: '<code>analytics.enabled</code>', value: '<code>true</code>', migration: '<code>4.0.0/006-analytics.sql</code>' })}</p>
            {/if}
            {#if data.blockers.includes('scope')}
                <p class="alert alert-warn">{t('analytics.unavailable.scope')}</p>
            {/if}
        </div>
        <a class="btn btn-secondary mt-4" href={'/content/' + data.site.id}>{t('analytics.backToSite')}</a>
    </div>
{:else if data.overview}
    <section class="card-flat mb-6" aria-labelledby="period">
        <div class="flex flex-wrap items-center justify-between gap-3">
            <h2 id="period" class="text-base">{t('analytics.period.heading')}</h2>
            <div class="inline-flex rounded-xl border border-line-strong bg-surface-2 p-1" role="group" aria-label={t('analytics.period.presets')}>
                {#each presets as preset}
                    <a href={presetHref(preset.days)} aria-current={activePreset === preset.days ? 'true' : undefined}
                       class="rounded-lg px-3 py-1.5 text-sm font-semibold no-underline {activePreset === preset.days ? 'bg-surface text-brand shadow-sm' : 'text-muted hover:text-text'}">{t('analytics.period.preset.days', { days: preset.days })}</a>
                {/each}
            </div>
        </div>
        <p class="hint mt-2">{t('analytics.period.shown', { from: data.range.from, to: data.range.to, granularity: granularityLabel[data.range.granularity], timezone: data.overview.timezone })}</p>
        <details class="mt-3" open={activePreset === undefined}>
            <summary class="text-sm font-semibold">{t('analytics.period.custom')}</summary>
            <form method="GET" class="mt-3 flex flex-wrap items-end gap-3">
                <label class="field"><span>{t('analytics.period.from')}</span><input type="date" name="from" value={data.range.from} required /></label>
                <label class="field"><span>{t('analytics.period.to')}</span><input type="date" name="to" value={data.range.to} required /></label>
                <label class="field"><span>{t('analytics.period.summary')}</span>
                    <select name="granularity" value={data.range.granularity}>
                        <option value="day">{t('analytics.period.option.day')}</option>
                        <option value="week">{t('analytics.period.option.week')}</option>
                        <option value="month">{t('analytics.period.option.month')}</option>
                    </select>
                </label>
                <button class="btn btn-primary" type="submit">{t('analytics.period.show')}</button>
            </form>
            <p class="hint mt-2">{t('analytics.period.longest')}</p>
        </details>
    </section>

    {#if !data.overview.period.complete}
        <p class="alert alert-warn mb-6" role="status">{t('analytics.period.incomplete')}</p>
    {/if}

    <section aria-labelledby="summary" class="mb-6">
        <h2 id="summary" class="sr-only">{t('analytics.summary.heading')}</h2>
        <ul class="grid gap-4 sm:grid-cols-3">
            {#each metrics as item}
                {@const tr = trend(item.key)}
                <li class="card-flat">
                    <p class="text-sm font-semibold text-muted">{item.label}</p>
                    <p class="mt-1 text-3xl font-bold tracking-tight">{number(data.overview.totals[item.key])}</p>
                    <div class="mt-2 flex items-center justify-between gap-2">
                        {#if tr}<span class="badge {tr.tone}" title={t('analytics.trend.tooltip')}>{tr.text}</span>{:else}<span class="hint">{t('analytics.trend.none')}</span>{/if}
                        <svg viewBox="0 0 100 24" class="h-6 w-20 overflow-visible" aria-hidden="true" focusable="false"><polyline points={sparkline(item.key)} fill="none" class="stroke-brand" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" /></svg>
                    </div>
                    <p class="hint mt-2">{t('analytics.summary.lifetime', { count: number(data.overview.lifetime_totals[item.key]) })}</p>
                </li>
            {/each}
        </ul>
        <p class="hint mt-2">{t('analytics.summary.note')}</p>
    </section>

    {#if empty}
        <div class="card mb-6 text-center" role="status">
            <h2>{t('analytics.empty.title')}</h2>
            <p class="lead mx-auto mt-1">{t('analytics.empty.hint')}</p>
        </div>
    {:else}
        <section class="card mb-6" aria-labelledby="trend">
            <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 id="trend">{current.title}</h2>
                <div class="inline-flex rounded-xl border border-line-strong bg-surface-2 p-1" role="group" aria-label={t('analytics.metric.group')}>
                    {#each metrics as item}
                        <button type="button" class="cursor-pointer rounded-lg border-0 px-3 py-1.5 text-sm font-semibold {metric === item.key ? 'bg-surface text-brand shadow-sm' : 'bg-transparent text-muted hover:text-text'}"aria-pressed={metric === item.key} onclick={() => (metric = item.key)}>{item.label}</button>
                    {/each}
                </div>
            </div>
            <AnalyticsChart series={data.overview.series} metric={metric} label={current.label} />
        </section>
    {/if}

    <section class="card-flat mb-6" aria-labelledby="series">
        <details>
            <summary id="series" class="font-semibold">{t('analytics.table.summary')}</summary>
            <div class="mt-3 overflow-x-auto">
                <table class="table">
                    <caption class="sr-only">{t('analytics.table.caption')}</caption>
                    <thead><tr><th scope="col">{t('analytics.table.periodFrom')}</th><th scope="col" class="text-right">{t('analytics.table.pages')}</th><th scope="col" class="text-right">{t('analytics.table.articles')}</th><th scope="col" class="text-right">{t('analytics.table.boxes')}</th></tr></thead>
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
    {#if languages.length}
        <div class="mb-4">
            {@render ranking(t('analytics.locale.heading'), languages, t('analytics.top.noViews'))}
            {#if hasUnrecorded}<p class="hint mt-2">{t('analytics.locale.noneHint')}</p>{/if}
        </div>
    {:else if data.overview.per_locale === false}
        <p class="hint mb-4">{t('analytics.locale.unavailable')}</p>
    {/if}
    <div class="grid gap-4 lg:grid-cols-3">
        {@render ranking(t('analytics.top.pages'), data.overview.top_pages.map(i => ({ id: i.id, label: i.title, value: i.views })), t('analytics.top.noViews'))}
        {@render ranking(t('analytics.top.articles'), data.overview.top_articles.map(i => ({ id: i.id, label: i.title, value: i.views })), t('analytics.top.noViews'))}
        {@render ranking(t('analytics.top.boxes'), data.overview.top_boxes.map(i => ({ id: i.id, label: i.name, value: i.appearances })), t('analytics.top.noAppearances'))}
    </div>
{/if}
