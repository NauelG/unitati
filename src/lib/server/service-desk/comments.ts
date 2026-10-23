import { and, asc, eq, inArray, type SQL } from 'drizzle-orm';
import { actorColumns, listActivity, recordActivity, type TimelineEntry } from '../activity';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { people } from '../directory/schema';
import { pageTagsIn } from '#lib/domain/knowledge.js';
import { extractMentions } from '#lib/domain/mentions.js';
import { citePageTags, citePagesFromBody, redactLinkEvents, type CitationRefusal } from '../links';
import { m } from '#lib/paraglide/messages.js';
import {
	followTicket,
	notify,
	sendNotificationEmails,
	type NotifyInput,
	type PendingEmail
} from '../notifications';
import { renderMarkdown } from '../shared/markdown';
import { failure, success, type Outcome } from '../shared/outcome';
import { allowedMentions, commentSnapshot, followMentioned, notifyMentioned } from './mentions';
import { attachments, ticketComments, tickets } from './schema';
import { requireTicketScope, seesInternal } from './scope';
import { compareThreadItems } from './thread-order';
import { runtimeMailer, runtimeOrigin } from '../shared/runtime';
import { storeFiles } from '../shared/attachments';
import { resolveDeps, type Deps } from './tickets';
import {
	addCommentInput,
	attachmentProblem,
	editCommentInput,
	MAX_COMMENT_LENGTH,
	type AddCommentInput,
	type UploadedFile
} from './validation';

/**
 * Comments, the thread that merges them with the ticket's events, and the
 * attachments that hang off them.
 *
 * **What a viewer may read is decided in the query**, never in the template: an
 * employee's payload must not contain an internal note that the page then
 * merely hides (ADR 0007).
 */

export type ThreadAttachment = {
	id: string;
	filename: string;
	contentType: string;
	byteSize: number;
};

export type ThreadItem =
	| {
			kind: 'comment';
			id: string;
			authorPersonId: string | null;
			authorName: string | null;
			body: string;
			/** `body` rendered as sanitised HTML (ADR 0030): the only thing a template may `{@html}`. */
			bodyHtml: string;
			visibility: 'public' | 'internal';
			createdAt: Date;
			/** Null when never edited (#222). */
			editedAt: Date | null;
			/** Whether the viewer may edit it: computed here, so the template only reads a flag. */
			canEdit: boolean;
			attachments: ThreadAttachment[];
	  }
	| { kind: 'event'; at: Date; entry: TimelineEntry };

/** Employees see that a ticket moved; who it was assigned to or prioritised is staff business. */
const EVENTS_FOR_REQUESTERS: ReadonlySet<TimelineEntry['verb']> = new Set([
	'ticket.created',
	'ticket.status.changed'
]);

/** The marker on the comment already says it was edited, so the event would say it twice. */
const EVENTS_NOT_LISTED: ReadonlySet<TimelineEntry['verb']> = new Set(['comment.edited']);

/**
 * Who may edit a comment: its author, or a technician for the ticket's opening
 * message (the requester's description). Everyone who can edit it can read it.
 */
function mayEditComment(
	viewer: SessionUser,
	comment: { authorPersonId: string | null },
	isFirst: boolean
): boolean {
	if (viewer.personId !== null && comment.authorPersonId === viewer.personId) return true;
	return isFirst && can(viewer, 'tickets.manage');
}

