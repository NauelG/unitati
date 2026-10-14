import { m } from '#lib/paraglide/messages.js';
import { STATE_GROUPS, type StateGroup, type StatusKey } from '#lib/domain/status.js';

/**
 * The presentation half of the status vocabulary: a tone and a message for each
 * key. The keys themselves live in `#lib/domain/status.js`, which is also what
 * `activity`'s payload validation and the `assets` schema read, so there is one
 * list rather than one per layer (ADR 0011).
 */

export type {
	TicketStatus,
	Priority,
	AssetState,
	StatusKey,
	StateGroup
} from '#lib/domain/status.js';

/** What a `StatusBadge` can render: a status key, or the group a project state belongs to (#123). */
export type BadgeKey = StatusKey | StateGroup;

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

/**
 * The tone of each project-state group, reusing the tones the ticket statuses
 * already assign to the same meanings: `started` is `in_progress`, `completed`
 * is `resolved`, `cancelled` is `closed`. Not-yet-moving work (`backlog`,
 * `unstarted`) is neutral. No new token: a group is not a new colour, it is an
 * existing meaning.
 */
const GROUP_TONES: Record<StateGroup, Tone> = {
	backlog: 'neutral',
	unstarted: 'neutral',
	started: 'desk',
	completed: 'success',
	cancelled: 'neutral'
};

const GROUP_LABELS: Record<StateGroup, () => string> = {
	backlog: m.state_group_backlog,
	unstarted: m.state_group_unstarted,
	started: m.state_group_started,
	completed: m.state_group_completed,
	cancelled: m.state_group_cancelled
};

/** Every state group, in board order. */
export const STATE_GROUP_KEYS: readonly StateGroup[] = STATE_GROUPS;

export function stateGroupBadge(group: StateGroup): { tone: Tone; label: string } {
	return { tone: GROUP_TONES[group], label: GROUP_LABELS[group]() };
}

function isStateGroup(key: BadgeKey): key is StateGroup {
	return (STATE_GROUPS as readonly string[]).includes(key);
}

/** Every key a badge renders, in the design system's reading order. */
export const BADGED_STATUS_KEYS = Object.keys(TONES) as Exclude<StatusKey, 'normal'>[];

/**
 * A tone as a CSS colour (#90), for the places a class name cannot go.
 *
 * `StatusBadge` paints its tones through Tailwind variants, which is right for
 * an element with a class attribute. An SVG arc fill is not: `DonutChart` hands
 * the colour to `layerchart`, which writes it into a `fill` attribute, so it
 * needs the `var(--token)` string itself.
 *
 * It belongs here, beside `TONES`, because the alternative is the chart
 * restating "in_stock is green" — and then the donut and the badge for the same
 * state could disagree, which is precisely what the issue's "slice colours
 * match `StatusBadge` colours for the same states" forbids. One table maps a
 * meaning to a colour; two renderers read it.
 *
 * `neutral` is `--ink-muted` rather than a surface, matching the badge's own
 * `text-[var(--ink-muted)]`: on a donut the slice needs to be the *ink*, since
 * a slice painted `--surface-2` would vanish into the empty ring behind it.
 */
const TONE_COLOURS: Record<Tone, string> = {
	brand: 'var(--brand)',
	desk: 'var(--desk)',
	success: 'var(--success)',
	warning: 'var(--warning)',
	danger: 'var(--danger)',
	neutral: 'var(--ink-muted)'
};

export function toneColour(tone: Tone): string {
	return TONE_COLOURS[tone];
}

/**
 * The colour a chart should paint for a status, resolved through the same
 * `TONES` table the badge reads. `normal` is excluded at the type level for the
 * same reason `statusLabel` excludes it: it has no badge, so it has no colour.
 */
export function statusColour(status: Exclude<StatusKey, 'normal'>): string {
	return TONE_COLOURS[TONES[status]];
}

/** `null` for a status that renders nothing, so the caller has one thing to check. */
export function statusBadge(status: BadgeKey): { tone: Tone; label: string } | null {
	if (status === 'normal') return null;
	if (isStateGroup(status)) return stateGroupBadge(status);

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
