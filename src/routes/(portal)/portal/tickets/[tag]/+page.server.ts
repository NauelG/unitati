import { error } from '@sveltejs/kit';
import { m } from '#lib/paraglide/messages.js';
import { requirePermission } from '#lib/server/auth/guards.js';
import { assetRelations, relatedTo } from '#lib/server/links/index.js';
import {
	addComment,
	addCommentInput,
	getTicketByTag,
	readTicketForm,
	ticketThread
} from '#lib/server/service-desk/index.js';
import { failureMessage } from '#lib/ticket-errors.js';
import { rejected } from '../../../../(app)/assets/form-data';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = requirePermission(locals.user, 'tickets.view.own');

	const found = await getTicketByTag(user, params.tag);
	if (!found.ok) error(404, 'Not found');
	// Internal notes are filtered inside the query for this viewer: they are not
	// in this payload, let alone hidden by the template.
	const thread = await ticketThread(user, params.tag);
	if (!thread.ok) error(404, 'Not found');

	// For an employee `relatedTo` narrows to the equipment they could have
	// attached themselves, so a colleague's laptop added by staff stays out.
	// The tasks and projects it was escalated to get their panel with #150.
	const related = assetRelations(await relatedTo(user, { kind: 'ticket', id: found.value.id }));

	return { ticket: found.value, thread: thread.value, related };
};

export const actions: Actions = {
	reply: async ({ locals, request, params }) => {
		const user = requirePermission(locals.user, 'tickets.view.own');
		const { fields, files } = await readTicketForm(request);

		// Always public, whatever the form says: an employee has no internal notes.
		const input = addCommentInput.safeParse({ body: fields.body ?? '', visibility: 'public' });
		if (!input.success) return rejected('reply', m.ticket_error_invalid());

		const outcome = await addComment(user, params.tag, input.data, files);
		if (!outcome.ok) {
			if (outcome.error === 'ticket_not_found') error(404, 'Not found');
			return rejected('reply', failureMessage(outcome.error));
		}
		return { action: 'reply' as const };
	}
};
