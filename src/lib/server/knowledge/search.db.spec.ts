import { describe, expect, it } from 'vitest';
import { searchPages } from './index';
import { createPageRow, createSpaceRow, createWorkspace } from './testing/fixtures';

/**
 * One term, "impresora", in every kind of page the scope must tell apart: a
 * published page of a portal space, the same words in a staff space, a draft, an
 * archived page and a page of an archived space. Only the first is the employee's.
 */
async function scenario() {
	const workspace = await createWorkspace();
	const { organisation } = workspace;
	const published = new Date();

	const portal = await createSpaceRow(organisation.id, { name: 'Ayuda', audience: 'portal' });
	const staff = await createSpaceRow(organisation.id, { name: 'Interno', audience: 'staff' });
	const old = await createSpaceRow(organisation.id, {
		name: 'Antiguo',
		audience: 'portal',
		archivedAt: new Date()
	});

	const visible = await createPageRow(organisation.id, portal.id, {
		title: 'Conectar la impresora',
		body: 'Pulsa **el botón** de la **impresora** durante tres segundos.',
		publishedAt: published
	});
	await createPageRow(organisation.id, staff.id, {
		title: 'Reiniciar la impresora del CPD',
		body: 'Solo para técnicos.',
		publishedAt: published
	});
	await createPageRow(organisation.id, portal.id, {
		title: 'Borrador de impresora',
		body: 'Todavía sin publicar.'
	});
	await createPageRow(organisation.id, portal.id, {
		title: 'Impresora retirada',
		publishedAt: published,
		archivedAt: new Date()
	});
	await createPageRow(organisation.id, old.id, {
		title: 'Impresora del espacio antiguo',
		publishedAt: published
	});

	return { ...workspace, portal, staff, visible };
}

describe('searchPages', () => {
	it("finds an employee only the published pages of the organisation's portal spaces", async () => {
		const { employee, visible, portal } = await scenario();

		const hits = await searchPages(employee, 'impresora', { limit: 20 });

		expect(hits).toEqual([
			{
				tag: visible.pageTag,
				title: 'Conectar la impresora',
				spaceName: portal.name,
				excerpt: 'Pulsa el botón de la impresora durante tres segundos.'
			}
		]);
	});

	it('finds a technician the staff space and the draft too, never archived pages', async () => {
		const { technician } = await scenario();

		const hits = await searchPages(technician, 'impresora', { limit: 20 });

		expect(hits.map((hit) => hit.title).sort()).toEqual([
			'Borrador de impresora',
			'Conectar la impresora',
			'Reiniciar la impresora del CPD'
		]);
	});

	it('stems and ignores accents like the ticket search', async () => {
		const { employee } = await scenario();

		expect(await searchPages(employee, 'impresoras', { limit: 20 })).toHaveLength(1);
		expect(await searchPages(employee, 'BOTON', { limit: 20 })).toHaveLength(1);
	});

	it('limits the results to one space', async () => {
		const { employee, portal, staff } = await scenario();

		expect(
			await searchPages(employee, 'impresora', { limit: 20, spaceId: portal.id })
		).toHaveLength(1);
		expect(await searchPages(employee, 'impresora', { limit: 20, spaceId: staff.id })).toEqual([]);
	});

	it('honours the limit and answers nothing to an empty query', async () => {
		const { employee, organisation, portal } = await scenario();
		await createPageRow(organisation.id, portal.id, {
			title: 'Otra impresora',
			publishedAt: new Date()
		});

		expect(await searchPages(employee, 'impresora', { limit: 1 })).toHaveLength(1);
		expect(await searchPages(employee, '   ', { limit: 20 })).toEqual([]);
	});
});
