<script lang="ts">
	import { documentTitle, productName } from '#lib/brand.svelte.js';
	import Button from '#lib/components/unitati/Button.svelte';
	import { LOGIN_WITHOUT_AUTO_REDIRECT } from '#lib/oidc.js';
	import { m } from '#lib/paraglide/messages.js';
	import AuthShell from '../(auth)/AuthShell.svelte';
</script>

<svelte:head>
	<title>{documentTitle(m.signed_out_title())}</title>
</svelte:head>

<!-- No automatic redirect: signing out must not sign the person straight back in (ADR 0056). -->
<AuthShell title={m.signed_out_title()} lede={m.signed_out_lede({ name: productName() })}>
	<Button href={LOGIN_WITHOUT_AUTO_REDIRECT} size="lg" class="mt-[var(--space-6)] w-full">
		{m.signed_out_again()}
	</Button>
</AuthShell>
