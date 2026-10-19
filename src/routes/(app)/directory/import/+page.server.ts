import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { requirePermission } from '#lib/server/auth/guards.js';
import {
	IMPORT_MAX_BYTES,
	PEOPLE_FIELDS,
	commitPeopleImport,
	groupErrors,
	parseCsv,
	planPeopleImport,
	suggestMapping,
	type CsvFailure,
	type Mapping,
	type PeoplePlan
} from '#lib/server/imports/index.js';
import type { Actions, PageServerLoad } from './$types';

/** The first this many errors travel to the page; the count of all of them does too. */
const ERRORS_SENT = 200;

export const load: PageServerLoad = async ({ locals }) => {
	requirePermission(locals.user, 'people.manage');
	return {
		fields: PEOPLE_FIELDS.map(({ key, label, required }) => ({ key, label: label(), required })),
		maxBytes: IMPORT_MAX_BYTES
	};
};

const source = z.union([
	z.object({ column: z.string() }).strict(),
	z.object({ fixed: z.string() }).strict(),
	z.null()
]);
const mappingSchema = z.record(z.string(), source);

const csvMessage = (failure: CsvFailure): string => {
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
};

/** The file and, from the second step on, the mapping — resent on every step (ADR 0034). */
async function readSubmission(request: Request) {
	const data = await request.formData();
	const file = data.get('file');
	if (!(file instanceof File)) return { error: m.import_csv_empty() };
	// Refused before reading it: the body limit already bounds the request.
	if (file.size > IMPORT_MAX_BYTES) {
		return { error: csvMessage('too_large') };
	}
	const bytes = new Uint8Array(await file.arrayBuffer());

	const rawMapping = data.get('mapping');
	if (typeof rawMapping !== 'string') return { bytes, mapping: null };
	try {
		const parsed = mappingSchema.safeParse(JSON.parse(rawMapping));
		return parsed.success
			? { bytes, mapping: parsed.data as Mapping }
			: { error: m.import_error_mapping_invalid() };
	} catch {
		return { error: m.import_error_mapping_invalid() };
	}
}

function summary(plan: PeoplePlan) {
	return {
		create: plan.toCreate.length,
		skipped: plan.skipped.length,
		newDepartments: plan.newDepartments,
		newLocations: plan.newLocations,
		ignoredColumns: plan.ignoredColumns,
		errorCount: plan.errors.length,
		groups: groupErrors(plan.errors),
		errors: plan.errors.slice(0, ERRORS_SENT)
	};
}

export const actions: Actions = {
	analyse: async ({ locals, request }) => {
		requirePermission(locals.user, 'people.manage');
		const submission = await readSubmission(request);
		if ('error' in submission)
			return fail(400, { step: 'analyse' as const, message: submission.error });

		const parsed = parseCsv(submission.bytes);
		if (!parsed.ok)
			return fail(400, { step: 'analyse' as const, message: csvMessage(parsed.error) });

		const { headers, rows } = parsed.value;
		return {
			step: 'analyse' as const,
			headers,
			sample: headers.map((_, index) =>
				rows
					.slice(0, 3)
					.map((row) => row[index] ?? '')
					.filter((value) => value !== '')
			),
			suggested: suggestMapping(PEOPLE_FIELDS, headers)
		};
	},

	preview: async ({ locals, request }) => {
		const user = requirePermission(locals.user, 'people.manage');
		const submission = await readSubmission(request);
		if ('error' in submission || !submission.mapping) {
			return fail(400, {
				step: 'preview' as const,
				message: submission.error ?? m.import_error_mapping_invalid()
			});
		}
		const plan = await planPeopleImport(user, submission.bytes, submission.mapping);
		return { step: 'preview' as const, ...summary(plan) };
	},

	commit: async ({ locals, request }) => {
		const user = requirePermission(locals.user, 'people.manage');
		const submission = await readSubmission(request);
		if ('error' in submission || !submission.mapping) {
			return fail(400, {
				step: 'commit' as const,
				message: submission.error ?? m.import_error_mapping_invalid()
			});
		}
		const outcome = await commitPeopleImport(user, submission.bytes, submission.mapping);
		if (!outcome.ok) return fail(409, { step: 'preview' as const, ...summary(outcome.error.plan) });
		return { step: 'commit' as const, ...outcome.value };
	}
};
