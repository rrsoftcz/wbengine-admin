<script lang="ts">
    let { items }: { items: { label: string; href?: string }[] } = $props();
</script>

<nav aria-label="Drobečková navigace" class="mb-4 text-sm text-muted">
    <ol class="flex flex-wrap items-center gap-x-2 gap-y-1">
        {#each items as item, index}
            <li class="flex min-w-0 items-center gap-2">
                {#if index > 0}<span aria-hidden="true" class="text-line-strong">/</span>{/if}
                {#if item.href && index < items.length - 1}
                    <a href={item.href} class="truncate no-underline hover:underline">{item.label}</a>
                {:else}
                    <span class="truncate font-semibold text-text" aria-current="page">{item.label}</span>
                {/if}
            </li>
        {/each}
    </ol>
</nav>
