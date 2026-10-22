# 0043. Comments live in a table of the owning domain

- **Status:** accepted
- **Date:** 2026-10-22

## Context

Only assets accepted free-text notes, and they were stored nowhere but `activity.payload`
(`note.added`). The form sat inside the history rail, and tasks, projects and people had no way to
carry a comment at all. Tickets already keep their own `ticket_comments` ([ADR 0002](0002-server-modules-by-domain.md)).

## Decision

1. **One comments table per owning domain**: `asset_comments`, `task_comments`, `project_comments`
   and `person_comments`, each with a real foreign key to its record (cascade) and the author as
   `set null`. The same rule as attachments ([ADR 0039](0039-attachments-per-owning-domain.md)):
   no polymorphic table, and no domain reads another's.
2. **A comment is also history.** The same transaction writes a `note.added` entry on the record's
   timeline, with the text as a snapshot and a `commentId` pointing at the row. `commentId` is
   optional so fixtures and entries older than the tables still parse.
3. **Permissions follow the domain's writes and reads.** Assets: `assets.manage` to write, the
   history gate to read. Tasks and projects: `projects.manage` through the project lock (an
   archived project is read-only) and the record's own scope to read. People: `people.manage` to
   write, `people.view` to read.
4. **One presentational `CommentsCard`** renders any of them; each page loads its comments and
   owns its `addComment` action.
5. **Existing asset notes are migrated**: each `note.added` entry on an asset becomes a row in
   `asset_comments` reusing the entry's id and timestamp, and the entry gains its `commentId`.

## Consequences

- Comments are append-only for now: no edit or delete. A later edit would follow tickets'
  `comment.edited`.
- The text exists twice (row and entry). The entry is the history's snapshot; the row is what the
  card lists.
