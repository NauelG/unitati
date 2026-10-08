import { createInsertSchema } from 'drizzle-zod';
import type { z } from 'zod';
import { assetModels, assets, categories, manufacturers } from './schema';

/**
 * Input validation generated **from** the Drizzle tables, so a column added to
 * `schema.ts` cannot leave a stale validator behind. `sveltekit-superforms`
 * takes these through its Zod adapter, which is what makes the browser and the
 * server agree without the rules being written twice.
 *
 * What the generator gets right on its own, verified rather than assumed:
 * `asset_model_id` is `not null` with no default, so it comes out **required** —
 * which is the acceptance criterion "creating an asset without a model is
 * rejected before it reaches the database". The `search` columns are
 * `GENERATED ALWAYS` and are excluded automatically; the `state` enum is
 * narrowed to the four keys.
 *
 * What it does not do is constrain text length: a `text not null` column yields
 * `z.string()`, and `''` satisfies it. Every user-facing name is refined below,
 * because a nameless manufacturer passes the database and ruins every screen
 * that lists one.
 */

/** Trimmed, and then non-empty: `'   '` is not a name. */
const nonEmpty = (schema: z.ZodString) => schema.trim().min(1);

/**
 * `organisation_id` is omitted from every input schema on purpose (ADR 0004).
 * The tenancy scope comes from the session, never from the payload — a form
 * that can name its own organisation is a form that can write into another one.
 * `id` and the timestamps are omitted for the same reason: the database owns
 * them.
 */
const notTheCaller = { id: true, organisationId: true, createdAt: true, updatedAt: true } as const;

export const manufacturerInput = createInsertSchema(manufacturers, { name: nonEmpty }).omit(
	notTheCaller
);

export const categoryInput = createInsertSchema(categories, { name: nonEmpty }).omit(notTheCaller);

export const assetModelInput = createInsertSchema(assetModels, { name: nonEmpty }).omit(
	notTheCaller
);

/**
 * The refinements re-declare their own optionality, which looks redundant and
 * is not. `drizzle-zod` hands the callback the *base* column schema and keeps
 * the `optional`/`nullable` wrapper at runtime — but the type it infers takes
 * the callback's return type as the whole field, so a refined `asset_tag` comes
 * out as a **required** `string` in TypeScript while still accepting
 * `undefined` when parsed. Callers then have to pass a tag the database is
 * perfectly happy to generate. Saying `.optional()` here realigns the inferred
 * type with the behaviour; the double wrapper is harmless.
 */
export const registerAssetInput = createInsertSchema(assets, {
	name: nonEmpty,
	// Editable from the start (ADR 0010): the generated `AST-####` is a default,
	// not a constant, so an explicit tag is accepted — it just may not be blank.
	assetTag: (schema) => nonEmpty(schema).optional(),
	// Nullable in the table and nullable here. The refinement only bites on a
	// string, so "no serial" stays expressible while `''` cannot sneak in as a
	// serial that the partial unique index would then treat as a real value.
	serial: (schema) => nonEmpty(schema).nullish()
}).omit(notTheCaller);

/**
 * The fields an edit corrects without anything having *happened*: a typo in a
 * name, a serial read off the wrong sticker, a model picked wrongly. State,
 * custody and location are deliberately absent — those are events, and they go
 * through the functions that write their verb into the activity log.
 */
export const updateAssetDetailsInput = registerAssetInput
	.pick({ name: true, assetTag: true, serial: true, assetModelId: true, shared: true })
	.partial();

export type ManufacturerInput = z.infer<typeof manufacturerInput>;
export type CategoryInput = z.infer<typeof categoryInput>;
export type AssetModelInput = z.infer<typeof assetModelInput>;
export type RegisterAssetInput = z.infer<typeof registerAssetInput>;
export type UpdateAssetDetailsInput = z.infer<typeof updateAssetDetailsInput>;
