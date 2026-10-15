import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { PRIORITIES, TICKET_STATUSES } from '#lib/domain/status.js';
import { m } from '#lib/paraglide/messages.js';
import { can } from '#lib/server/access/permissions.js';
import { requirePermission } from '#lib/server/auth/guards.js';
import { listPeople } from '#lib/server/directory/index.js';
import { relatedTo, unlinkAsset } from '#lib/server/links/index.js';
import {
	addComment,
	addCommentInput,
	assignTicket,
	changeTicketStatus,
	getTicketByTag,
	listQueues,
	moveTicketToQueue,
	nextStatuses,
	readTicketForm,
	setTicketPriority,
	ticketThread
} from '#lib/server/service-desk/index.js';
import { failureMessage } from '#lib/ticket-errors.js';
import { fieldsOf, rejected } from '../../assets/form-data';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = requirePermission(locals.user, 'tickets.view');

	const found = await getTicketByTag(user, params.tag);
	if (!found.ok) error(404, 'Not found');
	const thread = await ticketThread(user, params.tag);
	if (!thread.ok) error(404, 'Not found');

	const canManage = can(user, 'tickets.manage');
	const [queues, people] = canManage
		? await Promise.all([listQueues(user), listPeople(user.organisationId)])
		: [[], []];

	return {
		ticket: found.value,
		// Thread stays awaited — it's the page's point (#89's streaming note).
		thread: thread.value,
		// Unawaited (#89): the viewer reached this ticket through a scoped
		// read, so what is linked to it is read on that same footing;
		// `relatedTo` scopes the other side of each link. Streams in behind
		// `RelatedRecords` while the rest of the page is already interactive.
		// All of it feeds the constellation (#151); the panel lists the asset
		// groups only until the tasks and projects get theirs in #150.
		related: relatedTo(user, { kind: 'ticket', id: found.value.id }),
		canManage,
		canInternal: can(user, 'tickets.comment.internal'),
		nextStatuses: nextStatuses(found.value.status),
		queues: queues.map(({ id, name }) => ({ id, name })),
		people: people.filter((person) => person.active).map(({ id, fullName }) => ({ id, fullName }))
	};
};

export const actions: Actions = {
	reply: async ({ locals, request, params }) => {
		const user = requirePermission(locals.user, 'tickets.view');
		const { fields, files } = await readTicketForm(request);

		const input = addCommentInput.safeParse({
			body: fields.body ?? '',
			visibility: fields.visibility === 'internal' ? 'internal' : 'public'
		});
		if (!input.success) return rejected('reply', m.ticket_error_invalid());

		const outcome = await addComment(user, params.tag, input.data, files);
		if (!outcome.ok) {
			if (outcome.error === 'ticket_not_found') error(404, 'Not found');
			return rejected('reply', failureMessage(outcome.error));
		}
		return { action: 'reply' as const };
	},

	status: async ({ locals, request, params }) => {
		const user = requirePermission(locals.user, 'tickets.manage');
		const parsed = z.object({ status: z.enum(TICKET_STATUSES) }).safeParse(await fieldsOf(request));
		if (!parsed.success) return rejected('status', m.ticket_error_invalid_transition());

		const outcome = await changeTicketStatus(user, params.tag, parsed.data.status);
		if (!outcome.ok) {
			if (outcome.error === 'ticket_not_found') error(404, 'Not found');
			return rejected('status', failureMessage(outcome.error));
		}
		return { action: 'status' as const };
	},

	priority: async ({ locals, request, params }) => {
		const user = requirePermission(locals.user, 'tickets.manage');
		const parsed = z.object({ priority: z.enum(PRIORITIES) }).safeParse(await fieldsOf(request));
		if (!parsed.success) return rejected('priority', m.ticket_error_invalid());

		const outcome = await setTicketPriority(user, params.tag, parsed.data.priority);
		if (!outcome.ok) error(404, 'Not found');
		return { action: 'priority' as const };
	},

	assign: async ({ locals, request, params }) => {
		const user = requirePermission(locals.user, 'tickets.manage');
		const parsed = z
			.object({ personId: z.union([z.uuid(), z.literal('')]) })
			.safeParse(await fieldsOf(request));
		if (!parsed.success) return rejected('assign', m.ticket_error_assignee_not_found());

		const outcome = await assignTicket(user, params.tag, parsed.data.personId || null);
		if (!outcome.ok) {
			if (outcome.error === 'ticket_not_found') error(404, 'Not found');
			return rejected('assign', failureMessage(outcome.error));
		}
		return { action: 'assign' as const };
	},

	unlinkAsset: async ({ locals, request, params }) => {
		const user = requirePermission(locals.user, 'tickets.manage');
		const parsed = z.object({ recordId: z.uuid() }).safeParse(await fieldsOf(request));
		if (!parsed.success) return rejected('unlinkAsset', m.related_unlink_failed());

		const found = await getTicketByTag(user, params.tag);
		if (!found.ok) error(404, 'Not found');

		const outcome = await unlinkAsset(user, {
			ticketId: found.value.id,
			assetId: parsed.data.recordId
		});
		// Already gone, e.g. a second tab removed it first: the page reloads and
		// shows the truth, so there is nothing to apologise for.
		if (!outcome.ok && outcome.error !== 'not_linked') {
			return rejected('unlinkAsset', m.related_unlink_failed());
		}
		return { action: 'unlinkAsset' as const };
	},

	queue: async ({ locals, request, params }) => {
		const user = requirePermission(locals.user, 'tickets.manage');
		const parsed = z.object({ queueId: z.uuid() }).safeParse(await fieldsOf(request));
		if (!parsed.success) return rejected('queue', m.ticket_error_queue_not_found());

		const outcome = await moveTicketToQueue(user, params.tag, parsed.data.queueId);
		if (!outcome.ok) {
			if (outcome.error === 'ticket_not_found') error(404, 'Not found');
			return rejected('queue', failureMessage(outcome.error));
		}
		return { action: 'queue' as const };
	}
};
