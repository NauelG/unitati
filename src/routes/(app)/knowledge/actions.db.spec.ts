import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from '#lib/server/db/index.js';
import { pages } from '#lib/server/knowledge/index.js';
import {
	createPageRow,
	createSpaceRow,
	createWorkspace
} from '#lib/server/knowledge/testing/fixtures.js';
import { actionEvent, outcomeOf } from '#lib/server/projects/testing/action-event.js';
import { archive, create, move, preview, publish, reorder } from './actions';

describe('the knowledge actions', () => {
	it('refuse an employee with a 403 and write nothing', async () => {
		const { organisation, employee } = await createWorkspace();
		const space = await createSpaceRow(organisation.id);

		const { thrown } = await outcomeOf(() =>
			create(actionEvent(employee, { spaceId: space.id, parentId: '', title: 'Sneaky' }))
		);

		expect(thrown?.status).toBe(403);
		expect(await getDb().select().from(pages)).toEqual([]);
	});

	it('create a draft and land on its record', async () => {
		const { organisation, technician } = await createWorkspace();
		const space = await createSpaceRow(organisation.id);

		const { thrown } = await outcomeOf(() =>
			create(actionEvent(technician, { spaceId: space.id, parentId: '', title: 'Wi-Fi' }))
		);

		const [page] = await getDb().select().from(pages);
		expect(page).toMatchObject({ title: 'Wi-Fi', body: '', publishedAt: null });
		expect(thrown?.status).toBe(303);
		expect(thrown?.location).toBe(`/knowledge/${page.pageTag}`);
	});

	it('answer a blank title with a message', async () => {
		const { organisation, technician } = await createWorkspace();
		const space = await createSpaceRow(organisation.id);

		const { returned } = await outcomeOf(() =>
			create(actionEvent(technician, { spaceId: space.id, parentId: '', title: '  ' }))
		);

		expect(returned?.status).toBe(400);
		expect(returned?.data).toMatchObject({ action: 'create' });
		expect(await getDb().select().from(pages)).toEqual([]);
	});

	it('say why a page cannot be published under a draft', async () => {
		const { organisation, technician } = await createWorkspace();
		const space = await createSpaceRow(organisation.id);
		const parent = await createPageRow(organisation.id, space.id);
		const child = await createPageRow(organisation.id, space.id, { parentId: parent.id });

		const { returned } = await outcomeOf(() => publish(actionEvent(technician, { id: child.id })));

		expect(returned?.status).toBe(400);
		expect(returned?.data).toMatchObject({ action: 'publish' });
		expect(returned?.data?.message).toContain('borrador');
	});

	it('reorder, preview and move a page, and archive it', async () => {
		const { organisation, technician } = await createWorkspace();
		const staff = await createSpaceRow(organisation.id, { audience: 'staff' });
		const portal = await createSpaceRow(organisation.id, { audience: 'portal' });
		const a = await createPageRow(organisation.id, staff.id, { position: '1000' });
		const b = await createPageRow(organisation.id, staff.id, { position: '2000' });

		await outcomeOf(() =>
			reorder(actionEvent(technician, { id: b.id, placement: 'before', anchorId: a.id }))
		);
		const [reordered] = await getDb().select().from(pages).where(eq(pages.id, b.id));
		expect(Number(reordered.position)).toBeLessThan(1000);

		const { returned: previewed } = await outcomeOf(() =>
			preview(actionEvent(technician, { id: a.id, spaceId: portal.id, parentId: '' }))
		);
		// A success returns its data as is, not wrapped in a failure.
		expect((previewed as unknown as { preview: unknown }).preview).toMatchObject({
			subtreeCount: 1,
			audienceChanges: true
		});

		const { returned: refused } = await outcomeOf(() =>
			move(actionEvent(technician, { id: a.id, spaceId: portal.id, parentId: '' }))
		);
		expect(refused?.status).toBe(400);

		await outcomeOf(() =>
			move(
				actionEvent(technician, {
					id: a.id,
					spaceId: portal.id,
					parentId: '',
					confirmedCount: '1'
				})
			)
		);
		const [moved] = await getDb().select().from(pages).where(eq(pages.id, a.id));
		expect(moved.spaceId).toBe(portal.id);

		await outcomeOf(() => archive(actionEvent(technician, { id: a.id })));
		const [archived] = await getDb().select().from(pages).where(eq(pages.id, a.id));
		expect(archived.archivedAt).not.toBeNull();
	});
});
