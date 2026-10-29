<script lang="ts">
    /* Rendered only in the browser from data already present on the page; nothing is sent anywhere. */
    let { value }: { value: string } = $props();
    let svg = $state('');
    $effect(() => {
        const v = value;
        import('qrcode-generator').then(({ default: qrcode }) => {
            const qr = qrcode(0, 'M');
            qr.addData(v);
            qr.make();
            svg = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
        }).catch(() => (svg = ''));
    });
</script>

{#if svg}
    <div class="mx-auto size-44 shrink-0 rounded-xl bg-white p-3 [&>svg]:size-full" role="img" aria-label="QR code for adding the account to the app">{@html svg}</div>
{/if}
