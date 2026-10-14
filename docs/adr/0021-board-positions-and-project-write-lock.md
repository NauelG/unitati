# 0021. Board positions are fractional; the project row is the write lock

- **Status:** accepted
- **Date:** 2026-10-14

## Context

The projects domain (#121, under #10) gives tasks a place on a kanban board that people drag
around, in an organisation-defined catalogue of states, and makes an archived project read-only.
Three questions come with that and none is a detail: how a task's place in a column is stored,
what stops two simultaneous drops from corrupting it, and what code may assume about a state.

## Decision

1. **A task's position is a fractional index.** `tasks.position` is a `numeric`. Dropping a task
   between two neighbours gives it the midpoint of theirs; at the ends it goes one step (1000) past
   the last or before the first. One drop writes one row. When the gap between the neighbours falls
   below `1e-6` the column is renumbered, one step apart, inside the same transaction. The
   arithmetic is a pure function (`projects/position.ts`) so its edges are unit tests.
   `moveTask` is the only function that writes `state_id` or `position`.
2. **The project row is the lock.** Every write inside a project (creating or editing a task,
   assigning, moving, archiving) starts by locking that project's row with `select … for update`.
   Writes in one project serialise, which keeps two drops from computing the same midpoint, and
   the "is this project archived?" check it makes is still true when the write lands. Writes in
   different projects do not contend.
3. **Code depends on a state's group, never its name.** The catalogue is the organisation's: names,
   order and count are theirs to change. The group (`backlog`, `unstarted`, `started`,
   `completed`, `cancelled`) is fixed when a state is created, and no update input carries it.
   "Where does a new task land" and "may this state be deleted" are both answered from groups.

## Consequences

- Reordering is cheap and local; there is no re-indexing of a column on every drop.
- Positions are only meaningful relative to one another. Nothing may display, compare across
  columns, or persist a position as if it were a rank.
- A project is a serialisation point. That is fine at the scale of one team's board and is not a
  design for hundreds of concurrent writers on one project.
- Because groups are the only stable vocabulary, a feature that needs to know "done" asks for
  `completed`, not for a state called "Hecho".

## Alternatives considered

- **Dense integer positions.** Every drop rewrites the tail of the column, and two concurrent drops
  race on the same rows. Renumbering on every move is the cost fractional indexing pays only when a
  gap closes.
- **A linked list (`previous_task_id`).** One write per move too, but reading a column in order
  needs a recursive query and a broken link corrupts the whole column.
- **Optimistic concurrency instead of a lock.** Retrying a rejected drop is a UX the board would
  have to build; the lock costs nothing at this scale.

## Addendum (#120): a task may change project

A write that touches two projects locks both in one statement ordered by `id`. A task may change
project, so `lockTask` re-checks the task's project after taking the lock.

Without the fixed order, two opposite moves (A→B and B→A) each hold one row and wait for the
other. Without the re-check, a write that read "the task is in A" and queued behind a move out of A
would run against a task that is no longer there, holding the wrong project's lock. When the
re-check fails `lockTask` retries once with the new owner and then reports `task_not_found`. A row
lock cannot be released early, so the stale one is kept until the transaction ends; if an opposite
move races that retry, Postgres detects the cycle and aborts one of the two rather than hanging.
