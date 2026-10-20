import { fail } from '@sveltejs/kit';
import { LABEL_OWNER_TEXT_MAX } from '#lib/domain/label-formats.js';
import { m } from '#lib/paraglide/messages.js';
import { getLabelSettings, setLabelOwnerText } from '#lib/server/assets/index.js';
import { requireSettingsSection } from '#lib/server/settings/guard.js';
import type { Actions, PageServerLoad } from './$types';

const SECTION = '/settings/assets/labels';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireSettingsSection(locals.user, SECTION);
	const settings = await getLabelSettings(user.organisationId);
	return { ownerText: settings.ownerText, ownerTextMax: LABEL_OWNER_TEXT_MAX };
};

export const actions: Actions = {
	save: async ({ locals, request }) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const ownerText = String((await request.formData()).get('ownerText') ?? '');

		const outcome = await setLabelOwnerText(user, ownerText);
		if (!outcome.ok) {
			return fail(outcome.error === 'forbidden' ? 403 : 400, {
				ownerText,
				error: m.label_settings_owner_error({ max: LABEL_OWNER_TEXT_MAX })
			});
		}
		return { saved: true as const, ownerText: outcome.value.ownerText };
	}
};
