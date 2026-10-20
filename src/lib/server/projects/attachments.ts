import { and, asc, eq } from 'drizzle-orm';
import { actorColumns, recordActivity } from '../activity';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { attachmentProblem, storeFiles, type UploadedFile } from '../shared/attachments';
import { failure, success, type Outcome } from '../shared/outcome';
import { runtimeStorage } from '../shared/runtime';
import type { Storage } from '../shared/storage';
import { projectAttachments, projects, taskAttachments, tasks } from './schema';
import { requireManage, requireProjectScope, requireTaskScope } from './scope';
import { lockProject, lockTask } from './writes';

/**
 * Files attached to a project or to a task (ADR 0039).
 *
 * The rules are the ones of every other write in the domain: `projects.manage`
 * as a backstop, the project row locked so an archive racing an upload is
 * serialised, an archived project read-only. Reads go through the same scope as
 * the record itself: whoever may not see the task does not see its files, and
 * an id they may not read is `attachment_not_found`, which confirms nothing.
 *
 * **Bytes and rows are never allowed to disagree in the dangerous direction.**
 * On add the bytes are written first and removed again if the transaction
 * fails; on remove the row goes first and the bytes after commit, swallowing a
 * storage failure. An orphaned file is harmless; a row pointing at missing
 * bytes is not.
 */

export type AttachmentDeps = { storage?: Storage };

export type AttachmentView = {
	id: string;
	filename: string;
	contentType: string;
	byteSize: number;
	createdAt: Date;
};

export type AttachmentBytes = { filename: string; contentType: string; data: Uint8Array };

export type AddAttachmentsFailure = 'attachments_too_many' | 'attachments_too_large';
export type AddProjectAttachmentsFailure =
	AddAttachmentsFailure | 'project_not_found' | 'project_archived';
export type AddTaskAttachmentsFailure =
	AddAttachmentsFailure | 'task_not_found' | 'project_archived';
export type RemoveAttachmentFailure = 'attachment_not_found' | 'project_archived';

const viewColumns = {
	id: projectAttachments.id,
	filename: projectAttachments.filename,
	contentType: projectAttachments.contentType,
	byteSize: projectAttachments.byteSize,
	createdAt: projectAttachments.createdAt
};

const taskViewColumns = {
	id: taskAttachments.id,
	filename: taskAttachments.filename,
	contentType: taskAttachments.contentType,
	byteSize: taskAttachments.byteSize,
	createdAt: taskAttachments.createdAt
};

/**
 * One transaction has one `now()`, so files added together would tie on
 * `created_at` and list in random order. A millisecond apart keeps the order
 * the visitor picked them in.
 */
const orderedAt = (base: number, index: number) => new Date(base + index);

/** Bytes that were written but whose rows never landed. Best effort: a leftover is harmless. */
async function discard(storage: Storage, keys: readonly string[]): Promise<void> {
	await Promise.allSettled(keys.map((key) => storage.delete(key)));
}

/* -------------------------------------------------------------------------- */
/* Projects                                                                   */
/* -------------------------------------------------------------------------- */

export async function addProjectAttachments(
	actor: SessionUser,
	projectId: string,
	files: UploadedFile[],
	deps: AttachmentDeps = {}
): Promise<Outcome<AttachmentView[], AddProjectAttachmentsFailure>> {
	requireManage(actor);
	const problem = attachmentProblem(files);
	if (problem) return failure(`attachments_${problem}`);
	if (files.length === 0) return success([]);

	const storage = deps.storage ?? runtimeStorage();
	const stored = await storeFiles(storage, actor.organisationId, files);
	const keys = stored.map(({ row }) => row.storageKey);
	const now = Date.now();

	try {
		const outcome = await getDb().transaction(async (tx) => {
			const locked = await lockProject(tx, actor, projectId);
			if (!locked.ok) return locked;

			const rows = await tx
				.insert(projectAttachments)
				.values(
					stored.map(({ row }, index) => ({
						organisationId: actor.organisationId,
						projectId,
						createdAt: orderedAt(now, index),
						uploadedByPersonId: actor.personId,
						...row
					}))
				)
				.returning(viewColumns);

			for (const row of rows) {
				await recordActivity(tx, {
					organisationId: actor.organisationId,
					...actorColumns(actor),
					target: { projectId },
					verb: 'project.attachment.added',
					payload: { filename: row.filename }
				});
			}
			return success(rows);
		});

		if (!outcome.ok) await discard(storage, keys);
		return outcome;
	} catch (error) {
		await discard(storage, keys);
		throw error;
	}
}

