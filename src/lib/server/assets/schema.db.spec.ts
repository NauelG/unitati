import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from '../db';
import { refusalFrom } from '../db/testing/refusal';
import { assetModels, assets, manufacturers } from './schema';
import { createAsset, createCatalogue, createOrganisation, createPerson } from './testing/fixtures';

/**
 * The guarantees that belong to the database rather than to a domain function.
 *
 * Every one of these is asserted by the **constraint name** Postgres reports,
 * not by `rejects.toThrow()`. "Something threw" is satisfied by a typo in the
 * test; `assets_org_serial` is satisfied only by the partial unique index that
 * the acceptance criterion is actually about.
 */

/** The lexemes of a `tsvector`, without their positions, sorted. */
function lexemes(vector: string): string[] {
	return [...vector.matchAll(/'([^']+)'/g)].map((match) => match[1]).sort();
}

describe('assets.serial', () => {
	it('lets two assets in one organisation both have no serial', async () => {
		const organisation = await createOrganisation();
		const { modelId } = await createCatalogue(organisation.id);

		await createAsset(organisation.id, modelId, { assetTag: 'AST-A', serial: null });
		await createAsset(organisation.id, modelId, { assetTag: 'AST-B', serial: null });

		const stored = await getDb()
			.select({ serial: assets.serial })
			.from(assets)
			.where(eq(assets.organisationId, organisation.id));

		expect(stored).toEqual([{ serial: null }, { serial: null }]);
	});

	it('refuses two assets with the same serial in one organisation', async () => {
		const organisation = await createOrganisation();
		const { modelId } = await createCatalogue(organisation.id);
		await createAsset(organisation.id, modelId, { assetTag: 'AST-A', serial: 'C02X1234' });

		const refusal = await refusalFrom(
			createAsset(organisation.id, modelId, { assetTag: 'AST-B', serial: 'C02X1234' })
		);

		expect(refusal).toEqual({ code: '23505', constraint: 'assets_org_serial' });
	});

	/** Scoped by organisation, never global (ADR 0004): two tenants may each own
	 * a machine whose manufacturer stamped the same number on it. */
	it('allows the same serial in two different organisations', async () => {
		const acme = await createOrganisation('Acme', 'acme');
		const globex = await createOrganisation('Globex', 'globex');
		const { modelId: acmeModel } = await createCatalogue(acme.id);
		const { modelId: globexModel } = await createCatalogue(globex.id);

		await createAsset(acme.id, acmeModel, { assetTag: 'AST-A', serial: 'C02X1234' });

		const refusal = await refusalFrom(
			createAsset(globex.id, globexModel, { assetTag: 'AST-A', serial: 'C02X1234' })
		);

		expect(refusal).toBeNull();
	});
});

describe('assets.asset_tag', () => {
	it('refuses a rename onto a tag another asset in the organisation holds', async () => {
		const organisation = await createOrganisation();
		const { modelId } = await createCatalogue(organisation.id);
		await createAsset(organisation.id, modelId, { assetTag: 'AST-0001' });
		const second = await createAsset(organisation.id, modelId, { assetTag: 'AST-0002' });

		const refusal = await refusalFrom(
			getDb().update(assets).set({ assetTag: 'AST-0001' }).where(eq(assets.id, second.id))
		);

		expect(refusal).toEqual({ code: '23505', constraint: 'assets_org_tag' });
	});

	it('generates AST- followed by four padded digits', async () => {
		const organisation = await createOrganisation();
		const { modelId } = await createCatalogue(organisation.id);

		const generated = await createAsset(organisation.id, modelId);

		expect(generated.assetTag).toMatch(/^AST-\d{4,}$/);
	});

	/**
	 * Asserted as a step rather than as `AST-0001`, deliberately.
	 * `asset_code_seq` is a standalone sequence, not one owned by an identity
	 * column, so the harness never resets it (ADR 0032): the absolute value
	 * depends on how many tests ran first, and asserting it would make this spec
	 * fail on its position in a shuffled run.
	 */
	it('takes the next number from the sequence for each asset', async () => {
		const organisation = await createOrganisation();
		const { modelId } = await createCatalogue(organisation.id);

		const first = await createAsset(organisation.id, modelId);
		const second = await createAsset(organisation.id, modelId);

		const numberOf = (tag: string) => Number(tag.replace('AST-', ''));

		expect(numberOf(second.assetTag) - numberOf(first.assetTag)).toBe(1);
	});

	it('accepts an explicit tag, because the generated one is only a default', async () => {
		const organisation = await createOrganisation();
		const { modelId } = await createCatalogue(organisation.id);

		const imported = await createAsset(organisation.id, modelId, { assetTag: 'LEGACY-42' });

		expect(imported.assetTag).toBe('LEGACY-42');
	});
});

