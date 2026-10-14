import type { SparklinePoint } from '#lib/domain/sparkline.js';

/**
 * How a date-bucketed count series is *built* (#90): the calendar arithmetic,
 * and nothing else. No table, no query — the two domains that expose a
 * sparkline own *which* rows are counted, and this owns how days are bucketed.
 *
 * It lives in `shared/` for the same reason `pagination.ts` does — both
 * `assets` and `service-desk` need the identical windowing, and neither owns
 * it. Under either domain it would be the other one importing across a
 * boundary ADR 0002 draws deliberately.
 *
 * The *shape* (`SparklinePoint`) and the "is this empty" question live one
 * level out, in `#lib/domain/sparkline.js`, because `Sparkline.svelte` needs
 * both and client code cannot import out of `server/`. Same split, and same
 * reason, as `domain/status.ts` versus `server/assets/schema.ts`.
 *
 * Everything here is synchronous and side-effect free, which is the point: the
 * part of a sparkline that is easy to get wrong is the calendar arithmetic, not
 * the `count(*)`, so that part is unit-testable with no Postgres running.
 */

export type { SparklinePoint } from '#lib/domain/sparkline.js';

/**
 * The windows the UI actually asks for (#90: 7 days of ticket openings, 30 of
 * asset registrations). A bound exists because `days` reaches these functions
 * from a caller, and an unbounded window is an invitation to ask for ten years
 * of daily buckets and render 3,650 points into a 64px-wide box.
 */
export const SPARKLINE_MIN_DAYS = 2;
export const SPARKLINE_MAX_DAYS = 90;

/**
 * Clamps a requested window into something a sparkline can actually draw.
 *
 * `SPARKLINE_MIN_DAYS` is 2 rather than 1 because a single point is not a line:
 * with one bucket there is nothing to compare it to, and the chart would render
 * a dot claiming to be a trend.
 */
export function sparklineWindow(days: number): number {
	if (!Number.isFinite(days)) return SPARKLINE_MIN_DAYS;
	return Math.min(SPARKLINE_MAX_DAYS, Math.max(SPARKLINE_MIN_DAYS, Math.trunc(days)));
}

/** `YYYY-MM-DD` in UTC. `toISOString` is the only date formatter that cannot drift. */
export function utcDayKey(at: Date): string {
	return at.toISOString().slice(0, 10);
}

/**
 * Midnight UTC, `days - 1` days before the day `now` falls in: the inclusive
 * lower bound of the window, and what the SQL `>=` is given.
 *
 * `days - 1` and not `days`, because the window counts *today* as one of its
 * buckets. Asking for 7 days means today plus the six before it; subtracting a
 * full 7 would return eight buckets, and the extra one would be the only
 * partial day in the series — a visible dip on the left of every chart.
 */
export function sparklineSince(now: Date, days: number): Date {
	const span = sparklineWindow(days);
	const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	return new Date(midnight - (span - 1) * 24 * 60 * 60 * 1000);
}

/**
 * Turns the sparse rows a `group by` returns into a dense series: exactly
 * `days` points, ascending, with a zero for every day nothing happened.
 *
 * **The zeros are the feature, not padding.** A `group by` emits no row for an
 * empty day, and a line drawn straight from the rows would join Monday to
 * Friday as one smooth segment — reporting a steady week where in fact nothing
 * came in for three days. Densifying here means the chart cannot tell that lie,
 * and it happens server-side so every consumer gets it rather than each one
 * remembering to.
 *
 * Unknown days in `rows` (anything outside the window) are ignored rather than
 * appended: the series length is defined by `days`, not by what the query
 * happened to return.
 */
export function densifyDailyCounts(
	rows: readonly { day: string; count: number }[],
	now: Date,
	days: number
): SparklinePoint[] {
	const span = sparklineWindow(days);
	const counts = new Map(rows.map((row) => [row.day, row.count]));
	const start = sparklineSince(now, span);

	return Array.from({ length: span }, (_, index) => {
		const date = utcDayKey(new Date(start.getTime() + index * 24 * 60 * 60 * 1000));
		return { date, count: counts.get(date) ?? 0 };
	});
}
