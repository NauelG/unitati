import { and, eq } from 'drizzle-orm';
import { taskHref, ticketHref } from '#lib/domain/routes.js';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { failure, success, type Outcome } from '../shared/outcome';
import { tasks } from '../projects/schema';
import { tickets } from '../service-desk/schema';
import {
	checkTarget,
	checkValues,
	gate,
	insertEntry,
	type Clock,
	type EntryFailure,
	type EntryInput,
	type TimeTarget
} from './entries';
import { runningTimers } from './schema';
import { isTimeTrackingEnabled } from './settings';

/**
 * The timer (ADR 0052): one per person, bound to one ticket or one task and
 * stored server-side, so it survives reloads and devices. Stopping is not a
 * write of its own: it opens the entry form prefilled with the elapsed time, and
 * saving that form turns the timer into an entry. Cancelling discards it. There
 * is no cap; the form is where a forgotten timer gets corrected.
 *
 * **The caller has already resolved the record** through its owning domain.
 */

export type StartTimerFailure = EntryFailure | 'timer_already_running';
export type SaveTimerFailure = EntryFailure | 'no_timer';

export interface TimerView {
	startedAt: Date;
	/** The record it counts on, as the app shell links to it. */
	record: { kind: 'ticket' | 'task'; id: string; tag: string; title: string; href: string };
}

export async function startTimer(
	actor: SessionUser,
	target: TimeTarget
): Promise<Outcome<void, StartTimerFailure>> {
	const refused = await gate(actor);
	if (refused) return failure(refused);

	return getDb().transaction(async (tx): Promise<Outcome<void, StartTimerFailure>> => {
		const blocked = await checkTarget(tx, actor.organisationId, target);
		if (blocked) return failure(blocked);

		// The unique key on `person_id` is the guarantee; the conflict is the answer
		// when two starts race, and nothing is thrown at the caller.
		const inserted = await tx
			.insert(runningTimers)
			.values({
				organisationId: actor.organisationId,
				personId: actor.personId!,
				...('ticketId' in target ? { ticketId: target.ticketId } : { taskId: target.taskId }),
				startedAt: new Date()
			})
			.onConflictDoNothing({ target: runningTimers.personId })
			.returning({ id: runningTimers.id });
		return inserted.length === 0 ? failure('timer_already_running') : success(undefined);
	});
}

/** The viewer's running timer, with the record it counts on; null when there is none or tracking is off. */
export async function getRunningTimer(viewer: SessionUser): Promise<TimerView | null> {
	if (!can(viewer, 'time.log') || viewer.personId === null) return null;
	if (!(await isTimeTrackingEnabled(viewer.organisationId))) return null;

	const [timer] = await getDb()
		.select()
		.from(runningTimers)
		.where(
			and(
				eq(runningTimers.personId, viewer.personId),
				eq(runningTimers.organisationId, viewer.organisationId)
			)
		)
		.limit(1);
	if (!timer) return null;

	if (timer.ticketId) {
		const [ticket] = await getDb()
			.select({ tag: tickets.ticketTag, title: tickets.subject })
			.from(tickets)
			.where(eq(tickets.id, timer.ticketId));
		return {
			startedAt: timer.startedAt,
			record: {
				kind: 'ticket',
				id: timer.ticketId,
				tag: ticket.tag,
				title: ticket.title,
				href: ticketHref(ticket.tag)
			}
		};
	}

	const [task] = await getDb()
		.select({ tag: tasks.taskTag, title: tasks.title })
		.from(tasks)
		.where(eq(tasks.id, timer.taskId!));
	return {
		startedAt: timer.startedAt,
		record: {
			kind: 'task',
			id: timer.taskId!,
			tag: task.tag,
			title: task.title,
			href: taskHref(task.tag)
		}
	};
}

/**
 * Stopping, saved: the timer becomes an entry on the record it counted on, with
 * the values the person settled on in the form. Both happen or neither does.
 */
export async function saveTimer(
	actor: SessionUser,
	input: EntryInput,
	clock: Clock = {}
): Promise<Outcome<{ id: string }, SaveTimerFailure>> {
	const refused = await gate(actor);
	if (refused) return failure(refused);
	const invalid = checkValues(input, clock);
	if (invalid) return failure(invalid);

	return getDb().transaction(async (tx): Promise<Outcome<{ id: string }, SaveTimerFailure>> => {
		const [timer] = await tx
			.select()
			.from(runningTimers)
			.where(eq(runningTimers.personId, actor.personId!))
			.for('update');
		if (!timer) return failure('no_timer');

		const written = await insertEntry(
			tx,
			actor,
			timer.ticketId ? { ticketId: timer.ticketId } : { taskId: timer.taskId! },
			input
		);
		if (!written.ok) return written;

		await tx.delete(runningTimers).where(eq(runningTimers.id, timer.id));
		return written;
	});
}

/** Cancelling the form: the timer is thrown away and nothing is logged. */
export async function discardTimer(actor: SessionUser): Promise<Outcome<void, 'forbidden'>> {
	if (!can(actor, 'time.log') || actor.personId === null) return failure('forbidden');

	await getDb().delete(runningTimers).where(eq(runningTimers.personId, actor.personId));
	return success(undefined);
}
