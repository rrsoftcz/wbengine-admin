<script lang="ts">
    import { enhance } from '$app/forms';
    import { t, intl } from '#lib/i18n/client.ts';
    import type { MessageKey } from '#lib/i18n/index.ts';
    import Breadcrumbs from '#lib/components/content/Breadcrumbs.svelte';
    import PageHeader from '#lib/components/content/PageHeader.svelte';
    import Pager from '#lib/components/content/Pager.svelte';
    import FormAlert from '#lib/components/auth/FormAlert.svelte';
    import CopyButton from '#lib/components/auth/CopyButton.svelte';
    import { page as route } from '$app/state';
    let { data, form } = $props();
    const base = $derived('/content/' + data.site.id);
    const link = $derived(form && 'link' in form ? (form.link as { email: string; token: string; expiresAt: number }) : null);
    const url = $derived(link && data.available && data.baseUrl ? new URL('/login/?reset=' + link.token, data.baseUrl).href : '');
    const until = (epoch: number) => new Intl.DateTimeFormat(intl(), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Prague' }).format(new Date(epoch * 1000));
    const href = (patch: Record<string, string | number | null>) => {
        const q = new URLSearchParams(route.url.search);
        for (const [k, v] of Object.entries(patch)) { if (v === null || v === '') q.delete(k); else q.set(k, String(v)); }
        if (!('page' in patch)) q.delete('page');
        const s = q.toString();
        return s ? `?${s}` : '?';
    };
    const confirmIt = (message: string) => ({ cancel }: { cancel: () => void }) => { if (!confirm(message)) cancel(); };
</script>

<svelte:head><title>{t('siteusers.title')} | WBengine</title></svelte:head>

<Breadcrumbs items={[{ label: t('content.breadcrumb.sites'), href: '/' }, { label: data.site.name, href: base }, { label: t('siteusers.title') }]} />
<PageHeader title={t('siteusers.title')} description={t('siteusers.description')} />

{#if !data.available}
    <div class="alert alert-warn" role="status">{t('siteusers.needsNewKey')}</div>
{:else}
    {#if form && 'error' in form && form.error}<FormAlert message={form.error} />{/if}
    {#if form && 'done' in form && form.done}<p class="alert alert-ok mb-4" role="status">{form.done}</p>{/if}
    {#if link}
        <div class="alert alert-warn mb-5" role="status">
            <p class="m-0 font-semibold">{t('siteusers.link.heading', { email: link.email })}</p>
            <p class="my-2 text-sm">{t('siteusers.link.hint', { until: until(link.expiresAt) })}</p>
            {#if url}<code class="block break-all rounded-lg bg-surface-2 p-3 text-sm text-text" data-secret>{url}</code><div class="mt-3"><CopyButton text={url} /></div>{/if}
        </div>
    {/if}

    {#if data.canWrite}
        <section class="card mb-6" aria-labelledby="su-create">
            <h2 id="su-create" class="mb-2">{t('siteusers.create.heading')}</h2>
            <p class="hint mb-4">{t('siteusers.create.hint')}</p>
            <form method="POST" action="?/create" use:enhance={() => async ({ update }) => { await update({ reset: true }); }} class="grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="csrf" value={data.csrf} />
                <div class="field sm:col-span-2"><label for="c-email" class="text-sm font-semibold">{t('users.invite.email')}</label><input id="c-email" name="email" type="email" required maxlength="100" autocomplete="off" /></div>
                <div class="field"><label for="c-first" class="text-sm font-semibold">{t('siteusers.col.firstname')}</label><input id="c-first" name="firstname" maxlength="45" autocomplete="off" /></div>
                <div class="field"><label for="c-last" class="text-sm font-semibold">{t('siteusers.col.lastname')}</label><input id="c-last" name="lastname" maxlength="150" autocomplete="off" /></div>
                <div class="field"><label for="c-role" class="text-sm font-semibold">{t('siteusers.col.role')}</label>
                    <select id="c-role" name="role"><option value="user">{t('siteusers.role.user')}</option><option value="editor">{t('siteusers.role.editor')}</option><option value="admin">{t('siteusers.role.admin')}</option></select></div>
                <div class="sm:col-span-2"><button class="btn btn-primary">{t('siteusers.create.submit')}</button></div>
            </form>
        </section>
    {/if}

    <form method="GET" class="mb-4 flex flex-wrap items-end gap-3">
        <div class="field w-64 max-w-full"><label for="q" class="text-sm font-semibold">{t('users.search.label')}</label><input id="q" name="q" type="search" value={data.query.search ?? ''} maxlength="100" /></div>
        <div class="field w-40"><label for="r" class="text-sm font-semibold">{t('siteusers.col.role')}</label>
            <select id="r" name="role" value={data.query.role ?? ''}><option value="">{t('activity.filter.any')}</option><option value="user">{t('siteusers.role.user')}</option><option value="editor">{t('siteusers.role.editor')}</option><option value="admin">{t('siteusers.role.admin')}</option></select></div>
        <button class="btn btn-secondary">{t('users.search.submit')}</button>
        {#if data.query.search || data.query.role}<a class="btn btn-ghost" href="?">{t('users.search.reset')}</a>{/if}
    </form>

    {#if data.page.items.length}
        <p class="mb-3 text-sm text-muted" aria-live="polite">{t('activity.range', { from: (data.page.page - 1) * data.page.perPage + 1, to: (data.page.page - 1) * data.page.perPage + data.page.items.length, total: data.page.total })}</p>
        <ul class="m-0 list-none divide-y divide-line rounded-xl border border-line p-0">
            {#each data.page.items as u (u.id)}
                <li class="px-3 py-3 text-sm">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                        <span class="min-w-0"><span class="font-medium break-all">{u.email}</span>
                            {#if u.firstname || u.lastname}<span class="text-muted"> &middot; {[u.firstname, u.lastname].filter(Boolean).join(' ')}</span>{/if}</span>
                        <span class="flex flex-wrap gap-1">
                            <span class="badge badge-{u.role === 'admin' ? 'brand' : u.role === 'editor' ? 'info' : ''}">{t(`siteusers.role.${u.role}` as MessageKey)}</span>
                            {#if u.disabled}<span class="badge badge-danger">{t('users.badge.disabled')}</span>{/if}
                        </span>
                    </div>
                    {#if data.canWrite}
                        <details class="mt-2">
                            <summary class="cursor-pointer text-sm font-semibold">{t('users.manage')}<span class="sr-only"> {u.email}</span></summary>
                            <div class="mt-3 flex flex-wrap items-end gap-4 rounded-xl bg-surface-2 p-3">
                                <form method="POST" action="?/role" use:enhance class="flex items-end gap-2">
                                    <input type="hidden" name="csrf" value={data.csrf} /><input type="hidden" name="user" value={u.id} />
                                    <div class="field"><label for={'role-' + u.id} class="text-xs font-semibold">{t('siteusers.col.role')}</label>
                                        <select id={'role-' + u.id} name="role" value={u.role}><option value="user">{t('siteusers.role.user')}</option><option value="editor">{t('siteusers.role.editor')}</option><option value="admin">{t('siteusers.role.admin')}</option></select></div>
                                    <button class="btn btn-secondary btn-sm">{t('siteusers.role.save')}</button>
                                </form>
                                <form method="POST" action={u.disabled ? '?/enable' : '?/disable'} use:enhance={u.disabled ? undefined : confirmIt(t('users.action.disableConfirm'))}>
                                    <input type="hidden" name="csrf" value={data.csrf} /><input type="hidden" name="user" value={u.id} />
                                    <button class="btn btn-sm {u.disabled ? 'btn-secondary' : 'btn-danger'}">{u.disabled ? t('users.action.enable') : t('users.action.disable')}</button>
                                </form>
                                {#if !u.disabled}
                                    <form method="POST" action="?/reset" use:enhance>
                                        <input type="hidden" name="csrf" value={data.csrf} /><input type="hidden" name="user" value={u.id} /><input type="hidden" name="email" value={u.email} />
                                        <button class="btn btn-secondary btn-sm">{t('siteusers.reset.submit')}</button>
                                    </form>
                                {/if}
                            </div>
                        </details>
                    {/if}
                </li>
            {/each}
        </ul>
        {#if data.page.totalPages > 1}<Pager page={data.page.page} totalPages={data.page.totalPages} href={(n) => href({ page: n })} />{/if}
    {:else}<p class="text-sm text-muted">{t('users.list.empty')}</p>{/if}
{/if}
