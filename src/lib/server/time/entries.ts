import { and, desc, eq, sql } from 'drizzle-orm';
import { MAX_ENTRY_MINUTES, calendarDayIn } from '#lib/domain/time.js';
import { can } from '../access/permissions';
import { actorColumns, recordActivity } from '../activity';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import type { Executor, Transaction } from '../db';
import { people } from '../directory/schema';
import { failure, success, type Outcome } from '../shared/outcome';
import { runtimeTimeZone } from '../shared/runtime';
import { projects, tasks } from '../projects/schema';
import { tickets } from '../service-desk/schema';
import { timeEntries, timeEntryTypes } from './schema';
import { isTimeTrackingEnabled } from './settings';

/**
 * Time entries (ADR 0052). An entry is first-person: a person with `time.log`
 * creates entries only for themselves and edits or deletes only their own;
 * `time.manage` corrects anybody's. Nobody authors on behalf of someone else.
 *
 * **The caller has already resolved the record through its owning domain's read
 * policy** (ADR 0050, ADR 0042). `time` only checks that the record is in the
 * organisation and that its project is not archived (ADR 0021).
 */

export type TimeTarget = { ticketId: string } | { taskId: string };

export const MAX_NOTE_LENGTH = 2000;

export type EntryFailure =
	| 'forbidden'
	| 'time_tracking_disabled'
	| 'record_not_found'
	| 'entry_not_found'
	| 'project_archived'
	| 'invalid_minutes'
	| 'invalid_date'
	| 'future_date'
	| 'invalid_type'
	| 'note_too_long';

/** An edit may also lose a race (ADR 0046). */
export type EditFailure = EntryFailure | { kind: 'stale_revision'; revision: number };

export interface EntryInput {
	minutes: number;
	/** `YYYY-MM-DD`. */
	workDate: string;
	/** Defaults to the organisation's default type. */
	typeId?: string | null;
	note?: string | null;
}

