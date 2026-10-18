<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	/**
	 * The page header every list, record and form page shares (ADR 0018): an
	 * optional mono code above the title, the title itself, an optional one-line
	 * summary, and right-aligned actions. A page that needs more than this —
	 * status chips, provenance — composes its own header instead (see
	 * `TicketDetailLayout`), because those are that record's concern, not every
	 * page's.
	 */
	export const pageHeader = tv({
		slots: {
			root: 'flex flex-wrap items-start justify-between gap-[var(--space-4)]',
			heading: 'min-w-0',
			code: 'font-mono text-xs font-medium text-[var(--ink-muted)]',
			title: 'font-display text-2xl font-semibold text-balance break-words text-[var(--ink)]',
			summary: 'mt-2 text-pretty text-[var(--ink-muted)]',
			actions: 'flex flex-wrap items-center gap-[var(--space-2)]'
		}
	});
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		/** Mono, above the title, as in the asset detail. */
		code?: string;
		/**
		 * S1, the record morph (#87): the same `view-transition-name` `DataTable`
		 * put on the list row's code cell (`toViewTransitionName('record', tag)`),
		 * so navigating from the list visually travels the tag into this spot.
		 * Meaningless without `code`.
		 */
		codeViewTransitionName?: string;
		/** One line, `ink-muted`. Until phase 3 feeds it live data, the existing lede strings pass through. */
		summary?: Snippet;
		/** Right-aligned. */
		actions?: Snippet;
		class?: string;
	}

	let { title, code, codeViewTransitionName, summary, actions, class: className }: Props = $props();

	const styles = pageHeader();
</script>

<header class={styles.root({ class: className })}>
	<div class={styles.heading()}>
		{#if code}
			<p class={styles.code()} translate="no" style:view-transition-name={codeViewTransitionName}>
				{code}
			</p>
		{/if}
		<h1 class={styles.title({ class: code ? 'mt-1' : undefined })}>{title}</h1>
		{#if summary}
			<p class={styles.summary()}>{@render summary()}</p>
		{/if}
	</div>

	{#if actions}
		<div class={styles.actions()}>{@render actions()}</div>
	{/if}
</header>
