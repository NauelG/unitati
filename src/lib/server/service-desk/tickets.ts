import { and, asc, desc, eq, exists, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { CatalogueColor } from '#lib/domain/catalogue-color.js';
import type { Priority, TicketStatus } from '#lib/domain/status.js';
import { m } from '#lib/paraglide/messages.js';
import { actorColumns, recordActivity } from '../activity';
import { notify, sendNotificationEmails, type PendingEmail } from '../notifications';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { uniqueConstraintName } from '../db/errors';
import { people } from '../directory/schema';
import { failure, success, type Outcome } from '../shared/outcome';
import { page, pageWindow, type Page, type PageRequest } from '../shared/pagination';
import { runtimeMailer, runtimeOrigin, runtimeStorage } from '../shared/runtime';
import type { Mailer } from '../shared/mail';
import { queues, requestForms, ticketComments, tickets, attachments } from './schema';
import { notifyMentioned } from './mentions';
import { requireTicketScope, seesInternal } from './scope';
import { storeFiles } from '../shared/attachments';
import type { Storage } from '../shared/storage';
import { DEFAULT_TICKET_ORDER, type TicketOrder } from './ticket-order';
import { ticketPorts } from './ports';
import { canTransition } from './transitions';
import {
	attachmentProblem,
	createTicketInput,
	RESERVED_TICKET_TAGS,
	subjectInput,
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
	/** The public origin mail links are built from; defaults to `BETTER_AUTH_URL`. */
	origin?: string;
}

export function resolveDeps(deps: Deps) {
	return {
		storage: deps.storage ?? runtimeStorage(),
		mailer: deps.mailer === undefined ? runtimeMailer() : deps.mailer,
		origin: deps.origin ?? runtimeOrigin()
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
	queueColor: queues.color,
	requesterPersonId: tickets.requesterPersonId,
	requesterName: requester.fullName,
	assigneePersonId: tickets.assigneePersonId,
	assigneeName: assignee.fullName,
	requestFormId: tickets.requestFormId,
	requestFormName: requestForms.name,
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
	queueColor: CatalogueColor;
	requesterPersonId: string;
	requesterName: string;
	assigneePersonId: string | null;
	assigneeName: string | null;
	/** The request form the ticket came from (ADR 0037); null for free-text and staff tickets. */
	requestFormId: string | null;
	requestFormName: string | null;
	createdAt: Date;
	updatedAt: Date;
};

function ticketsWithRelations() {
	return getDb()
		.select(ticketColumns)
		.from(tickets)
		.innerJoin(queues, eq(tickets.queueId, queues.id))
		.innerJoin(requester, eq(tickets.requesterPersonId, requester.id))
		.leftJoin(assignee, eq(tickets.assigneePersonId, assignee.id))
		.leftJoin(requestForms, eq(tickets.requestFormId, requestForms.id));
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
	requestFormId?: string;
	status?: TicketStatus;
	/** Only the tickets this person opened (the person page's "Ver todos", #298). */
	requesterPersonId?: string;
	/** Defaults to the most recently touched first. */
	order?: TicketOrder;
}

const ORDER_COLUMNS = {
	status: tickets.status,
	priority: tickets.priority,
	updatedAt: tickets.updatedAt
};

export async function listTickets(
	viewer: SessionUser,
	request: TicketListRequest = {}
): Promise<Page<TicketView>> {
	const window = pageWindow(request);
	const term = request.search?.trim();
	const order = request.order ?? DEFAULT_TICKET_ORDER;
	const where = and(
		requireTicketScope(viewer),
		term ? matchesSearch(term, viewer) : undefined,
		request.queueId ? eq(tickets.queueId, request.queueId) : undefined,
		request.requestFormId ? eq(tickets.requestFormId, request.requestFormId) : undefined,
		request.status ? eq(tickets.status, request.status) : undefined,
		request.requesterPersonId ? eq(tickets.requesterPersonId, request.requesterPersonId) : undefined
	) as SQL;

	const rows = await ticketsWithRelations()
		.where(where)
		// The id breaks ties so a row cannot appear on two pages.
		.orderBy((order.direction === 'asc' ? asc : desc)(ORDER_COLUMNS[order.key]), asc(tickets.id))
		.limit(window.limit)
		.offset(window.offset);

	const matching = ticketsWithRelations().where(where).as('matching');
	const [counted] = await getDb()
		.select({ total: sql<number>`count(*)::int` })
		.from(matching);

	return page(rows, counted?.total ?? 0, window);
}

export interface TicketChoice {
	id: string;
	ticketTag: string;
	subject: string;
	status: TicketStatus;
}

export interface TicketChoiceRequest {
	search?: string;
}

/** A picker shows a short list and asks again as the term narrows. */
const TICKET_CHOICES = 10;
/** The term comes from a query string. */
const MAX_TERM_LENGTH = 100;

/**
 * The tickets a viewer may pick from, for a form that attaches one to something
 * (the asset record's "Vincular ticket", #168). Apart from `listTickets` because
 * a picker needs the narrowest shape, and because it offers **every** status:
 * the ticket that explains last month's fault is usually `resolved` or `closed`.
 *
 * The id is safe to return: the row passed the viewer's own ticket scope first.
 * Whether they may link it is decided again where the link is written.
 *
 * Partial matching on tag and subject, with `%`, `_` and the escape character
 * escaped so the term is text and not a pattern. Most recently updated first.
 */
export async function listTicketChoices(
	viewer: SessionUser,
	request: TicketChoiceRequest = {}
): Promise<TicketChoice[]> {
	const term = request.search?.trim().slice(0, MAX_TERM_LENGTH);
	const pattern = term ? `%${term.replace(/[\\%_]/g, '\\$&')}%` : null;

	return getDb()
		.select({
			id: tickets.id,
			ticketTag: tickets.ticketTag,
			subject: tickets.subject,
			status: tickets.status
		})
		.from(tickets)
		.where(
			and(
				requireTicketScope(viewer),
				pattern
					? or(sql`${tickets.ticketTag} ilike ${pattern}`, sql`${tickets.subject} ilike ${pattern}`)
					: undefined
			)
		)
		.orderBy(desc(tickets.updatedAt), asc(tickets.id))
		.limit(TICKET_CHOICES);
}

/**
 * The count `AppShell` prints beside the Service desk link: every ticket not
 * `resolved` or `closed`. Takes a bare `organisationId` rather than a
 * `SessionUser` — nothing here is redacted per viewer, as with
 * `listLocations` and `listManufacturers`.
 */
export async function countOpen(organisationId: string): Promise<number> {
	const [row] = await getDb()
		.select({ count: sql<number>`count(*)::int` })
		.from(tickets)
		.where(
			and(
				eq(tickets.organisationId, organisationId),
				sql`${tickets.status} not in ('resolved', 'closed')`
			)
		);
	return row?.count ?? 0;
}

export interface TicketSummary {
	/** Every ticket not `resolved` or `closed`. */
	open: number;
	/** `waiting_on_user`, a subset of `open` singled out because it is the queue waiting on somebody *else*. */
	waitingOnUser: number;
}

/**
 * The Overview KPI and the live `PageHeader` summary on `/service-desk` (#84):
 * both counts in one round trip, scoped by `requireTicketScope` rather than a
 * bare organisation id — unlike `countOpen`, which `AppShell` always calls for
 * a viewer who already holds `tickets.view` or `tickets.view.own`, this is also
 * reachable for a narrower scope and must agree with the list it summarises.
 */
export async function ticketSummary(viewer: SessionUser): Promise<TicketSummary> {
	const [row] = await getDb()
		.select({
			open: sql<number>`count(*) filter (where ${tickets.status} not in ('resolved', 'closed'))::int`,
			waitingOnUser: sql<number>`count(*) filter (where ${tickets.status} = 'waiting_on_user')::int`
		})
		.from(tickets)
		.where(requireTicketScope(viewer));

	return { open: row?.open ?? 0, waitingOnUser: row?.waitingOnUser ?? 0 };
}

/**
 * True once any ticket has ever arrived through the employee portal — the
 * Overview onboarding checklist's "open the portal" step (#84). Channel, not
 * requester, is the signal: a technician can raise a ticket on an employee's
 * behalf without the employee ever having reached the portal themselves.
 *
 * A bare `organisationId`, like `countOpen`: the checklist is an
 * organisation-wide fact, not something that varies by who is looking at it.
 */
export async function hasPortalActivity(organisationId: string): Promise<boolean> {
	const [row] = await getDb()
		.select({ count: sql<number>`count(*)::int` })
		.from(tickets)
		.where(and(eq(tickets.organisationId, organisationId), eq(tickets.channel, 'portal')))
		.limit(1);
	return (row?.count ?? 0) > 0;
}

/**
 * The Overview's "Your work": a viewer's own open assignment, newest-updated
 * first. Scoped by `requireTicketScope` first and the assignee second, so an
 * employee who somehow held `tickets.view.own` and an assignment still only
 * ever sees tickets they are entitled to see at all.
 *
 * Empty for a viewer with no directory record — nothing can be assigned to a
 * `personId` that does not exist — rather than falling through to "every
 * unassigned ticket", which `eq(assigneePersonId, null)` would silently become.
 */
export async function myOpenTickets(viewer: SessionUser, limit = 5): Promise<TicketView[]> {
	if (viewer.personId === null) return [];

	const where = and(
		requireTicketScope(viewer),
		eq(tickets.assigneePersonId, viewer.personId),
		sql`${tickets.status} not in ('resolved', 'closed')`
	) as SQL;

	return ticketsWithRelations()
		.where(where)
		.orderBy(desc(tickets.updatedAt), asc(tickets.id))
		.limit(limit);
}

/**
 * The person page's "Tickets solicitados" (#298): the open tickets a person
 * opened, newest-updated first. Scoped like every other read, so a viewer sees
 * no more here than in the list.
 */
export async function openTicketsRequestedBy(
	viewer: SessionUser,
	personId: string,
	limit = 5
): Promise<TicketView[]> {
	const where = and(
		requireTicketScope(viewer),
		eq(tickets.requesterPersonId, personId),
		sql`${tickets.status} not in ('resolved', 'closed')`
	) as SQL;

	return ticketsWithRelations()
		.where(where)
		.orderBy(desc(tickets.updatedAt), asc(tickets.id))
		.limit(limit);
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

/**
 * The ticket a write has just touched, scoped to the actor's organisation and
 * nothing more. The staff writes below trust the caller's permission gate and
 * scope tenancy only, so reading the result back must not demand a read
 * permission the writer may not hold: a key scoped to `tickets.create` alone
 * can open a ticket, and has to be able to see what it opened.
 */
export async function getWrittenTicket(
	actor: SessionUser,
	ticketTag: string
): Promise<Outcome<TicketView, 'ticket_not_found'>> {
	const [row] = await ticketsWithRelations()
		.where(and(eq(tickets.organisationId, actor.organisationId), eq(tickets.ticketTag, ticketTag)))
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
	| 'asset_not_found'
	| 'category_not_found'
	| 'duplicate_ticket_tag';

/**
 * What only a request form adds to a ticket. Not part of `CreateTicketInput`:
 * that schema is what the API and the forms post, and a form id there would
 * let anybody file a ticket under any form (ADR 0037).
 */
export interface TicketOrigin {
	requestFormId: string;
	/** The asset category the request is for; linked in the opening transaction. */
	categoryId?: string;
}

/**
 * Thrown from inside the opening transaction to roll it back. A returned
 * `failure` would commit: the ticket and its first comment are already written
 * by the time an asset is found to be off-limits, and a ticket opened "about
 * nothing" is not what the person asked for.
 *
 * Known cost: the `TCK-####` sequence is not transactional, so a refused
 * request still consumes a number. Checking the assets first would need the
 * visibility rule outside the port, and a gap in the numbering is cheaper.
 */
class AssetRefused extends Error {}

/** Same reasoning as `AssetRefused`: the request's category was found off-limits mid-transaction. */
class CategoryRefused extends Error {}

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
	return openTicket(actor, input, files, deps);
}

/** `createTicket`, plus the origin only the request forms supply. */
export async function openTicket(
	actor: SessionUser,
	input: CreateTicketInput,
	files: UploadedFile[] = [],
	deps: Deps = {},
	origin?: TicketOrigin
): Promise<Outcome<{ id: string; ticketTag: string }, CreateTicketFailure>> {
	const values = createTicketInput.parse(input);
	const { storage, mailer, origin: publicOrigin } = resolveDeps(deps);

	const problem = attachmentProblem(files);
	if (problem) return failure(`attachments_${problem}`);

	const staff = can(actor, 'tickets.manage');
	const requesterId = staff ? (values.requesterPersonId ?? actor.personId) : actor.personId;
	if (requesterId === null) return failure('requester_required');

	const missing = await sameOrganisation(actor.organisationId, values.queueId, requesterId);
	if (missing) return failure(missing);

	const stored = await storeFiles(storage, actor.organisationId, files);

	try {
		let emails: PendingEmail[] = [];
		const opened = await getDb().transaction(async (tx) => {
			const [ticket] = await tx
				.insert(tickets)
				.values({
					organisationId: actor.organisationId,
					subject: values.subject,
					queueId: values.queueId,
					requesterPersonId: requesterId,
					// Only staff triage: an employee cannot raise their own urgency.
					priority: staff ? values.priority : undefined,
					channel: staff ? 'agent' : 'portal',
					requestFormId: origin?.requestFormId
				})
				.returning({
					id: tickets.id,
					ticketTag: tickets.ticketTag,
					subject: tickets.subject,
					channel: tickets.channel,
					assigneePersonId: tickets.assigneePersonId
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
				...actorColumns(actor),
				target: { ticketId: ticket.id },
				verb: 'ticket.created',
				payload: {
					ticketTag: ticket.ticketTag,
					subject: ticket.subject,
					channel: ticket.channel
				}
			});

			// A form can post the same id twice; the link is a set.
			const assets = await ticketPorts().affectedAssets(tx, actor, {
				ticketId: ticket.id,
				assetIds: [...new Set(values.assetIds ?? [])]
			});
			if (!assets.ok) throw new AssetRefused(assets.error);

			if (origin?.categoryId !== undefined) {
				const category = await ticketPorts().requestedCategory(tx, actor, {
					ticketId: ticket.id,
					categoryId: origin.categoryId
				});
				if (!category.ok) throw new CategoryRefused(category.error);
			}

			// The opening message may @mention staff (#303); whoever the actor may not
			// reach is dropped by the same rule as in a comment.
			emails = await notifyMentioned(
				tx,
				actor,
				{ ...ticket, requesterPersonId: requesterId },
				'public',
				values.body
			);

			return success({ id: ticket.id, ticketTag: ticket.ticketTag });
		});

		// After commit, not awaited (ADR 0006).
		void sendNotificationEmails(mailer, emails, publicOrigin);
		return opened;
	} catch (error) {
		// The bytes were written before the transaction; do not orphan them.
		await Promise.all(stored.map((file) => storage.delete(file.row.storageKey)));

		if (error instanceof AssetRefused) return failure('asset_not_found');
		if (error instanceof CategoryRefused) return failure('category_not_found');

		if (uniqueConstraintName(error) === 'tickets_org_tag') return failure('duplicate_ticket_tag');
		throw error;
	}
}

type ChangeFailure = 'ticket_not_found';

/** The status as a reader of a notification knows it. */
const STATUS_LABEL: Record<TicketStatus, () => string> = {
	new: m.status_new,
	in_progress: m.status_in_progress,
	waiting_on_user: m.status_waiting_on_user,
	resolved: m.status_resolved,
	closed: m.status_closed
};

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
	const { mailer, origin } = resolveDeps(deps);
	const ticket = await findTicket(actor, ticketTag);
	if (!ticket) return failure('ticket_not_found');

	// A typed failure, not an exception: skipping a step is a business outcome.
	if (!canTransition(ticket.status, to)) return failure('invalid_transition');

	const emails = await getDb().transaction(async (tx) => {
		await tx
			.update(tickets)
			.set({ status: to, updatedAt: new Date() })
			.where(eq(tickets.id, ticket.id));

		await recordActivity(tx, {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target: { ticketId: ticket.id },
			verb: 'ticket.status.changed',
			payload: { from: ticket.status, to }
		});

		// Only `resolved` tells the requester; every move reaches the followers (#57).
		return notify(tx, {
			organisationId: actor.organisationId,
			actorPersonId: actor.personId,
			target: { ticketId: ticket.id },
			snapshot: { code: ticket.ticketTag, title: ticket.subject, actorName: actor.name },
			followerSummary: m.follow_summary_ticket_status({ status: STATUS_LABEL[to]() }),
			recipients:
				to === 'resolved' ? [{ personId: ticket.requesterPersonId, type: 'ticket.resolved' }] : [],
			followers: true
		});
	});

	// After commit, not awaited: mail degrades, it never blocks (ADR 0006).
	void sendNotificationEmails(mailer, emails, origin);

	return success(undefined);
}

/** Rewrites the subject. The permission check stays in the route. */
export async function changeTicketSubject(
	actor: SessionUser,
	ticketId: string,
	subject: string
): Promise<Outcome<void, 'not_found'>> {
	const { subject: next } = subjectInput.parse({ subject });

	return getDb().transaction(async (tx) => {
		const [ticket] = await tx
			.select({ id: tickets.id, subject: tickets.subject })
			.from(tickets)
			.where(and(eq(tickets.organisationId, actor.organisationId), eq(tickets.id, ticketId)))
			.limit(1);
		if (!ticket) return failure('not_found');
		if (ticket.subject === next) return success(undefined);

		await tx
			.update(tickets)
			.set({ subject: next, updatedAt: new Date() })
			.where(eq(tickets.id, ticket.id));

		await recordActivity(tx, {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target: { ticketId: ticket.id },
			verb: 'ticket.subject.changed',
			payload: { from: ticket.subject, to: next }
		});

		return success(undefined);
	});
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
			...actorColumns(actor),
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
	personId: string | null,
	deps: Deps = {}
): Promise<Outcome<void, ChangeFailure | 'assignee_not_found'>> {
	const { mailer, origin } = resolveDeps(deps);
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

	const emails = await getDb().transaction(async (tx): Promise<PendingEmail[]> => {
		await tx
			.update(tickets)
			.set({ assigneePersonId: personId, updatedAt: new Date() })
			.where(eq(tickets.id, ticket.id));

		const base = {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target: { ticketId: ticket.id }
		};

		if (next) {
			await recordActivity(tx, {
				...base,
				verb: 'ticket.assigned',
				payload: { toPersonId: next.id, toPersonName: next.fullName }
			});

			return notify(tx, {
				organisationId: actor.organisationId,
				actorPersonId: actor.personId,
				target: { ticketId: ticket.id },
				snapshot: { code: ticket.ticketTag, title: ticket.subject, actorName: actor.name },
				followerSummary: m.follow_summary_ticket_assigned({ person: next.fullName }),
				recipients: [{ personId: next.id, type: 'ticket.assigned' }],
				followers: true
			});
		}
		// Unassigning tells the followers only: the person who lost it is not told.
		if (!previous) return [];
		await recordActivity(tx, {
			...base,
			verb: 'ticket.unassigned',
			payload: { fromPersonId: previous.id, fromPersonName: previous.fullName }
		});
		return notify(tx, {
			organisationId: actor.organisationId,
			actorPersonId: actor.personId,
			target: { ticketId: ticket.id },
			snapshot: { code: ticket.ticketTag, title: ticket.subject, actorName: actor.name },
			followerSummary: m.follow_summary_ticket_unassigned(),
			recipients: [],
			followers: true
		});
	});

	// After commit, not awaited (ADR 0006).
	void sendNotificationEmails(mailer, emails, origin);

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
			...actorColumns(actor),
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