export interface EntryView {
	id: string;
	personId: string;
	personName: string;
	typeId: string;
	typeName: string;
	typeArchived: boolean;
	minutes: number;
	workDate: string;
	note: string | null;
	revision: number;
	/** The viewer may edit or delete it: their own, or `time.manage`. */
	canChange: boolean;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today in the organisation's zone, overridable so a spec can fix the clock. */
export type Clock = { now?: Date };

/** Today (`YYYY-MM-DD`) in the organisation's zone: the day a work date is validated against. */
export function organisationToday(clock: Clock = {}): string {
	return calendarDayIn(runtimeTimeZone(), clock.now ?? new Date());
}

function validDay(value: string): boolean {
	if (!ISO_DATE.test(value)) return false;
	const date = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export function checkValues(input: EntryInput, clock: Clock): EntryFailure | null {
	if (!Number.isInteger(input.minutes) || input.minutes < 1 || input.minutes > MAX_ENTRY_MINUTES) {
		return 'invalid_minutes';
	}
	if (!validDay(input.workDate)) return 'invalid_date';
	if (input.workDate > organisationToday(clock)) {
		return 'future_date';
	}
	if ((input.note?.length ?? 0) > MAX_NOTE_LENGTH) return 'note_too_long';
	return null;
}

const cleanNote = (note: string | null | undefined) => {
	const trimmed = note?.trim();
	return trimmed ? trimmed : null;
};

/** The gate every write shares: `time.log`, a person to author as, tracking on. */
export async function gate(actor: SessionUser): Promise<EntryFailure | null> {
	if (!can(actor, 'time.log') || actor.personId === null) return 'forbidden';
	if (!(await isTimeTrackingEnabled(actor.organisationId))) return 'time_tracking_disabled';
	return null;
}

/**
 * The gate of an edit or a delete. An author needs what a write needs; `time.manage`
 * corrects anybody's entry and needs no person of its own, so a key with no person
 * behind it may do so. It still cannot author: `gate` stays the gate of a create.
 */
async function changeGate(actor: SessionUser): Promise<EntryFailure | null> {
	if (!can(actor, 'time.manage')) return gate(actor);
	if (!(await isTimeTrackingEnabled(actor.organisationId))) return 'time_tracking_disabled';
	return null;
}

/**
 * Whether the record exists in the organisation and may be written to: a task
 * of an archived project is read-only. The project row is locked shared so an
 * archive cannot slip between this check and the insert.
 */
export async function checkTarget(
	tx: Executor,
	organisationId: string,
	target: TimeTarget
): Promise<'record_not_found' | 'project_archived' | null> {
	if ('ticketId' in target) {
		const [ticket] = await tx
			.select({ id: tickets.id })
			.from(tickets)
			.where(and(eq(tickets.id, target.ticketId), eq(tickets.organisationId, organisationId)))
			.limit(1);
		return ticket ? null : 'record_not_found';
	}

	const [row] = await tx
		.select({ archivedAt: projects.archivedAt })
		.from(tasks)
		.innerJoin(projects, eq(projects.id, tasks.projectId))
		.where(and(eq(tasks.id, target.taskId), eq(tasks.organisationId, organisationId)))
		.for('share', { of: projects });
	if (!row) return 'record_not_found';
	return row.archivedAt ? 'project_archived' : null;
}

async function offeredType(
	tx: Executor,
	organisationId: string,
	typeId: string | null | undefined
) {
	const [type] = await tx
		.select()
		.from(timeEntryTypes)
		.where(
			and(
				eq(timeEntryTypes.organisationId, organisationId),
				typeId ? eq(timeEntryTypes.id, typeId) : eq(timeEntryTypes.isDefault, true),
				sql`${timeEntryTypes.archivedAt} is null`
			)
		)
		.limit(1);
	return type ?? null;
}

async function nameOf(tx: Executor, personId: string): Promise<string> {
	const [person] = await tx
		.select({ fullName: people.fullName })
		.from(people)
		.where(eq(people.id, personId));
	return person.fullName;
}

const targetColumns = (target: TimeTarget) =>
	'ticketId' in target ? { ticketId: target.ticketId } : { taskId: target.taskId };

export async function logTime(
	actor: SessionUser,
	target: TimeTarget,
	input: EntryInput,
	clock: Clock = {}
): Promise<Outcome<{ id: string }, EntryFailure>> {
	const refused = await gate(actor);
	if (refused) return failure(refused);
	const invalid = checkValues(input, clock);
	if (invalid) return failure(invalid);

	return getDb().transaction((tx) => insertEntry(tx, actor, target, input));
}

/**
 * The write of a new entry and its history, inside the caller's transaction:
 * what `logTime` and saving a stopped timer (`timers.ts`) have in common. The
 * values and the gate are checked by the caller.
 */
export async function insertEntry(
	tx: Transaction,
	actor: SessionUser,
	target: TimeTarget,
	input: EntryInput
): Promise<Outcome<{ id: string }, EntryFailure>> {
	const personId = actor.personId!;
	const blocked = await checkTarget(tx, actor.organisationId, target);
	if (blocked) return failure(blocked);
	const type = await offeredType(tx, actor.organisationId, input.typeId);
	if (!type) return failure('invalid_type');

	const [entry] = await tx
		.insert(timeEntries)
		.values({
			organisationId: actor.organisationId,
			...targetColumns(target),
			personId,
			typeId: type.id,
			minutes: input.minutes,
			workDate: input.workDate,
			note: cleanNote(input.note)
		})
		.returning({ id: timeEntries.id });

	await recordActivity(tx, {
		organisationId: actor.organisationId,
		...actorColumns(actor),
		target: targetColumns(target),
		verb: 'time.logged',
		payload: {
			authorPersonId: personId,
			authorName: await nameOf(tx, personId),
			typeName: type.name,
			minutes: input.minutes,
			workDate: input.workDate
		}
	});
	return success(entry);
}

/** The entry, locked, with the record it is on; absent for another organisation's. */
async function lockEntry(tx: Transaction, actor: SessionUser, entryId: string) {
	const [entry] = await tx
		.select()
		.from(timeEntries)
		.where(and(eq(timeEntries.id, entryId), eq(timeEntries.organisationId, actor.organisationId)))
		.for('update');
	return entry ?? null;
}

/**
 * The ticket or task an entry is on, for the caller to resolve through the
 * owning domain's read policy before it writes or renders (ADR 0050). `null`
 * for an entry that does not exist in the organisation.
 */
export async function entryTarget(actor: SessionUser, entryId: string): Promise<TimeTarget | null> {
	const [entry] = await getDb()
		.select({ ticketId: timeEntries.ticketId, taskId: timeEntries.taskId })
		.from(timeEntries)
		.where(and(eq(timeEntries.id, entryId), eq(timeEntries.organisationId, actor.organisationId)));
	if (!entry) return null;
	return entry.ticketId ? { ticketId: entry.ticketId } : { taskId: entry.taskId! };
}

/** Own entries, or anybody's with `time.manage`. */
const mayChange = (actor: SessionUser, authorPersonId: string) =>
	authorPersonId === actor.personId || can(actor, 'time.manage');

export async function editEntry(
	actor: SessionUser,
	entryId: string,
	input: EntryInput & { baseRevision?: number },
	clock: Clock = {}
): Promise<Outcome<{ id: string; revision: number }, EditFailure>> {
	const refused = await changeGate(actor);
	if (refused) return failure(refused);
	const invalid = checkValues(input, clock);
	if (invalid) return failure(invalid);

	return getDb().transaction(
		async (tx): Promise<Outcome<{ id: string; revision: number }, EditFailure>> => {
			const entry = await lockEntry(tx, actor, entryId);
			if (!entry) return failure('entry_not_found');
			if (!mayChange(actor, entry.personId)) return failure('forbidden');

			const blocked = await checkTarget(
				tx,
				actor.organisationId,
				entry.ticketId ? { ticketId: entry.ticketId } : { taskId: entry.taskId! }
			);
			if (blocked) return failure(blocked);

			if (input.baseRevision !== undefined && input.baseRevision !== entry.revision) {
				return failure({ kind: 'stale_revision', revision: entry.revision });
			}

			// Keeping the type an entry already has is always fine, even once archived;
			// moving onto an archived one is not.
			const [current] = await tx
				.select()
				.from(timeEntryTypes)
				.where(eq(timeEntryTypes.id, entry.typeId));
			const wanted = input.typeId ?? entry.typeId;
			const type =
				wanted === entry.typeId ? current : await offeredType(tx, actor.organisationId, wanted);
			if (!type) return failure('invalid_type');

			const note = cleanNote(input.note);
			const changes: {
				minutes?: { from: number; to: number };
				workDate?: { from: string; to: string };
				typeName?: { from: string; to: string };
				note?: { from: string | null; to: string | null };
			} = {};
			if (input.minutes !== entry.minutes)
				changes.minutes = { from: entry.minutes, to: input.minutes };
			if (input.workDate !== entry.workDate) {
				changes.workDate = { from: entry.workDate, to: input.workDate };
			}
			if (type.id !== entry.typeId) changes.typeName = { from: current.name, to: type.name };
			if (note !== entry.note) changes.note = { from: entry.note, to: note };
			if (Object.keys(changes).length === 0) {
				return success({ id: entry.id, revision: entry.revision });
			}

			const revision = entry.revision + 1;
			await tx
				.update(timeEntries)
				.set({
					minutes: input.minutes,
					workDate: input.workDate,
					typeId: type.id,
					note,
					revision,
					updatedAt: new Date()
				})
				.where(eq(timeEntries.id, entry.id));

			await recordActivity(tx, {
				organisationId: actor.organisationId,
				...actorColumns(actor),
				target: entry.ticketId ? { ticketId: entry.ticketId } : { taskId: entry.taskId! },
				verb: 'time.edited',
				payload: {
					...(await factsOf(tx, actor, entry, {
						typeName: type.name,
						minutes: input.minutes,
						workDate: input.workDate
					})),
					changes
				}
			});
			return success({ id: entry.id, revision });
		}
	);
}

export async function deleteEntry(
	actor: SessionUser,
	entryId: string
): Promise<Outcome<void, EntryFailure>> {
	const refused = await changeGate(actor);
	if (refused) return failure(refused);

	return getDb().transaction(async (tx): Promise<Outcome<void, EntryFailure>> => {
		const entry = await lockEntry(tx, actor, entryId);
		if (!entry) return failure('entry_not_found');
		if (!mayChange(actor, entry.personId)) return failure('forbidden');

		const target = entry.ticketId ? { ticketId: entry.ticketId } : { taskId: entry.taskId! };
		const blocked = await checkTarget(tx, actor.organisationId, target);
		if (blocked) return failure(blocked);

		const [type] = await tx
			.select({ name: timeEntryTypes.name })
			.from(timeEntryTypes)
			.where(eq(timeEntryTypes.id, entry.typeId));
		await tx.delete(timeEntries).where(eq(timeEntries.id, entry.id));

		await recordActivity(tx, {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target,
			verb: 'time.removed',
			payload: await factsOf(tx, actor, entry, {
				typeName: type.name,
				minutes: entry.minutes,
				workDate: entry.workDate
			})
		});
		return success(undefined);
	});
}

/** The payload every time verb shares, naming the author and, when it differs, the actor. */
async function factsOf(
	tx: Executor,
	actor: SessionUser,
	entry: { personId: string },
	rest: { typeName: string; minutes: number; workDate: string }
) {
	return {
		authorPersonId: entry.personId,
		authorName: await nameOf(tx, entry.personId),
		...(entry.personId === actor.personId ? {} : { actorName: actor.name }),
		...rest
	};
}

export interface RecordTime {
	entries: EntryView[];
	totalMinutes: number;
}

/**
 * The entries of one ticket or task, newest work first. Empty while tracking is
 * off and for anybody without `time.log`: employees see no time data anywhere.
 */
export async function listEntriesFor(viewer: SessionUser, target: TimeTarget): Promise<RecordTime> {
	if (!can(viewer, 'time.log')) return { entries: [], totalMinutes: 0 };
	if (!(await isTimeTrackingEnabled(viewer.organisationId)))
		return { entries: [], totalMinutes: 0 };

	const rows = await getDb()
		.select({
			id: timeEntries.id,
			personId: timeEntries.personId,
			personName: people.fullName,
			typeId: timeEntries.typeId,
			typeName: timeEntryTypes.name,
			typeArchivedAt: timeEntryTypes.archivedAt,
			minutes: timeEntries.minutes,
			workDate: timeEntries.workDate,
			note: timeEntries.note,
			revision: timeEntries.revision
		})
		.from(timeEntries)
		.innerJoin(people, eq(people.id, timeEntries.personId))
		.innerJoin(timeEntryTypes, eq(timeEntryTypes.id, timeEntries.typeId))
		.where(
			and(
				eq(timeEntries.organisationId, viewer.organisationId),
				'ticketId' in target
					? eq(timeEntries.ticketId, target.ticketId)
					: eq(timeEntries.taskId, target.taskId)
			)
		)
		.orderBy(desc(timeEntries.workDate), desc(timeEntries.createdAt), desc(timeEntries.id));

	const entries = rows.map(({ typeArchivedAt, ...row }) => ({
		...row,
		typeArchived: typeArchivedAt !== null,
		canChange: mayChange(viewer, row.personId)
	}));
	return { entries, totalMinutes: entries.reduce((sum, entry) => sum + entry.minutes, 0) };
}
