import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { listDeliverableAssets } from '../assets';
import { listPeople, personLocation } from '../directory';
import { escalationDraft, relatedTo, requestedCategory } from '../links';
import { followState } from '../notifications';
import {
	getTicketByTag,
	listLabels,
	listQueues,
	nextStatuses,
	ticketLabelsOf,
	ticketThread,
	type ThreadItem
} from '../service-desk';
import { failure, success } from '../shared/outcome';
import { activePeople } from './choices';
import { timeSection } from './time';

type Queue = Awaited<ReturnType<typeof listQueues>>[number];
type LabelEntry = Awaited<ReturnType<typeof ticketLabelsOf>>[number];

/**
 * What the viewer may do on this ticket (ADR 0050 rule 4). Most acts are the ones
 * `tickets.manage` gates; the rest have a permission of their own. The domain's
 * writes stay the authority.
 */
export interface TicketMay {
	/** In-place edits of the subject. */
	editSubject: boolean;
	assign: boolean;
	moveToQueue: boolean;
	/** Applying and removing labels (ADR 0053). Seeing them needs only `tickets.view`. */
	setLabels: boolean;
	setPriority: boolean;
	/** Moving the ticket on: needs `tickets.manage` and a status to go to. */
	changeStatus: boolean;
	/** Linking assets and linking or citing the rest of the relations. */
	link: boolean;
	unlink: boolean;
	citePage: boolean;
	linkHandover: boolean;
	/** Handing equipment over for this ticket (#279): `tickets.manage` and `assets.checkout`. */
	deliver: boolean;
	commentInternal: boolean;
	escalate: boolean;
	/** Creating the project or task the escalation lands on. */
	escalateCreate: boolean;
}

/** Picker data. Each list is empty unless the act it serves is allowed (ADR 0050 rule 5). */
export interface TicketChoices {
	queues: { id: string; name: string; color: Queue['color'] }[];
	/** What the label editor offers: the active catalogue, plus the archived labels already on the ticket so they can be removed. */
	labels: LabelEntry[];
	/** Active people: the assignee picker. */
	people: { id: string; fullName: string }[];
	/** A short list of in-stock assets to start a delivery from; the dialog filters the rest. */
	inStockForRequest: { assetTag: string; name: string }[];
}

/** The opening message is the thread's first comment: there is no `description` column. */
function firstMessage(thread: ThreadItem[]): string | null {
	const first = thread.find((item) => item.kind === 'comment');
	return first?.kind === 'comment' ? first.body : null;
}

export async function ticketScreen(viewer: SessionUser, ticketTag: string) {
	if (!can(viewer, 'tickets.view')) return failure('not_found');

	const found = await getTicketByTag(viewer, ticketTag);
	if (!found.ok) return failure('not_found');
	const ticket = found.value;
	const thread = await ticketThread(viewer, ticketTag);
	if (!thread.ok) return failure('not_found');

	const manages = can(viewer, 'tickets.manage');
	const nextStatusList = nextStatuses(ticket.status);
	const may: TicketMay = {
		editSubject: manages,
		assign: manages,
		moveToQueue: manages,
		setLabels: manages,
		setPriority: manages,
		changeStatus: manages && nextStatusList.length > 0,
		link: manages,
		unlink: manages,
		citePage: manages,
		linkHandover: manages,
		deliver: manages && can(viewer, 'assets.checkout'),
		commentInternal: can(viewer, 'tickets.comment.internal'),
		escalate: manages,
		escalateCreate: manages && can(viewer, 'projects.manage')
	};

	const [labels, [queues, people, catalogue]] = await Promise.all([
		ticketLabelsOf(viewer.organisationId, ticket.id),
		manages
			? Promise.all([listQueues(viewer), listPeople(viewer.organisationId), listLabels(viewer)])
			: [[], [], []]
	]);
	const onTicket = new Set(labels.map((label) => label.id));

	// Staff only (#176, ADR 0007): for anyone else the value is never read.
	const requesterLocation = can(viewer, 'people.view')
		? await personLocation(viewer.organisationId, ticket.requesterPersonId)
		: undefined;

	// What an equipment request asked for, and the stock that could answer it (#271).
	const requested = ticket.requestFormId
		? await requestedCategory(viewer.organisationId, ticket.id)
		: null;
	const inStock =
		may.deliver && requested
			? await listDeliverableAssets(viewer.organisationId, undefined, { categoryId: requested.id })
			: [];

	const choices: TicketChoices = {
		queues: queues.map(({ id, name, color }) => ({ id, name, color })),
		labels: catalogue.filter((label) => label.active || onTicket.has(label.id)),
		people: activePeople(people),
		inStockForRequest: inStock.slice(0, 5).map(({ assetTag, name }) => ({ assetTag, name }))
	};

	return success({
		ticket,
		labels,
		may,
		choices,
		requestedCategory: requested,
		...(requesterLocation === undefined
			? {}
			: { requesterLocation: requesterLocation && { path: requesterLocation.path } }),
		nextStatuses: nextStatusList,
		// What the escalation Sheet starts from: only for someone who may escalate.
		escalationDraft: may.escalate
			? escalationDraft({ subject: ticket.subject, description: firstMessage(thread.value) })
			: null,
		time: await timeSection(viewer, { ticketId: ticket.id }, true),
		follow: await followState(viewer, { ticketId: ticket.id }),
		// Awaited: the thread is the page's point (#89's streaming note).
		thread: thread.value,
		// Unawaited (#89): the viewer reached this ticket through a scoped read, so what is
		// linked to it is read on that same footing; `relatedTo` scopes the other side of
		// each link. The whole of it: the constellation draws every relation, the panel lists them.
		related: relatedTo(viewer, { kind: 'ticket', id: ticket.id })
	});
}

export type TicketScreen = Extract<Awaited<ReturnType<typeof ticketScreen>>, { ok: true }>['value'];
