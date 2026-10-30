<script lang="ts">
    import { enhance } from '$app/forms';
    import { page } from '$app/state';
    import { t } from '#lib/i18n/client.ts';
    import { authEnhance } from '#lib/components/auth/enhance.ts';
    import BackupCodes from '#lib/components/auth/BackupCodes.svelte';
    import CopyButton from '#lib/components/auth/CopyButton.svelte';
    import FormAlert from '#lib/components/auth/FormAlert.svelte';
    import QrCode from '#lib/components/auth/QrCode.svelte';
    import SubmitButton from '#lib/components/auth/SubmitButton.svelte';
    let { data, form } = $props();
    let pendingEnroll = $state(false), pendingVerify = $state(false);
    let backup = $state(page.url.searchParams.has('zaloha'));
    let kept = $state<string | undefined>();
    $effect(() => { if (form?.secret) kept = form.secret; });
    // The key stays on screen after a wrong code, otherwise the person would have to start over.
    const secret = $derived(form?.secret ?? kept);
    const groups = $derived(secret ? (secret.match(/.{1,4}/g) ?? []).join(' ') : '');
    const uri = $derived(secret ? `otpauth://totp/WBengine:${encodeURIComponent(data.email)}?secret=${encodeURIComponent(secret)}&issuer=WBengine&algorithm=SHA1&digits=6&period=30` : '');
    const setup = $derived(data.enrollment && !!secret);
    let codeInput = $state<HTMLInputElement>();
    function onCode(e: Event & { currentTarget: HTMLInputElement }) {
        const el = e.currentTarget;
        if (!backup && /^\d{6}$/.test(el.value)) el.form?.requestSubmit();
    }
</script>

<svelte:head><title>{t('auth.mfa.pageTitle')}</title></svelte:head>

<div class="card">
    {#if form?.codes}
        <h1>{t('auth.mfa.doneTitle')}</h1>
        <p class="lead mb-5 mt-2">{t('auth.mfa.doneLead')}</p>
        <BackupCodes codes={form.codes} />
    {:else}
        {#if data.enrollment && !setup}
            <p class="eyebrow">{t('auth.mfa.eyebrow')}</p>
            <h1 class="mt-1">{t('auth.mfa.enrollTitle')}</h1>
            <p class="lead mb-6 mt-2">{t('auth.mfa.enrollLead')}</p>
            <form method="POST" action="?/enroll" use:enhance={authEnhance((v) => (pendingEnroll = v))}>
                <input type="hidden" name="csrf" value={data.csrf}/>
                <FormAlert message={form?.error} />
                <SubmitButton pending={pendingEnroll} label={t('auth.mfa.startSetup')} pendingLabel={t('auth.mfa.preparing')} />
            </form>
        {:else if setup}
            <p class="eyebrow">{t('auth.mfa.eyebrow')}</p>
            <h1 class="mt-1">{t('auth.mfa.setupTitle')}</h1>
            <ol class="mb-6 mt-5 grid gap-5">
                <li class="flex gap-3">
                    <span class="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand" aria-hidden="true">1</span>
                    <div><h2>{t('auth.mfa.step1Title')}</h2><p class="hint mt-1">{t('auth.mfa.step1Hint')}</p></div>
                </li>
                <li class="flex gap-3">
                    <span class="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand" aria-hidden="true">2</span>
                    <div class="min-w-0 grid gap-3">
                        <div><h2>{t('auth.mfa.step2Title')}</h2><p class="hint mt-1">{t('auth.mfa.step2HintBefore')} <a href={uri}>{t('auth.mfa.step2HintLink')}</a>.</p></div>
                        <QrCode value={uri} />
                        <div>
                            <p class="label">{t('auth.mfa.manualKey')}</p>
                            <p class="mt-1 break-words rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-base tracking-wider" aria-label={t('auth.mfa.secretKeyAria')}>{groups}</p>
                            <div class="mt-2"><CopyButton text={secret ?? ''} label={t('auth.mfa.copyKey')} doneLabel={t('auth.mfa.keyCopied')} /></div>
                            <p class="hint mt-2">{t('auth.mfa.accountType')}</p>
                        </div>
                    </div>
                </li>
                <li class="flex gap-3">
                    <span class="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand" aria-hidden="true">3</span>
                    <div><h2>{t('auth.mfa.step3Title')}</h2><p class="hint mt-1">{t('auth.mfa.step3Hint')}</p></div>
                </li>
            </ol>
        {:else}
            <h1>{t('auth.mfa.title')}</h1>
            <p class="lead mb-6 mt-2">{backup ? t('auth.mfa.leadBackup') : t('auth.mfa.leadApp')}</p>
        {/if}

        {#if !(data.enrollment && !setup)}
            <FormAlert message={form?.error} />
        {/if}
        <form method="POST" action="?/verify" hidden={data.enrollment && !setup} use:enhance={authEnhance((v) => (pendingVerify = v))} class="grid gap-4">
            <input type="hidden" name="csrf" value={data.csrf}/>
            <div class="field">
                <label for="code" class="text-sm font-semibold">{backup ? t('auth.mfa.backupCodeLabel') : t('auth.mfa.appCodeLabel')}</label>
                {#if backup}
                    <input id="code" name="code" required maxlength="128" autocomplete="off" autocapitalize="off" spellcheck="false" data-secret class="font-mono" />
                {:else}
                    <input id="code" name="code" bind:this={codeInput} required inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{'{'}6{'}'}" maxlength="6" data-secret
                           placeholder="000000" class="text-center font-mono text-3xl tracking-[.5em]" oninput={onCode} />
                {/if}
            </div>
            <SubmitButton pending={pendingVerify} label={t('auth.mfa.verify')} pendingLabel={t('auth.mfa.verifying')} />
        </form>
        {#if !data.enrollment}
            <p class="mt-5 text-center text-sm text-muted">
                {#if backup}<a href="?" onclick={(e) => { e.preventDefault(); backup = false; }}>{t('auth.mfa.useAppCode')}</a>
                {:else}{t('auth.mfa.noPhone')} <a href="?zaloha=1" onclick={(e) => { e.preventDefault(); backup = true; }}>{t('auth.mfa.useBackupCode')}</a>{/if}
            </p>
        {/if}
    {/if}
</div>
