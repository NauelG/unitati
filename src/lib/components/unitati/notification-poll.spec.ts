import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POLL_INTERVAL_MS, startUnreadPolling } from './notification-poll';

function fakeDocument(state: 'visible' | 'hidden') {
	const target = new EventTarget();
	const doc = {
		visibilityState: state,
		addEventListener: target.addEventListener.bind(target),
		removeEventListener: target.removeEventListener.bind(target)
	};
	return {
		doc: doc as unknown as Document,
		set(next: 'visible' | 'hidden') {
			doc.visibilityState = next;
			target.dispatchEvent(new Event('visibilitychange'));
		}
	};
}

describe('startUnreadPolling', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('polls every minute while visible and reports the count', async () => {
		const { doc } = fakeDocument('visible');
		const fetchCount = vi.fn().mockResolvedValue(3);
		const onCount = vi.fn();
		const stop = startUnreadPolling({ fetchCount, onCount, doc });

		expect(fetchCount).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
		expect(fetchCount).toHaveBeenCalledTimes(1);
		expect(onCount).toHaveBeenCalledWith(3);

		await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);
		expect(fetchCount).toHaveBeenCalledTimes(3);
		stop();
	});

	it('stops while hidden and refreshes once when it becomes visible again', async () => {
		const { doc, set } = fakeDocument('visible');
		const fetchCount = vi.fn().mockResolvedValue(1);
		const stop = startUnreadPolling({ fetchCount, onCount: vi.fn(), doc });

		set('hidden');
		await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 5);
		expect(fetchCount).not.toHaveBeenCalled();

		set('visible');
		await vi.advanceTimersByTimeAsync(0);
		expect(fetchCount).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
		expect(fetchCount).toHaveBeenCalledTimes(2);
		stop();
	});

	it('does not poll when it starts hidden, and keeps the old count on a failed request', async () => {
		const hidden = fakeDocument('hidden');
		const fetchCount = vi.fn().mockResolvedValue(null);
		const onCount = vi.fn();
		const stop = startUnreadPolling({ fetchCount, onCount, doc: hidden.doc });

		await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);
		expect(fetchCount).not.toHaveBeenCalled();

		hidden.set('visible');
		await vi.advanceTimersByTimeAsync(0);
		expect(fetchCount).toHaveBeenCalledTimes(1);
		expect(onCount).not.toHaveBeenCalled();
		stop();
	});

	it('stops for good once stopped', async () => {
		const { doc, set } = fakeDocument('visible');
		const fetchCount = vi.fn().mockResolvedValue(0);
		startUnreadPolling({ fetchCount, onCount: vi.fn(), doc })();

		set('hidden');
		set('visible');
		await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
		expect(fetchCount).not.toHaveBeenCalled();
	});
});
