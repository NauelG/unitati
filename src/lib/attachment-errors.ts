import { m } from '#lib/paraglide/messages.js';

/**
 * One sentence per refusal of an attachment write on a project, a task or an asset,
 * shared by their pages. The wording of the limits is the tickets': same limits,
 * same sentence (`ticket-errors.ts`).
 */
type Failure =
	| 'attachments_too_many'
	| 'attachments_too_large'
	| 'project_archived'
	| 'attachment_not_found'
	| 'asset_not_found';

const MESSAGES: Record<Failure, () => string> = {
	attachments_too_many: m.ticket_error_attachments_too_many,
	attachments_too_large: m.ticket_error_attachments_too_large,
	project_archived: m.project_error_archived,
	attachment_not_found: m.error_generic,
	asset_not_found: m.asset_error_gone
};

export function attachmentFailureMessage(failure: Failure): string {
	return MESSAGES[failure]();
}
