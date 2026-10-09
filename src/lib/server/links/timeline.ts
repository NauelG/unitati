import type { TicketStatus } from '#lib/domain/status.js';
import type { TimelineEntry } from '../activity';
import type { RecordRef, RelatedGroup, RelatedItem } from './related';

/**
 * An asset's timeline is a **merge at read time** (ADR 0009): past events from
 * `activity`, live relations from here. The two are not the same kind of fact,
 * and conflating them is the mistake this module exists to avoid.
 *
 * A ticket on the rail is dated by when it was *linked* and shows the status it
 * has *today*. Reading its status out of `activity` would render a stale value
 * dressed as history: "In progress" on a ticket resolved a month ago. So the
 * ticket's own events never reach the asset's rail (`link.asset.*` hangs off
 * the ticket), and the row below is the only place it appears.
 *
 * Pure on purpose: both halves are fetched by their owners and handed in, so
 * the ordering rule is provable without a database.
 */

export type AssetTimelineItem =
	| { kind: 'activity'; id: string; at: Date; entry: TimelineEntry }
	| {
			kind: 'ticket';
			id: string;
			at: Date;
			record: RecordRef<'ticket'>;
			status: TicketStatus;
	  };

type TicketItem = RelatedItem & { ref: RecordRef<'ticket'>; status: TicketStatus };

function isTicket(item: RelatedItem): item is TicketItem {
	return item.ref.kind === 'ticket';
}

function ticketsIn(groups: readonly RelatedGroup[]): TicketItem[] {
	return groups.flatMap((group) => group.items.filter(isTicket));
}

/** Newest first, with the id breaking ties so the order never changes between two reads. */
export function mergeAssetTimeline(
	entries: readonly TimelineEntry[],
	related: readonly RelatedGroup[]
): AssetTimelineItem[] {
	const items: AssetTimelineItem[] = [
		...entries.map((entry): AssetTimelineItem => ({
			kind: 'activity',
			id: entry.id,
			at: entry.occurredAt,
			entry
		})),
		...ticketsIn(related).map((item): AssetTimelineItem => ({
			kind: 'ticket',
			id: item.ref.id,
			at: item.linkedAt,
			record: item.ref,
			status: item.status
		}))
	];

	return items.sort((a, b) => b.at.getTime() - a.at.getTime() || (a.id < b.id ? 1 : -1));
}

/** The window "N tickets in 6 months" is measured over. */
export const RECENT_MONTHS = 6;

/**
 * How many tickets were raised on this machine lately: the figure that turns
 * an asset into a replacement candidate. Counted from the relation, by when it
 * was linked.
 */
export function recentTicketCount(related: readonly RelatedGroup[], now: Date): number {
	const since = new Date(now);
	since.setUTCMonth(since.getUTCMonth() - RECENT_MONTHS);

	return ticketsIn(related).filter((item) => item.linkedAt >= since).length;
}
