import { describe, expect, it } from 'vitest';
import {
	createPageRow,
	createSpaceRow,
	createWorkspace
} from '#lib/server/knowledge/testing/fixtures.js';
import { GET as preview } from '../[tag]/preview/+server';
import { GET as suggest } from './+server';

const event = (user: unknown, search = '', params: Record<string, string> = {}) =>
	({
		locals: { user },
		params,
		url: new URL(`http://localhost/portal/knowledge/suggest${search}`)
	}) as never;

async function scenario() {
	const w = await createWorkspace();
	const published = new Date();
	const portal = await createSpaceRow(w.organisation.id, { name: 'Ayuda', audience: 'portal' });
	const staff = await createSpaceRow(w.organisation.id, { name: 'Interno', audience: 'staff' });
	for (let n = 1; n <= 7; n++) {
		await createPageRow(w.organisation.id, portal.id, {
			title: `Impresora guía ${n}`,
			position: String(n),
			publishedAt: published
		});
	}
	const draft = await createPageRow(w.organisation.id, portal.id, {
		title: 'Impresora borrador',
		position: '9'
	});
	const internal = await createPageRow(w.organisation.id, staff.id, {
		title: 'Impresora del CPD',
		publishedAt: published
	});
	return { ...w, draft, internal };
}

describe('portal knowledge: suggestions', () => {
	it('returns at most five published portal pages matching the subject', async () => {
		const w = await scenario();

		const body = await (await suggest(event(w.employee, '?q=impresora'))).json();

		expect(body.pages).toHaveLength(5);
		expect(Object.keys(body.pages[0]).sort()).toEqual(['tag', 'title']);
		expect(body.pages.map((hit: { title: string }) => hit.title)).not.toContain(
			'Impresora borrador'
		);
		expect(body.pages.map((hit: { title: string }) => hit.title)).not.toContain(
			'Impresora del CPD'
		);
	});

	it('suggests nothing for a subject shorter than three characters', async () => {
		const w = await scenario();

		const body = await (await suggest(event(w.employee, '?q=im'))).json();

		expect(body.pages).toEqual([]);
	});

	it('suggests nothing to staff, who would otherwise see drafts and staff pages', async () => {
		const w = await scenario();

		const body = await (await suggest(event(w.technician, '?q=impresora'))).json();

		expect(body.pages).toEqual([]);
	});
});

describe('portal knowledge: suggestion preview', () => {
	it('renders a readable page and answers 404 for a draft', async () => {
		const w = await scenario();
		const page = await createPageRow(
			w.organisation.id,
			(await createSpaceRow(w.organisation.id, { audience: 'portal' })).id,
			{
				title: 'Guía',
				body: 'Pulsa **aquí**.',
				publishedAt: new Date()
			}
		);

		const body = await (await preview(event(w.employee, '', { tag: page.pageTag }))).json();
		expect(body).toMatchObject({ title: 'Guía', attachments: [] });
		expect(body.bodyHtml).toContain('<strong>aquí</strong>');

		await expect(preview(event(w.employee, '', { tag: w.draft.pageTag }))).rejects.toMatchObject({
			status: 404
		});
	});
});
