<script lang="ts">
    import { enhance } from '$app/forms';
    import { t } from '#lib/i18n/client.ts';
    import { authEnhance } from '#lib/components/auth/enhance.ts';
    import FormAlert from '#lib/components/auth/FormAlert.svelte';
    import PasswordField from '#lib/components/auth/PasswordField.svelte';
    import SubmitButton from '#lib/components/auth/SubmitButton.svelte';
    let { data, form } = $props();
    let pending = $state(false);
    const email = $derived(form && 'email' in form ? form.email : '');
</script>

<svelte:head><title>{t('auth.login.pageTitle')}</title></svelte:head>

<div class="card">
    <h1>{t('auth.login.title')}</h1>
    <p class="lead mb-6 mt-2">{t('auth.login.lead')}</p>
    <FormAlert message={form?.error} />
    <form method="POST" use:enhance={authEnhance((v) => (pending = v))} class="grid gap-4">
        <input type="hidden" name="csrf" value={data.csrf}/>
        <div class="field">
            <label for="email" class="text-sm font-semibold">{t('auth.common.email')}</label>
            <input id="email" name="email" type="email" autocomplete="username" autocapitalize="off" spellcheck="false" value={email} required />
        </div>
        <PasswordField id="password" label={t('auth.common.password')} autocomplete="current-password" />
        <SubmitButton {pending} label={t('auth.login.submit')} pendingLabel={t('auth.login.submitting')} />
    </form>
    <p class="mt-5 text-center text-sm text-muted">{t('auth.login.forgot')} <a href="/recover">{t('auth.login.reset')}</a></p>
</div>
<p class="mt-4 text-center text-sm text-muted">{t('auth.login.invitationOnly')} <a href="/accept">{t('auth.login.haveInvitation')}</a></p>
