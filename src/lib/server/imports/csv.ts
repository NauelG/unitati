import { parse } from 'csv-parse/sync';
import { IMPORT_MAX_BYTES, IMPORT_MAX_ROWS } from '#lib/domain/imports.js';
import { failure, success, type Outcome } from '../shared/outcome';
import { normaliseHeader } from './mapping';

export type CsvFailure =
	| 'too_large'
	| 'empty'
	| 'no_header'
	| 'no_rows'
	| 'duplicate_header'
	| 'too_many_rows'
	| { kind: 'unparseable'; line: number | null };

export type ParsedCsv = { headers: string[]; rows: string[][] };

function decode(bytes: Uint8Array): string {
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		// Excel's "CSV" on Windows is not UTF-8.
		return new TextDecoder('windows-1252').decode(bytes);
	}
}

/** `;` when the first line has more of them than `,` outside double quotes. */
function detectDelimiter(text: string): ',' | ';' {
	let commas = 0;
	let semicolons = 0;
	let quoted = false;
	for (const char of text) {
		if (char === '"') quoted = !quoted;
		else if (!quoted && (char === '\n' || char === '\r')) break;
		else if (!quoted && char === ',') commas++;
		else if (!quoted && char === ';') semicolons++;
	}
	return semicolons > commas ? ';' : ',';
}

/**
 * Row numbers a user sees are spreadsheet rows: the header is row 1, the first
 * data row is row 2.
 */
export function parseCsv(bytes: Uint8Array): Outcome<ParsedCsv, CsvFailure> {
	if (bytes.byteLength > IMPORT_MAX_BYTES) return failure('too_large');

	const text = decode(bytes).replace(/^\uFEFF/, '');
	if (text.trim() === '') return failure('empty');

	let records: string[][];
	try {
		records = parse(text, {
			delimiter: detectDelimiter(text),
			bom: true,
			relax_column_count: true,
			skip_empty_lines: true,
			trim: true
		});
	} catch (error) {
		const line = (error as { lines?: unknown }).lines;
		return failure({ kind: 'unparseable', line: typeof line === 'number' ? line : null });
	}

	const [headers, ...rows] = records;
	if (!headers || headers.every((header) => header === '')) return failure('no_header');

	const seen = new Set<string>();
	for (const header of headers) {
		const key = normaliseHeader(header);
		if (seen.has(key)) return failure('duplicate_header');
		seen.add(key);
	}

	if (rows.length === 0) return failure('no_rows');
	if (rows.length > IMPORT_MAX_ROWS) return failure('too_many_rows');
	return success({ headers, rows });
}
