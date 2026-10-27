# projects

Projects, tasks, milestones and the state catalogue that kanban boards are drawn from. Later: Gantt. This folder is the domain with **no screens yet** (#121): tables, codes, rules,
who sees what, activity, search. The routes are #123, #124 and #125.

## The shape of it

- **`states`** are the organisation's board columns. The name, order and count belong to the
  organisation; the **group** (`backlog`, `unstarted`, `started`, `completed`, `cancelled`) belongs
  to the product and is fixed when the state is created. **No code may depend on a state's name,
  only on its group.** Every organisation starts with five default states, one per group
  (`defaults.ts` and the migration); after that they are ordinary rows.
- **`projects`** archive, they are never deleted. Progress is derived (`projectProgress`), so there
  is no phase column to keep in step.
- **`tasks`** belong to exactly one project and sit in exactly one state. They go to a `cancelled`
  state rather than being deleted, so a code and its history never disappear.
- **`task_assignees`** is many people per task.
- **`milestones`** are dated checkpoints of one project (`milestones.ts`, ADR 0054): a name and a
  required `start_date`..`target_date` range that groups some of its tasks. A task is in 0 or 1
  milestone **of its own project**, enforced by the domain and by the composite foreign key
  `tasks_milestone_same_project_fk`. Status and progress are derived on read
  (`milestone-status.ts`, `listMilestones`), never stored. They are the one row here that is
  hard-deleted: the database detaches the tasks (`ON DELETE SET NULL ("milestone_id")`).

## Rules worth knowing

- **`reparentTask` clears `milestone_id`.** A milestone belongs to one project, so it cannot follow a
  task to another; the same `UPDATE` that changes `project_id` nulls it (and records
  `task.milestone.changed`), or the composite foreign key would reject the move.

- **Archived means read-only.** Every write on an archived project, or on one of its tasks, fails
  with `project_archived`. `unarchiveProject` is the one write it accepts. Writes lock the project
  row (`writes.ts`), which also serialises concurrent moves.
- **`moveTask` is the only function that changes `state_id` or `position`.** `position` is a
  fractional index (`numeric`): a drop lands on the midpoint of its neighbours, and a gap below
  `1e-6` renumbers the column in the same transaction. The arithmetic is `position.ts`, pure and
  unit-tested. `before` is the task the moved one is dropped before (it ends up below), `after`
  the one it is dropped after (it ends up above).
- **`moveTaskToProject` is the only function that changes `tasks.project_id`.** It locks both
  projects in one statement ordered by `id` and keeps everything else about the task. Its core,
  `reparentTask` (`reparent.ts`, not exported from `index.ts`), assumes the locks are held and
  validates nothing, so merging projects (#61) can call it for every top-level task in its own
  transaction; subtasks travel with their parent (see Subtasks).
- **A state's group never changes.** No update input has a `group` key; changing it would rewrite
  what every past move into the state meant. To change group, create another state.
- **`deleteState` is refused** while a task occupies the state, and when it would leave no state in
  `backlog`, `unstarted` or `started`, because a new task needs somewhere to land.
- **Names in history are snapshots.** `task.state.changed` stores the state names as they read when
  the move happened, so renaming a state does not rewrite the past.

### Subtasks

A subtask is a task with a `parent_task_id` (ADR 0055): same table, same `TSK-####` sequence, same
board, same rules. Here _closed_ means a state in group `completed` or `cancelled`, and _open_ every
other group, `backlog` included (`isClosedGroup`), which is wider than `OPEN_TASK_GROUPS`.

- **Same project, enforced by the database.** `tasks_parent_same_project_fk` is
  `(project_id, parent_task_id) → tasks (project_id, id)`, the shape of
  `tasks_milestone_same_project_fk`, hand-edited to `ON DELETE SET NULL ("parent_task_id")`.
  `tasks_parent_not_self` refuses a task that is its own parent.
- **One level, enforced by the domain** under the project lock: a subtask cannot be a parent
  (`parent_is_subtask`), and a task with subtasks cannot become one (`task_has_subtasks`). Parent and
  child share a project, so that lock serialises every pair of writes that could build depth 2.
- **`setTaskParent` is the only way to change `parent_task_id` after creation**; `null` promotes.
  It and the detach step of `moveTaskToProject` share one writer, `writeParent`. `openTask` accepts
  a parent at creation under the same rules, and the subtask inherits the parent's milestone and
  nothing else. History hangs off the child only: `task.parent.changed`, or `task.created` with
  `parent`. Both snapshot the parent's id, code and title; `redactWorkEntries` blanks them for a
  reader who cannot see the parent (ADR 0042), and `taskTimeline` applies it.
- **No closed parent over open children.** `moveTask` refuses `open_subtasks` (listing them) when a
  parent enters a closed group with an open child, and `parent_closed` when a child leaves a closed
  group under a closed parent; `openTask` and `setTaskParent` refuse an open task under a closed
  parent. Nothing cascades.
- **Families move whole.** `moveTaskToProject` detaches a subtask first; on a parent it moves every
  child too, checking `assignees_not_members` for the whole family. `reparentTask` moves a top-level
  task and its children in **one `UPDATE`**, because the composite key is checked at the end of each
  statement and breaks between two; called on a subtask, it throws.
- **Visibility follows each task.** `TaskView.parent` is `null` when the viewer cannot see the
  parent; `subtasks` counts visible non-cancelled children (`total`, `completed`) and the hidden ones
  (`restricted`). `subtasksOf` lists the visible children. Everything that counts tasks counts
  parents and subtasks alike.

## Who sees what

Two questions in two places, as in the other domains. May they reach the screen? A capability,
gated by `requirePermission` in the route (ADR 0007). Which rows? Data, here: every read starts
from `requireProjectScope` / `requireTaskScope` (`scope.ts`).

- `projects.view` sees the organisation.
- `projects.view.assigned` (the employee) sees the tasks they are assigned to and the projects that
  contain at least one of them. With no directory record, the clause is dropped and the viewer sees
  nothing, not every unassigned task.
- Every write requires `projects.manage` (`requireManage`), as a backstop to the route's gate.
- Attachments follow the record: an employee sees a task's files only on tasks assigned to them,
  and a project's files only on projects that contain one of those tasks. An id they may not read
  is `attachment_not_found`, as is one from another organisation.

## Attachments

Projects and tasks hold files (`attachments.ts`, ADR 0039): `project_attachments` and
`task_attachments`, one row per file, bytes in the shared `Storage`. Same limits as tickets: 5
files per submission, 10 MiB each (`attachments_too_many`, `attachments_too_large`). Adding locks
the project like any write, so an archived project fails with `project_archived`; the bytes are
written first and deleted again if the transaction fails. Removing deletes the row, then the bytes
after commit, ignoring a storage failure: an orphaned file is harmless, a row pointing at missing
bytes is not. Each add and remove writes `project.attachment.*` / `task.attachment.*` with the
filename as a snapshot. A moved task keeps its files, because they hang off the task.
Downloads are `/project-attachments/{id}` and `/task-attachments/{id}`, always `attachment`.

## Search

`projects.search` and `tasks.search` are generated `tsvector`s, `spanish` + `immutable_unaccent`,
GIN-indexed: `q: 'mudanzas'` finds "Mudanza", `q: 'migracion'` finds "Migración". Global search is
#12.
