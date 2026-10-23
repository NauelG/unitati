import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { Permission } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import {
	assetSnapshot,
	assetSummaries,
	categoryInOrganisation,
	ensureDefaultHandoverTemplates,
	findAssetInScope,
	handoverByCode,
	handoverInOrganisation,
	handoverSummaries
} from '.';
import { assets, handoverTemplateVersions, handovers } from './schema';
import {
	createAsset,
	createCatalogue,
	createOrganisation,
	createPerson,
	createViewer,
	createViewerWithoutPerson
} from './testing/fixtures';

/**
 * What `links` reads through this domain instead of joining its tables
 * (ADR 0002): scoped reads for what a viewer may link to or see, tenancy-only
 * reads for what an activity entry freezes.
 */

async function workspace() {
	const organisation = await createOrganisation();
	const { modelId, categoryId } = await createCatalogue(organisation.id);
	const technician = await createViewer(organisation.id, 'technician', 'Grace Hopper');
	const employee = await createViewer(organisation.id, 'employee', 'Eve Employee');
	const other = await createPerson(organisation.id, 'Olga Other');

	const own = await createAsset(organisation.id, modelId, {
		assetTag: 'AST-0001',
		name: 'Eve laptop',
		custodianPersonId: employee.personId
	});
	const shared = await createAsset(organisation.id, modelId, {
		assetTag: 'AST-0002',
		name: 'Shared printer',
		shared: true
	});
	const colleagues = await createAsset(organisation.id, modelId, {
		assetTag: 'AST-0003',
		name: 'Olga laptop',
		custodianPersonId: other.id
	});

	return { organisation, categoryId, modelId, technician, employee, own, shared, colleagues };
}

/** A key narrowed to scopes that read no asset: the role is intact, the permission is gone. */
function withScopes(viewer: SessionUser, scopes: Permission[]): SessionUser {
	return { ...viewer, scopes };
}

/** Archived straight in the table: `archiveAsset` refuses an asset with custody history. */
async function archive(assetId: string) {
	await getDb().update(assets).set({ archivedAt: new Date() }).where(eq(assets.id, assetId));
}

async function waivedHandover(
	organisationId: string,
	person: { id: string; fullName: string; email: string },
	overrides: Partial<typeof handovers.$inferInsert> = {}
) {
	const [row] = await getDb()
		.insert(handovers)
		.values({
			organisationId,
			direction: 'delivery',
			status: 'waived',
			personId: person.id,
			personNameSnapshot: person.fullName,
			recipientEmailSnapshot: person.email,
			issuedAt: new Date(),
			waiveReason: 'Because',
			...overrides
		})
		.returning();
	return row;
}

describe('findAssetInScope', () => {
	it('gives an employee the asset in their custody and the shared one, never a colleague’s', async () => {
		const { employee, own, shared, colleagues } = await workspace();
		const find = (id: string) => getDb().transaction((tx) => findAssetInScope(tx, employee, id));

		expect({
			own: (await find(own.id))?.assetTag,
			shared: (await find(shared.id))?.assetTag,
			colleagues: await find(colleagues.id)
		}).toEqual({ own: 'AST-0001', shared: 'AST-0002', colleagues: null });
	});

	it('gives a technician every asset', async () => {
		const { technician, own, shared, colleagues } = await workspace();
		const find = (id: string) => getDb().transaction((tx) => findAssetInScope(tx, technician, id));

		expect([
			(await find(own.id))?.assetTag,
			(await find(shared.id))?.assetTag,
			(await find(colleagues.id))?.assetTag
		]).toEqual(['AST-0001', 'AST-0002', 'AST-0003']);
	});

	it('drops the custody clause for a viewer with no person record', async () => {
		const { organisation, own } = await workspace();
		const viewer = await createViewerWithoutPerson(organisation.id, 'employee');

		expect(await getDb().transaction((tx) => findAssetInScope(tx, viewer, own.id))).toBeNull();
	});

	it('excludes an archived asset', async () => {
		const { technician, own } = await workspace();
		await archive(own.id);

		expect(await getDb().transaction((tx) => findAssetInScope(tx, technician, own.id))).toBeNull();
	});

	it('answers null, without throwing, to a principal with no asset-read permission', async () => {
		const { organisation, own } = await workspace();
		const viewer = await createViewer(organisation.id, 'employee', 'No Reads');
		const stripped = withScopes(viewer, ['tickets.view']);

		expect(await getDb().transaction((tx) => findAssetInScope(tx, stripped, own.id))).toBeNull();
	});

	it('never finds an asset of another organisation', async () => {
		const { own } = await workspace();
		const globex = await createOrganisation('Globex', 'globex');
		const foreign = await createViewer(globex.id, 'admin', 'Gina Globex');

		expect(await getDb().transaction((tx) => findAssetInScope(tx, foreign, own.id))).toBeNull();
	});
});

describe('assetSnapshot', () => {
	it('returns an archived asset, which the scoped read hides', async () => {
		const { organisation, own } = await workspace();
		await archive(own.id);

		const snapshot = await getDb().transaction((tx) => assetSnapshot(tx, organisation.id, own.id));

		expect(snapshot).toEqual({ id: own.id, assetTag: 'AST-0001', name: 'Eve laptop' });
	});

	it('is tenancy only: another organisation reads nothing', async () => {
		const { own } = await workspace();
		const globex = await createOrganisation('Globex', 'globex');

		expect(await getDb().transaction((tx) => assetSnapshot(tx, globex.id, own.id))).toBeNull();
	});
});

