/**
 * The links domain's public surface (ADR 0002): the typed cross-domain
 * relations (ADR 0005) and the uniform way to read them back. Callers import
 * from here, never from a file inside.
 */

export { ticketAsset, ticketTask, ticketProject, ticketHandover, ticketCategory } from './schema';
export type {
	TicketAsset,
	TicketTask,
	TicketProject,
	TicketHandover,
	TicketCategory
} from './schema';

export { linkAsset, linkAssetToTicket, linkTicketAssets, unlinkAsset } from './ticket-asset';
export type {
	LinkAssetFailure,
	LinkTicketAssetsFailure,
	LinkTicketAssetsOutcome,
	UnlinkAssetFailure,
	TicketAssetPair
} from './ticket-asset';

export { categoryInOrganisation, linkCategory, requestedCategory } from './ticket-category';
export type { LinkCategoryFailure, RequestedCategory } from './ticket-category';

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

export { relatedTo, assetRelations } from './related';
export type {
	RecordKind,
	RecordLocator,
	RecordRef,
	RestrictedRecordRef,
	AssetRelatedGroup,
	HandoverState,
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

export { escalateTicket } from './escalate';
export type { EscalationTarget, EscalateFailure, Escalated } from './escalate';

export { escalationDraft } from './escalation-draft';
export type { EscalationDraft } from './escalation-draft';

export { taskChoices, projectChoices } from './escalation-targets';
export type { TaskChoice, ProjectChoice } from './escalation-targets';

export { parseEscalation, invalidField } from './escalation-input';
export type { EscalationField, ParsedEscalation } from './escalation-input';
