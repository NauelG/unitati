/**
 * The API's rate limit (ADR 0022): a fixed window per key, held in process.
 *
 * One Node container serves the app (ADR 0001), so shared storage would buy
 * nothing at N=1. If a second container is ever added, the limit moves to
 * Postgres or a shared store, and `rateLimit` below is the only thing that
 * changes.
 */

export const RATE_LIMIT_PER_MINUTE = 120;
const WINDOW_MS = 60_000;

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

interface Window {
	startedAt: number;
	count: number;
}

export function createRateLimiter() {
	const windows = new Map<string, Window>();

	return function limit(key: string, now: number = Date.now()): RateLimitDecision {
		// Expired windows are swept as they are met, so the map cannot grow with
		// every key ever seen.
		if (windows.size > 1000) {
			for (const [id, window] of windows) {
				if (now - window.startedAt >= WINDOW_MS) windows.delete(id);
			}
		}

		let window = windows.get(key);
		if (!window || now - window.startedAt >= WINDOW_MS) {
			window = { startedAt: now, count: 0 };
			windows.set(key, window);
		}

		if (window.count >= RATE_LIMIT_PER_MINUTE) {
			return {
				allowed: false,
				retryAfterSeconds: Math.max(1, Math.ceil((window.startedAt + WINDOW_MS - now) / 1000))
			};
		}

		window.count += 1;
		return { allowed: true };
	};
}

/** The process-wide limiter. */
export const rateLimit = createRateLimiter();