/**
 * The acceptance criterion that the two axes do not constrain each other: an
 * asset can be `in_use` with nobody holding it (the floor printer) and
 * `in_stock` while somebody does (a spare in a technician's drawer).
 */
describe('state and custody are orthogonal', () => {
	it('stores in_use with no custodian and in_stock with one', async () => {
		const organisation = await createOrganisation();
		const { modelId } = await createCatalogue(organisation.id);
		const person = await createPerson(organisation.id, 'Alan Turing');

		await createAsset(organisation.id, modelId, {
			assetTag: 'AST-PRINTER',
			state: 'in_use',
			custodianPersonId: null
		});
		await createAsset(organisation.id, modelId, {
			assetTag: 'AST-SPARE',
			state: 'in_stock',
			custodianPersonId: person.id
		});

		const stored = await getDb()
			.select({ tag: assets.assetTag, state: assets.state, custodian: assets.custodianPersonId })
			.from(assets)
			.where(eq(assets.organisationId, organisation.id))
			.orderBy(assets.assetTag);

		expect(stored).toEqual([
			{ tag: 'AST-PRINTER', state: 'in_use', custodian: null },
			{ tag: 'AST-SPARE', state: 'in_stock', custodian: person.id }
		]);
	});
});

describe('the catalogue chain', () => {
	it('refuses an asset with no model', async () => {
		const organisation = await createOrganisation();

		const refusal = await refusalFrom(
			getDb()
				.insert(assets)
				// The column is `not null`, so this is the database's own refusal and
				// not the Zod schema's. Both gates are tested; this is the lower one.
				.values({ organisationId: organisation.id, name: 'A laptop', assetModelId: null! })
		);

		expect(refusal?.code).toBe('23502');
	});

	/** `restrict`, not `set null`: a model with no manufacturer would put every
	 * report into a growing "unclassified" bucket. */
	it('refuses to delete a manufacturer a model still points at', async () => {
		const organisation = await createOrganisation();
		const { manufacturerId } = await createCatalogue(organisation.id);

		const refusal = await refusalFrom(
			getDb().delete(manufacturers).where(eq(manufacturers.id, manufacturerId))
		);

		expect(refusal?.code).toBe('23503');
	});

	it('lets one manufacturer carry the same model name for two organisations', async () => {
		const acme = await createOrganisation('Acme', 'acme');
		const globex = await createOrganisation('Globex', 'globex');

		await createCatalogue(acme.id, 'ThinkPad X1');
		const refusal = await refusalFrom(createCatalogue(globex.id, 'ThinkPad X1'));

		expect(refusal).toBeNull();
	});
});

/**
 * The generated `tsvector` columns, asserted on their stored value rather than
 * through a query. `simple` + `unaccent` means lowercased, accent-stripped
 * lexemes and no stemming — "MacBook" survives as `macbook`, which a Spanish
 * dictionary would mangle.
 */
describe('the generated search columns', () => {
	it('strips accents and case from a model name', async () => {
		const organisation = await createOrganisation();
		const { modelId } = await createCatalogue(organisation.id, 'MacBook Pró');

		const [stored] = await getDb()
			.select({ search: assetModels.search })
			.from(assetModels)
			.where(eq(assetModels.id, modelId));

		expect(stored.search).toBe("'macbook':1 'pro':2");
	});

	/**
	 * Note `ast` and `-7001` as two lexemes rather than one `ast-7001`: the
	 * `simple` parser splits a word from a following number. It costs nothing,
	 * because `plainto_tsquery` splits a searched tag the same way and the two
	 * halves are then `AND`ed — which the search specs prove end to end.
	 */
	it('covers an asset’s name, tag and serial', async () => {
		const organisation = await createOrganisation();
		const { modelId } = await createCatalogue(organisation.id);
		const asset = await createAsset(organisation.id, modelId, {
			assetTag: 'AST-7001',
			name: 'Portàtil',
			serial: 'C02X1234'
		});

		const [stored] = await getDb()
			.select({ search: assets.search })
			.from(assets)
			.where(eq(assets.id, asset.id));

		expect(lexemes(stored.search)).toEqual(['-7001', 'ast', 'c02x1234', 'portatil']);
	});

	it('follows a rename, because the column is generated and not written', async () => {
		const organisation = await createOrganisation();
		const { modelId } = await createCatalogue(organisation.id);
		const asset = await createAsset(organisation.id, modelId, {
			assetTag: 'AST-7002',
			name: 'Portàtil',
			serial: null
		});

		await getDb().update(assets).set({ name: 'Sobretaula' }).where(eq(assets.id, asset.id));

		const [stored] = await getDb()
			.select({ search: assets.search })
			.from(assets)
			.where(eq(assets.id, asset.id));

		expect(lexemes(stored.search)).toEqual(['-7002', 'ast', 'sobretaula']);
	});
});
