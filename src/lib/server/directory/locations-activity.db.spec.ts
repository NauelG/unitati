import { asc, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from '../db';
import { activity } from '../activity/schema';
import { listRecentActivity } from '../activity';
import {
	createAsset,
	createCatalogue,
	createOrganisation,
	createViewer
} from '../assets/testing/fixtures';
import { createLocation, deleteLocation, updateLocation } from '.';
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
