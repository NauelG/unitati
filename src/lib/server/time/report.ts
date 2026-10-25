import { and, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';
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
 * The organisation's time, across tickets and tasks (ADR 0051): what `/time`,
 * the CSV export and `GET /api/v1/time-entries` all read. `time.manage` only,
 * because it shows everybody's entries.
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
	record: { kind: 'ticket' | 'task'; tag: string; title: string };
	/** The project of the task; null for a ticket, which is not project work. */
	project: { tag: string; name: string } | null;
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
			: undefined
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
			ticketTag: tickets.ticketTag,
			ticketSubject: tickets.subject,
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
			? { kind: 'ticket', tag: row.ticketTag, title: row.ticketSubject! }
			: { kind: 'task', tag: row.taskTag!, title: row.taskTitle! },
		project: row.projectTag ? { tag: row.projectTag, name: row.projectName! } : null
	};
}

async function allowed(actor: SessionUser): Promise<ReportFailure | null> {
	if (!can(actor, 'time.manage')) return 'forbidden';
	if (!(await isTimeTrackingEnabled(actor.organisationId))) return 'time_tracking_disabled';
	return null;
}

export type ReportPage = Page<ReportRow> & { totalMinutes: number };

/** One page of the filtered list, and the total of the whole filtered list (not just the page). */
export async function reportEntries(
	actor: SessionUser,
	filters: ReportFilters,
	request: PageRequest = {}
): Promise<Outcome<ReportPage, ReportFailure>> {
	const refused = await allowed(actor);
	if (refused) return failure(refused);

	const where = conditions(actor.organisationId, filters);
	const window = pageWindow(request);

	const [rows, [totals]] = await Promise.all([
		selectRows(where).limit(window.limit).offset(window.offset),
		getDb()
			.select({
				count: sql<number>`count(*)::int`,
				minutes: sql<number>`coalesce(sum(${timeEntries.minutes}), 0)::int`
			})
			.from(timeEntries)
			.leftJoin(tickets, eq(tickets.id, timeEntries.ticketId))
			.leftJoin(tasks, eq(tasks.id, timeEntries.taskId))
			.leftJoin(projects, eq(projects.id, tasks.projectId))
			.where(where)
	]);

	return success({
		...page(rows.map(toRow), totals.count, window),
		totalMinutes: totals.minutes
	});
}

/** Every row of the filtered list, for the export. */
export async function reportAll(
	actor: SessionUser,
	filters: ReportFilters
): Promise<Outcome<ReportRow[], ReportFailure>> {
	const refused = await allowed(actor);
	if (refused) return failure(refused);

	return success((await selectRows(conditions(actor.organisationId, filters))).map(toRow));
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
