import { z } from 'zod';
import { PRIORITIES } from '#lib/domain/status.js';
import { projectHref, taskHref } from '#lib/domain/routes.js';
import {
	escalateTicket,
	relatedTo,
	unlinkProject,
	unlinkTask,
	type EscalateFailure,
	type EscalationTarget,
	type RelatedGroup,
	type RelatedItem,
	type RelationName,
	type UnlinkFailure
} from '../../links';
import { getProject, getTask, readsProjects } from '../../projects';
import { getTicketByTag, getWrittenTicket } from '../../service-desk';
import type { ApiPrincipal } from '../keys';
import {
	created,
	defineEndpoint,
	noContent,
	notFound,
	refusalTable,
	Reply,
	type Endpoint
} from '../registry';
import { named } from '../shared-schemas';

/**
 * Turning a ticket into work, and reading it back (ADR 0022, #153). The
 * endpoints are an adapter over `links`: they resolve the tags a caller sends
 * into ids, call the domain function, and map its typed failure onto the
 * envelope. Who may do what, and what a viewer may see of the other side, stay
 * in the domain.
 */

const MANAGE = ['tickets.manage'] as const;
const TICKET_READS = ['tickets.view', 'tickets.view.own'] as const;
const PROJECT_READS = ['projects.view', 'projects.view.assigned'] as const;

/**
 * Naming the task or project a ticket is escalated to is part of
 * `tickets.manage`, as naming an asset is (`ticket-actions.ts`): a key holding
 * it does not also need a separate `projects.view`. The principal's *role* still
 * decides what it may see, because `can()` intersects, so this adds the read
 * scopes and never `projects.manage`: a key narrowed to `tickets.manage` may
 * relate work, not conjure it.
 */
function withProjectReads(principal: ApiPrincipal): ApiPrincipal {
	return { ...principal, scopes: [...new Set([...principal.scopes, ...PROJECT_READS])] };
}

const tag = z.string().min(1);

/** How the API answers each failure of the escalate and unlink use cases (ADR 0047). */
const escalateRefusals = refusalTable<EscalateFailure>({
	// An act the key may not do and a record it may not see are one answer (ADR 0007).
	forbidden: { as: 'not_found' },
	ticket_not_found: { as: 'not_found' },
	task_not_found: { as: 'not_found' },
	project_not_found: { as: 'not_found' },
	project_archived: { as: 'conflict' },
	// The `new_*` targets also need `projects.manage` on the key.
	forbidden_create: { as: 'forbidden' },
	invalid_input: { as: 'unprocessable' }
});

const unlinkRefusals = refusalTable<UnlinkFailure>({
	forbidden: { as: 'not_found' },
	link_not_found: { as: 'not_found' }
});

/* -------------------------------------------------------------------------- */
/* Tags to ids                                                                */
/* -------------------------------------------------------------------------- */

async function ticketIdOf(actor: ApiPrincipal, ticketTag: string): Promise<string> {
	const ticket = await getWrittenTicket(actor, ticketTag);
	if (!ticket.ok) throw notFound();
	return ticket.value.id;
}

/** The task as the caller may see it; anything else, including a role that reads no projects, is a `404`. */
async function taskIdOf(actor: ApiPrincipal, taskTag: string): Promise<string> {
	if (!readsProjects(actor)) throw notFound();
	const task = await getTask(actor, taskTag);
	if (!task.ok) throw notFound();
	return task.value.id;
}

async function projectIdOf(actor: ApiPrincipal, projectTag: string): Promise<string> {
	if (!readsProjects(actor)) throw notFound();
	const project = await getProject(actor, projectTag);
	if (!project.ok) throw notFound();
	return project.value.id;
}

/* -------------------------------------------------------------------------- */
/* Escalation                                                                 */
/* -------------------------------------------------------------------------- */

const escalationInput = z.discriminatedUnion('target', [
	z.object({ tag, target: z.literal('existing_task'), taskTag: tag }),
	z.object({
		tag,
		target: z.literal('new_task'),
		projectTag: tag,
		// Not `min(1)`: an empty title is the domain's refusal (`422`), not a malformed body.
		title: z.string(),
		description: z.string().nullish()
	}),
	z.object({ tag, target: z.literal('existing_project'), projectTag: tag }),
	z.object({
		tag,
		target: z.literal('new_project'),
		name: z.string(),
		ownerPersonId: z.uuid().nullish()
	})
]);

const escalationResponse = z.object({
	data: named(
		'Escalation',
		z.object({
			kind: z.enum(['task', 'project']),
			tag: z.string(),
			href: z.string()
		})
	)
});

type EscalationInput = z.output<typeof escalationInput>;

/** The body's tags as the ids the domain wants. */
async function targetOf(actor: ApiPrincipal, input: EscalationInput): Promise<EscalationTarget> {
	switch (input.target) {
		case 'existing_task':
			return { kind: 'existing_task', taskId: await taskIdOf(actor, input.taskTag) };
		case 'existing_project':
			return { kind: 'existing_project', projectId: await projectIdOf(actor, input.projectTag) };
		case 'new_task':
			return {
				kind: 'new_task',
				projectId: await projectIdOf(actor, input.projectTag),
				title: input.title,
				description: input.description ?? null
			};
		case 'new_project':
			return { kind: 'new_project', name: input.name, ownerPersonId: input.ownerPersonId ?? null };
	}
}

