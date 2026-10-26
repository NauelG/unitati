import { and, desc, eq, gte, isNotNull, lte, sql, type SQL } from 'drizzle-orm';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { people } from '../directory/schema';
import { failure, success, type Outcome } from '../shared/outcome';
import { page, pageWindow, type Page, type PageRequest } from '../shared/pagination';
import { projects, tasks } from '../projects/schema';
import { tickets } from '../service-desk/schema';
import { timeEntries, timeEntryTypes } from './schema';
import { isTimeTrackingEnabled } from './settings';

/**
 * The organisation's time, across tickets and tasks (ADR 0052): what `/time`,
 * the CSV export and `GET /api/v1/time-entries` all read. Everybody's entries
 * for `time.manage`; for `time.log` alone, the actor's own and nobody else's,
 * whatever person the filters name (#379).
 *
 * Reading both kinds of record in one query is the reason this domain exists:
 * `time` reads the `service-desk` and `projects` schemas for exactly this.
 */

export interface ReportFilters {
	/** Inclusive `YYYY-MM-DD` bounds on the work date. */
	from?: string;
	to?: string;
	personId?: string;
	typeId?: string;
	/** Only the entries of the tasks of this project, by its code. */
	projectTag?: string;
	/** Only the entries of this ticket or task, by its code. */
	recordTag?: string;
	/** Only the entries of tickets, or only those of tasks: support time against project time. */
	kind?: 'ticket' | 'task';
}

export interface ReportRow {
	id: string;
	workDate: string;
	personId: string;
	personName: string;
	typeId: string;
	typeName: string;
	minutes: number;
	revision: number;
	note: string | null;
	/**
	 * The ticket or task. `title` is what the viewer may read of it: `time` always
	 * fills it, and whoever composes the screen blanks it for a record the viewer
	 * cannot open (`redactTimeRows` in `links`, ADR 0042, ADR 0050).
	 */
	record: { kind: 'ticket' | 'task'; id: string; tag: string; title: string | null };
	/** The project of the task, with the same caveat on `name`; null for a ticket. */
	project: { tag: string; name: string | null } | null;
}

export type ReportFailure = 'forbidden' | 'time_tracking_disabled';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function conditions(organisationId: string, filters: ReportFilters): SQL {
	return and(
		eq(timeEntries.organisationId, organisationId),
		filters.from && DAY.test(filters.from) ? gte(timeEntries.workDate, filters.from) : undefined,
		filters.to && DAY.test(filters.to) ? lte(timeEntries.workDate, filters.to) : undefined,
		filters.personId ? eq(timeEntries.personId, filters.personId) : undefined,
		filters.typeId ? eq(timeEntries.typeId, filters.typeId) : undefined,
		filters.projectTag ? eq(projects.projectTag, filters.projectTag) : undefined,
		filters.recordTag
			? sql`(${tickets.ticketTag} = ${filters.recordTag} or ${tasks.taskTag} = ${filters.recordTag})`
			: undefined,
		filters.kind === 'ticket' ? isNotNull(timeEntries.ticketId) : undefined,
		filters.kind === 'task' ? isNotNull(timeEntries.taskId) : undefined
	) as SQL;
}

/** The select every read shares, so a row looks the same in the list, the export and the API. */
function selectRows(where: SQL) {
	return getDb()
		.select({
			id: timeEntries.id,
			workDate: timeEntries.workDate,
			personId: timeEntries.personId,
			personName: people.fullName,
			typeId: timeEntries.typeId,
			typeName: timeEntryTypes.name,
			minutes: timeEntries.minutes,
			revision: timeEntries.revision,
			note: timeEntries.note,
			ticketId: tickets.id,
			ticketTag: tickets.ticketTag,
			ticketSubject: tickets.subject,
			taskId: tasks.id,
			taskTag: tasks.taskTag,
			taskTitle: tasks.title,
			projectTag: projects.projectTag,
			projectName: projects.name
		})
		.from(timeEntries)
		.innerJoin(people, eq(people.id, timeEntries.personId))
		.innerJoin(timeEntryTypes, eq(timeEntryTypes.id, timeEntries.typeId))
		.leftJoin(tickets, eq(tickets.id, timeEntries.ticketId))
		.leftJoin(tasks, eq(tasks.id, timeEntries.taskId))
		.leftJoin(projects, eq(projects.id, tasks.projectId))
		.where(where)
		.orderBy(desc(timeEntries.workDate), desc(timeEntries.createdAt), desc(timeEntries.id));
}

type Selected = Awaited<ReturnType<typeof selectRows>>[number];

function toRow(row: Selected): ReportRow {
	return {
		id: row.id,
		workDate: row.workDate,
		personId: row.personId,
		personName: row.personName,
		typeId: row.typeId,
		typeName: row.typeName,
		minutes: row.minutes,
		revision: row.revision,
		note: row.note,
		record: row.ticketTag
			? { kind: 'ticket', id: row.ticketId!, tag: row.ticketTag, title: row.ticketSubject! }
			: { kind: 'task', id: row.taskId!, tag: row.taskTag!, title: row.taskTitle! },
		project: row.projectTag ? { tag: row.projectTag, name: row.projectName! } : null
	};
}

