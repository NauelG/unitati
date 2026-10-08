import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from '../db';
import {
	createAssetModel,
	createCategory,
	createManufacturer,
	deleteAssetModel,
	deleteCategory,
	deleteManufacturer,
	listAssetModels,
	listCategories,
	listManufacturers,
	registerAsset,
	renameCategory,
	renameManufacturer,
	updateAssetModel,
	updateAssetDetails
} from '.';
import {
	createAsset,
	createCatalogue,
	createLocation,
	createOrganisation,
	createViewer
} from './testing/fixtures';
import { assets } from './schema';

/**
 * What a catalogue screen needs beyond creating and listing: renaming, and
 * deleting with an honest answer when `restrict` refuses.
 *
 * The cross-organisation cases are here because these functions take ids that
 * arrive from a form. A `<select>` only offers the viewer's own rows, but a form
 * is whatever the browser sends, and a foreign key does not know about tenancy.
 */

async function workspace() {
	const organisation = await createOrganisation();
	const technician = await createViewer(organisation.id, 'technician', 'Grace Hopper');
	return { organisation, technician };
}

describe('renaming', () => {
	it('renames a manufacturer and a category', async () => {
		const { organisation, technician } = await workspace();
		const { manufacturerId, categoryId } = await createCatalogue(organisation.id);

		expect(await renameManufacturer(technician, manufacturerId, { name: 'Apple Inc.' })).toEqual({
			ok: true,
			value: undefined
		});
		expect(await renameCategory(technician, categoryId, { name: 'Portátiles' })).toEqual({
			ok: true,
			value: undefined
		});

		expect((await listManufacturers(organisation.id)).map((row) => row.name)).toEqual([
			'Apple Inc.'
		]);
		expect((await listCategories(organisation.id)).map((row) => row.name)).toEqual(['Portátiles']);
	});

	it('refuses a name another entry already holds in the organisation', async () => {
		const { organisation, technician } = await workspace();
		await createCatalogue(organisation.id, 'MacBook Pró', 'Apple', 'Laptops');
		const { manufacturerId } = await createCatalogue(organisation.id, 'ThinkPad', 'Lenovo', 'PCs');

		expect(await renameManufacturer(technician, manufacturerId, { name: 'Apple' })).toEqual({
			ok: false,
			error: 'duplicate_name'
		});
	});

	it('reports an unknown id instead of pretending it worked', async () => {
		const { technician } = await workspace();

		expect(await renameCategory(technician, crypto.randomUUID(), { name: 'Anything' })).toEqual({
			ok: false,
			error: 'not_found'
		});
	});

	it("does not reach into another organisation's catalogue", async () => {
		const { technician } = await workspace();
		const globex = await createOrganisation('Globex', 'globex');
		const { manufacturerId } = await createCatalogue(globex.id);

		expect(await renameManufacturer(technician, manufacturerId, { name: 'Hijacked' })).toEqual({
			ok: false,
			error: 'not_found'
		});
		expect((await listManufacturers(globex.id)).map((row) => row.name)).toEqual(['Apple']);
	});

	it('moves a model to another manufacturer and category', async () => {
		const { organisation, technician } = await workspace();
		const { modelId } = await createCatalogue(organisation.id);
		const dell = await createManufacturer(technician, { name: 'Dell' });
		const monitors = await createCategory(technician, { name: 'Monitors' });
		if (!dell.ok || !monitors.ok) throw new Error('fixture failed');

		const outcome = await updateAssetModel(technician, modelId, {
			name: 'UltraSharp',
			manufacturerId: dell.value.id,
			categoryId: monitors.value.id
		});

		expect(outcome.ok).toBe(true);
		const [model] = await listAssetModels(organisation.id);
		expect(model).toMatchObject({
			name: 'UltraSharp',
			manufacturerName: 'Dell',
			categoryName: 'Monitors'
		});
	});
});

