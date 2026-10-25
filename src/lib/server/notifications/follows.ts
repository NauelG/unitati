import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { can, roleCan } from '../access/permissions';
import { users } from '../auth/schema';
import type { SessionUser } from '../auth/guards';
import { getDb, type Transaction } from '../db';
import { people } from '../directory/schema';
import { taskAssignees } from '../projects/schema';
import { tickets } from '../service-desk/schema';
import { failure, success, type Outcome } from '../shared/outcome';
import type { NotifyTarget } from './notify';
import { follows, notifications } from './schema';

/**
 * Followers (#57, ADR 0040, #330): whoever can see a ticket, task or project, or
 * manages knowledge, may follow
 * it and is told when it moves, without being its requester or assignee.
 *
 * Participants (a ticket's requester and assignee, a task's assignees) are
 * derived from the record and never stored as followers: they already hear about
 * it as participants. Like `schema.ts`, this file reads `service-desk` and
 * `projects` tables only to name the participants of a record; nothing writes
 * them from here.
 */

/** Tickets, tasks, projects and, since #330, knowledge pages (staff only). */
export type FollowTarget = NotifyTarget;
export type FollowViewer = Pick<SessionUser, 'role' | 'personId' | 'organisationId'>;
export type FollowFailure = 'forbidden' | 'participant';

/** The staff permission for the kind of record: staff only, never an employee's own-record scope. */
export function followPermission(target: FollowTarget) {
	if ('ticketId' in target) return 'tickets.view' as const;
	if ('pageId' in target) return 'knowledge.manage' as const;
	return 'projects.view' as const;
}

function mayFollow(viewer: FollowViewer, target: FollowTarget): boolean {
	return viewer.personId !== null && can(viewer, followPermission(target));
}

/** `follows` column filters for one target. */
function targetColumns(target: FollowTarget) {
	if ('ticketId' in target) return eq(follows.ticketId, target.ticketId);
	if ('taskId' in target) return eq(follows.taskId, target.taskId);
	if ('pageId' in target) return eq(follows.pageId, target.pageId);
	return eq(follows.projectId, target.projectId);
}

/**
 * Makes `personId` a follower of a ticket (#303). Idempotent: following twice is
 * the same as once. Callers decide *who* should follow (a mention or a comment
 * does, unless the person is a participant already).
 */
export async function followTicket(
	tx: Transaction,
	input: { organisationId: string; personId: string; ticketId: string }
): Promise<void> {
	await tx.insert(follows).values(input).onConflictDoNothing();
}

/**
 * Makes `personId` a follower of a knowledge page (#330). Idempotent. Only staff
 * (`knowledge.manage`) are ever stored: anybody else is skipped silently, so the
 * callers can pass whoever wrote or was named without checking roles themselves.
 */
export async function followPage(
	tx: Transaction,
	input: { organisationId: string; personId: string; pageId: string }
): Promise<void> {
	const [row] = await tx
		.select({ role: users.role })
		.from(people)
		.innerJoin(users, eq(people.userId, users.id))
		.where(and(eq(people.id, input.personId), eq(people.organisationId, input.organisationId)));
	if (!row || !roleCan(row.role, 'knowledge.manage')) return;
	await tx.insert(follows).values(input).onConflictDoNothing();
}

/** The people following any of these pages, once each (a subtree event, #330). */
export async function pageFollowerIds(
	executor: Pick<Transaction, 'select'>,
	pageIds: string[]
): Promise<string[]> {
	if (pageIds.length === 0) return [];
	const rows = await executor
		.select({ personId: follows.personId })
		.from(follows)
		.where(and(isNotNull(follows.personId), inArray(follows.pageId, pageIds)));
	return [...new Set(rows.map((row) => row.personId))];
}

