import { redirect } from '@sveltejs/kit';
import { m } from '#lib/paraglide/messages.js';
import { requirePermission } from '#lib/server/auth/guards.js';
import { listPeople } from '#lib/server/directory/index.js';
import {
	fieldsOf,
	firstField,
	orNull,
	rejected,
	createProject,
	createProjectInput,
	requireProjectWrite,
	type CreateProjectFailure
} from '#lib/server/projects/index.js';
import type { Actions, PageServerLoad } from './$types';

/**
 * Which field each refusal belongs to, and the sentence for it. A record over
 * the failure union: a failure added to the domain without a line here is a type
 * error, not a form that quietly shows nothing.
 */
const failures: Record<CreateProjectFailure, readonly [string, () => string]> = {
	owner_not_found: ['ownerPersonId', m.project_error_owner_missing],
	duplicate_project_tag: ['projectTag', m.project_error_duplicate_tag]
};

export const load: PageServerLoad = async ({ locals }) => {
	const user = requirePermission(locals.user, 'projects.manage');
	const people = await listPeople(user.organisationId);

	return {
		people: people.filter((person) => person.active).map(({ id, fullName }) => ({ id, fullName })),
		// The owner defaults to the person creating the project.
		defaultOwnerId: user.personId
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		// A form action does not re-run its page's `load`, so it gates itself.
		const user = requireProjectWrite(locals.user);
		const fields = await fieldsOf(request);

		const parsed = createProjectInput.safeParse({
			name: fields.get('name'),
			description: orNull(fields.get('description')),
			ownerPersonId: orNull(fields.get('ownerPersonId')),
			dueDate: orNull(fields.get('dueDate')),
			visibility: orNull(fields.get('visibility')) ?? undefined
		});
		if (!parsed.success) {
			const field = firstField(parsed.error);
			return rejected(
				'create',
				field === 'name' ? m.project_error_name_required() : m.action_error_invalid(),
				field
			);
		}

		const outcome = await createProject(user, parsed.data);
		if (!outcome.ok) {
			const [field, message] = failures[outcome.error];
			return rejected('create', message(), field);
		}

		redirect(303, `/projects/${encodeURIComponent(outcome.value.projectTag)}`);
	}
};
