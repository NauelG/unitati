import { and, asc, eq, inArray, type SQL } from 'drizzle-orm';
import { actorColumns, listActivity, recordActivity, type TimelineEntry } from '../activity';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { people } from '../directory/schema';
import { renderMarkdown } from '../shared/markdown';
import { failure, success, type Outcome } from '../shared/outcome';
import { sendQuietly } from '../shared/mail';
import { newReplyMail } from './mail';
import { attachments, ticketComments, tickets } from './schema';
import { requireTicketScope, seesInternal } from './scope';
import { compareThreadItems } from './thread-order';
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

	const events = (
		await listActivity({ organisationId: viewer.organisationId, target: { ticketId: ticket.id } })
	).filter(
		(entry) =>
			!EVENTS_NOT_LISTED.has(entry.verb) && (staff || EVENTS_FOR_REQUESTERS.has(entry.verb))
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
 * Adds a reply or an internal note. The ticket is looked up through the
 * viewer's scope, so an employee can only answer their own; an internal note
 * additionally needs `tickets.comment.internal`.
 *
 * Mail goes to the requester only, for a **public** comment written by someone
 * else, and **after commit, unawaited**: with SMTP down the comment is still
 * saved and the response still returns (ADR 0006).
 */
export async function addComment(
	actor: SessionUser,
	ticketTag: string,
	input: AddCommentInput,
	files: UploadedFile[] = [],
	deps: Deps = {}
): Promise<Outcome<{ commentId: string }, AddCommentFailure>> {
	// Checked before the schema so the caller gets a typed failure to show
	// inline rather than a thrown validation error.
	if (input.body.trim().length > MAX_COMMENT_LENGTH) return failure('body_too_long');

	const values = addCommentInput.parse(input);
	const { storage, mailer, linkTo } = resolveDeps(deps);

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
			requesterPersonId: tickets.requesterPersonId
		})
		.from(tickets)
		.where(and(requireTicketScope(actor), eq(tickets.ticketTag, ticketTag)) as SQL)
		.limit(1);
	if (!ticket) return failure('ticket_not_found');

	const stored = await storeFiles(storage, actor.organisationId, files);

	let commentId: string;
	try {
		commentId = await getDb().transaction(async (tx) => {
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
			return comment.id;
		});
	} catch (error) {
		await Promise.all(stored.map((file) => storage.delete(file.row.storageKey)));
		throw error;
	}

	if (values.visibility === 'public' && actor.personId !== ticket.requesterPersonId) {
		const [requester] = await getDb()
			.select({ email: people.email })
			.from(people)
			.where(eq(people.id, ticket.requesterPersonId));

		if (requester?.email) {
			void sendQuietly(mailer, {
				to: requester.email,
				...newReplyMail(ticket, linkTo(ticket.ticketTag))
			});
		}
	}

	return success({ commentId });
}

export type EditCommentFailure = 'not_found' | 'forbidden' | 'body_too_long';

/**
 * Edits the text of a comment (#222). The comment is found through the
 * actor's ticket scope, so one they cannot see is `not_found`, never
 * `forbidden`, which would confirm it exists. Attachments are untouched, and no
 * mail goes out. An unchanged body records nothing, and the ticket's
 * `updated_at` stays put: the list's "recently updated" order is for new
 * activity, not typo fixes.
 */
export async function editComment(
	actor: SessionUser,
	commentId: string,
	body: string
): Promise<Outcome<void, EditCommentFailure>> {
	if (body.trim().length > MAX_COMMENT_LENGTH) return failure('body_too_long');
	const values = editCommentInput.parse({ body });

	return getDb().transaction(async (tx) => {
		const [comment] = await tx
			.select({
				id: ticketComments.id,
				ticketId: ticketComments.ticketId,
				authorPersonId: ticketComments.authorPersonId,
				body: ticketComments.body,
				visibility: ticketComments.visibility,
				createdAt: ticketComments.createdAt
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

		return success(undefined);
	});
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
