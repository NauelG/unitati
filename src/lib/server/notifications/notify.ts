import { and, eq, inArray } from 'drizzle-orm';
import { can } from '../access/permissions';
import { users, type UserRole } from '../auth/schema';
import type { Transaction } from '../db';
import { people } from '../directory/schema';
import { notificationPreferences, notifications } from './schema';
import type { Snapshot } from './snapshot';
import { snapshotSchema } from './snapshot';
import { DEFAULTS, isDirect, strongerType, type NotificationType } from './types';

export type NotifyTarget = { ticketId: string } | { taskId: string } | { projectId: string };

export type NotifyInput = {
	organisationId: string;
	actorPersonId: string | null;
	target: NotifyTarget;
	snapshot: Snapshot;
	/** Candidate recipients, each with the type that applies to them. */
	recipients: { personId: string; type: NotificationType }[];
	/** For a ticket comment; internal reaches only holders of `tickets.comment.internal`. */
	visibility?: 'public' | 'internal';
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
 * Step 3 of `notify`, left empty on purpose: #57 adds the followers of the target
 * here, as candidates of type `followed.activity`, before the dedupe's result is
 * read. Named so that slice has one place to land and no other step moves.
 */
function addFollowers(
	_tx: Transaction,
	_input: NotifyInput,
	candidates: Map<string, NotificationType>
): Promise<Map<string, NotificationType>> {
	return Promise.resolve(candidates);
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
				snapshot,
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
				snapshot,
				target: input.target
			});
		}
	}

	if (toInsert.length > 0) await tx.insert(notifications).values(toInsert);
	return emails;
}
