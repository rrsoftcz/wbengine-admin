<script lang="ts">
    import { focusOnMount } from './focus';
    import { t } from '#lib/i18n/client.ts';
    import type { MessageKey } from '#lib/i18n/index.ts';
    let { error, code = '', missing = [] }: { error: string; code?: string; missing?: string[] } = $props();
    const adviceCount: Record<string, number> = { invalid_key: 2, missing_scope: 2, unreachable: 2, timeout: 1, invalid_url: 1, unsafe_target: 1, api_unavailable: 1, duplicate_url: 1, same_key: 1, csrf: 1 };
    const advice = $derived(code in adviceCount ? Array.from({ length: adviceCount[code] }, (_, i) => t(`sites.advice.${code}.${i + 1}` as MessageKey)) : []);
</script>

<div class="alert alert-error flex-col" role="alert" tabindex="-1" use:focusOnMount>
    <p class="font-semibold">{error}</p>
    {#if code === 'rate_limited'}
        <p class="text-sm">{t('sites.error.rateLimited')}</p>
    {/if}
    {#if missing.length}
        <div class="text-sm">
            <p class="font-semibold">{t('sites.error.missing', { count: missing.length })}</p>
            <ul class="mt-1 flex flex-wrap gap-1.5">
                {#each missing as scope (scope)}<li><code>{scope}</code></li>{/each}
            </ul>
        </div>
    {/if}
    {#if advice.length}
        <ul class="list-disc space-y-0.5 pl-5 text-sm">
            {#each advice as line}<li>{line}</li>{/each}
        </ul>
    {/if}
</div>
