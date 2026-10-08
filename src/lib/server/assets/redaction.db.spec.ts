import { describe, expect, it } from 'vitest';
import { listAssets } from '.';
import {
	createAsset,
	createCatalogue,
	createLocation,
	createOrganisation,
	createPerson,
	createViewer,
	createViewerWithoutPerson
} from './testing/fixtures';

/**
 * The acceptance criterion of #7 that is an assertion about data rather than a
 * look at a screen:
 *
 * > An employee signed in with `employee` sees, at `/assets`, **only** their
 * > own assets plus shared ones — and the payload delivered to the browser for
 * > a shared row contains **name and location only**. No cost, no serial, no
 * > custody, no history.
 *
 * It is asserted on what the domain function returns, because that object *is*
 * the payload: the load function serialises it and SvelteKit ships it to the
 * browser. Checking a rendered table would prove that the markup hides a field,
 * not that the field never left the server — and a field in the payload is
 * readable in devtools whatever the markup does.
 *
 * The keys are asserted exhaustively, not individually. `not.toHaveProperty`
 * passes for every field nobody thought to name; `toEqual` on the key set fails
 * the moment a column is added to the projection.
 */

/**
 * **A deliberate deviation from the criterion, recorded rather than hidden.**
 *
 * The issue says the shared payload holds "name and location only". This holds
 * name, location, `visibility` — and `assetTag`, which is a third *field*
 * however it is justified.
 *
 * It is here because ADR 0007 introduced `assets.view.shared` for one case:
 * "an employee reporting a fault on the floor printer… Without minimum read
 * access they cannot find it, **cannot link it**, and the ticket ↔ asset
 * relation — the differentiator — fails for every shared asset." The tag is
 * what links it: ADR 0010 makes it the public identifier and the URL segment,
 * so a payload without it describes an asset the employee cannot act on, and
 * the criterion's own purpose fails.
 *
 * The internal uuid is *not* included — #9 can resolve a tag server-side — so
 * this is the narrowest identifier that satisfies both documents.
 *
 * Flagged on the pull request for sign-off; if it is rejected, the fix is to
 * drop `assetTag` here and in `SharedAssetView`, and #9 then needs another way
 * to name a shared asset.
 */
const SHARED_ROW_KEYS = ['assetTag', 'locationName', 'name', 'visibility'];

