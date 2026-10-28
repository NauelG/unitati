<script lang="ts">
	import { documentTitle } from '#lib/brand.svelte.js';
	import { LOGIN_WITHOUT_AUTO_REDIRECT } from '#lib/oidc.js';
	import { m } from '#lib/paraglide/messages.js';
	import AuthShell from '../../AuthShell.svelte';
	import PasswordForm from '../PasswordForm.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{documentTitle(m.login_local_title())}</title>
</svelte:head>

<AuthShell title={m.login_local_title()} lede={m.login_local_lede()}>
	<PasswordForm form={data.form} class="mt-[var(--space-6)]" />
	<p class="mt-[var(--space-4)] text-center text-sm">
		<a
			class="text-[var(--ink-muted)] underline underline-offset-2"
			href={LOGIN_WITHOUT_AUTO_REDIRECT}
		>
			{m.login_local_back()}
		</a>
	</p>
</AuthShell>
