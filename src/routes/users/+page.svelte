<script lang="ts">
    import { enhance } from '$app/forms';
    import { t, intl } from '#lib/i18n/client.ts';
    import FormAlert from '#lib/components/auth/FormAlert.svelte';
    import CopyButton from '#lib/components/auth/CopyButton.svelte';
    import SubmitButton from '#lib/components/auth/SubmitButton.svelte';
    import Pager from '#lib/components/content/Pager.svelte';
    let { data, form } = $props();
    let pending = $state(false), level = $state('member');
    const when = (value: string | null) => (value ? new Intl.DateTimeFormat(intl(), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Prague' }).format(new Date(value.replace(' ', 'T') + 'Z')) : t('users.never'));
    const href = (n: number) => { const q = new URLSearchParams(); if (data.search) q.set('q', data.search); if (n > 1) q.set('page', String(n)); const s = q.toString(); return s ? `?${s}` : '?'; };
</script>

<svelte:head><title>{t('users.title')} | WBengine</title></svelte:head>

<h1>{t('users.title')}</h1>
<p class="lead mb-6 mt-2">{t('users.lead')}</p>

<section class="card mb-6" aria-labelledby="invite-h">
    <h2 id="invite-h" class="mb-2">{t('users.invite.heading')}</h2>
    <p class="hint mb-4">{t('users.invite.hint')}</p>
    <FormAlert message={form && 'error' in form ? form.error : null} />
    {#if form && 'invited' in form && form.invited}
        <div class="alert alert-ok mb-4" role="status">
            <p class="m-0 font-semibold">{t('users.invite.created', { email: form.invited.email })}</p>
            <p class="my-2 text-sm">{t('users.invite.tokenHint')}</p>
            <code class="block break-all rounded-lg bg-surface-2 p-3 text-sm text-text" data-secret>{form.invited.token}</code>
            <div class="mt-3"><CopyButton text={form.invited.token} /></div>
        </div>
    {/if}
    <form method="POST" action="?/invite" use:enhance={() => { pending = true; return async ({ update }) => { pending = false; await update({ reset: true }); }; }} class="grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="csrf" value={data.csrf} />
        <div class="field sm:col-span-2">
            <label for="i-email" class="text-sm font-semibold">{t('users.invite.email')}</label>
            <input id="i-email" name="email" type="email" required autocomplete="off" autocapitalize="off" spellcheck="false" />
        </div>
        <div class="field">
            <label for="i-level" class="text-sm font-semibold">{t('users.invite.level')}</label>
            <select id="i-level" name="level" bind:value={level}>
                <option value="member">{t('users.invite.levelMember')}</option>
                <option value="global">{t('users.invite.levelGlobal')}</option>
            </select>
        </div>
        {#if level === 'member'}
            <div class="field">
                <label for="i-site" class="text-sm font-semibold">{t('users.invite.site')}</label>
                <select id="i-site" name="site">
                    <option value="">{t('users.invite.noSite')}</option>
                    {#each data.sites as s}<option value={s.id}>{s.name}</option>{/each}
                </select>
            </div>
            <div class="field">
                <label for="i-role" class="text-sm font-semibold">{t('users.invite.role')}</label>
                <select id="i-role" name="role">
                    <option value="editor">{t('users.role.editor')}</option>
                    <option value="siteadmin">{t('users.role.siteadmin')}</option>
                </select>
            </div>
        {:else}
            <input type="hidden" name="site" value="" /><input type="hidden" name="role" value="" />
        {/if}
        <div class="sm:col-span-2"><SubmitButton {pending} label={t('users.invite.submit')} pendingLabel={t('users.invite.pending')} block={false} /></div>
    </form>
</section>

<section aria-labelledby="list-h">
    <h2 id="list-h" class="mb-3">{t('users.list.heading')}</h2>
    <form method="GET" class="mb-4 flex flex-wrap items-end gap-3">
        <div class="field w-72 max-w-full">
            <label for="q" class="text-sm font-semibold">{t('users.search.label')}</label>
            <input id="q" name="q" type="search" value={data.search} maxlength="100" autocomplete="off" />
        </div>
        <button class="btn btn-secondary">{t('users.search.submit')}</button>
        {#if data.search}<a class="btn btn-ghost" href="?">{t('users.search.reset')}</a>{/if}
    </form>
    {#if data.users.length}
        <p class="mb-3 text-sm text-muted" aria-live="polite">{t('users.list.range', { from: (data.page - 1) * 25 + 1, to: (data.page - 1) * 25 + data.users.length, total: data.total })}</p>
        <div class="overflow-x-auto rounded-xl border border-line">
            <table class="w-full text-left text-sm">
                <thead class="bg-surface-2 text-xs uppercase tracking-wide text-muted"><tr>
                    <th scope="col" class="px-3 py-2 font-semibold">{t('users.col.user')}</th>
                    <th scope="col" class="px-3 py-2 font-semibold">{t('users.col.status')}</th>
                    <th scope="col" class="px-3 py-2 font-semibold">{t('users.col.sites')}</th>
                    <th scope="col" class="px-3 py-2 font-semibold">{t('users.col.lastSignIn')}</th>
                    <th scope="col" class="px-3 py-2"><span class="sr-only">{t('users.col.manage')}</span></th>
                </tr></thead>
                <tbody class="divide-y divide-line">
                    {#each data.users as u (u.id)}
                        <tr>
                            <td class="px-3 py-2 font-medium">{u.email}</td>
                            <td class="px-3 py-2"><span class="flex flex-wrap gap-1">
                                {#if u.disabled}<span class="badge badge-danger">{t('users.badge.disabled')}</span>{/if}
                                <span class="badge badge-{u.globalAdmin ? 'brand' : ''}">{u.globalAdmin ? t('users.badge.global') : t('users.badge.member')}</span>
                                <span class="badge badge-{u.mfaEnabled ? 'ok' : 'warn'}">{u.mfaEnabled ? t('users.badge.mfaOn') : t('users.badge.mfaOff')}</span>
                            </span></td>
                            <td class="px-3 py-2 tabular-nums">{u.globalAdmin ? t('users.allSites') : u.sites}</td>
                            <td class="whitespace-nowrap px-3 py-2 text-muted">{when(u.lastSignIn)}</td>
                            <td class="px-3 py-2 text-right"><a class="btn btn-secondary btn-sm" href={'/users/' + u.id}>{t('users.manage')}<span class="sr-only"> {u.email}</span></a></td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
        {#if data.totalPages > 1}<Pager page={data.page} totalPages={data.totalPages} {href} />{/if}
    {:else}<p class="text-sm text-muted">{t('users.list.empty')}</p>{/if}
</section>
