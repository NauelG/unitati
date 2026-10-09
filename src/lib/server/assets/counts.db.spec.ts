import { describe, expect, it } from 'vitest';
import { createAsset, createCatalogue, createOrganisation } from './testing/fixtures';
import { countActive } from './index';

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
