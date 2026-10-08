import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { timestamps } from '../shared/columns';
import { organisations, people } from '../directory/schema';
import { assets } from '../assets/schema';
import { ACTIVITY_TARGETS, ACTIVITY_VERBS } from './verbs';
import type { ActivityEntry } from './payload';

/**
 * One activity table for the whole product (ADR 0009): typed nullable foreign
 * keys, one per entity that can carry history, and a `CHECK` that exactly one
 * is set. Real referential integrity, one table to query.
 *
 * This module is cross-cutting rather than a domain: it owns the table and the
 * payload contract, and the rows are written by whichever domain caused them,
 * inside that domain's own transaction.
 *
 * It does import `assets`, which is the one thing the design cannot avoid: ADR
 * 0009 chose typed foreign keys over a polymorphic `record_type` precisely so
 * the database refuses history attached to a record that does not exist, and a
 * foreign key has to name its table. The dependency runs one way only — a
 * domain calls `recordActivity`, and this file points at the domain's table —
 * so there is no cycle. ADR 0002's rule against domains importing each other's
 * tables binds the domains; `activity` is not one of them, any more than `db/`
 * or `access/` is.
 *
 * **Why the table lands with #7 rather than with the contract in PR 1.** Its
 * foreign key to `assets` has to exist from its first migration. Shipping the
 * table earlier would have cost a second migration to add the key, and left a
 * window in which history could point at an asset that never existed — the
 * referential guarantee ADR 0009 calls non-negotiable.
 */

/**
 * Built **from** the TypeScript list, not beside it. `verbs.ts` is the one
 * source of the vocabulary so the payload contract can exist before the table
 * does; restating the six strings here would be the second copy, and the
 * compiler cannot catch a drift between two string literals.
 */
export const activityVerb = pgEnum('activity_verb', ACTIVITY_VERBS);

export const activity = pgTable(
	'activity',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		/** Nullable because the system acts too: a scheduled rule has no person. */
		actorPersonId: uuid('actor_person_id').references(() => people.id, { onDelete: 'set null' }),
		verb: activityVerb('verb').notNull(),
		/**
		 * Shape fixed by the discriminated union in `payload.ts` and validated by
		 * Zod on write. Typed as that union here so a read is narrowed by its verb
		 * rather than handed back as `unknown`.
		 */
		payload: jsonb('payload').notNull().$type<ActivityEntry['payload']>(),
		/** When it happened, which is not when the row was inserted. */
		occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),

		// Exactly one of the five is set. A new entity with history costs a column
		// and a term in the CHECK; at four principal entities that is cheap, and it
		// buys a foreign key per target that a polymorphic `record_type` cannot.
		assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'cascade' }),
		/** Column now, foreign key with the table in #8. */
		ticketId: uuid('ticket_id'),
		/** Column now, foreign key with the table in #10. */
		taskId: uuid('task_id'),
		/** Column now, foreign key with the table in #10. */
		projectId: uuid('project_id'),
		personId: uuid('person_id').references(() => people.id, { onDelete: 'cascade' }),

		...timestamps
	},
	(table) => [
		/**
		 * A sum of casts rather than a chain of `OR`s: it says "exactly one",
		 * which rejects two targets as well as none, where
		 * `a is not null or b is not null` accepts both set.
		 *
		 * Derived from `ACTIVITY_TARGETS` so the five names are spelled once.
		 * Indexing `table` by those keys is what makes the list honest: a name
		 * added to it without a matching column fails to compile here, rather
		 * than producing a constraint over a column that does not exist.
		 */
		check(
			'activity_exactly_one_target',
			sql`${sql.join(
				ACTIVITY_TARGETS.map((column) => sql`(${table[column]} is not null)::int`),
				sql` + `
			)} = 1`
		),
		// A timeline is always "this record, newest first", so the index carries the
		// sort column: without it every timeline is a sequential scan plus a sort.
		index('activity_asset_occurred').on(table.assetId, table.occurredAt),
		index('activity_person_occurred').on(table.personId, table.occurredAt),
		index('activity_org_occurred').on(table.organisationId, table.occurredAt)
	]
);

export type ActivityRow = typeof activity.$inferSelect;
