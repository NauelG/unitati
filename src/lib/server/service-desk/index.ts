/**
 * The service-desk domain's public surface (ADR 0002): routes validate input,
 * call one of these and map the outcome to HTTP. No route builds a query.
 *
 * **Two kinds of check, split on purpose.** Whether a user may reach a screen is
 * a capability, gated by `requirePermission` in the route (ADR 0007). Which
 * rows they then see is data, and lives here: `requireTicketScope` for reads,
 * the internal-note filter for threads. The staff writes trust the route's gate
 * and scope tenancy only.
 */

export {
	queues,
	tickets,
	ticketComments,
	attachments,
	ticketStatus,
	ticketPriority,
	ticketChannel,
	commentVisibility,
	ticketCodeSequence
} from './schema';
export type { Queue, Ticket, TicketComment, Attachment } from './schema';

export {
	listTickets,
	getTicketByTag,
	getWrittenTicket,
	createTicket,
	changeTicketStatus,
	setTicketPriority,
	assignTicket,
	moveTicketToQueue,
	countOpen,
	ticketSummary,
	hasPortalActivity,
	myOpenTickets
} from './tickets';
export type {
	Deps,
	TicketView,
	TicketListRequest,
	CreateTicketFailure,
	TicketSummary
} from './tickets';

/** Tickets opened per day, for the KPI sparkline (#90). */
export { ticketOpeningsSparkline } from './sparkline';

export { ticketThread, addComment, getAttachment } from './comments';
export type { ThreadItem, ThreadAttachment, AddCommentFailure } from './comments';

export { listQueues, defaultQueue, createQueue, renameQueue, deleteQueue } from './queues';
export type { QueueFailure, QueueEditFailure, QueueDeleteFailure } from './queues';

export { canTransition, nextStatuses, TRANSITIONS } from './transitions';

export {
	createTicketInput,
	addCommentInput,
	queueInput,
	attachmentProblem,
	MAX_AFFECTED_ASSETS,
	MAX_ATTACHMENTS_PER_COMMENT,
	MAX_ATTACHMENT_BYTES,
	RESERVED_TICKET_TAGS
} from './validation';
export type { CreateTicketInput, AddCommentInput, QueueInput, UploadedFile } from './validation';

export { readTicketForm } from './form-data';
