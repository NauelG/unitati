import { STATE_GROUPS, type StateGroup } from '#lib/domain/status.js';

/**
 * The board's logic that is plain TypeScript (#125), so it is testable without
 * a browser or a drag. Two triggers — the "Move to" menu and a drop — and one
 * path: both end in `BoardMover`'s `submit`, which is the `moveTask` form.
 */

export type BoardState = { id: string; name: string; group: StateGroup; position: number };
export type BoardItem = { id: string; stateId: string };
/** What a card shows. A `TaskView` satisfies it as it is. */
export type BoardTask = BoardItem & {
	taskTag: string;
	title: string;
	dueDate: string | null;
	assignees: { personId: string; fullName: string }[];
};
export type BoardColumnModel<T extends BoardItem> = { state: BoardState; items: T[] };

/** One column per state, ordered by (group, position); tasks keep the order they arrive in. */
export function buildColumns<T extends BoardItem>(
	states: readonly BoardState[],
	tasks: readonly T[]
): BoardColumnModel<T>[] {
	return [...states]
		.sort(
			(a, b) =>
				STATE_GROUPS.indexOf(a.group) - STATE_GROUPS.indexOf(b.group) || a.position - b.position
		)
		.map((state) => ({ state, items: tasks.filter((task) => task.stateId === state.id) }));
}

export type DropNeighbours = { before?: string; after?: string };

/** Where a card sits in its column: `after` is the card above it, `before` the card below. */
export function neighboursOf(items: readonly { id: string }[], movedId: string): DropNeighbours {
	const index = items.findIndex((item) => item.id === movedId);
	const above = items[index - 1]?.id;
	const below = items[index + 1]?.id;
	return {
		...(above === undefined ? {} : { after: above }),
		...(below === undefined ? {} : { before: below })
	};
}

/** The optimistic half of a menu move: the task leaves its column and joins the end of the target. */
export function moveLocally<T extends BoardItem>(
	columns: readonly BoardColumnModel<T>[],
	taskId: string,
	toStateId: string
): BoardColumnModel<T>[] {
	const moving = columns.flatMap((column) => column.items).find((item) => item.id === taskId);
	if (!moving) return [...columns];

	return columns.map((column) => {
		const rest = column.items.filter((item) => item.id !== taskId);
		return {
			state: column.state,
			items: column.state.id === toStateId ? [...rest, { ...moving, stateId: toStateId }] : rest
		};
	});
}

export type MoveRequest = { taskId: string; stateId: string } & DropNeighbours;

export interface BoardMover {
	/** "Move to": no neighbours, so the end of the column. */
	fromMenu(taskId: string, stateId: string): void;
	/** A drop: `items` is the target column as it reads after the drop. */
	fromDrop(taskId: string, stateId: string, items: readonly { id: string }[]): void;
}

/** Both triggers, one `submit`. */
export function createBoardMover(submit: (request: MoveRequest) => void): BoardMover {
	return {
		fromMenu: (taskId, stateId) => submit({ taskId, stateId }),
		fromDrop: (taskId, stateId, items) =>
			submit({ taskId, stateId, ...neighboursOf(items, taskId) })
	};
}
