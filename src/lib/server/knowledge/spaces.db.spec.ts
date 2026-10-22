import { asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { activity } from '../activity/schema';
import { getDb } from '../db';
import {
	archiveSpace,
	changeSpaceAudience,
	createSpace,
	deleteSpace,
	listSpaces,
	previewAudienceChange,
	updateSpace,
	type SpaceInput
} from './index';
import { knowledgeSpaces, pages } from './schema';
import { createPageRow, createSpaceRow, createWorkspace } from './testing/fixtures';

async function historyOf(spaceId: string) {
	const rows = await getDb()
		.select()
		.from(activity)
		.where(eq(activity.spaceId, spaceId))
		.orderBy(asc(activity.occurredAt), asc(activity.createdAt));
	return rows.map((row) => ({ verb: row.verb, payload: row.payload }));
}

const input = (overrides: Partial<SpaceInput> = {}): SpaceInput => ({
	name: 'Ayuda',
	description: null,
	icon: 'life-buoy',
	colour: 'teal',
	audience: 'portal',
	...overrides
});

async function newSpace(
	actor: Awaited<ReturnType<typeof createWorkspace>>['admin'],
	overrides: Partial<SpaceInput> = {}
) {
	const created = await createSpace(actor, input(overrides));
	if (!created.ok) throw new Error(`setup: ${created.error}`);
	return created.value.id;
}

describe('createSpace', () => {
	it('creates the space and writes space.created', async () => {
		const { admin } = await createWorkspace();

		const id = await newSpace(admin, { name: 'Procedimientos', audience: 'staff' });

		expect(await historyOf(id)).toEqual([
			{ verb: 'space.created', payload: { name: 'Procedimientos', audience: 'staff' } }
		]);
		const [space] = await listSpaces(admin);
		expect(space).toMatchObject({ id, icon: 'life-buoy', colour: 'teal', audience: 'staff' });
	});

	it('refuses a duplicate name in the organisation, and allows it in another', async () => {
		const { admin } = await createWorkspace();
		const { admin: elsewhere } = await createWorkspace('Other', 'other');
		await newSpace(admin);

		expect(await createSpace(admin, input())).toEqual({ ok: false, error: 'duplicate_name' });
		expect((await createSpace(elsewhere, input())).ok).toBe(true);
	});

	it('refuses an icon or a colour outside the closed sets', async () => {
		const { admin } = await createWorkspace();

		expect(await createSpace(admin, input({ icon: 'skull' as never }))).toEqual({
			ok: false,
			error: 'invalid_icon'
		});
		expect(await createSpace(admin, input({ colour: '#ff00ff' as never }))).toEqual({
			ok: false,
			error: 'invalid_colour'
		});
		expect(await listSpaces(admin)).toEqual([]);
	});

	it('throws for an actor without knowledge.spaces.manage, technician included', async () => {
		const { technician, employee } = await createWorkspace();

		await expect(createSpace(technician, input())).rejects.toThrow(/cannot manage/);
		await expect(createSpace(employee, input())).rejects.toThrow(/cannot manage/);
	});
});

describe('updateSpace', () => {
	it('changes the details, refuses a taken name and an unknown icon, and writes no activity', async () => {
		const { admin } = await createWorkspace();
		const id = await newSpace(admin);
		await newSpace(admin, { name: 'Otro' });

		const details = {
			name: 'Soporte',
			description: 'Guías',
			icon: 'wrench',
			colour: 'red'
		} as const;
		expect(await updateSpace(admin, id, details)).toEqual({ ok: true, value: undefined });
		expect(await updateSpace(admin, id, { ...details, name: 'Otro' })).toEqual({
			ok: false,
			error: 'duplicate_name'
		});
		expect(await updateSpace(admin, id, { ...details, icon: 'skull' as never })).toEqual({
			ok: false,
			error: 'invalid_icon'
		});

		const spaces = await listSpaces(admin);
		expect(spaces.find((space) => space.id === id)).toMatchObject({ ...details });
		expect((await historyOf(id)).map((entry) => entry.verb)).toEqual(['space.created']);
	});

	it('does not find a space of another organisation', async () => {
		const { admin } = await createWorkspace();
		const { organisation } = await createWorkspace('Other', 'other');
		const foreign = await createSpaceRow(organisation.id);

		const outcome = await updateSpace(admin, foreign.id, {
			name: 'x',
			description: null,
			icon: 'book',
			colour: 'gray'
		});

		expect(outcome).toEqual({ ok: false, error: 'not_found' });
	});
});

describe('the audience change', () => {
	async function spaceWithPages() {
		const { admin, organisation } = await createWorkspace();
		const id = await newSpace(admin, { audience: 'staff' });
		await createPageRow(organisation.id, id, { publishedAt: new Date() });
		await createPageRow(organisation.id, id); // a draft: counted, it would become visible
		await createPageRow(organisation.id, id, { archivedAt: new Date() }); // not counted
		return { admin, organisation, id };
	}

	it('previews the exact number of non-archived pages, drafts included', async () => {
		const { admin, id } = await spaceWithPages();

		expect(await previewAudienceChange(admin, id, 'portal')).toEqual({
			ok: true,
			value: { pageCount: 2 }
		});
	});

	it('changes the audience when the confirmed count is the current one, and records it', async () => {
		const { admin, id } = await spaceWithPages();

		expect(await changeSpaceAudience(admin, id, 'portal', { confirmedCount: 2 })).toEqual({
			ok: true,
			value: undefined
		});

		expect(await historyOf(id)).toEqual([
			{ verb: 'space.created', payload: { name: 'Ayuda', audience: 'staff' } },
			{ verb: 'space.audience.changed', payload: { from: 'staff', to: 'portal', pageCount: 2 } }
		]);
	});

	it('refuses count_changed when the count moved since the preview, and changes nothing', async () => {
		const { admin, organisation, id } = await spaceWithPages();
		const preview = await previewAudienceChange(admin, id, 'portal');
		if (!preview.ok) throw new Error('setup');

		await createPageRow(organisation.id, id, { title: 'Written in the meantime' });

		expect(
			await changeSpaceAudience(admin, id, 'portal', { confirmedCount: preview.value.pageCount })
		).toEqual({ ok: false, error: 'count_changed' });
		const [space] = await getDb().select().from(knowledgeSpaces).where(eq(knowledgeSpaces.id, id));
		expect(space.audience).toBe('staff');
		expect((await historyOf(id)).map((entry) => entry.verb)).toEqual(['space.created']);
	});

	it('is a no-op, without an entry, when the audience is already the one asked for', async () => {
		const { admin, id } = await spaceWithPages();

		expect(await changeSpaceAudience(admin, id, 'staff', { confirmedCount: 99 })).toEqual({
			ok: true,
			value: undefined
		});
		expect((await historyOf(id)).map((entry) => entry.verb)).toEqual(['space.created']);
	});

	it('hides the pages of a space from employees once it turns staff-only', async () => {
		const { admin, employee, organisation } = await createWorkspace();
		const id = await newSpace(admin, { audience: 'portal' });
		await createPageRow(organisation.id, id, { publishedAt: new Date() });
		expect((await listSpaces(employee)).map((space) => space.pageCount)).toEqual([1]);

		await changeSpaceAudience(admin, id, 'staff', { confirmedCount: 1 });

		expect(await listSpaces(employee)).toEqual([]);
	});
});

describe('archiveSpace', () => {
	it('archives the space and its pages in one transaction and writes space.archived', async () => {
		const { admin, organisation } = await createWorkspace();
		const id = await newSpace(admin);
		const earlier = new Date('2026-01-01T00:00:00Z');
		await createPageRow(organisation.id, id);
		await createPageRow(organisation.id, id, { publishedAt: new Date() });
		const already = await createPageRow(organisation.id, id, { archivedAt: earlier });

		expect(await archiveSpace(admin, id)).toEqual({ ok: true, value: { pageCount: 2 } });

		const rows = await getDb().select().from(pages).where(eq(pages.spaceId, id));
		expect(rows.every((row) => row.archivedAt !== null)).toBe(true);
		expect(rows.find((row) => row.id === already.id)?.archivedAt).toEqual(earlier);
		expect((await listSpaces(admin)).map((space) => space.id)).not.toContain(id);
		expect(await historyOf(id)).toEqual([
			{ verb: 'space.created', payload: { name: 'Ayuda', audience: 'portal' } },
			{ verb: 'space.archived', payload: { pageCount: 2 } }
		]);
	});

	it('refuses to archive twice, and refuses writes on an archived space', async () => {
		const { admin } = await createWorkspace();
		const id = await newSpace(admin);
		await archiveSpace(admin, id);

		expect(await archiveSpace(admin, id)).toEqual({ ok: false, error: 'archived' });
		expect(
			await updateSpace(admin, id, { name: 'x', description: null, icon: 'book', colour: 'gray' })
		).toEqual({ ok: false, error: 'archived' });
		expect(await changeSpaceAudience(admin, id, 'staff', { confirmedCount: 0 })).toEqual({
			ok: false,
			error: 'archived'
		});
	});
});

describe('deleteSpace', () => {
	it('deletes an empty space', async () => {
		const { admin } = await createWorkspace();
		const id = await newSpace(admin);

		expect(await deleteSpace(admin, id)).toEqual({ ok: true, value: undefined });
		expect(await listSpaces(admin, { includeArchived: true })).toEqual([]);
	});

	it('refuses has_pages for a space with a page, an archived one included', async () => {
		const { admin, organisation } = await createWorkspace();
		const id = await newSpace(admin);
		await createPageRow(organisation.id, id, { archivedAt: new Date() });

		expect(await deleteSpace(admin, id)).toEqual({ ok: false, error: 'has_pages' });
		expect(await listSpaces(admin, { includeArchived: true })).toHaveLength(1);
	});

	it('refuses has_pages after the space itself was archived', async () => {
		const { admin, organisation } = await createWorkspace();
		const id = await newSpace(admin);
		await createPageRow(organisation.id, id);
		await archiveSpace(admin, id);

		expect(await deleteSpace(admin, id)).toEqual({ ok: false, error: 'has_pages' });
	});
});
