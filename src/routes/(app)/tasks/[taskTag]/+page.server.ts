import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { renderMarkdown } from '#lib/server/shared/markdown.js';
import { attachmentFailureMessage } from '#lib/attachment-errors.js';
import { m } from '#lib/paraglide/messages.js';
import { can } from '#lib/server/access/permissions.js';
import type { SessionUser } from '#lib/server/auth/guards.js';
import { unlinkTask } from '#lib/server/links/index.js';
import { taskScreen } from '#lib/server/screens/index.js';
import {
	addTaskAttachments,
	addTaskComment,
	fieldsOf,
	firstField,
	orNull,
	rejected,
	getTask,
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
import { followActions } from '../../follow-actions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = requireProjectRead(locals.user);

	const screen = await taskScreen(user, params.taskTag);
	if (!screen.ok) error(404, 'Not found');
	const { value } = screen;

	return {
		...value,
		descriptionHtml: renderMarkdown(value.task.description ?? '')
	};
};

/** The task an action targets. Gone, or out of the viewer's scope, reads as missing. */
async function targetOf(user: SessionUser, taskTag: string) {
	const found = await getTask(user, taskTag);
	if (!found.ok) error(404, 'Not found');
	return found.value;
}

function commentFailureMessage(error: 'empty_comment' | 'comment_too_long' | 'project_archived') {
	if (error === 'empty_comment') return m.action_error_empty_note();
	if (error === 'comment_too_long') return m.action_error_comment_too_long();
	return m.project_error_archived();
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
	Exclude<MoveTaskToProjectFailure, 'task_not_found' | { kind: string }>,
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
	...followActions(requireProjectRead, async (user, { params }) => {
		const found = await getTask(user, params.taskTag);
		return found.ok ? { taskId: found.value.id } : null;
	}),
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
			if (typeof outcome.error === 'object') {
				return rejected(
					'moveToProject',
					m.task_error_assignees_not_members({
						people: outcome.error.people.map((person) => person.fullName).join(', ')
					}),
					'projectId'
				);
			}
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

	addComment: async ({ request, locals, params }) => {
		const user = requireProjectWrite(locals.user);
		const text = (await fieldsOf(request)).get('text');

		const task = await targetOf(user, params.taskTag);
		const outcome = await addTaskComment(user, task.id, text);
		if (!outcome.ok) {
			if (outcome.error === 'task_not_found') error(404, 'Not found');
			return rejected('addComment', commentFailureMessage(outcome.error));
		}

		return { action: 'addComment' as const };
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
