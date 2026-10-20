import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { activity } from '../activity/schema';
import { getDb } from '../db';
import { constraintViolation } from '../db/errors';
import type { Mailer, MailMessage } from '../shared/mail';
import {
	assignCustody,
	deliver,
	ensureDefaultHandoverTemplates,
	setCategoryRequiresHandover
} from '.';
import { assets, handoverAssets, handovers } from './schema';
import {
	createAsset,
	createCatalogue,
	createOrganisation,
	createPerson,
	createViewer
} from './testing/fixtures';

/** ADR 0035, decisions 1 to 4 and 6: delivering several assets and issuing the handover. */

function recordingMailer() {
	const sent: MailMessage[] = [];
	const mailer: Mailer = { send: async (message) => void sent.push(message) };
	return { sent, mailer };
}

const linkTo = (token: string) => `https://unitati.test/handover/${token}`;

async function workspace(options: { templates?: boolean } = {}) {
	const organisation = await createOrganisation();
	if (options.templates !== false) await ensureDefaultHandoverTemplates(getDb(), organisation.id);
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

describe('deliver', () => {
	it('creates the custodies and one pending handover listing every asset', async () => {
		const { organisation, technician, ada, laptops, mice } = await workspace();
		const laptop = await createAsset(organisation.id, laptops.modelId, { name: 'Laptop' });
		const mouseA = await createAsset(organisation.id, mice.modelId, { name: 'Mouse A' });
		const mouseB = await createAsset(organisation.id, mice.modelId, { name: 'Mouse B' });
		const { sent, mailer } = recordingMailer();

		const outcome = await deliver(
			technician,
			{ personId: ada.id, assetIds: [laptop.id, mouseA.id, mouseB.id] },
			{ mailer, linkTo }
		);

		expect(outcome.ok).toBe(true);
		if (!outcome.ok || outcome.value.handover?.status !== 'pending') {
			throw new Error('expected a pending handover');
		}
		const { handover } = outcome.value;
		expect(handover.code).toMatch(/^HND-\d{4}$/);

		const held = await getDb().select({ c: assets.custodianPersonId }).from(assets);
		expect(held.every((row) => row.c === ada.id)).toBe(true);

		const [row] = await getDb().select().from(handovers);
		expect(row).toMatchObject({ status: 'pending', direction: 'delivery', personId: ada.id });
		expect(row.bodySha256).toBe(
			createHash('sha256')
				.update(row.bodySnapshot ?? '', 'utf8')
				.digest('hex')
		);
		expect(row.bodySnapshot).toContain('Ada Lovelace');
		expect(await getDb().select().from(handoverAssets)).toHaveLength(3);

		// Only the hash is stored, and the token appears nowhere in the activity.
		expect(row.tokenHash).toBe(createHash('sha256').update(handover.token).digest('hex'));
		const log = JSON.stringify(await getDb().select().from(activity));
		expect(log).not.toContain(handover.token);
		expect(JSON.stringify(row)).not.toContain(handover.token);

		const entries = await getDb().select().from(activity);
		expect(entries.filter((e) => e.verb === 'custody.assigned')).toHaveLength(3);
		const issued = entries.filter((e) => e.verb === 'handover.issued');
		expect(issued).toHaveLength(4); // three assets and the person
		expect(issued.filter((e) => e.personId === ada.id)).toHaveLength(1);

		await vi.waitFor(() => expect(sent).toHaveLength(1));
		expect(sent[0].to).toBe(ada.email);
		expect(sent[0].text).toContain(handover.link);
	});

	it('issues no handover when no asset needs one', async () => {
		const { organisation, technician, ada, mice } = await workspace();
		const mouse = await createAsset(organisation.id, mice.modelId);
		const { sent, mailer } = recordingMailer();

		const outcome = await deliver(
			technician,
			{ personId: ada.id, assetIds: [mouse.id] },
			{ mailer, linkTo }
		);

		expect(outcome).toEqual({ ok: true, value: { handover: null } });
		expect(await getDb().select().from(handovers)).toHaveLength(0);
		expect(sent).toHaveLength(0);
		const [after] = await getDb().select().from(assets).where(eq(assets.id, mouse.id));
		expect(after.custodianPersonId).toBe(ada.id);
	});

	it('writes nothing when one asset is already held', async () => {
		const { organisation, technician, ada, laptops, mice } = await workspace();
		const grace = await createPerson(organisation.id, 'Alan Turing');
		const free = await createAsset(organisation.id, laptops.modelId);
		const taken = await createAsset(organisation.id, mice.modelId);
		await assignCustody(technician, taken.id, grace.id);
		const before = (await getDb().select().from(activity)).length;

		const outcome = await deliver(
			technician,
			{ personId: ada.id, assetIds: [free.id, taken.id] },
			{ mailer: null }
		);

		expect(outcome).toEqual({ ok: false, error: 'already_in_custody' });
		const [row] = await getDb().select().from(assets).where(eq(assets.id, free.id));
		expect(row.custodianPersonId).toBeNull();
		expect(await getDb().select().from(handovers)).toHaveLength(0);
		expect((await getDb().select().from(activity)).length).toBe(before);
	});

	it('refuses, leaving no custody, when a handover is required and there is no delivery template', async () => {
		const { organisation, technician, ada, laptops } = await workspace({ templates: false });
		const laptop = await createAsset(organisation.id, laptops.modelId);

		const outcome = await deliver(
			technician,
			{ personId: ada.id, assetIds: [laptop.id] },
			{ mailer: null }
		);

		expect(outcome).toEqual({ ok: false, error: 'no_delivery_template' });
		const [row] = await getDb().select().from(assets).where(eq(assets.id, laptop.id));
		expect(row.custodianPersonId).toBeNull();
	});

	it('still succeeds with no mailer, and when the send fails', async () => {
		const { organisation, technician, ada, laptops } = await workspace();
		const one = await createAsset(organisation.id, laptops.modelId);
		const two = await createAsset(organisation.id, laptops.modelId);
		const failing: Mailer = { send: async () => Promise.reject(new Error('smtp down')) };
		const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});

		const to = (assetId: string) => ({ personId: ada.id, assetIds: [assetId] });
		expect((await deliver(technician, to(one.id), { mailer: null, linkTo })).ok).toBe(true);
		expect((await deliver(technician, to(two.id), { mailer: failing, linkTo })).ok).toBe(true);
		quiet.mockRestore();
		expect(await getDb().select().from(handovers)).toHaveLength(2);
	});

	it('refuses a person or asset of another organisation', async () => {
		const { organisation, technician, laptops } = await workspace();
		const other = await createOrganisation('Other', 'other');
		const stranger = await createPerson(other.id, 'Eve');
		const laptop = await createAsset(organisation.id, laptops.modelId);

		expect(
			await deliver(technician, { personId: stranger.id, assetIds: [laptop.id] }, { mailer: null })
		).toEqual({
			ok: false,
			error: 'person_not_found'
		});
		expect(
			await deliver(
				technician,
				{ personId: technician.personId!, assetIds: [crypto.randomUUID()] },
				{ mailer: null }
			)
		).toEqual({ ok: false, error: 'asset_not_found' });
	});
});

