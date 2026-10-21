import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { can } from '#lib/server/access/permissions.js';
import { countAssetsInCustodyOf, listAssetsHeldBy } from '#lib/server/assets/index.js';
import {
	changeAccessEmail,
	changeRole,
	deactivatePersonAndEndSessions,
	grantAccess,
	resetPassword,
	revokeAccess
} from '#lib/server/auth/access.js';
import { requirePermission } from '#lib/server/auth/guards.js';
import {
	countTeams,
	createPerson,
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
import { takeBackAction } from '../assets/take-back-action';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requirePermission(locals.user, 'people.view');
	const canManagePeople = can(user, 'people.manage');
	const canCheckout = can(user, 'assets.checkout');
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

	// The actions refuse these too; the menu just does not offer them (#230).
	const activeAdmins = people.filter((person) => person.active && person.role === 'admin');
	const takeBackId = canCheckout
		? z.uuid().safeParse(url.searchParams.get('takeBack')).data
		: undefined;
	const takeBackPerson = takeBackId ? people.find((person) => person.id === takeBackId) : undefined;
	const heldAssets = takeBackPerson
		? await listAssetsHeldBy(user.organisationId, takeBackPerson.id)
		: [];

	return {
		people,
		teams,
		selfPersonId: user.personId,
		lastAdminId: activeAdmins.length === 1 ? activeAdmins[0].id : null,
		canManagePeople,
		canCheckout,
		takeBackPerson: takeBackPerson
			? { id: takeBackPerson.id, fullName: takeBackPerson.fullName }
			: null,
		heldAssets,
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

const accessInput = z.object({
	id: z.uuid(),
	role: z.enum(['admin', 'technician', 'employee'])
});

const locationField = z.union([z.uuid(), z.literal('').transform(() => null)]);

const failureMessage = {
	not_found: () => m.directory_error_not_found(),
	duplicate_email: () => m.directory_error_duplicate_email(),
	department_not_found: () => m.directory_error_department_not_found(),
	location_not_found: () => m.directory_error_location_not_found(),
	email_locked: () => m.directory_error_email_locked(),
	no_access: () => m.directory_error_no_access(),
	already_has_access: () => m.directory_error_already_has_access(),
	inactive: () => m.directory_error_inactive(),
	email_taken: () => m.directory_error_duplicate_email(),
	last_admin: () => m.directory_error_last_admin(),
	self: () => m.directory_error_self(),
	already_inactive: () => m.directory_error_already_inactive(),
	already_active: () => m.directory_error_already_active()
} as const;

export const actions: Actions = {
	takeBack: async ({ locals, request }) => {
		const actor = requirePermission(locals.user, 'assets.checkout');
		return takeBackAction(actor, await request.formData());
	},
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
		let updated = await updatePerson(user, personId, { fullName, email, departmentId });
		if (!updated.ok && updated.error === 'email_locked' && email !== undefined) {
			// The address is also the sign-in, so `auth` changes both rows together;
			// the directory then sees an unchanged email and applies the rest.
			const moved = await changeAccessEmail(user, personId, email);
			if (!moved.ok) return rejected('updatePerson', failureMessage[moved.error](), personId);
			updated = await updatePerson(user, personId, { fullName, email, departmentId });
		}
		if (!updated.ok) return rejected('updatePerson', failureMessage[updated.error](), personId);

		const placed = await setPersonLocation(user, personId, location.data);
		if (!placed.ok) return rejected('updatePerson', failureMessage[placed.error](), personId);
		return { action: 'updatePerson' as const, message: null, id: null };
	},

	deactivatePerson: async ({ locals, request }) => {
		const user = requirePermission(locals.user, 'people.manage');
		const target = withId.safeParse(await fieldsOf(request));
		if (!target.success) return rejected('deactivatePerson', m.directory_error_not_found());

		const outcome = await deactivatePersonAndEndSessions(user, target.data.id);
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
	},

	grantAccess: async ({ locals, request }) => {
		const user = requirePermission(locals.user, 'people.manage');
		const parsed = accessInput.safeParse(await fieldsOf(request));
		if (!parsed.success) return rejected('grantAccess', m.directory_error_invalid());

		const outcome = await grantAccess(user, parsed.data.id, parsed.data.role);
		if (!outcome.ok)
			return rejected('grantAccess', failureMessage[outcome.error](), parsed.data.id);
		return {
			action: 'grantAccess' as const,
			message: null,
			id: parsed.data.id,
			temporaryPassword: outcome.value.temporaryPassword
		};
	},

	resetPassword: async ({ locals, request }) => {
		const user = requirePermission(locals.user, 'people.manage');
		const target = withId.safeParse(await fieldsOf(request));
		if (!target.success) return rejected('resetPassword', m.directory_error_not_found());

		const outcome = await resetPassword(user, target.data.id);
		if (!outcome.ok) {
			return rejected('resetPassword', failureMessage[outcome.error](), target.data.id);
		}
		return {
			action: 'resetPassword' as const,
			message: null,
			id: target.data.id,
			temporaryPassword: outcome.value.temporaryPassword
		};
	},

	changeRole: async ({ locals, request }) => {
		const user = requirePermission(locals.user, 'people.manage');
		const parsed = accessInput.safeParse(await fieldsOf(request));
		if (!parsed.success) return rejected('changeRole', m.directory_error_invalid());

		const outcome = await changeRole(user, parsed.data.id, parsed.data.role);
		if (!outcome.ok) return rejected('changeRole', failureMessage[outcome.error](), parsed.data.id);
		return { action: 'changeRole' as const, message: null, id: null };
	},

	revokeAccess: async ({ locals, request }) => {
		const user = requirePermission(locals.user, 'people.manage');
		const target = withId.safeParse(await fieldsOf(request));
		if (!target.success) return rejected('revokeAccess', m.directory_error_not_found());

		const outcome = await revokeAccess(user, target.data.id);
		if (!outcome.ok) {
			return rejected('revokeAccess', failureMessage[outcome.error](), target.data.id);
		}
		return { action: 'revokeAccess' as const, message: null, id: null };
	}
};
