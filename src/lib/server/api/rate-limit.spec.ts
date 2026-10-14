import { describe, expect, it } from 'vitest';
import { createRateLimiter, RATE_LIMIT_PER_MINUTE } from './rate-limit';

describe('rate limiter', () => {
	it('allows 120 requests per key per minute and refuses the 121st', () => {
		const limit = createRateLimiter();
		const now = 1_000_000;

		for (let request = 1; request <= RATE_LIMIT_PER_MINUTE; request += 1) {
			expect(limit('key-a', now).allowed).toBe(true);
		}
		expect(RATE_LIMIT_PER_MINUTE).toBe(120);
		expect(limit('key-a', now)).toEqual({ allowed: false, retryAfterSeconds: 60 });
	});

	it('counts each key on its own', () => {
		const limit = createRateLimiter();
		for (let request = 0; request < RATE_LIMIT_PER_MINUTE; request += 1) limit('key-a', 0);

		expect(limit('key-a', 0).allowed).toBe(false);
		expect(limit('key-b', 0).allowed).toBe(true);
	});

	it('tells the caller how many whole seconds remain in the window', () => {
		const limit = createRateLimiter();
		for (let request = 0; request < RATE_LIMIT_PER_MINUTE; request += 1) limit('key-a', 0);

		expect(limit('key-a', 45_500)).toEqual({ allowed: false, retryAfterSeconds: 15 });
	});

	it('starts a fresh window once the minute has passed', () => {
		const limit = createRateLimiter();
		for (let request = 0; request < RATE_LIMIT_PER_MINUTE; request += 1) limit('key-a', 0);

		expect(limit('key-a', 60_000).allowed).toBe(true);
	});
});
