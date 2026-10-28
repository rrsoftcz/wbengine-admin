<script lang="ts">
    import type { Snippet } from 'svelte';
    let { title, description, badges, actions }: { title: string; description?: string; badges?: Snippet; actions?: Snippet } = $props();
</script>

<header class="mb-6 flex flex-wrap items-start justify-between gap-4">
    <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-3">
            <h1 class="break-words">{title}</h1>
            {#if badges}{@render badges()}{/if}
        </div>
        {#if description}<p class="lead mt-1">{description}</p>{/if}
    </div>
    {#if actions}<div class="flex flex-wrap items-center gap-2">{@render actions()}</div>{/if}
</header>
