import { z } from 'zod';
import { addComment, addCommentInput, ticketThread, type ThreadItem } from '../../service-desk';
import { created, defineEndpoint } from '../registry';
import { refusal } from './refusals';

/**
 * A ticket's conversation: comments merged with the events of its history. What
 * the caller may read is decided by `ticketThread`'s query, so an internal note
 * is never in the payload for someone without `tickets.comment.internal`.
 */

const personRef = z.object({ id: z.string(), name: z.string() });

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
	actor: personRef.nullable(),
	at: z.iso.datetime()
});

const threadItem = z.discriminatedUnion('kind', [commentSchema, eventSchema]);

function toWire(item: ThreadItem): z.input<typeof threadItem> {
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
		actor:
			entry.actorPersonId === null
				? null
				: { id: entry.actorPersonId, name: entry.actorName ?? '' },
		at: item.at.toISOString()
	};
}

const VIEW = ['tickets.view', 'tickets.view.own'] as const;
const tag = z.string().min(1);

export const ticketThreadEndpoint = defineEndpoint({
	id: 'tickets.thread',
	method: 'GET',
	path: '/tickets/{tag}/comments',
	summary: "Read a ticket's thread, oldest first: its comments and the events of its history.",
	permissions: VIEW,
	input: z.object({ tag }),
	output: z.object({ data: z.array(threadItem) }),
	handler: async ({ principal, input }) => {
		const outcome = await ticketThread(principal, input.tag);
		if (!outcome.ok) throw refusal(outcome.error);
		return { data: outcome.value.map(toWire) };
	}
});

export const commentEndpoint = defineEndpoint({
	id: 'tickets.comment',
	method: 'POST',
	path: '/tickets/{tag}/comments',
	summary: 'Add a reply, or an internal note when the key may write one.',
	permissions: VIEW,
	input: addCommentInput.extend({
		tag,
		visibility: addCommentInput.shape.visibility.default('public')
	}),
	output: z.object({ data: z.object({ id: z.string() }) }),
	handler: async ({ principal, input }) => {
		const outcome = await addComment(principal, input.tag, {
			body: input.body,
			visibility: input.visibility
		});
		if (!outcome.ok) throw refusal(outcome.error);
		return created({ data: { id: outcome.value.commentId } }, `/tickets/${input.tag}/comments`);
	}
});
