import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import type { StateGroup } from '#lib/domain/status.js';
import ProjectProgress from './ProjectProgress.svelte';

function counts(partial: Partial<Record<StateGroup, number>>): Record<StateGroup, number> {
	return { backlog: 0, unstarted: 0, started: 0, completed: 0, cancelled: 0, ...partial };
}

describe('ProjectProgress', () => {
	it('fills completed ÷ (total − cancelled) and ignores cancelled tasks', () => {
		render(ProjectProgress, { counts: counts({ completed: 1, started: 1, cancelled: 2 }) });

		const bar = screen.getByRole('progressbar');
		expect(bar.getAttribute('aria-valuenow')).toBe('50');
	});

	it('states the count per group in its accessible label', () => {
		render(ProjectProgress, {
			counts: counts({ backlog: 2, started: 1, completed: 3, cancelled: 1 })
		});

		const label = screen.getByRole('progressbar').getAttribute('aria-label')!;
		expect(label).toContain('50 %');
		expect(label).toContain('2 Backlog');
		expect(label).toContain('1 En curso');
		expect(label).toContain('3 Completado');
		expect(label).toContain('1 Cancelado');
		expect(label).not.toContain('Sin empezar');
	});

	it('renders an explicit empty state instead of 0 % when there are no tasks', () => {
		render(ProjectProgress, { counts: counts({}) });

		expect(screen.queryByRole('progressbar')).toBeNull();
		expect(screen.getByText('Sin tareas todavía')).toBeTruthy();
		expect(screen.queryByText(/0 %/)).toBeNull();
	});

	it('renders an empty state when every task is cancelled', () => {
		render(ProjectProgress, { counts: counts({ cancelled: 3 }) });

		expect(screen.queryByRole('progressbar')).toBeNull();
		expect(screen.getByText('Sin tareas todavía')).toBeTruthy();
	});
});
