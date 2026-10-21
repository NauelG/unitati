import { render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NotificationBell from './NotificationBell.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidateAll: vi.fn() }));

function setVisibility(state: 'visible' | 'hidden') {
	Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
	document.dispatchEvent(new Event('visibilitychange'));
}

describe('NotificationBell', () => {
	const fetchMock = vi.fn();

	beforeEach(() => {
		vi.useFakeTimers();
		fetchMock.mockReset().mockResolvedValue(Response.json({ count: 7 }));
		vi.stubGlobal('fetch', fetchMock);
		setVisibility('visible');
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('labels the button with the count and caps the badge at 99+', () => {
		render(NotificationBell, { count: 120, inboxHref: '/notifications' });
		const button = screen.getByRole('button', { name: 'Notificaciones, 120 sin leer' });
		expect(button.textContent).toContain('99+');
	});

	it('refreshes every minute while visible and stops while hidden', async () => {
		render(NotificationBell, { count: 1, inboxHref: '/notifications' });

		await vi.advanceTimersByTimeAsync(60_000);
		expect(fetchMock).toHaveBeenCalledWith('/notifications/unread', expect.anything());
		expect(screen.getByRole('button', { name: 'Notificaciones, 7 sin leer' })).toBeTruthy();

		setVisibility('hidden');
		fetchMock.mockClear();
		await vi.advanceTimersByTimeAsync(180_000);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
