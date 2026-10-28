import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { ssoRedirectUri } from '#lib/server/auth/oidc.js';
import {
	authenticationSettingsInput,
	BUTTON_LABEL_MAX,
	getAuthenticationSettings,
	updateAuthenticationSettings
} from '#lib/server/auth/settings.js';
import {
	dismissProvisioningWarning,
	listOpenProvisioningWarnings
} from '#lib/server/directory/index.js';
import { requireSettingsSection } from '#lib/server/settings/guard.js';
import type { Actions, PageServerLoad } from './$types';

const SECTION = '/settings/platform/authentication';

/** The one break-glass address: stated on the page so nobody has to remember it. */
const BREAK_GLASS_PATH = '/login/local';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireSettingsSection(locals.user, SECTION);
	const [settings, warnings] = await Promise.all([
		getAuthenticationSettings(user.organisationId),
		listOpenProvisioningWarnings(user.organisationId)
	]);
	return {
		settings,
		warnings,
		redirectUri: ssoRedirectUri(),
		breakGlassPath: BREAK_GLASS_PATH,
		buttonLabelMax: BUTTON_LABEL_MAX
	};
};

export const actions: Actions = {
	save: async ({ locals, request }) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const data = await request.formData();
		const parsed = authenticationSettingsInput.safeParse({
			buttonLabel: String(data.get('buttonLabel') ?? ''),
			jitProvisioning: data.get('jitProvisioning') === 'true',
			ssoRequired: data.get('ssoRequired') === 'true',
			autoRedirect: data.get('autoRedirect') === 'true'
		});
		if (!parsed.success) return fail(400, { error: m.authentication_error() });

		const outcome = await updateAuthenticationSettings(user, parsed.data);
		if (!outcome.ok) return fail(403, { error: m.authentication_error() });
		return { saved: true as const };
	},

	dismiss: async ({ locals, request }) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const id = z.uuid().safeParse((await request.formData()).get('id'));
		if (!id.success) return fail(400, { error: m.authentication_error() });

		await dismissProvisioningWarning(user.organisationId, id.data);
		return { dismissed: true as const };
	}
};
