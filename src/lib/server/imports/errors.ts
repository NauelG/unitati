import type { ImportError, ImportErrorKind } from './people';

export type ErrorGroup = { kind: ImportErrorKind; count: number; rows: number[] };

/** Errors folded by kind, with how many there are and the first five rows each. */
export function groupErrors(errors: readonly ImportError[]): ErrorGroup[] {
	const groups = new Map<ImportErrorKind, ErrorGroup>();
	for (const error of errors) {
		const group = groups.get(error.kind) ?? { kind: error.kind, count: 0, rows: [] };
		group.count++;
		if (error.row !== null && group.rows.length < 5) group.rows.push(error.row);
		groups.set(error.kind, group);
	}
	return [...groups.values()];
}
