import { fail, type RequestEvent } from '@sveltejs/kit';
import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { m } from '#lib/paraglide/messages.js';
import {
	createAssetModel,
	listCategories,
	listManufacturers,
	type AssetModelFailure
} from '#lib/server/assets/index.js';
import { requirePermission, type SessionUser } from '#lib/server/auth/guards.js';
import { localiseInvalid, modelForm } from './forms';

/**
 * Creating a model from the asset forms' dialog (#220). Every route that mounts
 * `CreateModelDialog` posts to a `createModel` action that is this function, so
 * the permission, validation and failure mapping live once.
 */

const modelFailures: Record<
	AssetModelFailure,
	readonly ['name' | 'manufacturerId' | 'categoryId', () => string]
> = {
	duplicate_name: ['name', m.catalogue_error_duplicate],
	manufacturer_not_found: ['manufacturerId', m.catalogue_error_manufacturer_missing],
	category_not_found: ['categoryId', m.catalogue_error_category_missing]
};

/** The empty model form every page hands its dialog. */
export function emptyModelForm() {
	return superValidate(zod4(modelForm), { id: 'model' });
}

/** What the dialog needs besides the form: the two catalogues a model hangs from. */
export async function modelCatalogues(user: SessionUser) {
	const [manufacturers, categories] = await Promise.all([
		listManufacturers(user.organisationId),
		listCategories(user.organisationId)
	]);
	return { manufacturers, categories };
}

export async function createModelAction(event: RequestEvent) {
	// A form action does not re-run its page's `load`, so it gates itself.
	const user = requirePermission(event.locals.user, 'assets.manage');

	const form = await superValidate(event, zod4(modelForm), { id: 'model' });
	if (!form.valid) return fail(400, { form: localiseInvalid(form) });

	const outcome = await createAssetModel(user, form.data);

	if (!outcome.ok) {
		const [field, text] = modelFailures[outcome.error];
		return setError(form, field, text(), { status: 400 });
	}

	// The id travels in the form's message so the asset form can select the
	// model that was just made, which is the whole point of creating it here.
	return message(form, { createdModelId: outcome.value.id });
}
