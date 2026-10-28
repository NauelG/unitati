<script lang="ts">
	import { documentTitle } from '#lib/brand.svelte.js';
	import Button from '#lib/components/unitati/Button.svelte';
	import { LOGIN_WITHOUT_AUTO_REDIRECT } from '#lib/oidc.js';
	import { m } from '#lib/paraglide/messages.js';
	import AuthShell from '../../AuthShell.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const causes = {
		email_not_verified: m.sso_error_email_not_verified,
		person_inactive: m.sso_error_person_inactive,
		no_person: m.sso_error_no_person,
		email_taken: m.sso_error_email_taken,
		sso_unavailable: m.sso_error_sso_unavailable
	};

	const cause = $derived(data.code ? causes[data.code]() : m.sso_error_generic());
</script>

<svelte:head>
	<title>{documentTitle(m.sso_error_title())}</title>
</svelte:head>

<AuthShell title={m.sso_error_title()}>
	<p class="mt-[var(--space-3)] text-sm text-[var(--ink)]" role="alert">{cause}</p>
	<Button
		href={LOGIN_WITHOUT_AUTO_REDIRECT}
		size="lg"
		variant="secondary"
		class="mt-[var(--space-6)] w-full"
	>
		{m.sso_error_retry()}
	</Button>
</AuthShell>
