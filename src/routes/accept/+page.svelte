<script lang="ts">
    import { enhance } from '$app/forms';
    import { t } from '#lib/i18n/client.ts';
    import { authEnhance } from '#lib/components/auth/enhance.ts';
    import FormAlert from '#lib/components/auth/FormAlert.svelte';
    import PasswordField from '#lib/components/auth/PasswordField.svelte';
    import SubmitButton from '#lib/components/auth/SubmitButton.svelte';
    let { data, form } = $props();
    let pending = $state(false);
</script>

<svelte:head><title>{t('auth.accept.pageTitle')}</title></svelte:head>

<div class="card">
    <h1>{t('auth.accept.title')}</h1>
    <p class="lead mb-6 mt-2">{t('auth.accept.lead')}</p>
    <FormAlert message={form?.error} />
    <form method="POST" use:enhance={authEnhance((v) => (pending = v))} class="grid gap-4">
        <input type="hidden" name="csrf" value={data.csrf}/>
        <div class="field">
            <label for="token" class="text-sm font-semibold">{t('auth.accept.codeLabel')}</label>
            <input id="token" name="token" required autocomplete="off" autocapitalize="off" spellcheck="false" data-secret aria-describedby="token-hint" />
            <p id="token-hint" class="hint">{t('auth.accept.codeHint')}</p>
        </div>
        <PasswordField id="password" label={t('auth.common.newPassword')} autocomplete="new-password" minlength={14} showMeter hint={t('auth.accept.passwordHint')} />
        <SubmitButton {pending} label={t('auth.accept.submit')} pendingLabel={t('auth.accept.submitting')} />
    </form>
    <p class="mt-5 text-center text-sm text-muted">{t('auth.accept.haveAccount')} <a href="/login">{t('auth.accept.signIn')}</a></p>
</div>
