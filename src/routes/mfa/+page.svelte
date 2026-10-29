<script lang="ts">
    import { enhance } from '$app/forms';
    import { page } from '$app/state';
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

<svelte:head><title>Code verification | WBengine</title></svelte:head>

<div class="card">
    {#if form?.codes}
        <h1>Done, verification is on</h1>
        <p class="lead mb-5 mt-2">Last step: save your backup codes. They help you sign in if you lose your phone.</p>
        <BackupCodes codes={form.codes} />
    {:else}
        {#if data.enrollment && !setup}
            <p class="eyebrow">Account security</p>
            <h1 class="mt-1">Turn on verification with a phone code</h1>
            <p class="lead mb-6 mt-2">Each time you sign in, you will enter a six-digit code from the app in addition to your password. Setup takes about a minute.</p>
            <form method="POST" action="?/enroll" use:enhance={authEnhance((v) => (pendingEnroll = v))}>
                <input type="hidden" name="csrf" value={data.csrf}/>
                <FormAlert message={form?.error} />
                <SubmitButton pending={pendingEnroll} label="Start setup" pendingLabel="Preparing..." />
            </form>
        {:else if setup}
            <p class="eyebrow">Account security</p>
            <h1 class="mt-1">Set up verification in 3 steps</h1>
            <ol class="mb-6 mt-5 grid gap-5">
                <li class="flex gap-3">
                    <span class="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand" aria-hidden="true">1</span>
                    <div><h2>Install an app</h2><p class="hint mt-1">Install an authenticator app on your phone, for example Google Authenticator, Microsoft Authenticator or Aegis.</p></div>
                </li>
                <li class="flex gap-3">
                    <span class="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand" aria-hidden="true">2</span>
                    <div class="min-w-0 grid gap-3">
                        <div><h2>Add the WBengine account</h2><p class="hint mt-1">In the app, choose to add an account and scan the QR code. On your phone you can also <a href={uri}>open the link directly in the app</a>.</p></div>
                        <QrCode value={uri} />
                        <div>
                            <p class="label">Or type the secret key manually</p>
                            <p class="mt-1 break-words rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-base tracking-wider" aria-label="Secret key, groups of four characters">{groups}</p>
                            <div class="mt-2"><CopyButton text={secret ?? ''} label="Copy key" doneLabel="Key copied" /></div>
                            <p class="hint mt-2">Account type: time-based (TOTP), 6 digits, 30 seconds. Do not share the key with anyone.</p>
                        </div>
                    </div>
                </li>
                <li class="flex gap-3">
                    <span class="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand" aria-hidden="true">3</span>
                    <div><h2>Confirm the code</h2><p class="hint mt-1">Type the six-digit code the app is showing right now.</p></div>
                </li>
            </ol>
        {:else}
            <h1>Code verification</h1>
            <p class="lead mb-6 mt-2">{backup ? 'Enter one of your backup codes. Each can be used only once.' : 'Open the authenticator app on your phone and type the six-digit code for WBengine.'}</p>
        {/if}

        {#if !(data.enrollment && !setup)}
            <FormAlert message={form?.error} />
        {/if}
        <form method="POST" action="?/verify" hidden={data.enrollment && !setup} use:enhance={authEnhance((v) => (pendingVerify = v))} class="grid gap-4">
            <input type="hidden" name="csrf" value={data.csrf}/>
            <div class="field">
                <label for="code" class="text-sm font-semibold">{backup ? 'Backup code' : 'Code from the app'}</label>
                {#if backup}
                    <input id="code" name="code" required maxlength="128" autocomplete="off" autocapitalize="off" spellcheck="false" data-secret class="font-mono" />
                {:else}
                    <input id="code" name="code" bind:this={codeInput} required inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{'{'}6{'}'}" maxlength="6" data-secret
                           placeholder="000000" class="text-center font-mono text-3xl tracking-[.5em]" oninput={onCode} />
                {/if}
            </div>
            <SubmitButton pending={pendingVerify} label="Verify" pendingLabel="Verifying..." />
        </form>
        {#if !data.enrollment}
            <p class="mt-5 text-center text-sm text-muted">
                {#if backup}<a href="?" onclick={(e) => { e.preventDefault(); backup = false; }}>Use the app code</a>
                {:else}Don't have your phone at hand? <a href="?zaloha=1" onclick={(e) => { e.preventDefault(); backup = true; }}>Use a backup code</a>{/if}
            </p>
        {/if}
    {/if}
</div>
