import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import TaskBoard from './TaskBoard.svelte';
import type { BoardState, BoardTask } from './board.js';

// Not under test: SvelteKit's form enhancement and the toast, which need a runtime jsdom lacks.
vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));
vi.mock('svelte-sonner', () => ({ toast: { error: () => {} } }));

const states: BoardState[] = [
	{ id: 's-todo', name: 'Por hacer', group: 'unstarted', position: 1 },
	{ id: 's-doing', name: 'En curso', group: 'started', position: 1 },
	{ id: 's-done', name: 'Hecho', group: 'completed', position: 1 }
];

const person = (name: string) => ({ personId: name, fullName: name });
const task = (id: string, stateId: string, assignees = [person('Ada Lovelace')]): BoardTask => ({
	id,
	stateId,
	taskTag: `TSK-${id}`,
	title: `Task ${id}`,
	dueDate: null,
	assignees
});

const tasks = [task('1', 's-todo'), task('2', 's-todo', [])];

describe('TaskBoard', () => {
	it('renders one column per state, with an empty one collapsed to a strip with a 0', () => {
		const { container } = render(TaskBoard, { states, tasks, editable: true });

		expect(container.querySelectorAll('[data-board-column]')).toHaveLength(3);
		const empty = container.querySelector('[data-board-column="s-doing"]')!;
		expect(empty.getAttribute('data-collapsed')).toBe('true');
		expect(empty.textContent).toContain('En curso');
		expect(empty.textContent).toContain('0');
		expect(
			container.querySelector('[data-board-column="s-todo"]')!.getAttribute('data-collapsed')
		).toBe('false');
	});

	it('keeps the collapsed column a drop zone when the board is editable', () => {
		const { container } = render(TaskBoard, { states, tasks, editable: true });

		expect(
			container.querySelector('[data-board-column="s-doing"] [data-board-dropzone]')
		).not.toBeNull();
	});

	it('gives every card a Move to menu that lists every state but its own', async () => {
		render(TaskBoard, { states, tasks, editable: true });

		const trigger = screen.getByRole('button', { name: /TSK-1/ });
		await fireEvent.keyDown(trigger, { key: 'Enter' });

		const items = await screen.findAllByRole('menuitem');
		expect(items.map((item) => item.textContent?.trim())).toEqual(['En curso', 'Hecho']);
	});

	it('submits the move form with the task and the chosen column, and reaches the form', async () => {
		const submit = vi
			.spyOn(HTMLFormElement.prototype, 'requestSubmit')
			.mockImplementation(function (this: HTMLFormElement) {
				const data = new FormData(this);
				submitted.push(Object.fromEntries([...data.entries()]));
			});
		const submitted: Record<string, FormDataEntryValue>[] = [];
		render(TaskBoard, { states, tasks, editable: true });

		await fireEvent.keyDown(screen.getByRole('button', { name: /TSK-1/ }), { key: 'Enter' });
		await fireEvent.click(await screen.findByRole('menuitem', { name: 'Hecho' }));

		expect(submitted).toEqual([{ taskId: '1', stateId: 's-done', before: '', after: '' }]);
		submit.mockRestore();
	});

	it('opens a quick create for the column it was pressed in', async () => {
		const onquickcreate = vi.fn();
		render(TaskBoard, { states, tasks, editable: true, onquickcreate });

		await fireEvent.click(screen.getByRole('button', { name: 'Nueva tarea en Hecho' }));

		expect(onquickcreate).toHaveBeenCalledWith('s-done');
	});

	it('has no menu, drop zone, move form or quick create when read-only', () => {
		const { container } = render(TaskBoard, { states, tasks, editable: false });

		expect(screen.queryByRole('button')).toBeNull();
		expect(container.querySelector('[data-board-dropzone]')).toBeNull();
		expect(container.querySelector('form')).toBeNull();
		// The cards are still there to read.
		expect(screen.getByText('Task 1')).toBeTruthy();
	});

	it('draws 0, 1 and 3 assignees', () => {
		const three = ['A One', 'B Two', 'C Three'].map(person);
		const { container } = render(TaskBoard, {
			states,
			tasks: [
				task('a', 's-todo', []),
				task('b', 's-todo', [person('Ada Lovelace')]),
				task('c', 's-todo', three)
			],
			editable: false
		});

		const counts = [...container.querySelectorAll('[data-task-card]')].map(
			(card) => card.querySelectorAll('[role="img"]').length
		);
		expect(counts).toEqual([0, 1, 3]);
	});
});
