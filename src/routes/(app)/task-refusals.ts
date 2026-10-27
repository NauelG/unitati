import { m } from '#lib/paraglide/messages.js';
import type {
	MoveTaskFailure,
	ParentFailure,
	SetTaskParentFailure
} from '#lib/server/projects/index.js';

/**
 * The words for a refused task write, shared by the board (`/projects/[tag]`) and
 * the task screen, so a subtask rule reads the same on both (#59).
 * `task_not_found` is not here: the caller answers it with a 404.
 */

const moveMessages: Record<
	Exclude<MoveTaskFailure, 'task_not_found' | { kind: string }>,
	() => string
> = {
	project_archived: m.project_error_archived,
	state_not_found: m.task_error_state_missing,
	invalid_neighbours: m.action_error_invalid,
	parent_closed: m.task_error_parent_closed
};

export function moveRefusal(failure: Exclude<MoveTaskFailure, 'task_not_found'>): string {
	if (typeof failure === 'object') {
		return m.task_error_open_subtasks({
			tasks: failure.subtasks.map((task) => task.taskTag).join(', ')
		});
	}
	return moveMessages[failure]();
}

/** Why a task cannot go under a parent: at creation (`ParentFailure`) or later. */
export const parentRefusals: Record<
	ParentFailure | Exclude<SetTaskParentFailure, 'task_not_found'>,
	() => string
> = {
	project_archived: m.project_error_archived,
	parent_not_found: m.task_error_parent_missing,
	parent_is_subtask: m.task_error_parent_is_subtask,
	parent_closed: m.task_error_parent_closed,
	same_task: m.task_error_same_task,
	task_has_subtasks: m.task_error_has_subtasks
};
