<script lang="ts">
    import type { AnalyticsSeriesPoint } from '#lib/server/analytics.ts';
    type Metric = 'page_views' | 'article_views' | 'box_appearances';
    let { series, metric = 'page_views', label = 'Page views' }: { series: AnalyticsSeriesPoint[]; metric?: Metric; label?: string } = $props();

    const width = 640, height = 240, left = 48, right = 16, top = 16, bottom = 32;
    const nf = new Intl.NumberFormat('en-GB');
    const values = $derived(series.map(point => point[metric]));
    // Upper axis limit rounded to a round number (1, 2, 5 times a power of ten).
    const maximum = $derived.by(() => {
        const peak = Math.max(1, ...values);
        const power = 10 ** Math.floor(Math.log10(peak));
        for (const step of [1, 2, 5, 10]) if (peak <= step * power) return step * power;
        return peak;
    });
    const x = (index: number) => series.length < 2 ? (left + width - right) / 2 : left + index * (width - left - right) / (series.length - 1);
    const y = (value: number) => top + (height - top - bottom) * (1 - value / maximum);
    const line = $derived(values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' '));
    const area = $derived(series.length < 2 ? '' : `${x(0).toFixed(1)},${y(0)} ${line} ${x(series.length - 1).toFixed(1)},${y(0)}`);
    const ticks = $derived([0, 1, 2, 3, 4].map(i => (maximum * i) / 4));
    const labelIndexes = $derived.by(() => {
        const count = Math.min(6, series.length);
        if (count < 2) return series.length ? [0] : [];
        return [...new Set(Array.from({ length: count }, (_, i) => Math.round(i * (series.length - 1) / (count - 1))))];
    });
    const total = $derived(values.reduce((sum, value) => sum + value, 0));
    const peakIndex = $derived(values.indexOf(Math.max(...values, 0)));
    const summary = $derived(series.length
        ? `Chart: ${label}. ${series.length} periods from ${series[0].period_start} to ${series[series.length - 1].period_start}, total ${nf.format(total)}. Highest value ${nf.format(values[peakIndex] ?? 0)} in the period starting ${series[peakIndex]?.period_start}. Exact values are in the table below the chart.`
        : 'No data.');
    const uid = $props.id();
</script>

<figure class="m-0">
    <svg viewBox="0 0 {width} {height}" class="block h-auto w-full overflow-visible" role="img" aria-labelledby="{uid}-t {uid}-d" focusable="false">
        <title id="{uid}-t">{label}</title>
        <desc id="{uid}-d">{summary}</desc>
        {#each ticks as tick}
            <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} class="stroke-line" stroke-width="1" stroke-dasharray={tick === 0 ? undefined : '3 4'} />
            <text x={left - 8} y={y(tick) + 4} text-anchor="end" class="fill-muted text-[11px]">{nf.format(Math.round(tick))}</text>
        {/each}
        {#each labelIndexes as index}
            <text x={x(index)} y={height - 10} text-anchor={index === 0 && series.length > 1 ? 'start' : index === series.length - 1 && series.length > 1 ? 'end' : 'middle'} class="fill-muted text-[11px]">{series[index].period_start}</text>
        {/each}
        {#if area}<polygon points={area} class="fill-brand" fill-opacity=".12" />{/if}
        <polyline points={line} fill="none" class="stroke-brand" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        {#each series as point, index (point.period_start)}
            <circle cx={x(index)} cy={y(point[metric])} r={series.length > 45 ? 2 : 3.5} class="fill-surface stroke-brand" stroke-width="2"><title>{point.period_start}: {nf.format(point[metric])}</title></circle>
        {/each}
    </svg>
    <figcaption class="mt-2 text-sm text-muted">{label}. Exact values are given in the table below the chart.</figcaption>
</figure>
