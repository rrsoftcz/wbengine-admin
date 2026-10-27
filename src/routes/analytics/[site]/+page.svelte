<script lang="ts">
    import AnalyticsChart from '#lib/components/AnalyticsChart.svelte';
    import type { PageData } from './$types';
    let { data }: { data: PageData } = $props();
    const number = (value: number) => new Intl.NumberFormat('cs-CZ').format(value);
</script>

<p><a href={'/content/' + data.site.id}>Zpět na web</a></p>
<h1>Analytika: {data.site.name}</h1>

{#if !data.available}
    <p role="status">Analytika není pro tento web povolena. Ověřte migraci databáze a nastavení API.</p>
{:else if data.overview}
    <form method="GET">
        <label>Od <input type="date" name="from" value={data.range.from} required /></label>
        <label>Do <input type="date" name="to" value={data.range.to} required /></label>
        <label>Souhrn
            <select name="granularity" value={data.range.granularity}>
                <option value="day">Denně</option>
                <option value="week">Týdně</option>
                <option value="month">Měsíčně</option>
            </select>
        </label>
        <button type="submit">Zobrazit</button>
    </form>
    <p>Časová zóna webu: {data.overview.timezone}. Počítáme zobrazení, nikoli unikátní osoby.</p>
    {#if !data.overview.period.complete}
        <p role="status">Pro část období nejsou data k dispozici.</p>
    {/if}
    <section aria-label="Souhrn návštěvnosti">
        <h2>Vybrané období</h2>
        <dl>
            <dt>Zobrazení stránek</dt><dd>{number(data.overview.totals.page_views)}</dd>
            <dt>Zobrazení článků</dt><dd>{number(data.overview.totals.article_views)}</dd>
            <dt>Výskyty boxů</dt><dd>{number(data.overview.totals.box_appearances)}</dd>
        </dl>
        <h2>Od začátku měření</h2>
        <dl>
            <dt>Zobrazení stránek</dt><dd>{number(data.overview.lifetime_totals.page_views)}</dd>
            <dt>Zobrazení článků</dt><dd>{number(data.overview.lifetime_totals.article_views)}</dd>
            <dt>Výskyty boxů</dt><dd>{number(data.overview.lifetime_totals.box_appearances)}</dd>
        </dl>
    </section>

    {#if data.overview.totals.page_views + data.overview.totals.article_views + data.overview.totals.box_appearances === 0}
        <p role="status">Ve zvoleném období nejsou žádná zaznamenaná zobrazení.</p>
    {:else}
        <h2>Trend zobrazení stránek</h2>
        <AnalyticsChart series={data.overview.series} />
    {/if}

    <h2>Časová řada</h2>
    <table>
        <thead><tr><th scope="col">Období od</th><th scope="col">Stránky</th><th scope="col">Články</th><th scope="col">Boxy</th></tr></thead>
        <tbody>{#each data.overview.series as point (point.period_start)}
            <tr><th scope="row">{point.period_start}</th><td>{number(point.page_views)}</td><td>{number(point.article_views)}</td><td>{number(point.box_appearances)}</td></tr>
        {/each}</tbody>
    </table>

    <section>
        <h2>Nejnavštěvovanější stránky</h2>
        {#if data.overview.top_pages.length}<ol>{#each data.overview.top_pages as item (item.id)}<li>{item.title}: {number(item.views)}</li>{/each}</ol>{:else}<p>Bez zobrazení.</p>{/if}
        <h2>Nejnavštěvovanější články</h2>
        {#if data.overview.top_articles.length}<ol>{#each data.overview.top_articles as item (item.id)}<li>{item.title}: {number(item.views)}</li>{/each}</ol>{:else}<p>Bez zobrazení.</p>{/if}
        <h2>Nejčastější výskyty boxů</h2>
        {#if data.overview.top_boxes.length}<ol>{#each data.overview.top_boxes as item (item.id)}<li>{item.name}: {number(item.appearances)}</li>{/each}</ol>{:else}<p>Bez výskytů.</p>{/if}
    </section>
{/if}
