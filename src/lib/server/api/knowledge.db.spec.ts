import { describe, expect, it } from 'vitest';
import { createPageRow, createSpaceRow, createWorkspace } from '../knowledge/testing/fixtures';
import { authenticateRequest } from './authenticate-request';
import { handleApiRequest } from './dispatch';
import { createApiKey } from './keys';
import type { ApiPrincipal } from './keys';
import { createServiceAccount, createServiceAccountKey } from './service-accounts';

/**
 * The knowledge base use cases over HTTP (#234): a real `Request` through the
 * dispatcher against a real database, asserted as a `curl` would see it.
 */

type Workspace = Awaited<ReturnType<typeof createWorkspace>>;

async function keyFor(owner: Workspace['technician'], scopes: string[]) {
	const issued = await createApiKey(owner, {
		name: crypto.randomUUID(),
		scopes: scopes as Parameters<typeof createApiKey>[1]['scopes'],
		expiresInDays: 90
	});
	if (!issued.ok) throw new Error(issued.error);
	return issued.value.key;
}

async function send(method: string, path: string, key: string, body?: Record<string, unknown>) {
	const request = new Request(`http://localhost${path}`, {
		method,
		headers: {
			authorization: `Bearer ${key}`,
			...(body ? { 'content-type': 'application/json' } : {})
		},
		body: body ? JSON.stringify(body) : undefined
	});
	const locals = { ...(await authenticateRequest(request)) } as unknown as App.Locals;
	const response = await handleApiRequest({ request, locals });
	const text = await response.text();
	return { response, body: text ? JSON.parse(text) : null };
}

/** An employee cannot own a key, so the principal is built by hand. */
async function sendAs(principal: ApiPrincipal, method: string, path: string) {
	const request = new Request(`http://localhost${path}`, { method });
	const locals = {
		user: principal,
		api: { ok: true, keyId: principal.keyId }
	} as unknown as App.Locals;
	const response = await handleApiRequest({ request, locals });
	const text = await response.text();
	return { response, body: text ? JSON.parse(text) : null };
}

const api = (path: string) => `/api/v1${path}`;
const tags = (rows: { tag: string }[]) => rows.map((row) => row.tag);

async function scene() {
	const base = await createWorkspace();
	const orgId = base.organisation.id;
	const portal = await createSpaceRow(orgId, { name: 'Help', audience: 'portal' });
	const staff = await createSpaceRow(orgId, { name: 'Runbooks', audience: 'staff' });
	const now = new Date();
	const live = { publishedAt: now, revision: 1 };
	const root = await createPageRow(orgId, portal.id, { title: 'Root', position: '1', ...live });
	const second = await createPageRow(orgId, portal.id, { title: 'Second', position: '2', ...live });
	const child = await createPageRow(orgId, portal.id, {
		title: 'Child',
		parentId: root.id,
		position: '1',
		...live
	});
	const draft = await createPageRow(orgId, portal.id, { title: 'Draft', position: '3' });
	const hidden = await createPageRow(orgId, staff.id, { title: 'Secret', position: '1', ...live });
	const full = await keyFor(base.technician, ['knowledge.view', 'knowledge.manage']);
	const employee = {
		...base.employee,
		keyId: crypto.randomUUID(),
		scopes: ['knowledge.view']
	} as ApiPrincipal;
	return { ...base, portal, staff, root, second, child, draft, hidden, full, employee };
}

/** Pages created through the API, so each has its revision 1. */
async function draftVia(key: string, spaceId: string, title: string, parentTag?: string) {
	const made = await send('POST', api('/pages'), key, {
		spaceId,
		title,
		body: `Body of ${title}`,
		...(parentTag ? { parentTag } : {})
	});
	expect(made.response.status).toBe(201);
	return made.body.data as { tag: string; revision: number };
}

