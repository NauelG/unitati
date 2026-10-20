/* The three most austere strings that do the job. Templates and signature are #19. */

export interface TicketMention {
	ticketTag: string;
	subject: string;
}

export function newReplyMail(ticket: TicketMention, link: string) {
	return {
		subject: `[${ticket.ticketTag}] ${ticket.subject}`,
		text: `Tienes una nueva respuesta en tu solicitud ${ticket.ticketTag}: ${ticket.subject}\n\n${link}`
	};
}

export function resolvedMail(ticket: TicketMention, link: string) {
	return {
		subject: `[${ticket.ticketTag}] Resuelta: ${ticket.subject}`,
		text: `Tu solicitud ${ticket.ticketTag} se ha marcado como resuelta: ${ticket.subject}\n\n${link}`
	};
}

/**
 * To the technician whose tickets a completed task resolves (#152). It states
 * the fact and hands the decision back: nothing about the ticket has changed.
 * `ticketLink` builds the absolute URL of a ticket from its tag.
 */
export function taskCompletedMail(
	task: { taskTag: string; taskTitle: string; toStateName: string },
	tickets: TicketMention[],
	ticketLink: (ticketTag: string) => string
) {
	const list = tickets
		.map((ticket) => `- ${ticket.ticketTag} ${ticket.subject}: ${ticketLink(ticket.ticketTag)}`)
		.join('\n');

	return {
		subject: `[${task.taskTag}] Tarea completada: ${task.taskTitle}`,
		text: [
			`La tarea ${task.taskTag} «${task.taskTitle}» ha pasado a «${task.toStateName}».`,
			`Tickets tuyos que se resolvían en ella:\n${list}`,
			'El ticket no se ha modificado. Decide si está resuelto.'
		].join('\n\n')
	};
}
