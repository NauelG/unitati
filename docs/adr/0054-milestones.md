# 0054. Milestones: dated containers of tasks, derived on read

- **Status:** accepted
- **Date:** 2026-10-26
- **Issue:** [#30](../../../issues/30)

## Context

A project without dates is a list. Teams of the size this product targets need a dated checkpoint
inside a project ("Piloto", "Go-live") that groups some of its tasks and says how far along they are.
Plane (`Module`), Linear (project milestones), GitHub (milestones) and Leantime all have one. The
roadmap deferred the Gantt view because "kanban plus milestones covers the MVP team size"
([roadmap-v1.md](../roadmap-v1.md)); v1 has shipped, so milestones are now current work. The domain
model already draws `PROJECT ||--o{ MILESTONE` and ADR 0002 places the entity in `projects`.

## Decision

1. **A milestone is a container with a date range, not a bare marker.** It belongs to exactly one
   project and has a required `start_date` and `target_date`, `start_date <= target_date` (a one-day
   milestone is allowed). Milestones of one project may overlap.
2. **A task is in zero or one milestone, of its own project.** `tasks.milestone_id` is nullable and
   the database enforces the project through a composite foreign key
   `tasks_milestone_same_project_fk (project_id, milestone_id) → milestones (project_id, id)`, which
   needs `unique (project_id, id)` on `milestones`. With the default `MATCH SIMPLE` a task without a
   milestone is not checked. The domain checks the same thing first and answers
   `milestone_not_found`, the semantics of ADR 0042, never a 403.
3. **The foreign key is `ON DELETE SET NULL ("milestone_id")` and the migration is hand-edited.** A
   plain `SET NULL` would also null `tasks.project_id`, which is `NOT NULL`, and every milestone
   delete would fail. The column list (PostgreSQL 15+; the stack runs 17) is something Drizzle cannot
   express, so `drizzle/0045_milestones.sql` carries it and the `foreignKey` in `schema.ts` says so.
   A later `npm run db:generate` reports no changes.
4. **Status and progress are derived on read and never stored.** `milestoneStatus` is a pure function
   of the dates, today, and the task counts per state group. Rules, in this order: `completed` (at
   least one non-cancelled task, all of them completed), `overdue` (today after the target),
   `upcoming` (today before the start), `active`. Progress is `completed ÷ (total − cancelled)`, the
   formula of `projectProgress`. Counts cover the tasks the viewer may see, so an employee's numbers
   are those of their assigned tasks (ADR 0042). Today is the organisation's calendar day. There is no
   `achieved_at`: reopening a task needs no rule about un-achieving.
5. **Hard delete.** Deleting a milestone detaches its tasks and deletes none, so there is nothing to
   protect with archiving. The one row in the `projects` domain that is deleted for good.
6. **Activity only.** Four verbs, `project.milestone.created|changed|deleted` and
   `task.milestone.changed`, with snapshots of names, because milestones are renamed and deleted. A
   change records only the fields that changed; a description-only edit, a no-op and the detaching
   done by a delete record nothing. No domain event and no notification: nobody reacts to milestones
   (ADR 0024) and "overdue" is derived from time, so no write triggers it.
7. **Moving a task to another project clears its milestone.** `reparentTask`, the only writer of
   `tasks.project_id`, sets `milestone_id = null` in the same `UPDATE` and records
   `task.milestone.changed` when there was one. Every caller, including a future project merge,
   inherits the safe behaviour.
8. **Fixed order:** `start_date, target_date, name`. No manual position.
9. **Identity is the UUID only.** No `MLS-####` code: a milestone lives inside one project and is cited
   by name.
10. **No new permission.** Writes need `projects.manage`; reads follow the project's scope.

## Considered options

- **A bare date marker** (a flag on the timeline). Rejected: a checkpoint that groups nothing has no
  progress to report and no reason to exist apart from a due date.
- **Many-to-many between tasks and milestones.** Rejected: a task counting in two checkpoints makes
  progress ambiguous.
- **A stored `achieved_at` or a manual "mark as achieved".** Rejected: stored state drifts from the
  tasks, and reopening one would force a rule about un-achieving. The history already lives in
  `task.state.changed`.
- **A plain `SET NULL` foreign key, or a trigger that detaches tasks.** Rejected: the former fails
  because it nulls `project_id`; the latter hides a rule in the database that the foreign key states
  declaratively.
- **A single-column foreign key on `milestone_id` plus a domain check.** Rejected: the same-project
  rule would hold only for writers that go through the domain. The composite key holds for any writer.
- **Archiving milestones.** Rejected: deleting one destroys no work, so archive filters and states
  would have no use case.
- **Validating or deriving between milestone dates and `projects.due_date` / `tasks.due_date`.**
  Rejected: these dates move independently, and a cross-check forces an editing order.
- **A manual `position`.** Rejected: for a dated checkpoint chronology is the order, and a position
  would compete with the dates.
- **Domain events and notifications.** Rejected: an event without subscribers is speculative coupling
  (ADR 0024).

## Consequences

- `milestones` and `tasks.milestone_id` are owned by `projects`; no other domain reads them. The API
  does not expose milestones yet (`createTaskInput` has a `milestoneId` the API endpoint omits).
- A project page grows a "Hitos" panel and a `?milestone=` filter on the board and the list; a task
  page grows a "Hito" row.
- Out of scope, each for its own issue if needed: a Gantt or timeline view, milestones across projects
  (releases), bulk assignment, milestones in `/tasks`, global search or dashboards, and "overdue"
  reminders, which need a scheduled job.
