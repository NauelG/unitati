import { STATE_GROUPS, type StateGroup } from '#lib/domain/status.js';

/**
 * Where a milestone stands, derived on read from its dates and from where its
 * tasks sit (ADR 0054). Nothing is stored, so reopening a task needs no rule
 * about "un-achieving" a milestone. Pure: no I/O, the caller supplies `today`.
 */

export type MilestoneStatus = 'completed' | 'overdue' | 'upcoming' | 'active';

export type MilestoneProgress = {
	/** Task count per group; every group is present, zero or not. */
	counts: Record<StateGroup, number>;
	total: number;
	/** completed ÷ (total − cancelled), `0` when nothing is left to count: as `projectProgress`. */
	ratio: number;
};

export interface MilestoneStatusInput {
	/** `YYYY-MM-DD`. */
	startDate: string;
	/** `YYYY-MM-DD`. */
	targetDate: string;
	counts: Record<StateGroup, number>;
}

/**
 * Rules, in this order: `completed` (at least one non-cancelled task, all of them
 * completed), `overdue` (`today` after the target), `upcoming` (`today` before
 * the start), `active`. ISO calendar days compare correctly as strings.
 */
export function milestoneStatus(
	input: MilestoneStatusInput,
	today: string
): { status: MilestoneStatus; progress: MilestoneProgress } {
	const { counts } = input;
	const total = STATE_GROUPS.reduce((sum, group) => sum + counts[group], 0);
	const counted = total - counts.cancelled;
	const progress: MilestoneProgress = {
		counts,
		total,
		ratio: counted === 0 ? 0 : counts.completed / counted
	};

	let status: MilestoneStatus;
	if (counted > 0 && counts.completed === counted) status = 'completed';
	else if (today > input.targetDate) status = 'overdue';
	else if (today < input.startDate) status = 'upcoming';
	else status = 'active';

	return { status, progress };
}