/** Oldest first: a conversation reads top to bottom. */
export async function ticketThread(
	viewer: SessionUser,
	ticketTag: string
): Promise<Outcome<ThreadItem[], 'ticket_not_found'>> {
	const [ticket] = await getDb()
		.select({ id: tickets.id })
		.from(tickets)
		.where(and(requireTicketScope(viewer), eq(tickets.ticketTag, ticketTag)))
		.limit(1);
	if (!ticket) return failure('ticket_not_found');

	const staff = seesInternal(viewer);
	const rows = await getDb()
		.select({
			id: ticketComments.id,
			authorPersonId: ticketComments.authorPersonId,
			authorName: people.fullName,
			body: ticketComments.body,
			visibility: ticketComments.visibility,
			createdAt: ticketComments.createdAt,
			editedAt: ticketComments.editedAt
		})
		.from(ticketComments)
		.leftJoin(people, eq(ticketComments.authorPersonId, people.id))
		.where(
			and(
				eq(ticketComments.ticketId, ticket.id),
				staff ? undefined : eq(ticketComments.visibility, 'public')
			)
		)
		.orderBy(asc(ticketComments.createdAt), asc(ticketComments.id));

	const files = rows.length
		? await getDb()
				.select({
					id: attachments.id,
					commentId: attachments.commentId,
					filename: attachments.filename,
					contentType: attachments.contentType,
					byteSize: attachments.byteSize
				})
				.from(attachments)
				.where(
					inArray(
						attachments.commentId,
						rows.map((row) => row.id)
					)
				)
				.orderBy(asc(attachments.createdAt))
		: [];

	const events = await redactLinkEvents(
		viewer,
		(
			await listActivity({ organisationId: viewer.organisationId, target: { ticketId: ticket.id } })
		).filter(
			(entry) =>
				!EVENTS_NOT_LISTED.has(entry.verb) && (staff || EVENTS_FOR_REQUESTERS.has(entry.verb))
		)
	);

	const items: ThreadItem[] = [
		// The opening message is the first comment *including* internal ones the
		// viewer cannot see, but an internal note is never first, so the visible
		// list's first row is the same row.
		...rows.map((row, index): ThreadItem => ({
			kind: 'comment',
			...row,
			canEdit: mayEditComment(viewer, row, index === 0),
			bodyHtml: renderMarkdown(row.body),
			attachments: files.filter((file) => file.commentId === row.id)
		})),
		...events.map((entry): ThreadItem => ({ kind: 'event', at: entry.occurredAt, entry }))
	];

	return success(items.sort(compareThreadItems));
}

export type AddCommentFailure =
	| 'ticket_not_found'
	| 'internal_not_allowed'
	| 'attachments_too_many'
	| 'attachments_too_large'
	| 'body_too_long';

/**
 * Who a new comment concerns (#302): a public one, the requester (`ticket.replied`)
 * and the assignee (`ticket.commented`); an internal one, only the assignee.
 * `notify` drops the author and anybody an internal note may not reach.
 */
function commentRecipients(
	ticket: { requesterPersonId: string; assigneePersonId: string | null },
	visibility: 'public' | 'internal'
): NotifyInput['recipients'] {
	const recipients: NotifyInput['recipients'] = [];
	if (visibility === 'public') {
		recipients.push({ personId: ticket.requesterPersonId, type: 'ticket.replied' });
	}
	if (ticket.assigneePersonId) {
		recipients.push({ personId: ticket.assigneePersonId, type: 'ticket.commented' });
	}
	return recipients;
}

/**
 * Adds a reply or an internal note. The ticket is looked up through the
 * viewer's scope, so an employee can only answer their own; an internal note
 * additionally needs `tickets.comment.internal`.
 *
 * Every `/knowledge/DOC-####` link in the body is cited on the ticket in the same
 * transaction (#327). A page a reply may not link (`page_not_public` in a public
 * reply, `page_not_citable` in a note) refuses the whole comment, naming it, and
 * writes nothing.
 *
 * Notifies the requester and the assignee inside the same transaction
 * (ADR 0040); their mails go out **after commit, unawaited**: with SMTP down the
 * comment is still saved and the response still returns (ADR 0006).
 */
