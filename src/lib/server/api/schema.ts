import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from '../auth/schema';
import { organisations } from '../directory/schema';
import { timestamps } from '../shared/columns';

/**
 * API keys (ADR 0022). Owned by `api` rather than `auth`: `auth` keeps only
 * Better Auth's tables, and `directory` already imports `auth`, so a key (which
 * points at an organisation) living there would close a cycle.
 *
 * **No plaintext, ever.** `key_hash` is the SHA-256 hex of the whole key and is
 * what a request is looked up by; `start` is the first characters after the
 * prefix, kept so a person can tell their keys apart.
 *
 * `scopes` is a `text[]` validated against `PERMISSIONS` by Zod, not a database
 * enum: a new permission then needs no migration. The `CHECK` is the one rule
 * the database does enforce, because a key that may do nothing is a bug.
 */
export const apiKeys = pgTable(
	'api_keys',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		/** The key dies with its credential. */
		ownerUserId: text('owner_user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		/** Equal to the owner for a personal key; differs for service accounts. */
		createdByUserId: text('created_by_user_id').references(() => users.id, {
			onDelete: 'set null'
		}),
		name: text('name').notNull(),
		start: text('start').notNull(),
		keyHash: text('key_hash').notNull().unique(),
		scopes: text('scopes').array().notNull(),
		/** `null` means it never expires. */
		expiresAt: timestamp('expires_at', { withTimezone: true }),
		/** Throttled to once a minute, so a read is not a write. */
		lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
		/** Soft revocation: the row stays for traceability. */
		revokedAt: timestamp('revoked_at', { withTimezone: true }),
		...timestamps
	},
	(table) => [
		index('api_keys_org_owner').on(table.organisationId, table.ownerUserId),
		// An owner cannot have two active keys with the same name.
		uniqueIndex('api_keys_owner_active_name')
			.on(table.ownerUserId, sql`lower(${table.name})`)
			.where(sql`${table.revokedAt} is null`),
		check('api_keys_scopes_not_empty', sql`cardinality(${table.scopes}) > 0`)
	]
);

export type ApiKey = typeof apiKeys.$inferSelect;