describe('reading as an employee key', () => {
	it('lists only portal spaces and 404s on a staff space tree', async () => {
		const s = await scene();

		const spaces = await sendAs(s.employee, 'GET', api('/spaces'));
		const staffTree = await sendAs(s.employee, 'GET', api(`/spaces/${s.staff.id}/pages`));
		const missingTree = await sendAs(
			s.employee,
			'GET',
			api(`/spaces/${crypto.randomUUID()}/pages`)
		);

		expect(spaces.body.data.map((space: { name: string }) => space.name)).toEqual(['Help']);
		expect(spaces.body.data[0].pageCount).toBe(3);
		expect(staffTree.response.status).toBe(404);
		expect(missingTree.response.status).toBe(404);
	});

	it('404s on a draft, an archived page and a staff page, and search never returns them', async () => {
		const s = await scene();
		await createPageRow(s.organisation.id, s.portal.id, {
			title: 'Needle archived',
			publishedAt: new Date(),
			archivedAt: new Date(),
			position: '9'
		});
		await createPageRow(s.organisation.id, s.portal.id, {
			title: 'Needle draft',
			position: '8'
		});
		await createPageRow(s.organisation.id, s.staff.id, {
			title: 'Needle staff',
			publishedAt: new Date(),
			position: '7'
		});
		await createPageRow(s.organisation.id, s.portal.id, {
			title: 'Needle public',
			publishedAt: new Date(),
			position: '6'
		});

		for (const page of [s.draft, s.hidden]) {
			expect((await sendAs(s.employee, 'GET', api(`/pages/${page.pageTag}`))).response.status).toBe(
				404
			);
		}
		const open = await sendAs(s.employee, 'GET', api(`/pages/${s.root.pageTag.toLowerCase()}`));
		const hits = await sendAs(s.employee, 'GET', api('/pages?search=needle'));

		expect(open.response.status).toBe(200);
		expect(open.body.data.tag).toBe(s.root.pageTag);
		expect(hits.body.data.map((hit: { title: string }) => hit.title)).toEqual(['Needle public']);
		expect(hits.body).not.toHaveProperty('meta');
	});

	it('ignores archived=true', async () => {
		const s = await scene();
		await createSpaceRow(s.organisation.id, { name: 'Old', archivedAt: new Date() });

		const spaces = await sendAs(s.employee, 'GET', api('/spaces?archived=true'));
		const tree = await sendAs(s.employee, 'GET', api(`/spaces/${s.portal.id}/pages?archived=true`));

		expect(spaces.body.data.map((space: { name: string }) => space.name)).toEqual(['Help']);
		expect(tags(tree.body.data)).toEqual([s.root.pageTag, s.child.pageTag, s.second.pageTag]);
	});
});

describe('reading as a technician key', () => {
	it('sees both audiences and drafts, and only archived ones with archived=true', async () => {
		const s = await scene();
		const old = await createSpaceRow(s.organisation.id, { name: 'Old', archivedAt: new Date() });

		const spaces = await send('GET', api('/spaces'), s.full);
		const archived = await send('GET', api('/spaces?archived=true'), s.full);
		const tree = await send('GET', api(`/spaces/${s.portal.id}/pages`), s.full);
		const staffTree = await send('GET', api(`/spaces/${s.staff.id}/pages`), s.full);
		const draft = await send('GET', api(`/pages/${s.draft.pageTag}`), s.full);

		expect(spaces.body.data.map((space: { name: string }) => space.name)).toEqual([
			'Help',
			'Runbooks'
		]);
		expect(archived.body.data.map((space: { id: string }) => space.id)).toEqual([old.id]);
		expect(tags(tree.body.data)).toContain(s.draft.pageTag);
		expect(tags(staffTree.body.data)).toEqual([s.hidden.pageTag]);
		expect(draft.body.data.status).toBe('draft');
		expect(draft.body.data.space).toEqual({
			id: s.portal.id,
			name: 'Help',
			audience: 'portal'
		});
	});

	it('walks the tree in preorder with depth and parentTag, archived page under a live parent included', async () => {
		const s = await scene();
		const grand = await createPageRow(s.organisation.id, s.portal.id, {
			title: 'Grandchild',
			parentId: s.child.id,
			position: '1',
			publishedAt: new Date(),
			archivedAt: new Date()
		});

		const tree = await send('GET', api(`/spaces/${s.portal.id}/pages`), s.full);
		const archived = await send('GET', api(`/spaces/${s.portal.id}/pages?archived=true`), s.full);

		expect(
			tree.body.data.map((e: { tag: string; depth: number; parentTag: string | null }) => [
				e.tag,
				e.depth,
				e.parentTag
			])
		).toEqual([
			[s.root.pageTag, 0, null],
			[s.child.pageTag, 1, s.root.pageTag],
			[s.second.pageTag, 0, null],
			[s.draft.pageTag, 0, null]
		]);
		expect(archived.body.data).toEqual([
			{
				tag: grand.pageTag,
				title: 'Grandchild',
				parentTag: s.child.pageTag,
				depth: 2,
				status: 'archived'
			}
		]);
	});

	it('answers a page with its breadcrumb', async () => {
		const s = await scene();

		const found = await send('GET', api(`/pages/${s.child.pageTag}`), s.full);

		expect(found.body.data.parentTag).toBe(s.root.pageTag);
		expect(found.body.data.path).toEqual([{ tag: s.root.pageTag, title: 'Root' }]);
		expect(found.body.data).not.toHaveProperty('id');
	});
});

