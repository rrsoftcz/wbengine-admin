<script lang="ts">
    import { resourceLabel, type Resource } from './resources';
import { t } from '#lib/i18n/client.ts';
    let { resources, extras = [] }: { resources: Resource[]; extras?: string[] } = $props();
</script>

<ul class="flex flex-wrap gap-2" aria-label={t('sites.chips.label')}>
    {#each resources as r (r.name)}
        {@const state = r.read && r.write ? 'ok' : r.read || r.write ? 'info' : 'off'}
        <li class="badge {state === 'ok' ? 'badge-ok' : state === 'info' ? 'badge-info' : ''} {state === 'off' ? 'opacity-70' : ''}">
            <span>{resourceLabel(r.name, t)}</span>
            <span class="font-normal">{state === 'off' ? t('sites.chips.off') : r.read && r.write ? t('sites.chips.readWrite') : r.read ? t('sites.chips.readOnly') : t('sites.chips.writeOnly')}</span>
        </li>
    {/each}
    {#each extras as extra (extra)}
        <li class="badge badge-brand"><span>{t('sites.chips.extra')}</span><span class="font-normal">{extra}</span></li>
    {/each}
</ul>
