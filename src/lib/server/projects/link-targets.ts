import { and, eq, type SQL } from 'drizzle-orm';
import type { SessionUser } from '../auth/guards';
import type { Transaction } from '../db';
import { projects, tasks } from './schema';
import { requireProjectScope, requireTaskScope } from './scope';
import { readsProjects } from './summaries';

/**
 * What `links` needs to know about a task or a project to relate a ticket to
 * it, read inside the caller's transaction (ADR 0002: `links` never queries
 * these tables itself).
 *
 * Two flavours, on purpose. The `find…` pair is **scoped**: what the actor may
 * link to. The `…Snapshot` pair is **unscoped**: the tag and name an activity
 * entry freezes when a link is undone, which must work whoever is asking and
 * whether or not the project has since been archived.
 */

export interface TaskLinkTarget {
	id: string;
	taskTag: string;
	title: string;
	/** The task's project is archived, so nothing new may point at it. */
	projectArchived: boolean;
}

export interface ProjectLinkTarget {
	id: string;
	projectTag: string;
	name: string;
	archived: boolean;
}

async function taskTarget(tx: Transaction, where: SQL): Promise<TaskLinkTarget | null> {
	const [row] = await tx
		.select({
			id: tasks.id,
			taskTag: tasks.taskTag,
			title: tasks.title,
			archivedAt: projects.archivedAt
		})
		.from(tasks)
		.innerJoin(projects, eq(tasks.projectId, projects.id))
		.where(where)
		.limit(1);

	return row
		? {
				id: row.id,
				taskTag: row.taskTag,
				title: row.title,
				projectArchived: row.archivedAt !== null
			}
		: null;
}

async function projectTarget(tx: Transaction, where: SQL): Promise<ProjectLinkTarget | null> {
	const [row] = await tx
		.select({
			id: projects.id,
			projectTag: projects.projectTag,
			name: projects.name,
			archivedAt: projects.archivedAt
		})
		.from(projects)
		.where(where)
		.limit(1);

	return row
		? { id: row.id, projectTag: row.projectTag, name: row.name, archived: row.archivedAt !== null }
		: null;
}

/** The task as the viewer may see it, or `null`: out of scope reads as missing. */
export async function findTaskInScope(
	tx: Transaction,
	viewer: SessionUser,
	taskId: string
): Promise<TaskLinkTarget | null> {
	if (!readsProjects(viewer)) return null;
	return taskTarget(tx, and(requireTaskScope(viewer), eq(tasks.id, taskId)) as SQL);
}

export async function findProjectInScope(
	tx: Transaction,
	viewer: SessionUser,
	projectId: string
): Promise<ProjectLinkTarget | null> {
	if (!readsProjects(viewer)) return null;
	return projectTarget(tx, and(requireProjectScope(viewer), eq(projects.id, projectId)) as SQL);
}

export function taskSnapshot(
	tx: Transaction,
	organisationId: string,
	taskId: string
): Promise<TaskLinkTarget | null> {
	return taskTarget(tx, and(eq(tasks.organisationId, organisationId), eq(tasks.id, taskId)) as SQL);
}

export function projectSnapshot(
	tx: Transaction,
	organisationId: string,
	projectId: string
): Promise<ProjectLinkTarget | null> {
	return projectTarget(
		tx,
		and(eq(projects.organisationId, organisationId), eq(projects.id, projectId)) as SQL
	);
}
