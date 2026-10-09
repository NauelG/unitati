import { and, asc, desc, eq, exists, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Priority, TicketStatus } from '#lib/domain/status.js';
import { recordActivity } from '../activity';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { uniqueConstraintName } from '../db/errors';
import { people } from '../directory/schema';
import { failure, success, type Outcome } from '../shared/outcome';
import { page, pageWindow, type Page, type PageRequest } from '../shared/pagination';
import { runtimeMailer, runtimeStorage } from './runtime';
import { resolvedMail, sendQuietly, type Mailer } from './mail';
import { queues, ticketComments, tickets, attachments } from './schema';
import { requireTicketScope, seesInternal } from './scope';
import type { Storage } from './storage';
import { canTransition } from './transitions';
import {
	attachmentProblem,
	createTicketInput,
	RESERVED_TICKET_TAGS,
	type CreateTicketInput,
	type UploadedFile
} from './validation';

/**
 * Tickets: reading them (scoped by who is asking) and the writes that change
 * them. Every write that is an *event* records it in `activity` inside its own
 * transaction (ADR 0009). Comments are content, not events, and live in
 * `comments.ts`.
 */

/** The collaborators with side effects, injectable so specs need neither SMTP nor a disk. */
export interface Deps {
	storage?: Storage;
	mailer?: Mailer | null;
	/** Builds the absolute link a mail points at; defaults to a relative path. */
	linkTo?: (ticketTag: string) => string;
}

