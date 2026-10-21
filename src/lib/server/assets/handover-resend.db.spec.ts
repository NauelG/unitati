import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { listActivity } from '../activity';
import { getDb } from '../db';
import type { Mailer, MailMessage } from '../shared/mail';
import { InMemoryStorage } from '../shared/storage';
import {
	decideHandover,
	deliver,
	ensureDefaultHandoverTemplates,
	openHandover,
	resendHandover,
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
import { drawnSignature } from './testing/png';

/** Re-sending a link that was lost or has lapsed (#280, ADR 0035). */

const day = 24 * 60 * 60 * 1000;
const issuedAt = new Date('2026-10-01T10:00:00Z');
const afterExpiry = () => new Date(issuedAt.getTime() + 30 * day);

async function setup() {
	const organisation = await createOrganisation();
	await ensureDefaultHandoverTemplates(getDb(), organisation.id);
	const technician = await createViewer(organisation.id, 'technician', 'Grace Hopper');
	const admin = await createViewer(organisation.id, 'admin', 'Root Admin');
	const catalogue = await createCatalogue(organisation.id);
	await setCategoryRequiresHandover(admin, catalogue.categoryId, true);
	const ada = await createPerson(organisation.id, 'Ada Lovelace', 'ada@acme.test');
	const asset = await createAsset(organisation.id, catalogue.modelId, { name: 'Laptop' });
	const delivered = await deliver(
		technician,
		{ personId: ada.id, assetIds: [asset.id] },
		{ mailer: null, linkTo: (token) => token, now: () => issuedAt }
	);
	if (!delivered.ok || delivered.value.handover?.status !== 'pending') throw new Error('setup');
	const sent: MailMessage[] = [];
	const mailer: Mailer = { send: async (message) => void sent.push(message) };
	return {
		technician,
		ada,
		asset,
		handover: delivered.value.handover,
		sent,
		mailer,
		resendDeps: {
			mailer,
			linkTo: (token: string) => `https://x.test/handover/${token}`,
			now: afterExpiry
		}
	};
}

describe('resendHandover', () => {
	it('revives an expired handover: the old link fails, the new one opens it', async () => {
		const { technician, handover, resendDeps } = await setup();
		expect((await openHandover(handover.token, { now: afterExpiry })).state).toBe('expired');

		const outcome = await resendHandover(technician, handover.code, resendDeps);

		if (!outcome.ok) throw new Error('expected resent');
		expect(outcome.value.link).toBe(`https://x.test/handover/${outcome.value.token}`);
		expect(outcome.value.expiresAt.getTime()).toBe(afterExpiry().getTime() + 14 * day);
		expect(await openHandover(handover.token, { now: afterExpiry })).toEqual({ state: 'unknown' });
		const reopened = await openHandover(outcome.value.token, { now: afterExpiry });
		expect(reopened).toMatchObject({ state: 'pending', code: handover.code });
	});

	it('keeps the agreement the person was shown: only the link and the date change', async () => {
		const { technician, handover, resendDeps } = await setup();
		const [before] = await getDb()
			.select()
			.from(handovers)
			.where(eq(handovers.code, handover.code));

		await resendHandover(technician, handover.code, resendDeps);

		const [after] = await getDb().select().from(handovers).where(eq(handovers.code, handover.code));
		expect(after.bodySnapshot).toBe(before.bodySnapshot);
		expect(after.bodySha256).toBe(before.bodySha256);
		expect(after.issuedAt).toEqual(before.issuedAt);
		expect(after.tokenHash).not.toBe(before.tokenHash);
		expect(after.status).toBe('pending');
	});

	it('writes handover.resent on the asset and the person, without any token', async () => {
		const { technician, asset, ada, handover, resendDeps } = await setup();

		const outcome = await resendHandover(technician, handover.code, resendDeps);
		if (!outcome.ok) throw new Error('expected resent');

		for (const target of [{ assetId: asset.id }, { personId: ada.id }]) {
			const entries = await listActivity({ organisationId: technician.organisationId, target });
			const resent = entries.filter((entry) => entry.verb === 'handover.resent');
			expect(resent).toHaveLength(1);
			expect(resent[0]).toMatchObject({
				actorName: 'Grace Hopper',
				payload: { code: handover.code, personName: 'Ada Lovelace' }
			});
			expect(JSON.stringify(resent[0].payload)).not.toContain(outcome.value.token);
		}
	});

	it('mails the new link to the person when mail is on, and sends nothing when it is off', async () => {
		const { technician, handover, sent, resendDeps } = await setup();

		await resendHandover(technician, handover.code, { ...resendDeps, mailer: null });
		expect(sent).toEqual([]);

		const outcome = await resendHandover(technician, handover.code, resendDeps);
		if (!outcome.ok) throw new Error('expected resent');
		await new Promise((resolve) => setTimeout(resolve));
		expect(sent).toHaveLength(1);
		expect(sent[0].to).toBe('ada@acme.test');
		expect(sent[0].text).toContain(outcome.value.link);
	});

	it('also resends a pending handover that has not expired', async () => {
		const { technician, handover, resendDeps } = await setup();

		const outcome = await resendHandover(technician, handover.code, {
			...resendDeps,
			now: () => new Date(issuedAt.getTime() + day)
		});

		expect(outcome.ok).toBe(true);
	});

	it('refuses a decided handover, and an unknown or foreign code', async () => {
		const { technician, handover, resendDeps } = await setup();
		await decideHandover(
			handover.token,
			'accept',
			{ ip: '203.0.113.7', userAgent: 'test', signature: drawnSignature() },
			{
				storage: new InMemoryStorage(),
				mailer: null,
				now: () => new Date(issuedAt.getTime() + day)
			}
		);
		const other = await createOrganisation('Other', 'other');
		const stranger = await createViewer(other.id, 'technician', 'Mallory');

		expect(await resendHandover(technician, handover.code, resendDeps)).toEqual({
			ok: false,
			error: 'not_resendable'
		});
		expect(await resendHandover(technician, 'HND-9999', resendDeps)).toEqual({
			ok: false,
			error: 'not_found'
		});
		expect(await resendHandover(stranger, handover.code, resendDeps)).toEqual({
			ok: false,
			error: 'not_found'
		});
	});

	it('needs assets.manage', async () => {
		const { technician, handover, resendDeps } = await setup();
		const employee = await createViewer(technician.organisationId, 'employee', 'Eve');

		await expect(resendHandover(employee, handover.code, resendDeps)).rejects.toThrow(
			/assets\.manage/
		);
	});
});
