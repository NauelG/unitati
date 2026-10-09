import { redirect } from '@sveltejs/kit';
import { STAFF_SHELL_PERMISSIONS } from '#lib/domain/access.js';
import { can } from '#lib/server/access/permissions.js';
import { requireUser } from '#lib/server/auth/guards.js';
import type { PageServerLoad } from './$types';

/** An employee's home is the portal; the overview belongs to the staff shell. */
export const load: PageServerLoad = ({ locals }) => {
	const user = requireUser(locals.user);
	if (!STAFF_SHELL_PERMISSIONS.some((permission) => can(user, permission))) {
		redirect(303, '/portal');
	}
};
