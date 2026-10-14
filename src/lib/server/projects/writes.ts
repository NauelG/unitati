import { and, eq } from 'drizzle-orm';
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
 * answer that is still true when the write lands.
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
 * A task and its project, the project locked. The task is read **after** the
 * lock: the only thing that can move it is another write in this project, and
 * those are now queued behind us.
 */
export async function lockTask(
	tx: Transaction,
	actor: SessionUser,
	taskId: string
): Promise<Outcome<{ task: Task; project: typeof projects.$inferSelect }, TaskWriteFailure>> {
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

	return success({ task, project: locked.value });
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
