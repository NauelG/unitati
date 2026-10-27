import { z } from 'zod';
import { RICH_TEXT_MAX_LENGTH } from '#lib/domain/rich-text.js';
import { STATE_GROUPS } from '#lib/domain/status.js';
import { failure, success, type Outcome } from '../shared/outcome';

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

export const PROJECT_VISIBILITIES = ['organisation', 'members'] as const;

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
	/** Omitted: `organisation`. `members` makes the owner and the creator its first members. */
	visibility: z.enum(PROJECT_VISIBILITIES).optional(),
	projectTag: tagOf(RESERVED_PROJECT_TAGS).optional()
});

export const updateProjectInput = z.object({
	name: nonEmpty.optional(),
	description: optionalText.pipe(z.string().max(RICH_TEXT_MAX_LENGTH).nullable()).optional(),
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
	/** Omitted or null: no milestone. Must belong to the task's own project. */
	milestoneId: z
		.uuid()
		.nullish()
		.transform((value) => value ?? undefined),
	taskTag: tagOf(RESERVED_TASK_TAGS).optional()
});

export const updateTaskInput = z.object({
	title: nonEmpty.optional(),
	description: z
		.string()
		.trim()
		.max(RICH_TEXT_MAX_LENGTH)
		.nullish()
		.transform((value) => (value ? value : null))
		.optional(),
	dueDate: dueDate.optional(),
	taskTag: tagOf(RESERVED_TASK_TAGS).optional()
});

/** The longest milestone name; the same bound as a task title. */
export const MILESTONE_NAME_MAX = TASK_TITLE_MAX;

export type MilestoneInputFailure = 'invalid_name' | 'invalid_description' | 'invalid_dates';

const milestoneFields = {
	name: nonEmpty.max(MILESTONE_NAME_MAX),
	description: optionalText.pipe(z.string().max(RICH_TEXT_MAX_LENGTH).nullable()),
	startDate: z.iso.date(),
	targetDate: z.iso.date()
};

const createMilestoneInput = z.object({
	...milestoneFields,
	description: milestoneFields.description.optional()
});
const updateMilestoneInput = z.object({
	name: milestoneFields.name.optional(),
	description: milestoneFields.description.optional(),
	startDate: milestoneFields.startDate.optional(),
	targetDate: milestoneFields.targetDate.optional()
});

export type CreateMilestoneValues = z.output<typeof createMilestoneInput>;
export type UpdateMilestoneValues = z.output<typeof updateMilestoneInput>;

/**
 * A milestone's fields, validated: all of them on creation, any of them on an
 * update (`partial`). The failure names the offending field, which is what the
 * dialog shows. `startDate <= targetDate` is checked here when both are given;
 * an update that sends only one of them is checked against the stored other
 * by the caller.
 */
export function parseMilestoneInput(
	input: unknown,
	partial: false
): Outcome<CreateMilestoneValues, MilestoneInputFailure>;
export function parseMilestoneInput(
	input: unknown,
	partial: true
): Outcome<UpdateMilestoneValues, MilestoneInputFailure>;
export function parseMilestoneInput(
	input: unknown,
	partial: boolean
): Outcome<CreateMilestoneValues | UpdateMilestoneValues, MilestoneInputFailure> {
	const parsed = (partial ? updateMilestoneInput : createMilestoneInput).safeParse(input);
	if (!parsed.success) {
		const field = parsed.error.issues[0]?.path[0];
		if (field === 'name') return failure('invalid_name');
		if (field === 'description') return failure('invalid_description');
		return failure('invalid_dates');
	}

	const { startDate, targetDate } = parsed.data;
	if (startDate !== undefined && targetDate !== undefined && startDate > targetDate) {
		return failure('invalid_dates');
	}
	return success(parsed.data);
}

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
