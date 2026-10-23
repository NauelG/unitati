import type { AssetState } from '#lib/domain/status.js';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';

/**
 * How much of an asset one viewer may see (ADR 0007), as a pure function over a
 * row.
 *
 * It lives in its own module, apart from the queries, for two reasons. The rule
 * is the most security-sensitive thing in this domain and it should be readable
 * in one screen without a query around it; and nothing here imports the
 * database, so it is provable in the fast test project rather than only against
 * Postgres.
 */

/** Everything about an asset that a row needs, for somebody allowed all of it. */
export interface FullAssetView {
	visibility: 'full';
	id: string;
	assetTag: string;
	name: string;
	serial: string | null;
	state: AssetState;
	shared: boolean;
	/** For a form that preselects the current model; the catalogue entry, not a secret. */
	assetModelId: string;
	modelName: string;
	manufacturerName: string;
	categoryName: string;
	custodianPersonId: string | null;
	custodianName: string | null;
	locationId: string | null;
	/** The full path (`Barcelona office › Floor 1`); see ADR 0027. */
	locationPath: string | null;
	/** Set when the record was archived as a mistake; only the detail page reads an archived asset. */
	archivedAt: Date | null;
}

/**
 * What `assets.view.shared` grants, and the whole of it: **name and location**.
 * No serial, no custody, no cost, no history.
 *
 * A separate type rather than a `FullAssetView` with blanked fields, because
 * the redaction has to hold in the payload and not merely in the markup. A
 * `serial: null` on the wire still tells an employee the field exists, and a
 * real serial behind a hidden table cell is one devtools pane away. A row of
 * this type has nowhere to put one.
 *
 * `assetTag` stays, and only because it is the *identifier* rather than a
 * detail: it is what the URL uses (ADR 0010) and what lets an employee attach
 * the floor printer to a ticket — the case ADR 0007 introduced
 * `assets.view.shared` for. The internal uuid is not here; #9 can resolve a tag
 * server-side when it needs one.
 */
export interface SharedAssetView {
	visibility: 'shared';
	assetTag: string;
	name: string;
	/** The path and only the path: never code, address, notes or coordinates. */
	locationPath: string | null;
}

export type AssetView = FullAssetView | SharedAssetView;

export function viewAsset(row: FullAssetView, viewer: SessionUser): AssetView {
	// Whoever may see the whole inventory may see all of each row.
	if (can(viewer, 'assets.view')) return row;

	// Their own equipment, in full: an employee needs the serial of the laptop in
	// their hands in order to report a fault about it.
	const own = viewer.personId !== null && row.custodianPersonId === viewer.personId;
	if (own) return row;

	return {
		visibility: 'shared',
		assetTag: row.assetTag,
		name: row.name,
		locationPath: row.locationPath
	};
}
