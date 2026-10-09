import type { TicketStatus } from '#lib/domain/status.js';

/**
 * The ticket workflow, as data. It lives in the domain and not as a database
 * constraint (the issue's decision): the day an unusual jump is needed, the
 * code changes, and that is the better side to be wrong on.
 *
 * Enforced because #14 measures time to first response and time to resolution
 * *from transitions*. If any jump were allowed the metric would measure noise.
 *
 * `new` can only go to `in_progress`: nothing is answered or resolved before
 * somebody took it. **Reopening is explicit**: `resolved` and `closed` are the
 * only states with a way back, and it always lands on `in_progress`.
 */
export const TRANSITIONS = {
	new: ['in_progress'],
	in_progress: ['waiting_on_user', 'resolved'],
	waiting_on_user: ['in_progress', 'resolved'],
	resolved: ['closed', 'in_progress'],
	closed: ['in_progress']
} as const satisfies Record<TicketStatus, readonly TicketStatus[]>;

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
	return (TRANSITIONS[from] as readonly TicketStatus[]).includes(to);
}

/** The statuses a ticket in `from` may move to, in workflow order. */
export function nextStatuses(from: TicketStatus): readonly TicketStatus[] {
	return TRANSITIONS[from];
}
