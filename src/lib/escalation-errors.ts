import { m } from '#lib/paraglide/messages.js';
import type { EscalateFailure } from '#lib/server/links/index.js';

/**
 * One sentence per escalation failure, as `ticket-errors.ts` does for the rest
 * of the ticket screens: a `Record` over the domain's union, so a failure added
 * there is a type error here until somebody writes its sentence.
 */
const MESSAGES: Record<EscalateFailure, () => string> = {
	forbidden: m.escalate_error_forbidden,
	ticket_not_found: m.error_generic,
	task_not_found: m.escalate_error_task_not_found,
	project_not_found: m.escalate_error_project_not_found,
	project_archived: m.escalate_error_project_archived,
	forbidden_create: m.escalate_error_forbidden_create,
	invalid_input: m.escalate_error_invalid_input
};

export function escalateFailureMessage(failure: EscalateFailure): string {
	return MESSAGES[failure]();
}
