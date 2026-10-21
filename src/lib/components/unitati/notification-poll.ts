/**
 * Keeps the bell's unread count fresh without a socket (ADR 0040): poll every
 * 60 s **while the tab is visible**, once when it becomes visible again, and not
 * at all while it is hidden. A background tab that polls is a request per minute
 * per forgotten tab, for a number nobody is looking at.
 *
 * No request on start: the layout load already carries the count.
 */
export const POLL_INTERVAL_MS = 60_000;

export interface PollOptions {
	/** Resolves to the count, or `null` when the request failed (the old count stays). */
	fetchCount: () => Promise<number | null>;
	onCount: (count: number) => void;
	intervalMs?: number;
	/** Injected so a test needs no real document. */
	doc?: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
}

/** Returns a function that stops polling and removes the listener. */
export function startUnreadPolling(options: PollOptions): () => void {
	const { fetchCount, onCount, intervalMs = POLL_INTERVAL_MS, doc = document } = options;
	let timer: ReturnType<typeof setInterval> | undefined;
	let stopped = false;

	const tick = async () => {
		const count = await fetchCount();
		if (!stopped && count !== null) onCount(count);
	};

	const start = () => {
		if (timer === undefined) timer = setInterval(() => void tick(), intervalMs);
	};
	const stop = () => {
		if (timer !== undefined) clearInterval(timer);
		timer = undefined;
	};

	const onVisibility = () => {
		if (doc.visibilityState === 'visible') {
			void tick();
			start();
		} else {
			stop();
		}
	};

	if (doc.visibilityState === 'visible') start();
	doc.addEventListener('visibilitychange', onVisibility);

	return () => {
		stopped = true;
		stop();
		doc.removeEventListener('visibilitychange', onVisibility);
	};
}