/** ADR 0035, decision 8: waiving is a permission, not a checkbox (#277). */
describe('deliver with a waiver', () => {
	async function waiving(options: { templates?: boolean } = {}) {
		const space = await workspace(options);
		const admin = await createViewer(space.organisation.id, 'admin', 'Margaret Hamilton');
		return { ...space, admin };
	}

	/** Every table a delivery writes to, counted, so "nothing is written" is one comparison. */
	async function written() {
		const db = getDb();
		const held = await db.select({ c: assets.custodianPersonId }).from(assets);
		return {
			held: held.filter((row) => row.c !== null).length,
			handovers: (await db.select().from(handovers)).length,
			activity: (await db.select().from(activity)).length
		};
	}

	it('records custody and a waived handover with the reason, and sends no mail', async () => {
		const { organisation, admin, ada, laptops, mice } = await waiving();
		const laptop = await createAsset(organisation.id, laptops.modelId, { name: 'Laptop' });
		const mouse = await createAsset(organisation.id, mice.modelId, { name: 'Mouse' });
		const { sent, mailer } = recordingMailer();

		const outcome = await deliver(
			admin,
			{
				personId: ada.id,
				assetIds: [laptop.id, mouse.id],
				waive: { reason: '  Executive, signed on paper  ' }
			},
			{ mailer, linkTo }
		);

		expect(outcome.ok).toBe(true);
		if (!outcome.ok || !outcome.value.handover) throw new Error('expected a handover');
		expect(outcome.value.handover).toMatchObject({ status: 'waived' });
		expect(outcome.value.handover).not.toHaveProperty('token');

		const held = await getDb().select({ c: assets.custodianPersonId }).from(assets);
		expect(held.every((row) => row.c === ada.id)).toBe(true);

		const [row] = await getDb().select().from(handovers);
		expect(row).toMatchObject({
			code: outcome.value.handover.code,
			status: 'waived',
			direction: 'delivery',
			personId: ada.id,
			personNameSnapshot: 'Ada Lovelace',
			waiveReason: 'Executive, signed on paper',
			issuedByPersonId: admin.personId,
			tokenHash: null,
			expiresAt: null,
			bodySnapshot: null,
			bodySha256: null,
			templateVersionId: null,
			decidedAt: null
		});
		const listed = await getDb().select().from(handoverAssets);
		expect(listed.map((a) => a.assetNameSnapshot).sort()).toEqual(['Laptop', 'Mouse']);

		const entries = await getDb().select().from(activity);
		expect(entries.filter((e) => e.verb === 'handover.issued')).toHaveLength(0);
		const waived = entries.filter((e) => e.verb === 'handover.waived');
		expect(waived).toHaveLength(3); // two assets and the person
		expect(waived.filter((e) => e.personId === ada.id)).toHaveLength(1);
		expect(waived[0].payload).toMatchObject({
			code: row.code,
			reason: 'Executive, signed on paper'
		});

		// Nothing to send: give a stray send the chance to happen before asserting it did not.
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(sent).toHaveLength(0);
	});

	it('needs no delivery template: a waiver has nothing to render', async () => {
		const { organisation, admin, ada, laptops } = await waiving({ templates: false });
		const laptop = await createAsset(organisation.id, laptops.modelId);

		const outcome = await deliver(
			admin,
			{ personId: ada.id, assetIds: [laptop.id], waive: { reason: 'Pre-dates Unitati' } },
			{ mailer: null }
		);

		expect(outcome.ok).toBe(true);
		expect(await getDb().select().from(handovers)).toHaveLength(1);
	});

	it("refuses a technician's waiver, and writes nothing", async () => {
		const { organisation, technician, ada, laptops } = await waiving();
		const laptop = await createAsset(organisation.id, laptops.modelId);
		const before = await written();

		const outcome = await deliver(
			technician,
			{ personId: ada.id, assetIds: [laptop.id], waive: { reason: 'In a hurry' } },
			{ mailer: null }
		);

		expect(outcome).toEqual({ ok: false, error: 'waive_forbidden' });
		expect(await written()).toEqual(before);
	});

	it('refuses an API key, even one acting for an admin', async () => {
		const { organisation, admin, ada, laptops } = await waiving();
		const laptop = await createAsset(organisation.id, laptops.modelId);
		const before = await written();

		const outcome = await deliver(
			{ ...admin, scopes: ['assets.checkout'] },
			{ personId: ada.id, assetIds: [laptop.id], waive: { reason: 'Scripted' } },
			{ mailer: null }
		);

		expect(outcome).toEqual({ ok: false, error: 'waive_forbidden' });
		expect(await written()).toEqual(before);
	});

	it('refuses a waiver when no handover is required, so the record means something', async () => {
		const { organisation, admin, ada, mice } = await waiving();
		const mouse = await createAsset(organisation.id, mice.modelId);
		const before = await written();

		const outcome = await deliver(
			admin,
			{ personId: ada.id, assetIds: [mouse.id], waive: { reason: 'Nothing to sign' } },
			{ mailer: null }
		);

		expect(outcome).toEqual({ ok: false, error: 'waive_not_required' });
		expect(await written()).toEqual(before);
	});

	it.each([
		['blank', '   '],
		['too long', 'x'.repeat(501)]
	])('refuses a %s reason', async (_, reason) => {
		const { organisation, admin, ada, laptops } = await waiving();
		const laptop = await createAsset(organisation.id, laptops.modelId);
		const before = await written();

		const outcome = await deliver(
			admin,
			{ personId: ada.id, assetIds: [laptop.id], waive: { reason } },
			{ mailer: null }
		);

		expect(outcome).toEqual({ ok: false, error: 'invalid_waive_reason' });
		expect(await written()).toEqual(before);
	});

	it('accepts a reason of exactly 500 characters', async () => {
		const { organisation, admin, ada, laptops } = await waiving();
		const laptop = await createAsset(organisation.id, laptops.modelId);

		const outcome = await deliver(
			admin,
			{ personId: ada.id, assetIds: [laptop.id], waive: { reason: 'x'.repeat(500) } },
			{ mailer: null }
		);

		expect(outcome.ok).toBe(true);
	});
});

