<script lang="ts">
	import FormError from '#lib/components/unitati/FormError.svelte';
	import { documentTitle, productName } from '#lib/brand.svelte.js';
	import { untrack } from 'svelte';
	import { superForm } from 'sveltekit-superforms';
	import AppVersion from '#lib/components/AppVersion.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import Logo from '#lib/components/unitati/Logo.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';
	import AuthBrandPanel from '../AuthBrandPanel.svelte';

	let { data }: PageProps = $props();

	// superForm owns the form state from here on and re-syncs itself on
	// navigation, so it is seeded with the initial value on purpose.
	const { form, errors, message, enhance, submitting } = superForm(untrack(() => data.form));
</script>

<svelte:head>
	<title>{documentTitle(m.setup_title())}</title>
</svelte:head>

<div class="grid min-h-dvh bg-[var(--surface-0)] lg:grid-cols-2">
	<AuthBrandPanel />

	<div class="flex items-center justify-center p-6 sm:p-12">
		<PageLayout variant="form" class="w-full">
			<!-- layout-ok: the card is its own measure, narrower than the form variant's ceiling -->
			<div
				class="mx-auto w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-8"
				style:box-shadow="var(--shadow-lg)"
			>
				<Logo size="lg" class="lg:hidden" />
				<h1 class="mt-[var(--space-5)] font-display text-xl font-semibold text-[var(--ink)]">
					{m.setup_title()}
				</h1>
				<p class="mt-[var(--space-1)] text-sm text-[var(--ink-muted)]">
					{m.setup_lede({ name: productName() })}
				</p>

				<form method="POST" use:enhance class="mt-[var(--space-6)] space-y-[var(--space-4)]">
					<Field
						label={m.directory_column_name()}
						name="organisation"
						autocomplete="organization"
						bind:value={$form.organisation}
						error={$errors.organisation?.[0]}
						required
					/>

					<Field
						label={m.setup_name_label()}
						name="name"
						autocomplete="name"
						placeholder={m.setup_name_placeholder()}
						bind:value={$form.name}
						error={$errors.name?.[0]}
						required
					/>

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
						autocomplete="new-password"
						bind:value={$form.password}
						error={$errors.password?.[0]}
						required
					/>

					{#if $message}
						<FormError>{$message}</FormError>
					{/if}

					<Button type="submit" size="lg" class="w-full" busy={$submitting}>
						{$submitting ? m.setup_submitting() : m.setup_submit()}
					</Button>
				</form>

				<footer class="mt-[var(--space-8)] text-center">
					<AppVersion />
				</footer>
			</div>
		</PageLayout>
	</div>
</div>
