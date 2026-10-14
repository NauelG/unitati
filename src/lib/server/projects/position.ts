/**
 * Where a task sits inside its board column, as pure arithmetic.
 *
 * Fractional indexing: a task's position is a `numeric`, and dropping it between
 * two neighbours gives it their midpoint, so one move writes one row instead of
 * shifting everything below it. The cost is that repeated drops in the same gap
 * halve it each time; once the gap is too small to halve safely the column is
 * renumbered (`spread`), which is a rare, bounded write.
 *
 * Kept free of the database so the edge cases (empty column, top, bottom, gap
 * exhausted) are a unit test and not a scenario to set up.
 */

/** The distance between neighbours after a renumber, and the margin at the ends. */
export const STEP = 1000;

/** Below this gap two positions are too close to split; the column is renumbered. */
export const MIN_GAP = 1e-6;

export type Placement = { position: number } | { renumber: true };

/**
 * The position between `lower` (the task that will sit above, `null` for the
 * top of the column) and `upper` (the task that will sit below, `null` for the
 * bottom). Both absent means an empty column.
 */
export function placeBetween(lower: number | null, upper: number | null): Placement {
	if (lower === null && upper === null) return { position: STEP };
	if (upper === null) return { position: (lower as number) + STEP };
	if (lower === null) return { position: upper - STEP };

	if (upper - lower < MIN_GAP) return { renumber: true };
	return { position: (lower + upper) / 2 };
}

/** Positions for `count` tasks in their current order, one step apart. */
export function spread(count: number): number[] {
	return Array.from({ length: count }, (_, index) => (index + 1) * STEP);
}
