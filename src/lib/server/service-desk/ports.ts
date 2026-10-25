import type { TimelineEntry } from '../activity';
import type { SessionUser } from '../auth/guards';
import type { Transaction } from '../db';
import type { Outcome } from '../shared/outcome';

/**
 * What `service-desk` needs from outside while it writes a ticket or a comment
 * (ADR 0049).
 *
 * Each port runs **inside the caller's transaction** and can **refuse it**: a
 * ticket opened "about nothing", or a reply that cites a page it may not link,
 * must not commit. The events bus (ADR 0024) runs after commit and cannot
 * refuse, and a per-call hook would let a caller forget the rule, so these are
 * ports: declared here, in `service-desk` vocabulary, implemented once by
 * `links`, and registered at startup by `server/ports.ts`. `service-desk` never
 * imports `links`.
 *
 * Every port is **required**. One that was never registered throws, rather than
 * skipping the relation: a ticket written without its assets is a bug, not a
 * degraded mode.
 */

/** A reply was refused because of a page it links. Nothing was written. */
export type CitationRefusal =
	{ kind: 'page_not_public'; pageTag: string } | { kind: 'page_not_citable'; pageTag: string };

export interface TicketPorts {
	/**
	 * Attaches the assets a ticket is about. The ticket exists already, in `tx`.
	 * Each asset must be one the actor can see (an employee attaches what they
	 * hold or share, and nothing else); the first one that is not refuses the
	 * whole call with `asset_not_found`, and the caller rolls `tx` back. The ids
	 * arrive de-duplicated; an empty list writes nothing.
	 */
	affectedAssets(
		tx: Transaction,
		actor: SessionUser,
		input: { ticketId: string; assetIds: readonly string[] }
	): Promise<Outcome<void, 'asset_not_found'>>;

	/**
	 * Records the asset category a ticket asks for. The category must belong to
	 * the actor's organisation, otherwise `category_not_found` and the caller
	 * rolls `tx` back. Idempotent.
	 */
	requestedCategory(
		tx: Transaction,
		actor: SessionUser,
		input: { ticketId: string; categoryId: string }
	): Promise<Outcome<void, 'category_not_found'>>;

	/**
	 * Cites the knowledge pages a comment links, given as `DOC-####` tags.
	 * Every page is checked before any is written, so a refusal leaves nothing
	 * behind. A `public` comment may only link published pages of a `portal`
	 * space, an `internal` one published pages the actor can read. Only somebody
	 * who may manage tickets cites; for anyone else it writes nothing and
	 * succeeds. An empty list is a success with `cited: 0`.
	 */
	citedPages(
		tx: Transaction,
		actor: SessionUser,
		input: {
			ticketId: string;
			pageTags: readonly string[];
			visibility: 'public' | 'internal';
		}
	): Promise<Outcome<{ cited: number }, CitationRefusal>>;

	/**
	 * Not transactional: the two reads `service-desk` cannot make itself because
	 * the answer belongs to a sibling domain (ADR 0002), which it may not import.
	 */

	/**
	 * The entries as the viewer may read them. A `link.task.*` or `link.project.*`
	 * entry about work the viewer cannot open keeps its verb, actor and time and
	 * loses the id, the code and the title (ADR 0042). Every other entry passes
	 * through untouched, in the same order.
	 */
	visibleHistory<E extends TimelineEntry>(viewer: SessionUser, entries: readonly E[]): Promise<E[]>;

	/** The asset category, if it belongs to the actor's organisation; `null` otherwise. */
	categoryInOrganisation(
		actor: SessionUser,
		categoryId: string
	): Promise<{ id: string; name: string } | null>;
}

let registered: TicketPorts | null = null;

/** Registers the implementation. Called by `server/ports.ts`, nowhere else. */
export function setTicketPorts(implementation: TicketPorts): void {
	registered = implementation;
}

/** Forgets the implementation, so a spec can prove that `service-desk` refuses to run without it. */
export function clearTicketPorts(): void {
	registered = null;
}

/** The registered ports; throws when nobody registered them. */
export function ticketPorts(): TicketPorts {
	if (registered === null) {
		throw new Error(
			'The ticket ports are not registered. Call registerPorts() from server/ports.ts at startup (ADR 0049).'
		);
	}
	return registered;
}
