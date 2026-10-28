<script lang="ts">
    let { state }: { state: 'draft' | 'published' | 'deleted' | 'new' | 'readonly' } = $props();
    const spec = {
        draft: ['badge badge-warn', 'Koncept'],
        published: ['badge badge-ok', 'Publikováno'],
        deleted: ['badge badge-danger', 'Smazáno'],
        new: ['badge badge-brand', 'Nový záznam'],
        readonly: ['badge', 'Pouze čtení']
    } as const;
</script>

<span class={spec[state][0]}>{spec[state][1]}</span>
