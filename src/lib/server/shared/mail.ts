import { createTransport, type Transporter } from 'nodemailer';

/**
 * Outbound mail, degrading by design (ADR 0006): a failure to send is logged
 * and swallowed, never a reason for the action that triggered it to fail. The
 * comment is saved, the response returns, and mail is a courtesy on top.
 *
 * Fire-and-forget after commit. There is deliberately no job queue: building
 * one for a problem not yet observed is infrastructure as decoration.
 */

export interface MailAttachment {
	filename: string;
	contentType: string;
	content: Uint8Array;
}

export interface MailMessage {
	to: string;
	subject: string;
	text: string;
	attachments?: MailAttachment[];
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

	return smtpMailerOver(
		config,
		createTransport({
			host: config.host,
			port: config.port,
			secure: config.secure,
			auth: config.user ? { user: config.user, pass: config.password } : undefined
		})
	);
}

/** The transport is a seam so a spec can see what would reach nodemailer. */
export function smtpMailerOver(config: Pick<SmtpConfig, 'from'>, transport: Transporter): Mailer {
	return {
		async send(message) {
			await transport.sendMail({
				from: config.from,
				to: message.to,
				subject: message.subject,
				text: message.text,
				attachments: message.attachments?.map(({ filename, contentType, content }) => ({
					filename,
					contentType,
					content: Buffer.from(content)
				}))
			});
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
