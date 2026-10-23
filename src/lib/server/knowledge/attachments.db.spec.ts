import { asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { MAX_ATTACHMENT_BYTES } from '#lib/domain/attachments.js';
import { activity } from '../activity/schema';
import { getDb } from '../db';
import type { UploadedFile } from '../shared/attachments';
import { InMemoryStorage } from '../shared/storage';
import {
	addPageAttachments,
	getPageAttachment,
	listPageAttachments,
	removePageAttachment
} from './index';
import { pageAttachments, pageRevisions, pages } from './schema';
import { createPageRow, createSpaceRow, createWorkspace } from './testing/fixtures';

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

async function setup(options: { audience?: 'portal' | 'staff'; published?: boolean } = {}) {
	const workspace = await createWorkspace();
	const space = await createSpaceRow(workspace.organisation.id, {
		audience: options.audience ?? 'portal'
	});
	const page = await createPageRow(workspace.organisation.id, space.id, {
		publishedAt: options.published === false ? null : new Date()
	});
	const storage = new RecordingStorage();
	return { ...workspace, space, page, storage, deps: { storage } };
}

const unwrap = <T>(
	outcome: { ok: true; value: T } | { ok: false; error: string | { kind: string } }
): T => {
	if (!outcome.ok) throw new Error(JSON.stringify(outcome.error));
	return outcome.value;
};

const verbsOf = async (pageId: string) =>
	(
		await getDb()
			.select({ verb: activity.verb, payload: activity.payload })
			.from(activity)
			.where(eq(activity.pageId, pageId))
			.orderBy(asc(activity.occurredAt), asc(activity.createdAt))
	).map((row) => [row.verb, row.payload]);

describe('page attachments', () => {
	it('stores, lists in order with the uploader, downloads and removes a file', async () => {
		const w = await setup();

		const added = unwrap(
			await addPageAttachments(
				w.technician,
				w.page.id,
				[file('a.txt'), file('b.txt', 9, 'image/png')],
				w.deps
			)
		);
		expect(added.map((row) => row.filename)).toEqual(['a.txt', 'b.txt']);

		const listed = unwrap(await listPageAttachments(w.technician, w.page.id));
		expect(listed.map((row) => row.filename)).toEqual(['a.txt', 'b.txt']);
		expect(listed[1]).toMatchObject({
			byteSize: 9,
			contentType: 'image/png',
			uploaderName: w.technician.name
		});

		const downloaded = unwrap(await getPageAttachment(w.technician, added[0].id, w.deps));
		expect(downloaded).toMatchObject({ filename: 'a.txt', contentType: 'text/plain' });
		expect(downloaded.data).toEqual(new Uint8Array(4).fill(7));

		expect((await removePageAttachment(w.technician, added[0].id, w.deps)).ok).toBe(true);
		expect(await getDb().select().from(pageAttachments)).toHaveLength(1);
		expect(await w.storage.stored()).toHaveLength(1);
		expect((await getPageAttachment(w.technician, added[0].id, w.deps)).ok).toBe(false);
	});

	it('refuses a sixth file and a file over 10 MiB, storing nothing', async () => {
		const w = await setup();

		const six = await addPageAttachments(
			w.technician,
			w.page.id,
			Array.from({ length: 6 }, (_, i) => file(`f${i}.txt`)),
			w.deps
		);
		const big = await addPageAttachments(
			w.technician,
			w.page.id,
			[file('big.bin', MAX_ATTACHMENT_BYTES + 1)],
			w.deps
		);

		expect(six).toEqual({ ok: false, error: 'attachments_too_many' });
		expect(big).toEqual({ ok: false, error: 'attachments_too_large' });
		expect(await getDb().select().from(pageAttachments)).toHaveLength(0);
		expect(w.storage.written).toHaveLength(0);
	});

	it('accepts exactly five files of exactly 10 MiB', async () => {
		const w = await setup();

		const outcome = await addPageAttachments(
			w.technician,
			w.page.id,
			Array.from({ length: 5 }, (_, i) => file(`f${i}.bin`, MAX_ATTACHMENT_BYTES)),
			w.deps
		);

		expect(outcome.ok && outcome.value).toHaveLength(5);
	});

	it('records the activity of each file and adds no page revision', async () => {
		const w = await setup();
		const before = await getDb().select().from(pages).where(eq(pages.id, w.page.id));

		const added = unwrap(
			await addPageAttachments(w.admin, w.page.id, [file('a.txt'), file('b.txt')], w.deps)
		);
		await removePageAttachment(w.admin, added[0].id, w.deps);

		expect(await verbsOf(w.page.id)).toEqual([
			['page.attachment.added', { filename: 'a.txt' }],
			['page.attachment.added', { filename: 'b.txt' }],
			['page.attachment.removed', { filename: 'a.txt' }]
		]);
		expect(
			await getDb().select().from(pageRevisions).where(eq(pageRevisions.pageId, w.page.id))
		).toHaveLength(0);
		const [after] = await getDb().select().from(pages).where(eq(pages.id, w.page.id));
		expect(after.revision).toBe(before[0].revision);
	});

	it('refuses an archived or unknown page, and removes the bytes it wrote', async () => {
		const w = await setup();
		await getDb().update(pages).set({ archivedAt: new Date() }).where(eq(pages.id, w.page.id));

		const archived = await addPageAttachments(w.technician, w.page.id, [file('a.txt')], w.deps);
		const missing = await addPageAttachments(
			w.technician,
			crypto.randomUUID(),
			[file('a.txt')],
			w.deps
		);

		expect(archived).toEqual({ ok: false, error: 'archived' });
		expect(missing).toEqual({ ok: false, error: 'not_found' });
		expect(await w.storage.stored()).toEqual([]);
	});

	it('does not remove a file from an archived page', async () => {
		const w = await setup();
		const added = unwrap(
			await addPageAttachments(w.technician, w.page.id, [file('a.txt')], w.deps)
		);
		await getDb().update(pages).set({ archivedAt: new Date() }).where(eq(pages.id, w.page.id));

		expect(await removePageAttachment(w.technician, added[0].id, w.deps)).toEqual({
			ok: false,
			error: 'archived'
		});
		expect(await getDb().select().from(pageAttachments)).toHaveLength(1);
		// Staff still read what an archived page holds.
		expect(unwrap(await listPageAttachments(w.technician, w.page.id))).toHaveLength(1);
	});

	it('keeps the row gone when the stored bytes cannot be deleted', async () => {
		const w = await setup();
		const added = unwrap(
			await addPageAttachments(w.technician, w.page.id, [file('a.txt')], w.deps)
		);
		w.storage.failDeletes = true;

		expect((await removePageAttachment(w.technician, added[0].id, w.deps)).ok).toBe(true);
		expect(await getDb().select().from(pageAttachments)).toHaveLength(0);
	});

	it('throws when an employee tries to write', async () => {
		const w = await setup();
		const added = unwrap(
			await addPageAttachments(w.technician, w.page.id, [file('a.txt')], w.deps)
		);

		await expect(
			addPageAttachments(w.employee, w.page.id, [file('b.txt')], w.deps)
		).rejects.toThrow();
		await expect(removePageAttachment(w.employee, added[0].id, w.deps)).rejects.toThrow();
	});

	describe('what an employee reads', () => {
		it('reads and downloads the attachments of a published portal page', async () => {
			const w = await setup();
			const added = unwrap(
				await addPageAttachments(w.technician, w.page.id, [file('a.txt')], w.deps)
			);

			expect(unwrap(await listPageAttachments(w.employee, w.page.id))).toHaveLength(1);
			expect((await getPageAttachment(w.employee, added[0].id, w.deps)).ok).toBe(true);
		});

		it.each([
			['a draft', { audience: 'portal', published: false }],
			['a staff page', { audience: 'staff', published: true }]
		] as const)('finds nothing on %s', async (_, options) => {
			const w = await setup(options);
			const added = unwrap(
				await addPageAttachments(w.technician, w.page.id, [file('a.txt')], w.deps)
			);

			expect(await listPageAttachments(w.employee, w.page.id)).toEqual({
				ok: false,
				error: 'not_found'
			});
			expect(await getPageAttachment(w.employee, added[0].id, w.deps)).toEqual({
				ok: false,
				error: 'attachment_not_found'
			});
		});

		it('finds nothing on an archived page', async () => {
			const w = await setup();
			const added = unwrap(
				await addPageAttachments(w.technician, w.page.id, [file('a.txt')], w.deps)
			);
			await getDb().update(pages).set({ archivedAt: new Date() }).where(eq(pages.id, w.page.id));

			expect((await getPageAttachment(w.employee, added[0].id, w.deps)).ok).toBe(false);
		});
	});

	it('answers not found to another organisation', async () => {
		const w = await setup();
		const other = await createWorkspace('Other', 'other');
		const added = unwrap(
			await addPageAttachments(w.technician, w.page.id, [file('a.txt')], w.deps)
		);

		expect((await getPageAttachment(other.admin, added[0].id, w.deps)).ok).toBe(false);
		expect((await listPageAttachments(other.admin, w.page.id)).ok).toBe(false);
		expect(await removePageAttachment(other.admin, added[0].id, w.deps)).toEqual({
			ok: false,
			error: 'attachment_not_found'
		});
	});
});
