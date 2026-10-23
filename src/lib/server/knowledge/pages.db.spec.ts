import { asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { activity } from '../activity/schema';
import { getDb } from '../db';
import {
	archivePage,
	createPage,
	listSpaces,
	getPageByTag,
	listSpaceTree,
	movePage,
	PAGE_PICK_LIMIT,
	pickPages,
	previewMove,
	publishPage,
	reorderPage,
	unarchivePage
} from './index';
import { pageRevisions, pages } from './schema';
import { createPageRow, createSpaceRow, createWorkspace } from './testing/fixtures';

async function historyOf(pageId: string) {
	const rows = await getDb()
		.select()
		.from(activity)
		.where(eq(activity.pageId, pageId))
		.orderBy(asc(activity.occurredAt), asc(activity.createdAt));
	return rows.map((row) => ({ verb: row.verb, payload: row.payload }));
}

async function revisionsOf(pageId: string) {
	return getDb().select().from(pageRevisions).where(eq(pageRevisions.pageId, pageId));
}

async function reload(id: string) {
	const [row] = await getDb().select().from(pages).where(eq(pages.id, id));
	return row;
}

const published = () => ({ publishedAt: new Date() });

describe('createPage', () => {
	it('creates a draft at the end of its siblings with revision 1 and an entry', async () => {
		const { organisation, admin } = await createWorkspace();
		const space = await createSpaceRow(organisation.id);
		const first = await createPage(admin, {
			spaceId: space.id,
			parentId: null,
			title: 'One',
			body: '# Hi'
		});
		const second = await createPage(admin, { spaceId: space.id, parentId: null, title: 'Two' });
		if (!first.ok || !second.ok) throw new Error('expected both to be created');

		const [one, two] = await Promise.all([reload(first.value.id), reload(second.value.id)]);
		expect(one.publishedAt).toBeNull();
		expect(one.revision).toBe(1);
		expect(Number(two.position)).toBeGreaterThan(Number(one.position));
		expect(one.pageTag).toMatch(/^DOC-\d{4}$/);

		const revisions = await revisionsOf(one.id);
		expect(revisions).toHaveLength(1);
		expect(revisions[0]).toMatchObject({ number: 1, title: 'One', body: '# Hi' });
		expect(await historyOf(one.id)).toEqual([{ verb: 'page.created', payload: { title: 'One' } }]);
	});

	it('refuses an archived space, an archived parent and a parent from another space', async () => {
		const { organisation, admin } = await createWorkspace();
		const archivedSpace = await createSpaceRow(organisation.id, { archivedAt: new Date() });
		const space = await createSpaceRow(organisation.id);
		const other = await createSpaceRow(organisation.id);
		const archivedParent = await createPageRow(organisation.id, space.id, {
			archivedAt: new Date()
		});
		const foreign = await createPageRow(organisation.id, other.id);

		const attempt = (spaceId: string, parentId: string | null) =>
			createPage(admin, { spaceId, parentId, title: 'x' });
		expect(await attempt(archivedSpace.id, null)).toEqual({ ok: false, error: 'space_archived' });
		expect(await attempt(space.id, archivedParent.id)).toEqual({
			ok: false,
			error: 'parent_archived'
		});
		expect(await attempt(space.id, foreign.id)).toEqual({ ok: false, error: 'parent_not_found' });
		expect(await attempt(crypto.randomUUID(), null)).toEqual({
			ok: false,
			error: 'space_not_found'
		});
	});

	it('throws for a viewer without knowledge.manage', async () => {
		const { organisation, employee } = await createWorkspace();
		const space = await createSpaceRow(organisation.id);
		await expect(
			createPage(employee, { spaceId: space.id, parentId: null, title: 'x' })
		).rejects.toThrow();
	});
});

describe('movePage: cycles', () => {
	it('refuses itself and a descendant as parent', async () => {
		const { organisation, admin } = await createWorkspace();
		const space = await createSpaceRow(organisation.id);
		const a = await createPageRow(organisation.id, space.id, { title: 'A' });
		const b = await createPageRow(organisation.id, space.id, { title: 'B', parentId: a.id });
		const c = await createPageRow(organisation.id, space.id, { title: 'C', parentId: b.id });

		for (const parentId of [a.id, b.id, c.id]) {
			expect(await movePage(admin, a.id, { spaceId: space.id, parentId })).toEqual({
				ok: false,
				error: 'cycle'
			});
		}
	});

	it('answers one success and one cycle to two concurrent opposite moves', async () => {
		const { organisation, admin } = await createWorkspace();
		const space = await createSpaceRow(organisation.id);
		const a = await createPageRow(organisation.id, space.id, { title: 'A' });
		const b = await createPageRow(organisation.id, space.id, { title: 'B', position: '2' });

		const results = await Promise.all([
			movePage(admin, a.id, { spaceId: space.id, parentId: b.id }),
			movePage(admin, b.id, { spaceId: space.id, parentId: a.id })
		]);

		expect(results.filter((result) => result.ok)).toHaveLength(1);
		expect(results.filter((result) => !result.ok && result.error === 'cycle')).toHaveLength(1);
	});
});

describe('movePage: subtree, space and revisions', () => {
	it('moves the whole subtree across spaces, writes page.moved and no revision', async () => {
		const { organisation, admin } = await createWorkspace();
		const from = await createSpaceRow(organisation.id, { name: 'From', audience: 'staff' });
		const to = await createSpaceRow(organisation.id, { name: 'To', audience: 'staff' });
		const root = await createPageRow(organisation.id, from.id, { title: 'Root' });
		const child = await createPageRow(organisation.id, from.id, {
			title: 'Child',
			parentId: root.id
		});
		const grandchild = await createPageRow(organisation.id, from.id, {
			title: 'Grandchild',
			parentId: child.id
		});
		const target = await createPageRow(organisation.id, to.id, { title: 'Target' });

		const moved = await movePage(admin, root.id, { spaceId: to.id, parentId: target.id });
		expect(moved.ok).toBe(true);

		for (const id of [root.id, child.id, grandchild.id]) {
			expect((await reload(id)).spaceId).toBe(to.id);
		}
		expect((await reload(root.id)).parentId).toBe(target.id);
		expect((await reload(child.id)).parentId).toBe(root.id);
		expect(await revisionsOf(root.id)).toHaveLength(0);
		expect(await historyOf(root.id)).toEqual([
			{
				verb: 'page.moved',
				payload: {
					fromSpace: 'From',
					toSpace: 'To',
					fromParentTag: null,
					toParentTag: target.pageTag
				}
			}
		]);
	});

	it('refuses a parent from another space than the target', async () => {
		const { organisation, admin } = await createWorkspace();
		const a = await createSpaceRow(organisation.id);
		const b = await createSpaceRow(organisation.id);
		const page = await createPageRow(organisation.id, a.id);
		const parent = await createPageRow(organisation.id, a.id);

		expect(await movePage(admin, page.id, { spaceId: b.id, parentId: parent.id })).toEqual({
			ok: false,
			error: 'parent_not_found'
		});
	});
});

describe('movePage: audience confirmation', () => {
	async function setup() {
		const { organisation, admin } = await createWorkspace();
		const staff = await createSpaceRow(organisation.id, { name: 'Internal', audience: 'staff' });
		const portal = await createSpaceRow(organisation.id, { name: 'Help', audience: 'portal' });
		const root = await createPageRow(organisation.id, staff.id, { title: 'Root' });
		await createPageRow(organisation.id, staff.id, { title: 'Child', parentId: root.id });
		await createPageRow(organisation.id, staff.id, {
			title: 'Gone',
			parentId: root.id,
			archivedAt: new Date()
		});
		return { organisation, admin, staff, portal, root };
	}

	it('previews the subtree count and the audience change', async () => {
		const { admin, portal, root } = await setup();
		expect(await previewMove(admin, root.id, { spaceId: portal.id, parentId: null })).toEqual({
			ok: true,
			value: {
				subtreeCount: 2,
				audienceChanges: true,
				fromAudience: 'staff',
				toAudience: 'portal'
			}
		});
	});

	it('refuses without the confirmed count, and with a stale one', async () => {
		const { admin, portal, root } = await setup();
		const target = { spaceId: portal.id, parentId: null };

		expect(await movePage(admin, root.id, target)).toEqual({
			ok: false,
			error: 'confirmation_required'
		});
		expect(await movePage(admin, root.id, target, { confirmedCount: 5 })).toEqual({
			ok: false,
			error: 'count_changed'
		});
		expect((await reload(root.id)).spaceId).not.toBe(portal.id);
	});

	it('moves with the right count', async () => {
		const { admin, portal, root } = await setup();
		const moved = await movePage(
			admin,
			root.id,
			{ spaceId: portal.id, parentId: null },
			{ confirmedCount: 2 }
		);
		expect(moved.ok).toBe(true);
		expect((await reload(root.id)).spaceId).toBe(portal.id);
	});

	it('needs no confirmation when the audience stays', async () => {
		const { organisation, admin, staff, root } = await setup();
		const sibling = await createPageRow(organisation.id, staff.id, { title: 'Other' });
		const moved = await movePage(admin, root.id, { spaceId: staff.id, parentId: sibling.id });
		expect(moved.ok).toBe(true);
	});
});

describe('publishing and drafts', () => {
	it('refuses to publish under a draft and publishes once the parent is', async () => {
		const { organisation, admin } = await createWorkspace();
		const space = await createSpaceRow(organisation.id);
		const parent = await createPageRow(organisation.id, space.id);
		const child = await createPageRow(organisation.id, space.id, { parentId: parent.id });

		expect(await publishPage(admin, child.id)).toEqual({ ok: false, error: 'parent_unpublished' });
		expect((await publishPage(admin, parent.id)).ok).toBe(true);
		expect((await publishPage(admin, child.id)).ok).toBe(true);
		expect((await reload(child.id)).publishedAt).not.toBeNull();
		expect(await historyOf(child.id)).toEqual([{ verb: 'page.published', payload: {} }]);
	});

	it('treats publishing a published page as a no-op', async () => {
		const { organisation, admin } = await createWorkspace();
		const space = await createSpaceRow(organisation.id);
		const page = await createPageRow(organisation.id, space.id, published());

		expect((await publishPage(admin, page.id)).ok).toBe(true);
		expect(await historyOf(page.id)).toEqual([]);
	});

	it('refuses to move a published page under a draft', async () => {
		const { organisation, admin } = await createWorkspace();
		const space = await createSpaceRow(organisation.id);
		const draft = await createPageRow(organisation.id, space.id);
		const live = await createPageRow(organisation.id, space.id, published());

		expect(await movePage(admin, live.id, { spaceId: space.id, parentId: draft.id })).toEqual({
			ok: false,
			error: 'parent_unpublished'
		});
		// A draft may go under a draft.
		const other = await createPageRow(organisation.id, space.id);
		expect((await movePage(admin, other.id, { spaceId: space.id, parentId: draft.id })).ok).toBe(
			true
		);
	});
});

describe('archivePage and unarchivePage', () => {
	it('archives the subtree and restores it, with an entry each', async () => {
		const { organisation, admin } = await createWorkspace();
		const space = await createSpaceRow(organisation.id);
		const root = await createPageRow(organisation.id, space.id);
		const child = await createPageRow(organisation.id, space.id, { parentId: root.id });
		const sibling = await createPageRow(organisation.id, space.id, { position: '2' });

		const archived = await archivePage(admin, root.id);
		expect(archived).toEqual({ ok: true, value: { subtreeCount: 2 } });
		expect((await reload(root.id)).archivedAt).not.toBeNull();
		expect((await reload(child.id)).archivedAt).not.toBeNull();
		expect((await reload(sibling.id)).archivedAt).toBeNull();

		const restored = await unarchivePage(admin, root.id);
		expect(restored).toEqual({ ok: true, value: { subtreeCount: 2 } });
		expect((await reload(root.id)).archivedAt).toBeNull();
		expect((await reload(child.id)).archivedAt).toBeNull();
		expect((await historyOf(root.id)).map((entry) => entry.verb)).toEqual([
			'page.archived',
			'page.unarchived'
		]);
		expect(await historyOf(root.id)).toMatchObject([
			{ payload: { subtreeCount: 2 } },
			{ payload: { subtreeCount: 2 } }
		]);
	});

	it('keeps a branch archived on its own earlier, and refuses under an archived parent', async () => {
		const { organisation, admin } = await createWorkspace();
		const space = await createSpaceRow(organisation.id);
		const root = await createPageRow(organisation.id, space.id);
		const child = await createPageRow(organisation.id, space.id, { parentId: root.id });
		const grandchild = await createPageRow(organisation.id, space.id, { parentId: child.id });

		await archivePage(admin, grandchild.id);
		await archivePage(admin, root.id);

		expect(await unarchivePage(admin, child.id)).toEqual({ ok: false, error: 'parent_archived' });
		await unarchivePage(admin, root.id);
		expect((await reload(grandchild.id)).archivedAt).not.toBeNull();
		expect((await reload(child.id)).archivedAt).toBeNull();
	});

	it('refuses archiving twice and unarchiving a live page', async () => {
		const { organisation, admin } = await createWorkspace();
		const space = await createSpaceRow(organisation.id);
		const page = await createPageRow(organisation.id, space.id);

		expect(await unarchivePage(admin, page.id)).toEqual({ ok: false, error: 'not_archived' });
		await archivePage(admin, page.id);
		expect(await archivePage(admin, page.id)).toEqual({ ok: false, error: 'archived' });
	});
});

describe('reorderPage', () => {
	it('places a page before and after a sibling, and refuses non-siblings', async () => {
		const { organisation, admin } = await createWorkspace();
		const space = await createSpaceRow(organisation.id);
		const a = await createPageRow(organisation.id, space.id, { title: 'A', position: '1000' });
		const b = await createPageRow(organisation.id, space.id, { title: 'B', position: '2000' });
		const c = await createPageRow(organisation.id, space.id, { title: 'C', position: '3000' });
		const child = await createPageRow(organisation.id, space.id, { parentId: a.id });

		await reorderPage(admin, c.id, { before: a.id });
		await reorderPage(admin, a.id, { after: b.id });

		const order = (await listSpaceTree(admin, space.id))
			.filter((entry) => entry.parentId === null)
			.map((entry) => entry.title);
		expect(order).toEqual(['C', 'B', 'A']);
		expect(await reorderPage(admin, c.id, { before: child.id })).toEqual({
			ok: false,
			error: 'not_siblings'
		});
	});

	it('keeps a stable order after many inserts between the same two siblings', async () => {
		const { organisation, admin } = await createWorkspace();
		const space = await createSpaceRow(organisation.id);
		const left = await createPageRow(organisation.id, space.id, { title: 'L', position: '1000' });
		await createPageRow(organisation.id, space.id, { title: 'R', position: '2000' });
		const movers = [];
		for (let i = 0; i < 40; i += 1) {
			movers.push(
				await createPageRow(organisation.id, space.id, {
					title: `m${i}`,
					position: String(3000 + i)
				})
			);
		}

		// Each page lands right after the left one, so the gap halves every time.
		for (const mover of movers) {
			expect((await reorderPage(admin, mover.id, { after: left.id })).ok).toBe(true);
		}

		const titles = (await listSpaceTree(admin, space.id)).map((entry) => entry.title);
		expect(titles).toEqual(['L', ...movers.map((mover) => mover.title).reverse(), 'R']);
	});
});

describe('reads', () => {
	async function tree() {
		const { organisation, admin, employee } = await createWorkspace();
		const portal = await createSpaceRow(organisation.id, { audience: 'portal' });
		const staffOnly = await createSpaceRow(organisation.id, { audience: 'staff' });
		const root = await createPageRow(organisation.id, portal.id, { title: 'Root', ...published() });
		const leaf = await createPageRow(organisation.id, portal.id, {
			title: 'Leaf',
			parentId: root.id,
			...published()
		});
		const draft = await createPageRow(organisation.id, portal.id, {
			title: 'Draft',
			position: '2'
		});
		const archived = await createPageRow(organisation.id, portal.id, {
			title: 'Old',
			position: '3',
			...published(),
			archivedAt: new Date()
		});
		const internal = await createPageRow(organisation.id, staffOnly.id, {
			title: 'Internal',
			...published()
		});
		return { admin, employee, portal, staffOnly, root, leaf, draft, archived, internal };
	}

	it('gives an employee only published, unarchived pages of portal spaces', async () => {
		const { employee, portal, staffOnly, draft, archived, internal } = await tree();

		const visible = await listSpaceTree(employee, portal.id, { includeArchived: true });
		expect(visible.map((entry) => entry.title).sort()).toEqual(['Leaf', 'Root']);
		expect(await listSpaceTree(employee, staffOnly.id)).toEqual([]);
		for (const hidden of [draft, archived, internal]) {
			expect(await getPageByTag(employee, hidden.pageTag)).toEqual({
				ok: false,
				error: 'not_found'
			});
		}
	});

	it('counts only published pages for an employee, drafts included for staff', async () => {
		const { employee, admin, portal } = await tree();

		const countOf = async (viewer: typeof employee) =>
			(await listSpaces(viewer)).find((entry) => entry.id === portal.id)?.pageCount;
		expect(await countOf(employee)).toBe(2);
		expect(await countOf(admin)).toBe(3);
	});

	it('gives staff drafts, and archived pages only when asked', async () => {
		const { admin, portal, staffOnly } = await tree();

		const plain = await listSpaceTree(admin, portal.id);
		expect(plain.map((entry) => entry.title)).toEqual(['Root', 'Draft', 'Leaf']);
		expect(plain.find((entry) => entry.title === 'Draft')?.status).toBe('draft');
		const all = await listSpaceTree(admin, portal.id, { includeArchived: true });
		expect(all.find((entry) => entry.title === 'Old')?.status).toBe('archived');
		expect(await listSpaceTree(admin, staffOnly.id)).toHaveLength(1);
	});

	it('returns the page with its space and breadcrumb, tag in any case', async () => {
		const { employee, portal, root, leaf } = await tree();

		const found = await getPageByTag(employee, leaf.pageTag.toLowerCase());
		if (!found.ok) throw new Error('expected the page');
		expect(found.value).toMatchObject({
			title: 'Leaf',
			status: 'published',
			space: { id: portal.id }
		});
		expect(found.value.path).toEqual([{ id: root.id, tag: root.pageTag, title: 'Root' }]);
	});

	it('lets staff read an archived page by its tag', async () => {
		const { admin, archived } = await tree();
		const found = await getPageByTag(admin, archived.pageTag);
		expect(found.ok && found.value.status).toBe('archived');
	});
});

describe('pickPages (#324)', () => {
	it('offers staff drafts and both audiences, and never archived pages', async () => {
		const { organisation, admin, employee } = await createWorkspace();
		const portal = await createSpaceRow(organisation.id, { audience: 'portal', name: 'Ayuda' });
		const internal = await createSpaceRow(organisation.id, { audience: 'staff', name: 'Interno' });
		await createPageRow(organisation.id, portal.id, { title: 'VPN en casa', ...published() });
		await createPageRow(organisation.id, portal.id, { title: 'VPN borrador', position: '2' });
		await createPageRow(organisation.id, portal.id, {
			title: 'VPN antigua',
			position: '3',
			...published(),
			archivedAt: new Date()
		});
		await createPageRow(organisation.id, internal.id, { title: 'VPN servidor', ...published() });
		await createPageRow(organisation.id, portal.id, { title: 'Impresoras', ...published() });

		const staff = await pickPages(admin, 'vpn');
		expect(staff.map((pick) => pick.title).sort()).toEqual([
			'VPN borrador',
			'VPN en casa',
			'VPN servidor'
		]);
		expect(staff.find((pick) => pick.title === 'VPN borrador')).toMatchObject({
			status: 'draft',
			spaceName: 'Ayuda'
		});

		const portalOnly = await pickPages(employee, 'vpn');
		expect(portalOnly.map((pick) => pick.title)).toEqual(['VPN en casa']);
	});

	it('matches the code, treats % and _ literally, and caps the list', async () => {
		const { organisation, admin } = await createWorkspace();
		const space = await createSpaceRow(organisation.id);
		const created = await Promise.all(
			Array.from({ length: PAGE_PICK_LIMIT + 2 }, (_, i) =>
				createPageRow(organisation.id, space.id, { title: `Página ${i}`, position: String(i + 1) })
			)
		);

		expect(await pickPages(admin, '')).toHaveLength(PAGE_PICK_LIMIT);
		expect((await pickPages(admin, created[3].pageTag.toLowerCase())).map((p) => p.tag)).toEqual([
			created[3].pageTag
		]);
		expect(await pickPages(admin, '%')).toEqual([]);
		expect(await pickPages(admin, '_')).toEqual([]);
	});
});
