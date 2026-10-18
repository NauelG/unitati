import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from '../db';
import { activity } from '../activity/schema';
import { changeLocation, countAssetsByLocation } from '../assets';
import {
	createAsset,
	createCatalogue,
	createOrganisation,
	createPerson,
	createViewer
} from '../assets/testing/fixtures';
import {
	countLocationChildren,
	createLocation,
	deleteLocation,
	listLocations,
	locationPaths,
	updateLocation
} from '.';
import { locations, people } from './schema';
import { locationInput, type LocationInput } from './validation';

const input = (overrides: Partial<LocationInput> = {}): LocationInput => ({
	name: 'Somewhere',
	parentId: null,
	code: null,
	address: null,
	notes: null,
	latitude: null,
	longitude: null,
	...overrides
});

async function setup() {
	const organisation = await createOrganisation();
	const actor = await createViewer(organisation.id, 'admin');
	return { organisation, actor };
}

/** Creates and unwraps: a fixture that fails should fail loudly, not return undefined. */
async function make(
	actor: Awaited<ReturnType<typeof setup>>['actor'],
	overrides: Partial<LocationInput>
) {
	const outcome = await createLocation(actor, input(overrides));
	if (!outcome.ok) throw new Error(`fixture failed: ${outcome.error}`);
	return outcome.value.id;
}

describe('the location tree', () => {
	it('creates, edits, moves and deletes, and lists path and depth in tree order', async () => {
		const { organisation, actor } = await setup();
		const warehouse = await make(actor, { name: 'Warehouse' });
		const bcn = await make(actor, { name: 'Barcelona office', code: 'BCN' });
		const floor1 = await make(actor, { name: 'Floor 1', parentId: bcn });
		const roomA = await make(actor, { name: 'Meeting room A', parentId: floor1 });

		const listed = await listLocations(organisation.id);
		expect(listed.map((entry) => [entry.path, entry.depth])).toEqual([
			['Barcelona office', 0],
			['Barcelona office › Floor 1', 1],
			['Barcelona office › Floor 1 › Meeting room A', 2],
			['Warehouse', 0]
		]);
		expect(listed[0]).toMatchObject({ id: bcn, parentId: null, code: 'BCN', latitude: null });

		expect(
			await updateLocation(
				actor,
				roomA,
				input({ name: 'Room A', parentId: bcn, latitude: 41.3874, longitude: 2.1686 })
			)
		).toEqual({ ok: true, value: undefined });
		const moved = (await listLocations(organisation.id)).find((entry) => entry.id === roomA);
		expect(moved).toMatchObject({
			path: 'Barcelona office › Room A',
			depth: 1,
			latitude: 41.3874,
			longitude: 2.1686
		});

		expect(await deleteLocation(actor, roomA)).toEqual({ ok: true, value: undefined });
		expect(await deleteLocation(actor, warehouse)).toEqual({ ok: true, value: undefined });
		expect((await listLocations(organisation.id)).map((entry) => entry.path)).toEqual([
			'Barcelona office',
			'Barcelona office › Floor 1'
		]);
	});

	it('keeps a subtree together even when a sibling name extends another', async () => {
		const { organisation, actor } = await setup();
		const barcelona = await make(actor, { name: 'Barcelona' });
		await make(actor, { name: 'Barcelona 2' });
		await make(actor, { name: 'Floor 1', parentId: barcelona });

		expect((await listLocations(organisation.id)).map((entry) => entry.path)).toEqual([
			'Barcelona',
			'Barcelona › Floor 1',
			'Barcelona 2'
		]);
	});

	it('resolves paths for a set of ids', async () => {
		const { organisation, actor } = await setup();
		const bcn = await make(actor, { name: 'Barcelona office' });
		const floor1 = await make(actor, { name: 'Floor 1', parentId: bcn });

		const paths = await locationPaths(organisation.id, [floor1, bcn, floor1]);
		expect(paths.get(floor1)).toBe('Barcelona office › Floor 1');
		expect(paths.get(bcn)).toBe('Barcelona office');
		expect(await locationPaths(organisation.id, [])).toEqual(new Map());
	});
});

