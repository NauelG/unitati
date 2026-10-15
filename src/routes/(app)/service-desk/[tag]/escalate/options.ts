import { error } from '@sveltejs/kit';
import { m } from '#lib/paraglide/messages.js';
import type { SessionUser } from '#lib/server/auth/guards.js';
import { projectChoices, taskChoices } from '#lib/server/links/index.js';
import { getTicketByTag } from '#lib/server/service-desk/index.js';

/**
 * The options the escalation Sheet's pickers ask for as the user types: `{ value,
 * label, disabled }`, the shape `SearchSelectField` reads. Every label leads
 * with the record's code (the Sheet reads it back to name the button), and a
 * record this ticket is already linked to is offered but cannot be chosen.
 */

async function ticketIdOf(user: SessionUser, tag: string): Promise<string> {
	const ticket = await getTicketByTag(user, tag);
	if (!ticket.ok) error(404, 'Not found');
	return ticket.value.id;
}

export async function taskOptions(user: SessionUser, tag: string, term: string) {
	const choices = await taskChoices(user, await ticketIdOf(user, tag), term);

	return choices.map((task) => ({
		value: task.id,
		tag: task.taskTag,
		title: task.title,
		label: [
			task.taskTag,
			task.title,
			task.projectTag,
			task.stateName,
			...(task.linked ? [m.escalate_already_linked_task()] : [])
		].join(' · '),
		disabled: task.linked
	}));
}

/** `refuseLinked`: the project a ticket already points at cannot be linked twice, but can take a new task. */
export async function projectOptions(
	user: SessionUser,
	tag: string,
	term: string,
	refuseLinked: boolean
) {
	const choices = await projectChoices(user, await ticketIdOf(user, tag), term);

	return choices.map((project) => {
		const blocked = refuseLinked && project.linked;
		return {
			value: project.id,
			tag: project.projectTag,
			title: project.name,
			label: [
				project.projectTag,
				project.name,
				...(blocked ? [m.escalate_already_linked_project()] : [])
			].join(' · '),
			disabled: blocked
		};
	});
}
