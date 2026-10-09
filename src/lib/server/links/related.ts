import { and, asc, eq } from 'drizzle-orm';
import { assetHref, ticketHref } from '#lib/domain/routes.js';
import type { AssetState, TicketStatus } from '#lib/domain/status.js';
import { can } from '../access/permissions';
import { requireAssetScope } from '../assets';
import { assets } from '../assets/schema';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { tickets } from '../service-desk/schema';
import { ticketAsset } from './schema';

/**
 * The uniform read interface over storage that is deliberately not uniform
 * (ADR 0005): `relatedTo(viewer, record)` answers "what is this connected to?"
 * for any record, and the `RecordRef` and `RelatedRecords` components render
 * the answer without knowing which join table it came from.
 *
 * **Live, not historical.** A relation is a fact that is true now, so each item
 * carries the status its record has *today*, read from the record itself. The
 * `activity` log is where the past lives; reading it for this would render a
 * stale status dressed as history (ADR 0009).
 */

export type RecordKind = 'ticket' | 'asset';

/** Which record to look up. */
export interface RecordLocator {
	kind: RecordKind;
	id: string;
}

/** An inline, clickable reference to a record: what the `RecordRef` component draws. */
export interface RecordRef<K extends RecordKind = RecordKind> {
	kind: K;
	id: string;
	/** The human code (`AST-0142`, `TCK-0093`), which is also what the URL carries (ADR 0010). */
	tag: string;
	title: string;
	href: string;
}

export type RelatedItem = {
	/** When the relation was made — what orders a timeline. */
	linkedAt: Date;
} & (
	| { ref: RecordRef<'asset'>; status: AssetState }
	| { ref: RecordRef<'ticket'>; status: TicketStatus }
);

/**
 * Which relation the group is, as a key. The panel label is rendering (the
 * design system says *Affects*), so words belong to the UI and survive a
 * second language; the key is stable.
 */
export type RelationName = 'affects' | 'affected_by';

export interface RelatedGroup {
	relation: RelationName;
	/** The kind of record the items are, which picks the group's icon. */
	icon: RecordKind;
	items: RelatedItem[];
}

async function assetsAffectedBy(viewer: SessionUser, ticketId: string): Promise<RelatedItem[]> {
	const rows = await getDb()
		.select({
			id: assets.id,
			tag: assets.assetTag,
			title: assets.name,
			status: assets.state,
			linkedAt: ticketAsset.createdAt
		})
		.from(ticketAsset)
		.innerJoin(assets, eq(ticketAsset.assetId, assets.id))
		.where(
			and(
				eq(ticketAsset.organisationId, viewer.organisationId),
				eq(ticketAsset.ticketId, ticketId),
				// An employee sees the assets they could have attached themselves and no
				// others: a colleague's laptop stays out of the panel even if staff added it.
				requireAssetScope(viewer)
			)
		)
		.orderBy(asc(ticketAsset.createdAt), asc(ticketAsset.id));

	return rows.map((row) => ({
		ref: {
			kind: 'asset' as const,
			id: row.id,
			tag: row.tag,
			title: row.title,
			href: assetHref(row.tag)
		},
		status: row.status,
		linkedAt: row.linkedAt
	}));
}

async function ticketsAffecting(viewer: SessionUser, assetId: string): Promise<RelatedItem[]> {
	// An asset's tickets are its history, and the shared view never shows
	// history (ADR 0007). Staff read them; everybody else gets no group at all,
	// not an empty one they could mistake for "this machine never broke".
	if (!can(viewer, 'tickets.view')) return [];

	const rows = await getDb()
		.select({
			id: tickets.id,
			tag: tickets.ticketTag,
			title: tickets.subject,
			status: tickets.status,
			linkedAt: ticketAsset.createdAt
		})
		.from(ticketAsset)
		.innerJoin(tickets, eq(ticketAsset.ticketId, tickets.id))
		.where(
			and(eq(ticketAsset.organisationId, viewer.organisationId), eq(ticketAsset.assetId, assetId))
		)
		.orderBy(asc(ticketAsset.createdAt), asc(ticketAsset.id));

	return rows.map((row) => ({
		ref: {
			kind: 'ticket' as const,
			id: row.id,
			tag: row.tag,
			title: row.title,
			href: ticketHref(row.tag)
		},
		status: row.status,
		linkedAt: row.linkedAt
	}));
}

/**
 * What a record is connected to, as groups ready to render, in the design
 * system's order and with empty groups left out (it offers *Link* instead).
 *
 * The caller has already proved the viewer may open `record` — it got the
 * record through a scoped read — so this scopes what is on the **other side**
 * of each relation and the organisation, and takes the record as given.
 */
export async function relatedTo(
	viewer: SessionUser,
	record: RecordLocator
): Promise<RelatedGroup[]> {
	const groups: RelatedGroup[] = [];

	if (record.kind === 'ticket') {
		const items = await assetsAffectedBy(viewer, record.id);
		if (items.length > 0) groups.push({ relation: 'affects', icon: 'asset', items });
	} else {
		const items = await ticketsAffecting(viewer, record.id);
		if (items.length > 0) groups.push({ relation: 'affected_by', icon: 'ticket', items });
	}

	return groups;
}
