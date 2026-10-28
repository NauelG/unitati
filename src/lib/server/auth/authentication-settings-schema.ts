import { sql } from 'drizzle-orm';
import { boolean, check, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { organisations } from '../directory/schema';
import { timestamps } from '../shared/columns';

/**
 * Kept out of `schema.ts` on purpose: `directory/schema.ts` imports `users`
 * from there, so a foreign key to `organisations` in the same file would close
 * a runtime import cycle (ADR 0048 rule 7). `db/schema.ts` re-exports both.
 */

/**
 * What an admin tunes about sign-in (ADR 0056), 1:1 with `organisations`. A
 * missing row means every default: nothing is created on setup.
 */
export const authenticationSettings = pgTable(
	'authentication_settings',
	{
		organisationId: uuid('organisation_id')
			.primaryKey()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		buttonLabel: text('button_label'),
		jitProvisioning: boolean('jit_provisioning').notNull().default(false),
		ssoRequired: boolean('sso_required').notNull().default(false),
		autoRedirect: boolean('auto_redirect').notNull().default(false),
		...timestamps
	},
	(table) => [
		check(
			'authentication_settings_auto_redirect_needs_required',
			sql`not ${table.autoRedirect} or ${table.ssoRequired}`
		)
	]
);
