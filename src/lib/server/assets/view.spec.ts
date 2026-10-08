import { describe, expect, it } from 'vitest';
import type { UserRole } from '../auth/schema';
import type { SessionUser } from '../auth/guards';
import { viewAsset, type FullAssetView } from './view';

/**
 * The redaction rule on its own, with no database in the way. The companion
 * `redaction.db.spec.ts` proves the *query* returns the right rows; this proves
 * the *projection* keeps the right fields, which is the half that decides what
 * reaches a browser.
 */

const viewer = (role: UserRole, personId: string | null = 'person-1'): SessionUser => ({
	id: 'user-1',
	name: 'Ada Lovelace',
	email: 'ada@acme.test',
	role,
	organisationId: 'org-1',
	personId
});

const row = (overrides: Partial<FullAssetView> = {}): FullAssetView => ({
	visibility: 'full',
	id: 'asset-1',
	assetTag: 'AST-0001',
	name: 'Floor printer',
	serial: 'SER-1',
	state: 'in_use',
	shared: true,
	modelName: 'LaserJet',
	manufacturerName: 'HP',
	categoryName: 'Printers',
	custodianPersonId: null,
	custodianName: null,
	locationId: 'location-1',
	locationName: 'Planta 2',
	...overrides
});

describe('viewAsset', () => {
	it('hands an admin the whole row', () => {
		expect(viewAsset(row(), viewer('admin'))).toEqual(expect.objectContaining({ serial: 'SER-1' }));
	});

	it('hands a technician the whole row', () => {
		expect(viewAsset(row(), viewer('technician'))).toEqual(
			expect.objectContaining({ visibility: 'full', serial: 'SER-1' })
		);
	});

	/**
	 * Asserted as an exact object rather than field by field. A
	 * `not.toHaveProperty('serial')` passes for every field nobody thought to
	 * name — `cost`, `purchasedAt`, `notes` — whereas this fails the moment any
	 * of them is added to the projection.
	 */
	it('reduces a shared asset to name, location and identifier for an employee', () => {
		expect(viewAsset(row(), viewer('employee'))).toEqual({
			visibility: 'shared',
			assetTag: 'AST-0001',
			name: 'Floor printer',
			locationName: 'Planta 2'
		});
	});

	it('hands an employee their own asset in full', () => {
		const mine = row({ custodianPersonId: 'person-1', custodianName: 'Ada Lovelace' });

		expect(viewAsset(mine, viewer('employee'))).toEqual(
			expect.objectContaining({ visibility: 'full', serial: 'SER-1' })
		);
	});

	/**
	 * A credential with no directory record has `personId === null`, and an asset
	 * in nobody's custody has `custodianPersonId === null`. `null === null` is
	 * true, so a bare equality check would call every unheld asset "mine" and
	 * hand over its serial.
	 */
	it('does not treat an unheld asset as the own asset of a viewer with no person', () => {
		const unheld = row({ custodianPersonId: null });

		expect(viewAsset(unheld, viewer('employee', null))).toEqual({
			visibility: 'shared',
			assetTag: 'AST-0001',
			name: 'Floor printer',
			locationName: 'Planta 2'
		});
	});

	it('still redacts when the asset is not shared and not theirs', () => {
		const somebodyElses = row({ shared: false, custodianPersonId: 'person-2' });

		expect(viewAsset(somebodyElses, viewer('employee')).visibility).toBe('shared');
	});

	it('reports a shared asset with no location as having none', () => {
		const nowhere = row({ locationId: null, locationName: null });

		expect(viewAsset(nowhere, viewer('employee'))).toEqual({
			visibility: 'shared',
			assetTag: 'AST-0001',
			name: 'Floor printer',
			locationName: null
		});
	});
});
