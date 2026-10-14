<script lang="ts">
	import Skeleton from './Skeleton.svelte';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		/** Matches the real board's column count, so the swap moves nothing. */
		columns?: number;
		class?: string;
	}

	let { columns = 4, class: className }: Props = $props();

	/** `{#each}` needs a bound item: the index is the item. */
	const columnIndexes = $derived(Array.from({ length: columns }, (_, index) => index));
</script>

<div
	class="flex items-start gap-[var(--space-3)] overflow-hidden {className ?? ''}"
	role="status"
	aria-live="polite"
>
	<span class="sr-only">{m.loading_generic()}</span>
	{#each columnIndexes as index (index)}
		<div
			class="flex w-72 shrink-0 flex-col gap-[var(--space-2)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-0)] p-[var(--space-3)]"
		>
			<Skeleton class="h-[18px] w-24" />
			{#each [0, 1, 2].slice(0, 3 - (index % 3)) as card (card)}
				<Skeleton class="h-[92px] w-full rounded-[var(--radius-md)]" />
			{/each}
		</div>
	{/each}
</div>
