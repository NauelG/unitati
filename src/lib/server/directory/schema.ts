import { relations, sql, type SQL } from 'drizzle-orm';
import {
	boolean,
	check,
	customType,
	doublePrecision,
	foreignKey,
	index,
	integer,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	unique,
	uuid,
	type AnyPgColumn
} from 'drizzle-orm/pg-core';
import { timestamps } from '../shared/columns';
import { searchVector, tsvector } from '../shared/search-vector';
import { users } from '../auth/schema';
import { BRAND_ASSET_SLOTS } from '#lib/domain/brand.js';

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
		/** Lowercase `#rrggbb`; `NULL` keeps Unitati's own tokens (#160). */
		brandColor: text('brand_color'),
		...timestamps
	},
	(table) => [
		check('organisation_branding_brand_color_hex', sql`${table.brandColor} ~ '^#[0-9a-f]{6}$'`),
		check(
			'organisation_branding_product_name_length',
			sql`char_length(btrim(${table.productName})) between 1 and ${sql.raw(String(PRODUCT_NAME_BACKSTOP))}`
		)
	]
);

/**
 * Postgres `bytea`. The installed drizzle-orm does not export one, so this maps it
 * to the `Uint8Array` the image module produces; the driver hands back a `Buffer`.
 */
const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
	dataType: () => 'bytea',
	toDriver: (value) => Buffer.from(value),
	fromDriver: (value) => new Uint8Array(value)
});

export const brandAssetSlot = pgEnum('brand_asset_slot', BRAND_ASSET_SLOTS);

/** Backstop for `MAX_OUTPUT_BYTES` in `branding/image.ts`; the domain refuses earlier. */
const BRAND_ASSET_MAX_BYTES = 262_144;

/**
 * The processed brand images (ADR 0026, #161): only the output of the image
 * pipeline is stored, never the original. The FK points at the branding row, not
 * the organisation, so restoring the default brand (#163) cascades every image
 * and an image can never exist without its branding.
 */
export const organisationBrandAssets = pgTable(
	'organisation_brand_assets',
	{
		organisationId: uuid('organisation_id').notNull(),
		slot: brandAssetSlot('slot').notNull(),
		contentType: text('content_type').notNull(),
		data: bytea('data').notNull(),
		sha256: text('sha256').notNull(),
		width: integer('width'),
		height: integer('height'),
		...timestamps
	},
	(table) => [
		primaryKey({ columns: [table.organisationId, table.slot] }),
		// Named by hand: the generated name is longer than Postgres's 63 characters.
		foreignKey({
			name: 'organisation_brand_assets_branding_fk',
			columns: [table.organisationId],
			foreignColumns: [organisationBranding.organisationId]
		}).onDelete('cascade'),
		check(
			'organisation_brand_assets_content_type',
			sql`${table.contentType} in ('image/svg+xml', 'image/webp', 'image/png')`
		),
		check(
			'organisation_brand_assets_data_size',
			sql`octet_length(${table.data}) <= ${sql.raw(String(BRAND_ASSET_MAX_BYTES))}`
		),
		check('organisation_brand_assets_sha256', sql`${table.sha256} ~ '^[0-9a-f]{64}$'`)
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

/**
 * A place, nested: a building contains floors, a floor contains rooms. No
 * "type" column (ADR 0027) — depth is the only structure, and the path
 * (`Barcelona office › Floor 1`) is what a person reads.
 *
 * `parentId` is `restrict`: deleting a node that still has children is refused
 * rather than silently orphaning or cascading a subtree.
 */
export const locations = pgTable(
	'locations',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		parentId: uuid('parent_id').references((): AnyPgColumn => locations.id, {
			onDelete: 'restrict'
		}),
		name: text('name').notNull(),
		code: text('code'),
		address: text('address'),
		notes: text('notes'),
		latitude: doublePrecision('latitude'),
		longitude: doublePrecision('longitude'),
		...timestamps
	},
	(table) => [
		// Siblings are unique by name; two roots are siblings, hence NULLS NOT DISTINCT.
		unique('locations_org_parent_name')
			.on(table.organisationId, table.parentId, table.name)
			.nullsNotDistinct(),
		// Nulls distinct: many locations may have no code at all.
		unique('locations_org_code').on(table.organisationId, table.code),
		check(
			'locations_coordinates',
			sql`(${table.latitude} IS NULL) = (${table.longitude} IS NULL) AND (${table.latitude} IS NULL OR ${table.latitude} BETWEEN -90 AND 90) AND (${table.longitude} IS NULL OR ${table.longitude} BETWEEN -180 AND 180)`
		),
		check(
			'locations_not_own_parent',
			sql`${table.parentId} IS NULL OR ${table.parentId} <> ${table.id}`
		),
		index('locations_org_parent_idx').on(table.organisationId, table.parentId)
	]
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
		/**
		 * `simple` and `unaccent`, like the asset vectors: a name and an email are
		 * not prose, and stemming "Serra" produces rubbish (#12). Declared here, beside
		 * the table, as every other domain does; global search only reads it.
		 */
		search: tsvector('search')
			.notNull()
			.generatedAlwaysAs((): SQL =>
				searchVector('simple', `coalesce("full_name", '') || ' ' || coalesce("email", '')`)
			),
		...timestamps
	},
	(table) => [
		unique('people_org_email').on(table.organisationId, table.email),
		index('people_org_idx').on(table.organisationId),
		index('people_search_gin').using('gin', table.search)
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
