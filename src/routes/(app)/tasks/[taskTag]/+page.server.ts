import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { renderMarkdown } from '#lib/server/shared/markdown.js';
import { attachmentFailureMessage } from '#lib/attachment-errors.js';
import { m } from '#lib/paraglide/messages.js';
import { can } from '#lib/server/access/permissions.js';
import type { SessionUser } from '#lib/server/auth/guards.js';
import { listPeople } from '#lib/server/directory/index.js';
import { relatedTo, taskTimeline, unlinkTask } from '#lib/server/links/index.js';
import {
	addTaskAttachments,
	fieldsOf,
	firstField,
	orNull,
	rejected,
	getTask,
	listProjectMembers,
	listProjects,
	listTaskAttachments,
	listStates,
	moveTask,
	moveTaskToProject,
	readAttachmentForm,
	removeTaskAttachment,
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

	const attachments = await listTaskAttachments(user, task.id);
	if (!attachments.ok) error(404, 'Not found');

	const [states, people, projects] = canManage
		? await Promise.all([listStates(user), listPeople(user.organisationId), listProjects(user)])
		: [[], [], []];

	// On a members-only project only its members can be put on the task (ADR 0041),
	// so the picker offers nobody else; the domain refuses the rest regardless.
	const members =
		canManage && task.projectVisibility === 'members'
			? await listProjectMembers(user, task.projectId)
			: null;
	const listed = members?.ok ? new Set(members.value.map((member) => member.personId)) : null;
	const assignable = listed ? people.filter((person) => listed.has(person.id)) : people;

	return {
		task,
		descriptionHtml: renderMarkdown(task.description ?? ''),
		canManage,
		attachments: attachments.value,
		states: states.map(({ id, name, group }) => ({ id, name, group })),
		people: assignable
			.filter((person) => person.active)
			.map(({ id, fullName }) => ({ id, fullName })),
		// The destinations of "Mover a proyecto": active, in scope, and not this one.
		projects: projects
			.filter((project) => project.id !== task.projectId)
			.map(({ id, projectTag, name }) => ({ id, projectTag, name })),
		// Unlinking concerns the ticket, not the project: it asks for
		// `tickets.manage`, and an archived project does not take it away (#151).
		canUnlink: can(user, 'tickets.manage'),
		// Streamed: nothing above waits for the history. The live half — the
		// tickets linked to this task, with the status they have today — is merged
		// in at read time and writes nothing on the task (ADR 0009).
		timelineRail: timelineRailOf(user, task.id)
	};
};

async function timelineRailOf(user: SessionUser, taskId: string) {
	const related = await relatedTo(user, { kind: 'task', id: taskId });

	return { timeline: await taskTimeline(user, taskId, related), related };
}

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
	duplicate_task_tag: ['taskTag', m.task_error_tag_duplicate]
};

/** The keys an in-place edit may post. One field per post: absent ones stay untouched. */
const UPDATE_KEYS = ['title', 'description', 'dueDate', 'taskTag'] as const;

const updateInvalid: Record<(typeof UPDATE_KEYS)[number], () => string> = {
	title: m.task_error_title_required,
	description: m.action_error_invalid,
	dueDate: m.action_error_invalid,
	taskTag: m.task_error_tag_invalid
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
	person_not_found: m.action_error_person_missing,
	not_a_member: m.project_members_error_not_a_member
};

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		const user = requireProjectWrite(locals.user);
		const fields = await fieldsOf(request);

		const posted = Object.fromEntries(
			UPDATE_KEYS.filter((key) => fields.has(key)).map((key) => [
				key,
				key === 'description' || key === 'dueDate' ? orNull(fields.get(key)) : fields.get(key)
			])
		);
		const parsed = updateTaskInput.safeParse(posted);
		if (!parsed.success) {
			const field = firstField(parsed.error);
			const key = UPDATE_KEYS.find((candidate) => candidate === field);
			return rejected('update', (key ? updateInvalid[key] : m.action_error_invalid)(), field);
		}

		const task = await targetOf(user, params.taskTag);
		const outcome = await updateTask(user, task.id, parsed.data);
		if (!outcome.ok) {
			if (outcome.error === 'task_not_found') error(404, 'Not found');
			const [field, message] = updateFailures[outcome.error];
			return rejected('update', message(), field);
		}

		return { action: 'update' as const, taskTag: parsed.data.taskTag ?? params.taskTag };
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

	// The link belongs to the ticket: `tickets.manage`, not `projects.manage`,
	// and open on a task of an archived project. The entry is written on the ticket.
	unlinkTicket: async ({ request, locals, params }) => {
		// Whoever can read the task knows it is there, so they are told plainly: 403.
		const user = requireProjectRead(locals.user);
		if (!can(user, 'tickets.manage')) error(403, 'Forbidden');
		const parsed = z.uuid().safeParse((await fieldsOf(request)).get('recordId'));
		if (!parsed.success) return rejected('unlinkTicket', m.related_unlink_failed());

		const task = await targetOf(user, params.taskTag);
		const outcome = await unlinkTask(user, { ticketId: parsed.data, taskId: task.id });
		// Already gone, e.g. a second tab removed it first: the reload shows the truth.
		if (!outcome.ok && outcome.error !== 'link_not_found') {
			return rejected('unlinkTicket', m.related_unlink_failed());
		}
		return { action: 'unlinkTicket' as const };
	},

	addAttachments: async ({ request, locals, params }) => {
		const user = requireProjectWrite(locals.user);
		const { files } = await readAttachmentForm(request);
		if (files.length === 0) return rejected('addAttachments', m.attachments_pick_none());

		const task = await targetOf(user, params.taskTag);
		const outcome = await addTaskAttachments(user, task.id, files);
		if (!outcome.ok) {
			if (outcome.error === 'task_not_found') error(404, 'Not found');
			return rejected('addAttachments', attachmentFailureMessage(outcome.error));
		}

		return { action: 'addAttachments' as const };
	},

	removeAttachment: async ({ request, locals, params }) => {
		const user = requireProjectWrite(locals.user);
		const { attachmentId } = await readAttachmentForm(request);
		if (!z.uuid().safeParse(attachmentId).success) {
			return rejected('removeAttachment', m.action_error_invalid());
		}

		await targetOf(user, params.taskTag);
		const outcome = await removeTaskAttachment(user, attachmentId);
		// Already gone, e.g. a second tab removed it first: the reload shows the truth.
		if (!outcome.ok && outcome.error !== 'attachment_not_found') {
			return rejected('removeAttachment', attachmentFailureMessage(outcome.error));
		}

		return { action: 'removeAttachment' as const };
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