describe('a key without knowledge.manage', () => {
	it('gets 404 on every write and on both revision endpoints', async () => {
		const s = await scene();
		const viewOnly = await keyFor(s.technician, ['knowledge.view']);
		const tag = s.root.pageTag;
		const calls: [string, string, Record<string, unknown>?][] = [
			['GET', `/pages/${tag}/revisions`],
			['GET', `/pages/${tag}/revisions/1`],
			['POST', '/pages', { spaceId: s.portal.id, title: 'x' }],
			['PATCH', `/pages/${tag}`, { title: 'x', baseRevision: 1 }],
			['POST', `/pages/${tag}/move`, { spaceId: s.portal.id, parentTag: null }],
			['POST', `/pages/${tag}/publish`, {}],
			['POST', `/pages/${tag}/archive`, {}],
			['DELETE', `/pages/${tag}/archive`]
		];

		for (const [method, path, body] of calls) {
			expect((await send(method, api(path), viewOnly, body)).response.status, path).toBe(404);
		}
		const employeeWrite = await sendAs(s.employee, 'POST', api(`/pages/${tag}/publish`));
		expect(employeeWrite.response.status).toBe(404);
	});
});

describe('POST /pages', () => {
	it('creates a draft, answers 201 with Location, and refuses unknown references on the field', async () => {
		const s = await scene();

		const made = await send('POST', api('/pages'), s.full, {
			spaceId: s.portal.id,
			title: '  New page ',
			parentTag: s.root.pageTag
		});
		const noSpace = await send('POST', api('/pages'), s.full, {
			spaceId: crypto.randomUUID(),
			title: 'x'
		});
		const noParent = await send('POST', api('/pages'), s.full, {
			spaceId: s.portal.id,
			title: 'x',
			parentTag: 'DOC-9999'
		});
		const wrongSpaceParent = await send('POST', api('/pages'), s.full, {
			spaceId: s.staff.id,
			title: 'x',
			parentTag: s.root.pageTag
		});
		const archivedSpace = await createSpaceRow(s.organisation.id, { archivedAt: new Date() });
		const closed = await send('POST', api('/pages'), s.full, {
			spaceId: archivedSpace.id,
			title: 'x'
		});

		expect(made.response.status).toBe(201);
		expect(made.response.headers.get('location')).toBe(`/api/v1/pages/${made.body.data.tag}`);
		expect(made.body.data).toMatchObject({
			title: 'New page',
			body: '',
			status: 'draft',
			revision: 1,
			parentTag: s.root.pageTag
		});
		expect(noSpace.response.status).toBe(400);
		expect(noSpace.body.error.issues[0].path).toEqual(['spaceId']);
		expect(noParent.response.status).toBe(400);
		expect(noParent.body.error.issues[0].path).toEqual(['parentTag']);
		expect(wrongSpaceParent.response.status).toBe(400);
		expect(closed.response.status).toBe(409);
		expect(closed.body.error.code).toBe('space_archived');
	});

	it('refuses a body over the limit on the body field', async () => {
		const s = await scene();

		const long = await send('POST', api('/pages'), s.full, {
			spaceId: s.portal.id,
			title: 'x',
			body: 'a'.repeat(200_001)
		});

		expect(long.response.status).toBe(400);
		expect(long.body.error.issues[0].path).toEqual(['body']);
	});
});

