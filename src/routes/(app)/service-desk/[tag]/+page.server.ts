import { error, fail } from '@sveltejs/kit';
import { z } from 'zod';
import { TICKET_READ_PERMISSIONS } from '#lib/domain/access.js';
import { PRIORITIES, TICKET_STATUSES } from '#lib/domain/status.js';
import { escalateFailureMessage } from '#lib/escalation-errors.js';
import { m } from '#lib/paraglide/messages.js';
import { can } from '#lib/server/access/permissions.js';
import { requireAnyPermission, requirePermission } from '#lib/server/auth/guards.js';
import { listDeliverableAssets } from '#lib/server/assets/index.js';
import { listPeople, personLocation } from '#lib/server/directory/index.js';
import {
	escalateTicket,
	escalationDraft,
	invalidField,
	linkHandoverByCode,
	linkTicketAssets,
	parseEscalation,
	relatedTo,
	requestedCategory,
	unlinkAsset,
	unlinkHandover,
	unlinkProject,
	unlinkTask
} from '#lib/server/links/index.js';
import {
	addComment,
	addCommentInput,
	assignTicket,
	changeTicketStatus,
	changeTicketSubject,
	editComment,
	editCommentInput,
	getTicketByTag,
	listQueues,
	moveTicketToQueue,
	nextStatuses,
	readTicketForm,
	setTicketPriority,
	subjectInput,
	ticketThread,
	type ThreadItem
} from '#lib/server/service-desk/index.js';
import { failureMessage } from '#lib/ticket-errors.js';
import { followState } from '#lib/server/notifications/index.js';
import { fieldsOf, rejected } from '../../assets/form-data';
import { followActions } from '../../follow-actions';
import type { Actions, PageServerLoad } from './$types';

/** The opening message is the thread's first comment: there is no `description` column. */
function firstMessage(thread: ThreadItem[]): string | null {
	const first = thread.find((item) => item.kind === 'comment');
	return first?.kind === 'comment' ? first.body : null;
}

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

	// Staff only (#176, ADR 0007): for anyone else the value is never read.
	const requesterLocation = can(user, 'people.view')
		? await personLocation(user.organisationId, found.value.requesterPersonId)
		: undefined;

	// What an equipment request asked for, and the stock that could answer it (#271).
	const requested = found.value.requestFormId
		? await requestedCategory(user.organisationId, found.value.id)
		: null;
	const canDeliver = canManage && can(user, 'assets.checkout');
	const inStock =
		canDeliver && requested
			? await listDeliverableAssets(user.organisationId, undefined, { categoryId: requested.id })
			: [];

	return {
		ticket: found.value,
		requestedCategory: requested,
		// A short list is enough to start a delivery from; the dialog filters the rest.
		inStockForRequest: inStock.slice(0, 5).map(({ assetTag, name }) => ({ assetTag, name })),
		// Thread stays awaited — it's the page's point (#89's streaming note).
		thread: thread.value,
		// Unawaited (#89): the viewer reached this ticket through a scoped
		// read, so what is linked to it is read on that same footing;
		// `relatedTo` scopes the other side of each link. Streams in behind
		// `RelatedRecords` while the rest of the page is already interactive.
		// The whole of it: the constellation draws every relation, the panel lists them.
		related: relatedTo(user, { kind: 'ticket', id: found.value.id }),
		canManage,
		follow: await followState(user, { ticketId: found.value.id }),
		// Delivering equipment for this ticket sends the technician to the asset (#279).
		canDeliver,
		...(requesterLocation === undefined
			? {}
			: { requesterLocation: requesterLocation && { path: requesterLocation.path } }),
		// What the escalation Sheet needs: only for someone who may escalate.
		escalation: canManage
			? {
					draft: escalationDraft({
						subject: found.value.subject,
						description: firstMessage(thread.value)
					}),
					canCreate: can(user, 'projects.manage')
				}
			: null,
		canInternal: can(user, 'tickets.comment.internal'),
		nextStatuses: nextStatuses(found.value.status),
		queues: queues.map(({ id, name, color }) => ({ id, name, color })),
		people: people.filter((person) => person.active).map(({ id, fullName }) => ({ id, fullName }))
	};
};

/**
 * Escalating and unlinking work. Somebody who can read tickets but not manage
 * them (the requester) knows the page exists and is told plainly: 403. Anybody
 * who cannot read tickets at all gets the usual 404.
 */
function requireEscalator(user: App.Locals['user']) {
	const reader = requireAnyPermission(user, TICKET_READ_PERMISSIONS);
	if (!can(reader, 'tickets.manage')) error(403, 'Forbidden');
	return reader;
}

/** An escalation refusal the Sheet can place under the field it is about. */
const rejectedField = (field: string, message: string) =>
	fail(400, { action: 'escalate', message, id: null, field });

async function unlinkWork(
	{ locals, request, params }: Parameters<Actions[string]>[0],
	kind: 'task' | 'project'
) {
	const user = requireEscalator(locals.user);
	const name = kind === 'task' ? 'unlinkTask' : 'unlinkProject';
	const parsed = z.object({ recordId: z.uuid() }).safeParse(await fieldsOf(request));
	if (!parsed.success) return rejected(name, m.related_unlink_failed());

	const found = await getTicketByTag(user, params.tag);
	if (!found.ok) error(404, 'Not found');

	const outcome =
		kind === 'task'
			? await unlinkTask(user, { ticketId: found.value.id, taskId: parsed.data.recordId })
			: await unlinkProject(user, { ticketId: found.value.id, projectId: parsed.data.recordId });
	// Already gone, e.g. a second tab removed it first: the page reloads and shows the truth.
	if (!outcome.ok && outcome.error !== 'link_not_found') {
		return rejected(name, m.related_unlink_failed());
	}
	return { action: name };
}

