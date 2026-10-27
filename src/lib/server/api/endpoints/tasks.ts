import { z } from 'zod';
import { STATE_GROUPS } from '#lib/domain/status.js';
import { taskTimeline } from '../../links';
import { taskTime } from '../../time';
import {
	assign,
	createTask,
	createTaskInput,
	getProject,
	getTask,
	listTasks,
	moveTask,
	moveTaskToProject,
	setTaskParent,
	unassign,
	updateTask,
	updateTaskInput,
	type AssignFailure,
	type CreateTaskFailure,
	type MoveTaskFailure,
	type MoveTaskToProjectFailure,
	type SetTaskParentFailure,
	type UpdateTaskFailure
} from '../../projects';
import { page, pageWindow } from '../../shared/pagination';
import { created, defineEndpoint, notFound, refusalTable, Reply, type Endpoint } from '../registry';
import { paginationMetaSchema, toMeta } from '../shared-schemas';
import {
	conflicting,
	personNotFound,
	PROJECT_MANAGE,
	PROJECT_READS,
	projectNotFound,
	projectOf,
	statePositions,
	milestoneNotFound,
	stateNotFound,
	tag,
	taskNotFound,
	taskDetailSchema,
	taskOf,
	taskSchema,
	taskToWire,
	withReads,
	writtenTask
} from './project-wire';
import { invalidField } from './refusals';
import { timelineEntrySchema, timelineToWire } from './timeline-wire';

/**
 * The task use cases (ADR 0022). Tasks are addressed by tag (ADR 0010), and so
 * are the projects they belong to. Reads start from the domain's scope: a key
 * limited to `projects.view.assigned` sees the tasks assigned to its owner and
 * no others. A task is moved to a column (`/state`) or to another project
 * (`/project`) by an act of its own, never by a field in the `PATCH`; its place
 * between two cards is board state and not part of the API. So is its parent
 * (`/parent`, ADR 0055): a rule-bound change is an action, not a field.
 */

const taskResponse = z.object({ data: taskSchema });

/** The parent named in a body, by its tag. Out of scope, or of another project, reads as missing. */
const parentNotFound = {
	as: 'field',
	path: 'parentTag',
	message: 'Parent task not found.'
} as const;
const parentIsSubtask = {
	as: 'conflict',
	message: 'The parent task is itself a subtask: subtasks go one level deep.',
	describe: 'The named parent already has a parent of its own.'
} as const;
const parentClosed = {
	as: 'conflict',
	message: 'The parent task is closed: reopen it first.',
	describe: 'The parent is in a `completed` or `cancelled` state and the task is open.'
} as const;

/** How the API answers each failure of the task write use cases (ADR 0047). */
const createRefusals = refusalTable<CreateTaskFailure>({
	project_not_found: projectNotFound,
	project_archived: conflicting,
	state_not_found: stateNotFound,
	milestone_not_found: milestoneNotFound,
	duplicate_task_tag: conflicting,
	parent_not_found: parentNotFound,
	parent_is_subtask: parentIsSubtask,
	parent_closed: parentClosed
});

const updateRefusals = refusalTable<UpdateTaskFailure>({
	task_not_found: taskNotFound,
	project_archived: conflicting,
	duplicate_task_tag: conflicting
});

const moveRefusals = refusalTable<MoveTaskFailure>({
	task_not_found: taskNotFound,
	project_archived: conflicting,
	state_not_found: stateNotFound,
	invalid_neighbours: conflicting,
	// Nothing cascades (ADR 0055): say which subtasks are in the way.
	open_subtasks: {
		as: 'conflict',
		message: ({ subtasks }) =>
			`Close the open subtasks first: ${subtasks.map((task) => task.taskTag).join(', ')}.`,
		details: ({ subtasks }) => ({
			subtasks: subtasks.map((task) => ({ tag: task.taskTag, title: task.title }))
		}),
		describe:
			'The task would close (`completed` or `cancelled`) while some of its subtasks are open; `details.subtasks` lists them.'
	},
	parent_closed: {
		...parentClosed,
		describe: 'The task is a subtask leaving a closed state while its parent is closed.'
	}
});

