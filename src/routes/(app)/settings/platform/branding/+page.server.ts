import { fail } from '@sveltejs/kit';
import { PRODUCT_NAME_MAX } from '#lib/domain/brand.js';
import { m } from '#lib/paraglide/messages.js';
import { getBrand, updateBranding } from '#lib/server/directory/index.js';
import { requireSettingsSection } from '#lib/server/settings/guard.js';
import type { Actions, PageServerLoad } from './$types';

const SECTION = '/settings/platform/branding';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireSettingsSection(locals.user, SECTION);
	return { brand: await getBrand(user.organisationId), productNameMax: PRODUCT_NAME_MAX };
};

export const actions: Actions = {
	save: async ({ locals, request }) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const data = await request.formData();
		const productName = String(data.get('productName') ?? '');

		const outcome = await updateBranding(user, { productName });
		if (!outcome.ok) {
			return fail(outcome.error === 'forbidden' ? 403 : 400, {
				productName,
				error: m.branding_product_name_error()
			});
		}

		return { saved: true as const, productName: outcome.value.productName };
	}
};
