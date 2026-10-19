import type { FieldSource, Mapping } from '#lib/domain/imports.js';

/** One target of an import: what the user maps a CSV column onto. */
export type ImportField = {
	key: string;
	label: () => string;
	required: boolean;
	aliases: readonly string[];
};

/** Lowercase, no accents, `_` and `-` as spaces, single spaces: `Correo_Electrónico` ≡ `correo electronico`. */
export function normaliseHeader(value: string): string {
	return value
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/[_-]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * The comparison key for catalogue names: case, accents and spacing are not
 * what makes two departments different.
 */
export function matchKey(value: string): string {
	return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * For each field in declaration order, the first header not yet taken whose
 * normalised form is one of its aliases. Declaration order is alias priority:
 * a header matched by an earlier field is never reused.
 */
export function suggestMapping(fields: readonly ImportField[], headers: string[]): Mapping {
	const normalised = headers.map(normaliseHeader);
	const used = new Set<number>();
	const mapping: Mapping = {};

	for (const field of fields) {
		const aliases = new Set(field.aliases.map(normaliseHeader));
		const index = normalised.findIndex((header, i) => !used.has(i) && aliases.has(header));
		if (index === -1) {
			mapping[field.key] = null;
			continue;
		}
		used.add(index);
		mapping[field.key] = { column: headers[index] };
	}
	return mapping;
}

/** The trimmed cell for a column, the literal for a fixed value, `''` for nothing. */
export function resolveValue(
	source: FieldSource | undefined,
	row: string[],
	headerIndex: ReadonlyMap<string, number>
): string {
	if (!source) return '';
	if ('fixed' in source) return source.fixed.trim();
	const index = headerIndex.get(source.column);
	return index === undefined ? '' : (row[index] ?? '').trim();
}
