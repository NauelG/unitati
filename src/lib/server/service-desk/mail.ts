import { createTransport, type Transporter } from 'nodemailer';

/**
 * Outbound mail, degrading by design (ADR 0006): a failure to send is logged
 * and swallowed, never a reason for the action that triggered it to fail. The
 * comment is saved, the response returns, and mail is a courtesy on top.
 *
 * Fire-and-forget after commit. There is deliberately no job queue: building
 * one for a problem not yet observed is infrastructure as decoration.
 */

export interface MailMessage {
	to: string;
	subject: string;
	text: string;
}

export interface Mailer {
	send(message: MailMessage): Promise<void>;
}

export interface SmtpConfig {
	host: string;
	port: number;
	secure: boolean;
	user: string;
	password: string;
	from: string;
}

/** `null` when no SMTP host is configured: mail is then switched off. */
export function smtpMailer(config: SmtpConfig): Mailer | null {
	if (!config.host) return null;

	const transport: Transporter = createTransport({
		host: config.host,
		port: config.port,
		secure: config.secure,
		auth: config.user ? { user: config.user, pass: config.password } : undefined
	});

	return {
		async send(message) {
			await transport.sendMail({ from: config.from, ...message });
		}
	};
}

/**
 * Sends without ever throwing and without being awaited by the caller's
 * transaction: call it **after** commit, and do not `await` it in the request
 * path. Returns the promise only so tests can wait for the failure to be logged.
 */
export function sendQuietly(mailer: Mailer | null, message: MailMessage): Promise<void> {
	if (!mailer) return Promise.resolve();

	return mailer.send(message).catch((error: unknown) => {
		console.error(`could not send mail to ${message.to}`, error);
	});
}

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
