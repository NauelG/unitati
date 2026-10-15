import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { StateGroup } from '#lib/domain/status.js';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { projects, states, tasks } from './schema';
import { requireProjectScope, requireTaskScope } from './scope';

/**
 * What `links` needs to draw a task or a project on the other side of a
 * relation: the reads it would otherwise do by joining these tables itself
 * (ADR 0002). They answer for the viewer's organisation and say, per record,
 * whether it is **inside the viewer's scope** instead of silently dropping it:
 * the requester's reduced view (ADR 0007, amendment 2026-10-15) needs to know
 * the difference between "not yours" and "not there".
 */

export interface TaskSummary {
	id: string;
	taskTag: string;
	title: string;
	stateGroup: StateGroup;
	stateName: string;
	inScope: boolean;
}

export interface ProjectSummary {
	id: string;
	projectTag: string;
	name: string;
	archived: boolean;
	inScope: boolean;
}

/**
 * The scope SQL throws for a viewer holding no project-read permission at all (a
 * route that forgot its guard). For a relation panel that is an ordinary answer
 * — a key narrowed to `tickets.manage` simply sees no project — so it reads as
 * "nothing is in scope".
 */
export function readsProjects(viewer: SessionUser): boolean {
	return can(viewer, 'projects.view') || can(viewer, 'projects.view.assigned');
}

const NOTHING = sql`false`;

const taskScope = (viewer: SessionUser): SQL =>
	readsProjects(viewer) ? requireTaskScope(viewer) : NOTHING;

const projectScope = (viewer: SessionUser): SQL =>
	readsProjects(viewer) ? requireProjectScope(viewer) : NOTHING;

function taskSelection(viewer: SessionUser) {
	return getDb()
		.select({
			id: tasks.id,
			taskTag: tasks.taskTag,
			title: tasks.title,
			stateGroup: states.group,
			stateName: states.name,
			inScope: sql<boolean>`(${taskScope(viewer)})`
		})
		.from(tasks)
		.innerJoin(states, eq(tasks.stateId, states.id));
}

/** The tasks of the organisation among `ids`, each flagged with whether the viewer may open it. */
export async function taskSummaries(viewer: SessionUser, ids: string[]): Promise<TaskSummary[]> {
	if (ids.length === 0) return [];

	return taskSelection(viewer).where(
		and(eq(tasks.organisationId, viewer.organisationId), inArray(tasks.id, ids))
	);
}

/** The tasks of a project the viewer may open, in no particular order. */
export async function tasksOfProject(
	viewer: SessionUser,
	projectId: string
): Promise<TaskSummary[]> {
	if (!readsProjects(viewer)) return [];

	return taskSelection(viewer)
		.where(and(taskScope(viewer), eq(tasks.projectId, projectId)))
		.orderBy(asc(tasks.id));
}

export async function projectSummaries(
	viewer: SessionUser,
	ids: string[]
): Promise<ProjectSummary[]> {
	if (ids.length === 0) return [];

	const rows = await getDb()
		.select({
			id: projects.id,
			projectTag: projects.projectTag,
			name: projects.name,
			archivedAt: projects.archivedAt,
			inScope: sql<boolean>`(${projectScope(viewer)})`
		})
		.from(projects)
		.where(and(eq(projects.organisationId, viewer.organisationId), inArray(projects.id, ids)));

	return rows.map(({ archivedAt, ...row }) => ({ ...row, archived: archivedAt !== null }));
}
