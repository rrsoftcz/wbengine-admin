<script lang="ts">
    let { message }: { message?: string | null } = $props();
</script>

<div aria-live="assertive" role="alert" class={message ? 'alert alert-error mb-4' : 'sr-only'}>
    {#if message}{message}{/if}
</div>
