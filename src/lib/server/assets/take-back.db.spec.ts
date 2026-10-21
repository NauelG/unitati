import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { activity } from '../activity/schema';
import { getDb } from '../db';
import type { Mailer, MailMessage } from '../shared/mail';
import {
	assignCustody,
	deliver,
	ensureDefaultHandoverTemplates,
	setCategoryRequiresHandover,
	takeBack
} from '.';
import { assets, handoverAssets, handovers } from './schema';
import {
	createAsset,
	createCatalogue,
	createOrganisation,
	createPerson,
	createViewer
} from './testing/fixtures';

/** #278, ADR 0035 decision 9: taking assets back, with their condition, and the return handover. */

function recordingMailer() {
	const sent: MailMessage[] = [];
	const mailer: Mailer = { send: async (message) => void sent.push(message) };
	return { sent, mailer };
}

const linkTo = (token: string) => `https://unitati.test/handover/${token}`;

async function workspace() {
	const organisation = await createOrganisation();
	await ensureDefaultHandoverTemplates(getDb(), organisation.id);
	const technician = await createViewer(organisation.id, 'technician', 'Grace Hopper');
	const ada = await createPerson(organisation.id, 'Ada Lovelace');
	const laptops = await createCatalogue(organisation.id);
	const mice = await createCatalogue(organisation.id, 'MX Master', 'Logitech', 'Mice');
	await setCategoryRequiresHandover(
		await createViewer(organisation.id, 'admin', 'Root Admin'),
		laptops.categoryId,
		true
	);
	return { organisation, technician, ada, laptops, mice };
}

