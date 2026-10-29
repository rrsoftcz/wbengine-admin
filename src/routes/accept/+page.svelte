<script lang="ts">
    import { enhance } from '$app/forms';
    import { authEnhance } from '#lib/components/auth/enhance.ts';
    import FormAlert from '#lib/components/auth/FormAlert.svelte';
    import PasswordField from '#lib/components/auth/PasswordField.svelte';
    import SubmitButton from '#lib/components/auth/SubmitButton.svelte';
    let { data, form } = $props();
    let pending = $state(false);
</script>

<svelte:head><title>Accept invitation | WBengine</title></svelte:head>

<div class="card">
    <h1>Accept invitation</h1>
    <p class="lead mb-6 mt-2">Enter the invitation code from your administrator and choose a password. Then you will set up verification with a code from your phone.</p>
    <FormAlert message={form?.error} />
    <form method="POST" use:enhance={authEnhance((v) => (pending = v))} class="grid gap-4">
        <input type="hidden" name="csrf" value={data.csrf}/>
        <div class="field">
            <label for="token" class="text-sm font-semibold">Invitation code</label>
            <input id="token" name="token" required autocomplete="off" autocapitalize="off" spellcheck="false" data-secret aria-describedby="token-hint" />
            <p id="token-hint" class="hint">Your administrator gave you the code through a secure channel. Copy all of it.</p>
        </div>
        <PasswordField id="password" label="New password" autocomplete="new-password" minlength={14} showMeter hint="The password must be at least 14 characters long. A longer sentence works well." />
        <SubmitButton {pending} label="Create account" pendingLabel="Creating account..." />
    </form>
    <p class="mt-5 text-center text-sm text-muted">Already have an account? <a href="/login">Sign in</a></p>
</div>
