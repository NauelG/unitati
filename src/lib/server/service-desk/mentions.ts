import { and, asc, eq, ilike, inArray, ne, or, type SQL } from 'drizzle-orm';
import { extractMentions } from '#lib/domain/mentions.js';
import { can, roleCan } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { userRole, users } from '../auth/schema';
import { getDb, type Executor, type Transaction } from '../db';
import { people } from '../directory/schema';
import { followTicket, notify, type PendingEmail } from '../notifications';
import { likePattern, MENTION_PICKER_LIMIT, mentionSnapshot } from '../shared/mentions';
import { failure, success, type Outcome } from '../shared/outcome';
import { ticketComments, tickets } from './schema';
import { requireTicketScope } from './scope';

/**
 * Who may be @mentioned on a ticket (#303). One rule, read by the picker's
 * endpoint and by every write that notifies, so the list a person is offered and
 * the list that is actually notified cannot drift apart. **Never trust the
 * client**: a token in the markdown only becomes a notification when this says
 * the person may see what is being written.
 */

export type MentionVisibility = 'public' | 'internal';

export type MentionableTicket = {
	id: string;
	requesterPersonId: string;
	assigneePersonId: string | null;
};

export type Mentionable = { id: string; label: string; hint: string };

/** The roles that work tickets: those holding `tickets.view`. */
const STAFF_ROLES = userRole.enumValues.filter((role) => roleCan(role, 'tickets.view'));

/**
 * The people `viewer` may mention on `ticket` in a comment of `visibility`, never
 * the viewer. Staff: internal reaches staff only, public also the requester. Anyone
 * else (an employee in the portal) may name the assignee and the staff who have
 * answered publicly on the ticket, and nobody else: they cannot browse the directory.
 *
 * With no `ticket` (the form that opens one) only staff can be offered.
 * `query` narrows by name or email, `only` to the ids a write found in a body.
 */
export async function mentionableFor(
	executor: Executor,
	viewer: Pick<SessionUser, 'role' | 'personId' | 'organisationId'>,
	ticket: MentionableTicket | null,
	visibility: MentionVisibility,
	options: { query?: string; only?: string[]; limit?: number } = {}
): Promise<Mentionable[]> {
	if (options.only?.length === 0) return [];
	const staffViewer = can(viewer, 'tickets.view');

	let reach: SQL | undefined;
	if (staffViewer) {
		// Writing an internal note takes `tickets.comment.internal`; without it the
		// note cannot exist, so nobody can be mentioned in it.
		if (visibility === 'internal' && !can(viewer, 'tickets.comment.internal')) return [];
		const staff = inArray(users.role, STAFF_ROLES);
		// Without a ticket (the form that opens one) there is no requester to offer yet.
		reach =
			visibility === 'internal' || !ticket
				? staff
				: or(staff, eq(people.id, ticket.requesterPersonId));
	} else {
		if (visibility === 'internal' || !ticket) return [];
		const answered = await executor
			.select({ personId: ticketComments.authorPersonId })
			.from(ticketComments)
			.where(and(eq(ticketComments.ticketId, ticket.id), eq(ticketComments.visibility, 'public')));
		const commenters = [
			...new Set(answered.flatMap((row) => (row.personId ? [row.personId] : [])))
		];
		const assignee = ticket.assigneePersonId;
		if (!assignee && commenters.length === 0) return [];
		reach = or(
			assignee ? eq(people.id, assignee) : undefined,
			commenters.length > 0
				? and(inArray(people.id, commenters), inArray(users.role, STAFF_ROLES))
				: undefined
		);
	}

	const rows = await executor
		.select({ id: people.id, fullName: people.fullName, email: people.email })
		.from(people)
		.leftJoin(users, eq(people.userId, users.id))
		.where(
			and(
				eq(people.organisationId, viewer.organisationId),
				eq(people.active, true),
				viewer.personId ? ne(people.id, viewer.personId) : undefined,
				reach,
				options.only ? inArray(people.id, options.only) : undefined,
				options.query
					? or(
							ilike(people.fullName, likePattern(options.query)),
							ilike(people.email, likePattern(options.query))
						)
					: undefined
			)
		)
		.orderBy(asc(people.fullName), asc(people.id))
		.limit(options.limit ?? 1000);

	return rows.map((row) => ({ id: row.id, label: row.fullName, hint: row.email }));
}

