import { z } from 'zod';
import { PRIORITIES, TICKET_STATUSES } from '#lib/domain/status.js';
import { linkAssetToTicket, unlinkAsset } from '../../links';
import { resolveAssetTags } from '../../assets';
import {
	assignTicket,
	changeTicketStatus,
	createTicketInput,
	getWrittenTicket,
	createTicket,
	moveTicketToQueue,
	setTicketPriority,
	MAX_AFFECTED_ASSETS
} from '../../service-desk';
import type { ApiPrincipal } from '../keys';
import {
	ApiError,
	created,
	defineEndpoint,
	noContent,
	notFound,
	Reply,
	type Endpoint
} from '../registry';
import { refusal } from './refusals';
import { ticketSchema, toWire } from './tickets';

/**
 * Opening a ticket and every staff transition (ADR 0022). Each handler maps the
 * body onto one domain function and its typed failure onto the envelope; the
 * rules, including who may do what, stay in the domain.
 */

const MANAGE = ['tickets.manage'] as const;

/**
 * Naming the assets a ticket is about is part of `tickets.create` and
 * `tickets.manage`, so a key holding either does not also need a separate asset
 * scope to do it. The principal's *role* still decides what it may see:
 * `can()` intersects, so this adds the asset-read scopes and never a permission
 * the owner lacks. It touches nothing else, so `tickets.manage` stays absent
 * from a create-only key and the requester stays its own.
 */
const ASSET_READS = ['assets.view', 'assets.view.own', 'assets.view.shared'] as const;

function withAssetReads(principal: ApiPrincipal): ApiPrincipal {
	return { ...principal, scopes: [...new Set([...principal.scopes, ...ASSET_READS])] };
}
const tag = z.string().min(1);
const ticketResponse = z.object({ data: ticketSchema });

/** The ticket after a write, in the wire shape. The write has already succeeded, so a miss is a bug, not a 404. */
async function written(principal: ApiPrincipal, ticketTag: string) {
	const outcome = await getWrittenTicket(principal, ticketTag);
	if (!outcome.ok) throw new Error(`Ticket ${ticketTag} vanished after a write.`);
	return { data: toWire(outcome.value) };
}

export const createTicketEndpoint = defineEndpoint({
	id: 'tickets.create',
	method: 'POST',
	path: '/tickets',
	summary: 'Open a ticket. Staff may name the requester; everybody else is their own.',
	description:
		"Opens a ticket in a queue and answers `201` with the ticket and a `Location` header. Staff holding `tickets.manage` may set `requesterPersonId`; for everybody else the requester is the key's owner. `assetTags` names the affected assets as the caller sees them; an unknown or invisible tag is a `400` on `assetTags.<n>`.",
	example: {
		subject: 'Printer on floor 2 is offline',
		body: 'It stopped printing this morning.',
		queueId: '00000000-0000-4000-8000-000000000000',
		priority: 'normal',
		assetTags: ['AST-0001']
	},
	status: 201,
	permissions: ['tickets.create'],
	input: createTicketInput.omit({ assetIds: true }).extend({
		assetTags: z.array(z.string().min(1)).max(MAX_AFFECTED_ASSETS).optional()
	}),
	output: ticketResponse,
	handler: async ({ principal, input }) => {
		const actor = withAssetReads(principal);
		const tags = [...new Set(input.assetTags ?? [])];
		const resolved = await resolveAssetTags(actor, tags);

		// Index in what the caller sent, so the issue points at the element to fix.
		const issues = (input.assetTags ?? []).flatMap((assetTag, index) =>
			resolved.has(assetTag) ? [] : [{ path: ['assetTags', index], message: 'Asset not found.' }]
		);
		if (issues.length > 0) {
			throw new ApiError(400, 'invalid_input', 'The request is not valid.', issues);
		}

		const outcome = await createTicket(actor, {
			subject: input.subject,
			body: input.body,
			queueId: input.queueId,
			priority: input.priority,
			requesterPersonId: input.requesterPersonId,
			assetIds: tags.map((assetTag) => resolved.get(assetTag)!)
		});
		if (!outcome.ok) throw refusal(outcome.error);

		return created(
			await written(principal, outcome.value.ticketTag),
			`/tickets/${outcome.value.ticketTag}`
		);
	}
});

export const changeStatusEndpoint = defineEndpoint({
	id: 'tickets.status',
	method: 'POST',
	path: '/tickets/{tag}/status',
	summary: 'Move a ticket to another status, if the lifecycle allows it.',
	description:
		'Moves the ticket to another status. An illegal transition is a `409` with `code: "invalid_transition"`.',
	example: { status: 'in_progress' },
	permissions: MANAGE,
	input: z.object({ tag, status: z.enum(TICKET_STATUSES) }),
	output: ticketResponse,
	handler: async ({ principal, input }) => {
		const outcome = await changeTicketStatus(principal, input.tag, input.status);
		if (!outcome.ok) throw refusal(outcome.error);
		return written(principal, input.tag);
	}
});