/** Whether `personId` already hears about the record as a participant. */
async function isParticipant(
	executor: Pick<Transaction, 'select'>,
	personId: string,
	target: FollowTarget
): Promise<boolean> {
	if ('ticketId' in target) {
		const [row] = await executor
			.select({ requester: tickets.requesterPersonId, assignee: tickets.assigneePersonId })
			.from(tickets)
			.where(eq(tickets.id, target.ticketId));
		return row !== undefined && (row.requester === personId || row.assignee === personId);
	}
	if ('taskId' in target) {
		const [row] = await executor
			.select({ personId: taskAssignees.personId })
			.from(taskAssignees)
			.where(and(eq(taskAssignees.taskId, target.taskId), eq(taskAssignees.personId, personId)));
		return row !== undefined;
	}
	return false;
}

/**
 * Follows a record. Needs the staff read permission for its kind. The caller has
 * already checked the record is visible to the viewer (404 otherwise). A
 * participant is accepted and stores nothing: they are told as participants.
 * Following twice is a no-op.
 */
export async function follow(
	viewer: FollowViewer,
	target: FollowTarget
): Promise<Outcome<void, 'forbidden'>> {
	const personId = viewer.personId;
	if (!mayFollow(viewer, target) || personId === null) return failure('forbidden');

	await getDb().transaction(async (tx) => {
		if (await isParticipant(tx, personId, target)) return;
		await tx
			.insert(follows)
			.values({ organisationId: viewer.organisationId, personId, ...target })
			.onConflictDoNothing();
	});
	return success(undefined);
}

/** Stops following. A participant cannot: the UI does not offer it, they use preferences. */
export async function unfollow(
	viewer: FollowViewer,
	target: FollowTarget
): Promise<Outcome<void, 'participant'>> {
	if (viewer.personId === null) return success(undefined);
	const personId = viewer.personId;

	return getDb().transaction(async (tx) => {
		if (await isParticipant(tx, personId, target)) return failure('participant' as const);
		await tx.delete(follows).where(and(eq(follows.personId, personId), targetColumns(target)));
		return success(undefined);
	});
}

export async function isFollowing(viewer: FollowViewer, target: FollowTarget): Promise<boolean> {
	if (viewer.personId === null) return false;
	const [row] = await getDb()
		.select({ id: follows.id })
		.from(follows)
		.where(and(eq(follows.personId, viewer.personId), targetColumns(target)));
	return row !== undefined;
}

/** The people following a record, as stored (roles are checked at notify time). */
export async function followerIds(
	executor: Pick<Transaction, 'select'>,
	target: FollowTarget
): Promise<string[]> {
	const rows = await executor
		.select({ personId: follows.personId })
		.from(follows)
		.where(and(isNotNull(follows.personId), targetColumns(target)));
	return rows.map((row) => row.personId);
}

export type FollowState =
	| { canFollow: false }
	| { canFollow: true; participant: boolean; following: boolean; followerCount: number };

/** What a record's header needs: the button's state and the staff-only count. */
export async function followState(
	viewer: FollowViewer,
	target: FollowTarget
): Promise<FollowState> {
	if (!mayFollow(viewer, target) || viewer.personId === null) return { canFollow: false };

	const db = getDb();
	const [participant, following, [counted]] = await Promise.all([
		isParticipant(db, viewer.personId, target),
		isFollowing(viewer, target),
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(follows)
			.where(targetColumns(target))
	]);
	return { canFollow: true, participant, following, followerCount: counted?.count ?? 0 };
}

/**
 * Unfollows from a notification the viewer received: the row says which record it
 * was about. Another person's id is `not_found`, as if it did not exist.
 */
export async function unfollowFromNotification(
	viewer: FollowViewer,
	notificationId: string
): Promise<Outcome<void, 'not_found' | 'participant'>> {
	if (viewer.personId === null) return failure('not_found');

	const [row] = await getDb()
		.select({
			ticketId: notifications.ticketId,
			taskId: notifications.taskId,
			projectId: notifications.projectId,
			pageId: notifications.pageId
		})
		.from(notifications)
		.where(
			and(
				eq(notifications.id, notificationId),
				eq(notifications.recipientPersonId, viewer.personId)
			)
		);
	if (!row) return failure('not_found');

	const target: FollowTarget = row.ticketId
		? { ticketId: row.ticketId }
		: row.taskId
			? { taskId: row.taskId }
			: row.pageId
				? { pageId: row.pageId }
				: { projectId: row.projectId! };
	return unfollow(viewer, target);
}
