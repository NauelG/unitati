import { describe, expect, it } from 'vitest';
import type { StateGroup } from '#lib/domain/status.js';
import { milestoneStatus } from './milestone-status';

const counts = (partial: Partial<Record<StateGroup, number>> = {}): Record<StateGroup, number> => ({
	backlog: 0,
	unstarted: 0,
	started: 0,
	completed: 0,
	cancelled: 0,
	...partial
});

const range = { startDate: '2026-11-10', targetDate: '2026-11-20' };
const at = (today: string, c = counts({ started: 1 })) =>
	milestoneStatus({ ...range, counts: c }, today);

describe('milestoneStatus: by date', () => {
	it('is active on the start date, inside the range and on the target date', () => {
		expect(at('2026-11-10').status).toBe('active');
		expect(at('2026-11-15').status).toBe('active');
		expect(at('2026-11-20').status).toBe('active');
	});

	it('is overdue the day after the target date', () => {
		expect(at('2026-11-21').status).toBe('overdue');
	});

	it('is upcoming the day before the start date', () => {
		expect(at('2026-11-09').status).toBe('upcoming');
	});

	it('allows a one-day milestone', () => {
		const one = { startDate: '2026-11-10', targetDate: '2026-11-10', counts: counts() };
		expect(milestoneStatus(one, '2026-11-10').status).toBe('active');
		expect(milestoneStatus(one, '2026-11-11').status).toBe('overdue');
		expect(milestoneStatus(one, '2026-11-09').status).toBe('upcoming');
	});

	it('a milestone with no tasks follows its dates and is never completed', () => {
		expect(at('2026-11-15', counts()).status).toBe('active');
		expect(at('2026-12-15', counts()).status).toBe('overdue');
	});
});

describe('milestoneStatus: completed', () => {
	const done = counts({ completed: 3 });

	it('is completed when every non-cancelled task is completed', () => {
		expect(at('2026-11-15', counts({ completed: 2, cancelled: 1 })).status).toBe('completed');
	});

	it('takes precedence over overdue and upcoming', () => {
		expect(at('2026-12-31', done).status).toBe('completed');
		expect(at('2026-01-01', done).status).toBe('completed');
	});

	it('is not completed while a task is open, so reopening falls back by date', () => {
		const reopened = counts({ completed: 2, started: 1 });
		expect(at('2026-12-31', reopened).status).toBe('overdue');
		expect(at('2026-11-15', reopened).status).toBe('active');
		expect(at('2026-01-01', reopened).status).toBe('upcoming');
	});

	it('is never completed when every task is cancelled', () => {
		const result = at('2026-11-15', counts({ cancelled: 2 }));
		expect(result.status).toBe('active');
		expect(result.progress.ratio).toBe(0);
	});
});

describe('milestoneStatus: progress', () => {
	it('is completed ÷ (total − cancelled)', () => {
		const result = at('2026-11-15', counts({ completed: 1, started: 2, cancelled: 1 }));
		expect(result.progress.total).toBe(4);
		expect(result.progress.ratio).toBeCloseTo(1 / 3);
		expect(result.progress.counts.cancelled).toBe(1);
	});

	it('is 0 when nothing is left to count', () => {
		expect(at('2026-11-15', counts()).progress).toEqual({ counts: counts(), total: 0, ratio: 0 });
	});
});
