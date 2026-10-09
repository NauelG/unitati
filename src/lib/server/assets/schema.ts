import { sql, type SQL } from 'drizzle-orm';
import {
	boolean,
	index,
	pgEnum,
	pgSequence,
	pgTable,
	text,
	unique,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { ASSET_STATES } from '#lib/domain/status.js';
import { timestamps } from '../shared/columns';
import { searchVector as sharedSearchVector, tsvector } from '../shared/search-vector';
import { locations, organisations, people } from '../directory/schema';

/**
 * The inventory: what exists, what model it is, who holds it and where it sits.
 *
 * The catalogue hangs off the **model**, not off the asset: a manufacturer and
 * a category belong to "MacBook Pro 14", not to each of the forty of them. That
 * is why `asset_model_id` is `not null` — an asset with no model is an asset no
 * report can group.
 *
 * Foreign keys into `directory` are legitimate; that domain states every other
 * one depends on it (ADR 0002). Nothing here points at `service-desk` or
 * `projects`: those relate through `links` (ADR 0005).
 */

/**
 * `simple` and `unaccent`, never the Spanish dictionary. Model names, serials,
 * asset tags and people's names are not prose — stemming "MacBook" or "Serra"
 * produces rubbish. `unaccent` because nobody types accents into a search box.
 * #8 uses `spanish` for ticket subjects and comment bodies, which *are* prose:
 * the choice is per field, not per database.
 *
 * `immutable_unaccent` is a wrapper the migration creates, not `unaccent`
 * itself: `unaccent(text)` is `STABLE`, because it depends on a dictionary that
 * could be reloaded, and Postgres refuses a non-immutable expression in a
 * generated column — `ERROR: generation expression is not immutable`. The
 * wrapper pins the dictionary and declares the result immutable, which is what
 * makes the whole approach possible.
 *
 * Written with bare column names rather than Drizzle column references on
 * purpose: Drizzle renders a reference as `"assets"."name"`, and Postgres
 * rejects a qualified name inside a generated-column expression.
 */
const searchVector = (expression: string): SQL => sharedSearchVector('simple', expression);

/** `AST-####` comes from here (ADR 0010). One sequence per entity type. */
export const assetCodeSequence = pgSequence('asset_code_seq');

/**
 * Orthogonal to custody: a laptop can be `in_stock` and still in someone's
 * drawer, and the floor printer is `in_use` with no custodian at all.
 *
 * Built **from** `ASSET_STATES` rather than restating the four strings. That
 * file exists precisely so this enum is not the third copy of the vocabulary
 * (ADR 0011): `StatusBadge` renders these keys and `activity`'s `state.changed`
 * payload validates against them, so a drift here is a drift everywhere.
 *
 * `checked_out` is deliberately absent: nothing in the MVP could set it, and
 * reservations are #40.
 */
export const assetState = pgEnum('asset_state', ASSET_STATES);

export const manufacturers = pgTable(
	'manufacturers',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		...timestamps
	},
	// Scoped by organisation, never global (ADR 0004).
	(table) => [unique('manufacturers_org_name').on(table.organisationId, table.name)]
);

/**
 * Flat, deliberately: **no `parent_id`**. Nested category trees are where ITAM
 * user interfaces die — `docs/alternatives.md` concludes GLPI's is unusable day
 * to day, and it ships 623 classes. Nesting is #41's problem if it is ever
 * anyone's.
 */
export const categories = pgTable(
	'categories',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		...timestamps
	},
	(table) => [unique('categories_org_name').on(table.organisationId, table.name)]
);

export const assetModels = pgTable(
	'asset_models',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		/**
		 * `restrict`, not `set null`: a model with no manufacturer would put every
		 * report into a growing "unclassified" bucket, and the delete that caused
		 * it would look like it succeeded.
		 */
		manufacturerId: uuid('manufacturer_id')
			.notNull()
			.references(() => manufacturers.id, { onDelete: 'restrict' }),
		categoryId: uuid('category_id')
			.notNull()
			.references(() => categories.id, { onDelete: 'restrict' }),
		search: tsvector('search')
			.notNull()
			.generatedAlwaysAs((): SQL => searchVector(`coalesce("name", '')`)),
		...timestamps
	},
	(table) => [
		// Two manufacturers may both sell a "ThinkPad X1"; one manufacturer may not
		// have the model twice.
		unique('asset_models_org_manufacturer_name').on(
			table.organisationId,
			table.manufacturerId,
			table.name
		),
		index('asset_models_search_gin').using('gin', table.search)
	]
);

