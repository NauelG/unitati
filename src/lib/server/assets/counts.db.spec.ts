import { describe, expect, it } from 'vitest';
import {
	createAsset,
	createCatalogue,
	createOrganisation,
	createPerson,
	createViewer,
	createViewerWithoutPerson
} from './testing/fixtures';
import { assetSummary, countActive } from './index';

describe('countActive', () => {
	it('counts only the requested organisation’s non-retired assets', async () => {
		const acme = await createOrganisation('Acme', 'acme-counts');
		const globex = await createOrganisation('Globex', 'globex-counts');
		const acmeCatalogue = await createCatalogue(acme.id);
		const globexCatalogue = await createCatalogue(globex.id);

		await createAsset(acme.id, acmeCatalogue.modelId, { state: 'in_use' });
		await createAsset(acme.id, acmeCatalogue.modelId, { state: 'in_stock' });
		await createAsset(acme.id, acmeCatalogue.modelId, { state: 'retired' });
		await createAsset(globex.id, globexCatalogue.modelId, { state: 'in_use' });

		expect(await countActive(acme.id)).toBe(2);
		expect(await countActive(globex.id)).toBe(1);
	});

	it('returns zero for an organisation with no assets', async () => {
		const acme = await createOrganisation('Acme', 'acme-counts-empty');
		expect(await countActive(acme.id)).toBe(0);
	});
});

describe('assetSummary', () => {
	it('counts total, in-service and unassigned for a whole-inventory viewer, scoped to the organisation', async () => {
		const acme = await createOrganisation('Acme', 'acme-summary');
		const globex = await createOrganisation('Globex', 'globex-summary');
		const acmeCatalogue = await createCatalogue(acme.id);
		const globexCatalogue = await createCatalogue(globex.id);
		const acmeTechnician = await createViewer(acme.id, 'technician');
		const custodian = await createPerson(acme.id, 'Grace Hopper');

		await createAsset(acme.id, acmeCatalogue.modelId, {
			state: 'in_use',
			custodianPersonId: custodian.id
		});
		await createAsset(acme.id, acmeCatalogue.modelId, { state: 'in_stock' });
		await createAsset(acme.id, acmeCatalogue.modelId, { state: 'retired' });
		await createAsset(globex.id, globexCatalogue.modelId, { state: 'in_use' });

		expect(await assetSummary(acmeTechnician)).toEqual({ total: 3, inService: 1, unassigned: 2 });
	});

	it('narrows to the viewer’s own and shared assets when they hold no whole-inventory permission', async () => {
		const acme = await createOrganisation('Acme', 'acme-summary-scoped');
		const catalogue = await createCatalogue(acme.id);
		const employee = await createViewer(acme.id, 'employee');
		const other = await createPerson(acme.id, 'Alan Turing');

		await createAsset(acme.id, catalogue.modelId, {
			state: 'in_use',
			custodianPersonId: employee.personId
		});
		await createAsset(acme.id, catalogue.modelId, { state: 'in_stock', shared: true });
		await createAsset(acme.id, catalogue.modelId, { state: 'in_use', custodianPersonId: other.id });

		expect(await assetSummary(employee)).toEqual({ total: 2, inService: 1, unassigned: 1 });
	});

	it('returns zeros for an employee with no directory record', async () => {
		const acme = await createOrganisation('Acme', 'acme-summary-no-person');
		const catalogue = await createCatalogue(acme.id);
		const employee = await createViewerWithoutPerson(acme.id, 'employee');

		await createAsset(acme.id, catalogue.modelId, { state: 'in_use', shared: true });

		expect(await assetSummary(employee)).toEqual({ total: 1, inService: 1, unassigned: 1 });
	});
});
