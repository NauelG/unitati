import { m } from '#lib/paraglide/messages.js';
import type {
	AddCommentFailure,
	CreateTicketFailure,
	QueueDeleteFailure,
	QueueEditFailure
} from '#lib/server/service-desk/index.js';

/**
 * One sentence per domain failure, shared by the staff screens and the
 * portal. A `Record` over the failure union, so a failure added to the domain
 * is a type error here until somebody writes its sentence.
 *
 * Message functions, not strings: the locale is per request.
 */
type Failure =
	| CreateTicketFailure
	| AddCommentFailure
	| QueueEditFailure
	| QueueDeleteFailure
	| 'invalid_transition'
	| 'assignee_not_found'
	| 'no_queue';

const MESSAGES: Record<Failure, () => string> = {
	queue_not_found: m.ticket_error_queue_not_found,
	requester_not_found: m.ticket_error_requester_not_found,
	requester_required: m.ticket_error_requester_required,
	attachments_too_many: m.ticket_error_attachments_too_many,
	attachments_too_large: m.ticket_error_attachments_too_large,
	asset_not_found: m.ticket_error_asset_not_found,
	duplicate_ticket_tag: m.ticket_error_duplicate_ticket_tag,
	ticket_not_found: m.error_generic,
	internal_not_allowed: m.ticket_error_internal_not_allowed,
	duplicate_queue_name: m.queues_error_duplicate,
	queue_in_use: m.queues_error_in_use,
	invalid_transition: m.ticket_error_invalid_transition,
	assignee_not_found: m.ticket_error_assignee_not_found,
	no_queue: m.ticket_error_no_queue
};

export function failureMessage(failure: Failure): string {
	return MESSAGES[failure]();
}
