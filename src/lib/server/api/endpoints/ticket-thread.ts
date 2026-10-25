import { z } from 'zod';
import type { TimelineEntry } from '../../activity';
import type { CitationRefusal } from '../../service-desk';
import {
	addComment,
	addCommentInput,
	ticketThread,
	type AddCommentFailure,
	type ThreadItem
} from '../../service-desk';
import { created, defineEndpoint, refusalTable } from '../registry';

/**
 * A ticket's conversation: comments merged with the events of its history. What
 * the caller may read is decided by `ticketThread`'s query, so an internal note
 * is never in the payload for someone without `tickets.comment.internal`.
 */

const personRef = z.object({ id: z.string(), name: z.string() });
/** Who acted on an event: a person, or a service account (an integration). */
const actorRef = z.object({
	kind: z.enum(['person', 'service_account']),
	id: z.string(),
	name: z.string()
});

const attachmentSchema = z.object({
	id: z.string(),
	filename: z.string(),
	contentType: z.string(),
	byteSize: z.number()
});

const commentSchema = z.object({
	kind: z.literal('comment'),
	id: z.string(),
	author: personRef.nullable(),
	body: z.string(),
	visibility: z.enum(['public', 'internal']),
	attachments: z.array(attachmentSchema),
	createdAt: z.iso.datetime()
});

const eventSchema = z.object({
	kind: z.literal('event'),
	id: z.string(),
	verb: z.string(),
	/** A snapshot of the fact as it was when it happened (ADR 0009). */
	payload: z.record(z.string(), z.unknown()),
	actor: actorRef.nullable(),
	at: z.iso.datetime()
});

const threadItem = z.discriminatedUnion('kind', [commentSchema, eventSchema]);

function eventActor(entry: TimelineEntry): z.input<typeof actorRef> | null {
	const name = entry.actorName ?? '';
	if (entry.actorServiceAccountId !== null) {
		return { kind: 'service_account', id: entry.actorServiceAccountId, name };
	}
	return entry.actorPersonId === null ? null : { kind: 'person', id: entry.actorPersonId, name };
}

function threadItemToWire(item: ThreadItem): z.input<typeof threadItem> {
	if (item.kind === 'comment') {
		return {
			kind: 'comment',
			id: item.id,
			author:
				item.authorPersonId === null
					? null
					: { id: item.authorPersonId, name: item.authorName ?? '' },
			body: item.body,
			visibility: item.visibility,
			attachments: item.attachments,
			createdAt: item.createdAt.toISOString()
		};
	}

	const { entry } = item;
	return {
		kind: 'event',
		id: entry.id,
		verb: entry.verb,
		payload: entry.payload as Record<string, unknown>,
		actor: eventActor(entry),
		at: item.at.toISOString()
	};
}

const VIEW = ['tickets.view', 'tickets.view.own'] as const;
const tag = z.string().min(1);

/** How the API answers each failure of the thread use cases (ADR 0047). */
const threadRefusals = refusalTable<'ticket_not_found'>({ ticket_not_found: { as: 'not_found' } });

const NO_INBOUND_ATTACHMENTS = 'The API accepts no inbound attachments.';

const commentRefusals = refusalTable<AddCommentFailure | CitationRefusal>({
	ticket_not_found: { as: 'not_found' },
	// An internal note the caller may not write is a note they may not know exists (ADR 0007).
	internal_not_allowed: { as: 'not_found' },
	attachments_too_many: { as: 'unreachable', why: NO_INBOUND_ATTACHMENTS },
	attachments_too_large: { as: 'unreachable', why: NO_INBOUND_ATTACHMENTS },
	body_too_long: { as: 'field', path: 'body', message: 'The body is too long.' },
	page_not_public: { as: 'conflict' },
	page_not_citable: { as: 'conflict' }
});

export const ticketThreadEndpoint = defineEndpoint({
	id: 'tickets.thread',
	method: 'GET',
	path: '/tickets/{tag}/comments',
	summary: "Read a ticket's thread, oldest first: its comments and the events of its history.",
	description:
		"Returns the ticket's conversation, oldest first: comments merged with the events of its history (status changes, assignments...). Internal notes are included only when the key holds `tickets.comment.internal`.",
	permissions: VIEW,
	refusalTable: threadRefusals,
	input: z.object({ tag }),
	output: z.object({ data: z.array(threadItem) }),
	handler: async ({ principal, input, refuse }) => {
		const outcome = await ticketThread(principal, input.tag);
		if (!outcome.ok) throw refuse(outcome.error);
		return { data: outcome.value.map(threadItemToWire) };
	}
});

export const commentEndpoint = defineEndpoint({
	id: 'tickets.comment',
	method: 'POST',
	path: '/tickets/{tag}/comments',
	summary: 'Add a reply, or an internal note when the key may write one.',
	description:
		"Adds a comment to the ticket's thread. `visibility` defaults to `public`; an `internal` note requires `tickets.comment.internal` and is otherwise answered with `404`. Answers `201` with the new comment's id.",
	example: { body: 'The printer on the second floor is out of toner.', visibility: 'public' },
	status: 201,
	permissions: VIEW,
	refusalTable: commentRefusals,
	input: addCommentInput.extend({
		tag,
		visibility: addCommentInput.shape.visibility.default('public')
	}),
	output: z.object({ data: z.object({ id: z.string() }) }),
	handler: async ({ principal, input, refuse }) => {
		const outcome = await addComment(principal, input.tag, {
			body: input.body,
			visibility: input.visibility
		});
		if (!outcome.ok) throw refuse(outcome.error);
		return created({ data: { id: outcome.value.commentId } }, `/tickets/${input.tag}/comments`);
	}
});
