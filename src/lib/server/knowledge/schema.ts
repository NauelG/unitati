import { sql, type SQL } from 'drizzle-orm';
import {
	check,
	index,
	integer,
	numeric,
	pgEnum,
	pgSequence,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
	type AnyPgColumn
} from 'drizzle-orm/pg-core';
import { SPACE_AUDIENCES } from '#lib/domain/knowledge.js';
import { serviceAccounts } from '../api/schema';
import { timestamps } from '../shared/columns';
import { searchVector, tsvector } from '../shared/search-vector';
import { organisations, people } from '../directory/schema';

/**
 * The knowledge base: spaces, the page tree inside them, and the revisions of
 * each page (ADR 0031).
 *
 * Foreign keys into `directory` are legitimate (ADR 0002). Nothing here points at
 * another domain's tables: pages relate to tickets, assets and projects through
 * `links` (ADR 0005).
 */

/** `DOC-####` comes from here (ADR 0010). One sequence per entity type. */
export const pageCodeSequence = pgSequence('page_code_seq');

/**
 * Who reads a space. `staff` is anyone holding `knowledge.manage`; `portal` is
 * every employee as well. It is the single question every read asks (ADR 0031).
 */
export const knowledgeSpaceAudience = pgEnum('knowledge_space_audience', SPACE_AUDIENCES);

export const knowledgeSpaces = pgTable(
	'knowledge_spaces',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		description: text('description'),
		/** A key of `SPACE_ICONS`. Text, not an enum: the set will grow, and Postgres cannot drop enum values. */
		icon: text('icon').notNull(),
		/** A key of `SPACE_COLOURS`; same reasoning as `icon`. */
		colour: text('colour').notNull(),
		audience: knowledgeSpaceAudience('audience').notNull(),
		/** Archived means read-only. */
		archivedAt: timestamp('archived_at', { withTimezone: true }),
		...timestamps
	},
	(table) => [unique('knowledge_spaces_org_name').on(table.organisationId, table.name)]
);

/**
 * A page of a space. `body` and `title` are the **latest revision**, kept on the
 * row so a read is one query; `page_revisions` is the history.
 *
 * Invariant (stated here, enforced by the domain that lands in #323): creating a
 * page inserts revision 1 in the same transaction, and `pages.revision =
 * max(page_revisions.number)` at every commit.
 *
 * **`page_tag` has no update path** (ADR 0031): the code is the canonical link
 * (`/knowledge/DOC-0042`), so it never changes. No function in the domain sets it.
 */
export const pages = pgTable(
	'pages',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		spaceId: uuid('space_id')
			.notNull()
			.references(() => knowledgeSpaces.id, { onDelete: 'restrict' }),
		/** Null at the root. The parent must be in the same space: the domain enforces it under the organisation lock. */
		parentId: uuid('parent_id').references((): AnyPgColumn => pages.id, { onDelete: 'restrict' }),
		pageTag: text('page_tag')
			.notNull()
			.default(sql`'DOC-' || lpad(nextval('page_code_seq')::text, 4, '0')`),
		title: text('title').notNull(),
		/** Markdown of the latest revision (ADR 0030). */
		body: text('body').notNull().default(''),
		revision: integer('revision').notNull().default(1),
		/** Between siblings; fractional so a move rewrites one row (ADR 0021). */
		position: numeric('position').notNull(),
		/** Null while the page has never been published; staff see drafts, employees never. */
		publishedAt: timestamp('published_at', { withTimezone: true }),
		archivedAt: timestamp('archived_at', { withTimezone: true }),
		createdByPersonId: uuid('created_by_person_id').references(() => people.id, {
			onDelete: 'set null'
		}),
		/** Set instead of `createdByPersonId` when an API key created the page. */
		createdByServiceAccountId: uuid('created_by_service_account_id').references(
			() => serviceAccounts.id,
			{ onDelete: 'restrict' }
		),
		/** Title and body in Spanish, the code verbatim, like `tickets` (ADR 0028). */
		search: tsvector('search')
			.notNull()
			.generatedAlwaysAs(
				(): SQL =>
					sql`${searchVector('spanish', `coalesce("title", '') || ' ' || coalesce("body", '')`)} || ${searchVector('simple', `coalesce("page_tag", '')`)}`
			),
		...timestamps
	},
	(table) => [
		unique('pages_org_tag').on(table.organisationId, table.pageTag),
		check('pages_not_own_parent', sql`${table.parentId} <> ${table.id}`),
		check(
			'pages_at_most_one_creator',
			sql`num_nonnulls(${table.createdByPersonId}, ${table.createdByServiceAccountId}) <= 1`
		),
		index('pages_space_parent_position').on(table.spaceId, table.parentId, table.position),
		index('pages_search_gin').using('gin', table.search)
	]
);

/**
 * Append-only: no update or delete path exists for this table. Revision numbers
 * are contiguous from 1 per page.
 */
export const pageRevisions = pgTable(
	'page_revisions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		pageId: uuid('page_id')
			.notNull()
			.references(() => pages.id, { onDelete: 'restrict' }),
		number: integer('number').notNull(),
		title: text('title').notNull(),
		body: text('body').notNull(),
		authorPersonId: uuid('author_person_id').references(() => people.id, {
			onDelete: 'set null'
		}),
		/** Set instead of `authorPersonId` when an API key saved the revision. */
		authorServiceAccountId: uuid('author_service_account_id').references(() => serviceAccounts.id, {
			onDelete: 'restrict'
		}),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		unique('page_revisions_page_number').on(table.pageId, table.number),
		check(
			'page_revisions_at_most_one_author',
			sql`num_nonnulls(${table.authorPersonId}, ${table.authorServiceAccountId}) <= 1`
		)
	]
);

/**
 * Files attached to a page (ADR 0039): the knowledge base's own table, with a real
 * foreign key. Bytes live in `Storage`, keyed by `storage_key`. Attaching a file
 * is not an edit of the page, so it appends no revision.
 */
export const pageAttachments = pgTable(
	'page_attachments',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		pageId: uuid('page_id')
			.notNull()
			.references(() => pages.id, { onDelete: 'cascade' }),
		uploadedByPersonId: uuid('uploaded_by_person_id').references(() => people.id, {
			onDelete: 'set null'
		}),
		filename: text('filename').notNull(),
		/** `application/octet-stream` when the browser sends none. */
		contentType: text('content_type').notNull(),
		byteSize: integer('byte_size').notNull(),
		/** Server-generated and opaque: never derived from the filename or the request. */
		storageKey: text('storage_key').notNull().unique(),
		...timestamps
	},
	(table) => [index('page_attachments_page_idx').on(table.pageId)]
);

/**
 * Staff comments on a page (#326). Not part of the page's content or history:
 * no revision, no activity, no follow rows. Never deleted; the author may edit
 * (`edited_at`). Readable and writable by `knowledge.manage` only.
 */
export const pageComments = pgTable(
	'page_comments',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		pageId: uuid('page_id')
			.notNull()
			.references(() => pages.id, { onDelete: 'cascade' }),
		authorPersonId: uuid('author_person_id').references(() => people.id, {
			onDelete: 'set null'
		}),
		body: text('body').notNull(),
		/** Null means never edited. */
		editedAt: timestamp('edited_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('page_comments_page_created').on(table.pageId, table.createdAt)]
);

export type KnowledgeSpace = typeof knowledgeSpaces.$inferSelect;
export type Page = typeof pages.$inferSelect;
export type PageRevision = typeof pageRevisions.$inferSelect;
export type PageAttachment = typeof pageAttachments.$inferSelect;
export type PageComment = typeof pageComments.$inferSelect;
