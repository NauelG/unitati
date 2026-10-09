<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	/**
	 * Layout: ticket detail. A record header, then the conversation beside a side
	 * column of panels. The grid is `minmax(0, 1fr) 340px`; below 1100px the side
	 * column falls under the header and the thread stays first.
	 */
	export const ticketDetail = tv({
		slots: {
			root: 'mx-auto max-w-6xl',
			header: 'flex flex-wrap items-start justify-between gap-[var(--space-4)]',
			chips: 'flex flex-wrap items-center gap-[var(--space-2)]',
			tag: 'font-mono text-xs font-medium text-[var(--ink-muted)]',
			title: 'mt-1 font-display text-lg font-semibold text-[var(--ink)]',
			provenance: 'mt-[var(--space-1)] text-[13px] leading-[18px] text-[var(--ink-muted)]',
			actions: 'flex flex-wrap items-center gap-[var(--space-2)]',
			grid: [
				'mt-[var(--space-6)] grid items-start gap-[var(--space-6)]',
				'min-[1100px]:grid-cols-[minmax(0,1fr)_340px]'
			],
			main: 'flex min-w-0 flex-col gap-[var(--space-5)]',
			side: 'flex min-w-0 flex-col gap-[var(--space-4)] max-[1099px]:order-first'
		}
	});
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Priority, TicketStatus } from '#lib/domain/status.js';
	import StatusBadge from './StatusBadge.svelte';

	interface Props {
		ticketTag: string;
		subject: string;
		status: TicketStatus;
		priority: Priority;
		/** "Opened by X · time · via portal" — one small line, already formatted. */
		provenance: string;
		/** Secondary actions first, the primary one last. */
		actions?: Snippet;
		/** The conversation: the thread, then the composer. */
		children: Snippet;
		/** Panels for the side column (details, and later related records). */
		side?: Snippet;
		class?: string;
	}

	let {
		ticketTag,
		subject,
		status,
		priority,
		provenance,
		actions,
		children,
		side,
		class: className
	}: Props = $props();

	const styles = ticketDetail();
</script>

<div class={styles.root({ class: className })}>
	<div class={styles.header()}>
		<div class="min-w-0">
			<div class={styles.chips()}>
				<span class={styles.tag()}>{ticketTag}</span>
				<StatusBadge {status} />
				<StatusBadge status={priority} />
			</div>
			<h1 class={styles.title()}>{subject}</h1>
			<p class={styles.provenance()}>{provenance}</p>
		</div>

		{#if actions}
			<div class={styles.actions()}>{@render actions()}</div>
		{/if}
	</div>

	<div class={styles.grid()}>
		<div class={styles.main()}>{@render children()}</div>
		{#if side}
			<aside class={styles.side()}>{@render side()}</aside>
		{/if}
	</div>
</div>