const setParentRefusals = refusalTable<SetTaskParentFailure>({
	task_not_found: taskNotFound,
	project_archived: conflicting,
	parent_not_found: parentNotFound,
	same_task: { as: 'field', path: 'parentTag', message: 'A task cannot be its own parent.' },
	parent_is_subtask: parentIsSubtask,
	task_has_subtasks: {
		as: 'conflict',
		message: 'The task has subtasks of its own: subtasks go one level deep.',
		describe: 'The task already has subtasks, so it cannot become one.'
	},
	parent_closed: parentClosed
});

const NO_PARENT_NAMED = 'Removing a parent names no parent, so no rule about one can refuse it.';
const removeParentRefusals = refusalTable<SetTaskParentFailure>({
	task_not_found: taskNotFound,
	project_archived: conflicting,
	parent_not_found: { as: 'unreachable', why: NO_PARENT_NAMED },
	same_task: { as: 'unreachable', why: NO_PARENT_NAMED },
	parent_is_subtask: { as: 'unreachable', why: NO_PARENT_NAMED },
	task_has_subtasks: { as: 'unreachable', why: NO_PARENT_NAMED },
	parent_closed: { as: 'unreachable', why: NO_PARENT_NAMED }
});

const reparentRefusals = refusalTable<MoveTaskToProjectFailure>({
	task_not_found: taskNotFound,
	project_not_found: projectNotFound,
	project_archived: conflicting,
	same_project: conflicting,
	// Moving never grants access (ADR 0042): say who is in the way.
	assignees_not_members: {
		as: 'conflict',
		message: ({ people }) =>
			`Add as members or unassign before moving the task: ${people.map((person) => person.fullName).join(', ')}.`,
		describe: 'The target project is members-only and some assignees of the task are not members.'
	}
});

const assignRefusals = refusalTable<AssignFailure>({
	task_not_found: taskNotFound,
	project_archived: conflicting,
	person_not_found: personNotFound,
	not_a_member: conflicting
});

// The person is addressed in the path here, so an unknown one is a missing page and not a bad field.
const unassignRefusals = refusalTable<AssignFailure>({
	task_not_found: taskNotFound,
	project_archived: conflicting,
	person_not_found: { as: 'not_found' },
	not_a_member: conflicting
});

export const listTasksEndpoint = defineEndpoint({
	id: 'tasks.list',
	method: 'GET',
	path: '/tasks',
	summary: 'List the tasks the key can see, in board order.',
	description:
		'Returns one page of tasks, in board order (state group, state position, place in the column). Filter with `projectTag`, `assignee` (a person id), `group`, `parent` (a task tag: its subtasks) and `search`; page with `page` and `perPage` (out-of-range values are clamped). A `projectTag` or `parent` that matches nothing the key can see is an empty page, not a `404`: a filter matching nothing is not an error. A key limited to `projects.view.assigned` sees only the tasks assigned to its owner, and `meta` counts only those. Subtasks are tasks: they are listed like any other, each with its `parent`.',
	example: { projectTag: 'PRJ-0007', group: 'started', page: 1, perPage: 25 },
	permissions: PROJECT_READS,
	input: z.object({
		projectTag: z.string().optional(),
		assignee: z.uuid().optional(),
		group: z.enum(STATE_GROUPS).optional(),
		parent: z.string().optional(),
		search: z.string().optional(),
		page: z.coerce.number().optional(),
		perPage: z.coerce.number().optional()
	}),
	output: z.object({ data: z.array(taskSchema), meta: paginationMetaSchema }),
	handler: async ({ principal, input }) => {
		const paging = { page: input.page, perPage: input.perPage };

		// A filter matching nothing is an empty page, not an error.
		const nothing = { data: [], meta: toMeta(page([], 0, pageWindow(paging))) };

		let projectId: string | undefined;
		if (input.projectTag !== undefined) {
			const project = await getProject(principal, input.projectTag);
			if (!project.ok) return nothing;
			projectId = project.value.id;
		}

		let parentTaskId: string | undefined;
		if (input.parent !== undefined) {
			const parent = await getTask(principal, input.parent);
			if (!parent.ok) return nothing;
			parentTaskId = parent.value.id;
		}

		const result = await listTasks(
			principal,
			{
				projectId,
				parentTaskId,
				assignee: input.assignee,
				group: input.group,
				q: input.search
			},
			paging
		);
		const positions = await statePositions(principal);

		return {
			data: result.rows.map((task) => taskToWire(task, positions)),
			meta: toMeta(result)
		};
	}
});

