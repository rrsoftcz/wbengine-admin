<script lang="ts">
    import { enhance } from '$app/forms';
    import ErrorBox from './ErrorBox.svelte';
    import { focusOnMount } from './focus';
    import { roleLabel } from './resources';
import { t } from '#lib/i18n/client.ts';
    type Form = { action?: string; success?: string; error?: string } | null | undefined;
    let { csrf, accounts, sites, grants, form }: { csrf: string; accounts: { id: number; email: string; global_admin: number }[]; sites: { id: number; name: string }[]; grants: { user: number; site: number; role: string; email: string }[]; form: Form } = $props();
    let pending = $state(false);
    const people = $derived(accounts.filter(a => !a.global_admin));
    const siteName = (id: number) => sites.find(s => s.id === id)?.name ?? '';
</script>

<div class="alert alert-info mb-5"><p>{t('sites.grant.info')}</p></div>

<dl class="mb-5 grid gap-3 text-sm sm:grid-cols-2">
    <div class="rounded-xl bg-surface-2 p-3"><dt class="font-semibold">{t('sites.role.editor')}</dt><dd class="text-muted">{t('sites.grant.editorHint')}</dd></div>
    <div class="rounded-xl bg-surface-2 p-3"><dt class="font-semibold">{t('sites.role.siteadmin')}</dt><dd class="text-muted">{t('sites.grant.siteadminHint')}</dd></div>
</dl>

{#if people.length && sites.length}
    <form method="POST" action="?/grant" class="grid gap-4 sm:grid-cols-3" aria-busy={pending}
        use:enhance={() => { pending = true; return async ({ update }) => { pending = false; await update({ reset: false }); }; }}>
        <input type="hidden" name="csrf" value={csrf} />
        <label class="field"><span>{t('sites.grant.account')}</span><select name="user">{#each people as account (account.id)}<option value={account.id}>{account.email}</option>{/each}</select></label>
        <label class="field"><span>{t('sites.grant.site')}</span><select name="site">{#each sites as site (site.id)}<option value={site.id}>{site.name}</option>{/each}</select></label>
        <label class="field"><span>{t('sites.grant.role')}</span><select name="role"><option value="editor">{t('sites.role.editor')}</option><option value="siteadmin">{t('sites.role.siteadmin')}</option></select></label>
        <div class="sm:col-span-3"><button class="btn btn-primary" disabled={pending} aria-busy={pending}>{#if pending}<span class="spinner" aria-hidden="true"></span>{t('sites.grant.saving')}{:else}{t('sites.grant.save')}{/if}</button></div>
    </form>
{:else}
    <p class="text-muted">{t('sites.grant.unavailable')}</p>
{/if}

{#key form}
    {#if form?.action === 'grant'}
        <div class="mt-4">
            {#if form.error}<ErrorBox error={form.error} />
            {:else if form.success}<div class="alert alert-ok" role="status" tabindex="-1" use:focusOnMount>{t('sites.grant.savedNote', { message: form.success })}</div>{/if}
        </div>
    {/if}
{/key}

{#if grants.length}
    <h3 class="mt-6 mb-2">{t('sites.grant.current')}</h3>
    <div class="overflow-x-auto">
        <table class="table"><thead><tr><th>{t('sites.grant.account')}</th><th>{t('sites.grant.site')}</th><th>{t('sites.grant.role')}</th></tr></thead>
            <tbody>{#each grants as g (g.user + '-' + g.site)}<tr><td>{g.email}</td><td>{siteName(g.site)}</td><td><span class="badge badge-brand">{roleLabel(g.role, t)}</span></td></tr>{/each}</tbody></table>
    </div>
{/if}
