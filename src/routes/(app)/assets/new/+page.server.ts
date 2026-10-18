import { fail, redirect } from '@sveltejs/kit';
import { setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { m } from '#lib/paraglide/messages.js';
import {
	listAssetModels,
	registerAsset,
	type RegisterAssetFailure
} from '#lib/server/assets/index.js';
import { requirePermission } from '#lib/server/auth/guards.js';
import { listLocations } from '#lib/server/directory/index.js';
import { createModelAction, emptyModelForm, modelCatalogues } from '../create-model.server';
import { localiseInvalid, registerAssetForm } from '../forms';
import type { Actions, PageServerLoad } from './$types';

/**
 * Which field each refusal belongs to, and the sentence for it. A record over
 * the failure union rather than a cast: a failure added to the domain without a
 * line here is a type error, not a form that quietly shows nothing. The
 * sentences are functions so they are read per request, in that request's locale.
 */
const registerFailures: Record<
	RegisterAssetFailure,
	readonly ['assetTag' | 'serial' | 'assetModelId' | 'locationId', () => string]
> = {
	duplicate_asset_tag: ['assetTag', m.asset_error_duplicate_tag],
	duplicate_serial: ['serial', m.asset_error_duplicate_serial],
	model_not_found: ['assetModelId', m.asset_error_model_missing],
	location_not_found: ['locationId', m.asset_error_location_missing]
};

export const load: PageServerLoad = async ({ locals }) => {
	const user = requirePermission(locals.user, 'assets.manage');

	const [models, locations, catalogues] = await Promise.all([
		listAssetModels(user.organisationId),
		listLocations(user.organisationId),
		modelCatalogues(user)
	]);

	return {
		// A new asset starts in stock; the schema alone would start it `in_use`,
		// the first key of the enum. Seeding that one field makes Superforms
		// treat this call as "posted" and validate it immediately — `errors:
		// false` keeps that validation from shipping Zod's English sentences to
		// the browser before the visitor has touched the form.
		form: await superValidate({ state: 'in_stock' }, zod4(registerAssetForm), {
			id: 'asset',
			errors: false
		}),
		modelForm: await emptyModelForm(),
		models,
		locations,
		...catalogues
	};
};

export const actions: Actions = {
	register: async (event) => {
		// A form action does not re-run its page's `load`, so it gates itself.
		const user = requirePermission(event.locals.user, 'assets.manage');

		const form = await superValidate(event, zod4(registerAssetForm), { id: 'asset' });
		if (!form.valid) return fail(400, { form: localiseInvalid(form) });

		const outcome = await registerAsset(user, form.data);

		if (!outcome.ok) {
			const [field, text] = registerFailures[outcome.error];
			return setError(form, field, text(), { status: 400 });
		}

		redirect(303, `/assets/${encodeURIComponent(outcome.value.assetTag)}`);
	},

	createModel: createModelAction
};
