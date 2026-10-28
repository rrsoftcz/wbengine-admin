<script lang="ts">
    import { enhance } from '$app/forms';
    import { authEnhance } from '#lib/components/auth/enhance.ts';
    import FormAlert from '#lib/components/auth/FormAlert.svelte';
    import PasswordField from '#lib/components/auth/PasswordField.svelte';
    import SubmitButton from '#lib/components/auth/SubmitButton.svelte';
    let { data, form } = $props();
    let pending = $state(false);
</script>

<svelte:head><title>Obnova hesla | WBengine</title></svelte:head>

<div class="card">
    <h1>Obnova hesla</h1>
    {#if form?.success}
        <div class="alert alert-ok my-5" role="status">Heslo bylo změněno. Nyní se můžete přihlásit novým heslem.</div>
        <a href="/login" class="btn btn-primary btn-block">Přejít na přihlášení</a>
    {:else}
        <p class="lead mb-6 mt-2">Požádejte správce o jednorázový kód obnovy, vložte ho sem a zvolte nové heslo. Ověření kódem z telefonu zůstane zachováno.</p>
        <FormAlert message={form?.error} />
        <form method="POST" use:enhance={authEnhance((v) => (pending = v))} class="grid gap-4">
            <input type="hidden" name="csrf" value={data.csrf}/>
            <div class="field">
                <label for="token" class="text-sm font-semibold">Kód obnovy</label>
                <input id="token" name="token" required autocomplete="off" autocapitalize="off" spellcheck="false" data-secret />
            </div>
            <PasswordField id="password" label="Nové heslo" autocomplete="new-password" minlength={14} showMeter hint="Heslo musí mít alespoň 14 znaků." />
            <SubmitButton {pending} label="Změnit heslo" pendingLabel="Měním heslo..." />
        </form>
        <p class="mt-5 text-center text-sm text-muted">Ztratili jste telefon s aplikací? Po přihlášení použijte záložní kód. <a href="/login">Zpět na přihlášení</a></p>
    {/if}
</div>
