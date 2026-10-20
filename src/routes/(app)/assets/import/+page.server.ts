import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { ASSET_STATES } from '#lib/domain/status.js';
import { requirePermission } from '#lib/server/auth/guards.js';
import {
	ASSET_FIELDS,
	ERRORS_SENT,
	IMPORT_MAX_BYTES,
	commitAssetsImport,
	csvMessage,
	groupErrors,
	mappingSchema,
	parseCsv,
	planAssetsImport,
	readSubmission,
	stateValueSuggestions,
	suggestMapping,
	type AssetsMapping,
	type AssetsPlan
} from '#lib/server/imports/index.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requirePermission(locals.user, 'assets.manage');
	return {
		fields: ASSET_FIELDS.map(({ key, label, required }) => ({ key, label: label(), required })),
		states: ASSET_STATES,
		maxBytes: IMPORT_MAX_BYTES
	};
};

const assetsMappingSchema = z.object({
	fields: mappingSchema,
	stateValues: z.record(z.string(), z.enum(ASSET_STATES))
});

const readMapping = (request: Request) =>
	readSubmission<AssetsMapping>(request, assetsMappingSchema);

function summary(plan: AssetsPlan) {
	const noIdentity = plan.warnings.filter((warning) => warning.kind === 'no_identity').length;
	const categoryIgnored = plan.warnings.filter(
		(warning) => warning.kind === 'category_ignored'
	).length;
	return {
		create: plan.toCreate.length,
		skipped: plan.skipped.length,
		newManufacturers: plan.newManufacturers,
		newCategories: plan.newCategories,
		newModels: plan.newModels,
		newLocations: plan.newLocations,
		newPeople: plan.newPeople.map((person) => `${person.fullName} (${person.email})`),
		warnings: { noIdentity, categoryIgnored },
		ignoredColumns: plan.ignoredColumns,
		errorCount: plan.errors.length,
		groups: groupErrors(plan.errors),
		errors: plan.errors.slice(0, ERRORS_SENT)
	};
}

export const actions: Actions = {
	analyse: async ({ locals, request }) => {
		requirePermission(locals.user, 'assets.manage');
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
			suggested: suggestMapping(ASSET_FIELDS, headers),
			// Per column that could be a state: its distinct values and a suggestion each.
			stateValues: stateValueSuggestions(submission.bytes)
		};
	},

	preview: async ({ locals, request }) => {
		const user = requirePermission(locals.user, 'assets.manage');
		const submission = await readMapping(request);
		if ('error' in submission || !submission.mapping) {
			return fail(400, {
				step: 'preview' as const,
				message: submission.error ?? m.import_error_mapping_invalid()
			});
		}
		const plan = await planAssetsImport(user, submission.bytes, submission.mapping);
		return { step: 'preview' as const, ...summary(plan) };
	},

	commit: async ({ locals, request }) => {
		const user = requirePermission(locals.user, 'assets.manage');
		const submission = await readMapping(request);
		if ('error' in submission || !submission.mapping) {
			return fail(400, {
				step: 'commit' as const,
				message: submission.error ?? m.import_error_mapping_invalid()
			});
		}
		const outcome = await commitAssetsImport(user, submission.bytes, submission.mapping);
		if (!outcome.ok) return fail(409, { step: 'preview' as const, ...summary(outcome.error.plan) });
		return { step: 'commit' as const, ...outcome.value };
	}
};
