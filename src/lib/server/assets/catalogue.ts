import { asc, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { uniqueConstraintName } from '../db/errors';
import type { SessionUser } from '../auth/guards';
import { failure, success, type Outcome } from '../shared/outcome';
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
 * **Create and list only.** Renaming and deleting a catalogue entry arrive with
 * the screens that offer them (PR 3 of #7), because the interesting part of a
 * delete is what the user is told when `restrict` refuses it, and that sentence
 * belongs with the form that shows it.
 */

/**
 * Every catalogue insert fails the same way — a name already taken in this
 * organisation — so the mapping from a unique violation to that outcome is
 * written once. The insert itself stays at each call site, because that is the
 * part that genuinely differs; wrapping the three tables behind one generic
 * would trade real duplication for a type parameter nobody can read.
 */
async function catalogued<Row>(
	insert: () => Promise<Row[]>
): Promise<Outcome<Row, CatalogueFailure>> {
	try {
		const [row] = await insert();
		return success(row);
	} catch (error) {
		if (uniqueConstraintName(error) !== null) return failure('duplicate_name');
		throw error;
	}
}

export type CatalogueFailure = 'duplicate_name';

export interface CatalogueEntry {
	id: string;
	name: string;
}

export function createManufacturer(
	actor: SessionUser,
	input: ManufacturerInput
): Promise<Outcome<{ id: string }, CatalogueFailure>> {
	return catalogued(() =>
		getDb()
			.insert(manufacturers)
			.values({ ...input, organisationId: actor.organisationId })
			.returning({ id: manufacturers.id })
	);
}

export function createCategory(
	actor: SessionUser,
	input: CategoryInput
): Promise<Outcome<{ id: string }, CatalogueFailure>> {
	return catalogued(() =>
		getDb()
			.insert(categories)
			.values({ ...input, organisationId: actor.organisationId })
			.returning({ id: categories.id })
	);
}

export function createAssetModel(
	actor: SessionUser,
	input: AssetModelInput
): Promise<Outcome<{ id: string }, CatalogueFailure>> {
	return catalogued(() =>
		getDb()
			.insert(assetModels)
			.values({ ...input, organisationId: actor.organisationId })
			.returning({ id: assetModels.id })
	);
}

/**
 * The listings take an `organisationId` rather than a `SessionUser`, following
 * `directory.listPeople`: a catalogue is not redacted, so there is nothing for
 * a viewer's role to decide and nothing but the tenancy scope to inject.
 */
export function listManufacturers(organisationId: string): Promise<CatalogueEntry[]> {
	return getDb()
		.select({ id: manufacturers.id, name: manufacturers.name })
		.from(manufacturers)
		.where(eq(manufacturers.organisationId, organisationId))
		.orderBy(asc(manufacturers.name));
}

export function listCategories(organisationId: string): Promise<CatalogueEntry[]> {
	return getDb()
		.select({ id: categories.id, name: categories.name })
		.from(categories)
		.where(eq(categories.organisationId, organisationId))
		.orderBy(asc(categories.name));
}

export interface AssetModelEntry extends CatalogueEntry {
	manufacturerName: string;
	categoryName: string;
}

export function listAssetModels(organisationId: string): Promise<AssetModelEntry[]> {
	return getDb()
		.select({
			id: assetModels.id,
			name: assetModels.name,
			manufacturerName: manufacturers.name,
			categoryName: categories.name
		})
		.from(assetModels)
		.innerJoin(manufacturers, eq(assetModels.manufacturerId, manufacturers.id))
		.innerJoin(categories, eq(assetModels.categoryId, categories.id))
		.where(eq(assetModels.organisationId, organisationId))
		.orderBy(asc(manufacturers.name), asc(assetModels.name));
}