export function resolveDeps(deps: Deps) {
	return {
		storage: deps.storage ?? runtimeStorage(),
		mailer: deps.mailer === undefined ? runtimeMailer() : deps.mailer,
		linkTo: deps.linkTo ?? ((tag: string) => `/portal/tickets/${encodeURIComponent(tag)}`)
	};
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

const requester = alias(people, 'requester');
const assignee = alias(people, 'assignee');

const ticketColumns = {
	id: tickets.id,
	ticketTag: tickets.ticketTag,
	subject: tickets.subject,
	status: tickets.status,
	priority: tickets.priority,
	channel: tickets.channel,
	queueId: tickets.queueId,
	queueName: queues.name,
	requesterPersonId: tickets.requesterPersonId,
	requesterName: requester.fullName,
	assigneePersonId: tickets.assigneePersonId,
	assigneeName: assignee.fullName,
	createdAt: tickets.createdAt,
	updatedAt: tickets.updatedAt
};

export type TicketView = {
	id: string;
	ticketTag: string;
	subject: string;
	status: TicketStatus;
	priority: Priority;
	channel: 'portal' | 'agent';
	queueId: string;
	queueName: string;
	requesterPersonId: string;
	requesterName: string;
	assigneePersonId: string | null;
	assigneeName: string | null;
	createdAt: Date;
	updatedAt: Date;
};

function ticketsWithRelations() {
	return getDb()
		.select(ticketColumns)
		.from(tickets)
		.innerJoin(queues, eq(tickets.queueId, queues.id))
		.innerJoin(requester, eq(tickets.requesterPersonId, requester.id))
		.leftJoin(assignee, eq(tickets.assigneePersonId, assignee.id));
}

/**
 * Spanish stemming, so "impresoras" finds "impresora". The surface searched is
 * the surface visible: a viewer who cannot read internal notes does not match
 * on them either, or the search box would answer questions the payload refuses.
 */
function matchesSearch(term: string, viewer: SessionUser): SQL {
	const query = sql`plainto_tsquery('spanish', immutable_unaccent(${term}))`;
	const visibleComment = seesInternal(viewer)
		? eq(ticketComments.ticketId, tickets.id)
		: and(eq(ticketComments.ticketId, tickets.id), eq(ticketComments.visibility, 'public'));

	return or(
		sql`${tickets.search} @@ ${query}`,
		exists(
			getDb()
				.select({ one: sql`1` })
				.from(ticketComments)
				.where(and(visibleComment, sql`${ticketComments.search} @@ ${query}`))
		)
	) as SQL;
}

export interface TicketListRequest extends PageRequest {
	search?: string;
	queueId?: string;
	status?: TicketStatus;
}

export async function listTickets(
	viewer: SessionUser,
	request: TicketListRequest = {}
): Promise<Page<TicketView>> {
	const window = pageWindow(request);
	const term = request.search?.trim();
	const where = and(
		requireTicketScope(viewer),
		term ? matchesSearch(term, viewer) : undefined,
		request.queueId ? eq(tickets.queueId, request.queueId) : undefined,
		request.status ? eq(tickets.status, request.status) : undefined
	) as SQL;

	const rows = await ticketsWithRelations()
		.where(where)
		// Newest first; the id breaks ties so a row cannot appear on two pages.
		.orderBy(desc(tickets.createdAt), asc(tickets.id))
		.limit(window.limit)
		.offset(window.offset);

	const matching = ticketsWithRelations().where(where).as('matching');
	const [counted] = await getDb()
		.select({ total: sql<number>`count(*)::int` })
		.from(matching);

	return page(rows, counted?.total ?? 0, window);
}

/** The ticket behind a `/service-desk/TCK-1093` URL (ADR 0010). */
export async function getTicketByTag(
	viewer: SessionUser,
	ticketTag: string
): Promise<Outcome<TicketView, 'ticket_not_found'>> {
	const [row] = await ticketsWithRelations()
		.where(and(requireTicketScope(viewer), eq(tickets.ticketTag, ticketTag)))
		.limit(1);

	return row ? success(row) : failure('ticket_not_found');
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

export type CreateTicketFailure =
	| 'queue_not_found'
	| 'requester_not_found'
	| 'requester_required'
	| 'attachments_too_many'
	| 'attachments_too_large'
	| 'duplicate_ticket_tag';

/** A foreign key proves a row exists, not that it belongs to the actor's organisation. */
async function sameOrganisation(organisationId: string, queueId: string, personId: string) {
	const [queue] = await getDb()
		.select({ id: queues.id })
		.from(queues)
		.where(and(eq(queues.id, queueId), eq(queues.organisationId, organisationId)))
		.limit(1);
	if (!queue) return 'queue_not_found' as const;

	const [person] = await getDb()
		.select({ id: people.id })
		.from(people)
		.where(and(eq(people.id, personId), eq(people.organisationId, organisationId)))
		.limit(1);
	if (!person) return 'requester_not_found' as const;

	return null;
}

/**
 * Opens a ticket. The opening message is the first comment — there is no
 * `description` column — and the ticket's history opens in the same transaction.
 *
 * **Who the requester is is decided here, not by the form.** Staff may name
 * one (`channel = 'agent'`); anyone else is always themselves
 * (`channel = 'portal'`), whatever the payload says.
 */
export async function createTicket(
	actor: SessionUser,
	input: CreateTicketInput,
	files: UploadedFile[] = [],
	deps: Deps = {}
): Promise<Outcome<{ id: string; ticketTag: string }, CreateTicketFailure>> {
	const values = createTicketInput.parse(input);
	const { storage } = resolveDeps(deps);

	const problem = attachmentProblem(files);
	if (problem) return failure(`attachments_${problem}`);

	const staff = can(actor, 'tickets.manage');
	const requesterId = staff ? (values.requesterPersonId ?? actor.personId) : actor.personId;
	if (requesterId === null) return failure('requester_required');

	const missing = await sameOrganisation(actor.organisationId, values.queueId, requesterId);
	if (missing) return failure(missing);

	const stored = await storeFiles(storage, actor.organisationId, files);

	try {
		return await getDb().transaction(async (tx) => {
			const [ticket] = await tx
				.insert(tickets)
				.values({
					organisationId: actor.organisationId,
					subject: values.subject,
					queueId: values.queueId,
					requesterPersonId: requesterId,
					// Only staff triage: an employee cannot raise their own urgency.
					priority: staff ? values.priority : undefined,
					channel: staff ? 'agent' : 'portal'
				})
				.returning({
					id: tickets.id,
					ticketTag: tickets.ticketTag,
					subject: tickets.subject,
					channel: tickets.channel
				});

			if (RESERVED_TICKET_TAGS.has(ticket.ticketTag.toLowerCase())) {
				throw new Error(`Generated ticket tag ${ticket.ticketTag} is reserved`);
			}

			const [comment] = await tx
				.insert(ticketComments)
				.values({
					organisationId: actor.organisationId,
					ticketId: ticket.id,
					authorPersonId: actor.personId,
					body: values.body,
					visibility: 'public'
				})
				.returning({ id: ticketComments.id });

			if (stored.length > 0) {
				await tx.insert(attachments).values(
					stored.map((file) => ({
						organisationId: actor.organisationId,
						commentId: comment.id,
						...file.row
					}))
				);
			}

			await recordActivity(tx, {
				organisationId: actor.organisationId,
				actorPersonId: actor.personId,
				target: { ticketId: ticket.id },
				verb: 'ticket.created',
				payload: {
					ticketTag: ticket.ticketTag,
					subject: ticket.subject,
					channel: ticket.channel
				}
			});

			return success({ id: ticket.id, ticketTag: ticket.ticketTag });
		});
	} catch (error) {
		// The bytes were written before the transaction; do not orphan them.
		await Promise.all(stored.map((file) => storage.delete(file.row.storageKey)));

		if (uniqueConstraintName(error) === 'tickets_org_tag') return failure('duplicate_ticket_tag');
		throw error;
	}
}

/** Writes the bytes and returns the rows describing them. Keys are server-generated. */
export async function storeFiles(storage: Storage, organisationId: string, files: UploadedFile[]) {
	return Promise.all(
		files.map(async (file) => {
			const storageKey = `${organisationId}/${crypto.randomUUID()}`;
			await storage.put(storageKey, file.data);
			return {
				row: {
					filename: file.filename,
					contentType: file.contentType,
					byteSize: file.data.byteLength,
					storageKey
				}
			};
		})
	);
}

type ChangeFailure = 'ticket_not_found';

/** The ticket row a staff write operates on, org-scoped. */
async function findTicket(actor: SessionUser, ticketTag: string) {
	const [row] = await getDb()
		.select()
		.from(tickets)
		.where(and(eq(tickets.organisationId, actor.organisationId), eq(tickets.ticketTag, ticketTag)))
		.limit(1);
	return row ?? null;
}

export async function changeTicketStatus(
	actor: SessionUser,
	ticketTag: string,
	to: TicketStatus,
	deps: Deps = {}
): Promise<Outcome<void, ChangeFailure | 'invalid_transition'>> {
	const { mailer, linkTo } = resolveDeps(deps);
	const ticket = await findTicket(actor, ticketTag);
	if (!ticket) return failure('ticket_not_found');

	// A typed failure, not an exception: skipping a step is a business outcome.
	if (!canTransition(ticket.status, to)) return failure('invalid_transition');

	const requesterEmail = await getDb().transaction(async (tx) => {
		await tx
			.update(tickets)
			.set({ status: to, updatedAt: new Date() })
			.where(eq(tickets.id, ticket.id));

		await recordActivity(tx, {
			organisationId: actor.organisationId,
			actorPersonId: actor.personId,
			target: { ticketId: ticket.id },
			verb: 'ticket.status.changed',
			payload: { from: ticket.status, to }
		});

		const [person] = await tx
			.select({ email: people.email })
			.from(people)
			.where(eq(people.id, ticket.requesterPersonId));
		return person?.email ?? null;
	});

	// After commit, not awaited: mail degrades, it never blocks (ADR 0006).
	if (to === 'resolved' && requesterEmail) {
		void sendQuietly(mailer, {
			to: requesterEmail,
			...resolvedMail(ticket, linkTo(ticket.ticketTag))
		});
	}

	return success(undefined);
}

export async function setTicketPriority(
	actor: SessionUser,
	ticketTag: string,
	to: Priority
): Promise<Outcome<void, ChangeFailure>> {
	const ticket = await findTicket(actor, ticketTag);
	if (!ticket) return failure('ticket_not_found');
	if (ticket.priority === to) return success(undefined);

	await getDb().transaction(async (tx) => {
		await tx
			.update(tickets)
			.set({ priority: to, updatedAt: new Date() })
			.where(eq(tickets.id, ticket.id));

		await recordActivity(tx, {
			organisationId: actor.organisationId,
			actorPersonId: actor.personId,
			target: { ticketId: ticket.id },
			verb: 'ticket.priority.changed',
			payload: { from: ticket.priority, to }
		});
	});

	return success(undefined);
}

/** `personId = null` unassigns. */
export async function assignTicket(
	actor: SessionUser,
	ticketTag: string,
	personId: string | null
): Promise<Outcome<void, ChangeFailure | 'assignee_not_found'>> {
	const ticket = await findTicket(actor, ticketTag);
	if (!ticket) return failure('ticket_not_found');
	if (ticket.assigneePersonId === personId) return success(undefined);

	const named = async (id: string) => {
		const [person] = await getDb()
			.select({ id: people.id, fullName: people.fullName })
			.from(people)
			.where(and(eq(people.id, id), eq(people.organisationId, actor.organisationId)));
		return person ?? null;
	};

	const next = personId === null ? null : await named(personId);
	if (personId !== null && !next) return failure('assignee_not_found');
	const previous = ticket.assigneePersonId ? await named(ticket.assigneePersonId) : null;

	await getDb().transaction(async (tx) => {
		await tx
			.update(tickets)
			.set({ assigneePersonId: personId, updatedAt: new Date() })
			.where(eq(tickets.id, ticket.id));

		const base = {
			organisationId: actor.organisationId,
			actorPersonId: actor.personId,
			target: { ticketId: ticket.id }
		};

		if (next) {
			await recordActivity(tx, {
				...base,
				verb: 'ticket.assigned',
				payload: { toPersonId: next.id, toPersonName: next.fullName }
			});
		} else if (previous) {
			await recordActivity(tx, {
				...base,
				verb: 'ticket.unassigned',
				payload: { fromPersonId: previous.id, fromPersonName: previous.fullName }
			});
		}
	});

	return success(undefined);
}

export async function moveTicketToQueue(
	actor: SessionUser,
	ticketTag: string,
	queueId: string
): Promise<Outcome<void, ChangeFailure | 'queue_not_found'>> {
	const ticket = await findTicket(actor, ticketTag);
	if (!ticket) return failure('ticket_not_found');
	if (ticket.queueId === queueId) return success(undefined);

	const named = async (id: string) => {
		const [queue] = await getDb()
			.select({ id: queues.id, name: queues.name })
			.from(queues)
			.where(and(eq(queues.id, id), eq(queues.organisationId, actor.organisationId)));
		return queue ?? null;
	};

	const to = await named(queueId);
	if (!to) return failure('queue_not_found');
	const from = await named(ticket.queueId);
	if (!from) return failure('queue_not_found');

	await getDb().transaction(async (tx) => {
		await tx
			.update(tickets)
			.set({ queueId, updatedAt: new Date() })
			.where(eq(tickets.id, ticket.id));

		await recordActivity(tx, {
			organisationId: actor.organisationId,
			actorPersonId: actor.personId,
			target: { ticketId: ticket.id },
			verb: 'ticket.queue.changed',
			payload: {
				fromQueueId: from.id,
				fromQueueName: from.name,
				toQueueId: to.id,
				toQueueName: to.name
			}
		});
	});

	return success(undefined);
}
