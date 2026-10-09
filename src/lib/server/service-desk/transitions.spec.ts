import { describe, expect, it } from 'vitest';
import { TICKET_STATUSES } from '#lib/domain/status.js';
import { canTransition, nextStatuses } from './transitions';

describe('the ticket workflow', () => {
	it('refuses to jump from new straight to closed', () => {
		expect(canTransition('new', 'closed')).toBe(false);
	});

	it('walks the happy path one step at a time', () => {
		expect(canTransition('new', 'in_progress')).toBe(true);
		expect(canTransition('in_progress', 'waiting_on_user')).toBe(true);
		expect(canTransition('waiting_on_user', 'resolved')).toBe(true);
		expect(canTransition('resolved', 'closed')).toBe(true);
	});

	it('lets a resolved or closed ticket be reopened, onto in_progress', () => {
		expect(nextStatuses('closed')).toEqual(['in_progress']);
		expect(canTransition('resolved', 'in_progress')).toBe(true);
	});

	it('never transitions a status to itself', () => {
		for (const status of TICKET_STATUSES) {
			expect(canTransition(status, status)).toBe(false);
		}
	});

	it('never goes back to new', () => {
		for (const status of TICKET_STATUSES) {
			expect(canTransition(status, 'new')).toBe(false);
		}
	});
});