export const getTaskEndpoint = defineEndpoint({
	id: 'tasks.get',
	method: 'GET',
	path: '/tasks/{tag}',
	summary: 'Get one task by its tag.',
	description:
		"Returns one task, addressed by its tag (for example `TSK-0042`), with its state, project, assignees, `parent` and `subtasks`. `archived` is true when the task's project is archived, which makes it read-only. `time` carries the minutes logged on the task (`ownMinutes`) and on it plus its subtasks (`withSubtasksMinutes`), or `null` when time tracking is off or the key holds no `time.log`. A task the key cannot see is answered with `404`, the same as one that does not exist.",
	permissions: PROJECT_READS,
	input: z.object({ tag }),
	output: z.object({ data: taskDetailSchema }),
	handler: async ({ principal, input }) => {
		const found = await getTask(principal, input.tag);
		if (!found.ok) throw notFound('Task not found.');
		return {
			data: {
				...taskToWire(found.value, await statePositions(principal)),
				time: await taskTime(principal, found.value.id)
			}
		};
	}
});

export const taskTimelineEndpoint = defineEndpoint({
	id: 'tasks.timeline',
	method: 'GET',
	path: '/tasks/{tag}/timeline',
	summary: "Read a task's history, newest first.",
	description:
		'Returns the events recorded on the task, newest first: creation, state changes, assignments, due-date changes, parent changes and moves between projects. Tickets are not part of it; read them with `GET /tasks/{taskTag}/tickets`. A parent the key cannot see reads with an empty `taskTag` and `title`, never its code. A task the key cannot see is `404`.',
	permissions: PROJECT_READS,
	input: z.object({ tag }),
	output: z.object({ data: z.array(timelineEntrySchema) }),
	handler: async ({ principal, input }) => {
		const task = await taskOf(principal, input.tag);
		const items = await taskTimeline(principal, task.id);

		return { data: timelineToWire(items) };
	}
});

export const createTaskEndpoint = defineEndpoint({
	id: 'tasks.create',
	method: 'POST',
	path: '/projects/{tag}/tasks',
	summary: 'Add a task to a project.',
	description:
		"Creates a task in the project, at the end of the column of `stateId` or, when omitted, of the first open state. `taskTag` is optional: when omitted the next `TSK-####` is generated (ADR 0010). `description` and `dueDate` (`YYYY-MM-DD`) are optional. `parentTag` makes it a subtask of a task of the same project, which must not be a subtask itself; the subtask takes the parent's milestone and nothing else. Assignees are not part of the body: assign them afterwards, one act per call. Answers `201` with the task and a `Location` header.",
	example: { title: 'Book the van', dueDate: '2026-11-20' },
	status: 201,
	permissions: PROJECT_MANAGE,
	refusalTable: createRefusals,
	// Milestones are not part of the API yet: the field is not accepted here. The
	// parent is addressed by its tag, never by its internal id.
	input: createTaskInput
		.omit({ milestoneId: true, parentTaskId: true })
		.extend({ tag, parentTag: z.string().min(1).optional() }),
	output: taskResponse,
	handler: async ({ principal, input, refuse }) => {
		const actor = withReads(principal);
		const { tag: projectTag, parentTag, ...values } = input;
		const project = await projectOf(actor, projectTag);
		let parentTaskId: string | undefined;
		if (parentTag !== undefined) {
			const parent = await getTask(actor, parentTag);
			if (!parent.ok) throw refuse('parent_not_found');
			parentTaskId = parent.value.id;
		}

		const outcome = await createTask(actor, project.id, { ...values, parentTaskId });
		if (!outcome.ok) throw refuse(outcome.error);

		return created(
			await writtenTask(actor, outcome.value.taskTag),
			`/tasks/${outcome.value.taskTag}`
		);
	}
});

