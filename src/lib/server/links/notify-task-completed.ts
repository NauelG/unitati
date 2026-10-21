import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { notify, sendLinkedTaskEmails, type PendingEmail } from '../notifications';
import type { DomainEvents } from '../shared/events';
import { assignedOpenTickets } from '../service-desk';
import type { Mailer } from '../shared/mail';
import { ticketTask } from './schema';

/**
 * The one listener of `task.completed` (#152, ADR 0024): tells the technicians
 * whose tickets the completed task was resolving, as `task.linked_completed`
 * notifications (#302).
 *
 * `projects` emits the fact without knowing tickets exist; this is the domain
 * allowed to hold the relation (ADR 0005), so the reaction lives here, and it is
 * the one notification that keeps ADR 0024's loss window (ADR 0040). Tickets are
 * read through `service-desk`'s exports, never its tables.
 *
 * One in-app row per ticket, written through `notify` in one transaction; one
 * mail per person, listing all their affected tickets. Tickets already
 * `resolved` or `closed`, or without an assignee, are skipped. Project links
 * never notify: only task completion does.
 */

export interface NotifyDeps {
	/** `null` when SMTP is not configured: nothing is mailed, the in-app rows are still written. */
	mailer: Mailer | null;
	/** The installation's public origin (ADR 0014: served at the root). */
	origin: string;
}

export async function notifyTaskCompleted(
	event: DomainEvents['task.completed'],
	{ mailer, origin }: NotifyDeps
): Promise<void> {
	const links = await getDb()
		.select({ ticketId: ticketTask.ticketId })
		.from(ticketTask)
		.where(eq(ticketTask.taskId, event.taskId));
	if (links.length === 0) return;

	const tickets = await assignedOpenTickets(
		event.organisationId,
		links.map((link) => link.ticketId)
	);
	if (tickets.length === 0) return;

	const emails = await getDb().transaction(async (tx) => {
		const pending: PendingEmail[] = [];
		for (const ticket of tickets) {
			pending.push(
				...(await notify(tx, {
					organisationId: event.organisationId,
					actorPersonId: event.actorPersonId,
					target: { ticketId: ticket.id },
					snapshot: {
						code: ticket.ticketTag,
						title: ticket.subject,
						summary: `${event.taskTag} ${event.taskTitle}`
					},
					recipients: [{ personId: ticket.assigneePersonId, type: 'task.linked_completed' }]
				}))
			);
		}
		return pending;
	});

	void sendLinkedTaskEmails(mailer, event, emails, origin);
}
