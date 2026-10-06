import { requirePermission } from '#lib/server/auth/guards.js';
import { listPeople } from '#lib/server/directory/index.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requirePermission(locals.user, 'people.view');
	return { people: await listPeople(user.organisationId) };
};
