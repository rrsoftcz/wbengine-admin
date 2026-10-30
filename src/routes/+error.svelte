<script lang="ts">
    import { page } from '$app/state';
    import { t } from '#lib/i18n/client.ts';
    const status = $derived(page.status);
    const text = $derived(
        status === 404 ? { title: t('app.error.404.title'), body: t('app.error.404.body') }
        : status === 403 ? { title: t('app.error.403.title'), body: t('app.error.403.body') }
        : status === 401 ? { title: t('app.error.401.title'), body: t('app.error.401.body') }
        : { title: t('app.error.other.title'), body: t('app.error.other.body') }
    );
</script>

<svelte:head><title>{t('app.error.title', { title: text.title })}</title></svelte:head>

<div class="mx-auto max-w-md py-10">
    <div class="card text-center">
        <p class="eyebrow">{t('app.error.eyebrow', { status })}</p>
        <h1 class="mt-2">{text.title}</h1>
        <p class="lead mx-auto mb-6 mt-2">{text.body}</p>
        <a href="/" class="btn btn-primary">{t('app.error.back')}</a>
    </div>
</div>
