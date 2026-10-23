import { describe, expect, it, vi } from 'vitest';
import { InMemoryStorage } from '#lib/server/shared/storage.js';

const storage = new InMemoryStorage();
vi.mock('#lib/server/shared/runtime.js', () => ({ runtimeStorage: () => storage }));

import { addPageAttachments } from '#lib/server/knowledge/index.js';
import {
	createPageRow,
	createSpaceRow,
	createWorkspace
} from '#lib/server/knowledge/testing/fixtures.js';
import { outcomeOf } from '#lib/server/projects/testing/action-event.js';
import { GET as download } from './[tag]/attachments/[id]/+server';
import { load as loadPage } from './[tag]/+page.server';
import { load as loadIndex } from './+page.server';
import { load as loadSpace } from './spaces/[id]/+page.server';

/** A portal space with a published page and a draft; a staff space with a published page. */
async function scenario() {
	const w = await createWorkspace();
	const published = new Date();
	const portal = await createSpaceRow(w.organisation.id, { name: 'Ayuda', audience: 'portal' });
	const staff = await createSpaceRow(w.organisation.id, { name: 'Interno', audience: 'staff' });

	const guide = await createPageRow(w.organisation.id, portal.id, {
		title: 'Conectar la VPN',
		body: 'Abre la **aplicación** de VPN.',
		publishedAt: published
	});
	const draft = await createPageRow(w.organisation.id, portal.id, {
		title: 'Borrador de VPN',
		position: '2'
	});
	const internal = await createPageRow(w.organisation.id, staff.id, {
		title: 'Reiniciar la VPN del CPD',
		publishedAt: published
	});
	return { ...w, portal, staff, guide, draft, internal };
}

const event = (user: unknown, params: Record<string, string> = {}, search = '') =>
	({
		locals: { user },
		params,
		url: new URL(`http://localhost/portal/knowledge${search}`)
	}) as never;

describe('portal knowledge: index', () => {
	it('lists only the portal spaces, counting published pages', async () => {
		const w = await scenario();

		const data = (await loadIndex(event(w.employee))) as never as {
			spaces: { name: string; pageCount: number }[];
			results: unknown;
		};

		expect(data.spaces.map(({ name, pageCount }) => ({ name, pageCount }))).toEqual([
			{ name: 'Ayuda', pageCount: 1 }
		]);
		expect(data.results).toBeNull();
	});

	it('searches a term that also appears in a staff page and returns only the portal one', async () => {
		const w = await scenario();

		const data = (await loadIndex(event(w.employee, {}, '?q=VPN'))) as never as {
			results: { tag: string; title: string }[];
		};

		expect(data.results.map((hit) => hit.title)).toEqual(['Conectar la VPN']);
	});

	it('sends a technician to the app screens', async () => {
		const w = await scenario();

		const outcome = await outcomeOf(() => loadIndex(event(w.technician)));

		expect(outcome.thrown).toMatchObject({ status: 303, location: '/knowledge' });
	});
});

describe('portal knowledge: space', () => {
	it('shows the published tree of a portal space', async () => {
		const w = await scenario();

		const data = (await loadSpace(event(w.employee, { id: w.portal.id }))) as never as {
			tree: { tag: string }[];
		};

		expect(data.tree.map((entry) => entry.tag)).toEqual([w.guide.pageTag]);
	});

	it('answers 404 for a staff space and for a malformed id', async () => {
		const w = await scenario();

		expect(
			(await outcomeOf(() => loadSpace(event(w.employee, { id: w.staff.id })))).thrown?.status
		).toBe(404);
		expect(
			(await outcomeOf(() => loadSpace(event(w.employee, { id: 'nope' })))).thrown?.status
		).toBe(404);
	});
});

describe('portal knowledge: page', () => {
	it('answers 404 for a draft and for a page of a staff space', async () => {
		const w = await scenario();

		for (const page of [w.draft, w.internal]) {
			const outcome = await outcomeOf(() => loadPage(event(w.employee, { tag: page.pageTag })));
			expect(outcome.thrown?.status).toBe(404);
		}
	});

	it('serialises only what the employee reads', async () => {
		const w = await scenario();

		const data = await loadPage(event(w.employee, { tag: w.guide.pageTag }));

		expect(Object.keys(data as object).sort()).toEqual([
			'attachments',
			'bodyHtml',
			'hasBody',
			'page',
			'path',
			'space',
			'tree'
		]);
		expect(data).toMatchObject({
			page: { tag: w.guide.pageTag, title: 'Conectar la VPN' },
			space: { name: 'Ayuda' }
		});
		expect((data as { bodyHtml: string }).bodyHtml).toContain('<strong>aplicación</strong>');
		expect(Object.keys((data as { page: object }).page).sort()).toEqual(['id', 'tag', 'title']);
	});
});

describe('portal knowledge: attachment download', () => {
	it('serves a readable page file and refuses one of a staff page', async () => {
		const w = await scenario();
		const file = {
			filename: 'guia.txt',
			contentType: 'text/plain',
			data: new TextEncoder().encode('hola')
		};
		const idOf = async (pageId: string) => {
			const added = await addPageAttachments(w.technician, pageId, [file]);
			if (!added.ok) throw new Error('setup');
			return added.value[0].id;
		};
		const readable = await idOf(w.guide.id);
		const hidden = await idOf(w.internal.id);

		const ok = (await download(
			event(w.employee, { tag: w.guide.pageTag, id: readable })
		)) as Response;
		expect(ok.status).toBe(200);
		expect(await ok.text()).toBe('hola');

		const refused = await outcomeOf(() =>
			download(event(w.employee, { tag: w.internal.pageTag, id: hidden }))
		);
		expect(refused.thrown?.status).toBe(404);
	});
});
