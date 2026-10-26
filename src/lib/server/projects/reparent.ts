import { and, asc, eq, notInArray } from 'drizzle-orm';
import { actorColumns, recordActivity } from '../activity';
import type { SessionUser } from '../auth/guards';
import { getDb, type Transaction } from '../db';
import { people } from '../directory/schema';
import { failure, success, type Outcome } from '../shared/outcome';
import { placeBetween } from '../shared/position';
import { milestones, projectMembers, projects, taskAssignees, tasks, type Task } from './schema';
import { requireManage } from './scope';
import { columnOf } from './tasks';
import { lockProjects } from './writes';

/**
 * Moving a task to another project (#120). The one function that writes
 * `tasks.project_id`; `updateTask` has no key for it (ADR 0022: a rule-bound
 * change is one action, not a field in a `PATCH`).
 */

export type MoveTaskToProjectFailure =
	| 'task_not_found'
	| 'project_not_found'
	| 'project_archived'
	| 'same_project'
	| { kind: 'assignees_not_members'; people: { personId: string; fullName: string }[] };

/**
 * Puts `task` in `target`, at the end of its state's column there, and records
 * `task.project.changed`. Everything else about the task stays: tag, id, state,
 * due date, assignees, history.
 *
 * **Assumes the locks are held**: both the task's current project and `target`
 * (`lockProjects`), and that neither is archived nor the same as the other. It
 * validates nothing, which is what lets #61 call it for every task of a project
 * being merged, inside its own transaction. It also clears `milestone_id`: a
 * milestone belongs to one project (ADR 0054). Not exported from the domain's
 * `index.ts`.
 */
export async function reparentTask(
	tx: Transaction,
	actor: SessionUser,
	task: Task,
	target: typeof projects.$inferSelect
): Promise<void> {
	const [source] = await tx
		.select({ id: projects.id, projectTag: projects.projectTag, name: projects.name })
		.from(projects)
		.where(eq(projects.id, task.projectId));

	const column = await columnOf(tx, target.id, task.stateId);
	const placed = placeBetween(column.at(-1)?.position ?? null, null);
	// Nothing follows the last task, so the end of a column never needs a renumber.
	if (!('position' in placed)) throw new Error('Appending to a column cannot renumber it.');

	// A milestone belongs to one project, so it cannot follow the task: the same
	// UPDATE clears it, or the composite foreign key would reject the move.
	const [milestone] = task.milestoneId
		? await tx
				.select({ id: milestones.id, name: milestones.name })
				.from(milestones)
				.where(eq(milestones.id, task.milestoneId))
		: [];

	await tx
		.update(tasks)
		.set({
			projectId: target.id,
			milestoneId: null,
			position: String(placed.position),
			updatedAt: new Date()
		})
		.where(eq(tasks.id, task.id));

	await recordActivity(tx, {
		organisationId: actor.organisationId,
		...actorColumns(actor),
		target: { taskId: task.id },
		verb: 'task.project.changed',
		payload: {
			fromProjectId: source.id,
			fromProjectTag: source.projectTag,
			fromProjectName: source.name,
			toProjectId: target.id,
			toProjectTag: target.projectTag,
			toProjectName: target.name
		}
	});

	if (milestone) {
		await recordActivity(tx, {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target: { taskId: task.id },
			verb: 'task.milestone.changed',
			payload: { from: milestone, to: null }
		});
	}
}

/**
 * The assignees of a task who are not members of `target`, when it is members-only
 * (ADR 0042: an assignment never widens access, and neither does a move). Empty
 * for an open project, which anybody may be assigned in.
 */
export async function assigneesOutside(
	tx: Transaction,
	taskId: string,
	target: Pick<typeof projects.$inferSelect, 'id' | 'visibility'>
): Promise<{ personId: string; fullName: string }[]> {
	if (target.visibility === 'organisation') return [];

	return tx
		.select({ personId: people.id, fullName: people.fullName })
		.from(taskAssignees)
		.innerJoin(people, eq(taskAssignees.personId, people.id))
		.where(
			and(
				eq(taskAssignees.taskId, taskId),
				notInArray(
					taskAssignees.personId,
					tx
						.select({ personId: projectMembers.personId })
						.from(projectMembers)
						.where(eq(projectMembers.projectId, target.id))
				)
			)
		)
		.orderBy(asc(people.fullName), asc(people.id));
}

/**
 * Moves a task to another project of the organisation, to the end of its column
 * there. Archived is read-only in both directions.
 *
 * **Both projects must be visible to the actor** (ADR 0042): `lockProjects` only
 * returns what the actor can see, so a hidden source reads as `task_not_found`
 * and a hidden target as `project_not_found`, indistinguishable from one that
 * does not exist. Into a members-only target the task's assignees must already
 * be members (`assignees_not_members`, listing them): moving never grants access.
 *
 * Both project rows are locked in one statement ordered by `id`, so two opposite
 * moves cannot deadlock. The task is re-read after the locks: if a concurrent
 * move changed its project meanwhile, the locks are on the wrong rows, so it
 * tries once more and then reports `task_not_found`.
 */
export async function moveTaskToProject(
	actor: SessionUser,
	taskId: string,
	toProjectId: string
): Promise<Outcome<void, MoveTaskToProjectFailure>> {
	requireManage(actor);

	return getDb().transaction(async (tx) => {
		for (let attempt = 0; attempt < 2; attempt++) {
			const [owning] = await tx
				.select({ projectId: tasks.projectId })
				.from(tasks)
				.where(eq(tasks.id, taskId));
			if (!owning) return failure('task_not_found' as const);

			const locked = await lockProjects(tx, actor, [owning.projectId, toProjectId]);

			const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId));
			if (!task || task.organisationId !== actor.organisationId) {
				return failure('task_not_found' as const);
			}
			if (task.projectId !== owning.projectId) continue;

			const source = locked.find((project) => project.id === task.projectId);
			const target = locked.find((project) => project.id === toProjectId);
			if (!source) return failure('task_not_found' as const);
			if (!target) return failure('project_not_found' as const);
			if (source.archivedAt || target.archivedAt) return failure('project_archived' as const);
			if (source.id === target.id) return failure('same_project' as const);

			const outside = await assigneesOutside(tx, task.id, target);
			if (outside.length > 0) {
				return failure({ kind: 'assignees_not_members' as const, people: outside });
			}

			await reparentTask(tx, actor, task, target);
			return success(undefined);
		}

		return failure('task_not_found' as const);
	});
}
