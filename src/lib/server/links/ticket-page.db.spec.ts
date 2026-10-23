import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { activity } from '../activity/schema';
import { createViewer } from '../assets/testing/fixtures';
import { getDb } from '../db';
import { pages } from '../knowledge/schema';
import { createPageRow, createSpaceRow } from '../knowledge/testing/fixtures';
import { createProjectRow, createWorkspace } from '../projects/testing/fixtures';
import { projects } from '../projects/schema';
import { addComment, editComment } from '../service-desk';
import { ticketComments } from '../service-desk/schema';
import { createQueue, createTicket } from '../service-desk/testing/fixtures';
import { InMemoryStorage } from '../shared/storage';
import { citePage, documentProject, relatedTo, uncitePage, undocumentProject } from './index';
import { projectPage, ticketPage } from './schema';

/** #327: tickets cite pages, projects are documented by them, and every side shows the other. */

const deps = { storage: new InMemoryStorage(), mailer: null };
const published = new Date();

async function scene() {
	const base = await createWorkspace();
	const { organisation, employee, technician } = base;
	const queue = await createQueue(organisation.id);
	const ticket = await createTicket(organisation.id, queue.id, employee.personId!, {
		ticketTag: 'TCK-0001',
		assigneePersonId: technician.personId
	});

	const portal = await createSpaceRow(organisation.id, { name: 'Ayuda', audience: 'portal' });
	const staff = await createSpaceRow(organisation.id, { name: 'Interno', audience: 'staff' });
	const help = await createPageRow(organisation.id, portal.id, {
		title: 'Reset your password',
		pageTag: 'DOC-0012',
		publishedAt: published
	});
	const runbook = await createPageRow(organisation.id, staff.id, {
		title: 'Secret runbook',
		pageTag: 'DOC-0013',
		publishedAt: published
	});
	const draft = await createPageRow(organisation.id, portal.id, {
		title: 'Draft',
		pageTag: 'DOC-0014'
	});
	const archived = await createPageRow(organisation.id, portal.id, {
		title: 'Old',
		pageTag: 'DOC-0015',
		publishedAt: published,
		archivedAt: new Date()
	});

	const reply = (body: string, visibility: 'public' | 'internal' = 'public', author = technician) =>
		addComment(author, ticket.ticketTag, { body, visibility }, [], deps);
	const link = (tag: string) => `[x](/knowledge/${tag})`;

	return { ...base, ticket, help, runbook, draft, archived, reply, link };
}

const citations = (ticketId: string) =>
	getDb().select().from(ticketPage).where(eq(ticketPage.ticketId, ticketId));

const pageEvents = (ticketId: string) =>
	getDb()
		.select()
		.from(activity)
		.where(and(eq(activity.ticketId, ticketId), eq(activity.verb, 'link.page.added')));

