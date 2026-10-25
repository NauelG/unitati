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

export type { Queue, RequestForm, Ticket, TicketComment, Attachment } from './schema';

export {
	listTickets,
	listTicketChoices,
	getTicketByTag,
	getWrittenTicket,
	createTicket,
	changeTicketStatus,
	setTicketPriority,
	assignTicket,
	moveTicketToQueue,
	changeTicketSubject,
	countOpen,
	ticketSummary,
	hasPortalActivity,
	myOpenTickets,
	openTicketsRequestedBy
} from './tickets';
export type {
	Deps,
	TicketView,
	TicketListRequest,
	TicketChoice,
	CreateTicketFailure,
	TicketSummary
} from './tickets';

export { setTicketPorts } from './ports';
export type { TicketPorts, CitationRefusal } from './ports';

/** Tickets opened per day, for the KPI sparkline (#90). */
export { ticketOpeningsSparkline } from './sparkline';

export {
	ticketSummaries,
	ticketInOrganisation,
	isRequester,
	assignedOpenTickets,
	countOpenTicketsAssignedTo
} from './summaries';
export type { TicketRow, AssignedOpenTicket } from './summaries';

export { addSystemNote, handoverDecidedNote } from './system-note';
export { ticketThread, addComment, editComment, getAttachment } from './comments';
export type {
	ThreadItem,
	ThreadAttachment,
	AddCommentFailure,
	EditCommentFailure
} from './comments';

export { searchMentionables, searchStaffMentionables } from './mentions';
export { MENTION_PICKER_LIMIT } from '../shared/mentions';
export type { Mentionable, MentionVisibility } from './mentions';

export { listQueues, defaultQueue, createQueue, renameQueue, deleteQueue } from './queues';
export type { QueueFailure, QueueEditFailure, QueueDeleteFailure } from './queues';

export {
	listRequestForms,
	listActiveRequestForms,
	getActiveRequestForm,
	createRequestForm,
	updateRequestForm,
	deleteRequestForm,
	submitEquipmentRequest
} from './request-forms';
export type {
	RequestFormEntry,
	RequestFormFailure,
	RequestFormEditFailure,
	RequestFormDeleteFailure,
	SubmitRequestFailure
} from './request-forms';

export { canTransition, nextStatuses, TRANSITIONS } from './transitions';

export {
	createTicketInput,
	addCommentInput,
	editCommentInput,
	subjectInput,
	queueInput,
	requestFormInput,
	requestFormEditInput,
	equipmentRequestInput,
	attachmentProblem,
	MAX_AFFECTED_ASSETS,
	MAX_ATTACHMENTS_PER_COMMENT,
	MAX_ATTACHMENT_BYTES,
	RESERVED_TICKET_TAGS
} from './validation';
export type {
	CreateTicketInput,
	AddCommentInput,
	QueueInput,
	RequestFormInput,
	RequestFormEditInput,
	EquipmentRequestInput,
	UploadedFile
} from './validation';

export { readTicketForm } from './form-data';

export { parseTicketOrder, DEFAULT_TICKET_ORDER, TICKET_SORT_KEYS } from './ticket-order';
export type { TicketOrder, TicketSortKey } from './ticket-order';

export { ticketHits } from './search';
