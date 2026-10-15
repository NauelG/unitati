import { z } from 'zod';
import { STATE_GROUPS } from '#lib/domain/status.js';

/**
 * Input validation for projects, tasks and the state catalogue. Hand-written:
 * the create and update shapes differ from the rows on purpose, and the updates
 * are where the product's rules live.
 *
 * - `organisation_id` is never an input (ADR 0004): the tenancy scope comes from
 *   the session.
 * - **No update input accepts a state's `group`, a task's `projectId`, `stateId`
 *   or `position`.** Group changes what past progress meant; the project move is
 *   #120; state and position change only through `moveTask`. Zod strips unknown
 *   keys, so a payload that sneaks one in loses it silently rather than writing it.
 */

/**
 * Tags the router owns. The tag is a URL segment (ADR 0010) and both sections
 * keep `/new` beside it, so a project tagged `new` would be created happily and
 * then be unreachable.
 */
export const RESERVED_PROJECT_TAGS: ReadonlySet<string> = new Set(['new']);
export const RESERVED_TASK_TAGS: ReadonlySet<string> = new Set(['new']);

const nonEmpty = z.string().trim().min(1);

/** The longest task title the product accepts; an escalation draft is cut to it. */
export const TASK_TITLE_MAX = 200;

const tagOf = (reserved: ReadonlySet<string>) =>
	nonEmpty.refine((tag) => !reserved.has(tag.toLowerCase()), 'reserved');

/** Prose that may be absent; an empty box is the same as no text. */
const optionalText = z
	.string()
	.trim()
	.nullish()
	.transform((value) => (value ? value : null));

/** A calendar date, `YYYY-MM-DD`. Null clears it. */
const dueDate = z.iso.date().nullable();

export const createProjectInput = z.object({
	name: nonEmpty,
	description: optionalText,
	ownerPersonId: z.uuid().nullish(),
	dueDate: dueDate.optional(),
	projectTag: tagOf(RESERVED_PROJECT_TAGS).optional()
});

export const updateProjectInput = z.object({
	name: nonEmpty.optional(),
	description: optionalText.optional(),
	ownerPersonId: z.uuid().nullable().optional(),
	dueDate: dueDate.optional(),
	projectTag: tagOf(RESERVED_PROJECT_TAGS).optional()
});

export const createTaskInput = z.object({
	title: nonEmpty.max(TASK_TITLE_MAX),
	description: optionalText,
	dueDate: dueDate.optional(),
	/** Omitted: the task lands in the first open state (`defaultTaskState`). */
	stateId: z.uuid().optional(),
	taskTag: tagOf(RESERVED_TASK_TAGS).optional()
});

export const updateTaskInput = z.object({
	title: nonEmpty.optional(),
	description: optionalText.optional(),
	dueDate: dueDate.optional(),
	taskTag: tagOf(RESERVED_TASK_TAGS).optional()
});

export const createStateInput = z.object({
	name: nonEmpty,
	group: z.enum(STATE_GROUPS)
});

/** Renaming is the only edit a state accepts. See the note at the top. */
export const updateStateInput = z.object({ name: nonEmpty });

export type CreateProjectInput = z.input<typeof createProjectInput>;
export type UpdateProjectInput = z.input<typeof updateProjectInput>;
export type CreateTaskInput = z.input<typeof createTaskInput>;
export type UpdateTaskInput = z.input<typeof updateTaskInput>;
export type CreateStateInput = z.input<typeof createStateInput>;
export type UpdateStateInput = z.input<typeof updateStateInput>;
