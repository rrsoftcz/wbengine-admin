<script lang="ts">
    import { page } from '$app/state';
    const status = $derived(page.status);
    const text = $derived(
        status === 404 ? { title: 'Page not found', body: 'The address does not exist or has been moved. Check it, or go back to the start page.' }
        : status === 403 ? { title: 'Access denied', body: 'You do not have permission to view this page. If you need it, ask an administrator.' }
        : status === 401 ? { title: 'Sign in', body: 'Sign in first to continue.' }
        : { title: 'Something went wrong', body: 'An error occurred on our side. Please try again in a moment.' }
    );
</script>

<svelte:head><title>{text.title} | WBengine</title></svelte:head>

<div class="mx-auto max-w-md py-10">
    <div class="card text-center">
        <p class="eyebrow">Error {status}</p>
        <h1 class="mt-2">{text.title}</h1>
        <p class="lead mx-auto mb-6 mt-2">{text.body}</p>
        <a href="/" class="btn btn-primary">Back to start</a>
    </div>
</div>
