import type { RequestEvent } from '@sveltejs/kit';
import { m } from '#lib/paraglide/messages.js';
import {
	createDepartment,
	deleteDepartment,
	departmentInput,
	listDepartments,
	renameDepartment
} from '#lib/server/directory/index.js';
import { requirePermission } from '#lib/server/auth/guards.js';
import { fieldsOf, rejected, withId } from '../../../assets/form-data';

/**
 * Departments are a one-field catalogue: create and rename in a `Dialog`, delete
 * behind a confirmation (ADR 0020). `people.manage` is enforced in the page and
 * in each action; a denial is a 404, as the issue asks, rather than the 403 the
 * other registry sections answer.
 */

/** Blank and too long are different mistakes and deserve different sentences. */
const nameIssue = (name: string | undefined) =>
	(name ?? '').trim().length > 80
		? m.validation_name_too_long({ max: 80 })
		: m.validation_name_required();

export const load = async ({ locals }: RequestEvent) => {
	const user = requirePermission(locals.user, 'people.manage');
	return { departments: await listDepartments(user.organisationId) };
};

export const actions = {
	create: async ({ request, locals }: RequestEvent) => {
		const user = requirePermission(locals.user, 'people.manage');
		const fields = await fieldsOf(request);
		const parsed = departmentInput.safeParse(fields);
		if (!parsed.success) return rejected('create', nameIssue(fields.name));

		const outcome = await createDepartment(user, parsed.data);
		if (!outcome.ok) return rejected('create', m.departments_error_duplicate());
		return { action: 'create' as const, message: null, id: null };
	},

	rename: async ({ request, locals }: RequestEvent) => {
		const user = requirePermission(locals.user, 'people.manage');
		const fields = await fieldsOf(request);
		const target = withId.safeParse(fields);
		if (!target.success) return rejected('rename', m.departments_error_not_found());

		const parsed = departmentInput.safeParse(fields);
		if (!parsed.success) {
			return rejected('rename', nameIssue(fields.name), target.data.id);
		}

		const outcome = await renameDepartment(user, target.data.id, parsed.data);
		if (!outcome.ok) {
			return rejected(
				'rename',
				outcome.error === 'duplicate_name'
					? m.departments_error_duplicate()
					: m.departments_error_not_found(),
				target.data.id
			);
		}
		return { action: 'rename' as const, message: null, id: null };
	},

	delete: async ({ request, locals }: RequestEvent) => {
		const user = requirePermission(locals.user, 'people.manage');
		const target = withId.safeParse(await fieldsOf(request));
		if (!target.success) return rejected('delete', m.departments_error_not_found());

		const outcome = await deleteDepartment(user, target.data.id);
		if (!outcome.ok) {
			const message =
				outcome.error === 'not_found'
					? m.departments_error_not_found()
					: outcome.error.people === 1
						? m.departments_in_use_one()
						: m.departments_in_use_other({ count: outcome.error.people });
			return rejected('delete', message, target.data.id);
		}
		return { action: 'delete' as const, message: null, id: null };
	}
};
