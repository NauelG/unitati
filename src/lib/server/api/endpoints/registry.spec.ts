import { describe, expect, it } from 'vitest';
import { ENDPOINTS } from './index';

/** The registry is the one description of the API (ADR 0022): an entry that is not described cannot ship. */
describe('the endpoint registry', () => {
	it('declares every service-desk use case', () => {
		const ids = ENDPOINTS.map((endpoint) => endpoint.id);

		expect(ids).toEqual(
			expect.arrayContaining([
				'tickets.list',
				'tickets.get',
				'tickets.create',
				'tickets.thread',
				'tickets.comment',
				'tickets.status',
				'tickets.priority',
				'tickets.assign',
				'tickets.queue',
				'tickets.assets.link',
				'tickets.assets.unlink',
				'queues.list'
			])
		);
	});

	it('gives every entry a unique id, a summary, permissions and Zod schemas', () => {
		for (const endpoint of ENDPOINTS) {
			expect(endpoint.summary.trim(), endpoint.id).not.toBe('');
			expect(endpoint.permissions.length, endpoint.id).toBeGreaterThan(0);
			expect(typeof endpoint.input.safeParse, endpoint.id).toBe('function');
			expect(typeof endpoint.output.safeParse, endpoint.id).toBe('function');
		}
		expect(new Set(ENDPOINTS.map((endpoint) => endpoint.id)).size).toBe(ENDPOINTS.length);
	});

	it('never serves a PATCH on tickets: every change to a ticket is a rule', () => {
		expect(ENDPOINTS.filter((endpoint) => endpoint.method === 'PATCH')).toEqual([]);
	});
});
