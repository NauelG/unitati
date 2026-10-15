import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb, type Transaction } from '../db';
import {
	createProjectInput,
	createTaskInput,
	openProject,
	openTask,
	projectSnapshot,
	taskSnapshot
} from '../projects';
import { failure, success, type Outcome } from '../shared/outcome';
import { ticketInOrganisation } from './ticket-asset';
import { linkProject, linkTask } from './ticket-work';

/**
 * Turning a ticket into work: link it to a task or a project that exists, or
 * create one and link it, as one act (#149).
 *
 * An escalation is a link plus, sometimes, a record that did not exist before.
 * That is why there is no `ticket.escalated` verb: `link.task.added` on the
 * ticket and `task.created` on the task already say it, each by its own domain.
 *
 * **Any ticket status can be escalated**, `resolved` and `closed` included: the
 * follow-up work a finished ticket uncovers is exactly when someone reaches for
 * this. And the ticket row is never written.
 */

export type EscalationTarget =
	| { kind: 'existing_task'; taskId: string }
	| { kind: 'new_task'; projectId: string; title: string; description: string | null }
	| { kind: 'existing_project'; projectId: string }
	| { kind: 'new_project'; name: string; ownerPersonId: string | null };

export type EscalateFailure =
	| 'forbidden'
	| 'ticket_not_found'
	| 'task_not_found'
	| 'project_not_found'
	| 'project_archived'
	| 'forbidden_create'
	| 'invalid_input';

export interface Escalated {
	kind: 'task' | 'project';
	id: string;
	tag: string;
}

/**
 * Thrown inside the transaction to undo what was created when the link that
 * follows cannot be made: an `Outcome` would commit the new record with no
 * ticket pointing at it.
 */
class Abort extends Error {
	constructor(readonly reason: EscalateFailure) {
		super(reason);
	}
}

const isNew = (target: EscalationTarget) =>
	target.kind === 'new_task' || target.kind === 'new_project';

async function run(
	tx: Transaction,
	actor: SessionUser,
	ticketId: string,
	target: EscalationTarget
): Promise<Outcome<Escalated, EscalateFailure>> {
	const ticket = await ticketInOrganisation(tx, actor, ticketId);
	if (!ticket) return failure('ticket_not_found');

	switch (target.kind) {
		case 'existing_task': {
			const linked = await linkTask(tx, actor, { ticketId, taskId: target.taskId });
			if (!linked.ok) return failure(linked.error);
			const task = await taskSnapshot(tx, actor.organisationId, target.taskId);
			return success({ kind: 'task', id: target.taskId, tag: task!.taskTag });
		}

		case 'existing_project': {
			const linked = await linkProject(tx, actor, { ticketId, projectId: target.projectId });
			if (!linked.ok) return failure(linked.error);
			const project = await projectSnapshot(tx, actor.organisationId, target.projectId);
			return success({ kind: 'project', id: target.projectId, tag: project!.projectTag });
		}

		case 'new_task': {
			const values = createTaskInput.safeParse({
				title: target.title,
				description: target.description
			});
			if (!values.success) return failure('invalid_input');

			const opened = await openTask(tx, actor, target.projectId, values.data);
			if (!opened.ok) {
				return failure(
					opened.error === 'state_not_found' || opened.error === 'duplicate_task_tag'
						? 'invalid_input'
						: opened.error
				);
			}

			const linked = await linkTask(tx, actor, { ticketId, taskId: opened.value.id });
			if (!linked.ok) throw new Abort(linked.error);

			return success({ kind: 'task', id: opened.value.id, tag: opened.value.taskTag });
		}

		case 'new_project': {
			const values = createProjectInput.safeParse({
				name: target.name,
				ownerPersonId: target.ownerPersonId
			});
			if (!values.success) return failure('invalid_input');

			const opened = await openProject(tx, actor, values.data);
			if (!opened.ok) return failure('invalid_input');

			const linked = await linkProject(tx, actor, { ticketId, projectId: opened.value.id });
			if (!linked.ok) throw new Abort(linked.error);

			return success({ kind: 'project', id: opened.value.id, tag: opened.value.projectTag });
		}
	}
}

export async function escalateTicket(
	actor: SessionUser,
	ticketId: string,
	target: EscalationTarget
): Promise<Outcome<Escalated, EscalateFailure>> {
	if (!can(actor, 'tickets.manage')) return failure('forbidden');
	// Creating is the projects domain's capability, held in addition to the
	// ticket's: a key narrowed to `tickets.manage` may relate work, not conjure it.
	if (isNew(target) && !can(actor, 'projects.manage')) return failure('forbidden_create');

	try {
		return await getDb().transaction((tx) => run(tx, actor, ticketId, target));
	} catch (error) {
		if (error instanceof Abort) return failure(error.reason);
		throw error;
	}
}
