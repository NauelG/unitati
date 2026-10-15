import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { userRole, users } from '../auth/schema';
import { organisations } from '../directory/schema';
import { timestamps } from '../shared/columns';

/**
 * Service accounts (ADR 0022): organisation-owned principals with a product role
 * and no person, so an integration outlives the employee who set it up.
 *
 * **Disabled, never deleted.** The activity they wrote names them as its actor;
 * deleting the row would orphan or cascade that history.
 */
export const serviceAccounts = pgTable(
	'service_accounts',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		role: userRole('role').notNull(),
		/** Who set it up. The account does not depend on them: it survives their deletion. */
		createdByUserId: text('created_by_user_id').references(() => users.id, {
			onDelete: 'set null'
		}),
		/** While set, every key of the account answers 401. */
		disabledAt: timestamp('disabled_at', { withTimezone: true }),
		...timestamps
	},
	(table) => [
		uniqueIndex('service_accounts_org_name').on(table.organisationId, sql`lower(${table.name})`),
		// An unattended admin-equivalent credential is the worst possible leak.
		check('service_accounts_not_admin', sql`${table.role} <> 'admin'`)
	]
);

export type ServiceAccount = typeof serviceAccounts.$inferSelect;

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
		/** A personal key dies with its credential. Null for a service-account key. */
		ownerUserId: text('owner_user_id').references(() => users.id, { onDelete: 'cascade' }),
		/** Set instead of the owner for a service-account key. Accounts are never deleted. */
		serviceAccountId: uuid('service_account_id').references(() => serviceAccounts.id, {
			onDelete: 'restrict'
		}),
		/** Equal to the owner for a personal key; the admin who issued it for a service account's. */
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
		index('api_keys_service_account').on(table.serviceAccountId),
		// A principal (a user or a service account) cannot have two active keys with the same name.
		uniqueIndex('api_keys_owner_active_name')
			.on(
				sql`coalesce(${table.ownerUserId}, ${table.serviceAccountId}::text)`,
				sql`lower(${table.name})`
			)
			.where(sql`${table.revokedAt} is null`),
		check(
			'api_keys_exactly_one_principal',
			sql`num_nonnulls(${table.ownerUserId}, ${table.serviceAccountId}) = 1`
		),
		check('api_keys_scopes_not_empty', sql`cardinality(${table.scopes}) > 0`)
	]
);

export type ApiKey = typeof apiKeys.$inferSelect;
