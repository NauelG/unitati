import { fail } from '@sveltejs/kit';
import { m } from '#lib/paraglide/messages.js';
import { requirePermission } from '#lib/server/auth/guards.js';
import {
	ERRORS_SENT,
	IMPORT_MAX_BYTES,
	PEOPLE_FIELDS,
	commitPeopleImport,
	csvMessage,
	groupErrors,
	mappingSchema,
	parseCsv,
	readSubmission,
	planPeopleImport,
	suggestMapping,
	type Mapping,
	type PeoplePlan
} from '#lib/server/imports/index.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requirePermission(locals.user, 'people.edit');
	return {
		fields: PEOPLE_FIELDS.map(({ key, label, required }) => ({ key, label: label(), required })),
		maxBytes: IMPORT_MAX_BYTES
	};
};

const readMapping = (request: Request) => readSubmission<Mapping>(request, mappingSchema);

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
		requirePermission(locals.user, 'people.edit');
		const submission = await readMapping(request);
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
		const user = requirePermission(locals.user, 'people.edit');
		const submission = await readMapping(request);
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
		const user = requirePermission(locals.user, 'people.edit');
		const submission = await readMapping(request);
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
