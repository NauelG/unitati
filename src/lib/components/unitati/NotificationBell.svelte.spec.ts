import { fireEvent, render, screen } from '@testing-library/svelte';
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

	it('links the panel to the notification preferences', async () => {
		// The popover opens on its own schedule; `findBy` polls on real timers.
		vi.useRealTimers();
		fetchMock.mockImplementation(async (url: string) =>
			url === '/notifications/recent' ? Response.json({ items: [] }) : Response.json({ count: 0 })
		);
		render(NotificationBell, { count: 0, inboxHref: '/notifications' });

		await fireEvent.click(screen.getByRole('button', { name: 'Notificaciones, 0 sin leer' }));

		const link = await screen.findByRole('link', { name: 'Preferencias de notificaciones' });
		expect(link.getAttribute('href')).toBe('/account/notifications');
	});
});
