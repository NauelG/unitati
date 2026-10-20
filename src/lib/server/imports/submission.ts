import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { IMPORT_MAX_BYTES } from '#lib/domain/imports.js';
import type { CsvFailure } from './csv';

/** The first this many errors travel to the page; the count of all of them does too. */
export const ERRORS_SENT = 200;

export const fieldSource = z.union([
	z.object({ column: z.string() }).strict(),
	z.object({ fixed: z.string() }).strict(),
	z.null()
]);

/** Keyed by target field key. */
export const mappingSchema = z.record(z.string(), fieldSource);

export function csvMessage(failure: CsvFailure): string {
	if (typeof failure === 'object') {
		return failure.line === null
			? m.import_csv_unparseable_unknown()
			: m.import_csv_unparseable({ line: failure.line });
	}
	return {
		too_large: m.import_csv_too_large({ megabytes: IMPORT_MAX_BYTES / (1024 * 1024) }),
		empty: m.import_csv_empty(),
		no_header: m.import_csv_no_header(),
		no_rows: m.import_csv_no_rows(),
		duplicate_header: m.import_csv_duplicate_header(),
		too_many_rows: m.import_csv_too_many_rows()
	}[failure];
}

/**
 * The file and, from the second step on, the mapping — resent on every step
 * (ADR 0034). The mapping is parsed with `schema`; `null` when the step has none.
 */
export async function readSubmission<Mapping>(request: Request, schema: z.ZodType<Mapping>) {
	const data = await request.formData();
	const file = data.get('file');
	if (!(file instanceof File)) return { error: m.import_csv_empty() };
	// Refused before reading it: the body limit already bounds the request.
	if (file.size > IMPORT_MAX_BYTES) return { error: csvMessage('too_large') };
	const bytes = new Uint8Array(await file.arrayBuffer());

	const rawMapping = data.get('mapping');
	if (typeof rawMapping !== 'string') return { bytes, mapping: null };
	try {
		const parsed = schema.safeParse(JSON.parse(rawMapping));
		return parsed.success
			? { bytes, mapping: parsed.data }
			: { error: m.import_error_mapping_invalid() };
	} catch {
		return { error: m.import_error_mapping_invalid() };
	}
}
