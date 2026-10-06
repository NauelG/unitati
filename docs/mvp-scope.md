# MVP scope

The minimum subset of the [roadmap](roadmap-v1.md) that demonstrates the product thesis:
projects, service desk and ITAM are more useful joined than apart.

Planned as thin vertical slices, each usable end to end. Slices 4 and 6 are the
differentiator; everything before them exists to make them possible.

## Slices

| #   | Slice                | Includes                                                                                                     |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | Foundation           | Organisation (single row), email + password auth, people directory, fixed roles, app shell, es-ES            |
| 2   | Assets               | Assets, models, categories, manufacturers, locations, custody, status, per-asset history                     |
| 3   | Service desk         | Tickets, queues, public and internal comments, attachments, status workflow, employee portal, outbound email |
| 4   | **Ticket ↔ asset**   | Pick an affected asset when opening a ticket; the asset page lists its tickets                               |
| 5   | Projects             | Projects, tasks, statuses by group, kanban board, owners, due dates                                          |
| 6   | **Ticket → task**    | Escalate a ticket to a project task; the two stay linked                                                     |
| 7   | Search and activity  | Global search (Postgres FTS) across the three domains; activity log per record                               |
| 8   | Seed and walkthrough | Realistic seed data and the end-to-end script that defines "done"                                            |

## Out of the MVP, on purpose

Three capabilities that were in an earlier draft of this scope, with the reason they moved:

- **Inbound email** → v1. The most expensive and riskiest item of the original P0 (IMAP or
  provider webhook, MIME parsing, thread reconstruction, deduplication, auto-reply loops).
  Outbound notification is in the MVP, so the mail infrastructure is paid in two stages
  instead of one.
- **CSV import** → v1. It only blocks adoption when there is data to migrate, and every
  install starts empty. It stops being optional the day someone arrives with an inventory.
- **Custom fields** → post-v1. See the [roadmap](roadmap-v1.md).

## Exit criterion

The MVP is done when the seeded walkthrough passes end to end:

1. Seed data is realistic, not three rows: ~50 people, ~200 assets across several models and
   locations, ~80 tickets in mixed states, 3 projects with tasks.
2. An employee opens a ticket from the portal **about one of their assigned assets**.
3. A technician picks it up from the queue, comments internally, answers publicly, and the
   requester is notified by email.
4. The asset page shows that ticket in its history, alongside its earlier ones.
5. The technician escalates the ticket to a task in a project; both records show the link.
6. Global search finds the person, the asset, the ticket and the task from one box.
7. Every record shows who changed what, and when.

Realistic seed data is not decoration: developing against three records hides pagination,
search ranking, deep hierarchies and the states that only appear at volume.

This criterion replaces the earlier one ("a team works for two weeks without opening
Leantime, OpenSupports or Snipe-IT"). That one is a better test of value, but there is no
pilot team yet, which made it unverifiable — and an unverifiable criterion is a wish. It
returns as the v1 criterion, where it belongs.

## Estimate

Deliberately absent. The earlier estimate — 14 to 18 weeks at ~10 h/week for eight slices
covering three domains, full-text search and inbound email — worked out at roughly 20 hours
per slice, which slice 2 alone would consume.

Replacing one invented number with another buys nothing while there is no deadline and no
client. The first trustworthy estimate is the one measured after slice 1 ships: it carries
the real cost of the stack, the design system and the test setup, and everything after it
can be extrapolated from a fact instead of a hope.
