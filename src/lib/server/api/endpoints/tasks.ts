import { z } from 'zod';
import { STATE_GROUPS } from '#lib/domain/status.js';
import { taskTimeline } from '../../links';
import {
	assign,
	createTask,
	createTaskInput,
	getProject,
	getTask,
	listTasks,
	moveTask,
	moveTaskToProject,
	unassign,
	updateTask,
	updateTaskInput
} from '../../projects';
import { page, pageWindow } from '../../shared/pagination';
import { created, defineEndpoint, notFound, Reply, type Endpoint } from '../registry';
import { paginationMetaSchema } from '../shared-schemas';
import {
	bodyRefusal,
	PROJECT_MANAGE,
	PROJECT_READS,
	projectOf,
	statePositions,
	tag,
	taskOf,
	taskSchema,
	taskToWire,
	withReads,
	writtenTask
} from './project-wire';
import { invalidField, refusal } from './refusals';
import { entryToWire, timelineEntrySchema } from './timeline-wire';

/**
 * The task use cases (ADR 0022). Tasks are addressed by tag (ADR 0010), and so
 * are the projects they belong to. Reads start from the domain's scope: a key
 * limited to `projects.view.assigned` sees the tasks assigned to its owner and
 * no others. A task is moved to a column (`/state`) or to another project
 * (`/project`) by an act of its own, never by a field in the `PATCH`; its place
 * between two cards is board state and not part of the API.
 */

const taskResponse = z.object({ data: taskSchema });

export const listTasksEndpoint = defineEndpoint({
	id: 'tasks.list',
	method: 'GET',
	path: '/tasks',
	summary: 'List the tasks the key can see, in board order.',
	description:
		'Returns one page of tasks, in board order (state group, state position, place in the column). Filter with `projectTag`, `assignee` (a person id), `group` and `search`; page with `page` and `perPage` (out-of-range values are clamped). A `projectTag` that matches no project the key can see is an empty page, not a `404`: a filter matching nothing is not an error. A key limited to `projects.view.assigned` sees only the tasks assigned to its owner, and `meta` counts only those.',
	example: { projectTag: 'PRJ-0007', group: 'started', page: 1, perPage: 25 },
	permissions: PROJECT_READS,
	input: z.object({
		projectTag: z.string().optional(),
		assignee: z.uuid().optional(),
		group: z.enum(STATE_GROUPS).optional(),
		search: z.string().optional(),
		page: z.coerce.number().optional(),
		perPage: z.coerce.number().optional()
	}),
	output: z.object({ data: z.array(taskSchema), meta: paginationMetaSchema }),
	handler: async ({ principal, input }) => {
		const paging = { page: input.page, perPage: input.perPage };

		let projectId: string | undefined;
		if (input.projectTag !== undefined) {
			const project = await getProject(principal, input.projectTag);
			projectId = project.ok ? project.value.id : undefined;
			if (!project.ok) {
				const empty = page([], 0, pageWindow(paging));
				return {
					data: [],
					meta: {
						page: empty.page,
						perPage: empty.perPage,
						total: empty.total,
						pageCount: empty.pageCount
					}
				};
			}
		}

		const result = await listTasks(
			principal,
			{ projectId, assignee: input.assignee, group: input.group, q: input.search },
			paging
		);
		const positions = await statePositions(principal);

		return {
			data: result.rows.map((task) => taskToWire(task, positions)),
			meta: {
				page: result.page,
				perPage: result.perPage,
				total: result.total,
				pageCount: result.pageCount
			}
		};
	}
});

export const getTaskEndpoint = defineEndpoint({
	id: 'tasks.get',
	method: 'GET',
	path: '/tasks/{tag}',
	summary: 'Get one task by its tag.',
	description:
		"Returns one task, addressed by its tag (for example `TSK-0042`), with its state, project and assignees. `archived` is true when the task's project is archived, which makes it read-only. A task the key cannot see is answered with `404`, the same as one that does not exist.",
	permissions: PROJECT_READS,
	input: z.object({ tag }),
	output: taskResponse,
	handler: async ({ principal, input }) => {
		const found = await getTask(principal, input.tag);
		if (!found.ok) throw notFound('Task not found.');
		return { data: taskToWire(found.value, await statePositions(principal)) };
	}
});

export const taskTimelineEndpoint = defineEndpoint({
	id: 'tasks.timeline',
	method: 'GET',
	path: '/tasks/{tag}/timeline',
	summary: "Read a task's history, newest first.",
	description:
		'Returns the events recorded on the task, newest first: creation, state changes, assignments, due-date changes and moves between projects. Tickets are not part of it; read them with `GET /tasks/{taskTag}/tickets`. A task the key cannot see is `404`.',
	permissions: PROJECT_READS,
	input: z.object({ tag }),
	output: z.object({ data: z.array(timelineEntrySchema) }),
	handler: async ({ principal, input }) => {
		const task = await taskOf(principal, input.tag);
		const items = await taskTimeline(principal, task.id);

		return {
			data: items.flatMap((item) => (item.kind === 'activity' ? [entryToWire(item.entry)] : []))
		};
	}
});

