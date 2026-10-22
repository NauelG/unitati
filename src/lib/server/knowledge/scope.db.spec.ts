import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createOrganisation, createViewerWithoutPerson } from '../assets/testing/fixtures';
import { getDb } from '../db';
import { listSpaces, readablePages, readableSpaces } from './index';
import { pages } from './schema';
import { createPageRow, createSpaceRow, createWorkspace } from './testing/fixtures';

/**
 * Two spaces, one per audience, each with a published page, a draft and an
 * archived page; plus an archived portal space and a space of another
 * organisation. Enough for the scope to include and exclude something at every
 * step.
 */
async function scenario() {
	const workspace = await createWorkspace();
	const { organisation } = workspace;

	const portal = await createSpaceRow(organisation.id, { name: 'Ayuda', audience: 'portal' });
	const staff = await createSpaceRow(organisation.id, {
		name: 'Procedimientos',
		audience: 'staff'
	});
	const old = await createSpaceRow(organisation.id, {
		name: 'Antiguo',
		audience: 'portal',
		archivedAt: new Date()
	});

	const published = new Date();
	for (const space of [portal, staff, old]) {
		await createPageRow(organisation.id, space.id, { title: 'Published', publishedAt: published });
		await createPageRow(organisation.id, space.id, { title: 'Draft' });
		await createPageRow(organisation.id, space.id, {
			title: 'Archived',
			publishedAt: published,
			archivedAt: new Date()
		});
	}

	const other = await createOrganisation('Other', 'other');
	await createSpaceRow(other.id, { name: 'Elsewhere', audience: 'portal' });

	return { ...workspace, portal, staff, old };
}

describe('listSpaces', () => {
	it("returns an employee only the organisation's non-archived portal spaces, counting published pages", async () => {
		const { employee, portal } = await scenario();

		const spaces = await listSpaces(employee);

		expect(spaces.map((space) => ({ name: space.name, pageCount: space.pageCount }))).toEqual([
			{ name: 'Ayuda', pageCount: 1 }
		]);
		expect(spaces[0].id).toBe(portal.id);
	});

	it('returns a technician both audiences, counting drafts but not archived pages', async () => {
		const { technician } = await scenario();

		const spaces = await listSpaces(technician);

		expect(spaces.map((space) => ({ name: space.name, pageCount: space.pageCount }))).toEqual([
			{ name: 'Ayuda', pageCount: 2 },
			{ name: 'Procedimientos', pageCount: 2 }
		]);
	});

	it('lists archived spaces only when asked, and only to staff', async () => {
		const { technician, employee } = await scenario();

		const asked = await listSpaces(technician, { includeArchived: true });
		expect(asked.map((space) => space.name)).toEqual(['Antiguo', 'Ayuda', 'Procedimientos']);
		expect(asked[0].archivedAt).toBeInstanceOf(Date);

		const employees = await listSpaces(employee, { includeArchived: true });
		expect(employees.map((space) => space.name)).toEqual(['Ayuda']);
	});

	it('reports every page a space holds, archived included, to staff — it is what decides a delete', async () => {
		const { technician } = await scenario();

		const spaces = await listSpaces(technician);

		expect(spaces.map((space) => space.totalPageCount)).toEqual([3, 3]);
	});

	it('throws, rather than returning an empty list, for a viewer without knowledge.view', async () => {
		const { organisation } = await scenario();
		const apiKey = {
			...(await createViewerWithoutPerson(organisation.id, 'employee')),
			scopes: []
		};

		await expect(listSpaces(apiKey)).rejects.toThrow(/knowledge\.view/);
		expect(readableSpaces(apiKey)).toBeNull();
		expect(() => readablePages(apiKey)).toThrow(/knowledge\.view/);
	});
});

describe('readablePages', () => {
	async function titlesFor(viewer: Parameters<typeof readablePages>[0]) {
		const rows = await getDb()
			.select({ title: pages.title, space: pages.spaceId })
			.from(pages)
			.where(readablePages(viewer));
		return rows.map((row) => row.title).sort();
	}

	it('shows an employee the published pages of portal spaces: no drafts, no archived, nothing of staff or archived spaces', async () => {
		const { employee } = await scenario();

		expect(await titlesFor(employee)).toEqual(['Published']);
	});

	it('shows staff drafts too, but still not archived pages nor archived spaces', async () => {
		const { technician } = await scenario();

		expect(await titlesFor(technician)).toEqual(['Draft', 'Draft', 'Published', 'Published']);
	});

	it('never reaches into another organisation', async () => {
		const { admin, organisation } = await scenario();
		const other = await createOrganisation('Third', 'third');
		const foreign = await createSpaceRow(other.id, { name: 'Foreign', audience: 'portal' });
		await createPageRow(other.id, foreign.id, { title: 'Foreign page', publishedAt: new Date() });

		const rows = await getDb()
			.select({ organisationId: pages.organisationId })
			.from(pages)
			.where(and(readablePages(admin), eq(pages.title, 'Foreign page')));

		expect(rows).toEqual([]);
		expect(organisation.id).not.toBe(other.id);
	});
});
