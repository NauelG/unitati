/**
 * The status vocabulary, and only the vocabulary: the keys, with no labels, no
 * tones and no table.
 *
 * It lives outside both `server/` and `components/` because three layers need
 * the same list and none of them owns it:
 *
 * - `components/unitati/status.ts` pairs each key with a tone and a message.
 * - `server/activity/payload.ts` validates `state.changed` against it.
 * - `server/assets/schema.ts` builds its `pgEnum` from it (#7).
 *
 * Any of those declaring its own copy is a second source of truth, and ADR 0011
 * already warned where that ends: *"their columns must store these same
 * strings — otherwise there are two vocabularies to keep in step, and they will
 * drift."*
 *
 * Not under `server/` on purpose: SvelteKit forbids client code from importing
 * a value out of a server-only module, and `StatusBadge` needs these values.
 */

/** Three families, because a ticket is never `in_stock`. */
export const TICKET_STATUSES = [
	'new',
	'in_progress',
	'waiting_on_user',
	'resolved',
	'closed'
] as const;

export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

export const ASSET_STATES = ['in_use', 'in_repair', 'in_stock', 'retired'] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type AssetState = (typeof ASSET_STATES)[number];

/** Every key a status badge can be asked to render. */
export type StatusKey = TicketStatus | Priority | AssetState;
