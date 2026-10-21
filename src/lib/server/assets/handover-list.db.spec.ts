import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from '../db';
import { handovers } from './schema';
import { InMemoryStorage } from '../shared/storage';
import {
	decideHandover,
	custodyHandover,
	deliver,
	ensureDefaultHandoverTemplates,
	getHandover,
	listHandovers,
	listOwnHandovers,
	setCategoryRequiresHandover,
	takeBack
} from '.';
import {
	createAsset,
	createCatalogue,
	createOrganisation,
	createPerson,
	createViewer
} from './testing/fixtures';
import { drawnSignature } from './testing/png';

/** The staff list and detail of handovers (#280): expiry is derived, never stored (ADR 0035, decision 3). */

const day = 24 * 60 * 60 * 1000;
const issuedAt = new Date('2026-10-01T10:00:00Z');
// The default link validity is 14 days.
const withinValidity = () => new Date(issuedAt.getTime() + 2 * day);
const afterExpiry = () => new Date(issuedAt.getTime() + 30 * day);

async function setup() {
	const organisation = await createOrganisation();
	await ensureDefaultHandoverTemplates(getDb(), organisation.id);
	const technician = await createViewer(organisation.id, 'technician', 'Grace Hopper');
	const admin = await createViewer(organisation.id, 'admin', 'Root Admin');
	const catalogue = await createCatalogue(organisation.id);
	await setCategoryRequiresHandover(admin, catalogue.categoryId, true);
	const ada = await createPerson(organisation.id, 'Ada Lovelace');
	const alan = await createPerson(organisation.id, 'Alan Turing');
	const storage = new InMemoryStorage();

	async function deliverTo(person: { id: string }, name: string, at = issuedAt) {
		const asset = await createAsset(organisation.id, catalogue.modelId, { name });
		const outcome = await deliver(
			technician,
			{ personId: person.id, assetIds: [asset.id] },
			{ mailer: null, linkTo: (token) => token, now: () => at }
		);
		if (!outcome.ok || outcome.value.handover?.status !== 'pending') throw new Error('setup');
		return { asset, handover: outcome.value.handover };
	}

	async function accept(token: string) {
		const decided = await decideHandover(
			token,
			'accept',
			{ ip: '203.0.113.7', userAgent: 'test', signature: drawnSignature() },
			{ storage, mailer: null, now: withinValidity }
		);
		if (!decided.ok) throw new Error('setup: accept');
	}

	return { organisation, technician, admin, catalogue, ada, alan, storage, deliverTo, accept };
}

