<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	/**
	 * Previous / next with a count, for a list that is paged on the server. Links,
	 * not buttons: a page is a URL, so it survives a reload, a bookmark and the
	 * back button — none of which a click handler gives for free.
	 */
	export const pager = tv({
		slots: {
			root: 'flex flex-wrap items-center justify-between gap-[var(--space-3)] text-sm text-[var(--ink-muted)]',
			summary: '[font-variant-numeric:tabular-nums]',
			controls: 'flex items-center gap-[var(--space-2)]',
			link: [
				'inline-flex h-[var(--size-control-sm)] items-center gap-[var(--space-1)] px-[var(--space-3)]',
				'rounded-[var(--radius-full)] text-xs font-semibold text-[var(--ink)]',
				'shadow-[inset_0_0_0_1px_var(--border-strong)] transition-colors ut-transition-fast hover:bg-[var(--surface-2)]'
			],
			// A link that cannot be followed is not a link: `aria-disabled` on a
			// span says so to assistive technology, where a dimmed anchor would
			// still be announced as one.
			off: 'cursor-not-allowed opacity-45 hover:bg-transparent'
		}
	});
</script>

<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		/** 1-based, as in the URL. */
		page: number;
		pageCount: number;
		perPage: number;
		/** Every matching row, not the rows on this page. */
		total: number;
		/** The URL of a given page, so the caller keeps its own query string. */
		href: (page: number) => string;
		class?: string;
	}

	let { page, pageCount, perPage, total, href, class: className }: Props = $props();

	const styles = pager();

	const from = $derived(total === 0 ? 0 : (page - 1) * perPage + 1);
	const to = $derived(Math.min(page * perPage, total));
	const hasPrevious = $derived(page > 1);
	const hasNext = $derived(page < pageCount);
</script>

<nav class={styles.root({ class: className })} aria-label={m.pager_label()}>
	<p class={styles.summary()}>
		{m.pager_summary({ from, to, total })}
		<span class="sr-only">· {m.pager_page({ page, pageCount })}</span>
	</p>

	<div class={styles.controls()}>
		{#if hasPrevious}
			<a class={styles.link()} href={href(page - 1)} rel="prev">
				<ChevronLeft class="size-3.5" aria-hidden="true" />
				{m.pager_previous()}
			</a>
		{:else}
			<span class={styles.link({ class: styles.off() })} aria-disabled="true">
				<ChevronLeft class="size-3.5" aria-hidden="true" />
				{m.pager_previous()}
			</span>
		{/if}

		{#if hasNext}
			<a class={styles.link()} href={href(page + 1)} rel="next">
				{m.pager_next()}
				<ChevronRight class="size-3.5" aria-hidden="true" />
			</a>
		{:else}
			<span class={styles.link({ class: styles.off() })} aria-disabled="true">
				{m.pager_next()}
				<ChevronRight class="size-3.5" aria-hidden="true" />
			</span>
		{/if}
	</div>
</nav>
