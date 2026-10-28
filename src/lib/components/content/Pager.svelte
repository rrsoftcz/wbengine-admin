<script lang="ts">
    let { page, totalPages, href, previous = 'Předchozí', next = 'Další' }: { page: number; totalPages: number; href: (page: number) => string; previous?: string; next?: string } = $props();
    const last = $derived(Math.max(1, totalPages));
</script>

<nav class="mt-5 flex items-center justify-between gap-3 text-sm" aria-label="Stránkování">
    <span class="w-28">{#if page > 1}<a class="btn btn-secondary btn-sm" href={href(page - 1)} rel="prev">{previous}</a>{/if}</span>
    <span class="text-muted">Strana {page} z {last}</span>
    <span class="w-28 text-right">{#if page < totalPages}<a class="btn btn-secondary btn-sm" href={href(page + 1)} rel="next">{next}</a>{/if}</span>
</nav>
