import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { activity } from '../activity/schema';
import { getDb } from '../db';
import {
	flushEvents,
	on,
	resetSubscriptions,
	setDispatchMode,
	type DomainEvents
} from '../shared/events';
import type { Mailer, MailMessage } from '../shared/mail';
import { InMemoryStorage } from '../shared/storage';
import {
	decideHandover,
	deliver,
	ensureDefaultHandoverTemplates,
	openHandover,
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
import { drawnSignature, png, transparent } from './testing/png';

/** ADR 0035, decisions 3, 4 and 6: deciding a handover through its signing link (#275). */

function recordingMailer() {
	const sent: MailMessage[] = [];
	const mailer: Mailer = { send: async (message) => void sent.push(message) };
	return { sent, mailer };
}

const evidence = { ip: '203.0.113.7', userAgent: 'Mozilla/5.0 (iPhone)' };

let events: { name: string; event: unknown }[];

beforeEach(() => {
	resetSubscriptions();
	setDispatchMode('sync');
	events = [];
	for (const name of ['handover.accepted', 'handover.rejected'] as const) {
		on(name, (event: DomainEvents[typeof name]) => void events.push({ name, event }));
	}
});

/** A pending handover of two assets, one requiring it, and its plain token. */
async function pending() {
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
	const laptop = await createAsset(organisation.id, laptops.modelId, { name: 'Laptop' });
	const mouse = await createAsset(organisation.id, mice.modelId, { name: 'Mouse' });

	const now = new Date('2026-10-20T10:00:00Z');
	const delivered = await deliver(technician, ada.id, [laptop.id, mouse.id], {
		mailer: null,
		linkTo: (token) => token,
		now: () => now
	});
	if (!delivered.ok || !delivered.value.handover) throw new Error('setup: no handover');
	const storage = new InMemoryStorage();

	return {
		organisation,
		technician,
		ada,
		assets: [laptop, mouse],
		handover: delivered.value.handover,
		token: delivered.value.handover.token,
		storage,
		issuedAt: now
	};
}

const later = () => new Date('2026-10-21T10:00:00Z');

describe('openHandover', () => {
	it('shows a pending handover: its code, text and asset snapshots', async () => {
		const { token, handover, organisation } = await pending();

		const view = await openHandover(token, { now: later });

		expect(view).toMatchObject({
			state: 'pending',
			organisationId: organisation.id,
			code: handover.code,
			direction: 'delivery'
		});
		if (view.state !== 'pending') throw new Error('expected pending');
		expect(view.body).toContain('Ada Lovelace');
		expect(view.assets.map((a) => a.name).sort()).toEqual(['Laptop', 'Mouse']);
		expect(view.assets[0]).toHaveProperty('model');
	});

	it('tells an unknown, an expired and a decided link apart, and reveals nothing else', async () => {
		const { token, storage, organisation } = await pending();
		const organisationId = organisation.id;

		expect(await openHandover('not-a-token', { now: later })).toEqual({ state: 'unknown' });
		expect(await openHandover(token, { now: () => new Date('2027-01-01T00:00:00Z') })).toEqual({
			state: 'expired',
			organisationId
		});

		await decideHandover(
			token,
			'reject',
			{ ...evidence, reason: 'Wrong laptop' },
			{
				storage,
				mailer: null,
				now: later
			}
		);
		expect(await openHandover(token, { now: later })).toEqual({ state: 'decided', organisationId });
	});
});

describe('decideHandover', () => {
	it('accepts: stores the signature and the evidence, consumes the link, logs and emits', async () => {
		const { token, handover, storage, ada, assets } = await pending();
		const signature = drawnSignature();

		const outcome = await decideHandover(
			token,
			'accept',
			{ ...evidence, signature },
			{
				storage,
				mailer: null,
				now: later
			}
		);

		expect(outcome).toEqual({ ok: true, value: { status: 'accepted' } });
		const [row] = await getDb().select().from(handovers).where(eq(handovers.id, handover.id));
		expect(row).toMatchObject({
			status: 'accepted',
			decidedAt: later(),
			signerIp: '203.0.113.7',
			signerUserAgent: 'Mozilla/5.0 (iPhone)',
			tokenHash: null,
			consumedTokenHash: createHash('sha256').update(token).digest('hex'),
			decisionReason: null
		});
		expect(row.signatureStorageKey).toBeTruthy();
		expect(await storage.get(row.signatureStorageKey!)).toEqual(signature);

		const entries = (await getDb().select().from(activity)).filter(
			(entry) => entry.verb === 'handover.accepted'
		);
		expect(entries).toHaveLength(3); // two assets and the person
		expect(entries.filter((entry) => entry.personId === ada.id)).toHaveLength(1);
		expect(entries.map((entry) => entry.assetId).filter(Boolean)).toEqual(
			expect.arrayContaining(assets.map((asset) => asset.id))
		);
		expect(entries.every((entry) => entry.actorPersonId === ada.id)).toBe(true);

		// Dispatched only after commit; the sync mode lets the spec wait for it.
		await flushEvents();
		expect(events).toEqual([
			{
				name: 'handover.accepted',
				event: {
					organisationId: row.organisationId,
					handoverId: handover.id,
					handoverCode: handover.code,
					direction: 'delivery',
					personId: ada.id,
					personName: 'Ada Lovelace',
					occurredAt: later()
				}
			}
		]);
	});

	it('changes nothing the second time the same link is used', async () => {
		const { token, storage } = await pending();
		const deps = { storage, mailer: null, now: later };
		await decideHandover(token, 'accept', { ...evidence, signature: drawnSignature() }, deps);
		const before = await getDb().select().from(handovers);
		const logged = (await getDb().select().from(activity)).length;
		await flushEvents();
		events = [];

		expect(await decideHandover(token, 'reject', { ...evidence, reason: 'No' }, deps)).toEqual({
			ok: false,
			error: 'already_decided'
		});
		expect(await getDb().select().from(handovers)).toEqual(before);
		expect((await getDb().select().from(activity)).length).toBe(logged);
		await flushEvents();
		expect(events).toEqual([]);
	});

	it('refuses an expired link and an unknown one', async () => {
		const { token, storage } = await pending();
		const deps = { storage, mailer: null, now: () => new Date('2027-01-01T00:00:00Z') };

		expect(
			await decideHandover(token, 'accept', { ...evidence, signature: drawnSignature() }, deps)
		).toEqual({ ok: false, error: 'expired' });
		expect(await decideHandover('forged', 'reject', { ...evidence, reason: 'x' }, deps)).toEqual({
			ok: false,
			error: 'unknown'
		});
		const [row] = await getDb().select().from(handovers);
		expect(row.status).toBe('pending');
	});

	it('refuses an acceptance without a drawn signature', async () => {
		const { token, storage } = await pending();
		const deps = { storage, mailer: null, now: later };

		expect(await decideHandover(token, 'accept', evidence, deps)).toEqual({
			ok: false,
			error: 'signature_missing'
		});
		expect(
			await decideHandover(
				token,
				'accept',
				{ ...evidence, signature: png(40, 20, transparent) },
				deps
			)
		).toEqual({ ok: false, error: 'signature_blank' });
		const [row] = await getDb().select().from(handovers);
		expect(row.status).toBe('pending');
	});

	it('rejects only with a reason, and mails the issuer', async () => {
		const { token, handover, storage, technician } = await pending();
		const { sent, mailer } = recordingMailer();
		const deps = { storage, mailer, now: later };

		for (const reason of [undefined, '   ', 'x'.repeat(1001)]) {
			expect(await decideHandover(token, 'reject', { ...evidence, reason }, deps)).toEqual({
				ok: false,
				error: 'invalid_reason'
			});
		}

		const outcome = await decideHandover(
			token,
			'reject',
			{ ...evidence, reason: '  The serial does not match  ' },
			deps
		);

		expect(outcome).toEqual({ ok: true, value: { status: 'rejected' } });
		const [row] = await getDb().select().from(handovers);
		expect(row).toMatchObject({
			status: 'rejected',
			decisionReason: 'The serial does not match',
			signatureStorageKey: null,
			tokenHash: null
		});

		await vi.waitFor(() => expect(sent).toHaveLength(1));
		expect(sent[0].to).toBe(technician.email);
		expect(sent[0].subject).toContain(handover.code);
		expect(sent[0].text).toContain('Ada Lovelace');
		expect(sent[0].text).toContain('The serial does not match');

		await flushEvents();
		expect(events).toMatchObject([
			{ name: 'handover.rejected', event: { reason: 'The serial does not match' } }
		]);
	});

	it('enforces the decided-state evidence in the database', async () => {
		const { handover } = await pending();

		await expect(
			getDb().update(handovers).set({ status: 'accepted' }).where(eq(handovers.id, handover.id))
		).rejects.toThrow();
		await expect(
			getDb().update(handovers).set({ status: 'rejected' }).where(eq(handovers.id, handover.id))
		).rejects.toThrow();
	});
});
