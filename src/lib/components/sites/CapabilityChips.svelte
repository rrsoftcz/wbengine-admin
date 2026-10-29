<script lang="ts">
    import { resourceLabels, type Resource } from './resources';
    let { resources, extras = [] }: { resources: Resource[]; extras?: string[] } = $props();
</script>

<ul class="flex flex-wrap gap-2" aria-label="Site capabilities">
    {#each resources as r (r.name)}
        {@const state = r.read && r.write ? 'ok' : r.read || r.write ? 'info' : 'off'}
        <li class="badge {state === 'ok' ? 'badge-ok' : state === 'info' ? 'badge-info' : ''} {state === 'off' ? 'opacity-70' : ''}">
            <span>{resourceLabels[r.name] ?? r.name}</span>
            <span class="font-normal">{state === 'off' ? 'off' : r.read && r.write ? 'read and write' : r.read ? 'read only' : 'write only'}</span>
        </li>
    {/each}
    {#each extras as extra (extra)}
        <li class="badge badge-brand"><span>Extra</span><span class="font-normal">{extra}</span></li>
    {/each}
</ul>
