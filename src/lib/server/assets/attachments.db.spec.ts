import { describe, expect, it } from 'vitest';
import { MAX_ATTACHMENT_BYTES } from '#lib/domain/attachments.js';
import { listActivity } from '../activity';
import { getDb } from '../db';
import type { UploadedFile } from '../shared/attachments';
import { InMemoryStorage } from '../shared/storage';
import {
	addAssetAttachments,
	getAssetAttachment,
	listAssetAttachments,
	removeAssetAttachment
} from './index';
import { assetAttachments, assets } from './schema';
import { eq } from 'drizzle-orm';
import { createAsset, createCatalogue, createOrganisation, createViewer } from './testing/fixtures';

/** Remembers every key it was ever given, so a leftover can be told from a clean slate. */
class RecordingStorage extends InMemoryStorage {
	readonly written: string[] = [];
	failDeletes = false;

	override async put(key: string, data: Uint8Array) {
		this.written.push(key);
		await super.put(key, data);
	}

	override async delete(key: string) {
		if (this.failDeletes) throw new Error('disk gone');
		await super.delete(key);
	}

	async stored() {
		const present: string[] = [];
		for (const key of this.written) if (await this.get(key)) present.push(key);
		return present;
	}
}

const file = (filename: string, size = 4, contentType = 'text/plain'): UploadedFile => ({
	filename,
	contentType,
	data: new Uint8Array(size).fill(7)
});

async function setup() {
	const organisation = await createOrganisation();
	const catalogue = await createCatalogue(organisation.id);
	const asset = await createAsset(organisation.id, catalogue.modelId);
	const technician = await createViewer(organisation.id, 'technician', 'Tess Technician');
	const employee = await createViewer(organisation.id, 'employee', 'Eve Employee');
	const storage = new RecordingStorage();
	return { organisation, asset, technician, employee, storage, deps: { storage } };
}

const unwrap = <T>(outcome: { ok: true; value: T } | { ok: false; error: string }): T => {
	if (!outcome.ok) throw new Error(JSON.stringify(outcome.error));
	return outcome.value;
};

const rows = () => getDb().select().from(assetAttachments);

