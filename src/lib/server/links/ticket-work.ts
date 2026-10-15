import { and, eq } from 'drizzle-orm';
import { actorColumns, recordActivity } from '../activity';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb, type Transaction } from '../db';
import { findProjectInScope, findTaskInScope, projectSnapshot, taskSnapshot } from '../projects';
import { failure, success, type Outcome } from '../shared/outcome';
import { ticketInOrganisation } from './ticket-asset';
import { ticketProject, ticketTask } from './schema';

/**
 * Relating a ticket to the work that resolves it: a task (`resolved_in`) or a
 * whole project (`handled_in`). The same shape as `ticket-asset.ts`, because
 * these are the same kind of fact (ADR 0005): one join table per pair, activity
 * on the **ticket**, and the other side merges the live relation.
 *
 * **Nothing here writes the ticket row.** Linking is not a status change: a
 * ticket stays `in_progress` while its task is open and moves on its own terms.
 * The completion mail (#152) is a separate decision, not a side effect.
 *
 * **Linking twice is not an error.** An escalation form can be submitted twice,
 * and a second click must not turn into a failure page; `on conflict do nothing`
 * is also what keeps a duplicate from aborting the surrounding transaction.
 */

export interface TicketTaskPair {
	ticketId: string;
	taskId: string;
}

export interface TicketProjectPair {
	ticketId: string;
	projectId: string;
}

/** `created` is false when the pair was already there and nothing was written. */
export interface LinkResult {
	created: boolean;
}

export type LinkTaskFailure =
	'forbidden' | 'ticket_not_found' | 'task_not_found' | 'project_archived';
export type LinkProjectFailure =
	'forbidden' | 'ticket_not_found' | 'project_not_found' | 'project_archived';
export type UnlinkFailure = 'forbidden' | 'link_not_found';

/**
 * Links a task to a ticket. Takes the caller's transaction, so an escalation
 * can create the task and link it as one act.
 *
 * `tickets.manage` is checked here as well as in the route, as in `unlinkAsset`:
 * this is how context is added to a ticket and the API reaches it too.
 */
export async function linkTask(
	tx: Transaction,
	actor: SessionUser,
	pair: TicketTaskPair
): Promise<Outcome<LinkResult, LinkTaskFailure>> {
	if (!can(actor, 'tickets.manage')) return failure('forbidden');

	const ticket = await ticketInOrganisation(tx, actor, pair.ticketId);
	if (!ticket) return failure('ticket_not_found');

	const task = await findTaskInScope(tx, actor, pair.taskId);
	if (!task) return failure('task_not_found');
	if (task.projectArchived) return failure('project_archived');

	const inserted = await tx
		.insert(ticketTask)
		.values({
			organisationId: actor.organisationId,
			ticketId: ticket.id,
			taskId: task.id,
			createdByPersonId: actor.personId
		})
		.onConflictDoNothing({ target: [ticketTask.ticketId, ticketTask.taskId] })
		.returning({ id: ticketTask.id });

	if (inserted.length === 0) return success({ created: false });

	await recordActivity(tx, {
		organisationId: actor.organisationId,
		...actorColumns(actor),
		target: { ticketId: ticket.id },
		verb: 'link.task.added',
		payload: { taskId: task.id, taskTag: task.taskTag, taskTitle: task.title }
	});

	return success({ created: true });
}

export async function linkTicketToTask(
	actor: SessionUser,
	pair: TicketTaskPair
): Promise<Outcome<LinkResult, LinkTaskFailure>> {
	return getDb().transaction((tx) => linkTask(tx, actor, pair));
}

export async function linkProject(
	tx: Transaction,
	actor: SessionUser,
	pair: TicketProjectPair
): Promise<Outcome<LinkResult, LinkProjectFailure>> {
	if (!can(actor, 'tickets.manage')) return failure('forbidden');

	const ticket = await ticketInOrganisation(tx, actor, pair.ticketId);
	if (!ticket) return failure('ticket_not_found');

	const project = await findProjectInScope(tx, actor, pair.projectId);
	if (!project) return failure('project_not_found');
	if (project.archived) return failure('project_archived');

	const inserted = await tx
		.insert(ticketProject)
		.values({
			organisationId: actor.organisationId,
			ticketId: ticket.id,
			projectId: project.id,
			createdByPersonId: actor.personId
		})
		.onConflictDoNothing({ target: [ticketProject.ticketId, ticketProject.projectId] })
		.returning({ id: ticketProject.id });

	if (inserted.length === 0) return success({ created: false });

	await recordActivity(tx, {
		organisationId: actor.organisationId,
		...actorColumns(actor),
		target: { ticketId: ticket.id },
		verb: 'link.project.added',
		payload: { projectId: project.id, projectTag: project.projectTag, projectName: project.name }
	});

	return success({ created: true });
}

export async function linkTicketToProject(
	actor: SessionUser,
	pair: TicketProjectPair
): Promise<Outcome<LinkResult, LinkProjectFailure>> {
	return getDb().transaction((tx) => linkProject(tx, actor, pair));
}

/**
 * Undoes a link. Works on archived targets: the link belongs to `links`, and an
 * archived project is read-only for *its* data, not for who pointed at it.
 *
 * The snapshot is read before the row goes, so the entry names the task as it
 * was even after a rename (ADR 0009).
 */
export async function unlinkTask(
	actor: SessionUser,
	pair: TicketTaskPair
): Promise<Outcome<void, UnlinkFailure>> {
	if (!can(actor, 'tickets.manage')) return failure('forbidden');

	return getDb().transaction(async (tx) => {
		const [link] = await tx
			.select({ id: ticketTask.id })
			.from(ticketTask)
			.where(
				and(
					eq(ticketTask.organisationId, actor.organisationId),
					eq(ticketTask.ticketId, pair.ticketId),
					eq(ticketTask.taskId, pair.taskId)
				)
			)
			.limit(1);
		if (!link) return failure('link_not_found');

		const task = await taskSnapshot(tx, actor.organisationId, pair.taskId);
		if (!task) return failure('link_not_found');

		await tx.delete(ticketTask).where(eq(ticketTask.id, link.id));

		await recordActivity(tx, {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target: { ticketId: pair.ticketId },
			verb: 'link.task.removed',
			payload: { taskId: task.id, taskTag: task.taskTag, taskTitle: task.title }
		});

		return success(undefined);
	});
}

export async function unlinkProject(
	actor: SessionUser,
	pair: TicketProjectPair
): Promise<Outcome<void, UnlinkFailure>> {
	if (!can(actor, 'tickets.manage')) return failure('forbidden');

	return getDb().transaction(async (tx) => {
		const [link] = await tx
			.select({ id: ticketProject.id })
			.from(ticketProject)
			.where(
				and(
					eq(ticketProject.organisationId, actor.organisationId),
					eq(ticketProject.ticketId, pair.ticketId),
					eq(ticketProject.projectId, pair.projectId)
				)
			)
			.limit(1);
		if (!link) return failure('link_not_found');

		const project = await projectSnapshot(tx, actor.organisationId, pair.projectId);
		if (!project) return failure('link_not_found');

		await tx.delete(ticketProject).where(eq(ticketProject.id, link.id));

		await recordActivity(tx, {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target: { ticketId: pair.ticketId },
			verb: 'link.project.removed',
			payload: { projectId: project.id, projectTag: project.projectTag, projectName: project.name }
		});

		return success(undefined);
	});
}
