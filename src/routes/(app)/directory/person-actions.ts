import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
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
	personInput,
	reactivatePerson,
	setPersonLocation,
	updatePerson
} from '#lib/server/directory/index.js';
import { fieldsOf, rejected, withId } from '../assets/form-data';

/**
 * The form actions on a person, shared by the directory table and the person
 * page (#298): both mount the same dialogs, so both post to the same names. Each
 * action re-checks its permission; the page that exports it adds none of its own.
 */

type ActionEvent = { locals: App.Locals; request: Request };

/** Blank and too long are different mistakes and deserve different sentences. */
export function issueOf(fields: Record<string, string>): string {
	if (!fields.fullName?.trim()) return m.validation_name_required();
	if (fields.fullName.trim().length > 120) return m.validation_name_too_long({ max: 120 });
	return m.validation_email();
}

const accessInput = z.object({
	id: z.uuid(),
	role: z.enum(['admin', 'technician', 'employee'])
});

const locationField = z.union([z.uuid(), z.literal('').transform(() => null)]);

export const failureMessage = {
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

export const personActions = {
	updatePerson: async ({ locals, request }: ActionEvent) => {
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

	deactivatePerson: async ({ locals, request }: ActionEvent) => {
		const user = requirePermission(locals.user, 'people.manage');
		const target = withId.safeParse(await fieldsOf(request));
		if (!target.success) return rejected('deactivatePerson', m.directory_error_not_found());

		const outcome = await deactivatePersonAndEndSessions(user, target.data.id);
		if (!outcome.ok) {
			return rejected('deactivatePerson', failureMessage[outcome.error](), target.data.id);
		}
		return { action: 'deactivatePerson' as const, message: null, id: null };
	},

	reactivatePerson: async ({ locals, request }: ActionEvent) => {
		const user = requirePermission(locals.user, 'people.manage');
		const target = withId.safeParse(await fieldsOf(request));
		if (!target.success) return rejected('reactivatePerson', m.directory_error_not_found());

		const outcome = await reactivatePerson(user, target.data.id);
		if (!outcome.ok) {
			return rejected('reactivatePerson', failureMessage[outcome.error](), target.data.id);
		}
		return { action: 'reactivatePerson' as const, message: null, id: null };
	},

	grantAccess: async ({ locals, request }: ActionEvent) => {
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

	resetPassword: async ({ locals, request }: ActionEvent) => {
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

	changeRole: async ({ locals, request }: ActionEvent) => {
		const user = requirePermission(locals.user, 'people.manage');
		const parsed = accessInput.safeParse(await fieldsOf(request));
		if (!parsed.success) return rejected('changeRole', m.directory_error_invalid());

		const outcome = await changeRole(user, parsed.data.id, parsed.data.role);
		if (!outcome.ok) return rejected('changeRole', failureMessage[outcome.error](), parsed.data.id);
		return { action: 'changeRole' as const, message: null, id: null };
	},

	revokeAccess: async ({ locals, request }: ActionEvent) => {
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
