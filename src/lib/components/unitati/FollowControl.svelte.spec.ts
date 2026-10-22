import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import FollowControl from './FollowControl.svelte';

describe('FollowControl', () => {
	it('renders nothing for somebody who cannot follow', () => {
		const { container } = render(FollowControl, { follow: { canFollow: false } });
		expect(container.querySelector('button')).toBeNull();
	});

	it('offers Seguir, and Siguiendo once following, with the count', () => {
		const state = { canFollow: true as const, participant: false, followerCount: 3 };
		const { container, unmount } = render(FollowControl, {
			follow: { ...state, following: false }
		});
		expect(screen.getByRole('button', { name: 'Seguir' })).toBeTruthy();
		expect(container.querySelector('form')?.getAttribute('action')).toBe('?/follow');
		expect(screen.getByText('3 personas siguen esto')).toBeTruthy();
		unmount();

		const again = render(FollowControl, { follow: { ...state, following: true } });
		expect(screen.getByRole('button', { name: 'Siguiendo' })).toBeTruthy();
		expect(again.container.querySelector('form')?.getAttribute('action')).toBe('?/unfollow');
	});

	it('shows a disabled Participas with the reason for a participant', () => {
		render(FollowControl, {
			follow: { canFollow: true, participant: true, following: false, followerCount: 1 }
		});
		const button = screen.getByRole('button', { name: 'Participas' }) as HTMLButtonElement;
		expect(button.disabled).toBe(true);
		expect(screen.getByText('Te llegan sus avisos como participante')).toBeTruthy();
		expect(screen.getByText('1 persona sigue esto')).toBeTruthy();
	});
});
