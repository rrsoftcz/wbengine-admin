<script lang="ts">
    import { page } from '$app/state';
    const status = $derived(page.status);
    const text = $derived(
        status === 404 ? { title: 'Stránka nenalezena', body: 'Adresa neexistuje nebo byla přesunuta. Zkontrolujte ji, nebo se vraťte na úvod.' }
        : status === 403 ? { title: 'Přístup odepřen', body: 'Pro tuto stránku nemáte oprávnění. Pokud ho potřebujete, požádejte správce.' }
        : status === 401 ? { title: 'Přihlaste se', body: 'Pro pokračování se nejdříve přihlaste.' }
        : { title: 'Něco se pokazilo', body: 'Na naší straně došlo k chybě. Zkuste to prosím za chvíli znovu.' }
    );
</script>

<svelte:head><title>{text.title} | WBengine</title></svelte:head>

<div class="mx-auto max-w-md py-10">
    <div class="card text-center">
        <p class="eyebrow">Chyba {status}</p>
        <h1 class="mt-2">{text.title}</h1>
        <p class="lead mx-auto mb-6 mt-2">{text.body}</p>
        <a href="/" class="btn btn-primary">Zpět na úvod</a>
    </div>
</div>
