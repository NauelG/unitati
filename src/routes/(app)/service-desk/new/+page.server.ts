import { fail, redirect } from '@sveltejs/kit';
import { PRIORITIES } from '#lib/domain/status.js';
import { failureMessage } from '#lib/ticket-errors.js';
import { m } from '#lib/paraglide/messages.js';
import { requirePermission } from '#lib/server/auth/guards.js';
import { listPeople } from '#lib/server/directory/index.js';
import {
	createTicket,
	createTicketInput,
	listQueues,
	readTicketForm
} from '#lib/server/service-desk/index.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requirePermission(locals.user, 'tickets.manage');

	const [queues, people] = await Promise.all([listQueues(user), listPeople(user.organisationId)]);

	return {
		queues: queues.map(({ id, name }) => ({ id, name })),
		people: people.filter((person) => person.active).map(({ id, fullName }) => ({ id, fullName })),
		priorities: PRIORITIES
	};
};

export const actions: Actions = {
	default: async ({ locals, request }) => {
		const user = requirePermission(locals.user, 'tickets.manage');
		const { fields, files } = await readTicketForm(request);

		const priority = PRIORITIES.find((candidate) => candidate === fields.priority);
		const input = {
			subject: fields.subject ?? '',
			body: fields.body ?? '',
			queueId: fields.queueId ?? '',
			// Blank means "for me"; the domain decides whether the name is honoured.
			requesterPersonId: fields.requesterPersonId || undefined,
			priority
		};

		const valid = createTicketInput.safeParse(input);
		if (!valid.success) {
			return fail(400, { message: m.ticket_error_invalid(), values: fields });
		}

		const outcome = await createTicket(user, valid.data, files);
		if (!outcome.ok) {
			return fail(400, { message: failureMessage(outcome.error), values: fields });
		}

		redirect(303, `/service-desk/${encodeURIComponent(outcome.value.ticketTag)}`);
	}
};