describe('listAssets, as an employee', () => {
	const scenario = async () => {
		const organisation = await createOrganisation();
		const { modelId } = await createCatalogue(organisation.id);
		const floor = await createLocation(organisation.id, 'Planta 2');
		const employee = await createViewer(organisation.id, 'employee', 'Ada Lovelace');
		const colleague = await createPerson(organisation.id, 'Alan Turing');

		const own = await createAsset(organisation.id, modelId, {
			assetTag: 'AST-OWN',
			name: 'Ada’s laptop',
			serial: 'SER-OWN',
			state: 'in_use',
			custodianPersonId: employee.personId,
			locationId: floor.id
		});

		const shared = await createAsset(organisation.id, modelId, {
			assetTag: 'AST-SHARED',
			name: 'Floor printer',
			serial: 'SER-SHARED',
			state: 'in_use',
			shared: true,
			locationId: floor.id
		});

		const other = await createAsset(organisation.id, modelId, {
			assetTag: 'AST-OTHER',
			name: 'Alan’s laptop',
			serial: 'SER-OTHER',
			custodianPersonId: colleague.id
		});

		/**
		 * In nobody's custody and *not* shared — the row that separates "the assets
		 * in my custody" from "the assets in nobody's custody". Without it in the
		 * fixture, a scope that compares `custodian_person_id` against a null
		 * `personId` passes every test in this file while leaking most of a real
		 * inventory, which is how it was caught.
		 */
		const idle = await createAsset(organisation.id, modelId, {
			assetTag: 'AST-IDLE',
			name: 'Spare laptop in the cupboard',
			serial: 'SER-IDLE',
			state: 'in_stock'
		});

		return { organisation, employee, own, shared, other, idle, floor };
	};

	it('returns their own assets and shared ones, and nobody else’s', async () => {
		const { employee } = await scenario();

		const result = await listAssets(employee);

		expect(result.rows.map((row) => row.assetTag).sort()).toEqual(['AST-OWN', 'AST-SHARED']);
	});

	it('delivers name and location only for a shared row', async () => {
		const { employee } = await scenario();

		const result = await listAssets(employee);
		const row = result.rows.find((candidate) => candidate.assetTag === 'AST-SHARED');

		expect(Object.keys(row ?? {}).sort()).toEqual(SHARED_ROW_KEYS);
	});

	it('names the shared asset and its location, and nothing more', async () => {
		const { employee } = await scenario();

		const result = await listAssets(employee);
		const row = result.rows.find((candidate) => candidate.assetTag === 'AST-SHARED');

		expect(row).toEqual({
			visibility: 'shared',
			assetTag: 'AST-SHARED',
			name: 'Floor printer',
			locationName: 'Planta 2'
		});
	});

	it('shows an asset in their own custody in full', async () => {
		const { employee } = await scenario();

		const result = await listAssets(employee);
		const row = result.rows.find((candidate) => candidate.assetTag === 'AST-OWN');

		expect(row).toEqual(
			expect.objectContaining({
				visibility: 'full',
				serial: 'SER-OWN',
				state: 'in_use',
				custodianName: 'Ada Lovelace'
			})
		);
	});

	/**
	 * The leak this guards is specific: an employee with no directory record has
	 * `personId === null`, and "the assets in my custody" written as
	 * `custodian_person_id = $1` with a null parameter matches nothing in SQL —
	 * but written as `is null` it matches every asset nobody holds. The clause
	 * has to be dropped, not parameterised.
	 */
	it('shows only shared assets to an employee with no directory record', async () => {
		const { organisation } = await scenario();
		const credentialOnly = await createViewerWithoutPerson(organisation.id, 'employee');

		const result = await listAssets(credentialOnly);

		expect(result.rows.map((row) => row.assetTag)).toEqual(['AST-SHARED']);
	});

	/**
	 * The narrow scope is a second code path, and it is the one an employee takes.
	 * A tenancy test that signs in as a technician exercises the `assets.view`
	 * branch instead and proves nothing about this one — so the organisation
	 * boundary is asserted again here, on the branch that filters by custody.
	 */
	it('does not show a shared asset belonging to another organisation', async () => {
		const { employee } = await scenario();
		const globex = await createOrganisation('Globex', 'globex');
		const { modelId: globexModel } = await createCatalogue(globex.id);
		await createAsset(globex.id, globexModel, { assetTag: 'AST-GLOBEX', shared: true });

		const result = await listAssets(employee);

		expect(result.rows.map((row) => row.assetTag).sort()).toEqual(['AST-OWN', 'AST-SHARED']);
	});
});

describe('listAssets, as a technician', () => {
	it('shows every asset in the organisation in full', async () => {
		const organisation = await createOrganisation();
		const { modelId } = await createCatalogue(organisation.id);
		const technician = await createViewer(organisation.id, 'technician', 'Grace Hopper');
		await createAsset(organisation.id, modelId, { assetTag: 'AST-0001', serial: 'SER-1' });
		await createAsset(organisation.id, modelId, { assetTag: 'AST-0002', shared: true });

		const result = await listAssets(technician);

		expect(result.rows.map((row) => row.visibility)).toEqual(['full', 'full']);
	});

	it('does not reach into another organisation', async () => {
		const acme = await createOrganisation('Acme', 'acme');
		const globex = await createOrganisation('Globex', 'globex');
		const { modelId: acmeModel } = await createCatalogue(acme.id);
		const { modelId: globexModel } = await createCatalogue(globex.id);
		const technician = await createViewer(acme.id, 'technician', 'Grace Hopper');

		await createAsset(acme.id, acmeModel, { assetTag: 'AST-ACME' });
		await createAsset(globex.id, globexModel, { assetTag: 'AST-GLOBEX', shared: true });

		const result = await listAssets(technician);

		expect(result.rows.map((row) => row.assetTag)).toEqual(['AST-ACME']);
	});
});
