import { z } from 'zod';
import { STATE_GROUPS, type StateGroup } from '#lib/domain/status.js';
import {
	getProject,
	getTask,
	listStates,
	PROJECT_VISIBILITIES,
	projectProgress,
	type ProjectView,
	type TaskView
} from '../../projects';
import type { ApiPrincipal } from '../keys';
import { notFound } from '../registry';
import { named } from '../shared-schemas';
import { invalidField, refusal } from './refusals';

/**
 * What the project, task and state endpoints share (ADR 0022): the wire shapes,
 * the read-back after a write and the mapping of the domain's failures. Projects
 * and tasks are addressed by their code (ADR 0010), so no internal id of either
 * is in these schemas; person and state ids are, because they have no code.
 */

/** Any one suffices, as `ticket-work.ts` declares. */
export const PROJECT_READS = ['projects.view', 'projects.view.assigned'] as const;
export const PROJECT_MANAGE = ['projects.manage'] as const;

export const tag = z.string().min(1);

export const personSchema = named('Person', z.object({ id: z.string(), name: z.string() }));

export const stateSchema = named(
	'State',
	z.object({
		id: z.string(),
		name: z.string(),
		group: z.enum(STATE_GROUPS),
		position: z.number()
	})
);

const progressSchema = named(
	'ProjectProgress',
	z.object({
		backlog: z.number(),
		unstarted: z.number(),
		started: z.number(),
		completed: z.number(),
		cancelled: z.number(),
		/** completed ÷ (tasks − cancelled), from 0 to 100; `null` when no task is left to count. */
		percent: z.number().nullable()
	})
);

export const projectSchema = named(
	'Project',
	z.object({
		tag: z.string(),
		name: z.string(),
		description: z.string().nullable(),
		owner: personSchema.nullable(),
		/** `YYYY-MM-DD`. */
		dueDate: z.string().nullable(),
		archived: z.boolean(),
		/** `members`: only the project's members and admins can see it (ADR 0042). */
		visibility: z.enum(PROJECT_VISIBILITIES),
		progress: progressSchema
	})
);

export const taskSchema = named(
	'Task',
	z.object({
		tag: z.string(),
		title: z.string(),
		description: z.string().nullable(),
		project: z.object({ tag: z.string(), name: z.string() }),
		state: stateSchema,
		assignees: z.array(personSchema),
		/** `YYYY-MM-DD`. */
		dueDate: z.string().nullable(),
		/** Whether the task's project is archived, which makes the task read-only. */
		archived: z.boolean()
	})
);

/* -------------------------------------------------------------------------- */
/* Wire                                                                       */
/* -------------------------------------------------------------------------- */

export function progressToWire(counts: Record<StateGroup, number>): z.input<typeof progressSchema> {
	const total = STATE_GROUPS.reduce((sum, group) => sum + counts[group], 0);
	const countable = total - counts.cancelled;

	return {
		backlog: counts.backlog,
		unstarted: counts.unstarted,
		started: counts.started,
		completed: counts.completed,
		cancelled: counts.cancelled,
		percent: countable === 0 ? null : Math.round((counts.completed / countable) * 100)
	};
}

export function projectToWire(
	view: ProjectView,
	counts: Record<StateGroup, number>
): z.input<typeof projectSchema> {
	return {
		tag: view.projectTag,
		name: view.name,
		description: view.description,
		owner:
			view.ownerPersonId === null ? null : { id: view.ownerPersonId, name: view.ownerName ?? '' },
		dueDate: view.dueDate,
		archived: view.archivedAt !== null,
		visibility: view.visibility,
		progress: progressToWire(counts)
	};
}

/** `TaskView` carries the state's name and group but not where it sits in the catalogue. */
export async function statePositions(principal: ApiPrincipal): Promise<Map<string, number>> {
	return new Map((await listStates(principal)).map((state) => [state.id, state.position]));
}

export function taskToWire(
	view: TaskView,
	positions: ReadonlyMap<string, number>
): z.input<typeof taskSchema> {
	return {
		tag: view.taskTag,
		title: view.title,
		description: view.description,
		project: { tag: view.projectTag, name: view.projectName },
		state: {
			id: view.stateId,
			name: view.stateName,
			group: view.stateGroup,
			position: positions.get(view.stateId) ?? 0
		},
		assignees: view.assignees.map(({ personId, fullName }) => ({ id: personId, name: fullName })),
		dueDate: view.dueDate,
		archived: view.projectArchived
	};
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Writing needs the internal id and a read-back, and a key scoped to
 * `projects.manage` alone may hold no read permission. The read scopes are added
 * for that call; `can()` still intersects with the owner's role, so this never
 * reaches a record the owner could not see.
 */
export function withReads(principal: ApiPrincipal): ApiPrincipal {
	return { ...principal, scopes: [...new Set([...principal.scopes, ...PROJECT_READS])] };
}

/** The project a call targets, by its tag. Out of scope reads as missing. */
export async function projectOf(actor: ApiPrincipal, projectTag: string): Promise<ProjectView> {
	const found = await getProject(actor, projectTag);
	if (!found.ok) throw notFound('Project not found.');
	return found.value;
}

/** The task a call targets, by its tag. Out of scope reads as missing. */
export async function taskOf(actor: ApiPrincipal, taskTag: string): Promise<TaskView> {
	const found = await getTask(actor, taskTag);
	if (!found.ok) throw notFound('Task not found.');
	return found.value;
}

/** The project after a write, in the wire shape. The write has succeeded, so a miss is a bug, not a 404. */
export async function writtenProject(actor: ApiPrincipal, projectTag: string) {
	const project = await getProject(actor, projectTag);
	if (!project.ok) throw new Error(`Project ${projectTag} vanished after a write.`);
	const progress = await projectProgress(actor, project.value.id);
	if (!progress.ok) throw new Error(`Project ${projectTag} vanished after a write.`);
	return { data: projectToWire(project.value, progress.value.counts) };
}

/** The task after a write, in the wire shape. */
export async function writtenTask(actor: ApiPrincipal, taskTag: string) {
	const task = await getTask(actor, taskTag);
	if (!task.ok) throw new Error(`Task ${taskTag} vanished after a write.`);
	return { data: taskToWire(task.value, await statePositions(actor)) };
}

/** Domain failures that name a value in the body, mapped to the field that carried it. */
const FIELD_FAILURES: Record<string, readonly [string, string]> = {
	owner_not_found: ['ownerPersonId', 'Person not found.'],
	state_not_found: ['stateId', 'State not found.'],
	person_not_found: ['personId', 'Person not found.']
};

/** A refusal of a write whose body can name a record: that is the field's fault, not a missing page. */
export function bodyRefusal(failure: string) {
	const field = FIELD_FAILURES[failure];
	return field ? invalidField(field[0], field[1]) : refusal(failure);
}