export const escalateEndpoint = defineEndpoint({
	id: 'tickets.escalate',
	method: 'POST',
	path: '/tickets/{tag}/escalations',
	summary: 'Escalate a ticket to a task or a project, existing or new.',
	description:
		'Links the ticket to the work that resolves it, or creates that work and links it, as one act. `target` picks the shape of the body: `existing_task` (`taskTag`), `new_task` (`projectTag`, `title`, optional `description`), `existing_project` (`projectTag`) or `new_project` (`name`, optional `ownerPersonId`). Everything is addressed by tag. Answers `201` when something was created or linked and `200`, with the same body, when the ticket was already linked to that task or project and nothing was written. The `new_*` targets also need `projects.manage` on the key. Any ticket status can be escalated.',
	example: { target: 'new_task', projectTag: 'PRJ-0003', title: 'Replace the printer' },
	status: 201,
	permissions: MANAGE,
	refusalTable: escalateRefusals,
	input: escalationInput,
	output: escalationResponse,
	handler: async ({ principal, input, refuse }) => {
		const actor = withProjectReads(principal);
		const ticketId = await ticketIdOf(actor, input.tag);
		const target = await targetOf(actor, input);

		const outcome = await escalateTicket(actor, ticketId, target);
		if (!outcome.ok) throw refuse(outcome.error);

		const { kind, tag: workTag } = outcome.value;
		const body = {
			data: {
				kind,
				tag: workTag,
				href: kind === 'task' ? taskHref(workTag) : projectHref(workTag)
			}
		};

		// Idempotent: the asked-for state already held.
		if (!outcome.value.created) return new Reply(200, body);
		return created(body, `/tickets/${input.tag}`);
	}
});

/* -------------------------------------------------------------------------- */
/* Unlinking                                                                  */
/* -------------------------------------------------------------------------- */

export const unlinkTaskEndpoint = defineEndpoint({
	id: 'tickets.task.unlink',
	method: 'DELETE',
	path: '/tickets/{tag}/tasks/{taskTag}',
	summary: 'Unlink a task from a ticket.',
	description:
		'Removes the link between the ticket and the task. Answers `204` with no body; a task that is not linked is a `404`. The task itself is untouched.',
	permissions: MANAGE,
	refusalTable: unlinkRefusals,
	input: z.object({ tag, taskTag: tag }),
	output: z.null(),
	handler: async ({ principal, input, refuse }) => {
		const actor = withProjectReads(principal);
		const pair = {
			ticketId: await ticketIdOf(actor, input.tag),
			taskId: await taskIdOf(actor, input.taskTag)
		};
		const outcome = await unlinkTask(actor, pair);
		if (!outcome.ok) throw refuse(outcome.error);
		return noContent();
	}
});

export const unlinkProjectEndpoint = defineEndpoint({
	id: 'tickets.project.unlink',
	method: 'DELETE',
	path: '/tickets/{tag}/projects/{projectTag}',
	summary: 'Unlink a project from a ticket.',
	description:
		'Removes the link between the ticket and the project. Answers `204` with no body; a project that is not linked is a `404`. The project itself is untouched.',
	permissions: MANAGE,
	refusalTable: unlinkRefusals,
	input: z.object({ tag, projectTag: tag }),
	output: z.null(),
	handler: async ({ principal, input, refuse }) => {
		const actor = withProjectReads(principal);
		const pair = {
			ticketId: await ticketIdOf(actor, input.tag),
			projectId: await projectIdOf(actor, input.projectTag)
		};
		const outcome = await unlinkProject(actor, pair);
		if (!outcome.ok) throw refuse(outcome.error);
		return noContent();
	}
});

/* -------------------------------------------------------------------------- */
/* Reading the relations                                                      */
/* -------------------------------------------------------------------------- */

const taskStatus = z.object({ group: z.string(), name: z.string() });
const projectStatus = z.object({
	archived: z.boolean(),
	progress: z
		.object({ counts: z.record(z.string(), z.number()), total: z.number(), ratio: z.number() })
		.nullable()
});

const relatedItemSchema = named(
	'RelatedRecord',
	z.object({
		kind: z.enum(['ticket', 'task', 'project']),
		tag: z.string(),
		title: z.string(),
		href: z.string().nullable(),
		/** A ticket's status, a task's `{ group, name }`, or a project's `{ archived, progress }`. */
		status: z.union([z.string(), taskStatus, projectStatus]),
		priority: z.enum(PRIORITIES).optional(),
		assignee: z.string().nullable().optional(),
		/** On `resolves_via_tasks`: the task of the project through which the ticket got there. */
		via: z
			.object({
				tag: z.string(),
				title: z.string(),
				href: z.string().nullable(),
				status: taskStatus
			})
			.optional(),
		linkedAt: z.iso.datetime()
	})
);

