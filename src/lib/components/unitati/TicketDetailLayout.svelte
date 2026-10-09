<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	/**
	 * A ticket's record header: code, status, priority as chips, then the
	 * subject and its provenance line. Composes inside `PageLayout`'s `record`
	 * variant, which owns the grid and the width ceiling (ADR 0018) — this
	 * component only ever renders the header, never its own container.
	 */
	export const ticketDetailHeader = tv({
		slots: {
			root: 'flex flex-wrap items-start justify-between gap-[var(--space-4)]',
			chips: 'flex flex-wrap items-center gap-[var(--space-2)]',
			tag: 'font-mono text-xs font-medium text-[var(--ink-muted)]',
			title: 'mt-1 font-display text-lg font-semibold text-[var(--ink)]',
			provenance: 'mt-[var(--space-1)] text-[13px] leading-[18px] text-[var(--ink-muted)]',
			actions: 'flex flex-wrap items-center gap-[var(--space-2)]'
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
		class?: string;
	}

	let {
		ticketTag,
		subject,
		status,
		priority,
		provenance,
		actions,
		class: className
	}: Props = $props();

	const styles = ticketDetailHeader();
</script>

<div class={styles.root({ class: className })}>
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
