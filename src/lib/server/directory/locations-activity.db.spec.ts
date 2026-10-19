import { asc, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from '../db';
import { activity } from '../activity/schema';
import { listRecentActivity } from '../activity';
import {
	createAsset,
	createCatalogue,
	createOrganisation,
	createPerson,
	createViewer
} from '../assets/testing/fixtures';
import { countPeopleByLocation, createLocation, deleteLocation, updateLocation } from '.';
import { people } from './schema';
import type { LocationInput } from './validation';

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

async function make(actor: Awaited<ReturnType<typeof setup>>['actor'], o: Partial<LocationInput>) {
	const outcome = await createLocation(actor, input(o));
	if (!outcome.ok) throw new Error(`fixture failed: ${outcome.error}`);
	return outcome.value.id;
}

const entries = () =>
	getDb().select().from(activity).orderBy(asc(activity.occurredAt), asc(activity.id));

describe('location activity', () => {
	it('records a creation with the full snapshot and the acting person', async () => {
		const { actor } = await setup();
		const bcn = await make(actor, { name: 'Barcelona office' });
		const floor = await make(actor, {
			name: 'Floor 3',
			parentId: bcn,
			code: 'F3',
			latitude: 41.4,
			longitude: 2.1
		});

		const [, created] = await entries();
		expect(created).toMatchObject({
			verb: 'catalogue.location.created',
			locationId: floor,
			actorPersonId: actor.personId,
			payload: {
				name: 'Floor 3',
				path: 'Barcelona office › Floor 3',
				parentId: bcn,
				code: 'F3',
				address: null,
				notes: null,
				latitude: 41.4,
				longitude: 2.1
			}
		});
	});

	it('records only the changed fields of an update', async () => {
		const { actor } = await setup();
		const id = await make(actor, { name: 'Old' });

		await updateLocation(actor, id, input({ name: 'New' }));
		await updateLocation(actor, id, input({ name: 'New', code: 'N', notes: 'x' }));

		const [, rename, two] = await entries();
		expect(rename.verb).toBe('catalogue.location.updated');
		expect(rename.payload).toEqual({
			path: 'New',
			changes: { name: { from: 'Old', to: 'New' } }
		});
		expect(Object.keys((two.payload as { changes: object }).changes).sort()).toEqual([
			'code',
			'notes'
		]);
	});

	it('records a move with ids and paths on both sides, and nothing on descendants or assets', async () => {
		const { organisation, actor } = await setup();
		const { modelId } = await createCatalogue(organisation.id);
		const bcn = await make(actor, { name: 'Barcelona office' });
		const gro = await make(actor, { name: 'Girona office' });
		const floor = await make(actor, { name: 'Floor 3', parentId: bcn });
		const room = await make(actor, { name: 'Room', parentId: floor });
		await createAsset(organisation.id, modelId, { locationId: room });
		const before = (await entries()).length;

		await updateLocation(actor, floor, input({ name: 'Floor 3', parentId: gro }));

		const written = (await entries()).slice(before);
		expect(written).toHaveLength(1);
		expect(written[0]).toMatchObject({ locationId: floor, assetId: null });
		expect(written[0].payload).toEqual({
			path: 'Girona office › Floor 3',
			changes: {
				parent: {
					from: { id: bcn, path: 'Barcelona office' },
					to: { id: gro, path: 'Girona office' }
				}
			}
		});
	});

	it('writes nothing when a save changes nothing', async () => {
		const { actor } = await setup();
		const id = await make(actor, { name: 'Same', code: 'S' });

		await updateLocation(actor, id, input({ name: 'Same', code: 'S' }));

		expect(await entries()).toHaveLength(1);
	});

	it('keeps the deletion entry readable after the row is gone', async () => {
		const { organisation, actor } = await setup();
		const bcn = await make(actor, { name: 'Barcelona office' });
		const floor = await make(actor, { name: 'Floor 3', parentId: bcn, code: 'F3' });

		expect(await deleteLocation(actor, floor)).toEqual({ ok: true, value: undefined });

		const deleted = (await entries()).find((row) => row.verb === 'catalogue.location.deleted');
		expect(deleted).toMatchObject({
			locationId: floor,
			payload: { name: 'Floor 3', path: 'Barcelona office › Floor 3', code: 'F3' }
		});
		const feed = await listRecentActivity(organisation.id, 10);
		expect(feed.find((entry) => entry.verb === 'catalogue.location.deleted')?.record).toBeNull();
	});

	it('writes nothing for a refused delete or update', async () => {
		const { organisation, actor } = await setup();
		const { modelId } = await createCatalogue(organisation.id);
		const a = await make(actor, { name: 'A' });
		const b = await make(actor, { name: 'B', parentId: a });
		await make(actor, { name: 'Dup' });
		const other = await make(actor, { name: 'Other' });
		await createAsset(organisation.id, modelId, { locationId: other });
		const before = (await entries()).length;

		expect(await deleteLocation(actor, a)).toEqual({ ok: false, error: 'in_use' });
		expect(await deleteLocation(actor, other)).toEqual({ ok: false, error: 'in_use' });
		expect(await updateLocation(actor, a, input({ name: 'A', parentId: b }))).toEqual({
			ok: false,
			error: 'cycle'
		});
		expect(await updateLocation(actor, other, input({ name: 'Dup' }))).toEqual({
			ok: false,
			error: 'duplicate_name'
		});

		expect(await entries()).toHaveLength(before);
	});

	describe('deleting a location people sit at', () => {
		const seat = (personId: string, locationId: string) =>
			getDb().update(people).set({ locationId }).where(eq(people.id, personId));
		const locationOf = async (personId: string) =>
			(await getDb().select().from(people).where(eq(people.id, personId)))[0].locationId;
		const personEntries = async () =>
			(await entries()).filter((row) => row.verb === 'person.location.changed');

		it('records each person who loses it and clears their location', async () => {
			const { organisation, actor } = await setup();
			const bcn = await make(actor, { name: 'Barcelona office' });
			const room = await make(actor, { name: 'Room', parentId: bcn });
			const ada = await createPerson(organisation.id, 'Grace Hopper');
			const alan = await createPerson(organisation.id, 'Alan Turing');
			await seat(ada.id, room);
			await seat(alan.id, room);

			expect(await deleteLocation(actor, room)).toEqual({ ok: true, value: undefined });

			const written = await personEntries();
			expect(written).toHaveLength(2);
			expect(written.map((row) => row.personId).sort()).toEqual([ada.id, alan.id].sort());
			for (const row of written) {
				expect(row).toMatchObject({
					actorPersonId: actor.personId,
					payload: {
						from: { id: room, path: 'Barcelona office › Room' },
						to: null,
						reason: 'location_deleted'
					}
				});
			}
			expect(await locationOf(ada.id)).toBeNull();
			expect(await locationOf(alan.id)).toBeNull();
			expect((await entries()).filter((r) => r.verb === 'catalogue.location.deleted')).toHaveLength(
				1
			);
		});

		it('writes no person entry when nobody sits there', async () => {
			const { actor } = await setup();
			const room = await make(actor, { name: 'Empty' });

			await deleteLocation(actor, room);

			expect(await personEntries()).toHaveLength(0);
		});

		it('leaves people and activity untouched when the delete is refused', async () => {
			const { organisation, actor } = await setup();
			const { modelId } = await createCatalogue(organisation.id);
			const held = await make(actor, { name: 'Held' });
			await createAsset(organisation.id, modelId, { locationId: held });
			const person = await createPerson(organisation.id, 'Grace Hopper');
			await seat(person.id, held);
			const before = (await entries()).length;

			expect(await deleteLocation(actor, held)).toEqual({ ok: false, error: 'in_use' });

			expect(await entries()).toHaveLength(before);
			expect(await locationOf(person.id)).toBe(held);
		});

		it('never counts or records people of another organisation', async () => {
			const { organisation, actor } = await setup();
			const other = await createOrganisation('Other', 'other');
			const room = await make(actor, { name: 'Room' });
			const stranger = await createPerson(other.id, 'Grace Hopper');
			await seat(stranger.id, room);
			const mine = await createPerson(organisation.id, 'Alan Turing');
			await seat(mine.id, room);

			expect((await countPeopleByLocation(organisation.id)).get(room)).toBe(1);

			await deleteLocation(actor, room);

			expect((await personEntries()).map((row) => row.personId)).toEqual([mine.id]);
		});

		it('counts people per location in one grouped query', async () => {
			const { organisation, actor } = await setup();
			const a = await make(actor, { name: 'A' });
			const b = await make(actor, { name: 'B' });
			await make(actor, { name: 'C' });
			await seat((await createPerson(organisation.id, 'P One')).id, a);
			await seat((await createPerson(organisation.id, 'P Two')).id, a);
			await seat((await createPerson(organisation.id, 'P Three')).id, b);

			const counts = await countPeopleByLocation(organisation.id);

			expect(counts.get(a)).toBe(2);
			expect(counts.get(b)).toBe(1);
			expect(counts.size).toBe(2);
		});
	});

	it('lists location entries in the organisation feed without a record', async () => {
		const { organisation, actor } = await setup();
		await make(actor, { name: 'Somewhere' });

		const feed = await listRecentActivity(organisation.id);
		expect(feed).toHaveLength(1);
		expect(feed[0]).toMatchObject({ verb: 'catalogue.location.created', record: null });
	});
});

describe('activity_exactly_one_target with a location target', () => {
	const base = (organisationId: string) => ({
		organisationId,
		verb: 'catalogue.location.deleted' as const,
		payload: { name: 'X', path: 'X', code: null }
	});

	it('rejects a row with no target', async () => {
		const { organisation } = await setup();
		await expect(getDb().insert(activity).values(base(organisation.id))).rejects.toThrow();
	});

	it('rejects a row with both an asset and a location', async () => {
		const { organisation } = await setup();
		const { modelId } = await createCatalogue(organisation.id);
		const asset = await createAsset(organisation.id, modelId, {});
		await expect(
			getDb()
				.insert(activity)
				.values({ ...base(organisation.id), assetId: asset.id, locationId: crypto.randomUUID() })
		).rejects.toThrow();
	});

	it('accepts a location id with no row behind it', async () => {
		const { organisation } = await setup();
		await getDb()
			.insert(activity)
			.values({ ...base(organisation.id), locationId: crypto.randomUUID() });
		const [{ count }] = await getDb()
			.select({ count: sql<number>`count(*)::int` })
			.from(activity)
			.where(eq(activity.organisationId, organisation.id));
		expect(count).toBe(1);
	});
});
