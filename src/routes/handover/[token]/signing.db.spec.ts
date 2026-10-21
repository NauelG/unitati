import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mailer, MailMessage } from '#lib/server/shared/mail.js';
import { overrideRuntime } from '#lib/server/shared/runtime.js';
import { InMemoryStorage } from '#lib/server/shared/storage.js';
import { getDb } from '#lib/server/db/index.js';
import {
	deliver,
	ensureDefaultHandoverTemplates,
	setCategoryRequiresHandover
} from '#lib/server/assets/index.js';
import { handovers } from '#lib/server/assets/schema.js';
import {
	createAsset,
	createCatalogue,
	createOrganisation,
	createPerson,
	createViewer
} from '#lib/server/assets/testing/fixtures.js';
import { drawnSignature } from '#lib/server/assets/testing/png.js';
import { actions, load } from './+page.server';

/**
 * The public signing route (#275): no session is read, the token is the only
 * credential, and each state of the link has its own answer.
 */

let storage: InMemoryStorage;
let sent: MailMessage[];

beforeEach(() => {
	storage = new InMemoryStorage();
	sent = [];
	const mailer: Mailer = { send: async (message) => void sent.push(message) };
	overrideRuntime({ storage, mailer });
});

async function issued() {
	const organisation = await createOrganisation();
	await ensureDefaultHandoverTemplates(getDb(), organisation.id);
	const technician = await createViewer(organisation.id, 'technician', 'Grace Hopper');
	const ada = await createPerson(organisation.id, 'Ada Lovelace');
	const laptops = await createCatalogue(organisation.id);
	await setCategoryRequiresHandover(
		await createViewer(organisation.id, 'admin', 'Root Admin'),
		laptops.categoryId,
		true
	);
	const laptop = await createAsset(organisation.id, laptops.modelId, {
		name: 'Laptop',
		serial: 'SN-42'
	});
	const delivered = await deliver(
		technician,
		{ personId: ada.id, assetIds: [laptop.id] },
		{ mailer: null }
	);
	if (!delivered.ok || delivered.value.handover?.status !== 'pending') {
		throw new Error('setup: no pending handover');
	}
	return { technician, handover: delivered.value.handover };
}

function loadEvent(token: string) {
	const headers: Record<string, string> = {};
	const event = {
		params: { token },
		locals: { user: null },
		setHeaders: (h: Record<string, string>) => Object.assign(headers, h)
	};
	return { event: event as never, headers };
}

function postEvent(token: string, fields: Record<string, string>) {
	const data = new FormData();
	for (const [key, value] of Object.entries(fields)) data.append(key, value);
	return {
		params: { token },
		locals: { user: null },
		request: new Request(`http://localhost/handover/${token}`, {
			method: 'POST',
			body: data,
			headers: { 'user-agent': 'Mozilla/5.0 (Android)' }
		}),
		getClientAddress: () => '198.51.100.20'
	} as never;
}

const dataUrl = (bytes: Uint8Array) =>
	`data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;

type Loaded = Exclude<Awaited<ReturnType<typeof load>>, void>;

describe('/handover/[token]', () => {
	it('shows a pending handover with no session, and never lets it be cached or leaked', async () => {
		const { handover } = await issued();
		const { event, headers } = loadEvent(handover.token);

		const data = (await load(event)) as Loaded;

		expect(data.signing).toMatchObject({ state: 'pending', code: handover.code });
		if (data.signing.state !== 'pending') throw new Error('expected pending');
		expect(data.signing.bodyHtml).toContain('<strong>Ada Lovelace</strong>');
		expect(data.signing.assets).toEqual([
			{ assetTag: expect.any(String), name: 'Laptop', serial: 'SN-42', model: 'MacBook Pró' }
		]);
		expect(headers).toMatchObject({
			'Cache-Control': 'no-store',
			'Referrer-Policy': 'no-referrer'
		});
	});

	it('answers an unknown link with the state alone', async () => {
		await issued();
		const data = (await load(loadEvent('nope').event)) as Loaded;
		expect(data).toEqual({ signing: { state: 'unknown' } });
	});

	it('accepts with a confirmation and a drawn signature, then reads as decided', async () => {
		const { handover } = await issued();

		const unconfirmed = await actions.accept(
			postEvent(handover.token, { signature: dataUrl(drawnSignature()) })
		);
		expect(unconfirmed).toMatchObject({ status: 400 });

		const unsigned = await actions.accept(
			postEvent(handover.token, { confirm: 'on', signature: '' })
		);
		expect(unsigned).toMatchObject({ status: 400 });

		const accepted = await actions.accept(
			postEvent(handover.token, { confirm: 'on', signature: dataUrl(drawnSignature()) })
		);
		expect(accepted).toEqual({ action: 'accept', decided: 'accepted' });

		const [row] = await getDb().select().from(handovers).where(eq(handovers.id, handover.id));
		expect(row).toMatchObject({
			status: 'accepted',
			signerIp: '198.51.100.20',
			signerUserAgent: 'Mozilla/5.0 (Android)',
			tokenHash: null
		});
		expect(await storage.get(row.signatureStorageKey!)).toEqual(drawnSignature());

		// The reload after signing.
		const again = (await load(loadEvent(handover.token).event)) as Loaded;
		expect(again).toMatchObject({ signing: { state: 'decided' } });
		expect(Object.keys(again.signing)).toEqual(['state']);
		expect(again.brand).toBeDefined();
		expect(
			await actions.reject(postEvent(handover.token, { reason: 'Changed my mind' }))
		).toMatchObject({ status: 409, data: { state: 'decided' } });
	});

	it('rejects only with a reason, and mails the technician who issued it', async () => {
		const { handover, technician } = await issued();

		expect(await actions.reject(postEvent(handover.token, { reason: '  ' }))).toMatchObject({
			status: 400
		});

		const rejected = await actions.reject(
			postEvent(handover.token, { reason: 'The laptop is not mine' })
		);
		expect(rejected).toEqual({ action: 'reject', decided: 'rejected' });
		await vi.waitFor(() => expect(sent).toHaveLength(1));
		expect(sent[0]).toMatchObject({ to: technician.email });
		expect(sent[0].text).toContain('The laptop is not mine');
	});

	it('refuses to decide an expired link', async () => {
		const { handover } = await issued();
		await getDb()
			.update(handovers)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.where(eq(handovers.id, handover.id));

		expect(await load(loadEvent(handover.token).event)).toMatchObject({
			signing: { state: 'expired' }
		});
		expect(
			await actions.accept(
				postEvent(handover.token, { confirm: 'on', signature: dataUrl(drawnSignature()) })
			)
		).toMatchObject({ status: 409, data: { state: 'expired' } });
	});
});
