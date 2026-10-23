import { describe, expect, it } from 'vitest';
import { mentionToken } from '#lib/domain/mentions.js';
import { addPageComment } from '#lib/server/knowledge/index.js';
import {
	createPageRow,
	createSpaceRow,
	createWorkspace
} from '#lib/server/knowledge/testing/fixtures.js';
import { actions, load } from './+page.server';
import { GET as mentions } from './mentions/+server';

async function setup(audience: 'staff' | 'portal', slug = 'acme') {
	const w = await createWorkspace(slug === 'acme' ? 'Acme' : slug, slug);
	const space = await createSpaceRow(w.organisation.id, { audience });
	const page = await createPageRow(w.organisation.id, space.id, {
		title: 'Alta de VPN',
		publishedAt: new Date()
	});
	await addPageComment(w.technician, page.id, 'Solo para el equipo', { mailer: null });
	return { ...w, page };
}

const event = (user: unknown, tag: string, search = '') =>
	({
		locals: { user },
		params: { tag },
		url: new URL(`http://localhost/knowledge/${tag}${search}`)
	}) as never;

/** What a browser would receive: the page's data after SvelteKit serialises it. */
async function serialised(user: unknown, tag: string) {
	return JSON.stringify(await load(event(user, tag)));
}

describe('/knowledge/[tag]', () => {
	it('gives staff the comments, in staff and portal spaces alike', async () => {
		for (const audience of ['staff', 'portal'] as const) {
			const s = await setup(audience, `acme-${audience}`);
			const data = await serialised(s.technician, s.page.pageTag);
			expect(data).toContain('Solo para el equipo');
			expect(data).toContain('"comments"');
		}
	});

	it('gives an employee nothing: not the comments, not their count, portal space included', async () => {
		const s = await setup('portal');

		const attempt = serialised(s.employee, s.page.pageTag);

		await expect(attempt).rejects.toMatchObject({ status: 403 });
	});

	it('refuses an employee the comment actions and the picker', async () => {
		const s = await setup('portal');
		const form = new FormData();
		form.set('body', 'Hola');
		const request = new Request('http://localhost/x', { method: 'POST', body: form });
		const addComment = (actions as Record<string, (e: never) => unknown>).addComment;

		await expect(
			addComment({ ...(event(s.employee, s.page.pageTag) as object), request } as never)
		).rejects.toMatchObject({ status: 403 });
		expect(() => mentions(event(s.employee, s.page.pageTag, '?q=a'))).rejects.toMatchObject({
			status: 403
		});
	});

	it('offers staff to the picker, never the viewer', async () => {
		const s = await setup('portal');
		const response = await mentions(event(s.technician, s.page.pageTag, '?q=a'));
		const rows = (await response.json()) as { id: string; label: string }[];
		expect(rows.map((row) => row.label)).toEqual(['Ada Admin']);
		expect(mentionToken(rows[0].label, rows[0].id)).toContain('person:');
	});
});
