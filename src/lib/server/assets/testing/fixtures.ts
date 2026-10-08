import { getDb } from '../../db';
import { users, type UserRole } from '../../auth/schema';
import { locations, organisations, people } from '../../directory/schema';
import type { SessionUser } from '../../auth/guards';
import { assetModels, assets, categories, manufacturers } from '../schema';

/**
 * Row builders for the database specs: the catalogue chain an asset needs
 * before it can exist at all (manufacturer → category → model → asset), plus
 * the signed-in viewer the permission scope is resolved against.
 *
 * They live under `assets/` because this domain owns the chain. The `activity`
 * specs import them too, which adds no dependency edge that is not already
 * there: `activity/schema.ts` carries a foreign key to `assets` (ADR 0009), so
 * an activity row about an asset cannot be written without one.
 */

export async function createOrganisation(name = 'Acme', slug = 'acme') {
	const [organisation] = await getDb().insert(organisations).values({ name, slug }).returning();
	return organisation;
}

export async function createLocation(organisationId: string, name: string) {
	const [location] = await getDb().insert(locations).values({ organisationId, name }).returning();
	return location;
}

/** A directory record with no credential: the normal case in asset management. */
export async function createPerson(organisationId: string, fullName: string, email?: string) {
	const [person] = await getDb()
		.insert(people)
		.values({
			organisationId,
			fullName,
			email: email ?? `${fullName.toLowerCase().replace(/\s+/g, '.')}@acme.test`
		})
		.returning();
	return person;
}

/**
 * A person plus the credential that signs in as them, returned as the
 * `SessionUser` the domain functions take. The role is what the permission
 * scope reads (ADR 0007).
 */
export async function createViewer(
	organisationId: string,
	role: UserRole,
	fullName = 'Ada Lovelace'
): Promise<SessionUser> {
	const email = `${fullName.toLowerCase().replace(/\s+/g, '.')}@acme.test`;
	const id = crypto.randomUUID();

	await getDb().insert(users).values({ id, name: fullName, email, role });
	const [person] = await getDb()
		.insert(people)
		.values({ organisationId, userId: id, fullName, email })
		.returning();

	return { id, name: fullName, email, role, organisationId, personId: person.id };
}

/**
 * A viewer with no directory record. `personId` is null, which is the case that
 * turns "the assets in my custody" into "every asset in nobody's custody"
 * unless the scope drops the clause rather than comparing against null.
 */
export async function createViewerWithoutPerson(
	organisationId: string,
	role: UserRole
): Promise<SessionUser> {
	const id = crypto.randomUUID();
	const email = `${id}@acme.test`;

	await getDb().insert(users).values({ id, name: 'No Person', email, role });

	return { id, name: 'No Person', email, role, organisationId, personId: null };
}

export interface CatalogueFixture {
	manufacturerId: string;
	categoryId: string;
	modelId: string;
}

export async function createCatalogue(
	organisationId: string,
	modelName = 'MacBook Pró',
	manufacturerName = 'Apple',
	categoryName = 'Laptops'
): Promise<CatalogueFixture> {
	const [manufacturer] = await getDb()
		.insert(manufacturers)
		.values({ organisationId, name: manufacturerName })
		.returning();

	const [category] = await getDb()
		.insert(categories)
		.values({ organisationId, name: categoryName })
		.returning();

	const [model] = await getDb()
		.insert(assetModels)
		.values({
			organisationId,
			name: modelName,
			manufacturerId: manufacturer.id,
			categoryId: category.id
		})
		.returning();

	return { manufacturerId: manufacturer.id, categoryId: category.id, modelId: model.id };
}

type AssetOverrides = Partial<typeof assets.$inferInsert>;

/** Inserts straight into the table, bypassing the domain function on purpose:
 * a schema test should not depend on the domain layer agreeing with it. */
export async function createAsset(
	organisationId: string,
	modelId: string,
	overrides: AssetOverrides = {}
) {
	const [asset] = await getDb()
		.insert(assets)
		.values({
			organisationId,
			assetModelId: modelId,
			name: 'A laptop',
			...overrides
		})
		.returning();
	return asset;
}
