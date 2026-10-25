import { JUSTIFICATION_MAX } from '#lib/domain/request-form.js';
import { m } from '#lib/paraglide/messages.js';
import type {
	AddCommentFailure,
	CreateTicketFailure,
	QueueDeleteFailure,
	QueueEditFailure,
	RequestFormDeleteFailure,
	RequestFormEditFailure,
	SubmitRequestFailure
} from '#lib/server/service-desk/index.js';
import type { CitationRefusal } from '#lib/server/service-desk/index.js';

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
	| RequestFormEditFailure
	| RequestFormDeleteFailure
	| SubmitRequestFailure
	| 'invalid_transition'
	| 'assignee_not_found'
	| 'no_queue';

const MESSAGES: Record<Failure, () => string> = {
	queue_not_found: m.ticket_error_queue_not_found,
	requester_not_found: m.ticket_error_requester_not_found,
	requester_required: m.ticket_error_requester_required,
	attachments_too_many: m.ticket_error_attachments_too_many,
	attachments_too_large: m.ticket_error_attachments_too_large,
	body_too_long: m.ticket_error_body_too_long,
	asset_not_found: m.ticket_error_asset_not_found,
	duplicate_ticket_tag: m.ticket_error_duplicate_ticket_tag,
	ticket_not_found: m.error_generic,
	internal_not_allowed: m.ticket_error_internal_not_allowed,
	duplicate_queue_name: m.queues_error_duplicate,
	queue_in_use: m.queues_error_in_use,
	invalid_transition: m.ticket_error_invalid_transition,
	assignee_not_found: m.ticket_error_assignee_not_found,
	no_queue: m.ticket_error_no_queue,
	category_not_found: m.request_error_category_not_found,
	request_form_not_found: m.request_error_form_not_found,
	invalid_request: () => m.request_error_invalid({ max: JUSTIFICATION_MAX }),
	duplicate_request_form_name: m.request_forms_error_duplicate,
	request_form_in_use: m.request_forms_error_in_use
};

export function failureMessage(failure: Failure | CitationRefusal): string {
	if (typeof failure === 'object') {
		// A reply that links a page it may not (#327): the sentence names the page.
		return failure.kind === 'page_not_public'
			? m.ticket_error_page_not_public({ page: failure.pageTag })
			: m.ticket_error_page_not_citable({ page: failure.pageTag });
	}
	return MESSAGES[failure]();
}
