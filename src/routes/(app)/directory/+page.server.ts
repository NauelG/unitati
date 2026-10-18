import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { can } from '#lib/server/access/permissions.js';
import { requirePermission } from '#lib/server/auth/guards.js';
import {
	countTeams,
	listLocations,
	listPeople,
	setPersonLocation
} from '#lib/server/directory/index.js';
import { fieldsOf, rejected } from '../assets/form-data';
import { locationOptions } from '../assets/options';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requirePermission(locals.user, 'people.view');
	const canManagePeople = can(user, 'people.manage');
	const [people, teams, locations] = await Promise.all([
		listPeople(user.organisationId),
		countTeams(user.organisationId),
		// The picker feeds a form only a person who can manage people sees.
		canManagePeople ? listLocations(user.organisationId) : []
	]);
	return { people, teams, canManagePeople, locations: locationOptions(locations) };
};

const locationChange = z.object({
	personId: z.uuid(),
	locationId: z.union([z.uuid(), z.literal('').transform(() => null)])
});

export const actions: Actions = {
	setLocation: async ({ locals, request }) => {
		const user = requirePermission(locals.user, 'people.manage');
		const parsed = locationChange.safeParse(await fieldsOf(request));
		if (!parsed.success) return rejected('setLocation', m.directory_error_invalid());

		const { personId, locationId } = parsed.data;
		const outcome = await setPersonLocation(user, personId, locationId);
		if (!outcome.ok) {
			return rejected(
				'setLocation',
				outcome.error === 'not_found'
					? m.directory_error_not_found()
					: m.directory_error_location_not_found(),
				personId
			);
		}
		return { action: 'setLocation' as const, id: personId };
	}
};
