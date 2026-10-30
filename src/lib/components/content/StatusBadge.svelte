<script lang="ts">
    import { t } from '#lib/i18n/client.ts';
    let { state }: { state: 'draft' | 'published' | 'deleted' | 'new' | 'readonly' } = $props();
    const spec = {
        draft: ['badge badge-warn', 'content.status.draft'],
        published: ['badge badge-ok', 'content.status.published'],
        deleted: ['badge badge-danger', 'content.status.deleted'],
        new: ['badge badge-brand', 'content.status.new'],
        readonly: ['badge', 'content.status.readonly']
    } as const;
</script>

<span class={spec[state][0]}>{t(spec[state][1])}</span>
