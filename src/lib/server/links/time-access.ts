import type { SessionUser } from '../auth/guards';
import { readsProjects, taskSummaries } from '../projects';
import { ticketSummaries } from '../service-desk';
import {
	getRunningTimer,
	timerTarget,
	type ReportRow,
	type TimerView,
	type TimeTarget
} from '../time';

/**
 * Who may see the record a time entry or a timer is on (ADR 0042, ADR 0050,
 * ADR 0052). `time` calls no other domain, so it hands back the target of an
 * entry or a timer and the caller asks the owning domain whether the viewer can
 * read it. `links` sits above every domain, which is why the composition lives
 * here and the app routes, the screens and the API can all share it.
 *
 * A record the viewer cannot read is answered like one that does not exist.
 */

/** Whether the viewer could open the ticket or the task under the read policy of its domain. */
export async function canReadTimeTarget(viewer: SessionUser, target: TimeTarget): Promise<boolean> {
	if ('ticketId' in target) {
		return (await ticketSummaries(viewer, [target.ticketId])).length > 0;
	}
	if (!readsProjects(viewer)) return false;
	const [task] = await taskSummaries(viewer, [target.taskId]);
	return task?.inScope === true;
}

/**
 * The viewer's running timer, unless the record it counts on has gone out of
 * their reach since they started it: then it is not shown, though it still
 * exists and can be discarded.
 */
export async function visibleRunningTimer(viewer: SessionUser): Promise<TimerView | null> {
	const target = await timerTarget(viewer);
	if (!target || !(await canReadTimeTarget(viewer, target))) return null;
	return getRunningTimer(viewer);
}

/**
 * The rows with the title of every record, and the name of every project, the
 * viewer cannot read blanked out. The codes stay: they are what an auditor
 * needs to match the row to the record, and say nothing about it.
 */
export async function redactTimeRows<Row extends ReportRow>(
	viewer: SessionUser,
	rows: readonly Row[]
): Promise<Row[]> {
	if (rows.length === 0) return [];

	const ticketIds = rows.filter((row) => row.record.kind === 'ticket').map((row) => row.record.id);
	const taskIds = rows.filter((row) => row.record.kind === 'task').map((row) => row.record.id);
	const [tickets, tasks] = await Promise.all([
		ticketIds.length > 0 ? ticketSummaries(viewer, [...new Set(ticketIds)]) : [],
		taskIds.length > 0 && readsProjects(viewer) ? taskSummaries(viewer, [...new Set(taskIds)]) : []
	]);
	const readable = new Set([
		...tickets.map((ticket) => ticket.id),
		...tasks.filter((task) => task.inScope).map((task) => task.id)
	]);

	return rows.map((row) =>
		readable.has(row.record.id)
			? row
			: {
					...row,
					record: { ...row.record, title: null },
					project: row.project && { ...row.project, name: null }
				}
	);
}