export async function listProjectAttachments(
	viewer: SessionUser,
	projectId: string
): Promise<Outcome<AttachmentView[], 'project_not_found'>> {
	const [project] = await getDb()
		.select({ id: projects.id })
		.from(projects)
		.where(and(requireProjectScope(viewer), eq(projects.id, projectId)))
		.limit(1);
	if (!project) return failure('project_not_found');

	return success(
		await getDb()
			.select(viewColumns)
			.from(projectAttachments)
			.where(eq(projectAttachments.projectId, project.id))
			.orderBy(asc(projectAttachments.createdAt), asc(projectAttachments.id))
	);
}

export async function removeProjectAttachment(
	actor: SessionUser,
	attachmentId: string,
	deps: AttachmentDeps = {}
): Promise<Outcome<void, RemoveAttachmentFailure>> {
	requireManage(actor);
	const storage = deps.storage ?? runtimeStorage();

	const [owning] = await getDb()
		.select({ projectId: projectAttachments.projectId })
		.from(projectAttachments)
		.where(
			and(
				eq(projectAttachments.id, attachmentId),
				eq(projectAttachments.organisationId, actor.organisationId)
			)
		);
	if (!owning) return failure('attachment_not_found');

	const outcome = await getDb().transaction(
		async (tx): Promise<Outcome<string, RemoveAttachmentFailure>> => {
			const locked = await lockProject(tx, actor, owning.projectId);
			if (!locked.ok) {
				return failure(
					locked.error === 'project_archived' ? 'project_archived' : 'attachment_not_found'
				);
			}

			const [removed] = await tx
				.delete(projectAttachments)
				.where(
					and(
						eq(projectAttachments.id, attachmentId),
						eq(projectAttachments.organisationId, actor.organisationId)
					)
				)
				.returning({
					storageKey: projectAttachments.storageKey,
					filename: projectAttachments.filename
				});
			// A second tab got there first.
			if (!removed) return failure('attachment_not_found');

			await recordActivity(tx, {
				organisationId: actor.organisationId,
				...actorColumns(actor),
				target: { projectId: owning.projectId },
				verb: 'project.attachment.removed',
				payload: { filename: removed.filename }
			});
			return success(removed.storageKey);
		}
	);
	if (!outcome.ok) return outcome;

	await discard(storage, [outcome.value]);
	return success(undefined);
}

export async function getProjectAttachment(
	viewer: SessionUser,
	attachmentId: string,
	deps: AttachmentDeps = {}
): Promise<Outcome<AttachmentBytes, 'attachment_not_found'>> {
	const [row] = await getDb()
		.select({
			filename: projectAttachments.filename,
			contentType: projectAttachments.contentType,
			storageKey: projectAttachments.storageKey
		})
		.from(projectAttachments)
		.innerJoin(projects, eq(projectAttachments.projectId, projects.id))
		.where(
			and(
				eq(projectAttachments.id, attachmentId),
				eq(projectAttachments.organisationId, viewer.organisationId),
				requireProjectScope(viewer)
			)
		)
		.limit(1);
	if (!row) return failure('attachment_not_found');

	const data = await (deps.storage ?? runtimeStorage()).get(row.storageKey);
	if (!data) return failure('attachment_not_found');
	return success({ filename: row.filename, contentType: row.contentType, data });
}

/* -------------------------------------------------------------------------- */
/* Tasks                                                                      */
/* -------------------------------------------------------------------------- */

