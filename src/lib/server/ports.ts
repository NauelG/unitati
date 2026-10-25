import { categoryInOrganisation } from './assets';
import { getDb } from './db';
import { ticketPortsImplementation } from './links';
import { redactWorkEntries } from './projects';
import { setTicketPorts } from './service-desk';

/**
 * The single registration point of the transactional ports (ADR 0049).
 *
 * A domain declares the in-transaction participation it needs from another one
 * as a port (`service-desk/ports.ts`); the domain that owns the relation
 * implements it, and this file hands the implementation over. It sits above
 * every domain for that reason: the two sides never import each other.
 *
 * Called at startup by `hooks.server.ts`, by the seed, and once per process by
 * the database test harness. A port nobody registered throws when used.
 *
 * To add a port: declare it in the consuming domain, implement it in the
 * domain that owns the relation, register it here.
 */

/** Idempotent, so a dev server that re-evaluates the hooks does no harm. */
export function registerPorts(): void {
	setTicketPorts({
		// The three that write inside the ticket's transaction: `links` owns the relations.
		...ticketPortsImplementation,
		// The two reads whose answer belongs to a sibling domain `service-desk` may not import.
		visibleHistory: redactWorkEntries,
		categoryInOrganisation: (actor, categoryId) =>
			categoryInOrganisation(getDb(), actor.organisationId, categoryId)
	});
}
