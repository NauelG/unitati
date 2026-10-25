import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { mentionToken } from '#lib/domain/mentions.js';
import { serviceAccounts } from '../api/schema';
import { createViewer } from '../assets/testing/fixtures';
import { users } from '../auth/schema';
import { getDb } from '../db';
import {
	follow,
	followState,
	isFollowing,
	notificationHref,
	setPreference,
	unfollow,
	unfollowFromNotification
} from '../notifications';
import { follows, notifications } from '../notifications/schema';
import type { Mailer, MailMessage } from '../shared/mail';
import {
	addPageComment,
	archivePage,
	editPageComment,
	followKnowledgePage,
	createPage,
	movePage,
	publishPage,
	reorderPage,
	restoreRevision,
	savePage,
	unarchivePage
} from './index';
import { pages } from './schema';
import { createPageRow, createSpaceRow, createWorkspace } from './testing/fixtures';

const origin = 'https://unitati.test';

async function setup() {
	const w = await createWorkspace();
	const colleague = await createViewer(w.organisation.id, 'technician', 'Theo Tech');
	const space = await createSpaceRow(w.organisation.id, { audience: 'portal' });
	const page = await createPageRow(w.organisation.id, space.id, {
		title: 'Alta de VPN',
		publishedAt: new Date()
	});
	const sent: MailMessage[] = [];
	const deps = {
		mailer: { send: async (message) => void sent.push(message) } satisfies Mailer,
		origin
	};
	return { ...w, colleague, space, page, sent, deps };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
const inbox = () => getDb().select().from(notifications).orderBy(notifications.createdAt);
const forRecipient = async (personId: string | null) =>
	(await inbox()).filter((row) => row.recipientPersonId === personId);

type Setup = Awaited<ReturnType<typeof setup>>;

/** The technician follows the page; the colleague acts. */
async function followed(s: Setup, pageId = s.page.id) {
	await follow(s.technician, { pageId });
}

describe('who can follow a page', () => {
	it('lets staff follow and unfollow, idempotently', async () => {
		const s = await setup();
		for (const viewer of [s.technician, s.admin]) {
			expect(await follow(viewer, { pageId: s.page.id })).toEqual({ ok: true, value: undefined });
			await follow(viewer, { pageId: s.page.id });
			expect(await isFollowing(viewer, { pageId: s.page.id })).toBe(true);
		}
		expect(await getDb().select().from(follows)).toHaveLength(2);

		await unfollow(s.technician, { pageId: s.page.id });
		expect(await isFollowing(s.technician, { pageId: s.page.id })).toBe(false);
	});

	it('refuses an employee and stores nothing', async () => {
		const s = await setup();
		expect(await follow(s.employee, { pageId: s.page.id })).toEqual({
			ok: false,
			error: 'forbidden'
		});
		expect(await getDb().select().from(follows)).toHaveLength(0);
		expect(await followState(s.employee, { pageId: s.page.id })).toEqual({ canFollow: false });
	});

	it('cascades the follow rows when the page is deleted', async () => {
		const s = await setup();
		await followed(s);
		await getDb().delete(pages).where(eq(pages.id, s.page.id));
		expect(await getDb().select().from(follows)).toHaveLength(0);
	});
});

describe('what notifies followers', () => {
	it('publish, save, restore, archive, unarchive and a comment notify; the actor is excluded', async () => {
		const s = await setup();
		const created = await createPage(s.colleague, {
			spaceId: s.space.id,
			parentId: null,
			title: 'Borrador'
		});
		if (!created.ok) throw new Error('create');
		const draft = { id: created.value.id, revision: 1 };
		await followed(s, draft.id);

		await publishPage(s.colleague, draft.id, s.deps);
		const saved = await savePage(
			s.colleague,
			draft.id,
			{ title: 'Borrador', body: 'uno', baseRevision: draft.revision },
			s.deps
		);
		if (!saved.ok) throw new Error('save');
		const restored = await restoreRevision(
			s.colleague,
			draft.id,
			1,
			{ baseRevision: saved.value.revision },
			s.deps
		);
		if (!restored.ok) throw new Error('restore');
		await addPageComment(s.colleague, draft.id, 'Mirad esto', s.deps);
		await archivePage(s.colleague, draft.id, s.deps);
		await unarchivePage(s.colleague, draft.id, s.deps);
		await settle();

		const mine = await forRecipient(s.technician.personId);
		expect(mine.map((row) => row.snapshot.summary)).toEqual([
			'La página se ha publicado',
			'Hay una versión nueva (v2)',
			'Se ha restaurado la versión v1',
			'Comentario nuevo en la página',
			'La página se ha archivado',
			'La página se ha restaurado del archivo'
		]);
		expect(mine.every((row) => row.type === 'followed.activity' && row.pageId === draft.id)).toBe(
			true
		);
		// The colleague acted on every event and also follows from creating the page; never told.
		expect(await forRecipient(s.colleague.personId)).toHaveLength(0);
	});

	it('move and reorder do not notify', async () => {
		const s = await setup();
		const other = await createPageRow(s.organisation.id, s.space.id, {
			title: 'Otra',
			position: '2',
			publishedAt: new Date()
		});
		await followed(s);
		await followed(s, other.id);

		const reordered = await reorderPage(s.colleague, s.page.id, { after: other.id });
		expect(reordered.ok).toBe(true);
		const moved = await movePage(s.colleague, s.page.id, {
			spaceId: s.space.id,
			parentId: other.id
		});
		expect(moved.ok).toBe(true);
		await settle();

		expect(await inbox()).toHaveLength(0);
	});

	it('notifies for a save of a draft page', async () => {
		const s = await setup();
		const draft = await createPageRow(s.organisation.id, s.space.id, { title: 'Draft' });
		await followed(s, draft.id);

		await savePage(
			s.colleague,
			draft.id,
			{ title: 'Draft', body: 'x', baseRevision: draft.revision },
			s.deps
		);
		expect(await forRecipient(s.technician.personId)).toHaveLength(1);
	});

	it('a no-op save notifies nobody', async () => {
		const s = await setup();
		await followed(s);
		await savePage(
			s.colleague,
			s.page.id,
			{ title: s.page.title, body: s.page.body, baseRevision: s.page.revision },
			s.deps
		);
		expect(await inbox()).toHaveLength(0);
	});

	it('a change through an API key notifies with the service account as actor', async () => {
		const s = await setup();
		const [account] = await getDb()
			.insert(serviceAccounts)
			.values({ organisationId: s.organisation.id, name: 'Wiki bot', role: 'technician' })
			.returning();
		const bot = {
			...s.colleague,
			name: 'Wiki bot',
			personId: null,
			serviceAccountId: account.id
		};
		await followed(s);

		const saved = await savePage(
			bot,
			s.page.id,
			{ title: s.page.title, body: 'por la API', baseRevision: s.page.revision },
			s.deps
		);
		expect(saved.ok).toBe(true);

		const [row] = await forRecipient(s.technician.personId);
		expect(row).toMatchObject({ actorPersonId: null });
		expect(row.snapshot.actorName).toBe('Wiki bot');
	});

	it('emails nobody by default: followed.activity is email-off', async () => {
		const s = await setup();
		await followed(s);
		await savePage(
			s.colleague,
			s.page.id,
			{ title: s.page.title, body: 'x', baseRevision: s.page.revision },
			s.deps
		);
		await settle();
		expect(s.sent).toHaveLength(0);
	});

	it('a follower who is also mentioned gets only the mention', async () => {
		const s = await setup();
		await followed(s);

		await addPageComment(
			s.colleague,
			s.page.id,
			`Hola ${mentionToken('Tom Technician', s.technician.personId!)}`,
			s.deps
		);

		const mine = await forRecipient(s.technician.personId);
		expect(mine.map((row) => row.type)).toEqual(['mention']);
	});
});

describe('archiving a subtree', () => {
	it('sends one notification per follower, pointing at the root page', async () => {
		const s = await setup();
		const child = await createPageRow(s.organisation.id, s.space.id, {
			title: 'Hija',
			parentId: s.page.id,
			publishedAt: new Date()
		});
		const grandchild = await createPageRow(s.organisation.id, s.space.id, {
			title: 'Nieta',
			parentId: child.id,
			publishedAt: new Date()
		});
		// The technician follows all three, the admin only a descendant.
		for (const id of [s.page.id, child.id, grandchild.id]) await followed(s, id);
		await follow(s.admin, { pageId: grandchild.id });

		await archivePage(s.colleague, s.page.id, s.deps);

		for (const viewer of [s.technician, s.admin]) {
			const rows = await forRecipient(viewer.personId);
			expect(rows).toHaveLength(1);
			expect(rows[0].pageId).toBe(s.page.id);
			expect(rows[0].snapshot.summary).toBe('La página se ha archivado junto con 2 subpáginas');
		}

		await unarchivePage(s.colleague, s.page.id, s.deps);
		const rows = await forRecipient(s.technician.personId);
		expect(rows).toHaveLength(2);
		expect(rows[1].snapshot.summary).toBe(
			'La página se ha restaurado del archivo junto con 2 subpáginas'
		);
		expect(rows[1].pageId).toBe(s.page.id);
	});

	it('does not tell followers of a page that was archived before', async () => {
		const s = await setup();
		const child = await createPageRow(s.organisation.id, s.space.id, {
			title: 'Hija',
			parentId: s.page.id,
			publishedAt: new Date(),
			archivedAt: new Date('2020-01-01')
		});
		await followed(s, child.id);

		await archivePage(s.colleague, s.page.id, s.deps);
		expect(await inbox()).toHaveLength(0);
	});

	it('archiving a space notifies nobody and keeps the follow rows', async () => {
		const s = await setup();
		await followed(s);
		const { archiveSpace } = await import('./index');
		await archiveSpace(s.admin, s.space.id);
		expect(await inbox()).toHaveLength(0);
		expect(await getDb().select().from(follows)).toHaveLength(1);
	});
});

describe('auto-follow', () => {
	it('follows the creator, the saver, the restorer, the commenter and the mentioned staff', async () => {
		const s = await setup();
		const created = await createPage(s.technician, {
			spaceId: s.space.id,
			parentId: null,
			title: 'Nueva'
		});
		if (!created.ok) throw new Error('create');
		const pageId = created.value.id;
		expect(await isFollowing(s.technician, { pageId })).toBe(true);

		const saved = await savePage(
			s.colleague,
			pageId,
			{ title: 'Nueva', body: 'x', baseRevision: 1 },
			s.deps
		);
		if (!saved.ok) throw new Error('save');
		expect(await isFollowing(s.colleague, { pageId })).toBe(true);

		await addPageComment(
			s.admin,
			pageId,
			`Ojo ${mentionToken('Eva Employee', s.employee.personId!)}`,
			s.deps
		);
		expect(await isFollowing(s.admin, { pageId })).toBe(true);
		// A forged mention of an employee follows nobody.
		expect(await isFollowing(s.employee, { pageId })).toBe(false);

		const third = await createViewer(s.organisation.id, 'technician', 'Tina Tech');
		await addPageComment(
			s.admin,
			pageId,
			`Hola ${mentionToken('Tina Tech', third.personId!)}`,
			s.deps
		);
		expect(await isFollowing(third, { pageId })).toBe(true);

		const restorer = await createViewer(s.organisation.id, 'technician', 'Rosa Restore');
		await restoreRevision(restorer, pageId, 1, { baseRevision: saved.value.revision }, s.deps);
		expect(await isFollowing(restorer, { pageId })).toBe(true);
	});

	it('is idempotent and can be undone by unfollowing', async () => {
		const s = await setup();
		for (const body of ['uno', 'dos']) {
			const current = (await getDb().select().from(pages).where(eq(pages.id, s.page.id)))[0];
			await savePage(
				s.colleague,
				s.page.id,
				{ title: s.page.title, body, baseRevision: current.revision },
				s.deps
			);
		}
		expect(await getDb().select().from(follows)).toHaveLength(1);

		await unfollow(s.colleague, { pageId: s.page.id });
		expect(await getDb().select().from(follows)).toHaveLength(0);
	});

	it('does not follow an API key (no person)', async () => {
		const s = await setup();
		const [account] = await getDb()
			.insert(serviceAccounts)
			.values({ organisationId: s.organisation.id, name: 'Bot', role: 'technician' })
			.returning();
		await savePage(
			{ ...s.colleague, personId: null, serviceAccountId: account.id },
			s.page.id,
			{ title: s.page.title, body: 'x', baseRevision: s.page.revision },
			s.deps
		);
		expect(await getDb().select().from(follows)).toHaveLength(0);
	});
});

describe('roles', () => {
	it('a demoted follower stops being told and is told again when promoted', async () => {
		const s = await setup();
		await followed(s);
		const setRole = (role: 'employee' | 'technician') =>
			getDb().update(users).set({ role }).where(eq(users.id, s.technician.id));
		const save = async (body: string) => {
			const [current] = await getDb().select().from(pages).where(eq(pages.id, s.page.id));
			await savePage(
				s.colleague,
				s.page.id,
				{ title: s.page.title, body, baseRevision: current.revision },
				s.deps
			);
		};

		await setRole('employee');
		await save('uno');
		expect(await forRecipient(s.technician.personId)).toHaveLength(0);
		// The row stays while the role is gone.
		expect(await isFollowing(s.technician, { pageId: s.page.id })).toBe(true);

		await setRole('technician');
		await save('dos');
		expect(await forRecipient(s.technician.personId)).toHaveLength(1);
	});

	it('does not auto-follow someone who lost knowledge.manage', async () => {
		const s = await setup();
		const { followPage } = await import('../notifications');
		await getDb().transaction((tx) =>
			followPage(tx, {
				organisationId: s.organisation.id,
				personId: s.employee.personId!,
				pageId: s.page.id
			})
		);
		expect(await getDb().select().from(follows)).toHaveLength(0);
	});
});

describe('links and unfollowing from a notification', () => {
	it('save and restore lead to the revision, a comment to the comment, the rest to the page', async () => {
		const s = await setup();
		await followed(s);
		const saved = await savePage(
			s.colleague,
			s.page.id,
			{ title: s.page.title, body: 'x', baseRevision: s.page.revision },
			s.deps
		);
		if (!saved.ok) throw new Error('save');
		const comment = await addPageComment(s.colleague, s.page.id, 'hola', s.deps);
		if (!comment.ok) throw new Error('comment');
		await archivePage(s.colleague, s.page.id, s.deps);

		const rows = await forRecipient(s.technician.personId);
		const hrefs = rows.map((row) => notificationHref(row, s.technician));
		const tag = s.page.pageTag;
		expect(hrefs).toEqual([
			`/knowledge/${tag}/revisions/${saved.value.revision}`,
			`/knowledge/${tag}#comment-${comment.value.commentId}`,
			`/knowledge/${tag}`
		]);
	});

	it('unfollows from a page notification', async () => {
		const s = await setup();
		await followed(s);
		await archivePage(s.colleague, s.page.id, s.deps);
		const [row] = await forRecipient(s.technician.personId);

		const outcome = await unfollowFromNotification(s.technician, row.id);
		expect(outcome.ok).toBe(true);
		expect(await isFollowing(s.technician, { pageId: s.page.id })).toBe(false);
	});
});

/** A page created through the domain, so it has revision 1 to restore from. */
async function createdPage(s: Setup) {
	const created = await createPage(s.colleague, {
		spaceId: s.space.id,
		parentId: null,
		title: 'Guia'
	});
	if (!created.ok) throw new Error('create');
	return created.value;
}

describe('restore, stale writes and mail', () => {
	it('a restore notification leads to the new revision', async () => {
		const s = await setup();
		const page = await createdPage(s);
		await followed(s, page.id);
		const saved = await savePage(
			s.colleague,
			page.id,
			{ title: 'Guia', body: 'dos', baseRevision: 1 },
			s.deps
		);
		if (!saved.ok) throw new Error('save');
		const restored = await restoreRevision(
			s.colleague,
			page.id,
			1,
			{ baseRevision: saved.value.revision },
			s.deps
		);
		if (!restored.ok) throw new Error('restore');

		const rows = await forRecipient(s.technician.personId);
		const last = rows.at(-1)!;
		expect(last.snapshot.summary).toBe('Se ha restaurado la versión v1');
		expect(notificationHref(last, s.technician)).toBe(
			`/knowledge/${page.tag}/revisions/${restored.value.revision}`
		);
	});

	it('a stale save and a stale restore write no notification and no follow row', async () => {
		const s = await setup();
		const page = await createdPage(s);
		await followed(s, page.id);
		await savePage(s.colleague, page.id, { title: 'Guia', body: 'uno', baseRevision: 1 }, s.deps);
		const before = {
			notifications: (await inbox()).length,
			follows: (await getDb().select().from(follows)).length
		};
		const latecomer = await createViewer(s.organisation.id, 'technician', 'Lola Late');

		const stale = await savePage(
			latecomer,
			page.id,
			{ title: 'Guia', body: 'tarde', baseRevision: 1 },
			s.deps
		);
		const staleRestore = await restoreRevision(latecomer, page.id, 1, { baseRevision: 1 }, s.deps);

		expect(stale.ok).toBe(false);
		expect(staleRestore.ok).toBe(false);
		expect((await inbox()).length).toBe(before.notifications);
		expect((await getDb().select().from(follows)).length).toBe(before.follows);
		expect(await isFollowing(latecomer, { pageId: page.id })).toBe(false);
	});

	it('mails an opted-in follower after commit: the link goes to the revision, unfollow to the page', async () => {
		const s = await setup();
		await followed(s);
		await setPreference(s.technician, 'followed.activity', 'email', true);

		const saved = await savePage(
			s.colleague,
			s.page.id,
			{ title: s.page.title, body: 'x', baseRevision: s.page.revision },
			s.deps
		);
		if (!saved.ok) throw new Error('save');
		await settle();

		expect(s.sent).toHaveLength(1);
		const tag = s.page.pageTag;
		expect(s.sent[0].to).toBe(s.technician.email);
		expect(s.sent[0].text).toContain(
			`${origin}/knowledge/${tag}/revisions/${saved.value.revision}`
		);
		expect(s.sent[0].text).toContain(`Dejar de seguir: ${origin}/knowledge/${tag}\n`);
	});
});

describe('editing a comment', () => {
	it('follows the newly mentioned person but does not notify the followers', async () => {
		const s = await setup();
		const added = await addPageComment(s.colleague, s.page.id, 'Sin menciones', s.deps);
		if (!added.ok) throw new Error('comment');
		await followed(s);
		const before = (await inbox()).length;
		const newcomer = await createViewer(s.organisation.id, 'technician', 'Nora New');

		const edited = await editPageComment(
			s.colleague,
			added.value.commentId,
			`Ahora ${mentionToken('Nora New', newcomer.personId!)}`,
			s.deps
		);
		expect(edited.ok).toBe(true);

		expect(await isFollowing(newcomer, { pageId: s.page.id })).toBe(true);
		const after = (await inbox()).slice(before);
		expect(after.map((row) => [row.recipientPersonId, row.type])).toEqual([
			[newcomer.personId, 'mention']
		]);
		expect(await forRecipient(s.technician.personId)).toHaveLength(0);
	});
});

describe('following an archived page', () => {
	it('is refused for a new follower, and unfollowing keeps working', async () => {
		const s = await setup();
		await followed(s);
		await archivePage(s.colleague, s.page.id, s.deps);

		expect(await followKnowledgePage(s.admin, s.page.id)).toEqual({ ok: false, error: 'archived' });
		expect(await isFollowing(s.admin, { pageId: s.page.id })).toBe(false);
		expect(await followKnowledgePage(s.employee as never, s.page.id).catch(() => 'threw')).toBe(
			'threw'
		);

		await unfollow(s.technician, { pageId: s.page.id });
		expect(await isFollowing(s.technician, { pageId: s.page.id })).toBe(false);
	});

	it('follows an open page', async () => {
		const s = await setup();
		expect(await followKnowledgePage(s.admin, s.page.id)).toEqual({ ok: true, value: undefined });
		expect(await isFollowing(s.admin, { pageId: s.page.id })).toBe(true);
	});
});
