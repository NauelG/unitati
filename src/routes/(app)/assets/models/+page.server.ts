import { m } from '#lib/paraglide/messages.js';
import {
	assetModelInput,
	createAssetModel,
	deleteAssetModel,
	listAssetModels,
	listCategories,
	listManufacturers,
	updateAssetModel,
	type AssetModelEditFailure
} from '#lib/server/assets/index.js';
import { requirePermission } from '#lib/server/auth/guards.js';
import { fieldsOf, rejected, withId } from '../form-data';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requirePermission(locals.user, 'assets.manage');

	const [models, manufacturers, categories] = await Promise.all([
		listAssetModels(user.organisationId),
		listManufacturers(user.organisationId),
		listCategories(user.organisationId)
	]);

	return { models, manufacturers, categories };
};

const writeFailures: Record<AssetModelEditFailure, () => string> = {
	duplicate_name: m.catalogue_error_duplicate,
	manufacturer_not_found: m.catalogue_error_manufacturer_missing,
	category_not_found: m.catalogue_error_category_missing,
	not_found: m.catalogue_error_not_found
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const user = requirePermission(locals.user, 'assets.manage');

		const parsed = assetModelInput.safeParse(await fieldsOf(request));
		if (!parsed.success) return rejected('create', m.validation_field_invalid());

		const outcome = await createAssetModel(user, parsed.data);
		if (!outcome.ok) return rejected('create', writeFailures[outcome.error]());
		return { action: 'create' as const, message: null, id: null };
	},

	update: async ({ request, locals }) => {
		const user = requirePermission(locals.user, 'assets.manage');
		const fields = await fieldsOf(request);

		const target = withId.safeParse(fields);
		if (!target.success) return rejected('update', m.catalogue_error_not_found());

		const parsed = assetModelInput.safeParse(fields);
		if (!parsed.success) return rejected('update', m.validation_field_invalid(), target.data.id);

		const outcome = await updateAssetModel(user, target.data.id, parsed.data);
		if (!outcome.ok) return rejected('update', writeFailures[outcome.error](), target.data.id);
		return { action: 'update' as const, message: null, id: null };
	},

	delete: async ({ request, locals }) => {
		const user = requirePermission(locals.user, 'assets.manage');

		const target = withId.safeParse(await fieldsOf(request));
		if (!target.success) return rejected('delete', m.catalogue_error_not_found());

		const outcome = await deleteAssetModel(user, target.data.id);
		if (!outcome.ok) {
			return rejected(
				'delete',
				outcome.error === 'in_use'
					? m.catalogue_error_in_use_model()
					: m.catalogue_error_not_found(),
				target.data.id
			);
		}
		return { action: 'delete' as const, message: null, id: null };
	}
};
