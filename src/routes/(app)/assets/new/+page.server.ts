import { fail, redirect } from '@sveltejs/kit';
import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { m } from '#lib/paraglide/messages.js';
import {
	createAssetModel,
	listAssetModels,
	listCategories,
	listManufacturers,
	registerAsset,
	type AssetModelFailure,
	type RegisterAssetFailure
} from '#lib/server/assets/index.js';
import { requirePermission } from '#lib/server/auth/guards.js';
import { listLocations } from '#lib/server/directory/index.js';
import { localiseInvalid, modelForm, registerAssetForm } from '../forms';
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

const modelFailures: Record<
	AssetModelFailure,
	readonly ['name' | 'manufacturerId' | 'categoryId', () => string]
> = {
	duplicate_name: ['name', m.catalogue_error_duplicate],
	manufacturer_not_found: ['manufacturerId', m.catalogue_error_manufacturer_missing],
	category_not_found: ['categoryId', m.catalogue_error_category_missing]
};

export const load: PageServerLoad = async ({ locals }) => {
	const user = requirePermission(locals.user, 'assets.manage');

	const [models, locations, manufacturers, categories] = await Promise.all([
		listAssetModels(user.organisationId),
		listLocations(user.organisationId),
		listManufacturers(user.organisationId),
		listCategories(user.organisationId)
	]);

	return {
		// A new asset starts in stock; the schema alone would start it `in_use`,
		// the first key of the enum.
		form: await superValidate({ state: 'in_stock' }, zod4(registerAssetForm), { id: 'asset' }),
		modelForm: await superValidate(zod4(modelForm), { id: 'model' }),
		models,
		locations,
		manufacturers,
		categories
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

	createModel: async (event) => {
		const user = requirePermission(event.locals.user, 'assets.manage');

		const form = await superValidate(event, zod4(modelForm), { id: 'model' });
		if (!form.valid) return fail(400, { form: localiseInvalid(form) });

		const outcome = await createAssetModel(user, form.data);

		if (!outcome.ok) {
			const [field, text] = modelFailures[outcome.error];
			return setError(form, field, text(), { status: 400 });
		}

		// The id travels in the form's message so the register form can select the
		// model that was just made, which is the whole point of creating it here.
		return message(form, { createdModelId: outcome.value.id });
	}
};