export const createTaskEndpoint = defineEndpoint({
	id: 'tasks.create',
	method: 'POST',
	path: '/projects/{tag}/tasks',
	summary: 'Add a task to a project.',
	description:
		'Creates a task in the project, at the end of the column of `stateId` or, when omitted, of the first open state. `taskTag` is optional: when omitted the next `TSK-####` is generated (ADR 0010). `description` and `dueDate` (`YYYY-MM-DD`) are optional. Assignees are not part of the body: assign them afterwards, one act per call. Answers `201` with the task and a `Location` header. A tag already in use is `409` (`duplicate_task_tag`); an unknown `stateId` is a `400` on that field; an archived project is `409 project_archived`.',
	example: { title: 'Book the van', dueDate: '2026-11-20' },
	status: 201,
	permissions: PROJECT_MANAGE,
	input: createTaskInput.extend({ tag }),
	output: taskResponse,
	handler: async ({ principal, input }) => {
		const actor = withReads(principal);
		const { tag: projectTag, ...values } = input;
		const project = await projectOf(actor, projectTag);

		const outcome = await createTask(actor, project.id, values);
		if (!outcome.ok) throw bodyRefusal(outcome.error);

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
		'Edits `title`, `description`, `dueDate` and `taskTag`; every field is optional, and `null` clears the description or the due date. A change of due date is recorded in the history. State, project and assignees have their own endpoints. If `taskTag` changes, the response carries the new tag and a `Location` header; the old URL is `404` from then on, with no redirect. A tag already in use is `409`; a task of an archived project is `409 project_archived`.',
	example: { title: 'Book the van for Friday', dueDate: '2026-11-21' },
	permissions: PROJECT_MANAGE,
	input: updateTaskInput.extend({ tag }),
	output: taskResponse,
	handler: async ({ principal, input }) => {
		const actor = withReads(principal);
		const { tag: currentTag, ...changes } = input;
		const target = await taskOf(actor, currentTag);

		const outcome = await updateTask(actor, target.id, changes);
		if (!outcome.ok) throw bodyRefusal(outcome.error);

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
		'Moves the task to the end of the column of `stateId` (take the ids from `GET /states`) and records the change. Setting the state the task already has changes nothing and writes no event. Moving a task into a `completed` state notifies the requesters of the tickets linked to it. Where the task sits between two cards is not part of the API. An unknown `stateId` is a `400` on that field; a task of an archived project is `409 project_archived`.',
	example: { stateId: '00000000-0000-4000-8000-000000000000' },
	permissions: PROJECT_MANAGE,
	input: z.object({ tag, stateId: z.uuid() }),
	output: taskResponse,
	handler: async ({ principal, input }) => {
		const actor = withReads(principal);
		const target = await taskOf(actor, input.tag);
		const outcome = await moveTask(actor, target.id, input.stateId);
		if (!outcome.ok) throw bodyRefusal(outcome.error);
		return writtenTask(actor, input.tag);
	}
});

export const reparentTaskEndpoint = defineEndpoint({
	id: 'tasks.reparent',
	method: 'POST',
	path: '/tasks/{tag}/project',
	summary: 'Move a task to another project.',
	description:
		"Moves the task to the project `projectTag`, at the end of its state's column there; tag, state, assignees and history stay. A project that does not exist, or that the key cannot see, is a `400` on `projectTag`. The same project is `409 same_project`; an archived source or target is `409 project_archived`.",
	example: { projectTag: 'PRJ-0008' },
	permissions: PROJECT_MANAGE,
	input: z.object({ tag, projectTag: z.string().min(1) }),
	output: taskResponse,
	handler: async ({ principal, input }) => {
		const actor = withReads(principal);
		const task = await taskOf(actor, input.tag);
		const target = await getProject(actor, input.projectTag);
		if (!target.ok) throw invalidField('projectTag', 'Project not found.');

		const outcome = await moveTaskToProject(actor, task.id, target.value.id);
		if (!outcome.ok) throw refusal(outcome.error);
		return writtenTask(actor, input.tag);
	}
});

export const assignTaskEndpoint = defineEndpoint({
	id: 'tasks.assign',
	method: 'POST',
	path: '/tasks/{tag}/assignees',
	summary: 'Assign a person to a task.',
	description:
		'Adds `personId` to the assignees and answers `200` with the task. Assigning someone already on the task changes nothing and writes no event. One person per call: the list is never replaced as a whole. An unknown `personId` is a `400` on that field; a task of an archived project is `409 project_archived`.',
	example: { personId: '00000000-0000-4000-8000-000000000000' },
	permissions: PROJECT_MANAGE,
	input: z.object({ tag, personId: z.uuid() }),
	output: taskResponse,
	handler: async ({ principal, input }) => {
		const actor = withReads(principal);
		const target = await taskOf(actor, input.tag);
		const outcome = await assign(actor, target.id, input.personId);
		if (!outcome.ok) throw bodyRefusal(outcome.error);
		return writtenTask(actor, input.tag);
	}
});

export const unassignTaskEndpoint = defineEndpoint({
	id: 'tasks.unassign',
	method: 'DELETE',
	path: '/tasks/{tag}/assignees/{personId}',
	summary: 'Take a person off a task.',
	description:
		'Removes `personId` from the assignees and answers `200` with the task. Removing someone who is not on the task changes nothing and writes no event. A person that does not exist is `404`; a task of an archived project is `409 project_archived`.',
	permissions: PROJECT_MANAGE,
	input: z.object({ tag, personId: z.uuid() }),
	output: taskResponse,
	handler: async ({ principal, input }) => {
		const actor = withReads(principal);
		const target = await taskOf(actor, input.tag);
		const outcome = await unassign(actor, target.id, input.personId);
		if (!outcome.ok) throw refusal(outcome.error);
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
	assignTaskEndpoint,
	unassignTaskEndpoint
];
