import { fail, redirect } from '@sveltejs/kit';
import { renderMarkdown } from '#lib/server/shared/markdown.js';
import { m } from '#lib/paraglide/messages.js';
import { requirePermission } from '#lib/server/auth/guards.js';
import {
	createTicket,
	createTicketInput,
	defaultQueue,
	listActiveRequestForms,
	readTicketForm
} from '#lib/server/service-desk/index.js';
import { failureMessage } from '#lib/ticket-errors.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requirePermission(locals.user, 'tickets.create');
	const forms = await listActiveRequestForms(user);
	return {
		// Sanitised on the server (ADR 0030): the only thing the page may `{@html}`.
		requestForms: forms.map(({ id, name, description }) => ({
			id,
			name,
			descriptionHtml: renderMarkdown(description)
		}))
	};
};

export const actions: Actions = {
	default: async ({ locals, request }) => {
		const user = requirePermission(locals.user, 'tickets.create');
		const { fields, files, assetIds } = await readTicketForm(request);

		// An employee does not pick a queue; the ticket lands in the first one.
		const queue = await defaultQueue(user);
		if (!queue) return fail(400, { message: failureMessage('no_queue'), values: fields });

		// The domain ignores any requester or priority an employee posts; they are
		// not even forwarded.
		const input = createTicketInput.safeParse({
			subject: fields.subject ?? '',
			body: fields.body ?? '',
			queueId: queue.id,
			// Whether each one may be attached is decided in the domain, not here.
			assetIds
		});
		if (!input.success) return fail(400, { message: m.ticket_error_invalid(), values: fields });

		const outcome = await createTicket(user, input.data, files);
		if (!outcome.ok) {
			return fail(400, { message: failureMessage(outcome.error), values: fields });
		}

		redirect(303, `/portal/tickets/${encodeURIComponent(outcome.value.ticketTag)}`);
	}
};