export async function addTaskAttachments(
	actor: SessionUser,
	taskId: string,
	files: UploadedFile[],
	deps: AttachmentDeps = {}
): Promise<Outcome<AttachmentView[], AddTaskAttachmentsFailure>> {
	requireManage(actor);
	const problem = attachmentProblem(files);
	if (problem) return failure(`attachments_${problem}`);
	if (files.length === 0) return success([]);

	const storage = deps.storage ?? runtimeStorage();
	const stored = await storeFiles(storage, actor.organisationId, files);
	const keys = stored.map(({ row }) => row.storageKey);
	const now = Date.now();

	try {
		const outcome = await getDb().transaction(async (tx) => {
			const locked = await lockTask(tx, actor, taskId);
			if (!locked.ok) return locked;

			const rows = await tx
				.insert(taskAttachments)
				.values(
					stored.map(({ row }, index) => ({
						organisationId: actor.organisationId,
						taskId,
						createdAt: orderedAt(now, index),
						uploadedByPersonId: actor.personId,
						...row
					}))
				)
				.returning(taskViewColumns);

			for (const row of rows) {
				await recordActivity(tx, {
					organisationId: actor.organisationId,
					...actorColumns(actor),
					target: { taskId },
					verb: 'task.attachment.added',
					payload: { filename: row.filename }
				});
			}
			return success(rows);
		});

		if (!outcome.ok) await discard(storage, keys);
		return outcome;
	} catch (error) {
		await discard(storage, keys);
		throw error;
	}
}

export async function listTaskAttachments(
	viewer: SessionUser,
	taskId: string
): Promise<Outcome<AttachmentView[], 'task_not_found'>> {
	const [task] = await getDb()
		.select({ id: tasks.id })
		.from(tasks)
		.where(and(requireTaskScope(viewer), eq(tasks.id, taskId)))
		.limit(1);
	if (!task) return failure('task_not_found');

	return success(
		await getDb()
			.select(taskViewColumns)
			.from(taskAttachments)
			.where(eq(taskAttachments.taskId, task.id))
			.orderBy(asc(taskAttachments.createdAt), asc(taskAttachments.id))
	);
}

export async function removeTaskAttachment(
	actor: SessionUser,
	attachmentId: string,
	deps: AttachmentDeps = {}
): Promise<Outcome<void, RemoveAttachmentFailure>> {
	requireManage(actor);
	const storage = deps.storage ?? runtimeStorage();

	const [owning] = await getDb()
		.select({ taskId: taskAttachments.taskId })
		.from(taskAttachments)
		.where(
			and(
				eq(taskAttachments.id, attachmentId),
				eq(taskAttachments.organisationId, actor.organisationId)
			)
		);
	if (!owning) return failure('attachment_not_found');

	const outcome = await getDb().transaction(
		async (tx): Promise<Outcome<string, RemoveAttachmentFailure>> => {
			const locked = await lockTask(tx, actor, owning.taskId);
			if (!locked.ok) {
				return failure(
					locked.error === 'project_archived' ? 'project_archived' : 'attachment_not_found'
				);
			}

			const [removed] = await tx
				.delete(taskAttachments)
				.where(
					and(
						eq(taskAttachments.id, attachmentId),
						eq(taskAttachments.organisationId, actor.organisationId)
					)
				)
				.returning({
					storageKey: taskAttachments.storageKey,
					filename: taskAttachments.filename
				});
			if (!removed) return failure('attachment_not_found');

			await recordActivity(tx, {
				organisationId: actor.organisationId,
				...actorColumns(actor),
				target: { taskId: owning.taskId },
				verb: 'task.attachment.removed',
				payload: { filename: removed.filename }
			});
			return success(removed.storageKey);
		}
	);
	if (!outcome.ok) return outcome;

	await discard(storage, [outcome.value]);
	return success(undefined);
}

export async function getTaskAttachment(
	viewer: SessionUser,
	attachmentId: string,
	deps: AttachmentDeps = {}
): Promise<Outcome<AttachmentBytes, 'attachment_not_found'>> {
	const [row] = await getDb()
		.select({
			filename: taskAttachments.filename,
			contentType: taskAttachments.contentType,
			storageKey: taskAttachments.storageKey
		})
		.from(taskAttachments)
		.innerJoin(tasks, eq(taskAttachments.taskId, tasks.id))
		.where(
			and(
				eq(taskAttachments.id, attachmentId),
				eq(taskAttachments.organisationId, viewer.organisationId),
				requireTaskScope(viewer)
			)
		)
		.limit(1);
	if (!row) return failure('attachment_not_found');

	const data = await (deps.storage ?? runtimeStorage()).get(row.storageKey);
	if (!data) return failure('attachment_not_found');
	return success({ filename: row.filename, contentType: row.contentType, data });
}
