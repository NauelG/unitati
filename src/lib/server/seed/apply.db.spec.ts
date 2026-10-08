import { asc, count, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { activity } from '../activity';
import { assets, listAssets, registerAsset } from '../assets';
import { createCatalogue, createOrganisation, createViewer } from '../assets/testing/fixtures';
import { getDb } from '../db';
import { advanceAssetTagSequence, applyPlan } from './apply';
import { buildPlan } from './plan';

/**
 * The acceptance criterion "`npm run db:seed` twice in a row produces the same
 * asset tags", proved against rows. A smaller plan than the real one: the
 * property does not depend on there being 200, and the fast loop matters.
 */

async function tags() {
	const rows = await getDb()
		.select({ tag: assets.assetTag })
		.from(assets)
		.orderBy(asc(assets.assetTag));
	return rows.map((row) => row.tag);
}

async function activityRows() {
	const [row] = await getDb().select({ total: count() }).from(activity);
	return row.total;
}

describe('applyPlan', () => {
	it('creates the planned assets, with their history', async () => {
		const organisation = await createOrganisation();
		const admin = await createViewer(organisation.id, 'admin', 'Ada Admin');
		const plan = buildPlan(40);

		const summary = await applyPlan(admin, plan);

		expect(summary).toEqual({ registered: 40, skipped: 0, refused: [] });
		expect(await tags()).toEqual(plan.assets.map((asset) => asset.assetTag));
		// At least `asset.created` for each, and the planned events on top.
		expect(await activityRows()).toBeGreaterThanOrEqual(40);
	});

	it('leaves exactly what the first run left when it runs again', async () => {
		const organisation = await createOrganisation();
		const admin = await createViewer(organisation.id, 'admin', 'Ada Admin');
		const plan = buildPlan(40);

		await applyPlan(admin, plan);
		const tagsAfterFirst = await tags();
		const activityAfterFirst = await activityRows();

		const second = await applyPlan(admin, plan);

		expect(second.registered).toBe(0);
		expect(second.skipped).toBe(40);
		expect(await tags()).toEqual(tagsAfterFirst);
		// No second `asset.created`, and none of the follow-up events either.
		expect(await activityRows()).toBe(activityAfterFirst);
	});

	it('does not re-run the events of an asset that was already there', async () => {
		const organisation = await createOrganisation();
		const admin = await createViewer(organisation.id, 'admin', 'Ada Admin');
		const plan = buildPlan(10);

		// Somebody registered AST-0001 by hand before the seed ran.
		const { modelId } = await createCatalogue(organisation.id, 'Hand made', 'Acme', 'Things');
		await registerAsset(admin, { assetTag: 'AST-0001', name: 'Mine', assetModelId: modelId });

		const summary = await applyPlan(admin, plan);

		expect(summary.skipped).toBe(1);
		expect(summary.registered).toBe(9);
		const mine = await listAssets(admin, { search: 'Mine' });
		expect(mine.rows).toHaveLength(1);
	});

	it('leaves the next hand-registered asset a free tag once the sequence is advanced', async () => {
		const organisation = await createOrganisation();
		const admin = await createViewer(organisation.id, 'admin', 'Ada Admin');
		// Explicit tags never touch the sequence, so start it from a known place.
		await getDb().execute(sql`select setval('asset_code_seq', 1, false)`);
		await applyPlan(admin, buildPlan(3));
		const { modelId } = await createCatalogue(organisation.id, 'Later', 'Later Co', 'Later things');

		// Without the advance, the next tag collides with the first seeded one.
		const collided = await registerAsset(admin, { name: 'Next', assetModelId: modelId });
		expect(collided).toMatchObject({ ok: false, error: 'duplicate_asset_tag' });

		await advanceAssetTagSequence(3);
		const next = await registerAsset(admin, { name: 'Next', assetModelId: modelId });

		expect(next).toMatchObject({ ok: true, value: { assetTag: 'AST-0004' } });
	});

	it('never winds the sequence back below where the real inventory has reached', async () => {
		await getDb().execute(sql`select setval('asset_code_seq', 500)`);

		await advanceAssetTagSequence(200);

		const [row] = await getDb().execute<{ last_value: string }>(
			sql`select last_value from asset_code_seq`
		);
		expect(Number(row.last_value)).toBe(500);
	});
});
