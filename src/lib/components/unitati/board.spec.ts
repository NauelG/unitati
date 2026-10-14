import { describe, expect, it, vi } from 'vitest';
import {
	buildColumns,
	createBoardMover,
	moveLocally,
	neighboursOf,
	resolveCollapsed,
	type BoardState
} from './board.js';

const states: BoardState[] = [
	{ id: 's-done', name: 'Hecho', group: 'completed', position: 1 },
	{ id: 's-doing', name: 'En curso', group: 'started', position: 1 },
	{ id: 's-todo', name: 'Por hacer', group: 'unstarted', position: 2 },
	{ id: 's-next', name: 'Siguiente', group: 'unstarted', position: 1 }
];

const task = (id: string, stateId: string) => ({ id, stateId });

describe('buildColumns', () => {
	it('orders columns by (group, position), whatever order the states arrive in', () => {
		const columns = buildColumns(states, []);

		expect(columns.map((column) => column.state.id)).toEqual([
			's-next',
			's-todo',
			's-doing',
			's-done'
		]);
	});

	it('keeps the order of the tasks inside each column and leaves empty columns in place', () => {
		const columns = buildColumns(states, [
			task('a', 's-doing'),
			task('b', 's-todo'),
			task('c', 's-doing')
		]);

		expect(columns.map((column) => column.items.map((item) => item.id))).toEqual([
			[],
			['b'],
			['a', 'c'],
			[]
		]);
	});
});

describe('neighboursOf', () => {
	const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

	it('names the card above as `after` and the card below as `before`', () => {
		expect(neighboursOf(items, 'b')).toEqual({ after: 'a', before: 'c' });
	});

	it('names only what exists at the edges of a column', () => {
		expect(neighboursOf(items, 'a')).toEqual({ before: 'b' });
		expect(neighboursOf(items, 'c')).toEqual({ after: 'b' });
		expect(neighboursOf([{ id: 'a' }], 'a')).toEqual({});
	});
});

describe('moveLocally', () => {
	it('puts the task at the end of the target column when no neighbours are given', () => {
		const columns = buildColumns(states, [task('a', 's-doing'), task('b', 's-todo')]);

		const moved = moveLocally(columns, 'a', 's-todo');

		expect(moved.map((column) => column.items.map((item) => item.id))).toEqual([
			[],
			['b', 'a'],
			[],
			[]
		]);
		expect(moved[1].items[1].stateId).toBe('s-todo');
	});
});

describe('one path to moveTask', () => {
	it('submits the same shape from the menu and from a drop', () => {
		const submit = vi.fn();
		const mover = createBoardMover(submit);

		mover.fromMenu('a', 's-done');
		mover.fromDrop('a', 's-done', [{ id: 'x' }, { id: 'a' }, { id: 'y' }]);

		expect(submit).toHaveBeenNthCalledWith(1, { taskId: 'a', stateId: 's-done' });
		expect(submit).toHaveBeenNthCalledWith(2, {
			taskId: 'a',
			stateId: 's-done',
			after: 'x',
			before: 'y'
		});
	});

	it('submits a drop that lands at the end of an empty column with no neighbours', () => {
		const submit = vi.fn();

		createBoardMover(submit).fromDrop('a', 's-done', [{ id: 'a' }]);

		expect(submit).toHaveBeenCalledWith({ taskId: 'a', stateId: 's-done' });
	});
});

describe('resolveCollapsed', () => {
	it('honours a stored choice over how many tasks the column holds', () => {
		expect(resolveCollapsed('s', 3, { s: 'collapsed' })).toBe(true);
		expect(resolveCollapsed('s', 0, { s: 'expanded' })).toBe(false);
	});

	it('collapses an empty column and keeps a populated one open when nothing is stored', () => {
		expect(resolveCollapsed('s', 0, {})).toBe(true);
		expect(resolveCollapsed('s', 2, {})).toBe(false);
	});

	it('reads only the entry of its own state', () => {
		expect(resolveCollapsed('s', 2, { other: 'collapsed' })).toBe(false);
	});
});
