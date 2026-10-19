<script lang="ts" module>
	import { tv } from '#lib/tv.js';

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
			code: 'font-mono text-record-id text-[var(--ink-muted)]',
			title: 'font-display text-balance break-words text-[var(--ink)]',
			summary: 'mt-2 text-pretty text-[var(--ink-muted)]',
			actions: 'flex flex-wrap items-center gap-[var(--space-2)]'
		},
		variants: {
			/**
			 * `tokens.json` reserves `title-1` for module index pages and `title-2`
			 * for the title of a record in its detail view.
			 */
			level: {
				index: { title: 'text-title-1' },
				record: { title: 'text-title-2' }
			}
		},
		defaultVariants: { level: 'index' }
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
		/** Replaces the plain code with live content, e.g. an in-place editor. `code` still gates the line. */
		codeContent?: Snippet;
		/** Replaces the plain title with live content, e.g. an in-place editor. */
		titleContent?: Snippet;
		/** One line, `ink-muted`. Until phase 3 feeds it live data, the existing lede strings pass through. */
		summary?: Snippet;
		/** Right-aligned. */
		actions?: Snippet;
		/** `index` (default) titles a module's list page; `record` titles one record in its detail view. */
		level?: 'index' | 'record';
		class?: string;
	}

	let {
		title,
		code,
		codeViewTransitionName,
		codeContent,
		titleContent,
		summary,
		actions,
		level = 'index',
		class: className
	}: Props = $props();

	const styles = $derived(pageHeader({ level }));
</script>

<header class={styles.root({ class: className })}>
	<div class={styles.heading()}>
		{#if code}
			<p class={styles.code()} translate="no" style:view-transition-name={codeViewTransitionName}>
				{#if codeContent}{@render codeContent()}{:else}{code}{/if}
			</p>
		{/if}
		<h1 class={styles.title({ class: code ? 'mt-1' : undefined })}>
			{#if titleContent}{@render titleContent()}{:else}{title}{/if}
		</h1>
		{#if summary}
			<p class={styles.summary()}>{@render summary()}</p>
		{/if}
	</div>

	{#if actions}
		<div class={styles.actions()}>{@render actions()}</div>
	{/if}
</header>
