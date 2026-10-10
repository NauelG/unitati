import { requirePermission } from '#lib/server/auth/guards.js';
import { countTeams, listPeople } from '#lib/server/directory/index.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requirePermission(locals.user, 'people.view');
	const [people, teams] = await Promise.all([
		listPeople(user.organisationId),
		countTeams(user.organisationId)
	]);
	return { people, teams };
};
