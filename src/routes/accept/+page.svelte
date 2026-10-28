<script lang="ts">
    import { enhance } from '$app/forms';
    import { authEnhance } from '#lib/components/auth/enhance.ts';
    import FormAlert from '#lib/components/auth/FormAlert.svelte';
    import PasswordField from '#lib/components/auth/PasswordField.svelte';
    import SubmitButton from '#lib/components/auth/SubmitButton.svelte';
    let { data, form } = $props();
    let pending = $state(false);
</script>

<svelte:head><title>Přijetí pozvánky | WBengine</title></svelte:head>

<div class="card">
    <h1>Přijmout pozvánku</h1>
    <p class="lead mb-6 mt-2">Vložte kód pozvánky od správce a zvolte si heslo. Poté si nastavíte ověření kódem z telefonu.</p>
    <FormAlert message={form?.error} />
    <form method="POST" use:enhance={authEnhance((v) => (pending = v))} class="grid gap-4">
        <input type="hidden" name="csrf" value={data.csrf}/>
        <div class="field">
            <label for="token" class="text-sm font-semibold">Kód pozvánky</label>
            <input id="token" name="token" required autocomplete="off" autocapitalize="off" spellcheck="false" data-secret aria-describedby="token-hint" />
            <p id="token-hint" class="hint">Kód vám správce předal bezpečnou cestou, zkopírujte ho celý.</p>
        </div>
        <PasswordField id="password" label="Nové heslo" autocomplete="new-password" minlength={14} showMeter hint="Heslo musí mít alespoň 14 znaků. Dobře poslouží i delší věta." />
        <SubmitButton {pending} label="Vytvořit účet" pendingLabel="Vytvářím účet..." />
    </form>
    <p class="mt-5 text-center text-sm text-muted">Už máte účet? <a href="/login">Přihlásit se</a></p>
</div>
