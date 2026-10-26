# 0052. Time entries live in a cross-cutting domain

- **Status:** accepted
- **Date:** 2026-10-25
- **Issue:** [#45](../../../issues/45)
- **Amended:** 2026-10-26 — technicians read their own time on `/time`, and a project lists the
  entries behind its total. See
  [Amendment](#amendment-2026-10-26-technicians-read-their-own-time-and-a-project-lists-its-entries).

## Context

Technicians need to log the time they spend on tickets and tasks, typed against a catalogue the
organisation edits, so the hours can be handed to an internal chargeback or an external billing tool
through a CSV export and the API. Unitati owns the **record**, never the money: no clients, rates or
invoices.

Tickets (`service-desk`) and tasks (`projects`) are separate aggregates in separate domains
([ADR 0002](0002-server-modules-by-domain.md), [ADR 0005](0005-single-suite-and-relations.md)). The
precedent for anything that hangs off a record is **one table per owning domain**:
[ADR 0043](0043-comments-per-owning-domain.md) for comments and
[ADR 0039](0039-attachments-per-owning-domain.md) for attachments, both of which rejected a
polymorphic table because it cannot carry a real foreign key.

Time entries do not fit that pattern, for three reasons:

- **The entry-type catalogue is shared.** An organisation has one list of types (`Support`,
  `Project work`, `Meeting`…), edited in one place and used on tickets and tasks alike. Per-domain
  tables would mean two catalogues, or one of them owned by a domain that has no business with it.
- **The questions cut across both domains.** The `/time` screen, the CSV export and
  `GET /api/v1/time-entries` list entries of tickets and tasks together, filtered by person, type,
  date and project. The project total is a sum over tasks grouped by a type that tickets also use.
  With per-domain tables every such read would be a union across two domains that may not import
  each other's tables.
- **One running timer per person**, whichever record it is bound to. Two timer tables cannot
  enforce that with a unique key.

## Decision

1. **`time` is a cross-cutting server domain**, like `activity` ([ADR 0009](0009-activity-log.md))
   and `notifications` ([ADR 0040](0040-transactional-notifications.md)). It owns the entry-type
   catalogue (`time_entry_types`), the entries (`time_entries`) and the running timers
   (`running_timers`).
2. **Integrity through typed foreign keys.** `time_entries` and `running_timers` carry nullable
   `ticket_id` and `task_id` foreign keys, each `on delete cascade`, and a `CHECK` that exactly one
   is set (`time_entries_exactly_one_target`, `running_timers_exactly_one_target`), the shape of
   `activity_exactly_one_target`. This is the answer to ADR 0043's objection to polymorphic tables:
   the database refuses an entry on a record that does not exist, and the table is not
   `record_type` plus `record_id`. A third kind of record would cost a column and a term in the
   `CHECK`.
3. **`time` reads the `service-desk`, `projects` and `directory` schemas and calls none of their
   functions.** It needs them for foreign keys, the organisation check, record codes and titles for
   the report, and the archived-project lock. The rule `direction-time` in
   `.dependency-cruiser.cjs` is the one `direction-cross-cutting` states for `activity` and
   `notifications`: only `schema.ts` of another business module, plus `activity` to write history.
   No entry is added to `.dependency-cruiser-known-violations.json`.
4. **Visibility belongs to the owning domain.** `time` checks that the record exists in the
   organisation and that its project is not archived; it does not decide who may see a task in a
   members-only project ([ADR 0042](0042-per-project-visibility.md)). The caller resolves the
   record through the owning domain's read policy first: the ticket and task screens
   ([ADR 0050](0050-record-screens-compose-the-apps-record-reads.md)), and the API endpoints.
5. **The switch lives on `organisations.time_tracking_enabled`** (default `false`), owned by
   `directory`'s schema as `technicians_edit_directory` is ([ADR 0044](0044-technicians-may-edit-the-directory.md)),
   but written by `time`, because switching it has consequences only this domain knows: the first
   enable seeds the default type, and disabling discards every running timer. Entries are kept.
6. **Two permissions** ([ADR 0007](0007-roles-and-permissions.md)): `time.log` (technician, admin)
   for one's own entries and timer, and `time.manage` (admin) for everybody's entries, `/time`, the
   export and `/settings/time`. Employees hold neither.
7. **History is the activity log.** `time.logged`, `time.edited` and `time.removed` are written on
   the ticket or the task in the transaction of the change. They are internal: the requester's view
   of a ticket lists a fixed set of verbs ([ADR 0009](0009-activity-log.md)) and these are not in it.
8. **Totals are computed on read, never stored.** A project's total sums the entries of its tasks
   at the time of the read, so a task moved to another project carries its time along.

## Considered options

- **One table per owning domain** (`ticket_time_entries`, `task_time_entries`), the pattern of
  ADR 0043. Rejected for the three reasons above: a duplicated catalogue, cross-domain reads
  without a legal place to live, and no single key for "one timer per person".
- **A polymorphic `record_type` + `record_id`.** Rejected, as in ADR 0043: no foreign key, so
  deleting a record leaves entries pointing at nothing.
- **Time as a column on tickets and tasks.** Rejected: a record gets many entries, from many
  people, on many dates, with a type each.

## Consequences

- `time` is a seventh table owner in `.dependency-cruiser.cjs` and a sibling of `activity` in its
  tables rule. A domain never imports it; the screens and the API compose it with the record.
- The `activity_verb` enum gains three values, and `activity` reads `organisations.time_tracking_enabled`
  to drop `time.*` entries from timelines while tracking is off.
- Project totals ignore the tickets linked to a project: a ticket is not project work. If its time
  should count, the work is a task linked to the ticket.
- Estimates, timesheet approval, period locking and billing flags are out of scope, and so is time
  logged directly on a project.

## Amendment 2026-10-26: technicians read their own time, and a project lists its entries

Decision 6 kept `/time`, its export and `GET /api/v1/time-entries` for `time.manage` (#379). They
now open to `time.log` as well, and the `time` domain scopes the read (`reportScope`): everybody's
entries for `time.manage`; for `time.log` alone, only the viewer's own, whatever person the filters
or the query string name. `/settings/time` stays `time.manage`. The report also filters by kind of
record (`ticket` or `task`) and splits its total between the two.

The project screen lists the entries behind its total: everybody's, on every task of the project,
read-only, to whoever reads the project with `time.log`.

**Why.** A technician had no view of their own time short of opening record after record, and the
project showed a total without the entries behind it. Neither widens what anyone sees: under #45 a
technician already read every entry on a ticket or task they can open, and every role holding
`time.log` also holds `projects.view` (pinned by a test in `permissions.spec.ts`), so the project
list gathers entries its reader could already read one task at a time. A title the viewer cannot
read is still blanked, as decision 4 and #372 require. Everybody's time across records stays an
admin view.
