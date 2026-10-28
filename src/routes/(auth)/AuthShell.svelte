<script lang="ts">
	import type { Snippet } from 'svelte';
	import AppVersion from '#lib/components/AppVersion.svelte';
	import Logo from '#lib/components/unitati/Logo.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import AuthBrandPanel from './AuthBrandPanel.svelte';

	/**
	 * The frame every sign-in screen shares: the brand panel beside a card with the
	 * logo, a heading and the version link (the "Código fuente" link is a license
	 * obligation and lives in `AppVersion`).
	 */
	interface Props {
		title: string;
		lede?: string;
		/** The login screen's lede repeats the brand panel, so it only shows where the panel is hidden. */
		ledeOnSmallOnly?: boolean;
		children: Snippet;
	}

	let { title, lede, ledeOnSmallOnly = false, children }: Props = $props();
</script>

<div class="grid min-h-dvh bg-[var(--surface-0)] lg:grid-cols-2">
	<AuthBrandPanel />

	<div class="flex items-center justify-center p-6 sm:p-12">
		<PageLayout variant="form" class="w-full">
			<!-- layout-ok: the card is its own measure, narrower than the form variant's ceiling -->
			<div
				class="mx-auto w-full max-w-sm rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-8 shadow-[var(--shadow-lg)]"
			>
				<Logo size="lg" class="lg:hidden" />
				<h1 class="mt-[var(--space-5)] font-display text-xl font-semibold text-[var(--ink)]">
					{title}
				</h1>
				{#if lede}
					<p
						class="mt-[var(--space-1)] text-sm text-[var(--ink-muted)] {ledeOnSmallOnly
							? 'lg:hidden'
							: ''}"
					>
						{lede}
					</p>
				{/if}

				{@render children()}

				<footer class="mt-[var(--space-8)] flex items-center justify-center gap-[var(--space-3)]">
					<AppVersion />
				</footer>
			</div>
		</PageLayout>
	</div>
</div>
