<script lang="ts" module>
	import { tv } from '#lib/tv.js';

	/**
	 * The record-detail toolbar (#86): a data-driven breadcrumb trail,
	 * 56px tall like the shell's own topbar (`AppShell`'s `.ut-topbar`), but a
	 * second, local bar — not a second copy of the shell's fixed one. It
	 * renders real segments the caller already loaded server-side (a parent
	 * list's name, a record's own tag), never parsed back out of the URL: a
	 * reserved route segment or a custom tag makes that unreliable (#86's own
	 * note), and the server already knows the true parent name.
	 */
	export const breadcrumbs = tv({
		slots: {
			root: 'flex h-14 items-center border-b border-[var(--border)]',
			list: 'flex min-w-0 items-center gap-[var(--space-2)] text-label text-[var(--ink-muted)]',
			item: 'flex items-center gap-[var(--space-2)] truncate',
			link: 'truncate hover:text-[var(--ink)] hover:underline',
			current: 'truncate text-[var(--ink)]',
			separator: 'size-3.5 shrink-0 text-[var(--ink-muted)]'
		}
	});

	export interface BreadcrumbSegment {
		label: string;
		/** Omit for the trail's last segment: the current record has no link to itself. */
		href?: string;
	}
</script>

<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	interface Props {
		/** First segment first; the last one renders as the current, unlinked page. */
		segments: BreadcrumbSegment[];
		class?: string;
	}

	let { segments, class: className }: Props = $props();

	const styles = breadcrumbs();
</script>

<nav aria-label="breadcrumb" class={styles.root({ class: className })}>
	<ol class={styles.list()}>
		{#each segments as segment, index (segment.label + index)}
			{@const isLast = index === segments.length - 1}
			<li class={styles.item()}>
				{#if index > 0}
					<ChevronRight class={styles.separator()} aria-hidden="true" />
				{/if}
				{#if segment.href && !isLast}
					<a href={segment.href} class={styles.link()}>{segment.label}</a>
				{:else}
					<span class={styles.current()} aria-current={isLast ? 'page' : undefined}>
						{segment.label}
					</span>
				{/if}
			</li>
		{/each}
	</ol>
</nav>