describe('takeBack', () => {
	it('returns every custody and issues one pending return handover with each condition', async () => {
		const { organisation, technician, ada, laptops, mice } = await workspace();
		const laptop = await createAsset(organisation.id, laptops.modelId, { name: 'Laptop' });
		const mouse = await createAsset(organisation.id, mice.modelId, { name: 'Mouse' });
		await assignCustody(technician, laptop.id, ada.id);
		await assignCustody(technician, mouse.id, ada.id);
		const { sent, mailer } = recordingMailer();

		const outcome = await takeBack(
			technician,
			ada.id,
			[
				{ assetId: laptop.id, condition: 'incomplete', notes: 'No charger' },
				{ assetId: mouse.id, condition: 'good' }
			],
			{ mailer, linkTo }
		);

		expect(outcome.ok).toBe(true);
		if (!outcome.ok || !outcome.value.handover) throw new Error('expected a handover');
		const { handover } = outcome.value;

		// Custody is back at once, while the handover is still pending (ADR 0035, decision 9).
		const held = await getDb().select({ c: assets.custodianPersonId }).from(assets);
		expect(held.every((row) => row.c === null)).toBe(true);

		const [row] = await getDb().select().from(handovers);
		expect(row).toMatchObject({
			id: handover.id,
			status: 'pending',
			direction: 'return',
			personId: ada.id
		});
		expect(row.bodySnapshot).toContain('he devuelto');

		const listed = await getDb()
			.select({
				assetId: handoverAssets.assetId,
				condition: handoverAssets.condition,
				notes: handoverAssets.conditionNotes
			})
			.from(handoverAssets);
		expect(listed).toHaveLength(2);
		expect(listed).toEqual(
			expect.arrayContaining([
				{ assetId: laptop.id, condition: 'incomplete', notes: 'No charger' },
				{ assetId: mouse.id, condition: 'good', notes: null }
			])
		);

		const entries = await getDb().select().from(activity);
		const returned = entries.filter((e) => e.verb === 'custody.returned');
		expect(returned).toHaveLength(2);
		expect(returned.find((e) => e.assetId === laptop.id)?.payload).toEqual({
			fromPersonId: ada.id,
			fromPersonName: 'Ada Lovelace',
			condition: 'incomplete',
			conditionNotes: 'No charger'
		});
		expect(entries.filter((e) => e.verb === 'handover.issued')).toHaveLength(3); // two assets and the person

		await vi.waitFor(() => expect(sent).toHaveLength(1));
		expect(sent[0].to).toBe(ada.email);
		expect(sent[0].subject).toContain('devolución');
		expect(sent[0].text).toContain(handover.link);
	});

	it('writes nothing when one asset is held by someone else', async () => {
		const { organisation, technician, ada, laptops, mice } = await workspace();
		const alan = await createPerson(organisation.id, 'Alan Turing');
		const ours = await createAsset(organisation.id, laptops.modelId);
		const theirs = await createAsset(organisation.id, mice.modelId);
		const nobodys = await createAsset(organisation.id, mice.modelId);
		await assignCustody(technician, ours.id, ada.id);
		await assignCustody(technician, theirs.id, alan.id);
		const before = (await getDb().select().from(activity)).length;

		for (const other of [theirs, nobodys]) {
			const outcome = await takeBack(
				technician,
				ada.id,
				[
					{ assetId: ours.id, condition: 'good' },
					{ assetId: other.id, condition: 'good' }
				],
				{ mailer: null }
			);
			expect(outcome).toEqual({ ok: false, error: 'not_in_custody' });
		}

		const [row] = await getDb().select().from(assets).where(eq(assets.id, ours.id));
		expect(row.custodianPersonId).toBe(ada.id);
		expect(await getDb().select().from(handovers)).toHaveLength(0);
		expect((await getDb().select().from(activity)).length).toBe(before);
	});

	it('refuses a damaged or incomplete asset without notes, and notes past 500 characters', async () => {
		const { organisation, technician, ada, laptops } = await workspace();
		const laptop = await createAsset(organisation.id, laptops.modelId);
		await assignCustody(technician, laptop.id, ada.id);

		const attempts = [
			{ condition: 'damaged' as const },
			{ condition: 'incomplete' as const, notes: '   ' },
			{ condition: 'good' as const, notes: 'x'.repeat(501) }
		];
		for (const attempt of attempts) {
			expect(
				await takeBack(technician, ada.id, [{ assetId: laptop.id, ...attempt }], {
					mailer: null
				})
			).toEqual({ ok: false, error: 'invalid_condition' });
		}

		const [row] = await getDb().select().from(assets).where(eq(assets.id, laptop.id));
		expect(row.custodianPersonId).toBe(ada.id);
	});

	it('returns custody with no handover when no asset needs one', async () => {
		const { organisation, technician, ada, mice } = await workspace();
		const mouse = await createAsset(organisation.id, mice.modelId);
		await assignCustody(technician, mouse.id, ada.id);
		const { sent, mailer } = recordingMailer();

		const outcome = await takeBack(
			technician,
			ada.id,
			[{ assetId: mouse.id, condition: 'damaged', notes: 'Scroll wheel broken' }],
			{ mailer, linkTo }
		);

		expect(outcome).toEqual({ ok: true, value: { handover: null } });
		expect(await getDb().select().from(handovers)).toHaveLength(0);
		expect(sent).toHaveLength(0);
		const [after] = await getDb().select().from(assets).where(eq(assets.id, mouse.id));
		expect(after.custodianPersonId).toBeNull();
		// The lifecycle state is the technician's separate decision (#278, out of scope).
		expect(after.state).toBe('in_stock');
	});

	it('refuses, returning nothing, when a handover is required and there is no return template', async () => {
		const organisation = await createOrganisation();
		const technician = await createViewer(organisation.id, 'technician', 'Grace Hopper');
		const ada = await createPerson(organisation.id, 'Ada Lovelace');
		const laptops = await createCatalogue(organisation.id);
		await setCategoryRequiresHandover(
			await createViewer(organisation.id, 'admin', 'Root Admin'),
			laptops.categoryId,
			true
		);
		const laptop = await createAsset(organisation.id, laptops.modelId);
		await assignCustody(technician, laptop.id, ada.id);

		expect(
			await takeBack(technician, ada.id, [{ assetId: laptop.id, condition: 'good' }], {
				mailer: null
			})
		).toEqual({ ok: false, error: 'no_return_template' });
		const [row] = await getDb().select().from(assets).where(eq(assets.id, laptop.id));
		expect(row.custodianPersonId).toBe(ada.id);
	});

	it('refuses the same asset twice, and a person of another organisation', async () => {
		const { organisation, technician, ada, mice } = await workspace();
		const mouse = await createAsset(organisation.id, mice.modelId);
		await assignCustody(technician, mouse.id, ada.id);
		const stranger = await createPerson((await createOrganisation('Other', 'other')).id, 'Eve');

		expect(
			await takeBack(
				technician,
				ada.id,
				[
					{ assetId: mouse.id, condition: 'good' },
					{ assetId: mouse.id, condition: 'damaged', notes: 'Cracked' }
				],
				{ mailer: null }
			)
		).toEqual({ ok: false, error: 'duplicate_asset' });
		expect(
			await takeBack(technician, stranger.id, [{ assetId: mouse.id, condition: 'good' }], {
				mailer: null
			})
		).toEqual({ ok: false, error: 'person_not_found' });
	});
});

describe('handover conditions', () => {
	it('sit on every asset of a return and on none of a delivery', async () => {
		const { organisation, technician, ada, laptops, mice } = await workspace();
		const laptop = await createAsset(organisation.id, laptops.modelId);
		const mouse = await createAsset(organisation.id, mice.modelId);

		const delivered = await deliver(
			technician,
			{ personId: ada.id, assetIds: [laptop.id, mouse.id] },
			{ mailer: null }
		);
		const returned = await takeBack(
			technician,
			ada.id,
			[
				{ assetId: laptop.id, condition: 'good' },
				{ assetId: mouse.id, condition: 'damaged', notes: 'Cracked' }
			],
			{ mailer: null }
		);
		if (!delivered.ok || !delivered.value.handover || !returned.ok || !returned.value.handover) {
			throw new Error('expected two handovers');
		}

		const conditionsOf = async (handoverId: string) =>
			(
				await getDb()
					.select({ condition: handoverAssets.condition })
					.from(handoverAssets)
					.where(eq(handoverAssets.handoverId, handoverId))
			).map((row) => row.condition);

		expect(await conditionsOf(delivered.value.handover.id)).toEqual([null, null]);
		expect((await conditionsOf(returned.value.handover.id)).sort()).toEqual(['damaged', 'good']);
	});
});
