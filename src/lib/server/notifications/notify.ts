import { and, eq, inArray } from 'drizzle-orm';
import { can } from '../access/permissions';
import { users, type UserRole } from '../auth/schema';
import type { Transaction } from '../db';
import { people } from '../directory/schema';
import { followerIds } from './follows';
import { notificationPreferences, notifications } from './schema';
import type { Snapshot } from './snapshot';
import { snapshotSchema } from './snapshot';
import { DEFAULTS, isDirect, strongerType, type NotificationType } from './types';

export type NotifyTarget =
	{ ticketId: string } | { taskId: string } | { projectId: string } | { pageId: string };

export type NotifyInput = {
	organisationId: string;
	actorPersonId: string | null;
	target: NotifyTarget;
	snapshot: Snapshot;
	/** Candidate recipients, each with the type that applies to them. */
	recipients: { personId: string; type: NotificationType }[];
	/** For a ticket comment; internal reaches only holders of `tickets.comment.internal`. */
	visibility?: 'public' | 'internal';
	/**
	 * When the target is restricted (a members-only project, ADR 0042), the people
	 * allowed to hear about it. Everybody else is dropped, followers included
	 * (#57); admins always pass, because they can open every record. The producing
	 * domain computes it, so this module never reads another domain's tables.
	 */
	audience?: ReadonlySet<string>;
	/**
	 * Also tell whoever follows the target (#57), as `followed.activity`. Off by
	 * default: only the facts listed in ADR 0040 reach followers.
	 */
	followers?: boolean;
	/**
	 * What happened, for the followers only (#57): "Pasó a En curso". Participants
	 * and mentioned people keep the snapshot as it is, because it already says why
	 * they were told.
	 */
	followerSummary?: string;
};

/** A mail the caller sends after commit, with `sendNotificationEmails` (#302). */
export type PendingEmail = {
	to: string;
	type: NotificationType;
	personId: string;
	/** The recipient's role, so the link leads where they read the record; null without a user. */
	role: UserRole | null;
	snapshot: Snapshot;
	target: NotifyTarget;
};

/** Step 2: one entry per person, of the strongest type they were named for. */
function collapse(recipients: NotifyInput['recipients']): Map<string, NotificationType> {
	const byPerson = new Map<string, NotificationType>();
	for (const { personId, type } of recipients) {
		const known = byPerson.get(personId);
		byPerson.set(personId, known ? strongerType(known, type) : type);
	}
	return byPerson;
}

/**
 * Step 3 of `notify` (#57): the followers of the target, as candidates of type
 * `followed.activity`. Weaker than any participant or mention type, so
 * `strongerType` keeps the stronger one when a follower is also named. Followers
 * are filtered by their **current** role, so a demoted follower stops hearing
 * about what they can no longer read; the row stays, so a promotion brings them back.
 */
async function addFollowers(
	tx: Transaction,
	input: NotifyInput,
	candidates: Map<string, NotificationType>
): Promise<Map<string, NotificationType>> {
	// Pages cannot be followed (#326); the comment thread is staff-only.
	if (!input.followers || 'pageId' in input.target) return candidates;

	const ids = await followerIds(tx, input.target);
	if (ids.length === 0) return candidates;

	const permission = 'ticketId' in input.target ? 'tickets.view' : 'projects.view';
	const rows = await tx
		.select({ id: people.id, role: users.role })
		.from(people)
		.innerJoin(users, eq(people.userId, users.id))
		.where(and(eq(people.organisationId, input.organisationId), inArray(people.id, ids)));

	const merged = new Map(candidates);
	for (const { id, role } of rows) {
		if (id === input.actorPersonId || !can({ role }, permission)) continue;
		const known = merged.get(id);
		merged.set(id, known ? strongerType(known, 'followed.activity') : 'followed.activity');
	}
	return merged;
}

/**
 * The one way a notification is written (ADR 0040). It takes a `Transaction`, as
 * `recordActivity` does: the notification commits with the change that caused it
 * or not at all, so it can neither be lost nor announce something that rolled back.
 *
 * Returns the mails to send once the caller's transaction has committed.
 */
export async function notify(tx: Transaction, input: NotifyInput): Promise<PendingEmail[]> {
	const snapshot = snapshotSchema.parse(input.snapshot);
	const followerSnapshot = input.followerSummary
		? snapshotSchema.parse({ ...snapshot, summary: input.followerSummary })
		: snapshot;

	// 1. The actor never notifies themself.
	const others = input.recipients.filter(({ personId }) => personId !== input.actorPersonId);

	// 2. One notification per person, of the strongest type.
	const collapsed = collapse(others);

	// 3. Followers (#57).
	const candidates = await addFollowers(tx, input, collapsed);
	if (candidates.size === 0) return [];

	// 4. Who they are, and whether they may see this.
	const ids = [...candidates.keys()];
	const rows = await tx
		.select({
			id: people.id,
			active: people.active,
			userId: people.userId,
			email: people.email,
			role: users.role
		})
		.from(people)
		.leftJoin(users, eq(people.userId, users.id))
		.where(and(eq(people.organisationId, input.organisationId), inArray(people.id, ids)));

	const eligible = rows.filter((person) => {
		if (!person.active) return false;
		// Page comments are staff business: a demoted person stops receiving them (#326).
		if ('pageId' in input.target) {
			if (person.role === null || !can({ role: person.role }, 'knowledge.manage')) return false;
		}
		if (input.audience && person.role !== 'admin' && !input.audience.has(person.id)) return false;
		if (input.visibility === 'internal') {
			return person.role !== null && can({ role: person.role }, 'tickets.comment.internal');
		}
		return true;
	});
	if (eligible.length === 0) return [];

	// 5. Preferences: only rows that differ from the defaults exist.
	const preferences = await tx
		.select()
		.from(notificationPreferences)
		.where(
			inArray(
				notificationPreferences.personId,
				eligible.map((person) => person.id)
			)
		);
	const preferred = (personId: string, type: NotificationType, channel: 'in_app' | 'email') =>
		preferences.find(
			(row) => row.personId === personId && row.type === type && row.channel === channel
		)?.enabled;

	const toInsert: (typeof notifications.$inferInsert)[] = [];
	const emails: PendingEmail[] = [];

	for (const person of eligible) {
		const type = candidates.get(person.id)!;
		const inApp = isDirect(type)
			? true
			: (preferred(person.id, type, 'in_app') ?? DEFAULTS[type].inApp);
		const email = preferred(person.id, type, 'email') ?? DEFAULTS[type].email;

		// 6. A person without a user cannot open an inbox, so they get no in-app row.
		if (inApp && person.userId !== null) {
			toInsert.push({
				organisationId: input.organisationId,
				recipientPersonId: person.id,
				actorPersonId: input.actorPersonId,
				type,
				snapshot: type === 'followed.activity' ? followerSnapshot : snapshot,
				...input.target
			});
		}

		// 7. Mail for those who want it and can receive it.
		if (email && person.email) {
			emails.push({
				to: person.email,
				type,
				personId: person.id,
				role: person.role,
				snapshot: type === 'followed.activity' ? followerSnapshot : snapshot,
				target: input.target
			});
		}
	}

	if (toInsert.length > 0) await tx.insert(notifications).values(toInsert);
	return emails;
}
