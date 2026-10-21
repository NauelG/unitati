import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { extractText, getDocumentProxy } from 'unpdf';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../db';
import { resetBrandCache, setBrandAsset } from '../directory';
import type { Mailer, MailMessage } from '../shared/mail';
import { InMemoryStorage, type Storage } from '../shared/storage';
import {
	decideHandover,
	deliver,
	ensureDefaultHandoverTemplates,
	ensureHandoverDocument,
	setCategoryRequiresHandover
} from '.';
import { renderHandoverDocument } from './handover-document';
import { handovers } from './schema';
import {
	createAsset,
	createCatalogue,
	createOrganisation,
	createPerson,
	createViewer
} from './testing/fixtures';
import { drawnSignature } from './testing/png';

/** ADR 0036, #276: the document is generated once, at decision time, stored and mailed. */

/** Remembers every key it holds, so a spec can see what a race left behind. */
class ListableStorage implements Storage {
	readonly files = new Map<string, Uint8Array>();
	async put(key: string, data: Uint8Array) {
		this.files.set(key, data);
	}
	async get(key: string) {
		return this.files.get(key) ?? null;
	}
	async delete(key: string) {
		this.files.delete(key);
	}
	pdfs(): string[] {
		return [...this.files.keys()].filter((key) => key.endsWith('.pdf'));
	}
}

