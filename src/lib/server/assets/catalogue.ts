import { and, asc, eq } from 'drizzle-orm';
import { getDb, type Executor } from '../db';
import { constraintViolation, uniqueConstraintName } from '../db/errors';
import type { SessionUser } from '../auth/guards';
import { failure, success, type Outcome } from '../shared/outcome';
import type { WriteOptions } from '../shared/write-options';
import { assetModels, categories, manufacturers } from './schema';
import type { AssetModelInput, CategoryInput, ManufacturerInput } from './validation';

/**
 * The catalogue an asset is described by: manufacturers, categories, and the
 * models that join the two.
 *
 * Its own file rather than part of `index.ts`, because it changes for its own
 * reasons. An asset's lifecycle — custody, state, location, the activity it
 * writes — has nothing to say about whether "Lenovo" exists, and the two were
 * only ever adjacent.
 *
 * Editing and deleting live here too. The interesting part of a delete is what
 * the user is told when `restrict` refuses it, so that refusal is a typed
 * `in_use` outcome rather than a 500 for the route to guess at.
 */

/**
 * Every catalogue insert fails the same way — a name already taken in this
 * organisation — so the mapping from a unique violation to that outcome is
 * written once. The insert itself stays at each call site, because that is the
 * part that genuinely differs; wrapping the three tables behind one generic
 * would trade real duplication for a type parameter nobody can read.
 */
async function catalogued<Row>(
	executor: Executor,
	insert: (tx: Executor) => Promise<Row[]>
): Promise<Outcome<Row, CatalogueFailure>> {
	try {
		// A transaction of its own (a savepoint under an import's): the unique
		// violation is caught *outside* it, so only the insert is rolled back and
		// the caller's transaction stays usable.
		return await executor.transaction(async (tx) => {
			const [row] = await insert(tx);
			return success(row);
		});
	} catch (error) {
		if (uniqueConstraintName(error) !== null) return failure('duplicate_name');
		throw error;
	}
}

export type CatalogueFailure = 'duplicate_name';
export type CatalogueEditFailure = CatalogueFailure | 'not_found';
/** `in_use` is `restrict` speaking: something still points at the entry. */
export type CatalogueDeleteFailure = 'not_found' | 'in_use';
/**
 * A model joins two other entries, and both arrive as ids from a form. A foreign
 * key proves the row exists, not that it is *yours*: `manufacturers.id` is a
 * global uuid, so without this check a crafted form could hang a model off
 * another organisation's manufacturer and read its name back from the listing.
 */
export type AssetModelFailure = CatalogueFailure | 'manufacturer_not_found' | 'category_not_found';
export type AssetModelEditFailure = AssetModelFailure | 'not_found';

export interface CatalogueEntry {
	id: string;
	name: string;
}

/** Same shape as `catalogued`, for an update: a unique violation or no row. */
async function edited(
	update: () => Promise<{ id: string }[]>
): Promise<Outcome<void, CatalogueEditFailure>> {
	try {
		const rows = await update();
		return rows.length === 0 ? failure('not_found') : success(undefined);
	} catch (error) {
		if (uniqueConstraintName(error) !== null) return failure('duplicate_name');
		throw error;
	}
}

/**
 * `23503` is the foreign-key class. Anything else is not "in use" and must keep
 * propagating: reporting a dropped connection as "a model still uses this" would
 * send somebody hunting for a model that does not exist.
 */
async function removed(
	remove: () => Promise<{ id: string }[]>
): Promise<Outcome<void, CatalogueDeleteFailure>> {
	try {
		const rows = await remove();
		return rows.length === 0 ? failure('not_found') : success(undefined);
	} catch (error) {
		if (constraintViolation(error)?.code === '23503') return failure('in_use');
		throw error;
	}
}

async function modelReferences(
	organisationId: string,
	input: AssetModelInput,
	executor: Executor = getDb()
): Promise<'manufacturer_not_found' | 'category_not_found' | null> {
	const [manufacturer] = await executor
		.select({ id: manufacturers.id })
		.from(manufacturers)
		.where(
			and(
				eq(manufacturers.id, input.manufacturerId),
				eq(manufacturers.organisationId, organisationId)
			)
		)
		.limit(1);
	if (!manufacturer) return 'manufacturer_not_found';

	const [category] = await executor
		.select({ id: categories.id })
		.from(categories)
		.where(and(eq(categories.id, input.categoryId), eq(categories.organisationId, organisationId)))
		.limit(1);
	return category ? null : 'category_not_found';
}

export function createManufacturer(
	actor: SessionUser,
	input: ManufacturerInput,
	options: WriteOptions = {}
): Promise<Outcome<{ id: string }, CatalogueFailure>> {
	return catalogued(options.executor ?? getDb(), (tx) =>
		tx
			.insert(manufacturers)
			.values({ ...input, organisationId: actor.organisationId })
			.returning({ id: manufacturers.id })
	);
}

export function createCategory(
	actor: SessionUser,
	input: CategoryInput,
	options: WriteOptions = {}
): Promise<Outcome<{ id: string }, CatalogueFailure>> {
	return catalogued(options.executor ?? getDb(), (tx) =>
		tx
			.insert(categories)
			.values({ ...input, organisationId: actor.organisationId })
			.returning({ id: categories.id })
	);
}

