import { asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { PAGE_BODY_MAX_LENGTH } from '#lib/domain/knowledge.js';
import { serviceAccounts } from '../api/schema';
import { pageWindow } from '../shared/pagination';
import { activity } from '../activity/schema';
import { getDb } from '../db';
import {
	archivePage,
	createPage,
	getPageByTag,
	getRevision,
	listRevisions,
	pageRevisions as pageRevisionsPage,
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

/** A principal acting through an API key: no person, a service account id. */
async function apiPrincipal(
	workspace: Awaited<ReturnType<typeof createWorkspace>>,
	name = 'Wiki bot'
) {
	const [account] = await getDb()
		.insert(serviceAccounts)
		.values({ organisationId: workspace.organisation.id, name, role: 'technician' })
		.returning();
	return {
		account,
		actor: { ...workspace.technician, personId: null, serviceAccountId: account.id }
	};
}

describe('service-account authorship', () => {
	it('records the account, not a person, on create, save and restore', async () => {
		const workspace = await createWorkspace();
		const space = await createSpaceRow(workspace.organisation.id, { audience: 'staff' });
		const { account, actor } = await apiPrincipal(workspace);

		const created = await createPage(actor, {
			spaceId: space.id,
			parentId: null,
			title: 'API',
			body: 'uno'
		});
		if (!created.ok) throw new Error('expected the page to be created');
		const id = created.value.id;

		expect(await reload(id)).toMatchObject({
			createdByPersonId: null,
			createdByServiceAccountId: account.id
		});

		await savePage(actor, id, { title: 'API', body: 'dos', baseRevision: 1 });
		await restoreRevision(actor, id, 1, { baseRevision: 2 });

		const revisions = await revisionsOf(id);
		expect(revisions).toHaveLength(3);
		for (const revision of revisions) {
			expect(revision.authorPersonId).toBeNull();
			expect(revision.authorServiceAccountId).toBe(account.id);
		}

		const list = await listRevisions(workspace.admin, id);
		expect(list.ok && list.value.map((r) => r.authorName)).toEqual([
			'Wiki bot',
			'Wiki bot',
			'Wiki bot'
		]);
		const one = await getRevision(workspace.admin, id, 2);
		expect(one.ok && one.value.authorName).toBe('Wiki bot');
		const read = await getPageByTag(workspace.admin, (await reload(id)).pageTag);
		expect(read.ok && read.value.revisionAuthorName).toBe('Wiki bot');
	});

	it('names the account in a stale_revision failure', async () => {
		const workspace = await createWorkspace();
		const space = await createSpaceRow(workspace.organisation.id, { audience: 'staff' });
		const { actor } = await apiPrincipal(workspace);
		const created = await createPage(workspace.admin, {
			spaceId: space.id,
			parentId: null,
			title: 'P',
			body: 'a'
		});
		if (!created.ok) throw new Error('expected the page');
		await savePage(actor, created.value.id, { title: 'P', body: 'b', baseRevision: 1 });

		const stale = await savePage(workspace.admin, created.value.id, {
			title: 'P',
			body: 'c',
			baseRevision: 1
		});
		expect(stale).toMatchObject({
			ok: false,
			error: { kind: 'stale_revision', authorName: 'Wiki bot' }
		});
	});

	it('refuses a revision with both authors set', async () => {
		const workspace = await setup();
		const { page } = workspace;
		const { account } = await apiPrincipal(workspace);
		await expect(
			getDb().insert(pageRevisions).values({
				organisationId: workspace.organisation.id,
				pageId: page.id,
				number: 99,
				title: 't',
				body: 'b',
				authorPersonId: workspace.admin.personId,
				authorServiceAccountId: account.id
			})
		).rejects.toThrow();
	});

	it('keeps authorName null when the person was deleted', async () => {
		const { admin, page } = await setup();
		await getDb()
			.update(pageRevisions)
			.set({ authorPersonId: null })
			.where(eq(pageRevisions.pageId, page.id));
		const list = await listRevisions(admin, page.id);
		expect(list.ok && list.value[0].authorName).toBeNull();
	});
});

describe('pageRevisions', () => {
	it('pages the history newest first and reports the total', async () => {
		const { admin, page } = await setup();
		for (let base = 1; base <= 4; base++) {
			await savePage(admin, page.id, { title: 'VPN', body: `v${base}`, baseRevision: base });
		}

		const first = await pageRevisionsPage(admin, page.id, pageWindow({ page: 1, perPage: 2 }));
		expect(first.ok && first.value.rows.map((r) => r.number)).toEqual([5, 4]);
		expect(first.ok && first.value).toMatchObject({ total: 5, pageCount: 3, perPage: 2 });
		const last = await pageRevisionsPage(admin, page.id, pageWindow({ page: 3, perPage: 2 }));
		expect(last.ok && last.value.rows.map((r) => r.number)).toEqual([1]);
		const clamped = await pageRevisionsPage(
			admin,
			page.id,
			pageWindow({ page: -4, perPage: 100000 })
		);
		expect(clamped.ok && clamped.value).toMatchObject({ page: 1, perPage: 100 });
	});

	it('answers not_found for an unreadable page and throws for non-staff', async () => {
		const { admin, employee, page } = await setup();
		const other = await createWorkspace('Other', 'other');
		expect(await pageRevisionsPage(other.admin, page.id, pageWindow())).toEqual({
			ok: false,
			error: 'not_found'
		});
		expect(await pageRevisionsPage(admin, crypto.randomUUID(), pageWindow())).toEqual({
			ok: false,
			error: 'not_found'
		});
		await expect(pageRevisionsPage(employee, page.id, pageWindow())).rejects.toThrow();
	});
});