/**
 * Whether the actor reads everybody's time or only their own: `time.manage`
 * reads everybody's, `time.log` alone only the actor's (#379). Exported so a
 * screen can say which one it is showing without restating the rule.
 */
export function reportScope(actor: SessionUser): 'all' | 'own' | null {
	if (can(actor, 'time.manage')) return 'all';
	if (can(actor, 'time.log')) return 'own';
	return null;
}

/**
 * The filters as the actor may apply them. Without `time.manage` the person is
 * forced to the actor, whatever they asked for; a principal with no person of
 * its own owns no entries, so it matches none.
 */
async function scoped(
	actor: SessionUser,
	filters: ReportFilters
): Promise<Outcome<SQL, ReportFailure>> {
	const scope = reportScope(actor);
	if (scope === null) return failure('forbidden');
	if (!(await isTimeTrackingEnabled(actor.organisationId))) {
		return failure('time_tracking_disabled');
	}
	if (scope === 'all') return success(conditions(actor.organisationId, filters));
	if (actor.personId === null) return success(sql`false`);
	return success(conditions(actor.organisationId, { ...filters, personId: actor.personId }));
}

export type ReportPage = Page<ReportRow> & {
	totalMinutes: number;
	/** The part of `totalMinutes` logged on tickets: support. */
	ticketMinutes: number;
	/** The part of `totalMinutes` logged on tasks: projects. The two add up to the total. */
	taskMinutes: number;
};

/**
 * One page of the filtered list, and the totals of the whole filtered list (not
 * just the page): everybody's for `time.manage`, the actor's own for `time.log`.
 */
export async function reportEntries(
	actor: SessionUser,
	filters: ReportFilters,
	request: PageRequest = {}
): Promise<Outcome<ReportPage, ReportFailure>> {
	const scope = await scoped(actor, filters);
	if (!scope.ok) return scope;

	const where = scope.value;
	const window = pageWindow(request);

	const [rows, [totals]] = await Promise.all([
		selectRows(where).limit(window.limit).offset(window.offset),
		getDb()
			.select({
				count: sql<number>`count(*)::int`,
				minutes: sql<number>`coalesce(sum(${timeEntries.minutes}), 0)::int`,
				ticketMinutes: sql<number>`coalesce(sum(${timeEntries.minutes}) filter (where ${timeEntries.ticketId} is not null), 0)::int`
			})
			.from(timeEntries)
			.leftJoin(tickets, eq(tickets.id, timeEntries.ticketId))
			.leftJoin(tasks, eq(tasks.id, timeEntries.taskId))
			.leftJoin(projects, eq(projects.id, tasks.projectId))
			.where(where)
	]);

	return success({
		...page(rows.map(toRow), totals.count, window),
		totalMinutes: totals.minutes,
		ticketMinutes: totals.ticketMinutes,
		// An entry is on exactly one ticket or one task (a check constraint), so the rest is tasks.
		taskMinutes: totals.minutes - totals.ticketMinutes
	});
}

/**
 * One page of the entries behind a project's total (`projectTime`): everybody's,
 * on every task of the project, subtasks and completed tasks included, newest
 * work first. Read-only: entries are edited on the task screen.
 *
 * Not the report: whoever reads the project with `time.log` may list them, as
 * they could already read each one on its task (ADR 0042, #379). **The caller
 * has already resolved the project in the viewer's scope.** `null` while
 * tracking is off or for anybody without `time.log`, as `projectTime`.
 */
export async function projectEntries(
	viewer: SessionUser,
	projectId: string,
	request: PageRequest = {}
): Promise<Page<ReportRow> | null> {
	if (!can(viewer, 'time.log')) return null;
	if (!(await isTimeTrackingEnabled(viewer.organisationId))) return null;

	const where = and(
		eq(timeEntries.organisationId, viewer.organisationId),
		eq(tasks.projectId, projectId)
	) as SQL;
	const window = pageWindow(request);

	const [rows, [{ count }]] = await Promise.all([
		selectRows(where).limit(window.limit).offset(window.offset),
		getDb()
			.select({ count: sql<number>`count(*)::int` })
			.from(timeEntries)
			.innerJoin(tasks, eq(tasks.id, timeEntries.taskId))
			.where(where)
	]);

	return page(rows.map(toRow), count, window);
}

/** Every row of the filtered list, for the export. */
export async function reportAll(
	actor: SessionUser,
	filters: ReportFilters
): Promise<Outcome<ReportRow[], ReportFailure>> {
	const scope = await scoped(actor, filters);
	if (!scope.ok) return scope;

	return success((await selectRows(scope.value)).map(toRow));
}

/**
 * One entry as the API shows it. The author and `time.manage` read it; anybody
 * else gets nothing, so an entry id probes nothing.
 */
export async function getEntry(viewer: SessionUser, entryId: string): Promise<ReportRow | null> {
	if (!can(viewer, 'time.log') && !can(viewer, 'time.manage')) return null;
	if (!(await isTimeTrackingEnabled(viewer.organisationId))) return null;

	const [row] = await selectRows(
		and(eq(timeEntries.organisationId, viewer.organisationId), eq(timeEntries.id, entryId)) as SQL
	);
	if (!row) return null;
	return row.personId === viewer.personId || can(viewer, 'time.manage') ? toRow(row) : null;
}
