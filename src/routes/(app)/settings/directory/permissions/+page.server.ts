import { fail } from '@sveltejs/kit';
import {
	getTechniciansEditDirectory,
	setTechniciansEditDirectory
} from '#lib/server/directory/index.js';
import { requireSettingsSection } from '#lib/server/settings/guard.js';
import type { Actions, PageServerLoad } from './$types';

const SECTION = '/settings/directory/permissions';

/**
 * What the technician role may do in the directory (ADR 0044). One switch lends
 * `people.edit`; credentials, roles and (de)activation stay with admins.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const user = requireSettingsSection(locals.user, SECTION);
	return { techniciansEditDirectory: await getTechniciansEditDirectory(user.organisationId) };
};

export const actions: Actions = {
	save: async ({ locals, request }) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const enabled = (await request.formData()).get('enabled') === 'true';

		const outcome = await setTechniciansEditDirectory(user, enabled);
		if (!outcome.ok) return fail(403);
		return { saved: true as const, enabled: outcome.value };
	}
};
