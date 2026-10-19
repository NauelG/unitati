import { fireEvent, render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import BoardColumn from './BoardColumn.svelte';
import type { BoardState } from './board.js';

const state: BoardState = { id: 's-todo', name: 'Por hacer', group: 'unstarted', position: 1 };

const collapsed = (extra: Record<string, unknown> = {}) =>
	render(BoardColumn, {
		state,
		items: [],
		editable: true,
		onquickcreate: () => {},
		collapsedStates: { 's-todo': 'collapsed' },
		...extra
	});

describe('BoardColumn, collapsed', () => {
	it('renders no quick-create button', () => {
		const { container } = collapsed();

		expect(container.querySelector('[data-board-column]')!.getAttribute('data-collapsed')).toBe(
			'true'
		);
		const labels = [...container.querySelectorAll('button')].map((b) =>
			b.getAttribute('aria-label')
		);
		expect(labels).toHaveLength(1);
		expect(container.querySelector('[data-collapse-toggle]')).not.toBeNull();
	});

	it('stacks its controls in a column', () => {
		const { container } = collapsed();

		expect(container.querySelector('[data-column-controls]')!.classList).toContain('flex-col');
	});

	it('expands when the header strip is clicked', async () => {
		const ontogglecollapse = vi.fn();
		const { container } = collapsed({ ontogglecollapse });

		await fireEvent.click(container.querySelector('[data-collapse-strip]')!);

		expect(ontogglecollapse).toHaveBeenCalledWith('s-todo', 'expanded');
	});

	it('keeps the quick create on an expanded column', () => {
		const { container } = collapsed({ collapsedStates: { 's-todo': 'expanded' } });

		expect(container.querySelectorAll('button')).toHaveLength(2);
		expect(container.querySelector('[data-collapse-strip]')).toBeNull();
	});
});
