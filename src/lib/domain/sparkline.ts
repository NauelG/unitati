/**
 * The vocabulary of a date-bucketed count series, and only the vocabulary: the
 * shape, and the one question every consumer of it asks.
 *
 * It lives outside `server/` for the same reason `domain/status.ts` does, and
 * that file already spells the reason out: *"SvelteKit forbids client code from
 * importing a value out of a server-only module"*, and here `Sparkline.svelte`
 * needs both of these. Three layers want them and none owns them:
 *
 * - `server/shared/sparkline.ts` builds the series (the calendar arithmetic,
 *   which is server-only and stays there).
 * - the two domain readers return it.
 * - `Sparkline.svelte` decides, from `isEmptySeries`, whether to draw a chart
 *   at all.
 *
 * Putting `isEmptySeries` here rather than in the component is the point. "No
 * data" has to mean the same thing to the code that produces the series and the
 * code that refuses to plot it, or the hard rule this phase is built on — every
 * chart ships an empty state — is enforced in one place and re-decided in the
 * other.
 */

/** One bucket: a calendar day, and how many rows fell in it. */
export interface SparklinePoint {
	/** `YYYY-MM-DD`, UTC. A plain string, so it survives JSON to the browser unchanged. */
	date: string;
	count: number;
}

/**
 * Whether a series has anything to draw.
 *
 * **A series of all zeros is empty, not a flat line at zero.** That
 * distinction is the whole rule: handed thirty buckets of zero, a chart
 * library will happily invent an axis and plot a straight line, which reads as
 * "nothing is happening, steadily" when the truth is "nothing has happened
 * yet". Only this function is allowed to decide which of the two it is.
 */
export function isEmptySeries(points: readonly SparklinePoint[]): boolean {
	return points.every((point) => point.count === 0);
}

/** The largest count in a series, as the ceiling of a zero-anchored y axis. */
export function seriesPeak(points: readonly SparklinePoint[]): number {
	return Math.max(...points.map((point) => point.count), 0);
}
