/**
 * What the page under the palette can do right now, for the palette's "Acciones"
 * group. A page announces an action only while it can actually run it, so the
 * palette hides it (rather than offering a no-op) on a task whose project is
 * archived or whose viewer may not manage projects.
 */
export const paletteContext = $state<{ movableTaskTag: string | null }>({ movableTaskTag: null });

/** Window event the palette fires and the task record listens for. */
export const MOVE_TASK_EVENT = 'unitati:move-task';
