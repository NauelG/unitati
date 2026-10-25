import { decimalHours } from '#lib/domain/time.js';
import type { ReportRow } from './report';

/**
 * The CSV export of the filtered time list (ADR 0051): UTF-8, a header row, one
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

/** A cell a spreadsheet would run as a formula; the leading tab and CR are the other classic vectors. */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/**
 * Text is data, never a formula: a cell that starts with `=`, `+`, `-` or `@` is
 * prefixed with a quote so the spreadsheet shows it instead of running it. Then
 * RFC 4180 quoting for commas, quotes and line breaks.
 */
export function csvCell(value: string | number | null | undefined): string {
	if (value === null || value === undefined) return '';
	let text = String(value);
	if (typeof value === 'string' && FORMULA_LEAD.test(text)) text = `'${text}`;
	return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function timeEntriesCsv(rows: readonly ReportRow[]): string {
	const lines = rows.map((row) =>
		[
			row.workDate,
			csvCell(row.personName),
			csvCell(row.typeName),
			row.minutes,
			decimalHours(row.minutes),
			csvCell(row.record.tag),
			csvCell(row.record.title),
			csvCell(row.project?.tag),
			csvCell(row.project?.name),
			csvCell(row.note)
		].join(',')
	);
	return [CSV_COLUMNS.join(','), ...lines].join('\r\n') + '\r\n';
}