export async function addComment(
	actor: SessionUser,
	ticketTag: string,
	input: AddCommentInput,
	files: UploadedFile[] = [],
	deps: Deps = {}
): Promise<Outcome<{ commentId: string }, AddCommentFailure | CitationRefusal>> {
	// Checked before the schema so the caller gets a typed failure to show
	// inline rather than a thrown validation error.
	if (input.body.trim().length > MAX_COMMENT_LENGTH) return failure('body_too_long');

	const values = addCommentInput.parse(input);
	const { storage, mailer, origin } = resolveDeps(deps);

	if (values.visibility === 'internal' && !seesInternal(actor)) {
		return failure('internal_not_allowed');
	}

	const problem = attachmentProblem(files);
	if (problem) return failure(`attachments_${problem}`);

	const [ticket] = await getDb()
		.select({
			id: tickets.id,
			ticketTag: tickets.ticketTag,
			subject: tickets.subject,
			requesterPersonId: tickets.requesterPersonId,
			assigneePersonId: tickets.assigneePersonId
		})
		.from(tickets)
		.where(and(requireTicketScope(actor), eq(tickets.ticketTag, ticketTag)) as SQL)
		.limit(1);
	if (!ticket) return failure('ticket_not_found');

	const stored = await storeFiles(storage, actor.organisationId, files);

	let commentId: string;
	let emails: PendingEmail[];
	let refusal: CitationRefusal | null = null;
	try {
		({ commentId, emails } = await getDb().transaction(async (tx) => {
			// First, so a refusal happens before any row is written.
			const cited = await citePagesFromBody(tx, actor, ticket.id, values.body, values.visibility);
			if (!cited.ok) {
				refusal = cited.error;
				return { commentId: '', emails: [] };
			}

			const [comment] = await tx
				.insert(ticketComments)
				.values({
					organisationId: actor.organisationId,
					ticketId: ticket.id,
					authorPersonId: actor.personId,
					body: values.body,
					visibility: values.visibility
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

			await tx.update(tickets).set({ updatedAt: new Date() }).where(eq(tickets.id, ticket.id));

			// One `notify` for participants and mentions alike, so somebody who is both
			// gets the strongest notification once (#303).
			const mentioned = await allowedMentions(tx, actor, ticket, values.visibility, values.body);
			const pending = await notify(tx, {
				organisationId: actor.organisationId,
				actorPersonId: actor.personId,
				target: { ticketId: ticket.id },
				visibility: values.visibility,
				snapshot: commentSnapshot(ticket, actor, values.body),
				followerSummary:
					values.visibility === 'internal'
						? m.follow_summary_internal_comment()
						: m.follow_summary_comment(),
				recipients: [
					...commentRecipients(ticket, values.visibility),
					...mentioned.map((personId) => ({ personId, type: 'mention' as const }))
				],
				followers: true
			});
			await followMentioned(tx, actor.organisationId, ticket, mentioned);

			// Writing on a ticket follows it, unless the author is a participant already (#57).
			const participant =
				actor.personId === ticket.requesterPersonId || actor.personId === ticket.assigneePersonId;
			if (actor.personId && !participant && can(actor, 'tickets.view')) {
				await followTicket(tx, {
					organisationId: actor.organisationId,
					personId: actor.personId,
					ticketId: ticket.id
				});
			}

			return { commentId: comment.id, emails: pending };
		}));
	} catch (error) {
		await Promise.all(stored.map((file) => storage.delete(file.row.storageKey)));
		throw error;
	}

	if (refusal) {
		await Promise.all(stored.map((file) => storage.delete(file.row.storageKey)));
		return failure(refusal);
	}

	// After commit, not awaited: with SMTP down the comment is still saved (ADR 0006).
	void sendNotificationEmails(mailer, emails, origin);

	return success({ commentId });
}

export type EditCommentFailure = 'not_found' | 'forbidden' | 'body_too_long';
export type EditCommentOutcomeFailure = EditCommentFailure | CitationRefusal;

/**
 * Edits the text of a comment (#222). The comment is found through the
 * actor's ticket scope, so one they cannot see is `not_found`, never
 * `forbidden`, which would confirm it exists. Attachments are untouched, and the only
 * mail is to people the edit newly @mentions (#303). An unchanged body records nothing, and the ticket's
 * `updated_at` stays put: the list's "recently updated" order is for new
 * activity, not typo fixes.
 */
export async function editComment(
	actor: SessionUser,
	commentId: string,
	body: string,
	deps: Deps = {}
): Promise<Outcome<void, EditCommentOutcomeFailure>> {
	if (body.trim().length > MAX_COMMENT_LENGTH) return failure('body_too_long');
	const values = editCommentInput.parse({ body });
	// Not `resolveDeps`: an edit stores no file, so it must not need a storage.
	const mailer = deps.mailer === undefined ? runtimeMailer() : deps.mailer;

	let emails: PendingEmail[] = [];
	const outcome = await getDb().transaction(
		async (tx): Promise<Outcome<void, EditCommentOutcomeFailure>> => {
			const [comment] = await tx
				.select({
					id: ticketComments.id,
					ticketId: ticketComments.ticketId,
					authorPersonId: ticketComments.authorPersonId,
					body: ticketComments.body,
					visibility: ticketComments.visibility,
					createdAt: ticketComments.createdAt,
					ticketTag: tickets.ticketTag,
					subject: tickets.subject,
					requesterPersonId: tickets.requesterPersonId,
					assigneePersonId: tickets.assigneePersonId
				})
				.from(ticketComments)
				.innerJoin(tickets, eq(ticketComments.ticketId, tickets.id))
				.where(
					and(
						eq(ticketComments.id, commentId),
						eq(ticketComments.organisationId, actor.organisationId),
						requireTicketScope(actor),
						seesInternal(actor) ? undefined : eq(ticketComments.visibility, 'public')
					)
				)
				.limit(1);
			if (!comment) return failure('not_found');

			const [first] = await tx
				.select({ id: ticketComments.id })
				.from(ticketComments)
				.where(eq(ticketComments.ticketId, comment.ticketId))
				.orderBy(asc(ticketComments.createdAt), asc(ticketComments.id))
				.limit(1);

			if (!mayEditComment(actor, comment, first?.id === comment.id)) return failure('forbidden');
			if (comment.body === values.body) return success(undefined);

			// Only the pages this edit adds: a link that was already there was cited
			// (or refused) when it was written, and a page archived since must not
			// block fixing a typo around it (#327).
			const already = new Set(pageTagsIn(comment.body));
			const added = pageTagsIn(values.body).filter((tag) => !already.has(tag));
			if (added.length > 0) {
				const cited = await citePageTags(tx, actor, comment.ticketId, added, comment.visibility);
				if (!cited.ok) return failure(cited.error);
			}

			const now = new Date();
			await tx
				.update(ticketComments)
				.set({ body: values.body, editedAt: now, updatedAt: now })
				.where(eq(ticketComments.id, comment.id));

			await recordActivity(tx, {
				organisationId: actor.organisationId,
				...actorColumns(actor),
				target: { ticketId: comment.ticketId },
				verb: 'comment.edited',
				payload: { commentId: comment.id, visibility: comment.visibility }
			});

			// Only the people this edit adds: those already named were told once.
			emails = await notifyMentioned(
				tx,
				actor,
				{ ...comment, id: comment.ticketId },
				comment.visibility,
				values.body,
				extractMentions(comment.body)
			);

			return success(undefined);
		}
	);

	// After commit, not awaited (ADR 0006).
	void sendNotificationEmails(mailer, emails, deps.origin ?? runtimeOrigin());
	return outcome;
}

/**
 * The bytes of one attachment, if the viewer may read the comment it hangs off.
 * Resolved by the attachment's id through the ticket scope — an id from another
 * organisation, or on an internal note an employee cannot read, is simply not
 * found, which is what keeps the answer from confirming it exists.
 */
export async function getAttachment(
	viewer: SessionUser,
	attachmentId: string,
	deps: Deps = {}
): Promise<
	Outcome<{ filename: string; contentType: string; data: Uint8Array }, 'attachment_not_found'>
> {
	const { storage } = resolveDeps(deps);

	const [row] = await getDb()
		.select({
			filename: attachments.filename,
			contentType: attachments.contentType,
			storageKey: attachments.storageKey
		})
		.from(attachments)
		.innerJoin(ticketComments, eq(attachments.commentId, ticketComments.id))
		.innerJoin(tickets, eq(ticketComments.ticketId, tickets.id))
		.where(
			and(
				eq(attachments.id, attachmentId),
				eq(attachments.organisationId, viewer.organisationId),
				requireTicketScope(viewer),
				seesInternal(viewer) ? undefined : eq(ticketComments.visibility, 'public')
			)
		)
		.limit(1);
	if (!row) return failure('attachment_not_found');

	const data = await storage.get(row.storageKey);
	if (!data) return failure('attachment_not_found');

	return success({ filename: row.filename, contentType: row.contentType, data });
}
