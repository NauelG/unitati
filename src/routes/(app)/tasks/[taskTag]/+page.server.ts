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
	getTask,
	listProjects,
	listStates,
	moveTask,
	moveTaskToProject,
	requireProjectRead,
	requireProjectWrite,
	setAssignees,
	updateTask,
	updateTaskInput,
	type AssignFailure,
	type MoveTaskFailure,
	type MoveTaskToProjectFailure,
	type UpdateTaskFailure
} from '#lib/server/projects/index.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = requireProjectRead(locals.user);

	const found = await getTask(user, params.taskTag);
	if (!found.ok) error(404, 'Not found');
	const task = found.value;

	// An archived project is read-only: its tasks render no write affordance.
	const canManage = can(user, 'projects.manage') && !task.projectArchived;

	const [states, people, projects] = canManage
		? await Promise.all([listStates(user), listPeople(user.organisationId), listProjects(user)])
		: [[], [], []];

	return {
		task,
		canManage,
		states: states.map(({ id, name, group }) => ({ id, name, group })),
		people: people.filter((person) => person.active).map(({ id, fullName }) => ({ id, fullName })),
		// The destinations of "Mover a proyecto": active, in scope, and not this one.
		projects: projects
			.filter((project) => project.id !== task.projectId)
			.map(({ id, projectTag, name }) => ({ id, projectTag, name })),
		// Streamed: nothing above waits for the history.
		timeline: listActivity({ organisationId: user.organisationId, target: { taskId: task.id } })
	};
};

/** The task an action targets. Gone, or out of the viewer's scope, reads as missing. */
async function targetOf(user: SessionUser, taskTag: string) {
	const found = await getTask(user, taskTag);
	if (!found.ok) error(404, 'Not found');
	return found.value;
}

const updateFailures: Record<
	Exclude<UpdateTaskFailure, 'task_not_found'>,
	readonly [string | null, () => string]
> = {
	project_archived: [null, m.project_error_archived],
	duplicate_task_tag: [null, m.action_error_invalid]
};

const moveFailures: Record<Exclude<MoveTaskFailure, 'task_not_found'>, () => string> = {
	project_archived: m.project_error_archived,
	state_not_found: m.task_error_state_missing,
	invalid_neighbours: m.action_error_invalid
};

const moveToProjectFailures: Record<
	Exclude<MoveTaskToProjectFailure, 'task_not_found'>,
	() => string
> = {
	project_archived: m.project_error_archived,
	same_project: m.task_error_same_project,
	project_not_found: m.task_error_project_missing
};

const assignFailures: Record<Exclude<AssignFailure, 'task_not_found'>, () => string> = {
	project_archived: m.project_error_archived,
	person_not_found: m.action_error_person_missing
};

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		const user = requireProjectWrite(locals.user);
		const fields = await fieldsOf(request);

		const parsed = updateTaskInput.safeParse({
			title: fields.get('title'),
			description: orNull(fields.get('description')),
			dueDate: orNull(fields.get('dueDate'))
		});
		if (!parsed.success) {
			const field = firstField(parsed.error);
			return rejected(
				'update',
				field === 'title' ? m.task_error_title_required() : m.action_error_invalid(),
				field
			);
		}

		const task = await targetOf(user, params.taskTag);
		const outcome = await updateTask(user, task.id, parsed.data);
		if (!outcome.ok) {
			if (outcome.error === 'task_not_found') error(404, 'Not found');
			const [field, message] = updateFailures[outcome.error];
			return rejected('update', message(), field);
		}

		return { action: 'update' as const };
	},

	// Always the end of the column: placing a card between two others is the
	// board's gesture (#125), not a form's.
	changeState: async ({ request, locals, params }) => {
		const user = requireProjectWrite(locals.user);
		const fields = await fieldsOf(request);

		const stateId = z.uuid().safeParse(fields.get('stateId'));
		if (!stateId.success) return rejected('changeState', m.action_error_invalid(), 'stateId');

		const task = await targetOf(user, params.taskTag);
		const outcome = await moveTask(user, task.id, stateId.data);
		if (!outcome.ok) {
			if (outcome.error === 'task_not_found') error(404, 'Not found');
			return rejected('changeState', moveFailures[outcome.error](), 'stateId');
		}

		return { action: 'changeState' as const };
	},

	moveToProject: async ({ request, locals, params }) => {
		const user = requireProjectWrite(locals.user);
		const fields = await fieldsOf(request);

		const projectId = z.uuid().safeParse(fields.get('projectId'));
		if (!projectId.success) return rejected('moveToProject', m.action_error_invalid(), 'projectId');

		const task = await targetOf(user, params.taskTag);
		const outcome = await moveTaskToProject(user, task.id, projectId.data);
		if (!outcome.ok) {
			if (outcome.error === 'task_not_found') error(404, 'Not found');
			return rejected('moveToProject', moveToProjectFailures[outcome.error](), 'projectId');
		}

		return { action: 'moveToProject' as const };
	},

	setAssignees: async ({ request, locals, params }) => {
		const user = requireProjectWrite(locals.user);
		const fields = await fieldsOf(request);

		const personIds = z
			.array(z.uuid())
			.safeParse([...new Set(fields.all('personIds').filter(Boolean))]);
		if (!personIds.success) return rejected('setAssignees', m.action_error_invalid(), 'personIds');

		const task = await targetOf(user, params.taskTag);
		const outcome = await setAssignees(user, task.id, personIds.data);
		if (!outcome.ok) {
			if (outcome.error === 'task_not_found') error(404, 'Not found');
			return rejected('setAssignees', assignFailures[outcome.error](), 'personIds');
		}

		return { action: 'setAssignees' as const };
	}
};