export const actions: Actions = {
	...followActions(
		(user) => requirePermission(user, 'tickets.view'),
		async (user, { params }) => {
			const found = await getTicketByTag(user, params.tag);
			return found.ok ? { ticketId: found.value.id } : null;
		}
	),
	reply: async ({ locals, request, params }) => {
		const user = requirePermission(locals.user, 'tickets.view');
		const { fields, files } = await readTicketForm(request);

		const input = addCommentInput.safeParse({
			body: fields.body ?? '',
			visibility: fields.visibility === 'internal' ? 'internal' : 'public'
		});
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
		const user = requirePermission(locals.user, 'tickets.view');
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
	},

	subject: async ({ locals, request, params }) => {
		const user = requirePermission(locals.user, 'tickets.manage');
		const parsed = subjectInput.safeParse(await fieldsOf(request));
		if (!parsed.success) return rejected('subject', m.ticket_error_invalid_subject());

		const found = await getTicketByTag(user, params.tag);
		if (!found.ok) error(404, 'Not found');

		const outcome = await changeTicketSubject(user, found.value.id, parsed.data.subject);
		if (!outcome.ok) error(404, 'Not found');
		return { action: 'subject' as const };
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

	linkHandover: async ({ locals, request, params }) => {
		const user = requirePermission(locals.user, 'tickets.manage');
		const parsed = z.object({ code: z.string().trim().min(1) }).safeParse(await fieldsOf(request));
		if (!parsed.success) return rejected('linkHandover', m.ticket_handover_error_invalid());

		const found = await getTicketByTag(user, params.tag);
		if (!found.ok) error(404, 'Not found');

		const outcome = await linkHandoverByCode(user, {
			ticketId: found.value.id,
			code: parsed.data.code
		});
		if (!outcome.ok) {
			if (outcome.error === 'forbidden') error(403, 'Forbidden');
			return rejected('linkHandover', m.ticket_handover_error_not_found());
		}
		return { action: 'linkHandover' as const };
	},

	unlinkHandover: async ({ locals, request, params }) => {
		const user = requirePermission(locals.user, 'tickets.manage');
		const parsed = z.object({ recordId: z.uuid() }).safeParse(await fieldsOf(request));
		if (!parsed.success) return rejected('unlinkHandover', m.related_unlink_failed());

		const found = await getTicketByTag(user, params.tag);
		if (!found.ok) error(404, 'Not found');

		const outcome = await unlinkHandover(user, {
			ticketId: found.value.id,
			handoverId: parsed.data.recordId
		});
		// Already gone, e.g. a second tab removed it first: the page reloads and shows the truth.
		if (!outcome.ok && outcome.error !== 'not_linked') {
			return rejected('unlinkHandover', m.related_unlink_failed());
		}
		return { action: 'unlinkHandover' as const };
	},

	unlinkTask: (event) => unlinkWork(event, 'task'),
	unlinkProject: (event) => unlinkWork(event, 'project'),

	escalate: async ({ locals, request, params }) => {
		const user = requireEscalator(locals.user);
		const fields = await fieldsOf(request);

		const parsed = parseEscalation(fields);
		if (!parsed.ok) return rejectedField(parsed.field, escalateFailureMessage('invalid_input'));

		const found = await getTicketByTag(user, params.tag);
		if (!found.ok) error(404, 'Not found');

		const outcome = await escalateTicket(user, found.value.id, parsed.target);
		if (!outcome.ok) {
			if (outcome.error === 'ticket_not_found') error(404, 'Not found');
			const field = outcome.error === 'invalid_input' ? invalidField(parsed.target.kind) : null;
			const message = escalateFailureMessage(outcome.error);
			return field ? rejectedField(field, message) : rejected('escalate', message);
		}
		return { action: 'escalate' as const, escalated: outcome.value };
	},

	linkAssets: async ({ locals, request, params }) => {
		const user = requirePermission(locals.user, 'tickets.manage');
		const ids = (await request.formData()).getAll('ids').filter((id) => typeof id === 'string');

		const found = await getTicketByTag(user, params.tag);
		if (!found.ok) error(404, 'Not found');

		if (ids.length === 0) return rejected('linkAssets', m.related_link_nothing_selected());

		const parsed = z.array(z.uuid()).safeParse(ids);
		if (!parsed.success) return rejected('linkAssets', m.related_link_asset_unavailable());

		const outcome = await linkTicketAssets(
			user,
			parsed.data.map((assetId) => ({ ticketId: found.value.id, assetId }))
		);
		if (!outcome.ok) {
			const { reason } = outcome.error;
			if (reason === 'forbidden') error(403, 'Forbidden');
			if (reason === 'empty') return rejected('linkAssets', m.related_link_nothing_selected());
			if (reason === 'ticket_not_found') {
				return rejected('linkAssets', m.related_link_ticket_gone());
			}
			return rejected('linkAssets', m.related_link_asset_unavailable(), outcome.error.id);
		}
		return { action: 'linkAssets' as const, linked: outcome.value.linked };
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
