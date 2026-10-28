<script lang="ts">
	import { documentTitle, productName } from '#lib/brand.svelte.js';
	import Button from '#lib/components/unitati/Button.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import AuthShell from '../AuthShell.svelte';
	import PasswordForm from './PasswordForm.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const ssoLabel = $derived(data.sso?.label ?? m.login_sso_default_label());
</script>

<svelte:head>
	<title>{documentTitle(m.login_title({ name: productName() }))}</title>
</svelte:head>

<AuthShell title={m.login_title({ name: productName() })} lede={m.login_lede()} ledeOnSmallOnly>
	{#if data.sso}
		<!-- A link, not a form: the flow starts with a redirect and changes nothing here. -->
		<Button href={data.ssoHref} size="lg" class="mt-[var(--space-6)] w-full">
			{m.login_sso_button({ label: ssoLabel })}
		</Button>
	{/if}

	{#if data.sso?.required}
		<p class="mt-[var(--space-4)] text-center text-sm">
			<a class="text-[var(--ink-muted)] underline underline-offset-2" href="/login/local">
				{m.login_administrator_access()}
			</a>
		</p>
	{:else}
		{#if data.sso}
			<p class="mt-[var(--space-5)] text-center text-sm text-[var(--ink-muted)]">
				{m.login_sso_or()}
			</p>
		{/if}
		<PasswordForm form={data.form} class="mt-[var(--space-6)]" />
	{/if}
</AuthShell>
