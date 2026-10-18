import { fail } from '@sveltejs/kit';
import { PRODUCT_NAME_MAX, UPLOAD_SLOTS, type UploadSlot } from '#lib/domain/brand.js';
import { m } from '#lib/paraglide/messages.js';
import {
	getBrand,
	removeBrandAsset,
	setBrandAsset,
	updateBranding
} from '#lib/server/directory/index.js';
import { requireSettingsSection } from '#lib/server/settings/guard.js';
import { logoErrorMessage } from './logo-errors';
import type { Actions, PageServerLoad } from './$types';

const SECTION = '/settings/platform/branding';

/** The slot a form names, or `null`: only the three upload slots exist for a person. */
function uploadSlot(value: FormDataEntryValue | null): UploadSlot | null {
	return UPLOAD_SLOTS.find((slot) => slot === value) ?? null;
}

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireSettingsSection(locals.user, SECTION);
	return { brand: await getBrand(user.organisationId), productNameMax: PRODUCT_NAME_MAX };
};

export const actions: Actions = {
	save: async ({ locals, request }) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const data = await request.formData();
		const productName = String(data.get('productName') ?? '');
		// An empty colour field is "use Unitati's": the action maps it to `null`.
		const rawColor = String(data.get('brandColor') ?? '').trim();

		const outcome = await updateBranding(user, {
			productName,
			brandColor: rawColor === '' ? null : rawColor
		});
		if (!outcome.ok) {
			const colourRefused = outcome.error === 'invalid-brand-color';
			return fail(outcome.error === 'forbidden' ? 403 : 400, {
				productName,
				brandColor: rawColor,
				error: colourRefused ? null : m.branding_product_name_error(),
				colorError: colourRefused ? m.branding_color_error() : null
			});
		}

		return { saved: true as const, productName: outcome.value.productName };
	},

	uploadAsset: async ({ locals, request }) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const data = await request.formData();
		const slot = uploadSlot(data.get('slot'));
		if (!slot) return fail(400, { assetError: null });

		const file = data.get('file');
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { assetError: { slot, message: m.branding_logo_error_missing() } });
		}

		const outcome = await setBrandAsset(user, slot, new Uint8Array(await file.arrayBuffer()));
		if (!outcome.ok) {
			if (outcome.error === 'forbidden') return fail(403, { assetError: null });
			return fail(400, { assetError: { slot, message: logoErrorMessage(outcome.error) } });
		}

		return { uploaded: slot };
	},

	removeAsset: async ({ locals, request }) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const slot = uploadSlot((await request.formData()).get('slot'));
		if (!slot) return fail(400, { assetError: null });

		const outcome = await removeBrandAsset(user, slot);
		if (!outcome.ok) return fail(403, { assetError: null });

		return { removed: slot };
	}
};