describe('the handovers table refuses', () => {
	/** The constraint a failed statement trips, read off Drizzle's wrapped error. */
	async function violation(statement: PromiseLike<unknown>) {
		return constraintViolation(await Promise.resolve(statement).catch((error: unknown) => error));
	}

	it('a waived handover with no reason, or with a link or a text', async () => {
		const { organisation, ada } = await workspace();
		const waivedRow = (overrides: Partial<typeof handovers.$inferInsert>) =>
			getDb()
				.insert(handovers)
				.values({
					organisationId: organisation.id,
					direction: 'delivery',
					status: 'waived',
					personId: ada.id,
					personNameSnapshot: ada.fullName,
					recipientEmailSnapshot: ada.email,
					issuedAt: new Date(),
					waiveReason: 'Because',
					...overrides
				});
		const WAIVED = { code: '23514', constraint: 'handovers_waived_has_reason_and_no_link' };

		expect(await violation(waivedRow({ waiveReason: null }))).toMatchObject(WAIVED);
		expect(await violation(waivedRow({ tokenHash: 'abc' }))).toMatchObject(WAIVED);
		expect(await violation(waivedRow({ bodySnapshot: 'text' }))).toMatchObject(WAIVED);
		// The well-formed row is accepted, so the three refusals are about what they changed.
		await expect(waivedRow({})).resolves.toBeDefined();
	});
});
