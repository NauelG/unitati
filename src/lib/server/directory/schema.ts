import { relations, sql } from 'drizzle-orm';
import {
	boolean,
	check,
	index,
	pgTable,
	primaryKey,
	text,
	unique,
	uuid
} from 'drizzle-orm/pg-core';
import { timestamps } from '../shared/columns';
import { users } from '../auth/schema';

const PRODUCT_NAME_BACKSTOP = 400;

/**
 * The directory: who exists, where they sit, and which of them can sign in.
 * Every other domain depends on this one (ADR 0002).
 *
 * `organisation` is the tenancy boundary (ADR 0004). Exactly one row is used
 * today; the column exists on every aggregate root so the second one is an
 * insert rather than a migration.
 */

export const organisations = pgTable('organisations', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	slug: text('slug').notNull().unique(),
	...timestamps
});

/**
 * The organisation's brand (ADR 0026), 1:1 with `organisations`. No row means the
 * default brand: it is created on first save, never on setup.
 *
 * The `CHECK` counts code points with `char_length`, so it is only a backstop;
 * the 40-grapheme rule (what a person counts as a character) lives in the domain.
 * One grapheme can be many code points (a ZWJ emoji is five), so the bound is
 * deliberately loose: it must never refuse a name the domain accepted.
 */
export const organisationBranding = pgTable(
	'organisation_branding',
	{
		organisationId: uuid('organisation_id')
			.primaryKey()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		productName: text('product_name').notNull(),
		...timestamps
	},
	(table) => [
		check(
			'organisation_branding_product_name_length',
			sql`char_length(btrim(${table.productName})) between 1 and ${sql.raw(String(PRODUCT_NAME_BACKSTOP))}`
		)
	]
);

export const departments = pgTable(
	'departments',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		...timestamps
	},
	// Scoped by organisation, never global: two tenants may both have "Soporte".
	(table) => [unique('departments_org_name').on(table.organisationId, table.name)]
);

export const locations = pgTable(
	'locations',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		...timestamps
	},
	(table) => [unique('locations_org_name').on(table.organisationId, table.name)]
);

export const teams = pgTable(
	'teams',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		...timestamps
	},
	(table) => [unique('teams_org_name').on(table.organisationId, table.name)]
);

/**
 * A person in the directory. `userId` is nullable on purpose: an employee can
 * hold equipment and appear in the directory without ever signing in, which is
 * the normal case in asset management, not the exception.
 */
export const people = pgTable(
	'people',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.unique()
			.references(() => users.id, { onDelete: 'set null' }),
		fullName: text('full_name').notNull(),
		email: text('email').notNull(),
		departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
		locationId: uuid('location_id').references(() => locations.id, { onDelete: 'set null' }),
		/** Leavers stay in the directory so their asset and ticket history survives. */
		active: boolean('active').notNull().default(true),
		...timestamps
	},
	(table) => [
		unique('people_org_email').on(table.organisationId, table.email),
		index('people_org_idx').on(table.organisationId)
	]
);

export const teamMembers = pgTable(
	'team_members',
	{
		teamId: uuid('team_id')
			.notNull()
			.references(() => teams.id, { onDelete: 'cascade' }),
		personId: uuid('person_id')
			.notNull()
			.references(() => people.id, { onDelete: 'cascade' }),
		...timestamps
	},
	(table) => [primaryKey({ columns: [table.teamId, table.personId] })]
);

export const peopleRelations = relations(people, ({ one, many }) => ({
	organisation: one(organisations, {
		fields: [people.organisationId],
		references: [organisations.id]
	}),
	user: one(users, { fields: [people.userId], references: [users.id] }),
	department: one(departments, {
		fields: [people.departmentId],
		references: [departments.id]
	}),
	location: one(locations, { fields: [people.locationId], references: [locations.id] }),
	teams: many(teamMembers)
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
	team: one(teams, { fields: [teamMembers.teamId], references: [teams.id] }),
	person: one(people, { fields: [teamMembers.personId], references: [people.id] })
}));

export type Organisation = typeof organisations.$inferSelect;
export type OrganisationBranding = typeof organisationBranding.$inferSelect;
export type NewOrganisationBranding = typeof organisationBranding.$inferInsert;
export type Person = typeof people.$inferSelect;
export type Department = typeof departments.$inferSelect;
export type Location = typeof locations.$inferSelect;
export type Team = typeof teams.$inferSelect;
