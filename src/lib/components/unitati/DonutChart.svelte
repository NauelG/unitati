<script lang="ts" module>
	/**
	 * A distribution as a ring (#90): how a whole divides into a handful of
	 * named parts. Glanceable, like `Sparkline` — no tooltip, no legend of its
	 * own, no interaction. The caller renders the legend, because the words and
	 * their order belong to the domain, not to the geometry.
	 *
	 * Deliberately not a pie: the hole is where the total goes, which is the
	 * number a reader actually wants, and a ring compares arc lengths rather
	 * than asking anyone to judge the area of a wedge.
	 */

	/** One part of the whole. The caller resolves the colour, so the chart owns no palette. */
	export interface DonutSlice {
		/** Stable identity for the `{#each}` key — a status key, never the label. */
		key: string;
		/** Already translated: the chart never calls a message function. */
		label: string;
		count: number;
		/** A `var(--token)` string. See `status.ts`'s `statusColour`. */
		colour: string;
	}
</script>

<script lang="ts">
	import { Arc, Chart, Pie, Svg } from 'layerchart';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		slices: readonly DonutSlice[];
		/**
		 * What the ring divides, as a sentence: the chart's accessible name, and
		 * the only thing a screen reader gets from the SVG itself.
		 */
		label: string;
		/** Outer diameter in px. A ring has no fluid dimension — it is a circle. */
		size?: number;
		/** Ring thickness in px. */
		thickness?: number;
		class?: string;
	}

	let { slices, label, size = 132, thickness = 16, class: className }: Props = $props();

	const total = $derived(slices.reduce((sum, slice) => sum + slice.count, 0));
	const empty = $derived(total === 0);

	/**
	 * Zero-count slices are dropped before the ring is drawn.
	 *
	 * The server deliberately returns every state, zeros included, so the legend
	 * never changes shape. The *ring* wants the opposite: a zero-width arc still
	 * consumes a `padAngle` gap, so four empty states would draw four slivers of
	 * padding into an otherwise clean circle.
	 */
	const drawn = $derived(slices.filter((slice) => slice.count > 0));

	const accessibleName = $derived(
		empty
			? `${label}: ${m.chart_empty()}`
			: `${label}: ${drawn.map((slice) => `${slice.label} ${slice.count}`).join(', ')}`
	);
</script>

<!--
	**The hard rule**: no data means an empty state, never a chart.

	Here that is a complete ring in `--surface-2` with an em-dash at its centre:
	the shape the chart *will* take, visibly holding no value. The alternative a
	library gives you unasked is a single 360° slice in the first palette colour,
	which reads as "100% in service" when the truth is that nothing is
	registered at all — a confident lie, and the worse failure of the two.

	Unlike `Sparkline`, this **is** server-rendered: a ring's size is intrinsic,
	so `width`/`height` are known without measuring a container and `ssr` has
	real numbers to draw with. Nothing snaps on hydration.
-->
<div
	class={className}
	style:width="{size}px"
	style:height="{size}px"
	role="img"
	aria-label={accessibleName}
>
	{#if empty}
		<svg viewBox="0 0 {size} {size}" width={size} height={size} aria-hidden="true">
			<circle
				cx={size / 2}
				cy={size / 2}
				r={(size - thickness) / 2}
				fill="none"
				stroke="var(--surface-2)"
				stroke-width={thickness}
			/>
			<text
				x={size / 2}
				y={size / 2}
				text-anchor="middle"
				dominant-baseline="central"
				fill="var(--ink-muted)"
				style:font-family="var(--font-sans)"
				style:font-size="20px"
			>
				—
			</text>
		</svg>
	{:else}
		<Chart data={drawn as DonutSlice[]} x="count" width={size} height={size} ssr>
			<Svg center>
				<!--
					`sort={null}` keeps the data's own order. d3-pie sorts by value by
					default, which would reorder the slices — and so their colours —
					whenever two counts crossed, making the same inventory look like a
					different chart from one reload to the next. The server already
					returns the vocabulary's order; this is what preserves it.
				-->
				<Pie innerRadius={-thickness} padAngle={0.02} sort={null}>
					{#snippet children({ arcs })}
						{#each arcs as arc (arc.data.key)}
							<Arc
								startAngle={arc.startAngle}
								endAngle={arc.endAngle}
								padAngle={arc.padAngle}
								innerRadius={-thickness}
								fill={arc.data.colour}
							/>
						{/each}
					{/snippet}
				</Pie>
			</Svg>
		</Chart>

		<!--
			The total sits in the hole, positioned over the ring rather than inside
			the SVG: it is live text, so it stays selectable, scales with the user's
			font size, and reads the same `--ink` token as every other number.
		-->
		<div
			class="pointer-events-none flex flex-col items-center justify-center"
			style:margin-top="-{size}px"
			style:height="{size}px"
		>
			<span
				class="font-sans text-[22px] leading-6 font-semibold text-[var(--ink)] [font-variant-numeric:tabular-nums]"
				>{total}</span
			>
		</div>
	{/if}
</div>
