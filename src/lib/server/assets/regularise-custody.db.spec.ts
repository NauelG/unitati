import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from '../db';
import type { Mailer, MailMessage } from '../shared/mail';
import { InMemoryStorage } from '../shared/storage';
import {
	assignCustody,
	decideHandover,
	deliver,
	ensureDefaultHandoverTemplates,
	openHandover,
	regulariseCustody,
	setCategoryRequiresHandover
} from '.';
import { handovers } from './schema';
import {
	createAsset,
	createCatalogue,
	createOrganisation,
	createPerson,
	createViewer
} from './testing/fixtures';

/**
 * Issuing delivery handovers for custody that already exists (#281, ADR 0035):
 * equipment handed out by hand, by CSV import or by the seed, before anyone signed.
 */

function recordingMailer() {
	const sent: MailMessage[] = [];
	const mailer: Mailer = { send: async (message) => void sent.push(message) };
	return { sent, mailer };
}

const linkTo = (token: string) => `https://unitati.test/handover/${token}`;

async function workspace(options: { templates?: boolean; slug?: string } = {}) {
	const organisation = await createOrganisation('Acme', options.slug ?? 'acme');
	if (options.templates !== false) await ensureDefaultHandoverTemplates(getDb(), organisation.id);
	const admin = await createViewer(organisation.id, 'admin', 'Root Admin');
	const technician = await createViewer(organisation.id, 'technician', 'Grace Hopper');
	const laptops = await createCatalogue(organisation.id);
	const mice = await createCatalogue(organisation.id, 'MX Master', 'Logitech', 'Mice');
	await setCategoryRequiresHandover(admin, laptops.categoryId, true);
	const ada = await createPerson(organisation.id, 'Ada Lovelace', 'ada@acme.test');
	const grace = await createPerson(organisation.id, 'Grace Murray', 'grace@acme.test');
	return { organisation, technician, laptops, mice, ada, grace };
}

/** Custody recorded the way history is: no handover. */
async function holds(
	technician: Awaited<ReturnType<typeof workspace>>['technician'],
	organisationId: string,
	modelId: string,
	personId: string,
	name: string
) {
	const asset = await createAsset(organisationId, modelId, { name });
	const outcome = await assignCustody(technician, asset.id, personId);
	if (!outcome.ok) throw new Error('setup');
	return asset;
}