export const updateTaskEndpoint = defineEndpoint({
	id: 'tasks.update',
	method: 'PATCH',
	path: '/tasks/{tag}',
	summary: "Edit a task's details.",
	description:
		'Edits `title`, `description`, `dueDate` and `taskTag`; every field is optional, and `null` clears the description or the due date. A change of due date is recorded in the history. State, project and assignees have their own endpoints. If `taskTag` changes, the response carries the new tag and a `Location` header; the old URL is `404` from then on, with no redirect.',
	example: { title: 'Book the van for Friday', dueDate: '2026-11-21' },
	permissions: PROJECT_MANAGE,
	refusalTable: updateRefusals,
	input: updateTaskInput.extend({ tag }),
	output: taskResponse,
	handler: async ({ principal, input, refuse }) => {
		const actor = withReads(principal);
		const { tag: currentTag, ...changes } = input;
		const target = await taskOf(actor, currentTag);

		const outcome = await updateTask(actor, target.id, changes);
		if (!outcome.ok) throw refuse(outcome.error);

		const newTag = changes.taskTag ?? currentTag;
		const body = await writtenTask(actor, newTag);
		return newTag === currentTag
			? body
			: new Reply(200, body, { location: `/api/v1/tasks/${newTag}` });
	}
});

export const moveTaskEndpoint = defineEndpoint({
	id: 'tasks.move',
	method: 'POST',
	path: '/tasks/{tag}/state',
	summary: 'Move a task to a state.',
	description:
		'Moves the task to the end of the column of `stateId` (take the ids from `GET /states`) and records the change. Setting the state the task already has changes nothing and writes no event. Moving a task into a `completed` state notifies the requesters of the tickets linked to it. A task cannot close (`completed` or `cancelled`) while a subtask of it is open, nor can a subtask reopen while its parent is closed: nothing cascades. Where the task sits between two cards is not part of the API.',
	example: { stateId: '00000000-0000-4000-8000-000000000000' },
	permissions: PROJECT_MANAGE,
	refusalTable: moveRefusals,
	input: z.object({ tag, stateId: z.uuid() }),
	output: taskResponse,
	handler: async ({ principal, input, refuse }) => {
		const actor = withReads(principal);
		const target = await taskOf(actor, input.tag);
		const outcome = await moveTask(actor, target.id, input.stateId);
		if (!outcome.ok) throw refuse(outcome.error);
		return writtenTask(actor, input.tag);
	}
});

export const reparentTaskEndpoint = defineEndpoint({
	id: 'tasks.reparent',
	method: 'POST',
	path: '/tasks/{tag}/project',
	summary: 'Move a task to another project.',
	description:
		"Moves the task to the project `projectTag`, at the end of its state's column there; tag, state, assignees and history stay. A project that does not exist, or that the key cannot see, is rejected on `projectTag`. Into a members-only project every assignee of the task must already be a member.",
	example: { projectTag: 'PRJ-0008' },
	permissions: PROJECT_MANAGE,
	refusalTable: reparentRefusals,
	input: z.object({ tag, projectTag: z.string().min(1) }),
	output: taskResponse,
	handler: async ({ principal, input, refuse }) => {
		const actor = withReads(principal);
		const task = await taskOf(actor, input.tag);
		const target = await getProject(actor, input.projectTag);
		if (!target.ok) throw invalidField('projectTag', 'Project not found.');

		const outcome = await moveTaskToProject(actor, task.id, target.value.id);
		if (!outcome.ok) throw refuse(outcome.error);
		return writtenTask(actor, input.tag);
	}
});

