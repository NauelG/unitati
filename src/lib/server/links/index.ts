/**
 * The links domain's public surface (ADR 0002): the typed cross-domain
 * relations (ADR 0005) and the uniform way to read them back. Callers import
 * from here, never from a file inside.
 */

export { ticketAsset } from './schema';
export type { TicketAsset } from './schema';

export { linkAsset, unlinkAsset } from './ticket-asset';
export type { LinkAssetFailure, UnlinkAssetFailure, TicketAssetPair } from './ticket-asset';

export { relatedTo } from './related';
export type {
	RecordKind,
	RecordLocator,
	RecordRef,
	RelatedGroup,
	RelatedItem,
	RelationName
} from './related';

export { mergeAssetTimeline, recentTicketCount, RECENT_MONTHS } from './timeline';
export type { AssetTimelineItem } from './timeline';