describe('regulariseCustody', () => {
	it('issues one pending delivery handover for what a person already holds, and mails the link', async () => {
		const { organisation, technician, laptops, ada } = await workspace();
		const laptop = await holds(technician, organisation.id, laptops.modelId, ada.id, 'Laptop');
		const { sent, mailer } = recordingMailer();

		const result = await regulariseCustody(technician, { personId: ada.id }, { mailer, linkTo });

		expect(result.issued).toHaveLength(1);
		expect(result.skipped).toEqual([]);
		const [issued] = result.issued;
		expect(issued).toMatchObject({ personId: ada.id, personName: 'Ada Lovelace', assetCount: 1 });
		expect(sent).toHaveLength(1);
		expect(sent[0]?.to).toBe('ada@acme.test');
		expect(sent[0]?.text).toContain(linkTo(issued!.token));

		// The custody itself is untouched: only the handover is new.
		const opened = await openHandover(issued!.token);
		expect(opened).toMatchObject({ state: 'pending', direction: 'delivery' });
		const [row] = await getDb().select().from(handovers).where(eq(handovers.code, issued!.code));
		expect(row).toMatchObject({ direction: 'delivery', status: 'pending', personId: ada.id });
		expect(laptop.id).toBeDefined();
	});

	it('runs a campaign: one handover per person, only for the chosen category', async () => {
		const { organisation, technician, laptops, mice, ada, grace } = await workspace();
		await holds(technician, organisation.id, laptops.modelId, ada.id, 'Ada laptop');
		await holds(technician, organisation.id, mice.modelId, ada.id, 'Ada mouse');
		await holds(technician, organisation.id, laptops.modelId, grace.id, 'Grace laptop');

		const result = await regulariseCustody(
			technician,
			{ categoryId: laptops.categoryId },
			{ mailer: null, linkTo }
		);

		expect(result.issued.map((item) => [item.personName, item.assetCount]).sort()).toEqual([
			['Ada Lovelace', 1],
			['Grace Murray', 1]
		]);
		expect(await getDb().select().from(handovers)).toHaveLength(2);
	});

	it('lists every uncovered asset of the person when no category is chosen', async () => {
		const { organisation, technician, laptops, mice, ada } = await workspace();
		await holds(technician, organisation.id, laptops.modelId, ada.id, 'Laptop');
		await holds(technician, organisation.id, mice.modelId, ada.id, 'Mouse');

		const result = await regulariseCustody(technician, {}, { mailer: null, linkTo });

		expect(result.issued).toMatchObject([{ personId: ada.id, assetCount: 2 }]);
	});

	it('skips what a person already answers for, so running twice sends one link', async () => {
		const { organisation, technician, laptops, ada } = await workspace();
		await holds(technician, organisation.id, laptops.modelId, ada.id, 'Laptop');
		const deps = { mailer: null, linkTo };
		await regulariseCustody(technician, {}, deps);

		const again = await regulariseCustody(technician, {}, deps);

		expect(again).toEqual({ issued: [], skipped: [] });
		expect(await getDb().select().from(handovers)).toHaveLength(1);
	});

	it('does not touch custody delivered with a handover from the start', async () => {
		const { organisation, technician, laptops, ada } = await workspace();
		const laptop = await createAsset(organisation.id, laptops.modelId, { name: 'Laptop' });
		await deliver(
			technician,
			{ personId: ada.id, assetIds: [laptop.id] },
			{ mailer: null, linkTo }
		);

		const result = await regulariseCustody(technician, {}, { mailer: null, linkTo });

		expect(result).toEqual({ issued: [], skipped: [] });
	});

	it('issues again after a rejection, because a rejected handover answers for nothing', async () => {
		const { organisation, technician, laptops, ada } = await workspace();
		await holds(technician, organisation.id, laptops.modelId, ada.id, 'Laptop');
		const deps = { mailer: null, linkTo };
		const first = await regulariseCustody(technician, {}, deps);
		const token = first.issued[0]!.token;
		await decideHandover(
			token,
			'reject',
			{ ip: '203.0.113.7', userAgent: 'test', reason: 'Not mine' },
			{ storage: new InMemoryStorage(), mailer: null }
		);

		const second = await regulariseCustody(technician, {}, deps);

		expect(second.issued).toHaveLength(1);
		expect(second.issued[0]!.code).not.toBe(first.issued[0]!.code);
	});

	it('does not ask for a signature on equipment whose category requires none', async () => {
		const { organisation, technician, mice, ada } = await workspace();
		await holds(technician, organisation.id, mice.modelId, ada.id, 'Mouse');

		const result = await regulariseCustody(technician, {}, { mailer: null, linkTo });

		expect(result.issued).toEqual([]);
		expect(result.skipped).toEqual([
			{ personId: ada.id, personName: 'Ada Lovelace', reason: 'no_requirement' }
		]);
	});

	it('reports a person it cannot issue for when the delivery template is missing', async () => {
		const { organisation, technician, laptops, ada } = await workspace({ templates: false });
		await holds(technician, organisation.id, laptops.modelId, ada.id, 'Laptop');

		const result = await regulariseCustody(technician, {}, { mailer: null, linkTo });

		expect(result.skipped).toMatchObject([{ personId: ada.id, reason: 'no_template' }]);
	});

	it('never reaches another organisation', async () => {
		const mine = await workspace();
		const other = await createOrganisation('Other', 'other');
		await ensureDefaultHandoverTemplates(getDb(), other.id);
		const stranger = await createViewer(other.id, 'technician', 'Alan Turing');
		const catalogue = await createCatalogue(other.id);
		await setCategoryRequiresHandover(
			await createViewer(other.id, 'admin', 'Other Admin'),
			catalogue.categoryId,
			true
		);
		const holder = await createPerson(other.id, 'Edsger Dijkstra', 'edsger@other.test');
		await holds(stranger, other.id, catalogue.modelId, holder.id, 'Foreign laptop');

		const result = await regulariseCustody(mine.technician, {}, { mailer: null, linkTo });

		expect(result).toEqual({ issued: [], skipped: [] });
	});
});
