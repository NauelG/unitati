<script lang="ts">
	import { untrack } from 'svelte';
	import { APP_ENV } from '$app/env/public';
	import { superForm } from 'sveltekit-superforms';
	import AppVersion from '#lib/components/AppVersion.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import EnvironmentBadge from '#lib/components/unitati/EnvironmentBadge.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import Logo from '#lib/components/unitati/Logo.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// superForm owns the form state from here on and re-syncs itself on
	// navigation, so it is seeded with the initial value on purpose.
	const { form, errors, message, enhance, submitting } = superForm(untrack(() => data.form));
</script>

<svelte:head>
	<title>{m.login_title()} · {m.app_name()}</title>
</svelte:head>

<main class="flex min-h-screen items-center justify-center bg-[var(--surface-0)] p-6">
	<div
		class="w-full max-w-sm rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-8"
		style:box-shadow="var(--shadow-md)"
	>
		<h1>
			<Logo size="lg" />
		</h1>
		<p class="mt-3 text-sm text-[var(--ink-muted)]">{m.login_lede()}</p>

		<form method="POST" use:enhance class="mt-6 space-y-4">
			<Field
				label={m.login_email_label()}
				name="email"
				type="email"
				autocomplete="email"
				placeholder={m.login_email_placeholder()}
				bind:value={$form.email}
				error={$errors.email?.[0]}
				required
			/>

			<Field
				label={m.login_password_label()}
				name="password"
				type="password"
				autocomplete="current-password"
				bind:value={$form.password}
				error={$errors.password?.[0]}
				required
			/>

			{#if $message}
				<p class="text-sm text-[var(--danger)]" role="alert">{$message}</p>
			{/if}

			<Button type="submit" size="lg" class="w-full" disabled={$submitting}>
				{$submitting ? m.login_submitting() : m.login_submit()}
			</Button>
		</form>

		<footer class="mt-8 flex items-center justify-center gap-3">
			<EnvironmentBadge environment={APP_ENV} />
			<AppVersion />
		</footer>
	</div>
</main>