/**
 * The picker's source: at most 8 people matching `query`, for a comment of
 * `visibility` on the ticket `viewer` is looking at. A ticket outside their
 * scope is `ticket_not_found`, as everywhere else.
 */
export async function searchMentionables(
	viewer: SessionUser,
	ticketTag: string,
	visibility: MentionVisibility,
	query: string
): Promise<Outcome<Mentionable[], 'ticket_not_found'>> {
	const [ticket] = await getDb()
		.select({
			id: tickets.id,
			requesterPersonId: tickets.requesterPersonId,
			assigneePersonId: tickets.assigneePersonId
		})
		.from(tickets)
		.where(and(requireTicketScope(viewer), eq(tickets.ticketTag, ticketTag)) as SQL)
		.limit(1);
	if (!ticket) return failure('ticket_not_found');

	return success(
		await mentionableFor(getDb(), viewer, ticket, visibility, {
			query: query.trim() || undefined,
			limit: MENTION_PICKER_LIMIT
		})
	);
}

/** The picker on the form that opens a ticket: staff only, and only for staff. */
export async function searchStaffMentionables(
	viewer: SessionUser,
	query: string
): Promise<Mentionable[]> {
	if (!can(viewer, 'tickets.manage')) return [];
	return mentionableFor(getDb(), viewer, null, 'public', {
		query: query.trim() || undefined,
		limit: MENTION_PICKER_LIMIT
	});
}

/**
 * The people a body names that `actor` may actually notify: the ids in its
 * `@[…](person:…)` tokens, minus anyone `mentionableFor` would not have offered.
 * A forged token stays in the text (it renders as a chip) but reaches nobody.
 */
export async function allowedMentions(
	executor: Executor,
	actor: Pick<SessionUser, 'role' | 'personId' | 'organisationId'>,
	ticket: MentionableTicket,
	visibility: MentionVisibility,
	body: string
): Promise<string[]> {
	const named = extractMentions(body);
	if (named.length === 0) return [];
	const allowed = await mentionableFor(executor, actor, ticket, visibility, { only: named });
	const ids = new Set(allowed.map((person) => person.id));
	return named.filter((id) => ids.has(id));
}

type NotifiableTicket = MentionableTicket & { ticketTag: string; subject: string };

/** What every notification about a comment says: the ticket, who wrote, and how it starts. */
export function commentSnapshot(
	ticket: { ticketTag: string; subject: string },
	actor: { name: string },
	body: string
) {
	return mentionSnapshot({ code: ticket.ticketTag, title: ticket.subject }, actor, body);
}

/**
 * Makes each mentioned person a follower, unless they are a participant already
 * (the requester and the assignee hear about the ticket anyway). #57 builds the
 * followers' notifications on these rows.
 */
export async function followMentioned(
	tx: Transaction,
	organisationId: string,
	ticket: MentionableTicket,
	mentioned: string[]
): Promise<void> {
	for (const personId of mentioned) {
		if (personId === ticket.requesterPersonId || personId === ticket.assigneePersonId) continue;
		await followTicket(tx, { organisationId, personId, ticketId: ticket.id });
	}
}

/**
 * Notifies the people `body` names and `actor` may reach, and makes them follow
 * the ticket. For the writes that mention and nothing else: an edit, and the
 * message that opens a ticket. `only` limits it to ids not mentioned before.
 */
export async function notifyMentioned(
	tx: Transaction,
	actor: Pick<SessionUser, 'role' | 'personId' | 'organisationId' | 'name'>,
	ticket: NotifiableTicket,
	visibility: MentionVisibility,
	body: string,
	exclude: string[] = []
): Promise<PendingEmail[]> {
	const mentioned = (await allowedMentions(tx, actor, ticket, visibility, body)).filter(
		(id) => !exclude.includes(id)
	);
	if (mentioned.length === 0) return [];

	const pending = await notify(tx, {
		organisationId: actor.organisationId,
		actorPersonId: actor.personId,
		target: { ticketId: ticket.id },
		visibility,
		snapshot: commentSnapshot(ticket, actor, body),
		recipients: mentioned.map((personId) => ({ personId, type: 'mention' as const }))
	});
	await followMentioned(tx, actor.organisationId, ticket, mentioned);
	return pending;
}
