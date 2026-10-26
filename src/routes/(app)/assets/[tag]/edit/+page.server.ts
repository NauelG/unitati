import { error, fail, redirect } from '@sveltejs/kit';
import { setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { m } from '#lib/paraglide/messages.js';
import {
	getAssetByTag,
	listAssetModels,
	updateAssetDetails,
	type UpdateAssetFailure
} from '#lib/server/assets/index.js';
import { requirePermission, type SessionUser } from '#lib/server/auth/guards.js';
import { createModelAction, emptyModelForm, modelCatalogues } from '../../create-model.server';
import { editAssetForm, localiseInvalid } from '../../forms';
import type { Actions, PageServerLoad } from './$types';

/**
 * Editing needs the whole row and the id behind it. A shared row has neither,
 * and `assets.manage` implies `assets.view`, so reaching the `else` here means
 * the page does not exist for this viewer.
 */
async function targetOf(user: SessionUser, tag: string) {
	const found = await getAssetByTag(user, tag);
	if (!found.ok || found.value.visibility !== 'full') error(404, 'Not found');
	return found.value;
}

const editFailures: Record<
	Exclude<UpdateAssetFailure, 'asset_not_found'>,
	readonly ['assetTag' | 'serial' | 'assetModelId', () => string]
> = {
	duplicate_asset_tag: ['assetTag', m.asset_error_duplicate_tag],
	duplicate_serial: ['serial', m.asset_error_duplicate_serial],
	model_not_found: ['assetModelId', m.asset_error_model_missing]
};

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = requirePermission(locals.user, 'assets.manage');
	const asset = await targetOf(user, params.tag);

	return {
		assetTag: asset.assetTag,
		form: await superValidate(
			{
				name: asset.name,
				assetTag: asset.assetTag,
				serial: asset.serial,
				assetModelId: asset.assetModelId,
				shared: asset.shared
			},
			zod4(editAssetForm)
		),
		models: await listAssetModels(user.organisationId),
		modelForm: await emptyModelForm(),
		...(await modelCatalogues(user))
	};
};

export const actions: Actions = {
	save: async (event) => {
		const user = requirePermission(event.locals.user, 'assets.manage');
		const asset = await targetOf(user, event.params.tag);

		const form = await superValidate(event, zod4(editAssetForm));
		if (!form.valid) return fail(400, { form: localiseInvalid(form) });

		const outcome = await updateAssetDetails(user, asset.id, {
			...form.data,
			// A cleared serial arrives as `null`, which is how a correction removes
			// one; `undefined` would mean "leave it alone".
			serial: form.data.serial ?? null
		});

		if (!outcome.ok) {
			if (outcome.error === 'asset_not_found') error(404, 'Not found');

			const [field, text] = editFailures[outcome.error];
			return setError(form, field, text(), { status: 400 });
		}

		// The tag is the URL (ADR 0010): a rename moves the page.
		redirect(303, `/assets/${encodeURIComponent(form.data.assetTag ?? asset.assetTag)}`);
	},

	createModel: createModelAction
};