describe('assetSummaries', () => {
	it('returns the assets among the ids that the viewer may see, with their state', async () => {
		const { employee, own, shared, colleagues } = await workspace();

		const rows = await assetSummaries(employee, [own.id, shared.id, colleagues.id]);

		expect(rows.map((row) => [row.assetTag, row.state]).sort()).toEqual([
			['AST-0001', own.state],
			['AST-0002', shared.state]
		]);
	});

	it('drops archived assets', async () => {
		const { technician, own, shared } = await workspace();
		await archive(own.id);

		const rows = await assetSummaries(technician, [own.id, shared.id]);

		expect(rows.map((row) => row.assetTag)).toEqual(['AST-0002']);
	});

	it('answers [] for no ids, and for a principal with no asset-read permission', async () => {
		const { organisation, technician, own } = await workspace();
		const viewer = await createViewer(organisation.id, 'employee', 'No Reads');
		const stripped = withScopes(viewer, ['tickets.view']);

		expect({
			empty: await assetSummaries(technician, []),
			unpermitted: await assetSummaries(stripped, [own.id])
		}).toEqual({ empty: [], unpermitted: [] });
	});

	it('never returns an asset of another organisation', async () => {
		const { own } = await workspace();
		const globex = await createOrganisation('Globex', 'globex');
		const foreign = await createViewer(globex.id, 'admin', 'Gina Globex');

		expect(await assetSummaries(foreign, [own.id])).toEqual([]);
	});
});

describe('handoverSummaries', () => {
	it('returns the code, the frozen person name and the state', async () => {
		const { organisation, technician } = await workspace();
		const ada = await createPerson(organisation.id, 'Ada Lovelace');
		const handover = await waivedHandover(organisation.id, ada);

		const rows = await handoverSummaries(technician, [handover.id]);

		expect(rows).toEqual([
			{ id: handover.id, code: handover.code, personName: 'Ada Lovelace', state: 'waived' }
		]);
	});

	it('derives expired for a pending handover past its date', async () => {
		const { organisation, technician } = await workspace();
		await ensureDefaultHandoverTemplates(getDb(), organisation.id);
		const [version] = await getDb()
			.select({ id: handoverTemplateVersions.id })
			.from(handoverTemplateVersions)
			.limit(1);
		const ada = await createPerson(organisation.id, 'Ada Lovelace');
		const handover = await waivedHandover(organisation.id, ada, {
			status: 'pending',
			waiveReason: null,
			tokenHash: 'hash',
			bodySnapshot: 'text',
			bodySha256: 'sha',
			templateVersionId: version.id,
			expiresAt: new Date('2020-01-01T00:00:00Z')
		});

		const rows = await handoverSummaries(technician, [handover.id]);

		expect(rows.map((row) => row.state)).toEqual(['expired']);
		expect(
			(await getDb().select().from(handovers).where(eq(handovers.id, handover.id)))[0].status
		).toBe('pending');
	});

	it('answers [] without assets.view, even to a viewer who reads some assets', async () => {
		const { organisation, employee } = await workspace();
		const ada = await createPerson(organisation.id, 'Ada Lovelace');
		const handover = await waivedHandover(organisation.id, ada);

		expect(await handoverSummaries(employee, [handover.id])).toEqual([]);
		expect(await handoverSummaries(employee, [])).toEqual([]);
	});

	it('never returns a handover of another organisation', async () => {
		const { organisation } = await workspace();
		const ada = await createPerson(organisation.id, 'Ada Lovelace');
		const handover = await waivedHandover(organisation.id, ada);
		const globex = await createOrganisation('Globex', 'globex');
		const foreign = await createViewer(globex.id, 'admin', 'Gina Globex');

		expect(await handoverSummaries(foreign, [handover.id])).toEqual([]);
	});
});

describe('handover lookups', () => {
	it('finds a handover by id and by code, normalising the code', async () => {
		const { organisation } = await workspace();
		const ada = await createPerson(organisation.id, 'Ada Lovelace');
		const handover = await waivedHandover(organisation.id, ada);

		const found = await getDb().transaction(async (tx) => ({
			byId: await handoverInOrganisation(tx, organisation.id, handover.id),
			byCode: await handoverByCode(tx, organisation.id, `  ${handover.code.toLowerCase()} `)
		}));

		expect(found).toEqual({ byId: { id: handover.id }, byCode: { id: handover.id } });
	});

	it('finds nothing from another organisation', async () => {
		const { organisation } = await workspace();
		const ada = await createPerson(organisation.id, 'Ada Lovelace');
		const handover = await waivedHandover(organisation.id, ada);
		const globex = await createOrganisation('Globex', 'globex');

		const found = await getDb().transaction(async (tx) => ({
			byId: await handoverInOrganisation(tx, globex.id, handover.id),
			byCode: await handoverByCode(tx, globex.id, handover.code)
		}));

		expect(found).toEqual({ byId: null, byCode: null });
	});
});

describe('categoryInOrganisation', () => {
	it('returns the category of the organisation and nothing of another', async () => {
		const { organisation, categoryId } = await workspace();
		const globex = await createOrganisation('Globex', 'globex');

		expect({
			own: await categoryInOrganisation(getDb(), organisation.id, categoryId),
			foreign: await categoryInOrganisation(getDb(), globex.id, categoryId)
		}).toEqual({ own: { id: categoryId, name: expect.any(String) }, foreign: null });
	});
});
