<script lang="ts">
    let { pending = false, label, pendingLabel, variant = 'primary', block = true }: { pending?: boolean; label: string; pendingLabel: string; variant?: 'primary' | 'secondary'; block?: boolean } = $props();
</script>

<button type="submit" class="btn btn-{variant} {block ? 'btn-block' : ''}" disabled={pending} aria-busy={pending}>
    {#if pending}<span class="spinner" aria-hidden="true"></span>{pendingLabel}{:else}{label}{/if}
</button>
