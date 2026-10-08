import { m } from '#lib/paraglide/messages.js';
import type { StatusKey } from '#lib/domain/status.js';

/**
 * The presentation half of the status vocabulary: a tone and a message for each
 * key. The keys themselves live in `#lib/domain/status.js`, which is also what
 * `activity`'s payload validation and the `assets` schema read, so there is one
 * list rather than one per layer (ADR 0011).
 */

export type { TicketStatus, Priority, AssetState, StatusKey } from '#lib/domain/status.js';

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

/**
 * The label on its own, for prose that names a status inside a sentence — an
 * activity entry reading "changed the state from In stock to In use".
 *
 * `normal` is excluded at the type level because it has no label: the default
 * priority is expressed by the absence of a badge, so there is no word for it.
 */
export function statusLabel(status: Exclude<StatusKey, 'normal'>): string {
	return LABELS[status]();
}
