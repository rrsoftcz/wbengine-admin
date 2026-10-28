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

<svelte:head><title>Ověření kódem | WBengine</title></svelte:head>

<div class="card">
    {#if form?.codes}
        <h1>Hotovo, ověření je zapnuté</h1>
        <p class="lead mb-5 mt-2">Poslední krok: uložte si záložní kódy. Pomohou vám přihlásit se, když ztratíte telefon.</p>
        <BackupCodes codes={form.codes} />
    {:else}
        {#if data.enrollment && !setup}
            <p class="eyebrow">Zabezpečení účtu</p>
            <h1 class="mt-1">Zapněte ověření kódem z telefonu</h1>
            <p class="lead mb-6 mt-2">Při každém přihlášení budete kromě hesla zadávat šestimístný kód z aplikace. Nastavení trvá asi minutu.</p>
            <form method="POST" action="?/enroll" use:enhance={authEnhance((v) => (pendingEnroll = v))}>
                <input type="hidden" name="csrf" value={data.csrf}/>
                <FormAlert message={form?.error} />
                <SubmitButton pending={pendingEnroll} label="Začít nastavení" pendingLabel="Připravuji..." />
            </form>
        {:else if setup}
            <p class="eyebrow">Zabezpečení účtu</p>
            <h1 class="mt-1">Nastavení ověření ve 3 krocích</h1>
            <ol class="mb-6 mt-5 grid gap-5">
                <li class="flex gap-3">
                    <span class="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand" aria-hidden="true">1</span>
                    <div><h2>Nainstalujte aplikaci</h2><p class="hint mt-1">Do telefonu si nainstalujte ověřovací aplikaci, například Google Authenticator, Microsoft Authenticator nebo Aegis.</p></div>
                </li>
                <li class="flex gap-3">
                    <span class="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand" aria-hidden="true">2</span>
                    <div class="min-w-0 grid gap-3">
                        <div><h2>Přidejte účet WBengine</h2><p class="hint mt-1">V aplikaci zvolte přidání účtu a naskenujte QR kód. Na telefonu můžete také <a href={uri}>otevřít odkaz přímo v aplikaci</a>.</p></div>
                        <QrCode value={uri} />
                        <div>
                            <p class="label">Nebo opište tajný klíč ručně</p>
                            <p class="mt-1 break-words rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-base tracking-wider" aria-label="Tajný klíč, skupiny po čtyřech znacích">{groups}</p>
                            <div class="mt-2"><CopyButton text={secret ?? ''} label="Kopírovat klíč" doneLabel="Klíč zkopírován" /></div>
                            <p class="hint mt-2">Typ účtu: časový (TOTP), 6 číslic, 30 sekund. Klíč nikomu nesdílejte.</p>
                        </div>
                    </div>
                </li>
                <li class="flex gap-3">
                    <span class="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand" aria-hidden="true">3</span>
                    <div><h2>Potvrďte kód</h2><p class="hint mt-1">Opište šestimístný kód, který aplikace právě zobrazuje.</p></div>
                </li>
            </ol>
        {:else}
            <h1>Ověření kódem</h1>
            <p class="lead mb-6 mt-2">{backup ? 'Zadejte jeden ze záložních kódů. Každý lze použít jen jednou.' : 'Otevřete ověřovací aplikaci v telefonu a opište šestimístný kód pro WBengine.'}</p>
        {/if}

        {#if !(data.enrollment && !setup)}
            <FormAlert message={form?.error} />
        {/if}
        <form method="POST" action="?/verify" hidden={data.enrollment && !setup} use:enhance={authEnhance((v) => (pendingVerify = v))} class="grid gap-4">
            <input type="hidden" name="csrf" value={data.csrf}/>
            <div class="field">
                <label for="code" class="text-sm font-semibold">{backup ? 'Záložní kód' : 'Kód z aplikace'}</label>
                {#if backup}
                    <input id="code" name="code" required maxlength="128" autocomplete="off" autocapitalize="off" spellcheck="false" data-secret class="font-mono" />
                {:else}
                    <input id="code" name="code" bind:this={codeInput} required inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{'{'}6{'}'}" maxlength="6" data-secret
                           placeholder="000000" class="text-center font-mono text-3xl tracking-[.5em]" oninput={onCode} />
                {/if}
            </div>
            <SubmitButton pending={pendingVerify} label="Ověřit" pendingLabel="Ověřuji..." />
        </form>
        {#if !data.enrollment}
            <p class="mt-5 text-center text-sm text-muted">
                {#if backup}<a href="?" onclick={(e) => { e.preventDefault(); backup = false; }}>Použít kód z aplikace</a>
                {:else}Nemáte telefon po ruce? <a href="?zaloha=1" onclick={(e) => { e.preventDefault(); backup = true; }}>Použít záložní kód</a>{/if}
            </p>
        {/if}
    {/if}
</div>
