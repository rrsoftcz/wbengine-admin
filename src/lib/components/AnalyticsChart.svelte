<script lang="ts">
    import type { AnalyticsSeriesPoint } from '#lib/server/analytics.ts';
    let { series }: { series: AnalyticsSeriesPoint[] } = $props();
    const maximum = $derived(Math.max(1, ...series.map(point => point.page_views)));
    const points = $derived(series.map((point, index) => `${series.length < 2 ? 50 : 24 + index * 452 / (series.length - 1)},${146 - point.page_views * 120 / maximum}`).join(' '));
</script>

<figure>
    <svg viewBox="0 0 500 170" aria-hidden="true" focusable="false">
        <line x1="24" y1="146" x2="476" y2="146" />
        <polyline points={points} />
        {#each series as point, index (point.period_start)}
            <circle cx={series.length < 2 ? 50 : 24 + index * 452 / (series.length - 1)} cy={146 - point.page_views * 120 / maximum} r="3" />
        {/each}
    </svg>
    <figcaption>Vývoj zobrazení stránek. Přesné hodnoty jsou uvedené v tabulce.</figcaption>
</figure>

<style>
    figure { margin: 1rem 0; }
    svg { display: block; width: 100%; max-height: 14rem; overflow: visible; }
    line { stroke: #98a5b3; stroke-width: 1; }
    polyline { fill: none; stroke: #2563eb; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
    circle { fill: #2563eb; }
    figcaption { color: #52606d; font-size: .9rem; }
</style>
