import { asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from '#lib/server/db/index.js';
import { createPage, pageRevisions, pages, savePage } from '#lib/server/knowledge/index.js';
import { createSpaceRow, createWorkspace } from '#lib/server/knowledge/testing/fixtures.js';
import { actionEvent, outcomeOf } from '#lib/server/projects/testing/action-event.js';
import { GET as pick } from '../../pages/pick/+server';
import { actions as revisionActions } from '../revisions/[n]/+page.server';
import { actions, load } from './+page.server';

async function setup() {
	const workspace = await createWorkspace();
	const space = await createSpaceRow(workspace.organisation.id, { name: 'Ayuda' });
	const created = await createPage(workspace.admin, {
		spaceId: space.id,
		parentId: null,
		title: 'VPN',
		body: 'Uno'
	});
	if (!created.ok) throw new Error('expected the page');
	return { ...workspace, space, page: created.value };
}

const save = (user: unknown, tag: string, fields: Record<string, string>) =>
	outcomeOf(() => actions.default(actionEvent(user as never, fields, { tag }) as never));

const revisions = (pageId: string) =>
	getDb()
		.select()
		.from(pageRevisions)
		.where(eq(pageRevisions.pageId, pageId))
		.orderBy(asc(pageRevisions.number));

describe('/knowledge/[tag]/edit', () => {
	it('saves a revision and lands on the page', async () => {
		const { technician, page } = await setup();

		const { thrown } = await save(technician, page.tag, {
			title: 'VPN',
			body: '## Paso 1',
			baseRevision: '1'
		});

		expect(thrown).toMatchObject({ status: 303, location: `/knowledge/${page.tag}` });
		expect((await revisions(page.id)).map((revision) => revision.body)).toEqual([
			'Uno',
			'## Paso 1'
		]);
	});

	it('hands a stale save back with the user’s own title and text, writing nothing', async () => {
		const { admin, technician, page } = await setup();
		await savePage(admin, page.id, { title: 'VPN', body: 'De Ada', baseRevision: 1 });

		const { returned } = await save(technician, page.tag, {
			title: 'VPN de Tom',
			body: 'De Tom',
			baseRevision: '1'
		});

		expect(returned?.status).toBe(409);
		expect(returned?.data).toMatchObject({
			title: 'VPN de Tom',
			body: 'De Tom',
			baseRevision: '1',
			stale: { revision: 2, authorName: 'Ada Admin' }
		});
		const [row] = await getDb().select().from(pages).where(eq(pages.id, page.id));
		expect(row).toMatchObject({ title: 'VPN', body: 'De Ada', revision: 2 });
	});

	it('says what is wrong with the title and keeps the text', async () => {
		const { technician, page } = await setup();

		const { returned } = await save(technician, page.tag, {
			title: '  ',
			body: 'Texto',
			baseRevision: '1'
		});

		expect(returned?.status).toBe(400);
		expect(returned?.data).toMatchObject({ body: 'Texto', stale: null });
		expect(returned?.data?.message).toBeTruthy();
		expect(await revisions(page.id)).toHaveLength(1);
	});

	it('refuses an employee with a 403', async () => {
		const { employee, page } = await setup();

		const { thrown } = await save(employee, page.tag, {
			title: 'x',
			body: 'y',
			baseRevision: '1'
		});

		expect(thrown?.status).toBe(403);
		expect(await revisions(page.id)).toHaveLength(1);
	});

	it('sends an archived page back to its record instead of editing it', async () => {
		const { admin, page } = await setup();
		await getDb().update(pages).set({ archivedAt: new Date() }).where(eq(pages.id, page.id));

		const { thrown } = await outcomeOf(() =>
			load({
				locals: { user: admin },
				params: { tag: page.tag },
				url: new URL(`http://localhost/knowledge/${page.tag}/edit`)
			} as never)
		);

		expect(thrown).toMatchObject({ status: 303, location: `/knowledge/${page.tag}` });
	});
});

describe('/knowledge/[tag]/revisions/[n] ?/restore', () => {
	it('restores the revision and lands on the page', async () => {
		const { admin, technician, page } = await setup();
		await savePage(admin, page.id, { title: 'VPN', body: 'Dos', baseRevision: 1 });

		const { thrown } = await outcomeOf(() =>
			revisionActions.restore(
				actionEvent(technician, { baseRevision: '2' }, { tag: page.tag, n: '1' }) as never
			)
		);

		expect(thrown).toMatchObject({ status: 303, location: `/knowledge/${page.tag}` });
		expect((await revisions(page.id)).map((revision) => revision.body)).toEqual([
			'Uno',
			'Dos',
			'Uno'
		]);
	});

	it('refuses a restore from a stale base with a sentence', async () => {
		const { admin, page } = await setup();
		await savePage(admin, page.id, { title: 'VPN', body: 'Dos', baseRevision: 1 });

		const { returned } = await outcomeOf(() =>
			revisionActions.restore(
				actionEvent(admin, { baseRevision: '1' }, { tag: page.tag, n: '1' }) as never
			)
		);

		expect(returned?.status).toBe(409);
		expect(returned?.data?.message).toContain('2');
		expect(await revisions(page.id)).toHaveLength(2);
	});
});

describe('GET /knowledge/pages/pick', () => {
	const call = async (user: unknown, q: string) => {
		const response = await pick({
			locals: { user },
			url: new URL(`http://localhost/knowledge/pages/pick?q=${encodeURIComponent(q)}`)
		} as never);
		return (await response.json()) as { tag: string; title: string; hint: string }[];
	};

	it('offers staff the drafts too, marked as such', async () => {
		const { technician, page } = await setup();

		expect(await call(technician, 'vp')).toEqual([
			{ tag: page.tag, title: 'VPN', hint: `${page.tag} · Ayuda · Borrador` }
		]);
	});

	it('offers an employee no draft', async () => {
		const { employee } = await setup();
		expect(await call(employee, 'vp')).toEqual([]);
	});
});
