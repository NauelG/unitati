import { index, pgTable, unique, uuid } from 'drizzle-orm/pg-core';
import { timestamps } from '../shared/columns';
import { organisations, people } from '../directory/schema';
import { assets, categories, handovers } from '../assets/schema';
import { projects, tasks } from '../projects/schema';
import { tickets } from '../service-desk/schema';
import { pages } from '../knowledge/schema';

/**
 * The cross-domain relations (ADR 0005): one join table per pair, each with
 * real foreign keys to both sides, so the database refuses a link to a record
 * that does not exist. A polymorphic `link` table could not — no foreign key
 * can point at a column that sometimes means `assets` and sometimes `tasks`.
 *
 * This module is the one place allowed to hold a foreign key into two other
 * domains' tables; that is what it is for. Nothing else imports them to relate
 * records (ADR 0002). `activity` makes the same trade for the same reason.
 *
 * There is no `kind` column: the relation *is* the table. "Affects" is a word
 * for people and panel labels, never a value stored in a row.
 */

/** A ticket is about this asset (`affects`). Many to many. */
export const ticketAsset = pgTable(
	'ticket_asset',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		ticketId: uuid('ticket_id')
			.notNull()
			.references(() => tickets.id, { onDelete: 'cascade' }),
		assetId: uuid('asset_id')
			.notNull()
			.references(() => assets.id, { onDelete: 'cascade' }),
		/** A relation is attributable like any other record; `set null` keeps it when the person goes. */
		createdByPersonId: uuid('created_by_person_id').references(() => people.id, {
			onDelete: 'set null'
		}),
		...timestamps
	},
	(table) => [
		/**
		 * The pair is unique so ticket merge and split (#20), which moves a losing
		 * ticket's links onto the winner, cannot land the same link twice.
		 */
		unique('ticket_asset_pair').on(table.ticketId, table.assetId),
		/** The asset page asks "which tickets", and the pair index leads with the ticket. */
		index('ticket_asset_asset_idx').on(table.assetId)
	]
);

export type TicketAsset = typeof ticketAsset.$inferSelect;

/** A ticket is being resolved in this task (`resolved_in`). Many to many. */
export const ticketTask = pgTable(
	'ticket_task',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		ticketId: uuid('ticket_id')
			.notNull()
			.references(() => tickets.id, { onDelete: 'cascade' }),
		taskId: uuid('task_id')
			.notNull()
			.references(() => tasks.id, { onDelete: 'cascade' }),
		createdByPersonId: uuid('created_by_person_id').references(() => people.id, {
			onDelete: 'set null'
		}),
		...timestamps
	},
	(table) => [
		/** Leads with the ticket, so "what is this ticket linked to" uses it. */
		unique('ticket_task_pair').on(table.ticketId, table.taskId),
		/** The task page asks "which tickets". */
		index('ticket_task_task_idx').on(table.taskId)
	]
);

/** A ticket is being handled in this project (`handled_in`). Many to many. */
export const ticketProject = pgTable(
	'ticket_project',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		ticketId: uuid('ticket_id')
			.notNull()
			.references(() => tickets.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		createdByPersonId: uuid('created_by_person_id').references(() => people.id, {
			onDelete: 'set null'
		}),
		...timestamps
	},
	(table) => [
		unique('ticket_project_pair').on(table.ticketId, table.projectId),
		index('ticket_project_project_idx').on(table.projectId)
	]
);

export type TicketTask = typeof ticketTask.$inferSelect;
export type TicketProject = typeof ticketProject.$inferSelect;

/**
 * A ticket is fulfilled by this handover (`fulfilled-by`, #279). Many to many.
 * A request for equipment arrives as a ticket; the handover that answers it is
 * the other half. Linking never closes the ticket (ADR 0035).
 */
export const ticketHandover = pgTable(
	'ticket_handover',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		ticketId: uuid('ticket_id')
			.notNull()
			.references(() => tickets.id, { onDelete: 'cascade' }),
		handoverId: uuid('handover_id')
			.notNull()
			.references(() => handovers.id, { onDelete: 'cascade' }),
		createdByPersonId: uuid('created_by_person_id').references(() => people.id, {
			onDelete: 'set null'
		}),
		...timestamps
	},
	(table) => [
		/** Unique so ticket merge and split (#20) cannot land the same link twice. */
		unique('ticket_handover_pair').on(table.ticketId, table.handoverId),
		/** The decision handler asks "which tickets" for a handover. */
		index('ticket_handover_handover_idx').on(table.handoverId)
	]
);

export type TicketHandover = typeof ticketHandover.$inferSelect;

/**
 * A ticket asks for this asset category (`requests`, #271). Written by an
 * equipment request form; the technician's Deliver filters on it. Many to many
 * by shape, one row today.
 */
export const ticketCategory = pgTable(
	'ticket_category',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		ticketId: uuid('ticket_id')
			.notNull()
			.references(() => tickets.id, { onDelete: 'cascade' }),
		/** `restrict`: a category somebody asked for cannot vanish from under the request. */
		categoryId: uuid('category_id')
			.notNull()
			.references(() => categories.id, { onDelete: 'restrict' }),
		createdByPersonId: uuid('created_by_person_id').references(() => people.id, {
			onDelete: 'set null'
		}),
		...timestamps
	},
	(table) => [
		unique('ticket_category_pair').on(table.ticketId, table.categoryId),
		/** The category catalogue asks "is this in use". */
		index('ticket_category_category_idx').on(table.categoryId)
	]
);

export type TicketCategory = typeof ticketCategory.$inferSelect;

/**
 * A ticket cites this knowledge page (`cites`, #327): by hand from the rail, or
 * automatically when a reply links `/knowledge/DOC-####`. Removing the link from
 * the text later keeps the citation. Many to many.
 */
export const ticketPage = pgTable(
	'ticket_page',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		ticketId: uuid('ticket_id')
			.notNull()
			.references(() => tickets.id, { onDelete: 'cascade' }),
		pageId: uuid('page_id')
			.notNull()
			.references(() => pages.id, { onDelete: 'cascade' }),
		createdByPersonId: uuid('created_by_person_id').references(() => people.id, {
			onDelete: 'set null'
		}),
		...timestamps
	},
	(table) => [
		unique('ticket_page_pair').on(table.ticketId, table.pageId),
		/** The page asks "which tickets cite me". */
		index('ticket_page_page_idx').on(table.pageId)
	]
);

/** A project is documented by this knowledge page (`documented-by`, #327). Many to many. */
export const projectPage = pgTable(
	'project_page',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		pageId: uuid('page_id')
			.notNull()
			.references(() => pages.id, { onDelete: 'cascade' }),
		createdByPersonId: uuid('created_by_person_id').references(() => people.id, {
			onDelete: 'set null'
		}),
		...timestamps
	},
	(table) => [
		unique('project_page_pair').on(table.projectId, table.pageId),
		/** The page asks "which projects do I document". */
		index('project_page_page_idx').on(table.pageId)
	]
);

export type TicketPage = typeof ticketPage.$inferSelect;
export type ProjectPage = typeof projectPage.$inferSelect;
