import { and, desc, eq } from 'drizzle-orm';
import { actorColumns, recordActivity } from '../activity';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { people } from '../directory/schema';
import { checkCommentBody, type CommentBodyFailure, type CommentView } from '../shared/comments';
import { failure, success, type Outcome } from '../shared/outcome';
import { projectComments, projects, taskComments, tasks } from './schema';
import { requireManage, requireProjectScope, requireTaskScope } from './scope';
import { lockProject, lockTask } from './writes';

/**
 * Comments on a project or on a task.
 *
 * The rules are those of every other write in the domain: `projects.manage` as
 * a backstop, the project row locked, an archived project read-only. Reads go
 * through the record's own scope, so whoever may not see a task does not read
 * what was said about it. Every comment also writes a `note.added` entry on the
 * record's timeline, in the same transaction.
 */

export type AddProjectCommentFailure =
	CommentBodyFailure | 'project_not_found' | 'project_archived';
export type AddTaskCommentFailure = CommentBodyFailure | 'task_not_found' | 'project_archived';

export async function addProjectComment(
	actor: SessionUser,
	projectId: string,
	text: string
): Promise<Outcome<void, AddProjectCommentFailure>> {
	requireManage(actor);
	const checked = checkCommentBody(text);
	if ('error' in checked) return failure(checked.error);

	return getDb().transaction(async (tx) => {
		const locked = await lockProject(tx, actor, projectId);
		if (!locked.ok) return locked;

		const [comment] = await tx
			.insert(projectComments)
			.values({
				organisationId: actor.organisationId,
				projectId,
				authorPersonId: actor.personId,
				body: checked.body
			})
			.returning({ id: projectComments.id });

		await recordActivity(tx, {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target: { projectId },
			verb: 'note.added',
			payload: { text: checked.body, commentId: comment.id }
		});
		return success(undefined);
	});
}

export async function addTaskComment(
	actor: SessionUser,
	taskId: string,
	text: string
): Promise<Outcome<void, AddTaskCommentFailure>> {
	requireManage(actor);
	const checked = checkCommentBody(text);
	if ('error' in checked) return failure(checked.error);

	return getDb().transaction(async (tx) => {
		const locked = await lockTask(tx, actor, taskId);
		if (!locked.ok) return locked;

		const [comment] = await tx
			.insert(taskComments)
			.values({
				organisationId: actor.organisationId,
				taskId,
				authorPersonId: actor.personId,
				body: checked.body
			})
			.returning({ id: taskComments.id });

		await recordActivity(tx, {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target: { taskId },
			verb: 'note.added',
			payload: { text: checked.body, commentId: comment.id }
		});
		return success(undefined);
	});
}

export async function listProjectComments(
	viewer: SessionUser,
	projectId: string
): Promise<Outcome<CommentView[], 'project_not_found'>> {
	const [project] = await getDb()
		.select({ id: projects.id })
		.from(projects)
		.where(and(requireProjectScope(viewer), eq(projects.id, projectId)))
		.limit(1);
	if (!project) return failure('project_not_found');

	return success(
		await getDb()
			.select({
				id: projectComments.id,
				body: projectComments.body,
				authorName: people.fullName,
				createdAt: projectComments.createdAt
			})
			.from(projectComments)
			.leftJoin(people, eq(projectComments.authorPersonId, people.id))
			.where(eq(projectComments.projectId, project.id))
			.orderBy(desc(projectComments.createdAt), desc(projectComments.id))
	);
}

export async function listTaskComments(
	viewer: SessionUser,
	taskId: string
): Promise<Outcome<CommentView[], 'task_not_found'>> {
	const [task] = await getDb()
		.select({ id: tasks.id })
		.from(tasks)
		.where(and(requireTaskScope(viewer), eq(tasks.id, taskId)))
		.limit(1);
	if (!task) return failure('task_not_found');

	return success(
		await getDb()
			.select({
				id: taskComments.id,
				body: taskComments.body,
				authorName: people.fullName,
				createdAt: taskComments.createdAt
			})
			.from(taskComments)
			.leftJoin(people, eq(taskComments.authorPersonId, people.id))
			.where(eq(taskComments.taskId, task.id))
			.orderBy(desc(taskComments.createdAt), desc(taskComments.id))
	);
}
