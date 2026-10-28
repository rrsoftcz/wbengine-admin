<script lang="ts">
    import { focusOnMount } from './focus';
    let { error, code = '', missing = [] }: { error: string; code?: string; missing?: string[] } = $props();
    const advice: Record<string, string[]> = {
        invalid_key: ['Na cílovém webu otevřete stránku Integrace a vydejte nový klíč.', 'Klíč zkopírujte celý, bez mezer na začátku a na konci.'],
        missing_scope: ['Na cílovém webu vydejte nový klíč s profilem Správa webu a zaškrtněte všechna oprávnění.', 'Původní klíč nelze doplnit, je potřeba vydat nový.'],
        unreachable: ['Zkontrolujte, že adresa je správně a web je dostupný z internetu.', 'Ověřte platný HTTPS certifikát.'],
        timeout: ['Web neodpověděl včas. Zkuste to za chvíli znovu.'],
        invalid_url: ['Použijte adresu ve tvaru https://www.example.com/ bez parametrů a přihlašovacích údajů.'],
        unsafe_target: ['Web musí být dostupný na veřejné HTTPS adrese.'],
        api_unavailable: ['Na cílovém webu zapněte API v2 a nainstalujte SQL migrace frameworku.'],
        duplicate_url: ['Pokud chcete u existujícího webu změnit klíč, použijte v seznamu webů akci Vyměnit klíč.'],
        same_key: ['Na cílovém webu vydejte nový klíč a vložte ten.'],
        csrf: ['Stránku načtěte znovu a odešlete formulář ještě jednou.']
    };
</script>

<div class="alert alert-error flex-col" role="alert" tabindex="-1" use:focusOnMount>
    <p class="font-semibold">{error}</p>
    {#if code === 'rate_limited'}
        <p class="text-sm">Aby se předešlo zablokování, počet pokusů o ověření klíče je omezený. Počkejte několik minut (okno trvá zhruba 15 minut) a zkuste to znovu. Další pokusy teď situaci jen prodlouží.</p>
    {/if}
    {#if missing.length}
        <div class="text-sm">
            <p class="font-semibold">Klíči chybí tato oprávnění ({missing.length}):</p>
            <ul class="mt-1 flex flex-wrap gap-1.5">
                {#each missing as scope (scope)}<li><code>{scope}</code></li>{/each}
            </ul>
        </div>
    {/if}
    {#if advice[code]}
        <ul class="list-disc space-y-0.5 pl-5 text-sm">
            {#each advice[code] as line}<li>{line}</li>{/each}
        </ul>
    {/if}
</div>