describe('listHandovers', () => {
	it('reads a pending handover past its expiry as expired, with no stored change', async () => {
		const { technician, ada, deliverTo } = await setup();
		const { handover } = await deliverTo(ada, 'Laptop');

		const fresh = await listHandovers(
			technician,
			{ states: ['pending', 'expired'] },
			{ now: withinValidity }
		);
		expect(fresh.map((row) => [row.code, row.state])).toEqual([[handover.code, 'pending']]);

		const stale = await listHandovers(
			technician,
			{ states: ['pending', 'expired'] },
			{ now: afterExpiry }
		);
		expect(stale.map((row) => [row.code, row.state])).toEqual([[handover.code, 'expired']]);

		const onlyPending = await listHandovers(
			technician,
			{ states: ['pending'] },
			{ now: afterExpiry }
		);
		expect(onlyPending).toEqual([]);
	});

	it('defaults to what needs attention: pending, rejected and expired', async () => {
		const { technician, ada, alan, deliverTo, accept } = await setup();
		const stale = await deliverTo(ada, 'Stale', new Date(issuedAt.getTime() - 40 * day));
		const open = await deliverTo(ada, 'Open');
		const rejected = await deliverTo(alan, 'Rejected');
		const signed = await deliverTo(alan, 'Signed');
		await accept(signed.handover.token);
		await decideHandover(
			rejected.handover.token,
			'reject',
			{ ip: '203.0.113.7', userAgent: 'test', reason: 'Wrong laptop' },
			{ storage: new InMemoryStorage(), mailer: null, now: withinValidity }
		);

		const rows = await listHandovers(technician, {}, { now: withinValidity });

		expect(Object.fromEntries(rows.map((row) => [row.code, row.state]))).toEqual({
			[stale.handover.code]: 'expired',
			[open.handover.code]: 'pending',
			[rejected.handover.code]: 'rejected'
		});
		const all = await listHandovers(
			technician,
			{ states: ['pending', 'expired', 'accepted', 'rejected', 'waived'] },
			{ now: withinValidity }
		);
		expect(all.find((row) => row.code === signed.handover.code)?.state).toBe('accepted');
	});

	it('shows waived handovers when asked, and filters by direction and person', async () => {
		const { organisation, technician, admin, catalogue, ada, alan, deliverTo } = await setup();
		await deliverTo(ada, 'Laptop');
		const asset = await createAsset(organisation.id, catalogue.modelId, { name: 'Waived' });
		const waived = await deliver(
			admin,
			{ personId: alan.id, assetIds: [asset.id], waive: { reason: 'Lost the paper' } },
			{ mailer: null }
		);
		if (!waived.ok || waived.value.handover?.status !== 'waived') throw new Error('setup');
		const all = ['pending', 'expired', 'accepted', 'rejected', 'waived'] as const;

		const waivedOnly = await listHandovers(technician, { states: ['waived'] });
		expect(waivedOnly.map((row) => row.code)).toEqual([waived.value.handover.code]);

		const adas = await listHandovers(technician, { states: [...all], personId: ada.id });
		expect(adas.map((row) => row.personName)).toEqual(['Ada Lovelace']);

		const returns = await listHandovers(technician, { states: [...all], direction: 'return' });
		expect(returns).toEqual([]);
	});

	it('shows code, person, direction, asset count, dates and the issuer', async () => {
		const { technician, ada, deliverTo } = await setup();
		const { handover } = await deliverTo(ada, 'Laptop');

		const [row] = await listHandovers(technician, {}, { now: withinValidity });

		expect(row).toMatchObject({
			code: handover.code,
			personName: 'Ada Lovelace',
			personId: ada.id,
			direction: 'delivery',
			assetCount: 1,
			issuedByName: 'Grace Hopper',
			issuedAt,
			expiresAt: handover.expiresAt
		});
	});

	it('never shows another organisation', async () => {
		const { ada, deliverTo } = await setup();
		await deliverTo(ada, 'Laptop');
		const other = await createOrganisation('Other', 'other');
		const stranger = await createViewer(other.id, 'technician', 'Mallory');

		expect(await listHandovers(stranger, {})).toEqual([]);
	});
});

describe('getHandover', () => {
	it('returns the frozen text, asset snapshots, evidence and the state', async () => {
		const { technician, ada, deliverTo, accept } = await setup();
		const { handover } = await deliverTo(ada, 'Laptop');
		await accept(handover.token);

		const found = await getHandover(technician, handover.code);

		if (!found.ok) throw new Error('expected found');
		expect(found.value).toMatchObject({
			code: handover.code,
			state: 'accepted',
			personName: 'Ada Lovelace',
			signerIp: '203.0.113.7',
			hasSignature: true,
			hasDocument: true
		});
		expect(found.value.body).toContain('Ada Lovelace');
		expect(found.value.assets.map((asset) => asset.name)).toEqual(['Laptop']);
	});

	it('reports a decided handover without a document, so it can be generated', async () => {
		const { technician, ada, deliverTo, accept } = await setup();
		const { handover } = await deliverTo(ada, 'Laptop');
		await accept(handover.token);
		await getDb()
			.update(handovers)
			.set({ documentStorageKey: null, documentSha256: null })
			.where(eq(handovers.code, handover.code));

		const found = await getHandover(technician, handover.code);

		if (!found.ok) throw new Error('expected found');
		expect(found.value.hasDocument).toBe(false);
	});

	it('is not found for an unknown code or another organisation', async () => {
		const { technician, ada, deliverTo } = await setup();
		const { handover } = await deliverTo(ada, 'Laptop');
		const other = await createOrganisation('Other', 'other');
		const stranger = await createViewer(other.id, 'technician', 'Mallory');

		expect(await getHandover(technician, 'HND-9999')).toEqual({ ok: false, error: 'not_found' });
		expect(await getHandover(stranger, handover.code)).toEqual({ ok: false, error: 'not_found' });
	});

	it('marks a return handover with the condition of each asset', async () => {
		const { technician, ada, deliverTo } = await setup();
		const { asset } = await deliverTo(ada, 'Laptop');
		const returned = await takeBack(
			technician,
			ada.id,
			[{ assetId: asset.id, condition: 'damaged', notes: 'Cracked screen' }],
			{ mailer: null, linkTo: (token) => token }
		);
		if (!returned.ok || !returned.value.handover) throw new Error('setup');

		const found = await getHandover(technician, returned.value.handover.code);

		if (!found.ok) throw new Error('expected found');
		expect(found.value.direction).toBe('return');
		expect(found.value.assets[0]).toMatchObject({
			condition: 'damaged',
			conditionNotes: 'Cracked screen'
		});
	});
});

