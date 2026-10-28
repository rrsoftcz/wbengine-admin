<script lang="ts">
    import { enhance } from '$app/forms';
    import { authEnhance } from '#lib/components/auth/enhance.ts';
    import FormAlert from '#lib/components/auth/FormAlert.svelte';
    import PasswordField from '#lib/components/auth/PasswordField.svelte';
    import SubmitButton from '#lib/components/auth/SubmitButton.svelte';
    let { data, form } = $props();
    let pending = $state(false);
    const email = $derived(form && 'email' in form ? form.email : '');
</script>

<svelte:head><title>Přihlášení | WBengine</title></svelte:head>

<div class="card">
    <h1>Přihlášení</h1>
    <p class="lead mb-6 mt-2">Přihlaste se e-mailem a heslem. V dalším kroku vás požádáme o kód z aplikace v telefonu.</p>
    <FormAlert message={form?.error} />
    <form method="POST" use:enhance={authEnhance((v) => (pending = v))} class="grid gap-4">
        <input type="hidden" name="csrf" value={data.csrf}/>
        <div class="field">
            <label for="email" class="text-sm font-semibold">E-mail</label>
            <input id="email" name="email" type="email" autocomplete="username" autocapitalize="off" spellcheck="false" value={email} required />
        </div>
        <PasswordField id="password" label="Heslo" autocomplete="current-password" />
        <SubmitButton {pending} label="Přihlásit se" pendingLabel="Přihlašuji..." />
    </form>
    <p class="mt-5 text-center text-sm text-muted">Zapomněli jste heslo? <a href="/recover">Obnovit heslo</a></p>
</div>
<p class="mt-4 text-center text-sm text-muted">Přístup je pouze na pozvánku. Pozvánku vám zašle správce. <a href="/accept">Mám pozvánku</a></p>