describe('uniqueness', () => {
	it('refuses sibling and root name clashes but accepts one name under two parents', async () => {
		const { actor } = await setup();
		const bcn = await make(actor, { name: 'Barcelona office' });
		const gro = await make(actor, { name: 'Girona office' });
		await make(actor, { name: 'Floor 1', parentId: bcn });

		expect(await createLocation(actor, input({ name: 'Floor 1', parentId: bcn }))).toEqual({
			ok: false,
			error: 'duplicate_name'
		});
		expect(await createLocation(actor, input({ name: 'Girona office' }))).toEqual({
			ok: false,
			error: 'duplicate_name'
		});
		expect((await createLocation(actor, input({ name: 'Floor 1', parentId: gro }))).ok).toBe(true);

		const other = await make(actor, { name: 'Floor 2', parentId: bcn });
		expect(await updateLocation(actor, other, input({ name: 'Floor 1', parentId: bcn }))).toEqual({
			ok: false,
			error: 'duplicate_name'
		});
	});

	it('scopes codes to the organisation and lets many locations go without one', async () => {
		const { actor } = await setup();
		const otherOrganisation = await createOrganisation('Globex', 'globex');
		const outsider = await createViewer(otherOrganisation.id, 'admin', 'Grace Hopper');

		await make(actor, { name: 'A', code: 'X-1' });
		await make(actor, { name: 'B' });
		await make(actor, { name: 'C' });

		expect(await createLocation(actor, input({ name: 'D', code: 'X-1' }))).toEqual({
			ok: false,
			error: 'duplicate_code'
		});
		const c = await make(actor, { name: 'E', code: 'X-2' });
		expect(await updateLocation(actor, c, input({ name: 'E', code: 'X-1' }))).toEqual({
			ok: false,
			error: 'duplicate_code'
		});
		expect((await createLocation(outsider, input({ name: 'A', code: 'X-1' }))).ok).toBe(true);
	});
});

describe('cycles', () => {
	it('refuses a parent that is the location itself or one of its descendants, changing nothing', async () => {
		const { organisation, actor } = await setup();
		const a = await make(actor, { name: 'A' });
		const b = await make(actor, { name: 'B', parentId: a });
		const c = await make(actor, { name: 'C', parentId: b });

		expect(await updateLocation(actor, a, input({ name: 'A', parentId: a }))).toEqual({
			ok: false,
			error: 'cycle'
		});
		expect(await updateLocation(actor, a, input({ name: 'A', parentId: c }))).toEqual({
			ok: false,
			error: 'cycle'
		});
		expect((await listLocations(organisation.id)).map((entry) => entry.path)).toEqual([
			'A',
			'A › B',
			'A › B › C'
		]);
	});

	it('keeps the tree acyclic when two opposite moves run at once', async () => {
		const { organisation, actor } = await setup();
		const a = await make(actor, { name: 'A' });
		const b = await make(actor, { name: 'B' });

		const outcomes = await Promise.all([
			updateLocation(actor, a, input({ name: 'A', parentId: b })),
			updateLocation(actor, b, input({ name: 'B', parentId: a }))
		]);

		expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
		expect(outcomes.filter((outcome) => !outcome.ok)).toEqual([{ ok: false, error: 'cycle' }]);
		// A cyclic pair would be unreachable from any root and vanish from the listing.
		expect(await listLocations(organisation.id)).toHaveLength(2);
	});
});

describe('tenancy', () => {
	it('never reveals another organisation’s rows', async () => {
		const { actor } = await setup();
		const otherOrganisation = await createOrganisation('Globex', 'globex');
		const outsider = await createViewer(otherOrganisation.id, 'admin', 'Grace Hopper');
		const foreign = await make(outsider, { name: 'Foreign' });
		const mine = await make(actor, { name: 'Mine' });

		expect(await createLocation(actor, input({ name: 'Child', parentId: foreign }))).toEqual({
			ok: false,
			error: 'parent_not_found'
		});
		expect(await updateLocation(actor, mine, input({ name: 'Mine', parentId: foreign }))).toEqual({
			ok: false,
			error: 'parent_not_found'
		});
		expect(await updateLocation(actor, foreign, input({ name: 'Taken' }))).toEqual({
			ok: false,
			error: 'not_found'
		});
		expect(await deleteLocation(actor, foreign)).toEqual({ ok: false, error: 'not_found' });
		expect(await locationPaths(actor.organisationId, [foreign])).toEqual(new Map());
	});
});

describe('deleting', () => {
	it('refuses a location with children, with assets, or both, and deletes nothing', async () => {
		const { organisation, actor } = await setup();
		const { modelId } = await createCatalogue(organisation.id);
		const parent = await make(actor, { name: 'Parent' });
		await make(actor, { name: 'Child', parentId: parent });
		const holder = await make(actor, { name: 'Holder' });
		await createAsset(organisation.id, modelId, { locationId: holder });
		const both = await make(actor, { name: 'Both' });
		await make(actor, { name: 'Under both', parentId: both });
		await createAsset(organisation.id, modelId, { locationId: both, assetTag: 'T-2' });

		for (const id of [parent, holder, both]) {
			expect(await deleteLocation(actor, id)).toEqual({ ok: false, error: 'in_use' });
		}
		expect(await listLocations(organisation.id)).toHaveLength(5);
		expect(await countLocationChildren(organisation.id, parent)).toBe(1);
		expect(await countLocationChildren(organisation.id, holder)).toBe(0);
	});

	it('deletes an unused leaf', async () => {
		const { organisation, actor } = await setup();
		const leaf = await make(actor, { name: 'Leaf' });
		expect(await deleteLocation(actor, leaf)).toEqual({ ok: true, value: undefined });
		expect(await listLocations(organisation.id)).toEqual([]);
	});

	it('deletes a location only a person references, clearing the person’s location', async () => {
		const { organisation, actor } = await setup();
		const seat = await make(actor, { name: 'Seat' });
		const person = await createPerson(organisation.id, 'Grace Hopper');
		await getDb().update(people).set({ locationId: seat }).where(eq(people.id, person.id));

		expect(await deleteLocation(actor, seat)).toEqual({ ok: true, value: undefined });
		const [after] = await getDb().select().from(people).where(eq(people.id, person.id));
		expect(after.locationId).toBeNull();
	});
});

