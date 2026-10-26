import { sql, type SQL } from 'drizzle-orm';
import {
	boolean,
	index,
	integer,
	pgEnum,
	pgSequence,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { DEFAULT_CATALOGUE_COLOR, CATALOGUE_COLORS } from '#lib/domain/catalogue-color.js';
import { REQUEST_FORM_KINDS } from '#lib/domain/request-form.js';
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

/** Built from the shared vocabulary, never restated (ADR 0011). */
export const requestFormKind = pgEnum('request_form_kind', REQUEST_FORM_KINDS);

export const queues = pgTable(
	'queues',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		/** A palette key (`#lib/domain/catalogue-color.js`), so tickets can be told apart at a glance. */
		color: text('color', { enum: CATALOGUE_COLORS }).notNull().default(DEFAULT_CATALOGUE_COLOR),
		...timestamps
	},
	(table) => [unique('queues_org_name').on(table.organisationId, table.name)]
);

/**
 * What an employee picks in the portal to say what they are asking for
 * (ADR 0037, #271). The queue is only where the ticket starts: it is still who
 * works it. Deactivated, never deleted, once a ticket came from it.
 */
export const requestForms = pgTable(
	'request_forms',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		/** Markdown, short; shown under the form's name in the portal. */
		description: text('description').notNull().default(''),
		kind: requestFormKind('kind').notNull(),
		/** `restrict`: a queue a form routes to cannot be deleted from under it. */
		queueId: uuid('queue_id')
			.notNull()
			.references(() => queues.id, { onDelete: 'restrict' }),
		active: boolean('active').notNull().default(true),
		...timestamps
	},
	(table) => [unique('request_forms_org_name').on(table.organisationId, table.name)]
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
		/** The form it came from; null for free-text and staff tickets. `restrict`: a form with tickets is deactivated, never deleted. */
		requestFormId: uuid('request_form_id').references(() => requestForms.id, {
			onDelete: 'restrict'
		}),
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
		index('tickets_request_form_idx').on(table.requestFormId),
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

/**
 * The organisation's catalogue of labels (ADR 0053). Flat and owned by the
 * organisation, applied to any ticket whatever its queue. Archived, never
 * hidden from the tickets that carry one; deleted only while on no ticket.
 */
export const labels = pgTable(
	'labels',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		description: text('description'),
		/** A palette key (`#lib/domain/catalogue-color.js`), shared with queues. */
		color: text('color', { enum: CATALOGUE_COLORS }).notNull().default(DEFAULT_CATALOGUE_COLOR),
		active: boolean('active').notNull().default(true),
		...timestamps
	},
	(table) => [
		// Case-insensitive: `VPN` and `vpn` are the same label, the sprawl this catalogue exists to stop.
		uniqueIndex('labels_org_name').on(table.organisationId, sql`lower(${table.name})`)
	]
);

/**
 * Both ends are service-desk tables, so the join lives here and not in `links`
 * (ADR 0002). Same organisation on both ends is enforced by the write path.
 * `restrict` on the label is what refuses deleting one in use.
 */
export const ticketLabels = pgTable(
	'ticket_labels',
	{
		ticketId: uuid('ticket_id')
			.notNull()
			.references(() => tickets.id, { onDelete: 'cascade' }),
		labelId: uuid('label_id')
			.notNull()
			.references(() => labels.id, { onDelete: 'restrict' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		primaryKey({ columns: [table.ticketId, table.labelId] }),
		index('ticket_labels_label_idx').on(table.labelId)
	]
);

export type Queue = typeof queues.$inferSelect;
export type Label = typeof labels.$inferSelect;
export type RequestForm = typeof requestForms.$inferSelect;
export type Ticket = typeof tickets.$inferSelect;
export type TicketComment = typeof ticketComments.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
