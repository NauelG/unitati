import { describe, expect, it, vi } from 'vitest';
import { MAX_ATTACHMENT_BYTES } from '#lib/domain/attachments.js';
import { InMemoryStorage } from '#lib/server/shared/storage.js';

const storage = new InMemoryStorage();
vi.mock('#lib/server/shared/runtime.js', () => ({ runtimeStorage: () => storage }));

import { addPageAttachments, listPageAttachments } from '#lib/server/knowledge/index.js';
import {
	createPageRow,
	createSpaceRow,
	createWorkspace
} from '#lib/server/knowledge/testing/fixtures.js';
import { actionEvent, outcomeOf } from '#lib/server/projects/testing/action-event.js';
import { actions } from './+page.server';
import { GET } from './attachments/[id]/+server';

function withFiles(
	user: Parameters<typeof actionEvent>[0],
	files: File[],
	params: Record<string, string>
) {
	const data = new FormData();
	for (const file of files) data.append('files', file);
	return {
		request: new Request('http://localhost/action', { method: 'POST', body: data }),
		locals: { user },
		params,
		url: new URL('http://localhost/knowledge')
	} as never;
}

async function setup(overrides: { publishedAt?: Date | null; audience?: 'portal' | 'staff' } = {}) {
	const w = await createWorkspace();
	const space = await createSpaceRow(w.organisation.id, {
		audience: overrides.audience ?? 'portal'
	});
	const page = await createPageRow(w.organisation.id, space.id, {
		publishedAt: overrides.publishedAt === undefined ? new Date() : overrides.publishedAt
	});
	return { ...w, page, params: { tag: page.pageTag } };
}

const download = (user: unknown, tag: string, id: string) =>
	outcomeOf(() =>
		GET({
			locals: { user },
			params: { tag, id },
			url: new URL('http://localhost/knowledge')
		} as never)
	);

describe('page attachment actions', () => {
	it('answers 403 to an employee', async () => {
		const w = await setup();

		const outcome = await outcomeOf(() =>
			actions.addAttachments(withFiles(w.employee, [new File(['x'], 'a.txt')], w.params))
		);

		expect(outcome.thrown?.status).toBe(403);
	});

	it('adds, then removes, a file', async () => {
		const w = await setup();

		await actions.addAttachments(
			withFiles(w.technician, [new File(['hello'], 'vendor.pdf')], w.params)
		);
		const listed = await listPageAttachments(w.technician, w.page.id);
		if (!listed.ok) throw new Error('setup');
		expect(listed.value).toMatchObject([{ filename: 'vendor.pdf', byteSize: 5 }]);

		await actions.removeAttachment(
			actionEvent(w.technician, { attachmentId: listed.value[0].id }, w.params)
		);
		const after = await listPageAttachments(w.technician, w.page.id);
		expect(after.ok && after.value).toEqual([]);
	});

	it('refuses a sixth file and an 11 MiB file with a message', async () => {
		const w = await setup();
		const six = Array.from({ length: 6 }, (_, i) => new File(['x'], `f${i}.txt`));
		const big = [new File([new Uint8Array(MAX_ATTACHMENT_BYTES + 1)], 'big.bin')];

		for (const files of [six, big]) {
			const outcome = await outcomeOf(() =>
				actions.addAttachments(withFiles(w.technician, files, w.params))
			);
			expect(outcome.returned).toMatchObject({ status: 400, data: { action: 'addAttachments' } });
		}
		const listed = await listPageAttachments(w.technician, w.page.id);
		expect(listed.ok && listed.value).toEqual([]);
	});

	it('refuses an empty submission', async () => {
		const w = await setup();

		const outcome = await outcomeOf(() =>
			actions.addAttachments(withFiles(w.technician, [], w.params))
		);

		expect(outcome.returned).toMatchObject({ status: 400 });
	});
});

describe('page attachment downloads', () => {
	const file = {
		filename: 'plan <1>.html',
		contentType: 'text/html',
		data: new Uint8Array([1, 2, 3])
	};

	it('serves the bytes as a download, never inline, with nosniff', async () => {
		const w = await setup();
		const added = await addPageAttachments(w.technician, w.page.id, [file]);
		if (!added.ok) throw new Error('setup');

		const outcome = await download(w.technician, w.page.pageTag, added.value[0].id);
		const response = outcome.returned as unknown as Response;

		expect(response.headers.get('content-disposition')).toMatch(/^attachment;/);
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(file.data);
	});

	it('answers 404 to a malformed id, another page and another organisation', async () => {
		const w = await setup();
		const other = await createPageRow(w.organisation.id, w.page.spaceId);
		const added = await addPageAttachments(w.technician, w.page.id, [file]);
		if (!added.ok) throw new Error('setup');
		const id = added.value[0].id;
		const stranger = await createWorkspace('Other', 'other');

		expect((await download(w.technician, w.page.pageTag, 'nope')).thrown?.status).toBe(404);
		expect((await download(w.technician, other.pageTag, id)).thrown?.status).toBe(404);
		expect((await download(stranger.admin, w.page.pageTag, id)).thrown?.status).toBe(404);
	});

	it('answers 403 to an employee in the app (the portal route serves them)', async () => {
		const w = await setup();
		const added = await addPageAttachments(w.technician, w.page.id, [file]);
		if (!added.ok) throw new Error('setup');

		expect((await download(w.employee, w.page.pageTag, added.value[0].id)).thrown?.status).toBe(
			403
		);
	});
});
