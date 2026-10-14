import { and, asc, eq, inArray } from 'drizzle-orm';
import type { SessionUser } from '../auth/guards';
import type { Database, Transaction } from '../db';
import { people } from '../directory/schema';
import { failure, success, type Outcome } from '../shared/outcome';
import { projects, tasks, type Task } from './schema';

/**
 * What every write in the domain shares: locking the project it touches, and the
 * rule that an archived project is read-only.
 *
 * **The project row is the lock.** Moves, creations and edits inside one project
 * serialise on it (`for update`), which is what keeps two simultaneous drops from
 * computing the same midpoint, and what makes "is this project archived?" an
 * answer that is still true when the write lands. A write that touches two
 * projects locks both, in one statement ordered by `id` (ADR 0021).
 */

export type ProjectWriteFailure = 'project_not_found' | 'project_archived';
export type TaskWriteFailure = 'task_not_found' | 'project_archived';

/** The project a write is about, locked for the rest of the transaction. */
export async function lockProject(
	tx: Transaction,
	actor: SessionUser,
	projectId: string
): Promise<Outcome<typeof projects.$inferSelect, ProjectWriteFailure>> {
	const [project] = await tx
		.select()
		.from(projects)
		.where(and(eq(projects.id, projectId), eq(projects.organisationId, actor.organisationId)))
		.for('update');

	if (!project) return failure('project_not_found');
	if (project.archivedAt) return failure('project_archived');
	return success(project);
}

/**
 * Both projects of a write that touches two, locked in **one statement ordered by
 * `id`**. A fixed order is what keeps two opposite moves (A→B and B→A) from each
 * holding one row and waiting for the other. Rows come back in `id` order;
 * a missing or foreign project is simply absent from the result, and the caller
 * decides what that means. Archived projects are returned too: whether that is
 * acceptable is the caller's rule, not the lock's.
 */
export async function lockProjects(
	tx: Transaction,
	actor: SessionUser,
	projectIds: readonly string[]
): Promise<Outcome<(typeof projects.$inferSelect)[], never>> {
	const rows = await tx
		.select()
		.from(projects)
		.where(
			and(
				inArray(projects.id, [...new Set(projectIds)]),
				eq(projects.organisationId, actor.organisationId)
			)
		)
		.orderBy(asc(projects.id))
		.for('update');

	return success(rows);
}

/**
 * A task and its project, the project locked. The task is read **after** the
 * lock, and its project is checked again: a task may change project (#120), so
 * between reading which project owns it and getting that project's lock another
 * write may have moved it. When it has, the lock we hold is on the wrong
 * project; try once more with the new owner, and give up as `task_not_found` if
 * it moved again. (A row lock cannot be released early; the stale one is held
 * to the end of the transaction, which is harmless.)
 */
export async function lockTask(
	tx: Transaction,
	actor: SessionUser,
	taskId: string
): Promise<Outcome<{ task: Task; project: typeof projects.$inferSelect }, TaskWriteFailure>> {
	for (let attempt = 0; attempt < 2; attempt++) {
		const [owning] = await tx
			.select({ projectId: tasks.projectId })
			.from(tasks)
			.where(and(eq(tasks.id, taskId), eq(tasks.organisationId, actor.organisationId)));
		if (!owning) return failure('task_not_found');

		const locked = await lockProject(tx, actor, owning.projectId);
		if (!locked.ok) {
			return failure(locked.error === 'project_archived' ? 'project_archived' : 'task_not_found');
		}

		const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId));
		if (!task) return failure('task_not_found');
		if (task.projectId === owning.projectId) return success({ task, project: locked.value });
	}

	return failure('task_not_found');
}

/** A person of the actor's organisation, with the name an activity entry snapshots. */
export async function findPerson(
	db: Database | Transaction,
	organisationId: string,
	personId: string
): Promise<{ id: string; fullName: string } | null> {
	const [person] = await db
		.select({ id: people.id, fullName: people.fullName })
		.from(people)
		.where(and(eq(people.id, personId), eq(people.organisationId, organisationId)));
	return person ?? null;
}
