import { describe, expect, it } from 'vitest';
import { ASSET_STATES } from '#lib/domain/status.js';
import {
	createAsset,
	createCatalogue,
	createOrganisation,
	createPerson,
	createViewer
} from './testing/fixtures';
import { assetStateDistribution } from './state-distribution';

describe('assetStateDistribution', () => {
	it('counts each state, scoped to the organisation', async () => {
		const acme = await createOrganisation('Acme', 'acme-dist');
		const globex = await createOrganisation('Globex', 'globex-dist');
		const acmeCatalogue = await createCatalogue(acme.id);
		const globexCatalogue = await createCatalogue(globex.id);
		const viewer = await createViewer(acme.id, 'technician');

		await createAsset(acme.id, acmeCatalogue.modelId, { state: 'in_use' });
		await createAsset(acme.id, acmeCatalogue.modelId, { state: 'in_use' });
		await createAsset(acme.id, acmeCatalogue.modelId, { state: 'in_repair' });
		await createAsset(acme.id, acmeCatalogue.modelId, { state: 'retired' });
		await createAsset(globex.id, globexCatalogue.modelId, { state: 'in_use' });

		expect(await assetStateDistribution(viewer)).toEqual([
			{ state: 'in_use', count: 2 },
			{ state: 'in_repair', count: 1 },
			{ state: 'in_stock', count: 0 },
			{ state: 'retired', count: 1 }
		]);
	});

	it('always returns every state, in the domain vocabulary’s order', async () => {
		const acme = await createOrganisation('Acme', 'acme-dist-order');
		const catalogue = await createCatalogue(acme.id);
		const viewer = await createViewer(acme.id, 'technician');

		await createAsset(acme.id, catalogue.modelId, { state: 'retired' });

		const slices = await assetStateDistribution(viewer);

		// The order is asserted against `ASSET_STATES` rather than a literal: the
		// donut's slice colours follow this sequence, so a `group by` free to
		// return its groups in any order would reshuffle the chart between loads.
		expect(slices.map((slice) => slice.state)).toEqual([...ASSET_STATES]);
	});

	it('returns all four states at zero on a fresh install', async () => {
		const acme = await createOrganisation('Acme', 'acme-dist-empty');
		const viewer = await createViewer(acme.id, 'technician');

		const slices = await assetStateDistribution(viewer);

		// Not an empty array: the component needs the vocabulary present to draw
		// its "no data" ring, and a disappearing legend is the failure this guards.
		expect(slices).toHaveLength(ASSET_STATES.length);
		expect(slices.every((slice) => slice.count === 0)).toBe(true);
	});

	it('narrows to the viewer’s own and shared rows', async () => {
		const acme = await createOrganisation('Acme', 'acme-dist-scoped');
		const catalogue = await createCatalogue(acme.id);
		const employee = await createViewer(acme.id, 'employee');
		const other = await createPerson(acme.id, 'Grace Hopper');

		await createAsset(acme.id, catalogue.modelId, {
			state: 'in_use',
			custodianPersonId: employee.personId
		});
		await createAsset(acme.id, catalogue.modelId, { state: 'in_stock', shared: true });
		await createAsset(acme.id, catalogue.modelId, {
			state: 'in_repair',
			custodianPersonId: other.id
		});

		const slices = await assetStateDistribution(employee);
		const byState = Object.fromEntries(slices.map((slice) => [slice.state, slice.count]));

		expect(byState).toEqual({ in_use: 1, in_repair: 0, in_stock: 1, retired: 0 });
	});
});
