import { z } from 'zod';
import { can } from '#lib/server/access/permissions.js';
import { countAssetsInCustodyOf } from '#lib/server/assets/index.js';
import { requirePermission } from '#lib/server/auth/guards.js';
import {
	countTeams,
	createPerson,
	listDepartments,
	listLocations,
	listPeople,
	personInput
} from '#lib/server/directory/index.js';
import { countOpenTicketsAssignedTo } from '#lib/server/service-desk/index.js';
import { fieldsOf, rejected } from '../assets/form-data';
import { locationOptions, options } from '../assets/options';
import { failureMessage, issueOf, personActions } from './person-actions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requirePermission(locals.user, 'people.view');
	const canManagePeople = can(user, 'people.manage');
	// Admins hold both; a technician holds `people.edit` only when the organisation lends it (ADR 0044).
	const canEditPeople = can(user, 'people.edit');
	const canCheckout = can(user, 'assets.checkout');
	const showInactive = url.searchParams.get('inactive') === '1';

	const [people, teams, locations, departments] = await Promise.all([
		listPeople(user.organisationId, { includeInactive: showInactive }),
		countTeams(user.organisationId),
		// The pickers feed a form only a person who can edit people sees.
		canEditPeople ? listLocations(user.organisationId) : [],
		canEditPeople ? listDepartments(user.organisationId) : []
	]);

	// `?deactivate=<id>` opens the confirmation with what the person still holds.
	const deactivateId = canManagePeople
		? z.uuid().safeParse(url.searchParams.get('deactivate')).data
		: undefined;
	const target = deactivateId ? people.find((person) => person.id === deactivateId) : undefined;
	const deactivating = target
		? {
				id: target.id,
				fullName: target.fullName,
				assets: await countAssetsInCustodyOf(user.organisationId, target.id),
				tickets: await countOpenTicketsAssignedTo(user.organisationId, target.id)
			}
		: null;

	// The actions refuse these too; the menu just does not offer them (#230).
	const activeAdmins = people.filter((person) => person.active && person.role === 'admin');

	return {
		people,
		teams,
		selfPersonId: user.personId,
		lastAdminId: activeAdmins.length === 1 ? activeAdmins[0].id : null,
		canManagePeople,
		canEditPeople,
		canCheckout,
		showInactive,
		openCreate: canEditPeople && url.searchParams.get('new') === '1',
		deactivating,
		locations: locationOptions(locations),
		departments: options(departments, (department) => department.name)
	};
};

export const actions: Actions = {
	...personActions,
	createPerson: async ({ locals, request }) => {
		const user = requirePermission(locals.user, 'people.edit');
		const fields = await fieldsOf(request);
		const parsed = personInput.safeParse(fields);
		if (!parsed.success) return rejected('createPerson', issueOf(fields));

		const outcome = await createPerson(user, parsed.data);
		if (!outcome.ok) return rejected('createPerson', failureMessage[outcome.error]());
		return { action: 'createPerson' as const, message: null, id: null };
	}
};
