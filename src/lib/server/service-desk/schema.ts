import { sql, type SQL } from 'drizzle-orm';
import {
	index,
	integer,
	pgEnum,
	pgSequence,
	pgTable,
	text,
	timestamp,
	unique,
	uuid
} from 'drizzle-orm/pg-core';
import { DEFAULT_QUEUE_COLOR, QUEUE_COLORS } from '#lib/domain/queue-color.js';
import { PRIORITIES, TICKET_STATUSES } from '#lib/domain/status.js';
import { timestamps } from '../shared/columns';
import { searchVector, tsvector } from '../shared/search-vector';
import { organisations, people } from '../directory/schema';

/**
 * The service desk: who asked, in which queue, what was said.
 *
 * Foreign keys into `directory` are legitimate (ADR 0002). Nothing here points
 * at `assets` or `projects`: tickets relate to them through `links` (ADR 0005).
 *
 * Prose is searched with the **Spanish** dictionary, unlike the asset columns:
 * a subject and a comment body are sentences, and "impresoras" has to find
 * "impresora". The vectors go through `immutable_unaccent` for the same reason
 * the asset ones do (see `shared/search-vector.ts`).
 */

/** `TCK-####` comes from here (ADR 0010). One sequence per entity type. */
export const ticketCodeSequence = pgSequence('ticket_code_seq');

/** Built from the shared vocabulary, never restated (ADR 0011). */
export const ticketStatus = pgEnum('ticket_status', TICKET_STATUSES);
export const ticketPriority = pgEnum('ticket_priority', PRIORITIES);

/** `email` arrives with #18. */
export const ticketChannel = pgEnum('ticket_channel', ['portal', 'agent']);

export const commentVisibility = pgEnum('comment_visibility', ['public', 'internal']);

export const queues = pgTable(
	'queues',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		/** A palette key (`#lib/domain/queue-color.js`), so tickets can be told apart at a glance. */
		color: text('color', { enum: QUEUE_COLORS }).notNull().default(DEFAULT_QUEUE_COLOR),
		...timestamps
	},
	(table) => [unique('queues_org_name').on(table.organisationId, table.name)]
);

export const tickets = pgTable(
	'tickets',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		/** Generated, then editable: the default is a starting value (ADR 0010). */
		ticketTag: text('ticket_tag')
			.notNull()
			.default(sql`'TCK-' || lpad(nextval('ticket_code_seq')::text, 4, '0')`),
		subject: text('subject').notNull(),
		/** `restrict` and `not null`: #14 hangs SLA configuration off the queue. */
		queueId: uuid('queue_id')
			.notNull()
			.references(() => queues.id, { onDelete: 'restrict' }),
		/** `restrict`: a requester must survive their ticket. */
		requesterPersonId: uuid('requester_person_id')
			.notNull()
			.references(() => people.id, { onDelete: 'restrict' }),
		assigneePersonId: uuid('assignee_person_id').references(() => people.id, {
			onDelete: 'set null'
		}),
		status: ticketStatus('status').notNull().default('new'),
		/** `normal` is the default and renders without a badge. */
		priority: ticketPriority('priority').notNull().default('normal'),
		channel: ticketChannel('channel').notNull(),
		search: tsvector('search')
			.notNull()
			.generatedAlwaysAs((): SQL => searchVector('spanish', `coalesce("subject", '')`)),
		...timestamps
	},
	(table) => [
		unique('tickets_org_tag').on(table.organisationId, table.ticketTag),
		index('tickets_org_idx').on(table.organisationId),
		index('tickets_queue_idx').on(table.queueId),
		/** The employee scope filters on this column on every list request. */
		index('tickets_requester_idx').on(table.requesterPersonId),
		index('tickets_assignee_idx').on(table.assigneePersonId),
		index('tickets_search_gin').using('gin', table.search)
	]
);

/**
 * The opening message is the first row here: there is no `description` column
 * and no second shape for "a message with attachments".
 */
export const ticketComments = pgTable(
	'ticket_comments',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		ticketId: uuid('ticket_id')
			.notNull()
			.references(() => tickets.id, { onDelete: 'cascade' }),
		authorPersonId: uuid('author_person_id').references(() => people.id, {
			onDelete: 'set null'
		}),
		body: text('body').notNull(),
		visibility: commentVisibility('visibility').notNull(),
		/** Null means never edited; set on every effective edit (#222). */
		editedAt: timestamp('edited_at', { withTimezone: true }),
		search: tsvector('search')
			.notNull()
			.generatedAlwaysAs((): SQL => searchVector('spanish', `coalesce("body", '')`)),
		...timestamps
	},
	(table) => [
		index('ticket_comments_ticket_created').on(table.ticketId, table.createdAt),
		index('ticket_comments_search_gin').using('gin', table.search)
	]
);

export const attachments = pgTable(
	'attachments',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		commentId: uuid('comment_id')
			.notNull()
			.references(() => ticketComments.id, { onDelete: 'cascade' }),
		filename: text('filename').notNull(),
		contentType: text('content_type').notNull(),
		byteSize: integer('byte_size').notNull(),
		storageKey: text('storage_key').notNull().unique(),
		...timestamps
	},
	(table) => [index('attachments_comment_idx').on(table.commentId)]
);

export type Queue = typeof queues.$inferSelect;
export type Ticket = typeof tickets.$inferSelect;
export type TicketComment = typeof ticketComments.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
