<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm } from 'sveltekit-superforms';
	import AppVersion from '#lib/components/AppVersion.svelte';
	import Button, { button } from '#lib/components/unitati/Button.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import Logo from '#lib/components/unitati/Logo.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import { documentTitle } from '#lib/brand.svelte.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// superForm owns the form state from here on, so it is seeded once on purpose.
	const { form, errors, enhance, submitting } = superForm(untrack(() => data.form));
</script>

<svelte:head>
	<title>{documentTitle(m.password_title())}</title>
</svelte:head>

<div class="flex min-h-dvh items-center justify-center bg-[var(--surface-0)] p-6 sm:p-12">
	<PageLayout variant="form" class="w-full">
		<!-- layout-ok: the card is its own measure, narrower than the form variant's ceiling -->
		<div
			class="mx-auto w-full max-w-sm rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-8 shadow-[var(--shadow-lg)]"
		>
			<Logo size="lg" />
			<h1 class="mt-[var(--space-5)] font-display text-xl font-semibold text-[var(--ink)]">
				{data.forced ? m.password_title_forced() : m.password_title()}
			</h1>
			{#if data.forced}
				<p class="mt-[var(--space-1)] text-sm text-[var(--ink-muted)]">
					{m.password_lede_forced()}
				</p>
			{/if}

			<form method="POST" use:enhance class="mt-[var(--space-6)] space-y-[var(--space-4)]">
				<Field
					label={m.password_current()}
					name="currentPassword"
					type="password"
					autocomplete="current-password"
					bind:value={$form.currentPassword}
					error={$errors.currentPassword?.[0]}
					required
				/>
				<Field
					label={m.password_new()}
					name="newPassword"
					type="password"
					autocomplete="new-password"
					bind:value={$form.newPassword}
					error={$errors.newPassword?.[0]}
					required
				/>
				<Field
					label={m.password_confirm()}
					name="confirmPassword"
					type="password"
					autocomplete="new-password"
					bind:value={$form.confirmPassword}
					error={$errors.confirmPassword?.[0]}
					required
				/>

				<div class="flex items-center justify-end gap-[var(--space-2)]">
					{#if !data.forced}
						<a href="/" class={button({ variant: 'ghost', size: 'lg' })}>{m.password_back()}</a>
					{/if}
					<Button type="submit" size="lg" busy={$submitting}>{m.password_submit()}</Button>
				</div>
			</form>

			<footer class="mt-[var(--space-8)] flex items-center justify-center gap-[var(--space-3)]">
				<AppVersion />
			</footer>
		</div>
	</PageLayout>
</div>