describe('custodyHandover', () => {
	it('is the state of the handover that covers the current holder', async () => {
		const { technician, ada, deliverTo, accept } = await setup();
		const { asset, handover } = await deliverTo(ada, 'Laptop');
		const held = { id: asset.id, custodianPersonId: ada.id };

		expect(await custodyHandover(technician, held, { now: withinValidity })).toEqual({
			kind: 'handover',
			code: handover.code,
			state: 'pending'
		});
		expect(await custodyHandover(technician, held, { now: afterExpiry })).toMatchObject({
			state: 'expired'
		});
		await accept(handover.token);
		expect(await custodyHandover(technician, held, { now: withinValidity })).toMatchObject({
			state: 'accepted'
		});
	});

	it('requires nothing for an asset nobody holds or whose category needs no handover', async () => {
		const { organisation, technician, ada } = await setup();
		const plain = await createCatalogue(organisation.id, 'Basic', 'Acme', 'Cables');
		const cable = await createAsset(organisation.id, plain.modelId, { name: 'Cable' });
		const unheld = { id: cable.id, custodianPersonId: null };
		await deliver(technician, { personId: ada.id, assetIds: [cable.id] }, { mailer: null });

		expect(await custodyHandover(technician, unheld)).toEqual({ kind: 'none_required' });
		expect(await custodyHandover(technician, { id: cable.id, custodianPersonId: ada.id })).toEqual({
			kind: 'none_required'
		});
	});

	it("does not mistake an earlier holder's handover for the current one", async () => {
		const { technician, ada, alan, deliverTo } = await setup();
		const { asset } = await deliverTo(ada, 'Laptop');

		expect(await custodyHandover(technician, { id: asset.id, custodianPersonId: alan.id })).toEqual(
			{ kind: 'none_required' }
		);
	});
});

describe('listHandovers for an asset', () => {
	it('lists every handover that named the asset, across people and directions', async () => {
		const { technician, ada, deliverTo } = await setup();
		const { asset, handover } = await deliverTo(ada, 'Laptop');
		await deliverTo(ada, 'Other laptop');
		const returned = await takeBack(
			technician,
			ada.id,
			[{ assetId: asset.id, condition: 'good' }],
			{ mailer: null, linkTo: (token) => token }
		);
		if (!returned.ok || !returned.value.handover) throw new Error('setup');

		const rows = await listHandovers(technician, {
			assetId: asset.id,
			states: ['pending', 'expired', 'accepted', 'rejected', 'waived']
		});

		expect(rows.map((row) => row.code).sort()).toEqual(
			[handover.code, returned.value.handover.code].sort()
		);
	});
});

describe('listOwnHandovers', () => {
	it('shows an employee only their own signed or pending handovers', async () => {
		const { organisation, admin, catalogue, ada, alan, deliverTo } = await setup();
		const mine = await deliverTo(ada, 'Laptop');
		await deliverTo(alan, 'Not mine');
		const waivedAsset = await createAsset(organisation.id, catalogue.modelId, { name: 'Waived' });
		await deliver(
			admin,
			{ personId: ada.id, assetIds: [waivedAsset.id], waive: { reason: 'No time' } },
			{ mailer: null }
		);
		// Ada's own sign-in: the employee is the person the handovers were issued to.
		const employee = {
			...(await createViewer(organisation.id, 'employee', 'Eve')),
			personId: ada.id
		};

		const rows = await listOwnHandovers(employee, { now: withinValidity });

		expect(rows.map((row) => row.code)).toEqual([mine.handover.code]);
		expect(await listOwnHandovers({ ...employee, personId: null })).toEqual([]);
		expect(await listOwnHandovers({ ...employee, personId: alan.id })).toHaveLength(1);
	});
});
