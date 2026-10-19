import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { can } from '#lib/server/access/permissions.js';
import { countAssetsInCustodyOf } from '#lib/server/assets/index.js';
import { requirePermission } from '#lib/server/auth/guards.js';
import {
	countTeams,
	createPerson,
	deactivatePerson,
	listDepartments,
	listLocations,
	listPeople,
	personInput,
	reactivatePerson,
	setPersonLocation,
	updatePerson
} from '#lib/server/directory/index.js';
import { countOpenTicketsAssignedTo } from '#lib/server/service-desk/index.js';
import { fieldsOf, rejected, withId } from '../assets/form-data';
import { locationOptions, options } from '../assets/options';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requirePermission(locals.user, 'people.view');
	const canManagePeople = can(user, 'people.manage');
	const showInactive = url.searchParams.get('inactive') === '1';

	const [people, teams, locations, departments] = await Promise.all([
		listPeople(user.organisationId, { includeInactive: showInactive }),
		countTeams(user.organisationId),
		// The pickers feed a form only a person who can manage people sees.
		canManagePeople ? listLocations(user.organisationId) : [],
		canManagePeople ? listDepartments(user.organisationId) : []
	]);

	// `?deactivate=<id>` opens the confirmation with what the person still holds.
	const deactivateId = canManagePeople
		? z.uuid().safeParse(url.searchParams.get('deactivate')).data
		: undefined;
	const target = deactivateId ? people.find((person) => person.id === deactivateId) : undefined;
	const deactivating = target
		? {
				id: target.id,
				assets: await countAssetsInCustodyOf(user.organisationId, target.id),
				tickets: await countOpenTicketsAssignedTo(user.organisationId, target.id)
			}
		: null;

	return {
		people,
		teams,
		canManagePeople,
		showInactive,
		openCreate: canManagePeople && url.searchParams.get('new') === '1',
		deactivating,
		locations: locationOptions(locations),
		departments: options(departments, (department) => department.name)
	};
};

/** Blank and too long are different mistakes and deserve different sentences. */
function issueOf(fields: Record<string, string>): string {
	if (!fields.fullName?.trim()) return m.validation_name_required();
	if (fields.fullName.trim().length > 120) return m.validation_name_too_long({ max: 120 });
	return m.validation_email();
}

const locationField = z.union([z.uuid(), z.literal('').transform(() => null)]);

const failureMessage = {
	not_found: () => m.directory_error_not_found(),
	duplicate_email: () => m.directory_error_duplicate_email(),
	department_not_found: () => m.directory_error_department_not_found(),
	location_not_found: () => m.directory_error_location_not_found(),
	email_locked: () => m.directory_error_email_locked(),
	self: () => m.directory_error_self(),
	already_inactive: () => m.directory_error_already_inactive(),
	already_active: () => m.directory_error_already_active()
} as const;

export const actions: Actions = {
	createPerson: async ({ locals, request }) => {
		const user = requirePermission(locals.user, 'people.manage');
		const fields = await fieldsOf(request);
		const parsed = personInput.safeParse(fields);
		if (!parsed.success) return rejected('createPerson', issueOf(fields));

		const outcome = await createPerson(user, parsed.data);
		if (!outcome.ok) return rejected('createPerson', failureMessage[outcome.error]());
		return { action: 'createPerson' as const, message: null, id: null };
	},

	updatePerson: async ({ locals, request }) => {
		const user = requirePermission(locals.user, 'people.manage');
		const fields = await fieldsOf(request);
		const target = withId.safeParse(fields);
		if (!target.success) return rejected('updatePerson', m.directory_error_not_found());
		const personId = target.data.id;

		// A disabled email field is not posted: the key is absent, so it stays untouched.
		const parsed = personInput.partial({ email: true }).safeParse({
			...fields,
			email: 'email' in fields ? fields.email : undefined
		});
		const location = locationField.safeParse(fields.locationId ?? '');
		if (!parsed.success || !location.success) {
			return rejected(
				'updatePerson',
				parsed.success ? m.directory_error_invalid() : issueOf(fields),
				personId
			);
		}

		const { fullName, email, departmentId } = parsed.data;
		const updated = await updatePerson(user, personId, { fullName, email, departmentId });
		if (!updated.ok) return rejected('updatePerson', failureMessage[updated.error](), personId);

		const placed = await setPersonLocation(user, personId, location.data);
		if (!placed.ok) return rejected('updatePerson', failureMessage[placed.error](), personId);
		return { action: 'updatePerson' as const, message: null, id: null };
	},

	deactivatePerson: async ({ locals, request }) => {
		const user = requirePermission(locals.user, 'people.manage');
		const target = withId.safeParse(await fieldsOf(request));
		if (!target.success) return rejected('deactivatePerson', m.directory_error_not_found());

		const outcome = await deactivatePerson(user, target.data.id);
		if (!outcome.ok) {
			return rejected('deactivatePerson', failureMessage[outcome.error](), target.data.id);
		}
		return { action: 'deactivatePerson' as const, message: null, id: null };
	},

	reactivatePerson: async ({ locals, request }) => {
		const user = requirePermission(locals.user, 'people.manage');
		const target = withId.safeParse(await fieldsOf(request));
		if (!target.success) return rejected('reactivatePerson', m.directory_error_not_found());

		const outcome = await reactivatePerson(user, target.data.id);
		if (!outcome.ok) {
			return rejected('reactivatePerson', failureMessage[outcome.error](), target.data.id);
		}
		return { action: 'reactivatePerson' as const, message: null, id: null };
	}
};
