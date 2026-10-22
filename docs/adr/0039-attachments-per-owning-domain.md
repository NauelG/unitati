# 0039. Each domain owns its attachments table and shares only the byte store

- **Status:** accepted
- **Date:** 2026-10-20

## Context

Attachments existed only in service desk: the `attachments` table hangs off `ticket_comments`.
Projects and tasks need files too (#285): a specification, a mock-up, a signed quote. A domain may
not import another's tables ([ADR 0002](0002-server-modules-by-domain.md)), so `projects` cannot
reuse `attachments`. [ADR 0036](0036-handover-document-generated-once-and-stored.md) deferred
generalising that table; `Storage` has since moved to `shared/` (#272).

## Decision

1. **Each domain owns its attachments table**: `attachments` (service desk, per comment),
   `project_attachments` and `task_attachments` (projects), and `asset_attachments` (assets). Same columns, each with a real foreign
   key to its owner and `on delete cascade`.
2. **All of them write bytes through the shared `Storage`.** The limits (`attachmentProblem`),
   the multipart-to-`UploadedFile` step and the server-generated storage key live in
   `shared/attachments.ts`. Nothing else is shared.
3. **Reading and writing follow the owner.** Project and task attachments resolve through
   `requireProjectScope` / `requireTaskScope` and need `projects.manage` to write; nothing new is
   added to the permission model.
4. **Ticket attachments are untouched.** No rows move.

## Alternatives rejected

- **A polymorphic `attachments(owner_type, owner_id)` table.** No foreign key, so no cascade and
  no integrity; and the read permission cannot be resolved in one place, because it depends on the
  owner's domain.
- **Attachments as `links` targets** ([ADR 0005](0005-single-suite-and-relations.md)). A file is not a
  first-class entity in the domain model: it has no code, no screen of its own and no life outside
  its owner.

## Consequences

- Four tables with the same shape (`asset_attachments` joined them for inventory). Duplication is in the schema, not in the rules, which are shared.
- A new domain that holds files adds its own table and calls `shared/attachments.ts`.
- Removing an organisation cascades the rows but leaves the bytes on disk, as for tickets.
