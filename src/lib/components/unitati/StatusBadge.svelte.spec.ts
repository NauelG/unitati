import { render } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import StatusBadge from './StatusBadge.svelte';

const PULSE = 'animate-[ut-badge-pulse_160ms_var(--ease-out)]';

function badge(container: HTMLElement): HTMLElement {
	return container.querySelector('span')!;
}

describe('StatusBadge pulse', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		// jsdom has no layout; run the frame callback on the fake clock.
		vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
			setTimeout(() => callback(0), 0)
		);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('does not pulse on mount', async () => {
		const { container } = render(StatusBadge, { status: 'urgent' });
		await vi.advanceTimersByTimeAsync(50);
		expect(badge(container).className).not.toContain(PULSE);
	});

	it('pulses once when it mounts flagged as an arrival, then stops', async () => {
		const { container } = render(StatusBadge, { status: 'urgent', arrived: true });
		await vi.advanceTimersByTimeAsync(10);
		expect(badge(container).className).toContain(PULSE);

		await vi.advanceTimersByTimeAsync(200);
		expect(badge(container).className).not.toContain(PULSE);
	});

	it('pulses when a mounted badge is newly flagged as an arrival', async () => {
		const { container, rerender } = render(StatusBadge, { status: 'high', arrived: false });
		await rerender({ status: 'high', arrived: true });
		flushSync();
		await vi.advanceTimersByTimeAsync(10);
		expect(badge(container).className).toContain(PULSE);
	});
});
