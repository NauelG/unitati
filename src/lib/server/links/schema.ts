import { index, pgTable, unique, uuid } from 'drizzle-orm/pg-core';
import { timestamps } from '../shared/columns';
import { organisations, people } from '../directory/schema';
import { assets } from '../assets/schema';
import { tickets } from '../service-desk/schema';

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
