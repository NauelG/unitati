/**
 * The links domain's public surface (ADR 0002): the typed cross-domain
 * relations (ADR 0005) and the uniform way to read them back. Callers import
 * from here, never from a file inside.
 */

export type {
	TicketAsset,
	TicketTask,
	TicketProject,
	TicketHandover,
	TicketCategory,
	TicketPage,
	ProjectPage
} from './schema';

export { linkAsset, linkAssetToTicket, linkTicketAssets, unlinkAsset } from './ticket-asset';
export type {
	LinkAssetFailure,
	LinkTicketAssetsFailure,
	LinkTicketAssetsOutcome,
	UnlinkAssetFailure,
	TicketAssetPair
} from './ticket-asset';

export { linkCategory, requestedCategory } from './ticket-category';
export type { LinkCategoryFailure, RequestedCategory } from './ticket-category';

export { ticketPortsImplementation } from './ticket-ports';

export { notifyHandoverDecided } from './notify-handover-decided';
export { notifyTaskCompleted } from './notify-task-completed';

export { linkHandover, linkHandoverByCode, unlinkHandover } from './ticket-handover';
export type {
	LinkHandoverByCodeFailure,
	LinkHandoverFailure,
	TicketHandoverPair,
	UnlinkHandoverFailure
} from './ticket-handover';

export {
	linkTask,
	linkTicketToTask,
	unlinkTask,
	linkProject,
	linkTicketToProject,
	unlinkProject
} from './ticket-work';
export type {
	LinkResult,
	LinkTaskFailure,
	LinkProjectFailure,
	UnlinkFailure,
	TicketTaskPair,
	TicketProjectPair
} from './ticket-work';

export { citePage, uncitePage } from './ticket-page';
export type { CitePageFailure } from './ticket-page';

export { documentProject, undocumentProject } from './project-page';
export type { DocumentProjectFailure } from './project-page';

export { relatedTo, assetRelations } from './related';
export type {
	RecordKind,
	RecordLocator,
	RecordRef,
	RestrictedRecordRef,
	AssetRelatedGroup,
	HandoverState,
	PageState,
	TaskStatus,
	ProjectStatus,
	RelatedGroup,
	RelatedItem,
	ViaTask,
	RelationName
} from './related';

export {
	mergeAssetTimeline,
	mergeTaskTimeline,
	mergeProjectTimeline,
	recentTicketCount,
	openTicketCount,
	RECENT_MONTHS
} from './timeline';
export type { AssetTimelineItem } from './timeline';

export { taskTimeline, projectTimeline } from './record-timelines';

export { visibleFeed } from './work-events';

export { escalateTicket } from './escalate';
export type { EscalationTarget, EscalateFailure, Escalated } from './escalate';

export { escalationDraft } from './escalation-draft';
export type { EscalationDraft } from './escalation-draft';

export { taskChoices, projectChoices } from './escalation-targets';
export type { TaskChoice, ProjectChoice } from './escalation-targets';

export { parseEscalation, invalidField } from './escalation-input';
export type { EscalationField, ParsedEscalation } from './escalation-input';

export { canReadTimeTarget, visibleRunningTimer, redactTimeRows } from './time-access';
