import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from '#lib/server/db/index.js';
import { pages } from '#lib/server/knowledge/schema.js';
import {
	createPageRow,
	createSpaceRow,
	createWorkspace
} from '#lib/server/knowledge/testing/fixtures.js';
import { isFollowing } from '#lib/server/notifications/index.js';
import { actions, load } from './+page.server';

async function setup() {
	const w = await createWorkspace();
	const space = await createSpaceRow(w.organisation.id, { audience: 'portal' });
	const page = await createPageRow(w.organisation.id, space.id, {
		title: 'Alta de VPN',
		publishedAt: new Date()
	});
	return { ...w, page };
}

const event = (user: unknown, tag: string) =>
	({
		locals: { user },
		params: { tag },
		url: new URL(`http://localhost/knowledge/${tag}`),
		request: new Request('http://localhost/x', { method: 'POST', body: new FormData() })
	}) as never;

const run = (name: 'follow' | 'unfollow', user: unknown, tag: string) =>
	(actions[name] as unknown as (e: never) => Promise<unknown>)(event(user, tag));

describe('/knowledge/[tag] follow control', () => {
	it('lets staff follow and unfollow, and load reports the state', async () => {
		const s = await setup();
		const tag = s.page.pageTag;

		await run('follow', s.technician, tag);
		expect(await isFollowing(s.technician, { pageId: s.page.id })).toBe(true);
		const data = (await load(event(s.technician, tag) as never)) as { follow: unknown };
		expect(data.follow).toMatchObject({ canFollow: true, following: true, followerCount: 1 });

		await run('unfollow', s.technician, tag);
		expect(await isFollowing(s.technician, { pageId: s.page.id })).toBe(false);
	});

	it('refuses an employee with 403', async () => {
		const s = await setup();
		await expect(run('follow', s.employee, s.page.pageTag)).rejects.toMatchObject({ status: 403 });
	});

	it('refuses to follow an archived page but still lets a follower unfollow', async () => {
		const s = await setup();
		await run('follow', s.technician, s.page.pageTag);
		await getDb().update(pages).set({ archivedAt: new Date() }).where(eq(pages.id, s.page.id));

		await run('unfollow', s.technician, s.page.pageTag);
		expect(await isFollowing(s.technician, { pageId: s.page.id })).toBe(false);

		expect(await run('follow', s.admin, s.page.pageTag)).toMatchObject({ status: 409 });
		expect(await isFollowing(s.admin, { pageId: s.page.id })).toBe(false);
	});
});
