import { and, asc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { actorColumns, recordActivity } from '../activity';
import type { SessionUser } from '../auth/guards';
import { getDb, type Transaction } from '../db';
import { people } from '../directory/schema';
import { failure, success, type Outcome } from '../shared/outcome';
import { placeBetween } from '../shared/position';
import { milestones, projectMembers, projects, taskAssignees, tasks, type Task } from './schema';
import { requireManage } from './scope';
import { columnOf, writeParent } from './tasks';
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
 * Puts `task` **and its subtasks** in `target`, each at the end of its state's
 * column there, and records `task.project.changed` on each. Everything else about
 * them stays: tag, id, state, due date, assignees, history, and the family itself.
 *
 * **Assumes the locks are held**: both the task's current project and `target`
 * (`lockProjects`), and that neither is archived nor the same as the other. It
 * validates nothing, which is what lets #61 call it for every top-level task of
 * a project being merged, inside its own transaction: the children travel with
 * their parent. It also clears `milestone_id`: a milestone belongs to one project
 * (ADR 0054). Not exported from the domain's `index.ts`.
 *
 * The family changes project in **one `UPDATE`** (ADR 0055 §8): the composite key
 * `tasks_parent_same_project_fk` is checked at the end of each statement, and
 * moving a parent and its children one statement at a time would break it in
 * between, whichever goes first. A subtask is never moved on its own: it is
 * detached first (`moveTaskToProject`) or travels with its parent, so calling
 * this on one is a programming error.
 */
export async function reparentTask(
	tx: Transaction,
	actor: SessionUser,
	task: Task,
	target: typeof projects.$inferSelect
): Promise<void> {
	if (task.parentTaskId !== null) {
		throw new Error(`Task ${task.taskTag} is a subtask: detach it or move its parent.`);
	}

	const [source] = await tx
		.select({ id: projects.id, projectTag: projects.projectTag, name: projects.name })
		.from(projects)
		.where(eq(projects.id, task.projectId));

	const children = await tx
		.select()
		.from(tasks)
		.where(eq(tasks.parentTaskId, task.id))
		.orderBy(asc(tasks.position), asc(tasks.id));
	const family = [task, ...children];

	// Each one at the end of its own column in the target, in family order.
	const ends = new Map<string, number | null>();
	const positions = new Map<string, number>();
	for (const member of family) {
		if (!ends.has(member.stateId)) {
			const column = await columnOf(tx, target.id, member.stateId);
			ends.set(member.stateId, column.at(-1)?.position ?? null);
		}
		const placed = placeBetween(ends.get(member.stateId) ?? null, null);
		// Nothing follows the last task, so the end of a column never needs a renumber.
		if (!('position' in placed)) throw new Error('Appending to a column cannot renumber it.');
		ends.set(member.stateId, placed.position);
		positions.set(member.id, placed.position);
	}

	// A milestone belongs to one project, so it cannot follow the task: the same
	// UPDATE clears it, or the composite foreign key would reject the move.
	const milestoneIds = family.flatMap((member) => (member.milestoneId ? [member.milestoneId] : []));
	const left =
		milestoneIds.length === 0
			? []
			: await tx
					.select({ id: milestones.id, name: milestones.name })
					.from(milestones)
					.where(inArray(milestones.id, milestoneIds));

	const ids = family.map((member) => member.id);
	await tx
		.update(tasks)
		.set({
			projectId: target.id,
			milestoneId: null,
			position: sql`(case ${sql.join(
				family.map(
					(member) =>
						sql`when ${tasks.id} = ${member.id} then ${String(positions.get(member.id))}::numeric`
				),
				sql` `
			)} end)`,
			updatedAt: new Date()
		})
		.where(inArray(tasks.id, ids));

	for (const member of family) {
		await recordActivity(tx, {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target: { taskId: member.id },
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

		const milestone = left.find((entry) => entry.id === member.milestoneId);
		if (milestone) {
			await recordActivity(tx, {
				organisationId: actor.organisationId,
				...actorColumns(actor),
				target: { taskId: member.id },
				verb: 'task.milestone.changed',
				payload: { from: milestone, to: null }
			});
		}
	}
}

/**
 * Takes a subtask out from under its parent, through the one writer of
 * `parent_task_id` (`writeParent`), which records `task.parent.changed` on it:
 * the first half of moving one to another project, since a parent and its
 * children always share a project (ADR 0055 §8). Assumes the project lock is held.
 */
async function detachSubtask(tx: Transaction, actor: SessionUser, task: Task): Promise<Task> {
	if (task.parentTaskId === null) return task;

	await writeParent(tx, actor, task, null);
	return { ...task, parentTaskId: null };
}

/**
 * The assignees of the tasks who are not members of `target`, when it is
 * members-only (ADR 0042: an assignment never widens access, and neither does a
 * move), each person once. Empty for an open project, which anybody may be
 * assigned in. A family moves whole, so its caller passes every task of it.
 */
export async function assigneesOutside(
	tx: Transaction,
	taskIds: readonly string[],
	target: Pick<typeof projects.$inferSelect, 'id' | 'visibility'>
): Promise<{ personId: string; fullName: string }[]> {
	if (target.visibility === 'organisation') return [];

	return tx
		.selectDistinct({ personId: people.id, fullName: people.fullName })
		.from(taskAssignees)
		.innerJoin(people, eq(taskAssignees.personId, people.id))
		.where(
			and(
				inArray(taskAssignees.taskId, [...taskIds]),
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

			// A parent takes its children along, so every assignee of the family counts;
			// a subtask goes alone, detached from its parent.
			const children = await tx
				.select({ id: tasks.id })
				.from(tasks)
				.where(eq(tasks.parentTaskId, task.id));
			const family = [task.id, ...children.map((child) => child.id)];
			const outside = await assigneesOutside(tx, family, target);
			if (outside.length > 0) {
				return failure({ kind: 'assignees_not_members' as const, people: outside });
			}

			await reparentTask(tx, actor, await detachSubtask(tx, actor, task), target);
			return success(undefined);
		}

		return failure('task_not_found' as const);
	});
}
