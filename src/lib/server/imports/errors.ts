export type ErrorGroup<Kind extends string = string> = {
	kind: Kind;
	count: number;
	rows: number[];
};

/** Errors folded by kind, with how many there are and the first five rows each. */
export function groupErrors<Kind extends string>(
	errors: readonly { row: number | null; kind: Kind }[]
): ErrorGroup<Kind>[] {
	const groups = new Map<Kind, ErrorGroup<Kind>>();
	for (const error of errors) {
		const group = groups.get(error.kind) ?? { kind: error.kind, count: 0, rows: [] };
		group.count++;
		if (error.row !== null && group.rows.length < 5) group.rows.push(error.row);
		groups.set(error.kind, group);
	}
	return [...groups.values()];
}
