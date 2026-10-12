<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	/**
	 * The `.ut-skeleton`: a `surface-2` block with a single sweeping highlight,
	 * ≤1.2s per pass (#89's "Done when": the one sanctioned looping animation,
	 * `prefers-reduced-motion` already collapses it to ~0 through the global
	 * layer in `src/app.css`, same mechanism as `Button`'s `busy` dot).
	 *
	 * This paints a *shape*, never a sentence: callers size it with `class`
	 * (`w-24 h-4`, `size-9 rounded-full`…) to match the real content's own box,
	 * so the swap from skeleton to data moves nothing (CLS 0).
	 */
	export const skeleton = tv({
		base: [
			'relative isolate overflow-hidden rounded-[var(--radius-sm)] bg-[var(--surface-2)]',
			"before:absolute before:inset-0 before:content-[''] before:-translate-x-full",
			'before:bg-gradient-to-r before:from-transparent before:via-[var(--surface-1)] before:to-transparent',
			'before:animate-[ut-shimmer_1.2s_ease-in-out_infinite]'
		]
	});
</script>

<script lang="ts">
	interface Props {
		/** Narrower than Svelte's `ClassValue`: tailwind-variants merges strings. */
		class?: string;
		/**
		 * Read once by a screen reader instead of a silent block: omit it on a
		 * skeleton that sits next to one already announced by its container
		 * (e.g. each row of a `DataTableSkeleton` under one shared label).
		 */
		label?: string;
	}

	let { class: className, label }: Props = $props();
</script>

<div class={skeleton({ class: className })} role={label ? 'status' : undefined} aria-live="polite">
	{#if label}<span class="sr-only">{label}</span>{/if}
</div>