describe('PATCH /pages/{tag}', () => {
	it('keeps the other field, keeps the revision for identical content, and 409s on a stale base', async () => {
		const s = await scene();
		const page = await draftVia(s.full, s.portal.id, 'Guide');

		const retitled = await send('PATCH', api(`/pages/${page.tag}`), s.full, {
			title: 'Guide v2',
			baseRevision: 1
		});
		const same = await send('PATCH', api(`/pages/${page.tag}`), s.full, {
			title: 'Guide v2',
			baseRevision: 1
		});
		const stale = await send('PATCH', api(`/pages/${page.tag}`), s.full, {
			body: 'Other',
			baseRevision: 1
		});
		const history = await send('GET', api(`/pages/${page.tag}/revisions`), s.full);

		expect(retitled.response.status).toBe(200);
		expect(retitled.body.data).toMatchObject({
			title: 'Guide v2',
			body: 'Body of Guide',
			revision: 2
		});
		expect(same.body.data.revision).toBe(2);
		expect(stale.response.status).toBe(409);
		expect(stale.body.error.code).toBe('stale_revision');
		expect(stale.body.error.details).toMatchObject({ revision: 2 });
		expect(stale.body.error.details.savedAt).toEqual(expect.any(String));
		expect(history.body.meta.total).toBe(2);
	});

	it('is 400 without baseRevision or without a field to change', async () => {
		const s = await scene();
		const page = await draftVia(s.full, s.portal.id, 'Guide');

		const noBase = await send('PATCH', api(`/pages/${page.tag}`), s.full, { title: 'x' });
		const nothing = await send('PATCH', api(`/pages/${page.tag}`), s.full, { baseRevision: 1 });

		expect(noBase.response.status).toBe(400);
		expect(nothing.response.status).toBe(400);
	});
});

describe('moving', () => {
	it('asks for confirmation across audiences, then moves, and refuses a wrong count', async () => {
		const s = await scene();
		const parent = await draftVia(s.full, s.portal.id, 'Parent');
		await draftVia(s.full, s.portal.id, 'Kid', parent.tag);
		const target = { spaceId: s.staff.id, parentTag: null };

		const ask = await send('POST', api(`/pages/${parent.tag}/move`), s.full, target);
		const wrong = await send('POST', api(`/pages/${parent.tag}/move`), s.full, {
			...target,
			confirmedCount: 5
		});
		const done = await send('POST', api(`/pages/${parent.tag}/move`), s.full, {
			...target,
			confirmedCount: 2
		});

		expect(ask.response.status).toBe(409);
		expect(ask.body.error.code).toBe('confirmation_required');
		expect(ask.body.error.details).toEqual({
			subtreeCount: 2,
			fromAudience: 'portal',
			toAudience: 'staff'
		});
		expect(wrong.body.error.code).toBe('count_changed');
		expect(wrong.body.error.details.subtreeCount).toBe(2);
		expect(done.response.status).toBe(200);
		expect(done.body.data.space.id).toBe(s.staff.id);
	});

	it('refuses a move under a descendant', async () => {
		const s = await scene();

		const cycle = await send('POST', api(`/pages/${s.root.pageTag}/move`), s.full, {
			spaceId: s.portal.id,
			parentTag: s.child.pageTag
		});

		expect(cycle.response.status).toBe(409);
		expect(cycle.body.error.code).toBe('cycle');
	});

	it('reorders among siblings with position, and 400s on an unreadable anchor', async () => {
		const s = await scene();

		const reorder = await send('POST', api(`/pages/${s.second.pageTag}/move`), s.full, {
			spaceId: s.portal.id,
			parentTag: null,
			position: { before: s.root.pageTag }
		});
		const tree = await send('GET', api(`/spaces/${s.portal.id}/pages`), s.full);
		const bad = await send('POST', api(`/pages/${s.second.pageTag}/move`), s.full, {
			spaceId: s.portal.id,
			parentTag: null,
			position: { before: 'DOC-9999' }
		});

		expect(reorder.response.status).toBe(200);
		expect(tags(tree.body.data).slice(0, 2)).toEqual([s.second.pageTag, s.root.pageTag]);
		expect(bad.response.status).toBe(400);
		expect(bad.body.error.issues[0].path).toEqual(['position']);
	});
});

