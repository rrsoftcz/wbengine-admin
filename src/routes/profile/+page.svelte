<script lang="ts">
    import { enhance } from '$app/forms';
    import { page } from '$app/state';
    import { t, intl } from '#lib/i18n/client.ts';
    import FormAlert from '#lib/components/auth/FormAlert.svelte';
    import PasswordField from '#lib/components/auth/PasswordField.svelte';
    import SubmitButton from '#lib/components/auth/SubmitButton.svelte';
    import BackupCodes from '#lib/components/auth/BackupCodes.svelte';
    import Pager from '#lib/components/content/Pager.svelte';
    import { activityCategories, activityCategory, type ActivityCategory } from '#lib/activity.ts';
    import type { MessageKey } from '#lib/i18n/index.ts';
    let { data, form } = $props();
    let pending = $state('');
    const info = $derived(data.info);
    const when = (value: string | null) => (value ? new Intl.DateTimeFormat(intl(), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Prague' }).format(new Date(value.replace(' ', 'T') + 'Z')) : '');
    const act = $derived(data.activity);
    const eventLabel = (event: string) => {
        const key = `profile.event.${event.split(':')[0]}`;
        return t((key in page.data.uiMessages ? key : 'profile.event.other') as MessageKey);
    };
    const categoryTone = { signin: 'brand', account: 'warn', sites: 'ok', other: 'brand' } as const;
    const activityHref = (category: ActivityCategory | null, n: number) => {
        const q = new URLSearchParams();
        if (category) q.set('activity', category);
        if (n > 1) q.set('activityPage', String(n));
        return `?${q}#activity`;
    };
    // Entries grouped by calendar day (Europe/Prague), with Today and Yesterday named by the language.
    const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' }).format(d);
    const groups = $derived.by(() => {
        const out: { key: string; label: string; entries: (typeof act.items[number] & { iso: string; time: string })[] }[] = [];
        const today = new Date(), rel = new Intl.RelativeTimeFormat(intl(), { numeric: 'auto' });
        for (const a of act.items) {
            const d = new Date(a.at.replace(' ', 'T') + 'Z'), key = dayKey(d);
            let g = out.find((x) => x.key === key);
            if (!g) {
                const days = Math.round((Date.parse(dayKey(today)) - Date.parse(key)) / 86400000);
                const label = days === 0 || days === 1 ? rel.format(-days, 'day') : new Intl.DateTimeFormat(intl(), { dateStyle: 'full', timeZone: 'Europe/Prague' }).format(d);
                g = { key, label: label.charAt(0).toUpperCase() + label.slice(1), entries: [] };
                out.push(g);
            }
            g.entries.push({ ...a, iso: d.toISOString(), time: new Intl.DateTimeFormat(intl(), { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague' }).format(d) });
        }
        return out;
    });
    const run = (name: string) => () => { pending = name; return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => { pending = ''; await update({ reset: true }); }; };
    const mine = (section: string) => (form && 'section' in form && form.section === section ? form : null);
</script>

<svelte:head><title>{t('profile.title')} | WBengine</title></svelte:head>

<h1>{t('profile.title')}</h1>
<p class="lead mb-6 mt-2">{t('profile.lead')}</p>

<div class="grid gap-6">
    <section class="card" aria-labelledby="p-account">
        <h2 id="p-account" class="mb-4">{t('profile.account.heading')}</h2>
        <dl class="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt class="text-muted">{t('profile.account.email')}</dt><dd class="m-0 font-semibold">{info.email}</dd></div>
            <div><dt class="text-muted">{t('profile.account.role')}</dt><dd class="m-0 font-semibold">{info.globalAdmin ? t('profile.account.globalAdmin') : t('profile.account.member')}</dd></div>
            <div><dt class="text-muted">{t('profile.account.created')}</dt><dd class="m-0">{when(info.createdAt)}</dd></div>
            <div><dt class="text-muted">{t('profile.account.passwordChanged')}</dt><dd class="m-0">{info.passwordChangedAt ? when(info.passwordChangedAt) : t('profile.account.never')}</dd></div>
            <div class="sm:col-span-2"><dt class="text-muted">{t('profile.account.sites')}</dt>
                <dd class="m-0">
                    {#if info.grants.length}
                        <ul class="m-0 list-none p-0">{#each info.grants as g}<li>{g.site}: {t(`profile.role.${g.role}` as MessageKey)}</li>{/each}</ul>
                    {:else}{info.globalAdmin ? t('profile.account.globalAdmin') : t('profile.account.noSites')}{/if}
                </dd>
            </div>
        </dl>
    </section>

    <section class="card" aria-labelledby="p-language">
        <h2 id="p-language" class="mb-2">{t('profile.language.heading')}</h2>
        <p class="hint mb-4">{t('profile.language.hint')}</p>
        {#if page.url.searchParams.get('saved') === 'language'}<p class="alert alert-ok mb-4" role="status">{t('profile.language.saved')}</p>{/if}
        <FormAlert message={mine('language')?.error} />
        <form method="POST" action="?/language" use:enhance={run('language')} class="grid gap-4 sm:max-w-sm">
            <input type="hidden" name="csrf" value={data.csrf} />
            <div class="field">
                <label for="locale" class="text-sm font-semibold">{t('profile.language.label')}</label>
                <select id="locale" name="locale" value={data.locale ?? ''}>
                    <option value="">{t('profile.language.auto')}</option>
                    {#each data.languages as l}<option value={l.value}>{l.name}</option>{/each}
                </select>
            </div>
            <SubmitButton pending={pending === 'language'} label={t('profile.language.save')} pendingLabel={t('profile.password.pending')} block={false} />
        </form>
    </section>

    <section class="card" aria-labelledby="p-password">
        <h2 id="p-password" class="mb-2">{t('profile.password.heading')}</h2>
        <p class="hint mb-4">{t('profile.password.hint')}</p>
        <FormAlert message={mine('password')?.error} />
        {#if mine('password')?.ok}<p class="alert alert-ok mb-4" role="status">{mine('password')?.ok}</p>{/if}
        <form method="POST" action="?/password" use:enhance={run('password')} class="grid gap-4 sm:max-w-sm">
            <input type="hidden" name="csrf" value={data.csrf} />
            <PasswordField id="current" name="current" label={t('profile.password.current')} autocomplete="current-password" />
            <PasswordField id="next" name="next" label={t('profile.password.next')} hint={t('profile.password.nextHint')} autocomplete="new-password" minlength={14} showMeter />
            <PasswordField id="confirm" name="confirm" label={t('profile.password.confirm')} autocomplete="new-password" minlength={14} />
            <SubmitButton pending={pending === 'password'} label={t('profile.password.submit')} pendingLabel={t('profile.password.pending')} block={false} />
        </form>
    </section>

    <section class="card" aria-labelledby="p-mfa">
        <h2 id="p-mfa" class="mb-2">{t('profile.mfa.heading')}</h2>
        <p class="mb-4 text-sm"><strong>{info.mfaEnabled ? t('profile.mfa.on') : t('profile.mfa.off')}</strong>
            {#if info.mfaEnabled} &middot; {t('profile.mfa.codesLeft', { count: info.backupCodesLeft })}{/if}</p>
        <FormAlert message={mine('codes')?.error ?? mine('mfa')?.error} />
        {#if mine('codes')?.codes}
            <h3 class="mb-2">{t('profile.mfa.codesNew')}</h3>
            <BackupCodes codes={mine('codes')?.codes ?? []} />
        {:else}
            <h3 class="mb-1">{t('profile.mfa.codesHeading')}</h3>
            <p class="hint mb-3">{t('profile.mfa.codesHint')}</p>
            <form method="POST" action="?/codes" use:enhance={run('codes')} class="mb-6 grid gap-4 sm:max-w-sm">
                <input type="hidden" name="csrf" value={data.csrf} />
                <PasswordField id="codes-current" name="current" label={t('profile.mfa.confirmPassword')} autocomplete="current-password" />
                <SubmitButton pending={pending === 'codes'} variant="secondary" label={t('profile.mfa.codesSubmit')} pendingLabel={t('profile.password.pending')} block={false} />
            </form>
        {/if}
        <h3 class="mb-1">{t('profile.mfa.resetHeading')}</h3>
        <p class="hint mb-3">{t('profile.mfa.resetHint')}</p>
        <form method="POST" action="?/resetMfa" use:enhance={run('mfa')} class="grid gap-4 sm:max-w-sm">
            <input type="hidden" name="csrf" value={data.csrf} />
            <PasswordField id="mfa-current" name="current" label={t('profile.mfa.confirmPassword')} autocomplete="current-password" />
            <SubmitButton pending={pending === 'mfa'} variant="secondary" label={t('profile.mfa.resetSubmit')} pendingLabel={t('profile.password.pending')} block={false} />
        </form>
    </section>

    <section class="card" aria-labelledby="p-activity" id="activity">
        <h2 id="p-activity" class="mb-1">{t('profile.activity.heading')}</h2>
        <p class="hint mb-4">{t('profile.activity.hint')}</p>
        <nav class="mb-4 flex flex-wrap gap-2" aria-label={t('profile.activity.filterLabel')}>
            {#each [null, ...activityCategories] as c}
                <a href={activityHref(c, 1)} data-sveltekit-noscroll aria-current={act.category === c ? 'true' : undefined}
                   class="btn btn-sm {act.category === c ? 'btn-primary' : 'btn-secondary'}">{t(c ? (`profile.activity.category.${c}` as MessageKey) : 'profile.activity.category.all')}</a>
            {/each}
        </nav>
        {#if groups.length}
            <p class="mb-3 text-sm text-muted" aria-live="polite">{t('profile.activity.range', { from: (act.page - 1) * act.perPage + 1, to: (act.page - 1) * act.perPage + act.items.length, total: act.total })}</p>
            {#each groups as group}
                <h3 class="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-muted first:mt-0">{group.label}</h3>
                <ul class="m-0 list-none divide-y divide-line rounded-xl border border-line p-0">
                    {#each group.entries as a}
                        <li class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
                            <time class="w-12 shrink-0 tabular-nums text-muted" datetime={a.iso}>{a.time}</time>
                            <span class="min-w-0 flex-1">
                                <span class="font-medium">{eventLabel(a.event)}</span>
                                {#if a.site}<span class="text-muted"> &middot; {a.site}</span>{/if}
                            </span>
                            <span class="badge badge-{categoryTone[activityCategory(a.event)]}">{t(`profile.activity.category.${activityCategory(a.event)}` as MessageKey)}</span>
                        </li>
                    {/each}
                </ul>
            {/each}
            {#if act.totalPages > 1}<Pager page={act.page} totalPages={act.totalPages} href={(n) => activityHref(act.category, n)} />{/if}
        {:else}<p class="text-sm text-muted">{act.category ? t('profile.activity.emptyFiltered') : t('profile.activity.empty')}</p>{/if}
    </section>
</div>
