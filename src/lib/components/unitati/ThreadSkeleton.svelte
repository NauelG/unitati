<script lang="ts">
	import Skeleton from './Skeleton.svelte';
	import { m } from '#lib/paraglide/messages.js';

	/** Mirrors `TicketThread`'s avatar + bordered card shape (#89). */
	interface Props {
		rows?: number;
		class?: string;
	}

	let { rows = 2, class: className }: Props = $props();

	const rowIndexes = $derived(Array.from({ length: rows }, (_, index) => index));
</script>

<ol
	class="m-0 flex list-none flex-col gap-[var(--space-4)] p-0 {className ?? ''}"
	role="status"
	aria-live="polite"
>
	<span class="sr-only">{m.loading_thread()}</span>
	{#each rowIndexes as index (index)}
		<li class="flex gap-[var(--space-3)]" aria-hidden="true">
			<Skeleton class="size-8 shrink-0 rounded-[var(--radius-full)]" />
			<div
				class="min-w-0 flex-1 space-y-[var(--space-2)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] px-[var(--space-4)] py-[var(--space-3)]"
			>
				<Skeleton class="h-3.5 w-28" />
				<Skeleton class="h-[22px] w-full" />
				<Skeleton class="h-[22px] w-2/3" />
			</div>
		</li>
	{/each}
</ol>
