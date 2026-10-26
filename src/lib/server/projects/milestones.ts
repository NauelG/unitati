import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { STATE_GROUPS, type StateGroup } from '#lib/domain/status.js';
import { calendarDayIn } from '#lib/domain/time.js';
import { actorColumns, recordActivity } from '../activity';
import type { SessionUser } from '../auth/guards';
import { getDb, type Transaction } from '../db';
import { failure, success, type Outcome } from '../shared/outcome';
import { runtimeTimeZone } from '../shared/runtime';
import { milestoneStatus, type MilestoneProgress, type MilestoneStatus } from './milestone-status';
import { milestones, projects, states, tasks, type Milestone } from './schema';
import { requireManage, requireProjectScope, requireTaskScope } from './scope';
import {
	parseMilestoneInput,
	type MilestoneInputFailure,
	type MilestoneValues
} from './validation';
import { lockProject } from './writes';

/**
 * Milestones: dated checkpoints inside one project (ADR 0054). A container with
 * a range, not a bare marker. Status and progress are derived on read, from the
 * dates and from where the viewer's tasks sit; nothing about "achieved" is stored.
 *
 * **Hard delete.** A milestone groups work and deleting one destroys none: the
 * database detaches its tasks (`ON DELETE SET NULL (milestone_id)`). No events,
 * no notifications: the activity log is the only consumer (ADR 0024).
 */

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

export type MilestoneView = {
	id: string;
	projectId: string;
	name: string;
	description: string | null;
	/** `YYYY-MM-DD`. */
	startDate: string;
	/** `YYYY-MM-DD`. */
	targetDate: string;
	status: MilestoneStatus;
	progress: MilestoneProgress;
};

/** Today in the organisation's zone, overridable so a spec can fix the clock. */
export type MilestoneClock = { now?: Date };

function zeroCounts(): Record<StateGroup, number> {
	return Object.fromEntries(STATE_GROUPS.map((group) => [group, 0])) as Record<StateGroup, number>;
}

/**
 * The project's milestones in their fixed order (`start_date`, `target_date`,
 * `name`), each with its derived status and progress. Counts cover **the tasks the
 * viewer may see**, the scope `projectProgress` uses, in one grouped query for all
 * the milestones. A project the viewer cannot see is `project_not_found`.
 */
