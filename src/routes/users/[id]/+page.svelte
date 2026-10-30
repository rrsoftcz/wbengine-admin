<script lang="ts">
    import { enhance } from '$app/forms';
    import { page } from '$app/state';
    import { t, intl } from '#lib/i18n/client.ts';
    import type { MessageKey } from '#lib/i18n/index.ts';
    import FormAlert from '#lib/components/auth/FormAlert.svelte';
    import CopyButton from '#lib/components/auth/CopyButton.svelte';
    let { data, form } = $props();
    const u = $derived(data.user);
    const recovery = $derived(form && 'recovery' in form ? (form.recovery as { email: string; token: string }) : null);
    const when = (value: string | null) => (value ? new Intl.DateTimeFormat(intl(), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Prague' }).format(new Date(value.replace(' ', 'T') + 'Z')) : t('users.never'));
    const eventLabel = (event: string) => { const key = `profile.event.${event.split(':')[0]}`; return t((key in page.data.uiMessages ? key : 'profile.event.other') as MessageKey); };
    const confirmIt = (message: string) => ({ cancel }: { cancel: () => void }) => { if (!confirm(message)) cancel(); };
</script>

<svelte:head><title>{u.email} | {t('users.title')} | WBengine</title></svelte:head>

<nav class="mb-4 text-sm" aria-label={t('content.breadcrumb.label')}><a href="/users">{t('users.title')}</a></nav>
<h1 class="break-all">{u.email}</h1>
<p class="mt-2 flex flex-wrap gap-1">
    {#if u.disabled}<span class="badge badge-danger">{t('users.badge.disabled')}</span>{/if}
    <span class="badge badge-{u.globalAdmin ? 'brand' : ''}">{u.globalAdmin ? t('users.badge.global') : t('users.badge.member')}</span>
    <span class="badge badge-{u.mfaEnabled ? 'ok' : 'warn'}">{u.mfaEnabled ? t('users.badge.mfaOn') : t('users.badge.mfaOff')}</span>
</p>

<div class="mt-6 grid gap-6">
    {#if form && 'error' in form && form.error}<FormAlert message={form.error} />{/if}
    {#if form && 'done' in form && form.done}<p class="alert alert-ok" role="status">{form.done}</p>{/if}
    {#if recovery}
        <div class="alert alert-warn" role="status">
            <p class="m-0 font-semibold">{t('users.recovery.created', { email: recovery.email })}</p>
            <p class="my-2 text-sm">{t('users.recovery.hint')}</p>
            <code class="block break-all rounded-lg bg-surface-2 p-3 text-sm text-text" data-secret>{recovery.token}</code>
            <div class="mt-3"><CopyButton text={recovery.token} /></div>
        </div>
    {/if}

    <section class="card" aria-labelledby="d-info">
        <h2 id="d-info" class="mb-4">{t('users.detail.info')}</h2>
        <dl class="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt class="text-muted">{t('users.detail.created')}</dt><dd class="m-0">{when(u.createdAt)}</dd></div>
            <div><dt class="text-muted">{t('users.col.lastSignIn')}</dt><dd class="m-0">{when(u.lastSignIn)}</dd></div>
            <div><dt class="text-muted">{t('profile.account.passwordChanged')}</dt><dd class="m-0">{u.passwordChangedAt ? when(u.passwordChangedAt) : t('profile.account.never')}</dd></div>
            <div><dt class="text-muted">{t('users.detail.backupCodes')}</dt><dd class="m-0">{u.mfaEnabled ? t('profile.mfa.codesLeft', { count: u.backupCodesLeft }) : t('users.badge.mfaOff')}</dd></div>
        </dl>
    </section>

    <section class="card" aria-labelledby="d-sites">
        <h2 id="d-sites" class="mb-2">{t('users.detail.sites')}</h2>
        {#if u.globalAdmin}<p class="text-sm text-muted">{t('users.allSites')}</p>
        {:else if u.grants.length}
            <ul class="m-0 list-none divide-y divide-line rounded-xl border border-line p-0">
                {#each u.grants as g}
                    <li class="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-sm">
                        <span><span class="font-medium">{g.site}</span> <span class="text-muted">&middot; {t(`users.role.${g.role}` as MessageKey)}</span></span>
                        <form method="POST" action="?/revoke" use:enhance={confirmIt(t('users.revoke.confirm', { site: g.site }))}>
                            <input type="hidden" name="csrf" value={data.csrf} /><input type="hidden" name="site" value={g.siteId} />
                            <button class="btn btn-danger btn-sm">{t('users.revoke.submit')}<span class="sr-only"> {g.site}</span></button>
                        </form>
                    </li>
                {/each}
            </ul>
        {:else}<p class="text-sm text-muted">{t('users.detail.noSites')}</p>{/if}
        {#if !u.globalAdmin}<p class="hint mt-3">{t('users.detail.grantHint')} <a href="/sites#opravneni">{t('users.detail.grantLink')}</a></p>{/if}
    </section>

    <section class="card" aria-labelledby="d-actions">
        <h2 id="d-actions" class="mb-4">{t('users.detail.actions')}</h2>
        <div class="grid gap-5">
            {#if !data.self}
                <div>
                    <h3 class="mb-1">{u.globalAdmin ? t('users.action.demoteHeading') : t('users.action.promoteHeading')}</h3>
                    <p class="hint mb-2">{u.globalAdmin ? t('users.action.demoteHint') : t('users.action.promoteHint')}</p>
                    <form method="POST" action={u.globalAdmin ? '?/demote' : '?/promote'} use:enhance={confirmIt(u.globalAdmin ? t('users.action.demoteConfirm') : t('users.action.promoteConfirm'))}>
                        <input type="hidden" name="csrf" value={data.csrf} />
                        <button class="btn btn-secondary btn-sm">{u.globalAdmin ? t('users.action.demote') : t('users.action.promote')}</button>
                    </form>
                </div>
                <div>
                    <h3 class="mb-1">{u.disabled ? t('users.action.enableHeading') : t('users.action.disableHeading')}</h3>
                    <p class="hint mb-2">{u.disabled ? t('users.action.enableHint') : t('users.action.disableHint')}</p>
                    <form method="POST" action={u.disabled ? '?/enable' : '?/disable'} use:enhance={u.disabled ? undefined : confirmIt(t('users.action.disableConfirm'))}>
                        <input type="hidden" name="csrf" value={data.csrf} />
                        <button class="btn {u.disabled ? 'btn-secondary' : 'btn-danger'} btn-sm">{u.disabled ? t('users.action.enable') : t('users.action.disable')}</button>
                    </form>
                </div>
            {:else}<p class="hint">{t('users.action.selfHint')} <a href="/profile">{t('app.shell.profile')}</a></p>{/if}
            {#if !u.disabled}
                <div>
                    <h3 class="mb-1">{t('users.action.recoveryHeading')}</h3>
                    <p class="hint mb-2">{t('users.action.recoveryHint')}</p>
                    <form method="POST" action="?/recovery" use:enhance>
                        <input type="hidden" name="csrf" value={data.csrf} />
                        <button class="btn btn-secondary btn-sm">{t('users.action.recovery')}</button>
                    </form>
                </div>
            {/if}
            {#if !data.self}
                <div>
                    <h3 class="mb-1">{t('users.action.mfaHeading')}</h3>
                    <p class="hint mb-2">{t('users.action.mfaHint')}</p>
                    <form method="POST" action="?/resetMfa" use:enhance={confirmIt(t('users.action.mfaConfirm'))}>
                        <input type="hidden" name="csrf" value={data.csrf} />
                        <button class="btn btn-secondary btn-sm">{t('users.action.mfa')}</button>
                    </form>
                </div>
            {/if}
        </div>
    </section>

    <section class="card" aria-labelledby="d-activity">
        <h2 id="d-activity" class="mb-4">{t('profile.activity.heading')}</h2>
        {#if data.activity.length}
            <ul class="m-0 list-none divide-y divide-line rounded-xl border border-line p-0 text-sm">
                {#each data.activity as a}<li class="flex flex-wrap justify-between gap-x-4 px-3 py-2"><span>{eventLabel(a.event)}{#if a.site}<span class="text-muted"> &middot; {a.site}</span>{/if}</span><span class="text-muted">{when(a.at)}</span></li>{/each}
            </ul>
        {:else}<p class="text-sm text-muted">{t('profile.activity.empty')}</p>{/if}
    </section>
</div>
