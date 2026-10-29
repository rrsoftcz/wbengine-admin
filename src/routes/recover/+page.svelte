<script lang="ts">
    import { enhance } from '$app/forms';
    import { authEnhance } from '#lib/components/auth/enhance.ts';
    import FormAlert from '#lib/components/auth/FormAlert.svelte';
    import PasswordField from '#lib/components/auth/PasswordField.svelte';
    import SubmitButton from '#lib/components/auth/SubmitButton.svelte';
    let { data, form } = $props();
    let pending = $state(false);
</script>

<svelte:head><title>Password reset | WBengine</title></svelte:head>

<div class="card">
    <h1>Password reset</h1>
    {#if form?.success}
        <div class="alert alert-ok my-5" role="status">The password has been changed. You can now sign in with the new password.</div>
        <a href="/login" class="btn btn-primary btn-block">Go to sign in</a>
    {:else}
        <p class="lead mb-6 mt-2">Ask an administrator for a one-time recovery code, enter it here and choose a new password. Verification with the code from your phone stays in place.</p>
        <FormAlert message={form?.error} />
        <form method="POST" use:enhance={authEnhance((v) => (pending = v))} class="grid gap-4">
            <input type="hidden" name="csrf" value={data.csrf}/>
            <div class="field">
                <label for="token" class="text-sm font-semibold">Recovery code</label>
                <input id="token" name="token" required autocomplete="off" autocapitalize="off" spellcheck="false" data-secret />
            </div>
            <PasswordField id="password" label="New password" autocomplete="new-password" minlength={14} showMeter hint="The password must be at least 14 characters long." />
            <SubmitButton {pending} label="Change password" pendingLabel="Changing password..." />
        </form>
        <p class="mt-5 text-center text-sm text-muted">Lost the phone with the app? After signing in, use a backup code. <a href="/login">Back to sign in</a></p>
    {/if}
</div>
