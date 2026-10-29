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

<svelte:head><title>Sign in | WBengine</title></svelte:head>

<div class="card">
    <h1>Sign in</h1>
    <p class="lead mb-6 mt-2">Sign in with your email and password. In the next step we will ask for a code from the app on your phone.</p>
    <FormAlert message={form?.error} />
    <form method="POST" use:enhance={authEnhance((v) => (pending = v))} class="grid gap-4">
        <input type="hidden" name="csrf" value={data.csrf}/>
        <div class="field">
            <label for="email" class="text-sm font-semibold">Email</label>
            <input id="email" name="email" type="email" autocomplete="username" autocapitalize="off" spellcheck="false" value={email} required />
        </div>
        <PasswordField id="password" label="Password" autocomplete="current-password" />
        <SubmitButton {pending} label="Sign in" pendingLabel="Signing in..." />
    </form>
    <p class="mt-5 text-center text-sm text-muted">Forgot your password? <a href="/recover">Reset password</a></p>
</div>
<p class="mt-4 text-center text-sm text-muted">Access is by invitation only. An administrator will send you one. <a href="/accept">I have an invitation</a></p>