export const setTaskParentEndpoint = defineEndpoint({
	id: 'tasks.setParent',
	method: 'POST',
	path: '/tasks/{tag}/parent',
	summary: 'Make a task a subtask of another.',
	description:
		"Puts the task under `parentTag`, a task of the same project, and records the change on the task. Subtasks go one level deep: the parent cannot be a subtask, and a task that has subtasks cannot become one. An open task cannot go under a closed parent. Setting the parent the task already has changes nothing and writes no event. The task's milestone is not touched.",
	example: { parentTag: 'TSK-0041' },
	permissions: PROJECT_MANAGE,
	refusalTable: setParentRefusals,
	input: z.object({ tag, parentTag: z.string().min(1) }),
	output: taskResponse,
	handler: async ({ principal, input, refuse }) => {
		const actor = withReads(principal);
		const task = await taskOf(actor, input.tag);
		const parent = await getTask(actor, input.parentTag);
		if (!parent.ok) throw refuse('parent_not_found');

		const outcome = await setTaskParent(actor, task.id, parent.value.id);
		if (!outcome.ok) throw refuse(outcome.error);
		return writtenTask(actor, input.tag);
	}
});

export const removeTaskParentEndpoint = defineEndpoint({
	id: 'tasks.removeParent',
	method: 'DELETE',
	path: '/tasks/{tag}/parent',
	summary: 'Make a subtask a top-level task.',
	description:
		'Takes the task out from under its parent and records the change; tag, state, milestone and history stay. On a task with no parent it changes nothing and writes no event.',
	permissions: PROJECT_MANAGE,
	refusalTable: removeParentRefusals,
	input: z.object({ tag }),
	output: taskResponse,
	handler: async ({ principal, input, refuse }) => {
		const actor = withReads(principal);
		const task = await taskOf(actor, input.tag);
		const outcome = await setTaskParent(actor, task.id, null);
		if (!outcome.ok) throw refuse(outcome.error);
		return writtenTask(actor, input.tag);
	}
});

export const assignTaskEndpoint = defineEndpoint({
	id: 'tasks.assign',
	method: 'POST',
	path: '/tasks/{tag}/assignees',
	summary: 'Assign a person to a task.',
	description:
		'Adds `personId` to the assignees and answers `200` with the task. Assigning someone already on the task changes nothing and writes no event. One person per call: the list is never replaced as a whole.',
	example: { personId: '00000000-0000-4000-8000-000000000000' },
	permissions: PROJECT_MANAGE,
	refusalTable: assignRefusals,
	input: z.object({ tag, personId: z.uuid() }),
	output: taskResponse,
	handler: async ({ principal, input, refuse }) => {
		const actor = withReads(principal);
		const target = await taskOf(actor, input.tag);
		const outcome = await assign(actor, target.id, input.personId);
		if (!outcome.ok) throw refuse(outcome.error);
		return writtenTask(actor, input.tag);
	}
});

export const unassignTaskEndpoint = defineEndpoint({
	id: 'tasks.unassign',
	method: 'DELETE',
	path: '/tasks/{tag}/assignees/{personId}',
	summary: 'Take a person off a task.',
	description:
		'Removes `personId` from the assignees and answers `200` with the task. Removing someone who is not on the task changes nothing and writes no event.',
	permissions: PROJECT_MANAGE,
	refusalTable: unassignRefusals,
	input: z.object({ tag, personId: z.uuid() }),
	output: taskResponse,
	handler: async ({ principal, input, refuse }) => {
		const actor = withReads(principal);
		const target = await taskOf(actor, input.tag);
		const outcome = await unassign(actor, target.id, input.personId);
		if (!outcome.ok) throw refuse(outcome.error);
		return writtenTask(actor, input.tag);
	}
});

export const TASK_ENDPOINTS: readonly Endpoint[] = [
	listTasksEndpoint,
	getTaskEndpoint,
	taskTimelineEndpoint,
	createTaskEndpoint,
	updateTaskEndpoint,
	moveTaskEndpoint,
	reparentTaskEndpoint,
	setTaskParentEndpoint,
	removeTaskParentEndpoint,
	assignTaskEndpoint,
	unassignTaskEndpoint
];
