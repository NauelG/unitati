import { describe, expect, it } from 'vitest';
import { createPage, publishPage } from '#lib/server/knowledge/index.js';
import { createSpaceRow, createWorkspace } from '#lib/server/knowledge/testing/fixtures.js';
import { citePage } from '#lib/server/links/index.js';
import { createQueue, createTicket } from '#lib/server/service-desk/testing/fixtures.js';
import { outcomeOf } from '#lib/server/projects/testing/action-event.js';
import { load } from './+page.server';

async function setup() {
	const workspace = await createWorkspace();
	const space = await createSpaceRow(workspace.organisation.id, { name: 'Ayuda' });
	const created = await createPage(workspace.admin, {
		spaceId: space.id,
		parentId: null,
		title: 'VPN',
		body: 'Uno'
	});
	if (!created.ok) throw new Error('expected the page');
	await publishPage(workspace.admin, created.value.id);
	return { ...workspace, page: created.value };
}

const open = (user: unknown, tag: string) =>
	outcomeOf(() =>
		load({
			locals: { user },
			params: { tag },
			url: new URL(`http://localhost/knowledge/${tag}`)
		} as never)
	);

describe('/knowledge/[tag]', () => {
	// The canonical link is the only one inserted anywhere, so an employee follows it
	// too. Until the portal reader exists (#328) there is nowhere to send them: 404.
	it('does not open for an employee', async () => {
		const { employee, page } = await setup();

		const { thrown } = await open(employee, page.tag);

		expect(thrown?.status).toBe(404);
	});

	it('answers 404 for a page that does not exist', async () => {
		const { technician } = await setup();

		expect((await open(technician, 'DOC-9999')).thrown?.status).toBe(404);
	});

	it('lists the tickets that cite the page', async () => {
		const { organisation, employee, technician, page } = await setup();
		const queue = await createQueue(organisation.id);
		const ticket = await createTicket(organisation.id, queue.id, employee.personId!, {
			ticketTag: 'TCK-0042'
		});
		await citePage(technician, ticket.id, page.tag);

		const { returned } = await open(technician, page.tag);
		const related = (returned as unknown as { related: { relation: string; items: unknown[] }[] })
			.related;

		expect(related.map((group) => [group.relation, group.items.length])).toEqual([['cited_by', 1]]);
	});
});
