import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { can } from '#lib/server/access/permissions.js';
import { listActivity } from '#lib/server/activity/index.js';
import type { SessionUser } from '#lib/server/auth/guards.js';
import { listPeople } from '#lib/server/directory/index.js';
import {
	fieldsOf,
	firstField,
	orNull,
	rejected,
	archiveProject,
	createTask,
	createTaskInput,
	getProject,
	listTasks,
	projectProgress,
	requireProjectRead,
	requireProjectWrite,
	unarchiveProject,
	updateProject,
	updateProjectInput,
	type CreateTaskFailure,
	type UpdateProjectFailure
} from '#lib/server/projects/index.js';
import type { Actions, PageServerLoad } from './$types';

/** The task list and the board are two views of the same data; #125 adds the board. */
const viewParam = z.enum(['list', 'board']).catch('list');

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const user = requireProjectRead(locals.user);

	const found = await getProject(user, params.tag);
	if (!found.ok) error(404, 'Not found');
	const project = found.value;

	const canManage = can(user, 'projects.manage');

	// What the viewer can see of the project: an employee gets their own tasks
	// and counts of exactly those (the domain scopes both from the same viewer).
	const [tasks, progress, people] = await Promise.all([
		listTasks(user, { projectId: project.id }),
		projectProgress(user, project.id),
		canManage && project.archivedAt === null ? listPeople(user.organisationId) : Promise.resolve([])
	]);
	if (!progress.ok) error(404, 'Not found');

	return {
		project,
		tasks,
		progress: progress.value,
		view: viewParam.parse(url.searchParams.get('view')),
		// The permission alone. The page also needs the project not to be archived
		// before it renders any write control: an archived project shows none,
		// not disabled ones.
		canManage,
		people: people.filter((person) => person.active).map(({ id, fullName }) => ({ id, fullName })),
		// Streamed: nothing above waits for the history.
		timeline: listActivity({
			organisationId: user.organisationId,
			target: { projectId: project.id }
		})
	};
};

const updateFailures: Record<
	Exclude<UpdateProjectFailure, 'project_not_found'>,
	readonly [string | null, () => string]
> = {
	project_archived: [null, m.project_error_archived],
	owner_not_found: ['ownerPersonId', m.project_error_owner_missing],
	duplicate_project_tag: ['projectTag', m.project_error_duplicate_tag]
};

const taskFailures: Record<
	Exclude<CreateTaskFailure, 'project_not_found'>,
	readonly [string | null, () => string]
> = {
	project_archived: [null, m.project_error_archived],
	state_not_found: [null, m.task_error_state_missing],
	duplicate_task_tag: [null, m.action_error_invalid]
};

/** The project an action targets. Gone, or out of the viewer's scope, reads as missing. */
async function targetOf(user: SessionUser, tag: string) {
	const found = await getProject(user, tag);
	if (!found.ok) error(404, 'Not found');
	return found.value;
}

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		const user = requireProjectWrite(locals.user);
		const fields = await fieldsOf(request);

		const parsed = updateProjectInput.safeParse({
			name: fields.get('name'),
			description: orNull(fields.get('description')),
			ownerPersonId: orNull(fields.get('ownerPersonId')),
			dueDate: orNull(fields.get('dueDate')),
			projectTag: orNull(fields.get('projectTag')) ?? undefined
		});
		if (!parsed.success) {
			const field = firstField(parsed.error);
			return rejected(
				'update',
				field === 'name' ? m.project_error_name_required() : m.action_error_invalid(),
				field
			);
		}

		const project = await targetOf(user, params.tag);
		const outcome = await updateProject(user, project.id, parsed.data);
		if (!outcome.ok) {
			if (outcome.error === 'project_not_found') error(404, 'Not found');
			const [field, message] = updateFailures[outcome.error];
			return rejected('update', message(), field);
		}

		return {
			action: 'update' as const,
			// The tag is a URL segment: if it changed, the page has to follow it.
			projectTag: parsed.data.projectTag ?? project.projectTag
		};
	},

	archive: async ({ locals, params }) => {
		const user = requireProjectWrite(locals.user);
		const project = await targetOf(user, params.tag);
		const outcome = await archiveProject(user, project.id);
		if (!outcome.ok) error(404, 'Not found');
		return { action: 'archive' as const };
	},

	unarchive: async ({ locals, params }) => {
		const user = requireProjectWrite(locals.user);
		const project = await targetOf(user, params.tag);
		const outcome = await unarchiveProject(user, project.id);
		if (!outcome.ok) error(404, 'Not found');
		return { action: 'unarchive' as const };
	},

	createTask: async ({ request, locals, params }) => {
		const user = requireProjectWrite(locals.user);
		const fields = await fieldsOf(request);

		// A title and nothing else: the state is the domain's default.
		const parsed = createTaskInput.safeParse({ title: fields.get('title') });
		if (!parsed.success) {
			return rejected('createTask', m.task_error_title_required(), 'title');
		}

		const project = await targetOf(user, params.tag);
		const outcome = await createTask(user, project.id, parsed.data);
		if (!outcome.ok) {
			if (outcome.error === 'project_not_found') error(404, 'Not found');
			const [field, message] = taskFailures[outcome.error];
			return rejected('createTask', message(), field);
		}

		return { action: 'createTask' as const, taskTag: outcome.value.taskTag };
	}
};