export const setPriorityEndpoint = defineEndpoint({
	id: 'tickets.priority',
	method: 'POST',
	path: '/tickets/{tag}/priority',
	summary: 'Set the priority of a ticket.',
	description: "Sets the ticket's priority and records the change in its history.",
	example: { priority: 'high' },
	permissions: MANAGE,
	input: z.object({ tag, priority: z.enum(PRIORITIES) }),
	output: ticketResponse,
	handler: async ({ principal, input }) => {
		const outcome = await setTicketPriority(principal, input.tag, input.priority);
		if (!outcome.ok) throw refusal(outcome.error);
		return written(principal, input.tag);
	}
});

export const assignTicketEndpoint = defineEndpoint({
	id: 'tickets.assign',
	method: 'POST',
	path: '/tickets/{tag}/assignee',
	summary: 'Assign a ticket to a person, or unassign it with a null personId.',
	description: 'Assigns the ticket to a person, or unassigns it when `personId` is `null`.',
	example: { personId: '00000000-0000-4000-8000-000000000000' },
	permissions: MANAGE,
	input: z.object({ tag, personId: z.uuid().nullable() }),
	output: ticketResponse,
	handler: async ({ principal, input }) => {
		const outcome = await assignTicket(principal, input.tag, input.personId);
		if (!outcome.ok) throw refusal(outcome.error);
		return written(principal, input.tag);
	}
});

export const moveQueueEndpoint = defineEndpoint({
	id: 'tickets.queue',
	method: 'POST',
	path: '/tickets/{tag}/queue',
	summary: 'Move a ticket to another queue.',
	description: 'Moves the ticket to another queue. List the available queues with `queues.list`.',
	example: { queueId: '00000000-0000-4000-8000-000000000000' },
	permissions: MANAGE,
	input: z.object({ tag, queueId: z.uuid() }),
	output: ticketResponse,
	handler: async ({ principal, input }) => {
		const outcome = await moveTicketToQueue(principal, input.tag, input.queueId);
		if (!outcome.ok) throw refusal(outcome.error);
		return written(principal, input.tag);
	}
});

/** The ticket and asset addressed by tag, as the caller may see them; anything else is a `404`. */
async function pairOf(actor: ApiPrincipal, ticketTag: string, assetTag: string) {
	const ticket = await getWrittenTicket(actor, ticketTag);
	const assets = await resolveAssetTags(actor, [assetTag]);
	const assetId = assets.get(assetTag);
	if (!ticket.ok || !assetId) throw notFound();
	return { ticketId: ticket.value.id, assetId };
}

export const linkAssetEndpoint = defineEndpoint({
	id: 'tickets.assets.link',
	method: 'POST',
	path: '/tickets/{tag}/assets',
	summary: 'Link an asset to a ticket. Linking one that is already linked is a no-op.',
	description:
		"Links an asset, addressed by its tag, to the ticket. Answers `201` when the link is new and `200` when it already existed. Naming assets is part of the ticket scopes: no separate `assets.*` scope is needed, but the key's owner must be able to see the asset.",
	example: { assetTag: 'AST-0001' },
	status: 201,
	permissions: MANAGE,
	input: z.object({ tag, assetTag: z.string().min(1) }),
	output: z.object({ data: z.object({ ticket: z.string(), assetTag: z.string() }) }),
	handler: async ({ principal, input }) => {
		const actor = withAssetReads(principal);
		const pair = await pairOf(actor, input.tag, input.assetTag);
		const outcome = await linkAssetToTicket(actor, pair);
		const body = { data: { ticket: input.tag, assetTag: input.assetTag } };

		if (outcome.ok) return created(body, `/tickets/${input.tag}`);
		// Idempotent: the asked-for state already holds.
		if (outcome.error === 'already_linked') return new Reply(200, body);
		throw refusal(outcome.error);
	}
});

export const unlinkAssetEndpoint = defineEndpoint({
	id: 'tickets.assets.unlink',
	method: 'DELETE',
	path: '/tickets/{tag}/assets/{assetTag}',
	summary: 'Unlink an asset from a ticket.',
	description:
		'Removes the link between the ticket and the asset. Answers `204` with no body; an asset that is not linked is a `404`.',
	permissions: MANAGE,
	input: z.object({ tag, assetTag: z.string().min(1) }),
	output: z.null(),
	handler: async ({ principal, input }) => {
		const actor = withAssetReads(principal);
		const pair = await pairOf(actor, input.tag, input.assetTag);
		const outcome = await unlinkAsset(actor, pair);
		if (!outcome.ok) throw refusal(outcome.error);
		return noContent();
	}
});

export const TICKET_ACTION_ENDPOINTS: readonly Endpoint[] = [
	createTicketEndpoint,
	changeStatusEndpoint,
	setPriorityEndpoint,
	assignTicketEndpoint,
	moveQueueEndpoint,
	linkAssetEndpoint,
	unlinkAssetEndpoint
];
