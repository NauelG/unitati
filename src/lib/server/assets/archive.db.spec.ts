import { describe, expect, it } from 'vitest';
import {
	archiveAsset,
	assetStateDistribution,
	assetSummary,
	assetTimeline,
	assignCustody,
	changeState,
	countActive,
	getAssetByTag,
	listAssets,
	registerAsset,
	unarchiveAsset
} from '.';
import {
	createAsset,
	createCatalogue,
	createOrganisation,
	createPerson,
	createViewer
} from './testing/fixtures';

/**
 * Archiving is for an asset that should never have been registered. It is not
 * `retired`: that is a state of an asset that existed and left service.
 */

async function workspace() {
	const organisation = await createOrganisation();
	const { modelId } = await createCatalogue(organisation.id);
	const technician = await createViewer(organisation.id, 'technician', 'Grace Hopper');
	const registered = await registerAsset(technician, { name: 'A typo', assetModelId: modelId });
	if (!registered.ok) throw new Error(registered.error);
	return { organisation, modelId, technician, asset: registered.value };
}

describe('archiveAsset', () => {
	it('hides the asset from lists, counts and the state distribution', async () => {
		const { organisation, modelId, technician, asset } = await workspace();
		await createAsset(organisation.id, modelId, { name: 'Kept' });

		expect((await archiveAsset(technician, asset.id)).ok).toBe(true);

		const page = await listAssets(technician, {});
		expect(page.rows.map((row) => row.assetTag)).not.toContain(asset.assetTag);
		expect((await assetSummary(technician)).total).toBe(1);
		expect(await countActive(organisation.id)).toBe(1);
		expect((await assetStateDistribution(technician)).reduce((n, s) => n + s.count, 0)).toBe(1);
	});

	it('still opens by its tag, so it can be restored', async () => {
		const { technician, asset } = await workspace();
		await archiveAsset(technician, asset.id);

		const opened = await getAssetByTag(technician, asset.assetTag);

		expect(opened.ok && opened.value.visibility === 'full' && opened.value.archivedAt).toBeTruthy();
	});

	it('writes one asset.archived entry and nothing when repeated', async () => {
		const { technician, asset } = await workspace();

		await archiveAsset(technician, asset.id);
		await archiveAsset(technician, asset.id);

		const timeline = await assetTimeline(technician, asset.assetTag);
		expect(timeline.ok ? timeline.value.map((entry) => entry.verb) : []).toEqual([
			'asset.archived',
			'asset.created'
		]);
	});

	it('refuses an asset somebody holds', async () => {
		const { organisation, technician, asset } = await workspace();
		const ada = await createPerson(organisation.id, 'Ada Lovelace');
		await assignCustody(technician, asset.id, ada.id);

		expect(await archiveAsset(technician, asset.id)).toEqual({
			ok: false,
			error: 'has_history'
		});
	});

	it('refuses writes on an archived asset as if it were gone', async () => {
		const { organisation, technician, asset } = await workspace();
		const ada = await createPerson(organisation.id, 'Ada Lovelace');
		await archiveAsset(technician, asset.id);

		expect(await changeState(technician, asset.id, 'in_repair')).toEqual({
			ok: false,
			error: 'asset_not_found'
		});
		expect(await assignCustody(technician, asset.id, ada.id)).toEqual({
			ok: false,
			error: 'asset_not_found'
		});
	});

	it("does not reach another organisation's asset", async () => {
		const { asset } = await workspace();
		const other = await createOrganisation('Other', 'other');
		const outsider = await createViewer(other.id, 'technician', 'Mallory');

		expect(await archiveAsset(outsider, asset.id)).toEqual({
			ok: false,
			error: 'asset_not_found'
		});
	});
});

describe('unarchiveAsset', () => {
	it('brings the asset back with its state and records it', async () => {
		const { technician, asset } = await workspace();
		await archiveAsset(technician, asset.id);

		expect((await unarchiveAsset(technician, asset.id)).ok).toBe(true);

		const page = await listAssets(technician, {});
		expect(page.rows.map((row) => row.assetTag)).toContain(asset.assetTag);
		const timeline = await assetTimeline(technician, asset.assetTag);
		expect(timeline.ok ? timeline.value.map((entry) => entry.verb) : []).toEqual([
			'asset.unarchived',
			'asset.archived',
			'asset.created'
		]);
	});
});
