import { render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import TaskBoard from './TaskBoard.svelte';
import TaskCard from './TaskCard.svelte';
import type { BoardState, BoardTask } from './board.js';

vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));
vi.mock('svelte-sonner', () => ({ toast: { error: () => {} } }));

const base: BoardTask = {
	id: '1',
	stateId: 's-todo',
	taskTag: 'TSK-0001',
	title: 'Migrate the mail server',
	dueDate: null,
	assignees: []
};

describe('TaskCard and subtasks (ADR 0055)', () => {
	it('shows a subtask’s parent as a chip that links to it', () => {
		const { container } = render(TaskCard, {
			task: { ...base, taskTag: 'TSK-0002', parent: { taskTag: 'TSK-0001' } }
		});

		const chip = container.querySelector<HTMLAnchorElement>('[data-parent-chip]');
		expect(chip?.textContent?.trim()).toBe('TSK-0001');
		expect(chip?.getAttribute('href')).toBe('/tasks/TSK-0001');
		expect(chip?.getAttribute('aria-label')).toBe('Subtarea de TSK-0001');
	});

	it('shows nothing when the parent is not visible, and no count without children', () => {
		const { container } = render(TaskCard, {
			task: { ...base, parent: null, subtasks: { total: 0, completed: 0, restricted: 0 } }
		});

		expect(container.querySelector('[data-parent-chip]')).toBeNull();
		expect(container.querySelector('[data-subtasks]')).toBeNull();
	});

	it('shows a parent’s completed/total, and the hidden children as +n', () => {
		const { container, rerender } = render(TaskCard, {
			task: { ...base, subtasks: { total: 3, completed: 1, restricted: 0 } }
		});

		const count = container.querySelector('[data-subtasks]');
		expect(count?.textContent).toContain('1/3');
		expect(count?.textContent).toContain('1 de 3 subtareas completadas');
		expect(container.querySelector('[data-subtasks-restricted]')).toBeNull();

		rerender({ task: { ...base, subtasks: { total: 1, completed: 0, restricted: 2 } } });
		expect(container.querySelector('[data-subtasks]')?.textContent).toContain('0/1');
		expect(container.querySelector('[data-subtasks-restricted]')?.textContent).toContain('+2');
	});

	it('puts every subtask on its own card, in its own state’s column', () => {
		const states: BoardState[] = [
			{ id: 's-todo', name: 'Por hacer', group: 'unstarted', position: 1 },
			{ id: 's-doing', name: 'En curso', group: 'started', position: 1 }
		];
		const tasks: BoardTask[] = [
			{ ...base, subtasks: { total: 2, completed: 0, restricted: 0 } },
			{ ...base, id: '2', taskTag: 'TSK-0002', parent: { taskTag: 'TSK-0001' } },
			{
				...base,
				id: '3',
				stateId: 's-doing',
				taskTag: 'TSK-0003',
				parent: { taskTag: 'TSK-0001' }
			}
		];

		const { container } = render(TaskBoard, { states, tasks, editable: false });

		const todo = container.querySelector('[data-board-column="s-todo"]')!;
		const doing = container.querySelector('[data-board-column="s-doing"]')!;
		expect(todo.querySelectorAll('[data-task-card]')).toHaveLength(2);
		expect(doing.querySelector('[data-task-card="TSK-0003"] [data-parent-chip]')).not.toBeNull();
		expect(
			todo.querySelector('[data-task-card="TSK-0001"] [data-subtasks]')?.textContent
		).toContain('0/2');
	});
});
