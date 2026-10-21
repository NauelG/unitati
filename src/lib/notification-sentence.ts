import { m } from '#lib/paraglide/messages.js';
import type { NotificationType, Snapshot } from '#lib/server/notifications/index.js';

/**
 * Turns a notification into the sentence a reader sees (ADR 0040). It is not
 * with the table: the row stores a type and a snapshot, and producing words from
 * them is rendering. It lives outside `components` because two renderers read it,
 * the inbox and the mail (#302), so both say the same thing.
 *
 * The `switch` is exhaustive. A type added to `NOTIFICATION_TYPES` without a case
 * here fails `npm run check`, instead of shipping as a blank line in an inbox.
 */
export function notificationSentence(type: NotificationType, snapshot: Snapshot): string {
	const parts = {
		actor: snapshot.actorName ?? m.notifications_actor_unknown(),
		code: snapshot.code,
		title: snapshot.title
	};

	switch (type) {
		case 'ticket.assigned':
			return m.notifications_sentence_ticket_assigned(parts);
		case 'task.assigned':
			return m.notifications_sentence_task_assigned(parts);
		case 'ticket.replied':
			return m.notifications_sentence_ticket_replied(parts);
		case 'ticket.commented':
			return m.notifications_sentence_ticket_commented(parts);
		case 'ticket.resolved':
			return m.notifications_sentence_ticket_resolved(parts);
		case 'task.linked_completed':
			return m.notifications_sentence_task_linked_completed(parts);
		case 'mention':
			return m.notifications_sentence_mention(parts);
		case 'followed.activity':
			return m.notifications_sentence_followed_activity(parts);
		default: {
			const unreachable: never = type;
			throw new Error(`No sentence for notification type ${unreachable}`);
		}
	}
}
