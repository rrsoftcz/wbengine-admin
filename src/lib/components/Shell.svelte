<script lang="ts">
    import { page } from '$app/state';
    import { enhance } from '$app/forms';
    import type { Snippet } from 'svelte';
    import { t } from '#lib/i18n/client.ts';
    let { user, csrf, children }: { user: { email: string; globalAdmin: boolean }; csrf: string; children: Snippet } = $props();
    let open = $state(false);
    const path = $derived(page.url.pathname);
    const items = $derived([
        { href: '/', label: t('app.nav.sites'), hint: t('app.nav.sitesHint'), match: (p: string) => p === '/' || p.startsWith('/content') || p.startsWith('/analytics'), icon: 'grid' },
        ...(user.globalAdmin ? [{ href: '/sites', label: t('app.nav.registry'), hint: t('app.nav.registryHint'), match: (p: string) => p.startsWith('/sites'), icon: 'shield' }, { href: '/users', label: t('app.nav.users'), hint: t('app.nav.usersHint'), match: (p: string) => p.startsWith('/users'), icon: 'people' }] : [])
    ]);
    const initials = $derived(user.email.slice(0, 2).toUpperCase());
</script>

<a href="#content" class="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:shadow-card">{t('app.shell.skip')}</a>

<div class="min-h-dvh md:grid md:grid-cols-[17rem_1fr]">
    <header class="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/90 px-4 py-3 backdrop-blur md:hidden">
        <a href="/" class="flex items-center gap-2 font-bold text-text no-underline">
            <span class="grid size-8 place-items-center rounded-lg bg-brand text-sm text-brand-contrast">W</span> WBengine
        </a>
        <button type="button" class="btn btn-secondary btn-sm" aria-expanded={open} aria-controls="nav" onclick={() => (open = !open)}>{open ? t('app.shell.close') : t('app.shell.menu')}</button>
    </header>

    <aside id="nav" class="{open ? 'flex' : 'hidden'} fixed inset-x-0 top-[3.4rem] bottom-0 z-20 flex-col gap-1 overflow-y-auto border-r border-line bg-surface p-4 md:sticky md:top-0 md:flex md:h-dvh md:inset-auto">
        <a href="/" class="mb-4 hidden items-center gap-3 px-2 py-1 text-text no-underline md:flex">
            <span class="grid size-9 place-items-center rounded-xl bg-brand font-bold text-brand-contrast">W</span>
            <span class="leading-tight"><span class="block font-bold">WBengine</span><span class="block text-xs text-muted">{t('app.brand.subtitle')}</span></span>
        </a>
        <nav class="flex flex-col gap-1" aria-label={t('app.shell.navLabel')}>
            {#each items as item}
                {@const active = item.match(path)}
                <a href={item.href} onclick={() => (open = false)} aria-current={active ? 'page' : undefined}
                   class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold no-underline transition {active ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2 hover:text-text'}">
                    <svg class="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        {#if item.icon === 'grid'}<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
                        {:else if item.icon === 'people'}<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M17 14.2c2.4 0 4 1.8 4 4.3"/>
                        {:else}<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/>{/if}
                    </svg>
                    <span>{item.label}</span>
                </a>
            {/each}
        </nav>
        <div class="mt-auto border-t border-line pt-4">
            <div class="mb-3 flex items-center gap-3 px-2">
                <span class="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand" aria-hidden="true">{initials}</span>
                <span class="min-w-0 leading-tight"><span class="block truncate text-sm font-semibold" title={user.email}>{user.email}</span><span class="block text-xs text-muted">{user.globalAdmin ? t('app.shell.roleGlobal') : t('app.shell.roleMember')}</span></span>
                <a href="/profile" onclick={() => (open = false)} aria-current={path.startsWith('/profile') ? 'page' : undefined} aria-label={t('app.shell.profile')} title={t('app.shell.profile')}
                   class="ml-auto grid size-9 shrink-0 place-items-center rounded-xl no-underline transition {path.startsWith('/profile') ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2 hover:text-text'}">
                    <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>
                    </svg>
                </a>
            </div>
            <form method="POST" action="/?/logout" use:enhance={() => async ({ update }) => { await update({ reset: false }); }}>
                <input type="hidden" name="csrf" value={csrf} />
                <button class="btn btn-secondary btn-sm btn-block">{t('app.shell.signOut')}</button>
            </form>
        </div>
    </aside>

    <main id="content" class="min-w-0 px-4 py-6 md:px-10 md:py-10">
        <div class="mx-auto max-w-5xl">{@render children()}</div>
    </main>
</div>
