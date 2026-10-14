import { describe, expect, it } from 'vitest';
import { STATE_GROUP_KEYS, stateGroupBadge, statusBadge } from './status.js';

describe('stateGroupBadge', () => {
	it.each([
		['backlog', 'neutral'],
		['unstarted', 'neutral'],
		['started', 'desk'],
		['completed', 'success'],
		['cancelled', 'neutral']
	] as const)('%s renders with the %s tone', (group, tone) => {
		expect(stateGroupBadge(group).tone).toBe(tone);
	});

	it('uses the same tones as the ticket statuses that mean the same thing', () => {
		expect(stateGroupBadge('started').tone).toBe(statusBadge('in_progress')?.tone);
		expect(stateGroupBadge('completed').tone).toBe(statusBadge('resolved')?.tone);
		expect(stateGroupBadge('cancelled').tone).toBe(statusBadge('closed')?.tone);
	});

	it('has a non-empty label for every group', () => {
		for (const group of STATE_GROUP_KEYS) expect(stateGroupBadge(group).label).not.toBe('');
	});
});
