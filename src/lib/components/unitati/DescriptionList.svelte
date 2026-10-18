<script lang="ts" module>
	import type { Snippet } from 'svelte';
	import { tv } from '#lib/tv.js';

	/**
	 * `.ut-dl` (`components.css`): a grid of `104px 1fr`, label left and value
	 * left-aligned beside it. Not `justify-between`: a long value wraps inside its
	 * own column instead of drifting away from its label or overflowing a 340px rail.
	 */
	export const descriptionList = tv({
		slots: {
			root: 'm-0 grid grid-cols-[104px_1fr] gap-x-[var(--space-3)] gap-y-[var(--space-3)]',
			term: 'text-small text-[var(--ink-muted)]',
			detail: 'm-0 min-h-[22px] min-w-0 text-sm break-words text-[var(--ink)]'
		}
	});

	export interface DescriptionItem {
		label: string;
		/** A string, or a snippet when the value is a component. `null` (no value) renders a dash. */
		value: Snippet | string | null;
	}
</script>

<script lang="ts">
	interface Props {
		items: DescriptionItem[];
		class?: string;
	}

	let { items, class: className }: Props = $props();

	const styles = descriptionList();
</script>

<dl class={styles.root({ class: className })}>
	{#each items as item (item.label)}
		<dt class={styles.term()}>{item.label}</dt>
		<dd class={styles.detail()}>
			{#if item.value === null}
				—
			{:else if typeof item.value === 'string'}
				{item.value}
			{:else}
				{@render item.value()}
			{/if}
		</dd>
	{/each}
</dl>