describe('publish, archive and unarchive', () => {
	it('answer 200 and are no-ops when repeated', async () => {
		const s = await scene();
		const page = await draftVia(s.full, s.portal.id, 'Guide');

		const first = await send('POST', api(`/pages/${page.tag}/publish`), s.full, {});
		const again = await send('POST', api(`/pages/${page.tag}/publish`), s.full, {});
		const archive = await send('POST', api(`/pages/${page.tag}/archive`), s.full, {});
		const archiveAgain = await send('POST', api(`/pages/${page.tag}/archive`), s.full, {});
		const restore = await send('DELETE', api(`/pages/${page.tag}/archive`), s.full);
		const restoreAgain = await send('DELETE', api(`/pages/${page.tag}/archive`), s.full);

		expect(first.body.data.status).toBe('published');
		expect(again.response.status).toBe(200);
		expect(again.body.data.publishedAt).toBe(first.body.data.publishedAt);
		expect(archive.body.data.status).toBe('archived');
		expect(archiveAgain.response.status).toBe(200);
		expect(archiveAgain.body.data.archivedAt).toBe(archive.body.data.archivedAt);
		expect(restore.body.data.status).toBe('published');
		expect(restoreAgain.response.status).toBe(200);
	});

	it('refuses to publish under a draft parent', async () => {
		const s = await scene();
		const parent = await draftVia(s.full, s.portal.id, 'Parent');
		const kid = await draftVia(s.full, s.portal.id, 'Kid', parent.tag);

		const refused = await send('POST', api(`/pages/${kid.tag}/publish`), s.full, {});

		expect(refused.response.status).toBe(409);
		expect(refused.body.error.code).toBe('parent_unpublished');
	});
});

describe('revisions', () => {
	it('pages the history with meta and returns one revision with its body', async () => {
		const s = await scene();
		const page = await draftVia(s.full, s.portal.id, 'Guide');
		await send('PATCH', api(`/pages/${page.tag}`), s.full, { body: 'Two', baseRevision: 1 });
		await send('PATCH', api(`/pages/${page.tag}`), s.full, { body: 'Three', baseRevision: 2 });

		const list = await send('GET', api(`/pages/${page.tag}/revisions?perPage=2`), s.full);
		const second = await send('GET', api(`/pages/${page.tag}/revisions?perPage=2&page=2`), s.full);
		const one = await send('GET', api(`/pages/${page.tag}/revisions/2`), s.full);
		const unknown = await send('GET', api(`/pages/${page.tag}/revisions/9`), s.full);

		expect(list.body.data.map((r: { number: number }) => r.number)).toEqual([3, 2]);
		expect(list.body.data[0]).not.toHaveProperty('body');
		expect(list.body.meta).toEqual({ page: 1, perPage: 2, total: 3, pageCount: 2 });
		expect(second.body.data.map((r: { number: number }) => r.number)).toEqual([1]);
		expect(one.body.data).toMatchObject({ number: 2, body: 'Two' });
		expect(unknown.response.status).toBe(404);
	});

	it('names a service account as the author of what it saved', async () => {
		const s = await scene();
		const account = await createServiceAccount(s.admin, { name: 'Docs bot', role: 'technician' });
		if (!account.ok) throw new Error(account.error);
		const issued = await createServiceAccountKey(s.admin, account.value.id, {
			name: 'bot',
			scopes: ['knowledge.view', 'knowledge.manage'],
			expiresInDays: null
		});
		if (!issued.ok) throw new Error(issued.error);
		const page = await draftVia(s.full, s.portal.id, 'Guide');

		const saved = await send('PATCH', api(`/pages/${page.tag}`), issued.value.key, {
			body: 'By bot',
			baseRevision: 1
		});
		const history = await send('GET', api(`/pages/${page.tag}/revisions`), s.full);

		expect(saved.body.data.revisionAuthorName).toBe('Docs bot');
		expect(history.body.data[0].authorName).toBe('Docs bot');
	});
});

describe('GET /pages (search)', () => {
	it('is 400 under three characters, and spaceId narrows the hits', async () => {
		const s = await scene();
		const other = await draftVia(s.full, s.portal.id, 'Zebra care');
		await send('POST', api(`/pages/${other.tag}/publish`), s.full, {});
		const staffPage = await createPageRow(s.organisation.id, s.staff.id, {
			title: 'Zebra staff',
			publishedAt: new Date(),
			position: '5'
		});

		const short = await send('GET', api('/pages?search=ze'), s.full);
		const all = await send('GET', api('/pages?search=zebra'), s.full);
		const narrowed = await send('GET', api(`/pages?search=zebra&spaceId=${s.staff.id}`), s.full);

		expect(short.response.status).toBe(400);
		expect(short.body.error.issues[0].path).toEqual(['search']);
		expect(all.body.data.map((hit: { title: string }) => hit.title)).toContain('Zebra care');
		expect(tags(narrowed.body.data)).toContain(staffPage.pageTag);
		expect(
			narrowed.body.data.every((hit: { spaceName: string }) => hit.spaceName === 'Runbooks')
		).toBe(true);
	});
});