export const assets = pgTable(
	'assets',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		/**
		 * Generated, and then editable: the default is a starting value, not a
		 * constant (ADR 0010). #21 imports tags an organisation has used for years
		 * and already stuck on the hardware, and a system that overrides those
		 * calls a machine by a name its label does not carry.
		 */
		assetTag: text('asset_tag')
			.notNull()
			.default(sql`'AST-' || lpad(nextval('asset_code_seq')::text, 4, '0')`),
		name: text('name').notNull(),
		/**
		 * Nullable, and unique only when present. Plenty of equipment has no
		 * serial, so a plain unique constraint would allow exactly one of it —
		 * `NULL` is not equal to `NULL` in a unique index, but the partial index
		 * below says what is meant instead of relying on that.
		 */
		serial: text('serial'),
		assetModelId: uuid('asset_model_id')
			.notNull()
			.references(() => assetModels.id, { onDelete: 'restrict' }),
		state: assetState('state').notNull().default('in_stock'),
		/**
		 * The present tense of custody. The past is `activity`, which is why this
		 * is one column and not a history table (ADR 0009).
		 *
		 * `set null`: a leaver's assets stay in the inventory and fall to nobody.
		 */
		custodianPersonId: uuid('custodian_person_id').references(() => people.id, {
			onDelete: 'set null'
		}),
		/**
		 * Explicit, never derived from "has no custodian". The floor printer is
		 * shared because somebody said so; a laptop between two owners is not.
		 * This flag is what `assets.view.shared` reads (ADR 0007).
		 */
		shared: boolean('shared').notNull().default(false),
		/** The asset's own location, not its custodian's: #24 audits rooms. */
		locationId: uuid('location_id').references(() => locations.id, { onDelete: 'set null' }),
		/** Tag and serial are in here too: people search for what is on the sticker. */
		search: tsvector('search')
			.notNull()
			.generatedAlwaysAs((): SQL =>
				searchVector(
					`coalesce("name", '') || ' ' || coalesce("asset_tag", '') || ' ' || coalesce("serial", '')`
				)
			),
		/**
		 * The same vector over **only the fields a shared view exposes**, for
		 * viewers who may not see the whole row.
		 *
		 * A second column rather than a cleverer `WHERE`, because a `tsvector`
		 * cannot be matched field by field: searching `search` searches the serial.
		 * Without this column, an employee granted the name and location of the
		 * floor printer could type its serial into the search box and read the
		 * answer off whether the row came back — field-level redaction with an
		 * unredacted oracle behind it. You may search exactly what you may see.
		 */
		searchShared: tsvector('search_shared')
			.notNull()
			.generatedAlwaysAs((): SQL =>
				searchVector(`coalesce("name", '') || ' ' || coalesce("asset_tag", '')`)
			),
		...timestamps
	},
	(table) => [
		unique('assets_org_tag').on(table.organisationId, table.assetTag),
		/**
		 * Partial, so two assets without a serial coexist and two with the same
		 * one do not. The predicate uses a bare quoted column name because a
		 * `CREATE INDEX` predicate cannot carry a table qualifier.
		 */
		uniqueIndex('assets_org_serial')
			.on(table.organisationId, table.serial)
			.where(sql.raw(`"serial" is not null`)),
		index('assets_org_idx').on(table.organisationId),
		/** The employee scope filters on this column on every list request. */
		index('assets_custodian_idx').on(table.custodianPersonId),
		index('assets_model_idx').on(table.assetModelId),
		index('assets_search_gin').using('gin', table.search),
		index('assets_search_shared_gin').using('gin', table.searchShared)
	]
);

export type Manufacturer = typeof manufacturers.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type AssetModel = typeof assetModels.$inferSelect;
export type Asset = typeof assets.$inferSelect;
