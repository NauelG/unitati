import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { requirePermission } from '#lib/server/auth/guards.js';
import { relatedTo, requestedCategory } from '#lib/server/links/index.js';
import {
	addComment,
	addCommentInput,
	editComment,
	editCommentInput,
	getTicketByTag,
	readTicketForm,
	ticketThread
} from '#lib/server/service-desk/index.js';
import { failureMessage } from '#lib/ticket-errors.js';
import { fieldsOf, rejected } from '../../../../(app)/assets/form-data';
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
	// The work it was escalated to comes back reduced to code, title and state
	// even outside the employee's scope (ADR 0007), with no link when restricted.
	const related = await relatedTo(user, { kind: 'ticket', id: found.value.id });

	const requested = found.value.requestFormId
		? await requestedCategory(user.organisationId, found.value.id)
		: null;

	return { ticket: found.value, requestedCategory: requested, thread: thread.value, related };
};

export const actions: Actions = {
	reply: async ({ locals, request, params }) => {
		const user = requirePermission(locals.user, 'tickets.view.own');
		const { fields, files } = await readTicketForm(request);

		// Always public, whatever the form says: an employee has no internal notes.
		const input = addCommentInput.safeParse({ body: fields.body ?? '', visibility: 'public' });
		if (!input.success) {
			// The schema's own bound, not a second copy of the number.
			const tooLong = input.error.issues.some((issue) => issue.code === 'too_big');
			return rejected(
				'reply',
				tooLong ? failureMessage('body_too_long') : m.ticket_error_invalid()
			);
		}

		const outcome = await addComment(user, params.tag, input.data, files);
		if (!outcome.ok) {
			if (outcome.error === 'ticket_not_found') error(404, 'Not found');
			return rejected('reply', failureMessage(outcome.error));
		}
		return { action: 'reply' as const };
	},

	editComment: async ({ locals, request, params }) => {
		const user = requirePermission(locals.user, 'tickets.view.own');
		const fields = await fieldsOf(request);

		const parsed = z.object({ commentId: z.uuid(), body: z.string() }).safeParse(fields);
		const input = parsed.success ? editCommentInput.safeParse({ body: parsed.data.body }) : null;
		if (!parsed.success || !input?.success) {
			const tooLong =
				input && !input.success && input.error.issues.some((i) => i.code === 'too_big');
			return rejected(
				'editComment',
				tooLong ? failureMessage('body_too_long') : m.ticket_error_invalid()
			);
		}

		// The comment must belong to the ticket in the URL, or the page it was posted from lies.
		const found = await getTicketByTag(user, params.tag);
		if (!found.ok) error(404, 'Not found');

		const outcome = await editComment(user, parsed.data.commentId, input.data.body);
		if (!outcome.ok) {
			if (outcome.error === 'not_found') error(404, 'Not found');
			if (outcome.error === 'forbidden') error(403, 'Forbidden');
			return rejected('editComment', failureMessage(outcome.error));
		}
		return { action: 'editComment' as const };
	}
};
