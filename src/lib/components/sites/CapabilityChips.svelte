<script lang="ts">
    import { resourceLabels, type Resource } from './resources';
    let { resources, extras = [] }: { resources: Resource[]; extras?: string[] } = $props();
</script>

<ul class="flex flex-wrap gap-2" aria-label="Schopnosti webu">
    {#each resources as r (r.name)}
        {@const state = r.read && r.write ? 'ok' : r.read || r.write ? 'info' : 'off'}
        <li class="badge {state === 'ok' ? 'badge-ok' : state === 'info' ? 'badge-info' : ''} {state === 'off' ? 'opacity-70' : ''}">
            <span>{resourceLabels[r.name] ?? r.name}</span>
            <span class="font-normal">{state === 'off' ? 'vypnuto' : r.read && r.write ? 'čtení a zápis' : r.read ? 'jen čtení' : 'jen zápis'}</span>
        </li>
    {/each}
    {#each extras as extra (extra)}
        <li class="badge badge-brand"><span>Navíc</span><span class="font-normal">{extra}</span></li>
    {/each}
</ul>
