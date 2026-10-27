# 0055. Subtasks: one level under a task, in the same project

- **Status:** accepted
- **Date:** 2026-10-27
- **Issue:** [#59](../../../issues/59)

## Context

Teams split a task into smaller pieces of work that still read as one: "Migrate the mail server"
holds "Export mailboxes", "Switch MX records", "Decommission the old host". Today that is two or
more unrelated tasks, and nothing on the board says they belong together. Plane, Linear, Jira and
GitHub all have sub-issues.

The work was deferred from MVP slice 5 (#10) and sits in `tier:post-v1`, but its shape is settled
now so nobody redesigns it under pressure. Several decisions already constrain it:

- Codes are flat ([ADR 0010](0010-human-readable-record-codes.md)): a subtask carries its own
  `TSK-####`, never `TSK-0045.1`, because a hierarchical code stops being true when the subtask is
  promoted or moved.
- Code depends on a state's **group**, never its name; a task is never deleted, it goes to a
  `cancelled` state.
- `moveTask` is the only writer of `state_id` and `position`, `reparentTask` the only writer of
  `project_id`, and every write locks the project row
  ([ADR 0021](0021-board-positions-and-project-write-lock.md)).
- What a viewer may not see does not exist for them: `not_found`, never a 403
  ([ADR 0042](0042-per-project-visibility.md)).
- Milestone progress is computed over non-cancelled tasks, on read
  ([ADR 0054](0054-milestones.md)); time totals are computed on read
  ([ADR 0052](0052-time-entries-in-a-cross-cutting-domain.md)).

## Decision

1. **A subtask is a task with a parent.** Same table, same code sequence, same states, same board,
   same permissions. `tasks.parent_task_id` is nullable; the hierarchy is a relation between tasks,
   not part of their identity.
2. **Parent and child are always in the same project.** The database enforces it through a composite
   foreign key `tasks_parent_same_project_fk (project_id, parent_task_id) → tasks (project_id, id)`,
   which needs `unique (project_id, id)` on `tasks`, the shape of `tasks_milestone_same_project_fk`.
   With `MATCH SIMPLE` a task without a parent is not checked. The migration is hand-edited to
   `ON DELETE SET NULL ("parent_task_id")` for the same reason ADR 0054 §3 gives. A `CHECK` refuses
   a task that is its own parent.
3. **One level, in both directions.** A subtask cannot have subtasks, and a task that has subtasks
   cannot become one. This is not a database constraint (it would need a trigger); the domain
   checks it. Because parent and child share a project, the project lock already serialises every
   pair of writes that could produce depth 2 (A under B while B goes under C).
4. **One writer.** `setTaskParent` is the only function that writes `parent_task_id` after
   creation; `null` promotes the subtask to a top-level task. `updateTask` has no key for it
   ([ADR 0022](0022-api-layer-and-api-keys.md): a rule-bound change is an action, not a field in a
   `PATCH`). `openTask` accepts a
   parent at creation, under the same rules.
5. **A subtask counts as a task everywhere.** Project progress, milestone status and progress,
   "my open tasks", `/tasks`, search, notifications to linked tickets: parents and children alike,
   with no special case. Counting only leaves, or only top-level tasks, would make progress jump
   when a child is added or removed with no work done.
6. **A parent cannot close over open children, and a closed parent admits no open children.** Here
   _closed_ means a state in group `completed` or `cancelled`, and _open_ every other group,
   `backlog` included (wider than `OPEN_TASK_GROUPS`, which answers "my own work in progress").
   - `moveTask` refuses `open_subtasks`, listing them, when a parent enters a closed group while
     any child is open. It applies to `completed` and `cancelled` alike.
   - `moveTask` refuses `parent_closed` when a child leaves a closed group while its parent is
     closed; `openTask` and `setTaskParent` refuse it when an open task would land under a closed
     parent.
   - Nothing cascades. To work on a child again, reopen the parent first.
7. **Due dates are independent.** A child due after its parent is allowed; the task screen shows a
   non-blocking warning. ADR 0054 rejected the same cross-check for milestones: it forces an editing
   order.
8. **Moving between projects keeps families whole.** `moveTaskToProject` on a **subtask** detaches
   it from its parent first, then moves it. On a **parent** it moves every child in the same
   transaction, each with its own `task.project.changed` and its milestone cleared, and checks
   `assignees_not_members` for the whole family. `reparentTask` (project merge, #61) must keep the
   composite key valid at every statement, so families arrive intact.
9. **Visibility follows each task (ADR 0042).** An employee who sees a child but not its parent
   gets `parent: null`; one who sees a parent but not all its children gets the visible ones plus a
   `restricted` count, the pattern `links` uses in `relatedTo`. Seeing one task never grants access
   to its relatives.
10. **The parent shows two figures, never one.** `subtasks: { total, completed, restricted }`, where
    `total` and `completed` cover visible, non-cancelled children (the milestone formula). Time
    reads `{ ownMinutes, withSubtasksMinutes }`, both computed on read by the `time` domain, and the
    second includes cancelled children because that time was spent. `projectTime` and the CSV stay
    one row per entry, so nothing is counted twice. Every time viewer holds `time.log` and sees the
    whole project (employees hold neither time permission), so the sum never includes hours of a
    child the viewer could not see.
11. **A subtask created from its parent inherits the parent's milestone**, nothing else: not
    assignees (that would send assignment mail nobody asked for), not the due date, not the state.
    `setTaskParent` on an existing task does not touch its milestone.
12. **History hangs off the child only.** `task.parent.changed` with snapshots
    `{ from: {taskTag,title}|null, to: {taskTag,title}|null }`. A task born as a subtask records
    `task.created` with `parent`, no separate entry (the "born in a milestone" precedent). The
    parent's list of children is a live read.
13. **On the board every subtask is its own card** in its state's column, with a `↳ TSK-####`
    chip; the parent card shows `completed/total`. Columns are states, so a `started` child nested
    under an `unstarted` parent would have nowhere to live.
14. **No new permission.** Writes need `projects.manage`; reads follow the task's scope.

## Considered options

- **Arbitrary depth.** Rejected: it brings aggregate progress, cascading rules and a tree widget.
  That is a slice, not a column.
- **`TSK-0045.1` codes.** Rejected in ADR 0010.
- **Subtasks in another project.** Rejected: every parent change would lock two projects, and depth
  1 could no longer be serialised by one lock.
- **Closing a parent closes its children** (for both groups, or only for `cancelled`). Rejected: an
  organisation may have several states in one group, so the cascade has to guess a target, and it
  writes to records nobody touched. Refusing is explicit and reversible.
- **Checking open children only when the parent closes.** Rejected: closing the parent and then
  reopening a child would skip the rule in two clicks.
- **Reopening the parent automatically** when a child reopens. Rejected for the same reason as the
  cascade: which `started` state?
- **Nesting cards on the board, or a nested/flat toggle.** Rejected: columns are states; a toggle
  doubles the UI work without a use case.
- **Drag-to-nest on the board.** Rejected: it overloads the gesture that moves a card between
  columns. "Set parent" covers it.
- **A hard due-date constraint.** Rejected: bringing a parent's date forward would be blocked by its
  children.
- **A single summed time figure on the parent.** Rejected: nobody can tell whose hours they are, and
  anyone summing per task from outside counts them twice.
- **`task.subtask.added|removed` on the parent as well.** Rejected: one change would write to two or
  three timelines (old parent, new parent, child). The relation is live; the past hangs off one side.
- **Landing the column early, unused.** Rejected: a nullable column without rules invites writes
  without rules.
- **A field in the `PATCH`.** Rejected by ADR 0022.

## Consequences

- `tasks.parent_task_id`, its composite foreign key, `unique (project_id, id)` on `tasks` and the
  `task.parent.changed` verb are owned by `projects`. `time` reads the column through
  `projects/schema.ts`, which `direction-time` already allows; no entry in
  `.dependency-cruiser-known-violations.json`.
- `moveTask` gains two refusals (`open_subtasks`, `parent_closed`) that every surface reaches:
  board, task screen and `POST /tasks/{tag}/state`.
- The API gains `POST|DELETE /tasks/{tag}/parent`, `parentTag` on task creation, `?parent=` on
  `GET /tasks`, and `parent`, `subtasks` and (single task only) `time` on the task payload.
- Out of scope, each for its own issue if needed: escalating a ticket straight into a subtask, a
  notification when every subtask is completed, a "top-level only" filter, and everything listed
  under Considered options.

## Amendment 2026-10-27: the parent snapshot carries its id, and one writer is shared

Two points of the decision could not be built exactly as written while building #59.

- **§12, the snapshot.** `task.parent.changed` and `task.created`'s `parent` carry
  `{ taskId, taskTag, title }`, not `{ taskTag, title }`. A subtask's history names its parent, and
  §9 says seeing a child never grants sight of the parent: an employee assigned to the child alone
  must not read the parent's code or title there (ADR 0042, Leaks §2). History is redacted at read
  time, which needs to know which task an entry names; the code cannot say it, because a code is
  editable (ADR 0010) and may since belong to another task. `projects`' `redactWorkEntries` blanks
  the snapshot for such a reader ("una tarea restringida"), and `taskTimeline` applies it. The API
  timeline drops the id, as it drops every internal id.
- **§4, one writer.** `setTaskParent` is the only way to change `parent_task_id` after creation,
  and §8 also detaches a subtask moved to another project. Both go through one internal writer,
  `writeParent`, which records `task.parent.changed`; nothing else writes the column.
