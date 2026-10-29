<script lang="ts">
    import { focusOnMount } from './focus';
    let { error, code = '', missing = [] }: { error: string; code?: string; missing?: string[] } = $props();
    const advice: Record<string, string[]> = {
        invalid_key: ['On the target site, open the Integrations page and issue a new key.', 'Copy the whole key, without spaces at the start or end.'],
        missing_scope: ['On the target site, issue a new key with the Site administration profile and tick all permissions.', 'The original key cannot be amended, a new one has to be issued.'],
        unreachable: ['Check that the address is correct and the site is reachable from the internet.', 'Make sure the HTTPS certificate is valid.'],
        timeout: ['The site did not respond in time. Try again in a moment.'],
        invalid_url: ['Use an address in the form https://www.example.com/ without parameters or credentials.'],
        unsafe_target: ['The site must be reachable at a public HTTPS address.'],
        api_unavailable: ['On the target site, enable API v2 and install the framework SQL migrations.'],
        duplicate_url: ['To change the key of an existing site, use the Replace key action in the site list.'],
        same_key: ['On the target site, issue a new key and paste that one.'],
        csrf: ['Reload the page and submit the form again.']
    };
</script>

<div class="alert alert-error flex-col" role="alert" tabindex="-1" use:focusOnMount>
    <p class="font-semibold">{error}</p>
    {#if code === 'rate_limited'}
        <p class="text-sm">To prevent a lockout, the number of key verification attempts is limited. Wait a few minutes (the window lasts about 15 minutes) and try again. Further attempts now would only prolong it.</p>
    {/if}
    {#if missing.length}
        <div class="text-sm">
            <p class="font-semibold">The key is missing these permissions ({missing.length}):</p>
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
