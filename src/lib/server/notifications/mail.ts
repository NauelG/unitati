import { m } from '#lib/paraglide/messages.js';
import { notificationSentence } from '#lib/notification-sentence.js';
import { sendQuietly, type Mailer, type MailMessage } from '../shared/mail';
import { runtimeMailer } from '../shared/runtime';
import type { PendingEmail } from './notify';
import { notificationHref } from './reader';

/**
 * The email channel (#302, ADR 0040): one plain-text mail per notification, sent
 * after the producer's transaction has committed. The austere strings that do
 * the job; branded templates are #19.
 *
 * The subject starts with the record's code, as the mails before #302 did, so a
 * mail client keeps threading a ticket's mails together.
 */

/** Where people switch mail off; every mail ends pointing at it. */
export const PREFERENCES_PATH = '/account/notifications';

function trimOrigin(origin: string): string {
	return origin.replace(/\/+$/, '');
}

/** The absolute link to the record, where this recipient reads it: the portal without `tickets.view`. */
function recordUrl(email: PendingEmail, origin: string): string {
	const { target, snapshot } = email;
	const href = notificationHref(
		{
			ticketId: 'ticketId' in target ? target.ticketId : null,
			taskId: 'taskId' in target ? target.taskId : null,
			snapshot
		},
		// A person without a user can only ever get access as a requester (#230).
		{ role: email.role ?? 'employee' }
	);
	return new URL(href, `${trimOrigin(origin)}/`).toString();
}

function footer(origin: string): string {
	return m.notifications_mail_footer({ link: `${trimOrigin(origin)}${PREFERENCES_PATH}` });
}

export function notificationMail(email: PendingEmail, origin: string): MailMessage {
	const { snapshot } = email;
	const parts = { code: snapshot.code, title: snapshot.title };

	const subject =
		email.type === 'ticket.resolved'
			? m.notifications_mail_subject_resolved(parts)
			: m.notifications_mail_subject(parts);

	const text = [
		notificationSentence(email.type, snapshot),
		snapshot.summary,
		snapshot.excerpt ? `«${snapshot.excerpt}»` : undefined,
		recordUrl(email, origin),
		// A follower stops following from the record itself (#57).
		email.type === 'followed.activity'
			? m.follow_mail_unfollow({ link: recordUrl(email, origin) })
			: undefined,
		footer(origin)
	]
		.filter((paragraph): paragraph is string => Boolean(paragraph))
		.join('\n\n');

	return { to: email.to, subject, text };
}

/** Whether this installation can send mail at all (ADR 0006): without SMTP, the email switches do nothing. */
export function emailConfigured(): boolean {
	return runtimeMailer() !== null;
}

/**
 * Sends each mail with `sendQuietly`: call it **after** commit and do not await
 * it in the request path. With no SMTP (`mailer` null) nothing is sent and
 * nothing fails (ADR 0006). The promise is returned only for tests.
 */
export function sendNotificationEmails(
	mailer: Mailer | null,
	emails: readonly PendingEmail[],
	origin: string
): Promise<void> {
	if (!mailer || emails.length === 0) return Promise.resolve();
	return Promise.all(
		emails.map((email) => sendQuietly(mailer, notificationMail(email, origin)))
	).then(() => undefined);
}

export interface CompletedTask {
	taskTag: string;
	taskTitle: string;
	toStateName: string;
}

/**
 * The one mail that is not one-per-notification: a completed task can be linked
 * to several tickets of the same technician, who gets one in-app row per ticket
 * and **one** mail listing them, as before #302. `emails` are one person's.
 */
export function linkedTaskMail(
	task: CompletedTask,
	emails: readonly [PendingEmail, ...PendingEmail[]],
	origin: string
): MailMessage {
	const list = emails
		.map((email) => `- ${email.snapshot.code} ${email.snapshot.title}: ${recordUrl(email, origin)}`)
		.join('\n');

	return {
		to: emails[0].to,
		subject: m.notifications_mail_linked_subject({ code: task.taskTag, title: task.taskTitle }),
		text: [
			m.notifications_mail_linked_intro({
				code: task.taskTag,
				title: task.taskTitle,
				state: task.toStateName
			}),
			`${m.notifications_mail_linked_list()}\n${list}`,
			m.notifications_mail_linked_outro(),
			footer(origin)
		].join('\n\n')
	};
}

/** Groups the `task.linked_completed` mails by person and sends one each, quietly. */
export function sendLinkedTaskEmails(
	mailer: Mailer | null,
	task: CompletedTask,
	emails: readonly PendingEmail[],
	origin: string
): Promise<void> {
	if (!mailer || emails.length === 0) return Promise.resolve();
	const byPerson = Map.groupBy(emails, (email) => email.personId);
	return Promise.all(
		[...byPerson.values()].map((personEmails) =>
			sendQuietly(
				mailer,
				linkedTaskMail(task, personEmails as [PendingEmail, ...PendingEmail[]], origin)
			)
		)
	).then(() => undefined);
}
