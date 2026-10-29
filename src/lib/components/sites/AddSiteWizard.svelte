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
    const phases = ['Checking the site address', 'Verifying the integration key', 'Loading site capabilities', 'Saving the site'];

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
            pasteNote = 'The key has been pasted.';
        } catch {
            pasteNote = 'Could not read the clipboard. Paste the key manually (Ctrl+V).';
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

    <ol class="mb-6 grid grid-cols-3 gap-2 text-center text-xs font-semibold text-muted sm:text-sm" aria-label="Steps">
        <li class="rounded-lg bg-brand-soft px-2 py-1.5 text-brand">1. Key on the site</li>
        <li class="rounded-lg bg-brand-soft px-2 py-1.5 text-brand">2. Details</li>
        <li class="rounded-lg px-2 py-1.5 {result ? 'bg-brand-soft text-brand' : 'bg-surface-2'}">3. Result</li>
    </ol>

    <section class="mb-8" aria-labelledby="krok1">
        <h3 id="krok1" class="flex items-center gap-2"><span class="grid size-6 place-items-center rounded-full bg-brand text-xs text-brand-contrast" aria-hidden="true">1</span> Prepare the key on the site</h3>
        <p class="mt-2 text-sm text-muted">On the target site, open the Integrations page and issue a new key with the profile "{profile}". The key is shown only once, so copy all of it.</p>
        <details class="mt-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
            <summary class="text-sm font-semibold">What the key allows ({scopes.length} permissions)</summary>
            <p class="mt-2 text-sm text-muted">Through the key, the Admin reads and edits the site content and publishes changes. Nothing else: it cannot reach server administration or the site's users. The profile contains these permissions:</p>
            <ul class="mt-2 flex flex-wrap gap-1.5">
                {#each scopes as scope (scope)}<li><code>{scope}</code></li>{/each}
            </ul>
            <p class="mt-2 text-sm text-muted">Optionally, the key can also include the permission to read analytics.</p>
        </details>
    </section>

    <section class="mb-8" aria-labelledby="krok2">
        <h3 id="krok2" class="flex items-center gap-2"><span class="grid size-6 place-items-center rounded-full bg-brand text-xs text-brand-contrast" aria-hidden="true">2</span> Enter the details</h3>
        <div class="mt-4 grid gap-4">
            <label class="field"><span>Site name</span>
                <input name="name" maxlength="160" required value={name} oninput={(e) => (name = e.currentTarget.value)} placeholder="For example Company site" disabled={pending} />
                <span class="hint">Only for your own orientation in the Admin.</span>
            </label>
            <label class="field"><span>Site address (HTTPS)</span>
                <input name="url" type="url" required inputmode="url" placeholder="https://www.example.com/" value={url} disabled={pending}
                    oninput={(e) => (url = e.currentTarget.value)} onblur={() => { if (mounted) { normalize(); } }} aria-describedby="url-hint" />
                <span class="hint" id="url-hint" aria-live="polite">
                    {#if isHttp}
                        <span class="font-semibold text-warn">The address starts with http://. The Admin requires secure HTTPS.</span>
                        <button type="button" class="btn btn-secondary btn-sm ml-1" onclick={useHttps}>Use https://</button>
                    {:else if missingScheme}
                        We will add https:// automatically.
                    {:else}
                        The full address including https://. Spaces at the edges are removed.
                    {/if}
                </span>
            </label>
            <label class="field"><span>Integration key</span>
                <span class="flex gap-2">
                    <input bind:this={keyEl} name="key" type={show ? 'text' : 'password'} autocomplete="off" required minlength="25" maxlength="205" spellcheck="false" autocapitalize="off" data-1p-ignore data-lpignore="true" disabled={pending} aria-describedby="key-hint" />
                    {#if mounted}
                        <button type="button" class="btn btn-secondary btn-sm shrink-0" aria-pressed={show} onclick={() => (show = !show)}>{show ? 'Hide' : 'Show'}</button>
                        <button type="button" class="btn btn-secondary btn-sm shrink-0" onclick={paste} disabled={pending}>Paste from clipboard</button>
                    {/if}
                </span>
                <span class="hint" id="key-hint">The key is only verified and stored encrypted. It is never sent back to the browser and the field is cleared after submitting.<span aria-live="polite" class="ml-1 font-semibold">{pasteNote}</span></span>
            </label>
        </div>
        <div class="mt-5 flex flex-wrap items-center gap-3">
            <button class="btn btn-primary" disabled={pending} aria-busy={pending}>
                {#if pending}<span class="spinner" aria-hidden="true"></span>Verifying{:else}Verify and add site{/if}
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
    <h3 id="krok3" class="flex items-center gap-2"><span class="grid size-6 place-items-center rounded-full bg-brand text-xs text-brand-contrast" aria-hidden="true">3</span> Result</h3>
    {#key form}
        {#if form?.action === 'register' && form.error}
            <div class="mt-3"><ErrorBox error={form.error} code={form.code} missing={form.missing} /></div>
        {:else if form?.registered}
            {@const r = form.registered}
            <div class="mt-3 rounded-xl border border-line bg-ok-soft p-5" role="status" tabindex="-1" use:focusOnMount>
                <p class="eyebrow text-ok">Done</p>
                <h4 class="mt-1 text-lg font-bold">Site {r.name} is connected</h4>
                <p class="mt-1 text-sm text-muted">The key is verified and stored securely. Verified integration no. <strong>{r.integrationId}</strong>, API v{r.version}.</p>
                <p class="mt-4 text-sm font-semibold">What the Admin can do on the site</p>
                <div class="mt-2"><CapabilityChips resources={r.resources} extras={r.extras} /></div>
                <div class="mt-5 flex flex-wrap gap-2">
                    <a class="btn btn-primary" href={'/content/' + r.id}>Manage content</a>
                    <a class="btn btn-secondary" href={r.url} rel="noopener noreferrer" target="_blank">Open site</a>
                </div>
            </div>
        {:else}
            <p class="mt-2 text-sm text-muted">After verification the result appears here: verified integration, API version and site capabilities.</p>
        {/if}
    {/key}
</section>