const relatedResponse = z.object({
	data: z.array(
		z.object({
			relation: z.enum([
				'affects',
				'affected_by',
				'resolved_in',
				'handled_in',
				'resolves',
				'handles',
				'resolves_via_tasks'
			]),
			items: z.array(relatedItemSchema),
			/** Tasks or projects of this group the key cannot see: a count, never a code or a title (ADR 0042). */
			restricted: z.number().int().min(0)
		})
	)
});

/** What this API answers for: handovers (#279) and pages (#327, API exposure is #234) have no wire shape yet. */
type WireItem = Exclude<RelatedItem, { ref: { kind: 'handover' | 'page' } }>;
type WireRelation = Exclude<
	RelationName,
	'fulfilled_by' | 'fulfils' | 'cites' | 'cited_by' | 'documented_by' | 'documents'
>;

function itemToWire(item: WireItem): z.input<typeof relatedItemSchema> {
	return {
		kind: item.ref.kind === 'asset' ? 'ticket' : item.ref.kind,
		tag: item.ref.tag,
		title: item.ref.title,
		href: item.ref.href,
		status: item.status,
		...('priority' in item && item.priority ? { priority: item.priority } : {}),
		...('assignee' in item && item.assignee !== undefined ? { assignee: item.assignee } : {}),
		...(item.via
			? {
					via: {
						tag: item.via.tag,
						title: item.via.title,
						href: item.via.href,
						status: item.via.status
					}
				}
			: {}),
		linkedAt: item.linkedAt.toISOString()
	};
}

/** Only the groups the endpoint answers for: `relatedTo` also reports the asset side of a ticket. */
function groupsToWire(groups: readonly RelatedGroup[], relations: readonly WireRelation[]) {
	return {
		data: groups.flatMap((group) =>
			(relations as readonly RelationName[]).includes(group.relation)
				? [
						{
							relation: group.relation as WireRelation,
							items: group.items
								.filter(
									(item): item is WireItem =>
										item.ref.kind !== 'handover' && item.ref.kind !== 'page'
								)
								.map(itemToWire),
							restricted: group.restricted ?? 0
						}
					]
				: []
		)
	};
}

export const ticketWorkEndpoint = defineEndpoint({
	id: 'tickets.work.list',
	method: 'GET',
	path: '/tickets/{tag}/work',
	summary: 'List the tasks and projects a ticket was escalated to.',
	description:
		"Returns the groups `resolved_in` (tasks) and `handled_in` (projects), each with the item's status as it is today. Work the key cannot see (outside its scope, or in a members-only project it is not a member of) is not listed: each group carries only `restricted`, how many such records there are. A ticket the key cannot see is a `404`.",
	permissions: TICKET_READS,
	input: z.object({ tag }),
	output: relatedResponse,
	handler: async ({ principal, input }) => {
		// Seeing the work of a ticket is part of reading it; the role still decides what.
		const actor = withProjectReads(principal);
		const ticket = await getTicketByTag(actor, input.tag);
		if (!ticket.ok) throw notFound();

		const groups = await relatedTo(actor, { kind: 'ticket', id: ticket.value.id });
		return groupsToWire(groups, ['resolved_in', 'handled_in']);
	}
});

export const taskTicketsEndpoint = defineEndpoint({
	id: 'tasks.tickets.list',
	method: 'GET',
	path: '/tasks/{taskTag}/tickets',
	summary: 'List the tickets a task resolves.',
	description:
		'Returns the group `resolves`: the tickets escalated to the task that the key can see. Needs a project-read scope to find the task and `tickets.view` to see its tickets. A task the key cannot see is a `404`.',
	permissions: PROJECT_READS,
	input: z.object({ taskTag: tag }),
	output: relatedResponse,
	handler: async ({ principal, input }) => {
		const taskId = await taskIdOf(principal, input.taskTag);
		const groups = await relatedTo(principal, { kind: 'task', id: taskId });
		return groupsToWire(groups, ['resolves']);
	}
});

export const projectTicketsEndpoint = defineEndpoint({
	id: 'projects.tickets.list',
	method: 'GET',
	path: '/projects/{projectTag}/tickets',
	summary: 'List the tickets a project handles.',
	description:
		'Returns `handles` (tickets linked to the project itself) and `resolves_via_tasks` (tickets linked to one of its tasks, each naming that task). Needs a project-read scope to find the project and `tickets.view` to see its tickets. A project the key cannot see is a `404`.',
	permissions: PROJECT_READS,
	input: z.object({ projectTag: tag }),
	output: relatedResponse,
	handler: async ({ principal, input }) => {
		const projectId = await projectIdOf(principal, input.projectTag);
		const groups = await relatedTo(principal, { kind: 'project', id: projectId });
		return groupsToWire(groups, ['handles', 'resolves_via_tasks']);
	}
});

export const TICKET_WORK_ENDPOINTS: readonly Endpoint[] = [
	escalateEndpoint,
	ticketWorkEndpoint,
	unlinkTaskEndpoint,
	unlinkProjectEndpoint,
	taskTicketsEndpoint,
	projectTicketsEndpoint
];