export async function listMilestones(
	viewer: SessionUser,
	projectId: string,
	clock: MilestoneClock = {}
): Promise<Outcome<MilestoneView[], 'project_not_found'>> {
	const db = getDb();
	const [visible] = await db
		.select({ id: projects.id })
		.from(projects)
		.where(and(requireProjectScope(viewer), eq(projects.id, projectId)));
	if (!visible) return failure('project_not_found');

	const rows = await db
		.select()
		.from(milestones)
		.where(eq(milestones.projectId, projectId))
		.orderBy(
			asc(milestones.startDate),
			asc(milestones.targetDate),
			asc(milestones.name),
			asc(milestones.id)
		);
	if (rows.length === 0) return success([]);

	const grouped = await db
		.select({
			milestoneId: tasks.milestoneId,
			group: states.group,
			count: sql<number>`count(*)::int`
		})
		.from(tasks)
		.innerJoin(states, eq(tasks.stateId, states.id))
		.where(
			and(
				requireTaskScope(viewer),
				eq(tasks.projectId, projectId),
				inArray(
					tasks.milestoneId,
					rows.map((row) => row.id)
				)
			)
		)
		.groupBy(tasks.milestoneId, states.group);

	const countsOf = new Map<string, Record<StateGroup, number>>();
	for (const row of grouped) {
		if (row.milestoneId === null) continue;
		const counts = countsOf.get(row.milestoneId) ?? zeroCounts();
		counts[row.group] = row.count;
		countsOf.set(row.milestoneId, counts);
	}

	const today = calendarDayIn(runtimeTimeZone(), clock.now ?? new Date());
	return success(
		rows.map((row) => ({
			id: row.id,
			projectId: row.projectId,
			name: row.name,
			description: row.description,
			startDate: row.startDate,
			targetDate: row.targetDate,
			...milestoneStatus(
				{
					startDate: row.startDate,
					targetDate: row.targetDate,
					counts: countsOf.get(row.id) ?? zeroCounts()
				},
				today
			)
		}))
	);
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

export type CreateMilestoneFailure =
	'project_not_found' | 'project_archived' | MilestoneInputFailure;
export type MilestoneWriteFailure = CreateMilestoneFailure | 'milestone_not_found';

export type CreateMilestoneInput = {
	name: string;
	description?: string | null;
	startDate: string;
	targetDate: string;
};
export type UpdateMilestoneInput = Partial<CreateMilestoneInput>;

export async function createMilestone(
	actor: SessionUser,
	projectId: string,
	input: CreateMilestoneInput
): Promise<Outcome<{ id: string }, CreateMilestoneFailure>> {
	requireManage(actor);
	const parsed = parseMilestoneInput(input, false);
	if (!parsed.ok) return parsed;
	const values = parsed.value as Required<
		Pick<MilestoneValues, 'name' | 'startDate' | 'targetDate'>
	> &
		MilestoneValues;

	return getDb().transaction(async (tx) => {
		const locked = await lockProject(tx, actor, projectId);
		if (!locked.ok) return locked;

		const [created] = await tx
			.insert(milestones)
			.values({
				organisationId: actor.organisationId,
				projectId,
				name: values.name,
				description: values.description ?? null,
				startDate: values.startDate,
				targetDate: values.targetDate
			})
			.returning({ id: milestones.id });

		await recordActivity(tx, {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target: { projectId },
			verb: 'project.milestone.created',
			payload: {
				milestoneId: created.id,
				name: values.name,
				startDate: values.startDate,
				targetDate: values.targetDate
			}
		});

		return success({ id: created.id });
	});
}

/**
 * A milestone of the actor's organisation and its project, locked. The project
 * is read from the milestone, locked, and the milestone read **again** after the
 * lock, so a concurrent delete is seen. A project the actor cannot see reads as
 * `milestone_not_found`, like one that does not exist (ADR 0042).
 */
async function lockMilestone(
	tx: Transaction,
	actor: SessionUser,
	milestoneId: string
): Promise<Outcome<Milestone, 'milestone_not_found' | 'project_archived'>> {
	const [owning] = await tx
		.select({ projectId: milestones.projectId })
		.from(milestones)
		.where(
			and(eq(milestones.id, milestoneId), eq(milestones.organisationId, actor.organisationId))
		);
	if (!owning) return failure('milestone_not_found');

	const locked = await lockProject(tx, actor, owning.projectId);
	if (!locked.ok) {
		return failure(
			locked.error === 'project_archived' ? 'project_archived' : 'milestone_not_found'
		);
	}

	const [milestone] = await tx.select().from(milestones).where(eq(milestones.id, milestoneId));
	return milestone ? success(milestone) : failure('milestone_not_found');
}

/**
 * Name and dates are recorded as one `project.milestone.changed` holding only
 * the fields that changed. A description-only edit and a change that changes
 * nothing record nothing.
 */
export async function updateMilestone(
	actor: SessionUser,
	milestoneId: string,
	input: UpdateMilestoneInput
): Promise<Outcome<void, Exclude<MilestoneWriteFailure, 'project_not_found'>>> {
	requireManage(actor);
	const parsed = parseMilestoneInput(input, true);
	if (!parsed.ok) return parsed;
	const values = parsed.value;

	return getDb().transaction(async (tx) => {
		const locked = await lockMilestone(tx, actor, milestoneId);
		if (!locked.ok) return locked;
		const current = locked.value;

		const next = {
			name: values.name ?? current.name,
			startDate: values.startDate ?? current.startDate,
			targetDate: values.targetDate ?? current.targetDate
		};
		if (next.startDate > next.targetDate) return failure('invalid_dates' as const);

		const from: Record<string, string> = {};
		const to: Record<string, string> = {};
		for (const field of ['name', 'startDate', 'targetDate'] as const) {
			if (next[field] !== current[field]) {
				from[field] = current[field];
				to[field] = next[field];
			}
		}
		const descriptionChanged =
			values.description !== undefined && values.description !== current.description;
		if (Object.keys(to).length === 0 && !descriptionChanged) return success(undefined);

		await tx
			.update(milestones)
			.set({
				...next,
				description: descriptionChanged ? values.description : undefined,
				updatedAt: new Date()
			})
			.where(eq(milestones.id, milestoneId));

		if (Object.keys(to).length > 0) {
			await recordActivity(tx, {
				organisationId: actor.organisationId,
				...actorColumns(actor),
				target: { projectId: current.projectId },
				verb: 'project.milestone.changed',
				payload: { milestoneId, name: next.name, from, to }
			});
		}

		return success(undefined);
	});
}

/**
 * Deletes the milestone for good. Its tasks stay in the project with no
 * milestone (the database does that); they get no entry of their own, the
 * project's `project.milestone.deleted` is the one fact.
 */
export async function deleteMilestone(
	actor: SessionUser,
	milestoneId: string
): Promise<Outcome<void, 'milestone_not_found' | 'project_archived'>> {
	requireManage(actor);

	return getDb().transaction(async (tx) => {
		const locked = await lockMilestone(tx, actor, milestoneId);
		if (!locked.ok) return locked;
		const milestone = locked.value;

		await tx.delete(milestones).where(eq(milestones.id, milestoneId));
		await recordActivity(tx, {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target: { projectId: milestone.projectId },
			verb: 'project.milestone.deleted',
			payload: { name: milestone.name }
		});

		return success(undefined);
	});
}
