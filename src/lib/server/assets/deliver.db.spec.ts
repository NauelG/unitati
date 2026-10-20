import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { activity } from '../activity/schema';
import { getDb } from '../db';
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

		const outcome = await deliver(technician, ada.id, [laptop.id, mouseA.id, mouseB.id], {
			mailer,
			linkTo
		});

		expect(outcome.ok).toBe(true);
		if (!outcome.ok || !outcome.value.handover) throw new Error('expected a handover');
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

		const outcome = await deliver(technician, ada.id, [mouse.id], { mailer, linkTo });

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

		const outcome = await deliver(technician, ada.id, [free.id, taken.id], { mailer: null });

		expect(outcome).toEqual({ ok: false, error: 'already_in_custody' });
		const [row] = await getDb().select().from(assets).where(eq(assets.id, free.id));
		expect(row.custodianPersonId).toBeNull();
		expect(await getDb().select().from(handovers)).toHaveLength(0);
		expect((await getDb().select().from(activity)).length).toBe(before);
	});

	it('refuses, leaving no custody, when a handover is required and there is no delivery template', async () => {
		const { organisation, technician, ada, laptops } = await workspace({ templates: false });
		const laptop = await createAsset(organisation.id, laptops.modelId);

		const outcome = await deliver(technician, ada.id, [laptop.id], { mailer: null });

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

		expect((await deliver(technician, ada.id, [one.id], { mailer: null, linkTo })).ok).toBe(true);
		expect((await deliver(technician, ada.id, [two.id], { mailer: failing, linkTo })).ok).toBe(
			true
		);
		quiet.mockRestore();
		expect(await getDb().select().from(handovers)).toHaveLength(2);
	});

	it('refuses a person or asset of another organisation', async () => {
		const { organisation, technician, laptops } = await workspace();
		const other = await createOrganisation('Other', 'other');
		const stranger = await createPerson(other.id, 'Eve');
		const laptop = await createAsset(organisation.id, laptops.modelId);

		expect(await deliver(technician, stranger.id, [laptop.id], { mailer: null })).toEqual({
			ok: false,
			error: 'person_not_found'
		});
		expect(
			await deliver(technician, technician.personId!, [crypto.randomUUID()], { mailer: null })
		).toEqual({ ok: false, error: 'asset_not_found' });
	});
});
