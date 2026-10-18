<script lang="ts" module>
	import type { VariantProps } from 'tailwind-variants';
	import { tv } from '#lib/tv.js';

	/**
	 * A day-by-day trend line, sized for the footer of a `KpiCard` (#90). No
	 * axes, no grid, no tooltip: a sparkline is glanceable, not explorable, and
	 * an explorable reports surface is post-v1. The number above it is the fact;
	 * this is only its shape.
	 *
	 * `tone` is the domain colour, so a ticket trend is violet and an asset
	 * trend is blue — the same one-colour-per-domain rule the sidebar dots and
	 * `RecordRef` chips follow.
	 */
	export const sparkline = tv({
		slots: {
			root: 'relative w-full',
			empty: 'absolute inset-0 flex flex-col justify-end gap-[var(--space-1)]',
			baseline: 'h-px w-full bg-[var(--border)]',
			emptyLabel: 'text-caption font-normal text-[var(--ink-muted)]'
		},
		variants: {
			tone: {
				asset: {},
				desk: {},
				project: {},
				brand: {}
			}
		},
		defaultVariants: { tone: 'brand' }
	});

	export type SparklineTone = NonNullable<VariantProps<typeof sparkline>['tone']>;

	/** The domain colour per tone, as a `var()` string: an SVG stroke takes a colour, not a class. */
	const STROKE: Record<SparklineTone, string> = {
		asset: 'var(--asset)',
		desk: 'var(--desk)',
		project: 'var(--project)',
		brand: 'var(--brand)'
	};
</script>

<script lang="ts">
	import { Area, Chart, LinearGradient, Spline, Svg } from 'layerchart';
	import { isEmptySeries, seriesPeak, type SparklinePoint } from '#lib/domain/sparkline.js';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		/**
		 * A dense series — one point per day, zeros included. The server's
		 * `densifyDailyCounts` guarantees that; this component does not re-derive
		 * it, because a chart that silently filled its own gaps would hide a
		 * query that stopped returning them.
		 */
		points: readonly SparklinePoint[];
		/** Domain colour. Matches the module the number belongs to. */
		tone?: SparklineTone;
		/**
		 * What the line is of, as a sentence: this is the chart's accessible
		 * name, and the only thing a screen reader gets. Required, because a
		 * nameless `role="img"` is announced as "image" and says nothing.
		 */
		label: string;
		/** Reserved height in px. Fixed so the card cannot shift as the line arrives. */
		height?: number;
		class?: string;
	}

	let { points, tone = 'brand', label, height = 32, class: className }: Props = $props();

	const empty = $derived(isEmptySeries(points));

	/**
	 * The y axis starts at zero, always, and never at the series minimum.
	 *
	 * This is the whole honesty of a sparkline. Left to fit its own data, a week
	 * of 3, 3, 3, 4 becomes a cliff — the line climbs from the floor to the
	 * ceiling of the box because the range is one. Anchored at zero, four is a
	 * third taller than three, which is what actually happened.
	 *
	 * The `|| 1` floor only guards a divide-by-zero that the empty state already
	 * catches; it costs nothing and means no arrangement of inputs can produce
	 * a degenerate domain.
	 */
	const peak = $derived(seriesPeak(points));
	const ceiling = $derived(peak || 1);

	/**
	 * The `YYYY-MM-DD` keys are parsed into real `Date`s before the chart sees
	 * them, and that is not cosmetic.
	 *
	 * `layerchart` infers its x scale from the first value it finds: a string
	 * gives `scaleBand`, which places each point at the *start* of its band, so
	 * a seven-day line would stop a seventh short of the right edge and the last
	 * day would never reach it. A `Date` gives `scaleTime`, which is both the
	 * correct scale for a time series and the one that spans the full width.
	 *
	 * `T00:00:00Z` is appended explicitly: a bare `YYYY-MM-DD` is parsed as UTC
	 * by spec, but the appended form is unambiguous to a reader as well, and it
	 * keeps the parse in the same zone the SQL bucketed in.
	 */
	const series = $derived(
		points.map((point) => ({ at: new Date(`${point.date}T00:00:00Z`), count: point.count }))
	);

	/**
	 * The chart's accessible name. A screen reader cannot read a path, so it is
	 * handed the two facts the shape conveys — how many days, and the busiest
	 * one — rather than a label that stops at "gráfico".
	 */
	const accessibleName = $derived(
		empty
			? `${label}: ${m.chart_empty()}`
			: `${label}: ${m.chart_sparkline_description({ days: points.length, peak })}`
	);
</script>

<!--
	**The hard rule of this phase**: no data means an empty state, never a chart.

	The benchmark failure it exists to avoid is a chart library handed an empty
	series, inventing a −1.0→1.0 axis and plotting one dot in the middle — a
	picture of nothing that looks like a measurement. So the branch below is not
	a nicety: a flat rule at `--border` plus "Sin datos todavía" says the same
	true thing and cannot be misread as a trend.

	`isEmptySeries` makes that call on the server's own terms — thirty buckets of
	zero is *no data*, not a flat line at zero.

	**Why the chart half is client-only.** `layerchart`'s `Chart` measures its
	container, and with no explicit width it assumes 100px until it can (its
	`ssr` mode renders at that placeholder and corrects after hydration, which
	is a line visibly snapping to a new width). A sparkline is fluid by
	definition — it fills whatever column the KPI grid gave it — so the honest
	trade is to render nothing until the width is real, with `height` reserved so
	the arrival costs no layout shift. The empty state is plain markup and so
	*is* server-rendered, which matters because a fresh install is exactly when
	it shows.
-->
<div
	class={sparkline().root({ class: className })}
	style:height="{height}px"
	role="img"
	aria-label={accessibleName}
>
	{#if empty}
		<div class={sparkline().empty()}>
			<div class={sparkline().baseline()}></div>
			<span class={sparkline().emptyLabel()}>{m.chart_empty()}</span>
		</div>
	{:else}
		<Chart data={series} x="at" y="count" yDomain={[0, ceiling]} padding={{ top: 2, bottom: 2 }}>
			<Svg>
				<!--
					The fill is a fade of the same token, not a second colour: it gives
					the line a body at 32px tall without introducing a hue the design
					system never assigned. `--asset` at 22% down to nothing.
				-->
				<LinearGradient stops={[STROKE[tone], 'transparent']} vertical class="opacity-[0.22]">
					{#snippet children({ gradient })}
						<Area y0={0} fill={gradient} />
					{/snippet}
				</LinearGradient>
				<!--
					Straight segments, not a spline. A smoothed curve would draw values
					between two days that nobody measured — a Tuesday peak bleeding
					visibly into Monday and Wednesday — and these buckets are discrete
					whole-day counts. `layerchart`'s default linear curve is the honest
					one here, and it also keeps `d3-shape` out of the import graph.
				-->
				<Spline stroke={STROKE[tone]} width={1.5} stroke-linecap="round" />
			</Svg>
		</Chart>
	{/if}
</div>
