import { and, asc, eq, sql } from 'drizzle-orm';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { tasks } from '../projects/schema';
import { timeEntries, timeEntryTypes } from './schema';
import { isTimeTrackingEnabled } from './settings';

/**
 * A project's time (ADR 0052): the sum of the entries of **every task in it**,
 * subtasks and completed tasks included, broken down by type. Tickets linked to
 * the project do not add to it. Computed on read, never stored, so a task moved
 * to another project carries its time along.
 *
 * **The caller has already resolved the project in the viewer's scope.**
 */
export interface ProjectTime {
	totalMinutes: number;
	byType: { typeId: string; typeName: string; archived: boolean; minutes: number }[];
}

/** `null` while tracking is off or for anybody without `time.log`: nothing to show. */
export async function projectTime(
	viewer: SessionUser,
	projectId: string
): Promise<ProjectTime | null> {
	if (!can(viewer, 'time.log')) return null;
	if (!(await isTimeTrackingEnabled(viewer.organisationId))) return null;

	const rows = await getDb()
		.select({
			typeId: timeEntryTypes.id,
			typeName: timeEntryTypes.name,
			archivedAt: timeEntryTypes.archivedAt,
			minutes: sql<number>`sum(${timeEntries.minutes})::int`
		})
		.from(timeEntries)
		.innerJoin(tasks, eq(tasks.id, timeEntries.taskId))
		.innerJoin(timeEntryTypes, eq(timeEntryTypes.id, timeEntries.typeId))
		.where(
			and(eq(tasks.projectId, projectId), eq(timeEntries.organisationId, viewer.organisationId))
		)
		.groupBy(timeEntryTypes.id)
		.orderBy(asc(timeEntryTypes.position), asc(timeEntryTypes.name));

	const byType = rows.map(({ archivedAt, ...row }) => ({ ...row, archived: archivedAt !== null }));
	return { totalMinutes: byType.reduce((sum, row) => sum + row.minutes, 0), byType };
}
