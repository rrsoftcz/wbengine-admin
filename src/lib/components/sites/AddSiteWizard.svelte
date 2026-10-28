<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import { enhance } from '$app/forms';
    import CapabilityChips from './CapabilityChips.svelte';
    import ErrorBox from './ErrorBox.svelte';
    import { focusOnMount } from './focus';

    type Form = { action?: string; error?: string; code?: string; missing?: string[]; values?: Record<string, string>; registered?: { id: number; name: string; url: string; integrationId: number; version: string; resources: { name: string; read: boolean; write: boolean }[]; extras: string[] } } | null | undefined;
    let { csrf, profile, scopes, form }: { csrf: string; profile: string; scopes: string[]; form: Form } = $props();

    // svelte-ignore state_referenced_locally
    let name = $state(form?.values?.name ?? '');
    // svelte-ignore state_referenced_locally
    let url = $state(form?.values?.url ?? '');
    let show = $state(false);
    let pending = $state(false);
    let phase = $state(0);
    let mounted = $state(false);
    let keyEl: HTMLInputElement;
    let timer: ReturnType<typeof setInterval> | undefined;
    let pasteNote = $state('');
    const phases = ['Kontroluji adresu webu', 'Ověřuji integrační klíč', 'Načítám schopnosti webu', 'Ukládám web'];

    onMount(() => {
        mounted = true;
    });
    onDestroy(() => clearInterval(timer));

    const trimmed = $derived(url.trim());
    const isHttp = $derived(/^http:\/\//i.test(trimmed));
    const missingScheme = $derived(trimmed !== '' && !/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed));
    function normalize() {
        let v = url.trim();
        if (v && !/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = 'https://' + v.replace(/^\/+/, '');
        url = v;
    }
    function useHttps() { url = url.trim().replace(/^http:\/\//i, 'https://'); }
    async function paste() {
        pasteNote = '';
        try {
            keyEl.value = (await navigator.clipboard.readText()).trim();
            keyEl.focus();
            pasteNote = 'Klíč byl vložen.';
        } catch {
            pasteNote = 'Schránku se nepodařilo přečíst. Vložte klíč ručně (Ctrl+V).';
        }
    }
    const result = $derived(!!form?.registered);
</script>

<form method="POST" action="?/register" autocomplete="off"
    aria-busy={pending}
    use:enhance={() => {
        normalize();
        pending = true; phase = 0;
        clearInterval(timer);
        timer = setInterval(() => (phase = Math.min(phase + 1, phases.length - 1)), 1600);
        queueMicrotask(() => { keyEl.value = ''; show = false; });
        return async ({ update }) => {
            clearInterval(timer);
            pending = false;
            keyEl.value = '';
            await update({ reset: false });
        };
    }}>
    <input type="hidden" name="csrf" value={csrf} />

    <ol class="mb-6 grid grid-cols-3 gap-2 text-center text-xs font-semibold text-muted sm:text-sm" aria-label="Postup">
        <li class="rounded-lg bg-brand-soft px-2 py-1.5 text-brand">1. Klíč na webu</li>
        <li class="rounded-lg bg-brand-soft px-2 py-1.5 text-brand">2. Údaje</li>
        <li class="rounded-lg px-2 py-1.5 {result ? 'bg-brand-soft text-brand' : 'bg-surface-2'}">3. Výsledek</li>
    </ol>

    <section class="mb-8" aria-labelledby="krok1">
        <h3 id="krok1" class="flex items-center gap-2"><span class="grid size-6 place-items-center rounded-full bg-brand text-xs text-brand-contrast" aria-hidden="true">1</span> Připravte klíč na webu</h3>
        <p class="mt-2 text-sm text-muted">Na cílovém webu otevřete stránku Integrace a vydejte nový klíč s profilem „{profile}“. Klíč se zobrazí jen jednou, zkopírujte si ho celý.</p>
        <details class="mt-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
            <summary class="text-sm font-semibold">Co klíč umožňuje ({scopes.length} oprávnění)</summary>
            <p class="mt-2 text-sm text-muted">Admin přes klíč čte a upravuje obsah webu a publikuje změny. Nic dalšího, k administraci serveru ani k uživatelům webu se nedostane. Profil obsahuje tato oprávnění:</p>
            <ul class="mt-2 flex flex-wrap gap-1.5">
                {#each scopes as scope (scope)}<li><code>{scope}</code></li>{/each}
            </ul>
            <p class="mt-2 text-sm text-muted">Volitelně může klíč obsahovat i oprávnění pro čtení analytiky.</p>
        </details>
    </section>

    <section class="mb-8" aria-labelledby="krok2">
        <h3 id="krok2" class="flex items-center gap-2"><span class="grid size-6 place-items-center rounded-full bg-brand text-xs text-brand-contrast" aria-hidden="true">2</span> Vložte údaje</h3>
        <div class="mt-4 grid gap-4">
            <label class="field"><span>Název webu</span>
                <input name="name" maxlength="160" required value={name} oninput={(e) => (name = e.currentTarget.value)} placeholder="Například Firemní web" disabled={pending} />
                <span class="hint">Slouží jen pro vaši orientaci v Adminu.</span>
            </label>
            <label class="field"><span>Adresa webu (HTTPS)</span>
                <input name="url" type="url" required inputmode="url" placeholder="https://www.example.com/" value={url} disabled={pending}
                    oninput={(e) => (url = e.currentTarget.value)} onblur={() => { if (mounted) { normalize(); } }} aria-describedby="url-hint" />
                <span class="hint" id="url-hint" aria-live="polite">
                    {#if isHttp}
                        <span class="font-semibold text-warn">Adresa začíná na http://. Admin vyžaduje zabezpečené HTTPS.</span>
                        <button type="button" class="btn btn-secondary btn-sm ml-1" onclick={useHttps}>Použít https://</button>
                    {:else if missingScheme}
                        Doplníme https:// automaticky.
                    {:else}
                        Celá adresa včetně https://. Mezery na okrajích se odstraní.
                    {/if}
                </span>
            </label>
            <label class="field"><span>Integrační klíč</span>
                <span class="flex gap-2">
                    <input bind:this={keyEl} name="key" type={show ? 'text' : 'password'} autocomplete="off" required minlength="25" maxlength="205" spellcheck="false" autocapitalize="off" data-1p-ignore data-lpignore="true" disabled={pending} aria-describedby="key-hint" />
                    {#if mounted}
                        <button type="button" class="btn btn-secondary btn-sm shrink-0" aria-pressed={show} onclick={() => (show = !show)}>{show ? 'Skrýt' : 'Zobrazit'}</button>
                        <button type="button" class="btn btn-secondary btn-sm shrink-0" onclick={paste} disabled={pending}>Vložit ze schránky</button>
                    {/if}
                </span>
                <span class="hint" id="key-hint">Klíč se pouze ověří a uloží šifrovaně. Zpět do prohlížeče se nikdy nevrací a po odeslání se pole vyprázdní.<span aria-live="polite" class="ml-1 font-semibold">{pasteNote}</span></span>
            </label>
        </div>
        <div class="mt-5 flex flex-wrap items-center gap-3">
            <button class="btn btn-primary" disabled={pending} aria-busy={pending}>
                {#if pending}<span class="spinner" aria-hidden="true"></span>Ověřuji{:else}Ověřit a přidat web{/if}
            </button>
            {#if pending}
                <p class="flex items-center gap-2 text-sm text-muted" role="status" aria-live="polite">{phases[phase]}...</p>
            {/if}
        </div>
        {#if pending}
            <ol class="mt-3 grid gap-1 text-sm" aria-hidden="true">
                {#each phases as p, i}
                    <li class="flex items-center gap-2 {i <= phase ? 'text-text' : 'text-muted opacity-60'}"><span class="size-2 rounded-full {i < phase ? 'bg-ok' : i === phase ? 'bg-brand' : 'bg-line-strong'}"></span>{p}</li>
                {/each}
            </ol>
        {/if}
    </section>
</form>

<section aria-labelledby="krok3" aria-live="polite">
    <h3 id="krok3" class="flex items-center gap-2"><span class="grid size-6 place-items-center rounded-full bg-brand text-xs text-brand-contrast" aria-hidden="true">3</span> Výsledek</h3>
    {#key form}
        {#if form?.action === 'register' && form.error}
            <div class="mt-3"><ErrorBox error={form.error} code={form.code} missing={form.missing} /></div>
        {:else if form?.registered}
            {@const r = form.registered}
            <div class="mt-3 rounded-xl border border-line bg-ok-soft p-5" role="status" tabindex="-1" use:focusOnMount>
                <p class="eyebrow text-ok">Hotovo</p>
                <h4 class="mt-1 text-lg font-bold">Web {r.name} je připojený</h4>
                <p class="mt-1 text-sm text-muted">Klíč je ověřený a bezpečně uložený. Ověřená integrace č. <strong>{r.integrationId}</strong>, API v{r.version}.</p>
                <p class="mt-4 text-sm font-semibold">Co Admin na webu umí</p>
                <div class="mt-2"><CapabilityChips resources={r.resources} extras={r.extras} /></div>
                <div class="mt-5 flex flex-wrap gap-2">
                    <a class="btn btn-primary" href={'/content/' + r.id}>Spravovat obsah</a>
                    <a class="btn btn-secondary" href={r.url} rel="noopener noreferrer" target="_blank">Otevřít web</a>
                </div>
            </div>
        {:else}
            <p class="mt-2 text-sm text-muted">Po ověření se tu zobrazí výsledek: ověřená integrace, verze API a schopnosti webu.</p>
        {/if}
    {/key}
</section>
