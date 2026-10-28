<script lang="ts">
    import type { Snippet } from 'svelte';
    let { busy = false, variant = 'primary', small = false, form, formaction, children }: { busy?: boolean; variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; small?: boolean; form?: string; formaction?: string; children: Snippet } = $props();
</script>

<button class="btn btn-{variant}{small ? ' btn-sm' : ''}" disabled={busy} aria-busy={busy} {form} {formaction}>
    {#if busy}<span class="spinner" aria-hidden="true"></span>{/if}
    {@render children()}
</button>
