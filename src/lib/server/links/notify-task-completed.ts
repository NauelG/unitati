import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { contactsOf } from '../directory';
import type { DomainEvents } from '../shared/events';
import { assignedOpenTickets, sendQuietly, taskCompletedMail, type Mailer } from '../service-desk';
import { ticketTask } from './schema';

/**
 * The one listener of `task.completed` in the MVP (#152, ADR 0024): a mail to
 * the technicians whose tickets the completed task was resolving.
 *
 * `projects` emits the fact without knowing tickets exist; this is the domain
 * allowed to hold the relation (ADR 0005), so the reaction lives here. Tickets
 * are read through `service-desk`'s exports, never its tables.
 *
 * One mail per person, listing all their affected tickets. Tickets already
 * `resolved` or `closed`, without an assignee, or whose assignee has no
 * address, are skipped. Project links never mail: only task completion does.
 */

export interface NotifyDeps {
	/** `null` when SMTP is not configured: the handler is then a no-op. */
	mailer: Mailer | null;
	/** The installation's public origin (ADR 0014: served at the root), without a trailing slash. */
	origin: string;
}

export async function notifyTaskCompleted(
	event: DomainEvents['task.completed'],
	{ mailer, origin }: NotifyDeps
): Promise<void> {
	if (!mailer) return;

	const links = await getDb()
		.select({ ticketId: ticketTask.ticketId })
		.from(ticketTask)
		.where(eq(ticketTask.taskId, event.taskId));
	if (links.length === 0) return;

	const tickets = await assignedOpenTickets(
		event.organisationId,
		links.map((link) => link.ticketId)
	);

	const byPerson = Map.groupBy(tickets, (ticket) => ticket.assigneePersonId);
	const contacts = await contactsOf(event.organisationId, [...byPerson.keys()]);
	const ticketLink = (ticketTag: string) =>
		`${origin.replace(/\/+$/, '')}/service-desk/${encodeURIComponent(ticketTag)}`;

	for (const contact of contacts) {
		if (!contact.email) {
			console.debug(`no mail about ${event.taskTag} to ${contact.fullName}: no email address`);
			continue;
		}

		void sendQuietly(mailer, {
			to: contact.email,
			...taskCompletedMail(event, byPerson.get(contact.id) ?? [], ticketLink)
		});
	}
}
