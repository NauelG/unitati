import { asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { mentionToken } from '#lib/domain/mentions.js';
import { RICH_TEXT_MAX_LENGTH } from '#lib/domain/rich-text.js';
import { createViewer } from '../assets/testing/fixtures';
import { getDb } from '../db';
import { people } from '../directory/schema';
import { notifications } from '../notifications/schema';
import type { Mailer, MailMessage } from '../shared/mail';
import {
	addPageComment,
	archivePage,
	editPageComment,
	listPageComments,
	mentionablesForPage
} from './index';
import { pageComments, pages } from './schema';
import { createPageRow, createSpaceRow, createWorkspace } from './testing/fixtures';

const origin = 'https://unitati.test';

async function setup(audience: 'staff' | 'portal' = 'portal') {
	const w = await createWorkspace();
	const space = await createSpaceRow(w.organisation.id, { audience });
	const page = await createPageRow(w.organisation.id, space.id, {
		title: 'Alta de VPN',
		publishedAt: new Date()
	});
	const sent: MailMessage[] = [];
	const deps = {
		mailer: { send: async (message) => void sent.push(message) } satisfies Mailer,
		origin
	};
	return { ...w, space, page, sent, deps };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
const rows = () => getDb().select().from(notifications);
const mention = (name: string, personId: string | null) => mentionToken(name, personId!);

describe('addPageComment', () => {
	it('a technician mentions an admin: one mention notification on the page, and a mail that links to the comment', async () => {
		const s = await setup();

		const added = await addPageComment(
			s.technician,
			s.page.id,
			`Revisa esto ${mention('Ada Admin', s.admin.personId)}`,
			s.deps
		);
		if (!added.ok) throw new Error('expected the comment to be added');
		await settle();

		const stored = await rows();
		expect(stored).toHaveLength(1);
		expect(stored[0]).toMatchObject({
			type: 'mention',
			recipientPersonId: s.admin.personId,
			actorPersonId: s.technician.personId,
			pageId: s.page.id,
			ticketId: null,
			taskId: null,
			projectId: null
		});
		expect(stored[0].snapshot).toMatchObject({
			code: s.page.pageTag,
			title: 'Alta de VPN',
			actorName: 'Tom Technician',
			commentId: added.value.commentId
		});

		expect(s.sent).toHaveLength(1);
		expect(s.sent[0].to).toBe(s.admin.email);
		expect(s.sent[0].subject).toBe(`[${s.page.pageTag}] Alta de VPN`);
		expect(s.sent[0].text).toContain(
			`${origin}/knowledge/${s.page.pageTag}#comment-${added.value.commentId}`
		);
	});

	it('a forged token for an employee notifies nobody, and the text is kept', async () => {
		const s = await setup();
		const body = `Hola ${mention('Eva Employee', s.employee.personId)}`;

		const added = await addPageComment(s.technician, s.page.id, body, s.deps);
		expect(added.ok).toBe(true);
		await settle();

		expect(await rows()).toHaveLength(0);
		expect(s.sent).toHaveLength(0);
		const [stored] = await getDb().select().from(pageComments);
		expect(stored.body).toBe(body);
	});

	it('does not notify an inactive person or the author', async () => {
		const s = await setup();
		const retired = await createViewer(s.organisation.id, 'technician', 'Rita Retired');
		await getDb().update(people).set({ active: false }).where(eq(people.id, retired.personId!));

		await addPageComment(
			s.technician,
			s.page.id,
			`${mention('Rita Retired', retired.personId)} ${mention('Tom Technician', s.technician.personId)}`,
			s.deps
		);

		expect(await rows()).toHaveLength(0);
	});

	it('fails on an archived page with page_archived and writes nothing', async () => {
		const s = await setup();
		await archivePage(s.admin, s.page.id);

		const added = await addPageComment(s.technician, s.page.id, 'Tarde', s.deps);

		expect(added).toEqual({ ok: false, error: 'page_archived' });
		expect(await getDb().select().from(pageComments)).toHaveLength(0);
	});

	it('refuses a body longer than the ticket comment limit', async () => {
		const s = await setup();
		const added = await addPageComment(
			s.technician,
			s.page.id,
			'x'.repeat(RICH_TEXT_MAX_LENGTH + 1),
			s.deps
		);
		expect(added).toEqual({ ok: false, error: 'body_too_long' });
	});

	it('is not_found for a page that does not exist', async () => {
		const s = await setup();
		const added = await addPageComment(s.technician, crypto.randomUUID(), 'Hola', s.deps);
		expect(added).toEqual({ ok: false, error: 'not_found' });
	});

	it('is closed to employees', async () => {
		const s = await setup();
		await expect(addPageComment(s.employee, s.page.id, 'Hola', s.deps)).rejects.toThrow();
	});
});

describe('editPageComment', () => {
	it('notifies only the people the edit adds', async () => {
		const s = await setup();
		const otto = await createViewer(s.organisation.id, 'technician', 'Otto Other');
		const first = await addPageComment(
			s.technician,
			s.page.id,
			`Para ${mention('Ada Admin', s.admin.personId)}`,
			s.deps
		);
		if (!first.ok) throw new Error('expected the comment to be added');
		await settle();
		expect(await rows()).toHaveLength(1);

		const edited = await editPageComment(
			s.technician,
			first.value.commentId,
			`Para ${mention('Ada Admin', s.admin.personId)} y ${mention('Otto Other', otto.personId)}`,
			s.deps
		);
		expect(edited.ok).toBe(true);
		await settle();

		const stored = await rows();
		expect(stored).toHaveLength(2);
		expect(stored.map((row) => row.recipientPersonId).sort()).toEqual(
			[s.admin.personId, otto.personId].sort()
		);
		expect(stored.every((row) => row.pageId === s.page.id)).toBe(true);
		expect(s.sent).toHaveLength(2);

		const [comment] = await getDb().select().from(pageComments);
		expect(comment.editedAt).not.toBeNull();
	});

	it('is the author’s alone: nobody else, not even an admin', async () => {
		const s = await setup();
		const first = await addPageComment(s.technician, s.page.id, 'Mío', s.deps);
		if (!first.ok) throw new Error('expected the comment to be added');

		const byAdmin = await editPageComment(s.admin, first.value.commentId, 'Ahora mío', s.deps);

		expect(byAdmin).toEqual({ ok: false, error: 'forbidden' });
		const [comment] = await getDb().select().from(pageComments);
		expect(comment).toMatchObject({ body: 'Mío', editedAt: null });
	});

	it('is closed once the page is archived', async () => {
		const s = await setup();
		const first = await addPageComment(s.technician, s.page.id, 'Mío', s.deps);
		if (!first.ok) throw new Error('expected the comment to be added');
		await archivePage(s.admin, s.page.id);

		const edited = await editPageComment(s.technician, first.value.commentId, 'Tarde', s.deps);

		expect(edited).toEqual({ ok: false, error: 'page_archived' });
	});

	it('leaves an unchanged body alone: not marked edited', async () => {
		const s = await setup();
		const first = await addPageComment(s.technician, s.page.id, 'Igual', s.deps);
		if (!first.ok) throw new Error('expected the comment to be added');

		await editPageComment(s.technician, first.value.commentId, 'Igual', s.deps);

		const [comment] = await getDb().select().from(pageComments);
		expect(comment.editedAt).toBeNull();
	});
});

describe('listPageComments', () => {
	it('lists oldest first, with who may edit each, and still reads an archived page', async () => {
		const s = await setup();
		await addPageComment(s.technician, s.page.id, 'Primero', s.deps);
		await addPageComment(s.admin, s.page.id, 'Segundo', s.deps);
		const open = await listPageComments(s.technician, s.page.id);
		if (!open.ok) throw new Error('expected the comments');
		expect(open.value.map((c) => c.canEdit)).toEqual([true, false]);
		await archivePage(s.admin, s.page.id);

		const listed = await listPageComments(s.technician, s.page.id);
		if (!listed.ok) throw new Error('expected the comments');

		expect(listed.value.map((c) => [c.authorName, c.body, c.canEdit])).toEqual([
			['Tom Technician', 'Primero', false],
			['Ada Admin', 'Segundo', false]
		]);
	});

	it('is closed to employees, portal pages included', async () => {
		const s = await setup('portal');
		await addPageComment(s.technician, s.page.id, 'Interno', s.deps);

		await expect(listPageComments(s.employee, s.page.id)).rejects.toThrow();
	});

	it('does not see a page of another organisation', async () => {
		const s = await setup();
		const other = await createWorkspace('Other', 'other');

		expect(await listPageComments(other.technician, s.page.id)).toEqual({
			ok: false,
			error: 'not_found'
		});
	});
});

describe('mentionablesForPage', () => {
	it('offers active people who can manage knowledge, never the viewer, at most 8', async () => {
		const s = await setup();
		for (let index = 0; index < 9; index++) {
			await createViewer(s.organisation.id, 'technician', `Tech ${index}`);
		}

		const all = await mentionablesForPage(s.technician, '');
		expect(all).toHaveLength(8);
		expect(all.map((person) => person.id)).not.toContain(s.technician.personId);
		expect(all.map((person) => person.id)).not.toContain(s.employee.personId);

		const found = await mentionablesForPage(s.technician, 'ada');
		expect(found).toEqual([{ id: s.admin.personId, label: 'Ada Admin', hint: s.admin.email }]);
		expect(await mentionablesForPage(s.technician, 'eva')).toEqual([]);
	});
});

describe('notifications targets', () => {
	it('accept exactly one of four targets', async () => {
		const s = await setup();
		const base = {
			organisationId: s.organisation.id,
			recipientPersonId: s.admin.personId!,
			type: 'mention' as const,
			snapshot: { code: 'X', title: 'X' }
		};

		await expect(
			getDb()
				.insert(notifications)
				.values({ ...base })
		).rejects.toThrow();
		await expect(
			getDb()
				.insert(notifications)
				.values({ ...base, pageId: s.page.id, projectId: crypto.randomUUID() })
		).rejects.toThrow();
		await getDb()
			.insert(notifications)
			.values({ ...base, pageId: s.page.id });
		expect(await rows()).toHaveLength(1);
	});

	it('cascade with the page', async () => {
		const s = await setup();
		await addPageComment(s.technician, s.page.id, mention('Ada Admin', s.admin.personId), s.deps);
		await getDb().delete(pages).where(eq(pages.id, s.page.id));

		expect(await rows()).toHaveLength(0);
		expect(
			await getDb().select().from(pageComments).orderBy(asc(pageComments.createdAt))
		).toHaveLength(0);
	});
});