describe('deleting', () => {
	it('deletes an entry nothing refers to', async () => {
		const { organisation, technician } = await workspace();
		const created = await createManufacturer(technician, { name: 'Unused' });
		if (!created.ok) throw new Error('fixture failed');

		expect(await deleteManufacturer(technician, created.value.id)).toEqual({
			ok: true,
			value: undefined
		});
		expect(await listManufacturers(organisation.id)).toEqual([]);
	});

	it('refuses to delete a manufacturer or a category a model still uses', async () => {
		const { organisation, technician } = await workspace();
		const { manufacturerId, categoryId } = await createCatalogue(organisation.id);

		expect(await deleteManufacturer(technician, manufacturerId)).toEqual({
			ok: false,
			error: 'in_use'
		});
		expect(await deleteCategory(technician, categoryId)).toEqual({ ok: false, error: 'in_use' });
		expect(await listManufacturers(organisation.id)).toHaveLength(1);
	});

	it('refuses to delete a model an asset still uses, and allows it once it is gone', async () => {
		const { organisation, technician } = await workspace();
		const { modelId } = await createCatalogue(organisation.id);
		const asset = await createAsset(organisation.id, modelId);

		expect(await deleteAssetModel(technician, modelId)).toEqual({ ok: false, error: 'in_use' });

		await getDb().delete(assets).where(eq(assets.id, asset.id));

		expect(await deleteAssetModel(technician, modelId)).toEqual({ ok: true, value: undefined });
	});

	it("does not delete another organisation's entry", async () => {
		const { technician } = await workspace();
		const globex = await createOrganisation('Globex', 'globex');
		const { categoryId } = await createCatalogue(globex.id);

		expect(await deleteCategory(technician, categoryId)).toEqual({ ok: false, error: 'not_found' });
		expect(await listCategories(globex.id)).toHaveLength(1);
	});
});

describe('references that arrive from a form', () => {
	it("refuses a model built from another organisation's manufacturer or category", async () => {
		const { organisation, technician } = await workspace();
		const own = await createCatalogue(organisation.id);
		const globex = await createOrganisation('Globex', 'globex');
		const foreign = await createCatalogue(globex.id, 'Foreign', 'Globex Corp', 'Gadgets');

		expect(
			await createAssetModel(technician, {
				name: 'Sneaky',
				manufacturerId: foreign.manufacturerId,
				categoryId: own.categoryId
			})
		).toEqual({ ok: false, error: 'manufacturer_not_found' });

		expect(
			await createAssetModel(technician, {
				name: 'Sneaky',
				manufacturerId: own.manufacturerId,
				categoryId: foreign.categoryId
			})
		).toEqual({ ok: false, error: 'category_not_found' });

		expect(
			await updateAssetModel(technician, own.modelId, {
				name: 'Sneaky',
				manufacturerId: foreign.manufacturerId,
				categoryId: own.categoryId
			})
		).toEqual({ ok: false, error: 'manufacturer_not_found' });
	});

	it("refuses to register an asset against another organisation's model or location", async () => {
		const { organisation, technician } = await workspace();
		const own = await createCatalogue(organisation.id);
		const globex = await createOrganisation('Globex', 'globex');
		const foreign = await createCatalogue(globex.id);
		const foreignLocation = await createLocation(globex.id, 'Secret vault');

		expect(
			await registerAsset(technician, { name: 'Laptop', assetModelId: foreign.modelId })
		).toEqual({ ok: false, error: 'model_not_found' });

		expect(
			await registerAsset(technician, {
				name: 'Laptop',
				assetModelId: own.modelId,
				locationId: foreignLocation.id
			})
		).toEqual({ ok: false, error: 'location_not_found' });
	});

	it('applies the same rule when an edit changes the model', async () => {
		const { organisation, technician } = await workspace();
		const own = await createCatalogue(organisation.id);
		const globex = await createOrganisation('Globex', 'globex');
		const foreign = await createCatalogue(globex.id);
		const asset = await createAsset(organisation.id, own.modelId);

		expect(
			await updateAssetDetails(technician, asset.id, { assetModelId: foreign.modelId })
		).toEqual({ ok: false, error: 'model_not_found' });
	});
});
