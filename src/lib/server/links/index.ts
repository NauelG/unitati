/**
 * The links domain's public surface (ADR 0002): the typed cross-domain
 * relations (ADR 0005) and the uniform way to read them back. Callers import
 * from here, never from a file inside.
 */

export { ticketAsset, ticketTask, ticketProject } from './schema';
export type { TicketAsset, TicketTask, TicketProject } from './schema';

export { linkAsset, linkAssetToTicket, unlinkAsset } from './ticket-asset';
export type { LinkAssetFailure, UnlinkAssetFailure, TicketAssetPair } from './ticket-asset';

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

export { escalateTicket } from './escalate';
export type { EscalationTarget, EscalateFailure, Escalated } from './escalate';

export { escalationDraft } from './escalation-draft';
export type { EscalationDraft } from './escalation-draft';