describe('citing from a reply', () => {
	it('cites a linked page once, with one activity entry, and not again', async () => {
		const { ticket, reply, link, help } = await scene();

		expect((await reply(`See ${link('DOC-0012')}`)).ok).toBe(true);
		expect((await reply(`Again ${link('doc-0012')} and ${link('DOC-0012')}`)).ok).toBe(true);

		expect((await citations(ticket.id)).map((row) => row.pageId)).toEqual([help.id]);
		const events = await pageEvents(ticket.id);
		expect(events.map((event) => event.payload)).toEqual([
			{ pageTag: 'DOC-0012', pageTitle: 'Reset your password' }
		]);
	});

	it('refuses a public reply linking a staff page, a draft or an archived page, and writes nothing', async () => {
		const { ticket, reply, link } = await scene();

		for (const tag of ['DOC-0013', 'DOC-0014', 'DOC-0015', 'DOC-0099']) {
			const outcome = await reply(`${link('DOC-0012')} and ${link(tag)}`);
			expect(outcome).toEqual({ ok: false, error: { kind: 'page_not_public', pageTag: tag } });
		}

		expect(await citations(ticket.id)).toEqual([]);
		expect(await pageEvents(ticket.id)).toEqual([]);
		expect(
			await getDb().select().from(ticketComments).where(eq(ticketComments.ticketId, ticket.id))
		).toEqual([]);
	});

	it('accepts a published staff page in an internal note, and refuses a draft or an archived one', async () => {
		const { ticket, reply, link, runbook } = await scene();

		expect((await reply(link('DOC-0013'), 'internal')).ok).toBe(true);
		expect((await citations(ticket.id)).map((row) => row.pageId)).toEqual([runbook.id]);

		for (const tag of ['DOC-0014', 'DOC-0015']) {
			expect(await reply(link(tag), 'internal')).toEqual({
				ok: false,
				error: { kind: 'page_not_citable', pageTag: tag }
			});
		}
	});

	it('keeps the citation when the link is edited out of the text', async () => {
		const { ticket, reply, link, technician } = await scene();
		const outcome = await reply(`See ${link('DOC-0012')}`);
		if (!outcome.ok) throw new Error('setup');

		expect(await editComment(technician, outcome.value.commentId, 'No link now', deps)).toEqual({
			ok: true,
			value: undefined
		});

		expect(await citations(ticket.id)).toHaveLength(1);
	});

	it('cites only the links an edit adds, so an archived page does not block a typo fix', async () => {
		const { ticket, reply, link, technician, help } = await scene();
		const outcome = await reply(`See ${link('DOC-0012')}`);
		if (!outcome.ok) throw new Error('setup');
		await getDb().update(pages).set({ archivedAt: new Date() }).where(eq(pages.id, help.id));

		const fixed = await editComment(
			technician,
			outcome.value.commentId,
			`See ${link('DOC-0012')} please`,
			deps
		);
		const added = await editComment(
			technician,
			outcome.value.commentId,
			`See ${link('DOC-0012')} and ${link('DOC-0013')}`,
			deps
		);

		expect(fixed.ok).toBe(true);
		expect(added).toEqual({ ok: false, error: { kind: 'page_not_public', pageTag: 'DOC-0013' } });
		expect(await citations(ticket.id)).toHaveLength(1);
	});

	it('does not cite from an employee reply', async () => {
		const { ticket, reply, link, employee } = await scene();

		expect((await reply(link('DOC-0012'), 'public', employee)).ok).toBe(true);

		expect(await citations(ticket.id)).toEqual([]);
	});
});

describe('citePage and uncitePage', () => {
	it('cites by hand, idempotently, and only published readable pages', async () => {
		const { ticket, technician, employee, help } = await scene();

		expect(await citePage(technician, ticket.id, 'DOC-0012')).toEqual({
			ok: true,
			value: { created: true }
		});
		expect(await citePage(technician, ticket.id, 'DOC-0012')).toEqual({
			ok: true,
			value: { created: false }
		});
		expect(await citePage(technician, ticket.id, 'DOC-0014')).toEqual({
			ok: false,
			error: 'page_not_citable'
		});
		expect(await citePage(technician, ticket.id, 'DOC-0015')).toEqual({
			ok: false,
			error: 'page_not_found'
		});
		expect(await citePage(employee, ticket.id, 'DOC-0012')).toEqual({
			ok: false,
			error: 'forbidden'
		});

		expect((await citations(ticket.id)).map((row) => row.pageId)).toEqual([help.id]);
		expect(await pageEvents(ticket.id)).toHaveLength(1);
	});

	it('removes a citation and records it, also for a page that was archived since', async () => {
		const { ticket, technician, help } = await scene();
		await citePage(technician, ticket.id, 'DOC-0012');
		await getDb().update(pages).set({ archivedAt: new Date() }).where(eq(pages.id, help.id));

		expect(await uncitePage(technician, ticket.id, help.id)).toEqual({
			ok: true,
			value: undefined
		});
		expect(await uncitePage(technician, ticket.id, help.id)).toEqual({
			ok: false,
			error: 'link_not_found'
		});

		expect(await citations(ticket.id)).toEqual([]);
		const removed = await getDb()
			.select()
			.from(activity)
			.where(and(eq(activity.ticketId, ticket.id), eq(activity.verb, 'link.page.removed')));
		expect(removed).toHaveLength(1);
	});
});

