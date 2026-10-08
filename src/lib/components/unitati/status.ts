import { m } from '#lib/paraglide/messages.js';

/**
 * The status vocabulary the design system's Status section names, as types.
 *
 * Three families rather than one bag: a ticket is never `in_stock` and an asset
 * is never `waiting_on_user`, so slices 2 and 3 can hold the narrow type and a
 * mistake becomes a type error instead of a wrong badge. `StatusKey` is their
 * union, which is what the badge accepts.
 */

export type TicketStatus = 'new' | 'in_progress' | 'waiting_on_user' | 'resolved' | 'closed';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';
export type AssetState = 'in_stock' | 'in_use' | 'in_repair' | 'retired';

export type StatusKey = TicketStatus | Priority | AssetState;

/** The six badge tones; a tone is a meaning, never a colour name. */
export type Tone = 'brand' | 'desk' | 'success' | 'warning' | 'danger' | 'neutral';

/**
 * Tones exactly as the design system assigns them. `normal` is deliberately
 * absent: the default priority renders no badge, because a row that shouts
 * "Normal" on every line teaches the reader to stop looking.
 */
const TONES: Record<Exclude<StatusKey, 'normal'>, Tone> = {
	// Ticket status
	new: 'brand',
	in_progress: 'desk',
	waiting_on_user: 'warning',
	resolved: 'success',
	closed: 'neutral',
	// Priority
	low: 'neutral',
	high: 'warning',
	urgent: 'danger',
	// Asset state
	in_stock: 'success',
	in_use: 'brand',
	in_repair: 'warning',
	retired: 'neutral'
};

/**
 * Labels are message functions, not strings: calling them at module scope would
 * freeze the locale at import time, which breaks the moment #36 adds English.
 */
const LABELS: Record<Exclude<StatusKey, 'normal'>, () => string> = {
	new: m.status_new,
	in_progress: m.status_in_progress,
	waiting_on_user: m.status_waiting_on_user,
	resolved: m.status_resolved,
	closed: m.status_closed,
	low: m.priority_low,
	high: m.priority_high,
	urgent: m.priority_urgent,
	in_stock: m.asset_state_in_stock,
	in_use: m.asset_state_in_use,
	in_repair: m.asset_state_in_repair,
	retired: m.asset_state_retired
};

/** Every key a badge renders, in the design system's reading order. */
export const BADGED_STATUS_KEYS = Object.keys(TONES) as Exclude<StatusKey, 'normal'>[];

/** `null` for a status that renders nothing, so the caller has one thing to check. */
export function statusBadge(status: StatusKey): { tone: Tone; label: string } | null {
	if (status === 'normal') return null;

	return { tone: TONES[status], label: LABELS[status]() };
}
