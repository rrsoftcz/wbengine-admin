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

<svelte:head><title>{t('auth.recover.pageTitle')}</title></svelte:head>

<div class="card">
    <h1>{t('auth.recover.title')}</h1>
    {#if form?.success}
        <div class="alert alert-ok my-5" role="status">{t('auth.recover.success')}</div>
        <a href="/login" class="btn btn-primary btn-block">{t('auth.recover.goToSignIn')}</a>
    {:else}
        <p class="lead mb-6 mt-2">{t('auth.recover.lead')}</p>
        <FormAlert message={form?.error} />
        <form method="POST" use:enhance={authEnhance((v) => (pending = v))} class="grid gap-4">
            <input type="hidden" name="csrf" value={data.csrf}/>
            <div class="field">
                <label for="token" class="text-sm font-semibold">{t('auth.recover.codeLabel')}</label>
                <input id="token" name="token" required autocomplete="off" autocapitalize="off" spellcheck="false" data-secret />
            </div>
            <PasswordField id="password" label={t('auth.common.newPassword')} autocomplete="new-password" minlength={14} showMeter hint={t('auth.common.passwordHint14')} />
            <SubmitButton {pending} label={t('auth.recover.submit')} pendingLabel={t('auth.recover.submitting')} />
        </form>
        <p class="mt-5 text-center text-sm text-muted">{t('auth.recover.lostPhone')} <a href="/login">{t('auth.common.backToSignIn')}</a></p>
    {/if}
</div>