function recordingMailer() {
	const sent: MailMessage[] = [];
	const mailer: Mailer = { send: async (message) => void sent.push(message) };
	return { sent, mailer };
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function textOf(bytes: Uint8Array): Promise<string> {
	const pdf = await getDocumentProxy(new Uint8Array(bytes));
	return (await extractText(pdf, { mergePages: true })).text.replace(/\s+/g, ' ');
}

const evidence = { ip: '203.0.113.7', userAgent: 'Mozilla/5.0 (iPhone)' };
const later = () => new Date('2026-10-21T10:00:00Z');

afterEach(() => {
	resetBrandCache();
	vi.restoreAllMocks();
});

async function pending() {
	const organisation = await createOrganisation();
	await ensureDefaultHandoverTemplates(getDb(), organisation.id);
	const admin = await createViewer(organisation.id, 'admin', 'Root Admin');
	const technician = await createViewer(organisation.id, 'technician', 'Grace Hopper');
	const ada = await createPerson(organisation.id, 'Ada Lovelace');
	const laptops = await createCatalogue(organisation.id);
	await setCategoryRequiresHandover(admin, laptops.categoryId, true);
	const laptop = await createAsset(organisation.id, laptops.modelId, { name: 'Laptop' });
	const spare = await createAsset(organisation.id, laptops.modelId, { name: 'Spare laptop' });

	const delivered = await deliver(
		technician,
		{ personId: ada.id, assetIds: [laptop.id, spare.id] },
		{ mailer: null, linkTo: (token) => token, now: () => new Date('2026-10-20T10:00:00Z') }
	);
	if (!delivered.ok || delivered.value.handover?.status !== 'pending') {
		throw new Error('setup: no pending handover');
	}
	const { handover } = delivered.value;
	const [row] = await getDb().select().from(handovers).where(eq(handovers.id, handover.id));

	return { organisation, admin, technician, ada, assets: [laptop, spare], handover, row };
}

async function stored(handoverId: string) {
	const [row] = await getDb().select().from(handovers).where(eq(handovers.id, handoverId));
	return row;
}

describe('the document of a decided handover', () => {
	it('is stored when the handover is accepted, under the hash the handover keeps', async () => {
		const { handover, row, assets } = await pending();
		const storage = new ListableStorage();

		const outcome = await decideHandover(
			handover.token,
			'accept',
			{ ...evidence, signature: drawnSignature() },
			{ storage, mailer: null, now: later }
		);

		expect(outcome.ok).toBe(true);
		const after = await stored(handover.id);
		expect(after.documentStorageKey).toBeTruthy();
		const bytes = await storage.get(after.documentStorageKey!);
		expect(bytes).not.toBeNull();
		expect(sha256(bytes!)).toBe(after.documentSha256);

		const text = await textOf(bytes!);
		expect(text).toContain(handover.code);
		for (const asset of assets) expect(text).toContain(asset.assetTag);
		expect(text).toContain(row.bodySha256!);
		expect(text).toContain('Ada Lovelace');
		expect(text).toContain('Grace Hopper');
		expect(text).toContain('203.0.113.7');
	});

	it('is stored for a rejection too, with its reason', async () => {
		const { handover } = await pending();
		const storage = new ListableStorage();

		await decideHandover(
			handover.token,
			'reject',
			{ ...evidence, reason: 'Wrong serial' },
			{ storage, mailer: null, now: later }
		);

		const after = await stored(handover.id);
		const text = await textOf((await storage.get(after.documentStorageKey!))!);
		expect(text).toContain('Rechazada');
		expect(text).toContain('Wrong serial');
	});

	it('is mailed, as one PDF attachment, to the person and to the issuing technician', async () => {
		const { handover, technician, row } = await pending();
		const storage = new ListableStorage();
		const { sent, mailer } = recordingMailer();

		await decideHandover(
			handover.token,
			'accept',
			{ ...evidence, signature: drawnSignature() },
			{ storage, mailer, now: later }
		);

		await vi.waitFor(() => expect(sent).toHaveLength(2));
		expect(sent.map((message) => message.to).sort()).toEqual(
			[row.recipientEmailSnapshot, technician.email].sort()
		);
		const after = await stored(handover.id);
		for (const message of sent) {
			expect(message.subject).toContain(handover.code);
			expect(message.attachments).toHaveLength(1);
			expect(message.attachments![0]).toMatchObject({
				contentType: 'application/pdf',
				filename: `${handover.code}.pdf`
			});
			expect(sha256(message.attachments![0].content)).toBe(after.documentSha256);
		}
	});

	it('goes to the issuer of a rejection inside the rejection mail', async () => {
		const { handover, technician } = await pending();
		const { sent, mailer } = recordingMailer();

		await decideHandover(
			handover.token,
			'reject',
			{ ...evidence, reason: 'Wrong serial' },
			{ storage: new ListableStorage(), mailer, now: later }
		);

		await vi.waitFor(() => expect(sent).toHaveLength(2));
		const toIssuer = sent.find((message) => message.to === technician.email)!;
		expect(toIssuer.text).toContain('Wrong serial');
		expect(toIssuer.attachments?.[0].contentType).toBe('application/pdf');
	});

	it('is mailed only to the person when no person issued the handover', async () => {
		const { handover, row } = await pending();
		await getDb()
			.update(handovers)
			.set({ issuedByPersonId: null })
			.where(eq(handovers.id, handover.id));
		const { sent, mailer } = recordingMailer();

		await decideHandover(
			handover.token,
			'accept',
			{ ...evidence, signature: drawnSignature() },
			{ storage: new ListableStorage(), mailer, now: later }
		);

		await vi.waitFor(() => expect(sent).toHaveLength(1));
		expect(sent[0].to).toBe(row.recipientEmailSnapshot);
	});

	it('prints the organisation lockup when it has one', async () => {
		const { handover, admin } = await pending();
		const lockup = await sharp({
			create: { width: 200, height: 60, channels: 3, background: '#1d5cf0' }
		})
			.png()
			.toBuffer();
		expect((await setBrandAsset(admin, 'lockup', lockup)).ok).toBe(true);
		const storage = new ListableStorage();

		await decideHandover(
			handover.token,
			'accept',
			{ ...evidence, signature: drawnSignature() },
			{ storage, mailer: null, now: later }
		);

		expect((await stored(handover.id)).documentSha256).toBeTruthy();
	});
});

describe('ensureHandoverDocument', () => {
	it('stores one document however often it is called, and returns the same hash', async () => {
		const { handover } = await pending();
		const storage = new ListableStorage();
		const { sent, mailer } = recordingMailer();
		const deps = { storage, mailer, now: later };
		await decideHandover(
			handover.token,
			'accept',
			{ ...evidence, signature: drawnSignature() },
			deps
		);
		await vi.waitFor(() => expect(sent).toHaveLength(2));

		const first = await ensureHandoverDocument(handover.id, deps);
		const second = await ensureHandoverDocument(handover.id, deps);

		expect(first.ok && second.ok).toBe(true);
		if (!first.ok || !second.ok) return;
		expect(second.value.sha256).toBe(first.value.sha256);
		expect(first.value.sha256).toBe((await stored(handover.id)).documentSha256);
		expect(storage.pdfs()).toHaveLength(1);
		// Nothing new was stored, so nothing new was sent.
		expect(sent).toHaveLength(2);
	});

	it('lets the first of two concurrent attempts win, and the second keep nothing', async () => {
		const { handover } = await pending();
		const storage = new ListableStorage();
		const failing = async () => {
			throw new Error('forced render failure');
		};
		vi.spyOn(console, 'error').mockImplementation(() => {});
		await decideHandover(
			handover.token,
			'accept',
			{ ...evidence, signature: drawnSignature() },
			{ storage, mailer: null, now: later, render: failing }
		);

		// Two renders of different bytes, so a replaced document would show.
		let calls = 0;
		const distinct = async (input: Parameters<typeof renderHandoverDocument>[0]) => {
			const bytes = await renderHandoverDocument(input);
			return new Uint8Array([...bytes, 0x0a, ++calls]);
		};
		const [a, b] = await Promise.all([
			ensureHandoverDocument(handover.id, { storage, mailer: null, render: distinct }),
			ensureHandoverDocument(handover.id, { storage, mailer: null, render: distinct })
		]);

		expect(a.ok && b.ok).toBe(true);
		if (!a.ok || !b.ok) return;
		expect(a.value.sha256).toBe(b.value.sha256);
		const after = await stored(handover.id);
		expect(storage.pdfs()).toEqual([after.documentStorageKey]);
		expect(sha256((await storage.get(after.documentStorageKey!))!)).toBe(after.documentSha256);
	});

	it('leaves the decision standing when the render fails, and generates the document later', async () => {
		const { handover } = await pending();
		const storage = new ListableStorage();
		const { sent, mailer } = recordingMailer();
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

		const outcome = await decideHandover(
			handover.token,
			'accept',
			{ ...evidence, signature: drawnSignature() },
			{
				storage,
				mailer,
				now: later,
				render: async () => {
					throw new Error('forced render failure');
				}
			}
		);

		expect(outcome).toEqual({ ok: true, value: { status: 'accepted' } });
		const after = await stored(handover.id);
		expect(after).toMatchObject({
			status: 'accepted',
			documentStorageKey: null,
			documentSha256: null
		});
		expect(logged).toHaveBeenCalled();
		expect(storage.pdfs()).toEqual([]);
		expect(sent).toEqual([]);

		const retried = await ensureHandoverDocument(handover.id, { storage, mailer });

		expect(retried.ok).toBe(true);
		const fixed = await stored(handover.id);
		expect(fixed.documentSha256).toBeTruthy();
		expect(sha256((await storage.get(fixed.documentStorageKey!))!)).toBe(fixed.documentSha256);
		// The person never got their copy at decision time; they get it now.
		await vi.waitFor(() => expect(sent).toHaveLength(2));
	});

	it('refuses a handover nobody has decided, and an unknown one', async () => {
		const { handover } = await pending();
		const deps = { storage: new ListableStorage(), mailer: null };

		expect(await ensureHandoverDocument(handover.id, deps)).toEqual({
			ok: false,
			error: 'not_decided'
		});
		expect(await ensureHandoverDocument(crypto.randomUUID(), deps)).toEqual({
			ok: false,
			error: 'not_found'
		});
	});
});

it('keeps the issuer mail of a rejection when the document cannot be generated', async () => {
	const { handover, technician } = await pending();
	const { sent, mailer } = recordingMailer();
	vi.spyOn(console, 'error').mockImplementation(() => {});

	await decideHandover(
		handover.token,
		'reject',
		{ ...evidence, reason: 'Wrong serial' },
		{
			storage: new InMemoryStorage(),
			mailer,
			now: later,
			render: async () => {
				throw new Error('forced render failure');
			}
		}
	);

	await vi.waitFor(() => expect(sent).toHaveLength(1));
	expect(sent[0]).toMatchObject({ to: technician.email });
	expect(sent[0].text).toContain('Wrong serial');
	expect(sent[0].attachments ?? []).toEqual([]);
});
