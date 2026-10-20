import { describe, expect, it } from 'vitest';
import { listAssetsByTags } from './index';
import { createAsset, createCatalogue, createOrganisation, createViewer } from './testing/fixtures';

describe('listAssetsByTags', () => {
	it('returns tag and name in the order asked, only for what the viewer may see', async () => {
		const organisation = await createOrganisation();
		const eva = await createViewer(organisation.id, 'employee', 'Eva Employee');
		const technician = await createViewer(organisation.id, 'technician', 'Tess Technician');
		const { modelId } = await createCatalogue(organisation.id, 'ThinkPad', 'Lenovo', 'Laptops');
		await createAsset(organisation.id, modelId, {
			name: 'Eva laptop',
			assetTag: 'AST-0001',
			custodianPersonId: eva.personId
		});
		await createAsset(organisation.id, modelId, { name: 'Nobody laptop', assetTag: 'AST-0002' });

		const tags = ['AST-0002', 'AST-0001', 'AST-9999'];
		expect(await listAssetsByTags(technician, tags)).toEqual([
			{ assetTag: 'AST-0002', name: 'Nobody laptop' },
			{ assetTag: 'AST-0001', name: 'Eva laptop' }
		]);
		expect(await listAssetsByTags(eva, tags)).toEqual([
			{ assetTag: 'AST-0001', name: 'Eva laptop' }
		]);
		expect(await listAssetsByTags(eva, [])).toEqual([]);
	});
});
