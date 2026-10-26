import { describe, expect, it } from 'vitest';
import { createWorkspace } from '#lib/server/projects/testing/fixtures.js';
import { createLabel, setTicketLabels } from '#lib/server/service-desk/index.js';
import { createQueue, createTicket } from '#lib/server/service-desk/testing/fixtures.js';
import { load } from './+page.server';

/** #391: an internal label must not reach the requester's portal page. */
describe('the portal ticket page and labels', () => {
	it('carries no label and no label activity in its load data', async () => {
		const { organisation, employee, technician } = await createWorkspace();
		const queue = await createQueue(organisation.id);
		const ticket = await createTicket(organisation.id, queue.id, employee.personId!);
		const created = await createLabel(technician, { name: 'usuario-conflictivo' });
		if (!created.ok) throw new Error(created.error);
		await setTicketLabels(technician, ticket.ticketTag, [created.value.id]);

		const data = await (load as (event: never) => Promise<unknown>)({
			locals: { user: employee },
			params: { tag: ticket.ticketTag }
		} as never);

		const serialised = JSON.stringify(data);
		expect(serialised).not.toContain('usuario-conflictivo');
		expect(serialised).not.toContain('ticket.labels.changed');
	});
});