describe('coordinates', () => {
	it('are refused by validation unless paired and in range', () => {
		const parse = (latitude: unknown, longitude: unknown) =>
			locationInput.safeParse({ name: 'X', latitude, longitude }).success;

		expect(parse('41.3874', '2.1686')).toBe(true);
		expect(parse('', '')).toBe(true);
		expect(parse('41.3874', '')).toBe(false);
		expect(parse('', '2.1686')).toBe(false);
		expect(parse('91', '2')).toBe(false);
		expect(parse('1', '-181')).toBe(false);
		expect(parse('abc', '2')).toBe(false);
	});

	it('accepts a comma as the decimal separator', () => {
		const parsed = locationInput.parse({ name: 'X', latitude: '40,4168', longitude: '-3,7038' });
		expect([parsed.latitude, parsed.longitude]).toEqual([40.4168, -3.7038]);
	});

	it('normalises blank optional text to null and trims the name', () => {
		const parsed = locationInput.parse({
			name: '  Lab ',
			code: '  ',
			address: ' Main St ',
			parentId: ''
		});
		expect(parsed).toMatchObject({
			name: 'Lab',
			code: null,
			address: 'Main St',
			notes: null,
			parentId: null
		});
	});

	it('are refused by the CHECK when inserted directly', async () => {
		const organisation = await createOrganisation();
		const insert = (values: Partial<typeof locations.$inferInsert>) =>
			getDb()
				.insert(locations)
				.values({ organisationId: organisation.id, name: crypto.randomUUID(), ...values });

		await expect(insert({ latitude: 10 })).rejects.toThrow();
		await expect(insert({ longitude: 10 })).rejects.toThrow();
		await expect(insert({ latitude: 91, longitude: 0 })).rejects.toThrow();
		await expect(insert({ latitude: 0, longitude: 181 })).rejects.toThrow();
		await expect(insert({ latitude: 90, longitude: -180 })).resolves.toBeDefined();
	});
});

describe('assets and the tree', () => {
	it('counts only direct assets per location', async () => {
		const { organisation, actor } = await setup();
		const { modelId } = await createCatalogue(organisation.id);
		const bcn = await make(actor, { name: 'Barcelona office' });
		const floor1 = await make(actor, { name: 'Floor 1', parentId: bcn });
		await createAsset(organisation.id, modelId, { locationId: floor1, assetTag: 'A-1' });
		await createAsset(organisation.id, modelId, { locationId: floor1, assetTag: 'A-2' });
		await createAsset(organisation.id, modelId, { locationId: bcn, assetTag: 'A-3' });
		await createAsset(organisation.id, modelId, { assetTag: 'A-4' });

		const counts = await countAssetsByLocation(organisation.id);
		expect(counts.get(floor1)).toBe(2);
		expect(counts.get(bcn)).toBe(1);
	});

	it('leaves assets and the activity log untouched when a location is moved', async () => {
		const { organisation, actor } = await setup();
		const { modelId } = await createCatalogue(organisation.id);
		const bcn = await make(actor, { name: 'Barcelona office' });
		const gro = await make(actor, { name: 'Girona office' });
		const floor1 = await make(actor, { name: 'Floor 1', parentId: bcn });
		const asset = await createAsset(organisation.id, modelId, { locationId: floor1 });

		await updateLocation(actor, floor1, input({ name: 'Floor 1', parentId: gro }));

		const [after] = await getDb().select().from(activity);
		expect(after).toBeUndefined();
		expect((await countAssetsByLocation(organisation.id)).get(floor1)).toBe(1);
		expect(asset.locationId).toBe(floor1);
	});

	it('writes the full path at the time of the move into location.changed', async () => {
		const { organisation, actor } = await setup();
		const { modelId } = await createCatalogue(organisation.id);
		const bcn = await make(actor, { name: 'Barcelona office' });
		const gro = await make(actor, { name: 'Girona office' });
		const bcnFloor = await make(actor, { name: 'Floor 1', parentId: bcn });
		const groFloor = await make(actor, { name: 'Floor 1', parentId: gro });
		const asset = await createAsset(organisation.id, modelId, { locationId: bcnFloor });

		expect((await changeLocation(actor, asset.id, groFloor)).ok).toBe(true);

		const [row] = await getDb().select().from(activity);
		expect(row.verb).toBe('location.changed');
		expect(row.payload).toMatchObject({
			fromLocationId: bcnFloor,
			fromLocationName: 'Barcelona office › Floor 1',
			toLocationId: groFloor,
			toLocationName: 'Girona office › Floor 1'
		});
	});
});
