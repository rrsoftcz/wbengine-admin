<script lang="ts">
    let { state }: { state: 'draft' | 'published' | 'deleted' | 'new' | 'readonly' } = $props();
    const spec = {
        draft: ['badge badge-warn', 'Draft'],
        published: ['badge badge-ok', 'Published'],
        deleted: ['badge badge-danger', 'Deleted'],
        new: ['badge badge-brand', 'New record'],
        readonly: ['badge', 'Read only']
    } as const;
</script>

<span class={spec[state][0]}>{spec[state][1]}</span>
