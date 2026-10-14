/**
 * Which rows of a list just *became* urgent (S2, #91): the one fact the
 * single-pulse signal needs, kept apart from any DOM so "never on the first
 * load, once per arrival" is a tested rule rather than a side effect of an
 * effect's timing.
 *
 * A row counts as an arrival when it is urgent now and was not urgent in the
 * list `observe` saw last time — absent, or present but not urgent. The very
 * first list is the page load and reports nothing: a pulse on load would
 * explain no change at all (motion constitution, rule 6).
 */
export function createUrgentArrivals<Row>(options: {
	key: (row: Row) => string;
	isUrgent: (row: Row) => boolean;
}) {
	let previousUrgent: Set<string> | undefined;
	let previousScope: string | undefined;

	return {
		/**
		 * `scope` names which list this is (filters, page): a different scope is a
		 * different list, not a refresh of the same one, so it starts over like a
		 * first load instead of pulsing every urgent row the new filter reveals.
		 */
		observe(rows: readonly Row[], scope = ''): Set<string> {
			if (scope !== previousScope) previousUrgent = undefined;
			previousScope = scope;
			const urgent = new Set(rows.filter(options.isUrgent).map(options.key));
			const arrived = new Set<string>();
			if (previousUrgent) {
				for (const key of urgent) if (!previousUrgent.has(key)) arrived.add(key);
			}
			previousUrgent = urgent;
			return arrived;
		}
	};
}
