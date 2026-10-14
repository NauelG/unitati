<script lang="ts">
	import Skeleton from './Skeleton.svelte';
	import { m } from '#lib/paraglide/messages.js';

	/**
	 * Mirrors `AssetTimeline`'s own `.ut-timeline` geometry (dot + connecting
	 * rail + two lines of body) so the streamed swap (#89) moves nothing.
	 */
	interface Props {
		rows?: number;
		class?: string;
	}

	let { rows = 3, class: className }: Props = $props();

	const rowIndexes = $derived(Array.from({ length: rows }, (_, index) => index));
</script>

<ol class="m-0 list-none p-0 {className ?? ''}" role="status" aria-live="polite">
	<span class="sr-only">{m.loading_timeline()}</span>
	{#each rowIndexes as index (index)}
		<li class="relative flex gap-[var(--space-3)] pb-[var(--space-5)] last:pb-0" aria-hidden="true">
			<Skeleton class="size-7 shrink-0 rounded-[var(--radius-full)]" />
			<div class="min-w-0 flex-1 space-y-[var(--space-2)]">
				<Skeleton class="h-[18px] w-3/4" />
				<Skeleton class="h-3 w-24" />
			</div>
		</li>
	{/each}
</ol>
