<script lang="ts" module>
	import { tv } from '#lib/tv.js';

	/**
	 * The search/filter strip of an index screen (ADR 0019). Attached to the
	 * table panel: it keeps the top corners and the side borders and drops its own
	 * bottom border, so the table's border closes the shape and the two read as one
	 * panel.
	 *
	 * Usage contract: the toolbar and its sibling `DataTable` live inside one
	 * `<div>`, and the `DataTable` receives `class="rounded-t-none"` so the
	 * corners meet. There is no spec selector: `.ut-table` has no toolbar variant,
	 * this is the ADR 0019 pattern spelt once.
	 */
	export const listToolbar = tv({
		base: [
			'flex flex-wrap items-end gap-[var(--space-3)] p-[var(--space-4)]',
			'rounded-t-[var(--radius-lg)] border border-b-0 border-[var(--border)] bg-[var(--surface-1)]'
		]
	});
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLFormAttributes } from 'svelte/elements';

	interface Props {
		/** Defaults to the current URL, which is what a `GET` search wants. */
		action?: string;
		onsubmit?: HTMLFormAttributes['onsubmit'];
		/** Narrower than Svelte's `ClassValue`: tailwind-variants merges strings. */
		class?: string;
		children: Snippet;
	}

	let { action, onsubmit, class: className, children }: Props = $props();
</script>

<form method="GET" role="search" {action} {onsubmit} class={listToolbar({ class: className })}>
	{@render children()}
</form>
