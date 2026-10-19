import { z } from 'zod';
import { DEFAULT_QUEUE_COLOR, QUEUE_COLORS } from '#lib/domain/queue-color.js';
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_COMMENT } from '#lib/domain/attachments.js';
import { RICH_TEXT_MAX_LENGTH } from '#lib/domain/rich-text.js';
import { PRIORITIES } from '#lib/domain/status.js';

/**
 * Input validation for the service desk. Hand-written rather than generated
 * from the tables (as `assets/validation.ts` is) because the create form is not
 * one row: the opening message is a comment, so `body` belongs to a different
 * table than `subject`.
 *
 * `organisation_id` is never an input (ADR 0004): the tenancy scope comes from
 * the session. A missing queue fails here, before any query is built.
 */

/**
 * Tags the router owns. The tag is a URL segment (ADR 0010) and the service
 * desk keeps `/service-desk/new` and the legacy queues path (a redirect, #126)
 * beside it, so a ticket tagged `queues` would be created happily and then be unreachable.
 */
export const RESERVED_TICKET_TAGS: ReadonlySet<string> = new Set(['new', 'queues']);

const nonEmpty = z.string().trim().min(1);

/** A ticket is about a handful of machines; a bound stops a posted array from becoming a query per id. */
export const MAX_AFFECTED_ASSETS = 20;

export { MAX_ATTACHMENTS_PER_COMMENT, MAX_ATTACHMENT_BYTES };

/** A file as the domain receives it: bytes already read, not a web `File`. */
export interface UploadedFile {
	filename: string;
	contentType: string;
	data: Uint8Array;
}

export const createTicketInput = z.object({
	subject: nonEmpty,
	body: nonEmpty,
	queueId: z.uuid(),
	/** Only honoured for staff; an employee is always their own requester. */
	requesterPersonId: z.uuid().optional(),
	priority: z.enum(PRIORITIES).optional(),
	/** The assets the ticket is about. Whether each may be attached is `links`' call, not this schema's. */
	assetIds: z.array(z.uuid()).max(MAX_AFFECTED_ASSETS).optional()
});

/** Characters of markdown a comment may hold (ADR 0030); the editor enforces the same bound. */
export const MAX_COMMENT_LENGTH = RICH_TEXT_MAX_LENGTH;

export const addCommentInput = z.object({
	body: nonEmpty.max(MAX_COMMENT_LENGTH),
	visibility: z.enum(['public', 'internal'])
});

/** An edit holds the same text rule as a new comment; visibility and attachments never change. */
export const editCommentInput = addCommentInput.pick({ body: true });

export const subjectInput = createTicketInput.pick({ subject: true });

export const queueInput = z.object({
	name: nonEmpty,
	color: z.enum(QUEUE_COLORS).default(DEFAULT_QUEUE_COLOR)
});

export type CreateTicketInput = z.input<typeof createTicketInput>;
export type AddCommentInput = z.input<typeof addCommentInput>;
export type QueueInput = z.input<typeof queueInput>;

/** `null` when the files are acceptable, otherwise the reason. */
export function attachmentProblem(files: readonly UploadedFile[]): 'too_many' | 'too_large' | null {
	if (files.length > MAX_ATTACHMENTS_PER_COMMENT) return 'too_many';
	if (files.some((file) => file.data.byteLength > MAX_ATTACHMENT_BYTES)) return 'too_large';
	return null;
}
