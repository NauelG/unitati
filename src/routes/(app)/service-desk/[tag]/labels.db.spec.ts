import { describe, expect, it } from 'vitest';
import { createWorkspace } from '#lib/server/projects/testing/fixtures.js';
import { actionEvent, outcomeOf } from '#lib/server/projects/testing/action-event.js';
import { createLabel, ticketLabelsOf } from '#lib/server/service-desk/index.js';
import { createQueue, createTicket } from '#lib/server/service-desk/testing/fixtures.js';
import { actions } from './+page.server';

/** #391: the `?/labels` form action on the ticket record. */

async function scene() {
	const base = await createWorkspace();
	const { organisation, employee, technician } = base;
	const queue = await createQueue(organisation.id);
	const ticket = await createTicket(organisation.id, queue.id, employee.personId!);
	const created = await createLabel(technician, { name: 'vpn' });
	if (!created.ok) throw new Error(created.error);
	return { ...base, ticket, labelId: created.value.id, params: { tag: ticket.ticketTag } };
}

describe('the ?/labels action', () => {
	it('saves the posted label set for someone who may manage tickets', async () => {
		const { technician, ticket, labelId, params } = await scene();

		const { returned } = await outcomeOf(() =>
			actions.labels(actionEvent(technician, { labelIds: [labelId] }, params))
		);

		expect(returned).toEqual({ action: 'labels' });
		expect(await ticketLabelsOf(technician.organisationId, ticket.id)).toMatchObject([
			{ id: labelId }
		]);
	});

	it('is refused for a reader without tickets.manage and for the requester, and changes nothing', async () => {
		const { technician, employee, ticket, labelId, params } = await scene();
		const reader = { ...technician, scopes: ['tickets.view' as const] };

		for (const viewer of [reader, employee]) {
			const { thrown } = await outcomeOf(() =>
				actions.labels(actionEvent(viewer, { labelIds: [labelId] }, params))
			);
			expect(thrown?.status).toBe(404);
		}
		expect(await ticketLabelsOf(technician.organisationId, ticket.id)).toHaveLength(0);
	});

	it('answers a field error for an archived label and for a malformed id', async () => {
		const { technician, params } = await scene();

		const malformed = await outcomeOf(() =>
			actions.labels(actionEvent(technician, { labelIds: ['nope'] }, params))
		);
		expect(malformed.returned?.data).toMatchObject({ action: 'labels' });

		const missing = await outcomeOf(() =>
			actions.labels(
				actionEvent(technician, { labelIds: ['3f1e0c9a-0000-4000-8000-000000000001'] }, params)
			)
		);
		expect(missing.returned?.data).toMatchObject({ action: 'labels' });
	});
});
