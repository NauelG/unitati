import { decimalHours } from '#lib/domain/time.js';
import type { ReportRow } from './report';

/**
 * The CSV export of the filtered time list (ADR 0052): UTF-8, a header row, one
 * row per entry. Pure, so the escaping is provable without a database.
 */

export const CSV_COLUMNS = [
	'work_date',
	'person',
	'type',
	'minutes',
	'hours',
	'record_code',
	'record_title',
	'project_code',
	'project_name',
	'note'
] as const;

/** The list separator: `,` for integrations, `;` for Excel in a Spanish (continental) locale. */
export type CsvSeparator = ',' | ';';

/** The `?sep=` query value of the export: `semicolon` selects `;`, anything else keeps `,`. */
export function parseCsvSeparator(param: string | null): CsvSeparator {
	return param === 'semicolon' ? ';' : ',';
}

/** Excel reads a file without a byte-order mark as Windows-1252 and breaks the accents. */
export const BOM = '\uFEFF';

/** A cell a spreadsheet would run as a formula; the leading tab and CR are the other classic vectors. */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/**
 * Text is data, never a formula: a cell that starts with `=`, `+`, `-` or `@` is
 * prefixed with a quote so the spreadsheet shows it instead of running it. Then
 * RFC 4180 quoting for commas, quotes and line breaks.
 */
export function csvCell(
	value: string | number | null | undefined,
	separator: CsvSeparator = ','
): string {
	if (value === null || value === undefined) return '';
	let text = String(value);
	if (typeof value === 'string' && FORMULA_LEAD.test(text)) text = `'${text}`;
	return text.includes(separator) || /["\r\n]/.test(text)
		? `"${text.replaceAll('"', '""')}"`
		: text;
}

export function timeEntriesCsv(rows: readonly ReportRow[], separator: CsvSeparator = ','): string {
	const quote = (value: string | null | undefined) => csvCell(value, separator);
	const lines = rows.map((row) =>
		[
			row.workDate,
			quote(row.personName),
			quote(row.typeName),
			row.minutes,
			decimalHours(row.minutes),
			quote(row.record.tag),
			quote(row.record.title),
			quote(row.project?.tag),
			quote(row.project?.name),
			quote(row.note)
		].join(separator)
	);
	return BOM + [CSV_COLUMNS.join(separator), ...lines].join('\r\n') + '\r\n';
}
