<script lang="ts" module>
	import { tv } from '#lib/tv.js';

	/**
	 * The `.ut-panel` family (ADR 0019): a bounded, white secondary/contained
	 * region — a side-rail card, a grouped action box — distinct from the app
	 * canvas (`--surface-0`) and from a record's own primary work area (the
	 * conversation and composer in `TicketDetailLayout`, which stay their own
	 * component because their chrome already carries meaning).
	 *
	 * `heading`/`actions` are optional: a panel with neither renders just the
	 * padded body, the same shape the hand-rolled `panel`/`panelTitle` strings
	 * on `/service-desk/[tag]` and `/assets/[tag]` built ad hoc before this
	 * component existed.
	 */
	export const workPanel = tv({
		slots: {
			root: 'rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)]',
			head: 'flex items-center justify-between gap-[var(--space-3)] border-b border-[var(--border)] px-[var(--space-4)] py-[var(--space-3)]',
			title: 'text-title-3 text-[var(--ink)]',
			actions: 'flex items-center gap-[var(--space-2)]',
			body: 'px-[var(--space-4)] py-[var(--space-3)]'
		}
	});
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Plain text: a panel heading names a group, it does not carry its own markup. */
		heading?: string;
		actions?: Snippet;
		children: Snippet;
		class?: string;
		/** A keymap row verb's jump target (#88: `#action-custody` and friends). */
		id?: string;
	}

	let { heading, actions, children, class: className, id }: Props = $props();

	const styles = workPanel();
</script>

<section {id} class={styles.root({ class: className })}>
	{#if heading || actions}
		<div class={styles.head()}>
			{#if heading}
				<h2 class={styles.title()}>{heading}</h2>
			{/if}
			{#if actions}
				<div class={styles.actions()}>{@render actions()}</div>
			{/if}
		</div>
	{/if}

	<div class={styles.body()}>{@render children()}</div>
</section>
