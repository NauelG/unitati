import { asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { PAGE_BODY_MAX_LENGTH } from '#lib/domain/knowledge.js';
import { activity } from '../activity/schema';
import { getDb } from '../db';
import {
	archivePage,
	createPage,
	getPageByTag,
	getRevision,
	listRevisions,
	publishPage,
	restoreRevision,
	savePage
} from './index';
import { pageRevisions, pages } from './schema';
import { createSpaceRow, createWorkspace } from './testing/fixtures';

async function revisionsOf(pageId: string) {
	return getDb()
		.select()
		.from(pageRevisions)
		.where(eq(pageRevisions.pageId, pageId))
		.orderBy(asc(pageRevisions.number));
}

async function reload(id: string) {
	const [row] = await getDb().select().from(pages).where(eq(pages.id, id));
	return row;
}

async function verbsOf(pageId: string) {
	const rows = await getDb()
		.select({ verb: activity.verb, payload: activity.payload })
		.from(activity)
		.where(eq(activity.pageId, pageId))
		.orderBy(asc(activity.occurredAt), asc(activity.createdAt));
	return rows;
}

/** A page made through the domain, so it carries revision 1 as every real page does. */
async function setup(audience: 'staff' | 'portal' = 'staff') {
	const workspace = await createWorkspace();
	const space = await createSpaceRow(workspace.organisation.id, { audience });
	const created = await createPage(workspace.admin, {
		spaceId: space.id,
		parentId: null,
		title: 'VPN',
		body: 'Primera versión'
	});
	if (!created.ok) throw new Error('expected the page to be created');
	return { ...workspace, space, page: created.value };
}

describe('savePage', () => {
	it('appends exactly one revision per save and moves the page to it', async () => {
		const { admin, technician, page } = await setup();

		const first = await savePage(admin, page.id, {
			title: 'VPN corporativa',
			body: '## Paso 1\n\nInstala el cliente.',
			baseRevision: 1
		});
		expect(first).toEqual({ ok: true, value: { revision: 2, changed: true } });

		const second = await savePage(technician, page.id, {
			title: 'VPN corporativa',
			body: '## Paso 1\n\nInstala el cliente **oficial**.',
			baseRevision: 2
		});
		expect(second).toEqual({ ok: true, value: { revision: 3, changed: true } });

		const row = await reload(page.id);
		expect(row).toMatchObject({
			title: 'VPN corporativa',
			body: '## Paso 1\n\nInstala el cliente **oficial**.',
			revision: 3
		});

		const revisions = await revisionsOf(page.id);
		expect(revisions.map((revision) => revision.number)).toEqual([1, 2, 3]);
		expect(revisions[1]).toMatchObject({
			title: 'VPN corporativa',
			body: '## Paso 1\n\nInstala el cliente.',
			authorPersonId: admin.personId
		});
		expect(revisions[2].authorPersonId).toBe(technician.personId);
	});

	it('appends nothing for an identical title and body', async () => {
		const { admin, page } = await setup();

		const outcome = await savePage(admin, page.id, {
			title: 'VPN',
			body: 'Primera versión',
			baseRevision: 1
		});

		expect(outcome).toEqual({ ok: true, value: { revision: 1, changed: false } });
		expect(await revisionsOf(page.id)).toHaveLength(1);
		expect((await reload(page.id)).revision).toBe(1);
	});

	it('writes no activity row', async () => {
		const { admin, page } = await setup();
		await savePage(admin, page.id, { title: 'VPN', body: 'Otra', baseRevision: 1 });

		expect((await verbsOf(page.id)).map((row) => row.verb)).toEqual(['page.created']);
	});

	it('answers stale_revision with the current revision and its author, and writes nothing', async () => {
		const { admin, technician, page } = await setup();
		await savePage(technician, page.id, { title: 'VPN', body: 'De Tom', baseRevision: 1 });

		const outcome = await savePage(admin, page.id, {
			title: 'VPN',
			body: 'De Ada',
			baseRevision: 1
		});

		expect(outcome.ok).toBe(false);
		if (outcome.ok) return;
		expect(outcome.error).toMatchObject({
			kind: 'stale_revision',
			revision: 2,
			authorName: 'Tom Technician'
		});
		expect((await reload(page.id)).body).toBe('De Tom');
		expect(await revisionsOf(page.id)).toHaveLength(2);
	});

	it('lets one of two concurrent saves from the same base through and refuses the other', async () => {
		const { admin, technician, page } = await setup();

		const results = await Promise.all([
			savePage(admin, page.id, { title: 'VPN', body: 'De Ada', baseRevision: 1 }),
			savePage(technician, page.id, { title: 'VPN', body: 'De Tom', baseRevision: 1 })
		]);

		const won = results.filter((result) => result.ok);
		const lost = results.filter(
			(result) =>
				!result.ok && typeof result.error === 'object' && result.error.kind === 'stale_revision'
		);
		expect(won).toHaveLength(1);
		expect(lost).toHaveLength(1);

		const revisions = await revisionsOf(page.id);
		expect(revisions.map((revision) => revision.number)).toEqual([1, 2]);
		expect((await reload(page.id)).body).toBe(revisions[1].body);
	});

	it('keeps a published page published and a draft a draft', async () => {
		const { admin, page } = await setup();
		await savePage(admin, page.id, { title: 'VPN', body: 'Borrador', baseRevision: 1 });
		expect((await reload(page.id)).publishedAt).toBeNull();

		await publishPage(admin, page.id);
		const publishedAt = (await reload(page.id)).publishedAt;
		await savePage(admin, page.id, { title: 'VPN', body: 'Publicada', baseRevision: 2 });

		const row = await reload(page.id);
		expect(row.publishedAt).toEqual(publishedAt);
		expect(row.body).toBe('Publicada');
	});

	it('makes the change public at once for a published page', async () => {
		const { admin, employee, page } = await setup('portal');
		await publishPage(admin, page.id);
		await savePage(admin, page.id, { title: 'VPN', body: 'Nueva', baseRevision: 1 });

		const read = await getPageByTag(employee, (await reload(page.id)).pageTag);
		expect(read.ok && read.value.body).toBe('Nueva');
	});

	it('refuses a body over the limit, an archived page and a missing one', async () => {
		const { admin, page } = await setup();

		expect(
			await savePage(admin, page.id, {
				title: 'VPN',
				body: 'x'.repeat(PAGE_BODY_MAX_LENGTH + 1),
				baseRevision: 1
			})
		).toEqual({ ok: false, error: 'body_too_long' });
		expect(
			await savePage(admin, crypto.randomUUID(), { title: 'x', body: '', baseRevision: 1 })
		).toEqual({ ok: false, error: 'not_found' });

		await archivePage(admin, page.id);
		expect(await savePage(admin, page.id, { title: 'VPN', body: 'y', baseRevision: 1 })).toEqual({
			ok: false,
			error: 'archived'
		});
		expect(await revisionsOf(page.id)).toHaveLength(1);
	});

	it('does not reach a page of another organisation', async () => {
		const { page } = await setup();
		const other = await createWorkspace('Other', 'other');

		expect(
			await savePage(other.admin, page.id, { title: 'x', body: 'y', baseRevision: 1 })
		).toEqual({ ok: false, error: 'not_found' });
	});

	it('throws for a viewer without knowledge.manage', async () => {
		const { employee, page } = await setup();
		await expect(
			savePage(employee, page.id, { title: 'x', body: 'y', baseRevision: 1 })
		).rejects.toThrow();
	});
});

describe('listRevisions and getRevision', () => {
	it('lists every revision, newest first, with its author', async () => {
		const { admin, technician, page } = await setup();
		await savePage(technician, page.id, { title: 'VPN 2', body: 'dos', baseRevision: 1 });

		const outcome = await listRevisions(admin, page.id);
		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		expect(
			outcome.value.map(({ number, title, authorName }) => ({ number, title, authorName }))
		).toEqual([
			{ number: 2, title: 'VPN 2', authorName: 'Tom Technician' },
			{ number: 1, title: 'VPN', authorName: 'Ada Admin' }
		]);
		expect(outcome.value[0].createdAt).toBeInstanceOf(Date);
	});

	it('reads one revision with its body', async () => {
		const { admin, page } = await setup();
		await savePage(admin, page.id, { title: 'VPN', body: 'dos', baseRevision: 1 });

		expect(await getRevision(admin, page.id, 1)).toMatchObject({
			ok: true,
			value: { number: 1, title: 'VPN', body: 'Primera versión', authorName: 'Ada Admin' }
		});
		expect(await getRevision(admin, page.id, 9)).toEqual({ ok: false, error: 'not_found' });
	});

	it('is staff only, and scoped to the organisation', async () => {
		const { employee, page } = await setup('portal');
		const other = await createWorkspace('Other', 'other');

		await expect(listRevisions(employee, page.id)).rejects.toThrow();
		await expect(getRevision(employee, page.id, 1)).rejects.toThrow();
		expect(await listRevisions(other.admin, page.id)).toEqual({ ok: false, error: 'not_found' });
		expect(await getRevision(other.admin, page.id, 1)).toEqual({ ok: false, error: 'not_found' });
	});
});

describe('restoreRevision', () => {
	it('appends a new revision equal to N and writes page.revision.restored', async () => {
		const { admin, technician, page } = await setup();
		await savePage(admin, page.id, { title: 'VPN 2', body: 'dos', baseRevision: 1 });
		await savePage(admin, page.id, { title: 'VPN 3', body: 'tres', baseRevision: 2 });

		const outcome = await restoreRevision(technician, page.id, 1, { baseRevision: 3 });
		expect(outcome).toEqual({ ok: true, value: { revision: 4, changed: true } });

		const revisions = await revisionsOf(page.id);
		expect(revisions).toHaveLength(4);
		expect(revisions[3]).toMatchObject({
			number: 4,
			title: 'VPN',
			body: 'Primera versión',
			authorPersonId: technician.personId
		});
		expect(await reload(page.id)).toMatchObject({
			title: 'VPN',
			body: 'Primera versión',
			revision: 4
		});
		expect((await verbsOf(page.id)).at(-1)).toEqual({
			verb: 'page.revision.restored',
			payload: { from: 1, to: 4 }
		});
	});

	it('refuses a stale base, writing nothing', async () => {
		const { admin, page } = await setup();
		await savePage(admin, page.id, { title: 'VPN 2', body: 'dos', baseRevision: 1 });

		const outcome = await restoreRevision(admin, page.id, 1, { baseRevision: 1 });
		expect(!outcome.ok && typeof outcome.error === 'object' && outcome.error.kind).toBe(
			'stale_revision'
		);
		expect(await revisionsOf(page.id)).toHaveLength(2);
		expect((await verbsOf(page.id)).map((row) => row.verb)).toEqual(['page.created']);
	});

	it('appends nothing when the revision already is the current content', async () => {
		const { admin, page } = await setup();

		expect(await restoreRevision(admin, page.id, 1, { baseRevision: 1 })).toEqual({
			ok: true,
			value: { revision: 1, changed: false }
		});
		expect(await revisionsOf(page.id)).toHaveLength(1);
		expect((await verbsOf(page.id)).map((row) => row.verb)).toEqual(['page.created']);
	});

	it('refuses a revision that does not exist and an archived page', async () => {
		const { admin, page } = await setup();
		expect(await restoreRevision(admin, page.id, 7, { baseRevision: 1 })).toEqual({
			ok: false,
			error: 'revision_not_found'
		});

		await archivePage(admin, page.id);
		expect(await restoreRevision(admin, page.id, 1, { baseRevision: 1 })).toEqual({
			ok: false,
			error: 'archived'
		});
	});
});

describe('getPageByTag: the latest revision', () => {
	it('carries the author and time of the revision the page shows', async () => {
		const { admin, technician, page } = await setup();
		await savePage(technician, page.id, { title: 'VPN', body: 'dos', baseRevision: 1 });

		const read = await getPageByTag(admin, (await reload(page.id)).pageTag);
		expect(read.ok).toBe(true);
		if (!read.ok) return;
		expect(read.value.revision).toBe(2);
		expect(read.value.revisionAuthorName).toBe('Tom Technician');
		expect(read.value.revisedAt).toBeInstanceOf(Date);
	});
});