describe('what the requester sees of a citation', () => {
	it('shows the code only when the cited page is no longer readable to them', async () => {
		const { ticket, employee, technician, reply, link, help, runbook } = await scene();
		await reply(link('DOC-0012'));
		await reply(link('DOC-0013'), 'internal');

		const before = await relatedTo(employee, { kind: 'ticket', id: ticket.id });
		expect(
			before.find((group) => group.relation === 'cites')?.items.map((item) => item.ref.tag)
		).toEqual(['DOC-0012', 'DOC-0013']);

		await getDb().update(pages).set({ archivedAt: new Date() }).where(eq(pages.id, help.id));
		const after = await relatedTo(employee, { kind: 'ticket', id: ticket.id });
		const cites = after.find((group) => group.relation === 'cites')!;

		expect(cites.items.map((item) => item.ref)).toEqual([
			{ kind: 'page', id: help.id, tag: 'DOC-0012', title: '', href: null },
			{ kind: 'page', id: runbook.id, tag: 'DOC-0013', title: '', href: null }
		]);
		const wire = JSON.stringify(after);
		expect(wire).not.toContain('Reset your password');
		expect(wire).not.toContain('Secret runbook');
		expect(wire).not.toContain('/knowledge/');

		// The technician still reads both, with title and link.
		const staff = await relatedTo(technician, { kind: 'ticket', id: ticket.id });
		expect(
			staff.find((group) => group.relation === 'cites')?.items.map((item) => item.ref.href)
		).toEqual(['/knowledge/DOC-0012', '/knowledge/DOC-0013']);
	});

	it('shows a readable portal page whole', async () => {
		const { ticket, employee, reply, link } = await scene();
		await reply(link('DOC-0012'));

		const groups = await relatedTo(employee, { kind: 'ticket', id: ticket.id });

		expect(groups.find((group) => group.relation === 'cites')?.items[0]).toMatchObject({
			ref: { tag: 'DOC-0012', title: 'Reset your password', href: '/knowledge/DOC-0012' },
			status: 'published'
		});
	});
});

describe('project documentation', () => {
	it('documents a project, idempotently, and shows both sides', async () => {
		const { organisation, technician, ticket, help } = await scene();
		const project = await createProjectRow(organisation.id, {
			name: 'Move',
			projectTag: 'PRJ-0001'
		});

		expect(await documentProject(technician, project.id, 'DOC-0012')).toEqual({
			ok: true,
			value: { created: true }
		});
		expect(await documentProject(technician, project.id, 'DOC-0012')).toEqual({
			ok: true,
			value: { created: false }
		});
		await citePage(technician, ticket.id, 'DOC-0012');

		const fromProject = await relatedTo(technician, { kind: 'project', id: project.id });
		const fromPage = await relatedTo(technician, { kind: 'page', id: help.id });

		expect(fromProject.find((g) => g.relation === 'documented_by')?.items[0].ref.tag).toBe(
			'DOC-0012'
		);
		expect(fromPage.map((g) => [g.relation, g.items.map((item) => item.ref.tag)])).toEqual([
			['cited_by', ['TCK-0001']],
			['documents', ['PRJ-0001']]
		]);
		expect(
			await getDb().select().from(activity).where(eq(activity.projectId, project.id))
		).toHaveLength(1);

		expect(await undocumentProject(technician, project.id, help.id)).toEqual({
			ok: true,
			value: undefined
		});
		expect(await getDb().select().from(projectPage)).toEqual([]);
	});

	it('is not found for a members-only project the actor cannot see, and restricted for a reader of the page', async () => {
		const { organisation, technician, help } = await scene();
		const other = await createViewer(organisation.id, 'technician', 'Other Tech');
		const hidden = await createProjectRow(organisation.id, {
			name: 'Secret',
			projectTag: 'PRJ-0009'
		});
		await getDb().update(projects).set({ visibility: 'members' }).where(eq(projects.id, hidden.id));

		expect(await documentProject(technician, hidden.id, 'DOC-0012')).toEqual({
			ok: false,
			error: 'project_not_found'
		});

		// An administrator sees it, documents it, and a non-member then sees only a count.
		const admin = await createViewer(organisation.id, 'admin', 'Root Admin');
		expect((await documentProject(admin, hidden.id, 'DOC-0012')).ok).toBe(true);

		const asOther = await relatedTo(other, { kind: 'page', id: help.id });
		expect(asOther).toEqual([{ relation: 'documents', icon: 'project', items: [], restricted: 1 }]);
		expect(JSON.stringify(asOther)).not.toContain('Secret');
		expect(JSON.stringify(asOther)).not.toContain('PRJ-0009');
	});

	it('needs projects.manage', async () => {
		const { organisation, employee } = await scene();
		const project = await createProjectRow(organisation.id);

		expect(await documentProject(employee, project.id, 'DOC-0012')).toEqual({
			ok: false,
			error: 'forbidden'
		});
	});
});
