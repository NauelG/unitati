import { render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RunningTimer from './RunningTimer.svelte';

vi.mock('$app/navigation', () => ({ invalidate: vi.fn() }));

describe('RunningTimer', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-10-25T10:42:30Z'));
	});
	afterEach(() => vi.useRealTimers());

	it('shows the record code and the elapsed time, and links to the record', () => {
		render(RunningTimer, {
			startedAt: '2026-10-25T10:00:00Z',
			tag: 'TCK-0123',
			href: '/service-desk/TCK-0123'
		});

		const link = screen.getByTestId('running-timer');
		expect(link.textContent?.trim()).toBe('TCK-0123 · 00:42');
		expect(link.getAttribute('href')).toBe('/service-desk/TCK-0123');
	});
});
