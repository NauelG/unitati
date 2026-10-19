import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import UserMenu from './UserMenu.svelte';

const { setModeMock } = vi.hoisted(() => ({ setModeMock: vi.fn() }));

// Not under test: mode-watcher touches `localStorage` and `matchMedia`.
vi.mock('mode-watcher', () => ({
	setMode: setModeMock,
	userPrefersMode: { current: 'system' }
}));

const NAME = 'Ada Lovelace';
const EMAIL = 'ada@example.com';

async function openMenu(props: Record<string, unknown> = {}) {
	render(UserMenu, { name: NAME, email: EMAIL, ...props });
	const trigger = screen.getByRole('button', { name: `Menú de usuario de ${NAME}` });
	await fireEvent.keyDown(trigger, { key: 'Enter' });
	await screen.findByRole('menu');
	return trigger;
}

describe('UserMenu', () => {
	beforeEach(() => setModeMock.mockClear());

	it('shows the name and email once opened', async () => {
		await openMenu();

		expect(screen.getByText(NAME)).toBeTruthy();
		expect(screen.getByText(EMAIL)).toBeTruthy();
	});

	it('offers the theme as a radio group with the current mode checked', async () => {
		await openMenu();

		const system = screen.getByRole('menuitemradio', { name: 'Sistema' });
		expect(system.getAttribute('aria-checked')).toBe('true');
		expect(screen.getByRole('menuitemradio', { name: 'Oscuro' }).getAttribute('aria-checked')).toBe(
			'false'
		);
	});

	it('sets the dark mode when "Oscuro" is chosen', async () => {
		await openMenu();

		await fireEvent.click(screen.getByRole('menuitemradio', { name: 'Oscuro' }));

		expect(setModeMock).toHaveBeenCalledWith('dark');
	});

	it('links to the password change page', async () => {
		await openMenu();

		const link = screen.getByRole('menuitem', { name: 'Cambiar contraseña' });
		expect(link.getAttribute('href')).toBe('/account/password');
	});

	it('signs out with a real POST form submission', async () => {
		await openMenu();
		const form = document.querySelector<HTMLFormElement>('form[action="/sign-out"]');
		expect(form?.method).toBe('post');
		const submit = vi.fn((event: Event) => event.preventDefault());
		form?.addEventListener('submit', submit);

		await fireEvent.click(screen.getByRole('menuitem', { name: 'Cerrar sesión' }));

		await waitFor(() => expect(submit).toHaveBeenCalledOnce());
	});

	it('posts to a custom sign-out action', async () => {
		await openMenu({ signOutAction: '/elsewhere' });

		expect(document.querySelector('form[action="/elsewhere"]')).not.toBeNull();
	});
});
