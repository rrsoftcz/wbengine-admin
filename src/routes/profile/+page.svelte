<script lang="ts">
    import { enhance } from '$app/forms';
    import { page } from '$app/state';
    import { t, intl } from '#lib/i18n/client.ts';
    import FormAlert from '#lib/components/auth/FormAlert.svelte';
    import PasswordField from '#lib/components/auth/PasswordField.svelte';
    import SubmitButton from '#lib/components/auth/SubmitButton.svelte';
    import BackupCodes from '#lib/components/auth/BackupCodes.svelte';
    import type { MessageKey } from '#lib/i18n/index.ts';
    let { data, form } = $props();
    let pending = $state('');
    const info = $derived(data.info);
    const when = (value: string | null) => (value ? new Intl.DateTimeFormat(intl(), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Prague' }).format(new Date(value.replace(' ', 'T') + 'Z')) : '');
    const eventLabel = (event: string) => t((`profile.event.${event}` in page.data.messages ? `profile.event.${event}` : 'profile.event.other') as MessageKey);
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

    <section class="card" aria-labelledby="p-activity">
        <h2 id="p-activity" class="mb-4">{t('profile.activity.heading')}</h2>
        {#if info.activity.length}
            <ul class="m-0 grid list-none gap-2 p-0 text-sm">{#each info.activity as a}<li class="flex justify-between gap-4"><span>{eventLabel(a.event)}</span><span class="text-muted">{when(a.at)}</span></li>{/each}</ul>
        {:else}<p class="text-sm text-muted">{t('profile.activity.empty')}</p>{/if}
    </section>
</div>
