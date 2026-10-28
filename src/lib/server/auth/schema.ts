import { sql } from 'drizzle-orm';
import { boolean, check, pgTable, pgEnum, text, timestamp } from 'drizzle-orm/pg-core';
import { timestamps } from '../shared/columns';

/**
 * Better Auth's four tables, plus the role that authorisation reads
 * (see ADR 0007). Shapes are dictated by the adapter; only `role` is ours.
 *
 * A `user` is a credential — the ability to sign in. The person it belongs to
 * lives in `directory.person`, which can exist without one: an employee can
 * hold a laptop and never log in.
 */

export const userRole = pgEnum('user_role', ['admin', 'technician', 'employee']);

export const users = pgTable('users', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: boolean('email_verified').notNull().default(false),
	image: text('image'),
	/** Product constant, never user-authored (ADR 0007). */
	role: userRole('role').notNull().default('employee'),
	/** True after a grant or a reset, until the user picks their own password (#230). */
	mustChangePassword: boolean('must_change_password').notNull().default(false),
	...timestamps
});

export const SESSION_AUTH_METHODS = ['password', 'sso'] as const;
export type SessionAuthMethod = (typeof SESSION_AUTH_METHODS)[number];

export const sessions = pgTable(
	'sessions',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		token: text('token').notNull().unique(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		/**
		 * How the session was opened (ADR 0056). Drives the 12-hour, never-refreshed
		 * lifetime of an SSO session and the revocation when SSO becomes required.
		 */
		authMethod: text('auth_method').notNull().default('password'),
		...timestamps
	},
	(table) => [check('sessions_auth_method', sql`${table.authMethod} in ('password', 'sso')`)]
);

export const authAccounts = pgTable('auth_accounts', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	accountId: text('account_id').notNull(),
	providerId: text('provider_id').notNull(),
	accessToken: text('access_token'),
	refreshToken: text('refresh_token'),
	idToken: text('id_token'),
	accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
	refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
	scope: text('scope'),
	/** Hashed by Better Auth; never read by application code. */
	password: text('password'),
	...timestamps
});

export const verifications = pgTable('verifications', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	...timestamps
});

/**
 * The `@better-auth/sso` plugin's own table. The provider is registered
 * statically from the environment, so no row is ever read or written today;
 * the plugin still declares the model, and the adapter needs it mapped.
 */
export const ssoProviders = pgTable('sso_providers', {
	id: text('id').primaryKey(),
	issuer: text('issuer').notNull(),
	oidcConfig: text('oidc_config'),
	samlConfig: text('saml_config'),
	userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
	providerId: text('provider_id').notNull().unique(),
	organizationId: text('organization_id'),
	domain: text('domain').notNull()
});

export type UserRole = (typeof userRole.enumValues)[number];
