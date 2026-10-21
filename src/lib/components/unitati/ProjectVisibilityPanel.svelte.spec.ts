import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import ProjectVisibilityPanel from './ProjectVisibilityPanel.svelte';

const members = [
	{ personId: 'p1', fullName: 'Olga Owner', isOwner: true, taskCount: 0 },
	{ personId: 'p2', fullName: 'Mia Member', isOwner: false, taskCount: 2 }
];

const base = { members, candidates: [], errors: {} };

describe('ProjectVisibilityPanel', () => {
	it('lists the members of a members-only project and marks the owner', () => {
		render(ProjectVisibilityPanel, { ...base, visibility: 'members', editable: false });

		expect(screen.getByText('Olga Owner')).toBeTruthy();
		expect(screen.getByText('Mia Member')).toBeTruthy();
		expect(screen.getByText('Responsable')).toBeTruthy();
	});

	it('offers no controls to somebody who cannot manage members', () => {
		render(ProjectVisibilityPanel, { ...base, visibility: 'members', editable: false });

		expect(screen.queryByRole('radio')).toBeNull();
		expect(screen.queryByRole('button')).toBeNull();
	});

	it('lets the owner or an admin switch visibility and remove a member, never the owner', () => {
		render(ProjectVisibilityPanel, { ...base, visibility: 'members', editable: true });

		expect(screen.getAllByRole('radio')).toHaveLength(2);
		expect(screen.getByRole('button', { name: 'Quitar a Mia Member' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Quitar a Olga Owner' })).toBeNull();
	});

	it('shows no member list for an open project', () => {
		render(ProjectVisibilityPanel, { ...base, visibility: 'organisation', editable: false });

		expect(screen.queryByText('Mia Member')).toBeNull();
	});
});