describe('attachments on an asset', () => {
	it('stores, lists in order, downloads and removes a file, leaving a history', async () => {
		const w = await setup();

		const added = unwrap(
			await addAssetAttachments(
				w.technician,
				w.asset.id,
				[file('invoice.pdf'), file('warranty.png', 9, 'image/png')],
				w.deps
			)
		);
		expect(added.map((row) => row.filename)).toEqual(['invoice.pdf', 'warranty.png']);

		const listed = unwrap(await listAssetAttachments(w.technician, w.asset.id));
		expect(listed.map((row) => row.filename)).toEqual(['invoice.pdf', 'warranty.png']);
		expect(listed[1]).toMatchObject({ byteSize: 9, contentType: 'image/png' });

		const downloaded = unwrap(await getAssetAttachment(w.technician, added[0].id, w.deps));
		expect(downloaded).toMatchObject({ filename: 'invoice.pdf', contentType: 'text/plain' });
		expect(downloaded.data).toEqual(new Uint8Array(4).fill(7));

		expect((await removeAssetAttachment(w.technician, added[0].id, w.deps)).ok).toBe(true);
		expect(await rows()).toHaveLength(1);
		expect(await w.storage.stored()).toHaveLength(1);
		expect((await getAssetAttachment(w.technician, added[0].id, w.deps)).ok).toBe(false);

		const history = await listActivity({
			organisationId: w.organisation.id,
			target: { assetId: w.asset.id }
		});
		expect(history.map((entry) => entry.verb).sort()).toEqual([
			'asset.attachment.added',
			'asset.attachment.added',
			'asset.attachment.removed'
		]);
	});

	it('refuses a sixth file and a file over 10 MiB, storing nothing', async () => {
		const w = await setup();

		const six = await addAssetAttachments(
			w.technician,
			w.asset.id,
			Array.from({ length: 6 }, (_, i) => file(`f${i}.txt`)),
			w.deps
		);
		const big = await addAssetAttachments(
			w.technician,
			w.asset.id,
			[file('big.bin', MAX_ATTACHMENT_BYTES + 1)],
			w.deps
		);

		expect(six).toEqual({ ok: false, error: 'attachments_too_many' });
		expect(big).toEqual({ ok: false, error: 'attachments_too_large' });
		expect(await rows()).toHaveLength(0);
		expect(w.storage.written).toHaveLength(0);
	});

	it('hides the files from a viewer who does not see whole asset rows', async () => {
		const w = await setup();
		await getDb().update(assets).set({ shared: true }).where(eq(assets.id, w.asset.id));
		const [row] = unwrap(
			await addAssetAttachments(w.technician, w.asset.id, [file('invoice.pdf')], w.deps)
		);

		expect(await listAssetAttachments(w.employee, w.asset.id)).toEqual({
			ok: false,
			error: 'asset_not_found'
		});
		expect(await getAssetAttachment(w.employee, row.id, w.deps)).toEqual({
			ok: false,
			error: 'attachment_not_found'
		});
	});

	it('never confirms an asset or an attachment of another organisation', async () => {
		const w = await setup();
		const [row] = unwrap(
			await addAssetAttachments(w.technician, w.asset.id, [file('a.txt')], w.deps)
		);
		const other = await createOrganisation('Other', 'other');
		const stranger = await createViewer(other.id, 'admin', 'Mallory');

		expect(await getAssetAttachment(stranger, row.id, w.deps)).toEqual({
			ok: false,
			error: 'attachment_not_found'
		});
		expect(await listAssetAttachments(stranger, w.asset.id)).toEqual({
			ok: false,
			error: 'asset_not_found'
		});
		expect(await addAssetAttachments(stranger, w.asset.id, [file('x.txt')], w.deps)).toEqual({
			ok: false,
			error: 'asset_not_found'
		});
		expect(await removeAssetAttachment(stranger, row.id, w.deps)).toEqual({
			ok: false,
			error: 'attachment_not_found'
		});
		expect(await rows()).toHaveLength(1);
	});

	it('leaves no bytes behind when the asset does not exist', async () => {
		const w = await setup();

		const outcome = await addAssetAttachments(
			w.technician,
			crypto.randomUUID(),
			[file('a.txt')],
			w.deps
		);

		expect(outcome).toEqual({ ok: false, error: 'asset_not_found' });
		expect(await w.storage.stored()).toEqual([]);
	});

	it('leaves no orphaned bytes when the transaction fails after they were written', async () => {
		const w = await setup();

		// An empty filename is refused when the activity entry is validated, which
		// happens after the row is inserted and before the commit.
		await expect(
			addAssetAttachments(w.technician, w.asset.id, [file('ok.txt'), file('')], w.deps)
		).rejects.toThrow();

		expect(w.storage.written).toHaveLength(2);
		expect(await w.storage.stored()).toEqual([]);
		expect(await rows()).toHaveLength(0);
	});

	it('does not fail a removal when deleting the bytes fails after commit', async () => {
		const w = await setup();
		const [row] = unwrap(
			await addAssetAttachments(w.technician, w.asset.id, [file('a.txt')], w.deps)
		);
		w.storage.failDeletes = true;

		const outcome = await removeAssetAttachment(w.technician, row.id, w.deps);

		expect(outcome.ok).toBe(true);
		expect(await rows()).toHaveLength(0);
	});

	it('takes its files with it when the asset is deleted', async () => {
		const w = await setup();
		unwrap(await addAssetAttachments(w.technician, w.asset.id, [file('a.txt')], w.deps));

		await getDb().delete(assets).where(eq(assets.id, w.asset.id));

		expect(await rows()).toHaveLength(0);
	});
});