export async function createAssetModel(
	actor: SessionUser,
	input: AssetModelInput,
	options: WriteOptions = {}
): Promise<Outcome<{ id: string }, AssetModelFailure>> {
	const executor = options.executor ?? getDb();
	const missing = await modelReferences(actor.organisationId, input, executor);
	if (missing) return failure(missing);

	return catalogued(executor, (tx) =>
		tx
			.insert(assetModels)
			.values({ ...input, organisationId: actor.organisationId })
			.returning({ id: assetModels.id })
	);
}

/* -------------------------------------------------------------------------- */
/* Edit and delete                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Every statement below filters on `organisation_id` as well as `id`, so an id
 * from another tenant matches no row and the answer is `not_found` — the same
 * answer as for an id that never existed, which is the point (ADR 0004).
 */

export function renameManufacturer(
	actor: SessionUser,
	id: string,
	input: ManufacturerInput
): Promise<Outcome<void, CatalogueEditFailure>> {
	return edited(() =>
		getDb()
			.update(manufacturers)
			.set({ name: input.name, updatedAt: new Date() })
			.where(and(eq(manufacturers.id, id), eq(manufacturers.organisationId, actor.organisationId)))
			.returning({ id: manufacturers.id })
	);
}

export function renameCategory(
	actor: SessionUser,
	id: string,
	input: CategoryInput
): Promise<Outcome<void, CatalogueEditFailure>> {
	return edited(() =>
		getDb()
			.update(categories)
			.set({ name: input.name, updatedAt: new Date() })
			.where(and(eq(categories.id, id), eq(categories.organisationId, actor.organisationId)))
			.returning({ id: categories.id })
	);
}

export async function updateAssetModel(
	actor: SessionUser,
	id: string,
	input: AssetModelInput
): Promise<Outcome<void, AssetModelEditFailure>> {
	const missing = await modelReferences(actor.organisationId, input);
	if (missing) return failure(missing);

	return edited(() =>
		getDb()
			.update(assetModels)
			.set({
				name: input.name,
				manufacturerId: input.manufacturerId,
				categoryId: input.categoryId,
				updatedAt: new Date()
			})
			.where(and(eq(assetModels.id, id), eq(assetModels.organisationId, actor.organisationId)))
			.returning({ id: assetModels.id })
	);
}

export function deleteManufacturer(
	actor: SessionUser,
	id: string
): Promise<Outcome<void, CatalogueDeleteFailure>> {
	return removed(() =>
		getDb()
			.delete(manufacturers)
			.where(and(eq(manufacturers.id, id), eq(manufacturers.organisationId, actor.organisationId)))
			.returning({ id: manufacturers.id })
	);
}

export function deleteCategory(
	actor: SessionUser,
	id: string
): Promise<Outcome<void, CatalogueDeleteFailure>> {
	return removed(() =>
		getDb()
			.delete(categories)
			.where(and(eq(categories.id, id), eq(categories.organisationId, actor.organisationId)))
			.returning({ id: categories.id })
	);
}

export function deleteAssetModel(
	actor: SessionUser,
	id: string
): Promise<Outcome<void, CatalogueDeleteFailure>> {
	return removed(() =>
		getDb()
			.delete(assetModels)
			.where(and(eq(assetModels.id, id), eq(assetModels.organisationId, actor.organisationId)))
			.returning({ id: assetModels.id })
	);
}

/**
 * The listings take an `organisationId` rather than a `SessionUser`, following
 * `directory.listPeople`: a catalogue is not redacted, so there is nothing for
 * a viewer's role to decide and nothing but the tenancy scope to inject.
 */
export function listManufacturers(
	organisationId: string,
	executor: Executor = getDb()
): Promise<CatalogueEntry[]> {
	return executor
		.select({ id: manufacturers.id, name: manufacturers.name })
		.from(manufacturers)
		.where(eq(manufacturers.organisationId, organisationId))
		.orderBy(asc(manufacturers.name));
}

export interface CategoryEntry extends CatalogueEntry {
	requiresHandover: boolean;
}

export function listCategories(
	organisationId: string,
	executor: Executor = getDb()
): Promise<CategoryEntry[]> {
	return executor
		.select({
			id: categories.id,
			name: categories.name,
			requiresHandover: categories.requiresHandover
		})
		.from(categories)
		.where(eq(categories.organisationId, organisationId))
		.orderBy(asc(categories.name));
}

export interface AssetModelEntry extends CatalogueEntry {
	manufacturerId: string;
	manufacturerName: string;
	categoryId: string;
	categoryName: string;
}

export function listAssetModels(
	organisationId: string,
	executor: Executor = getDb()
): Promise<AssetModelEntry[]> {
	return executor
		.select({
			id: assetModels.id,
			name: assetModels.name,
			manufacturerId: assetModels.manufacturerId,
			manufacturerName: manufacturers.name,
			categoryId: assetModels.categoryId,
			categoryName: categories.name
		})
		.from(assetModels)
		.innerJoin(manufacturers, eq(assetModels.manufacturerId, manufacturers.id))
		.innerJoin(categories, eq(assetModels.categoryId, categories.id))
		.where(eq(assetModels.organisationId, organisationId))
		.orderBy(asc(manufacturers.name), asc(assetModels.name));
}
