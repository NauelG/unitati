<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	/** ADR 0011 rule 2: a conditional style is a variant, not an `if` returning a string. */
	const tabStyles = tv({
		base: [
			'rounded-[var(--radius-full)] px-[var(--space-3)] py-[var(--space-1)] text-sm',
			'transition-colors ut-transition-fast'
		],
		variants: {
			active: {
				true: 'bg-[var(--surface-2)] font-medium text-[var(--ink)]',
				false: 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
			}
		}
	});
</script>

<script lang="ts">
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		/**
		 * The catalogue tabs are for whoever maintains the catalogue. A person who
		 * can only read the inventory has one section, and a tab bar with a single
		 * tab is just noise.
		 */
		showCatalogue: boolean;
	}

	let { showCatalogue }: Props = $props();

	const tabs = $derived([
		{ href: '/assets', label: m.assets_nav_assets(), exact: true },
		{ href: '/assets/models', label: m.assets_nav_models(), exact: false },
		{ href: '/assets/categories', label: m.assets_nav_categories(), exact: false },
		{ href: '/assets/manufacturers', label: m.assets_nav_manufacturers(), exact: false }
	]);
</script>

{#if showCatalogue}
	<nav aria-label={m.assets_nav_label()} class="mt-[var(--space-5)] flex gap-[var(--space-1)]">
		{#each tabs as tab (tab.href)}
			{@const active = tab.exact
				? page.url.pathname === tab.href
				: page.url.pathname.startsWith(tab.href)}
			<a href={tab.href} aria-current={active ? 'page' : undefined} class={tabStyles({ active })}>
				{tab.label}
			</a>
		{/each}
	</nav>
{/if}
