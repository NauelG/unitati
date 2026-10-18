# MVP scope

The minimum subset of the [roadmap](roadmap-v1.md) that demonstrates the product thesis:
projects, service desk and ITAM are more useful joined than apart.

Planned as thin vertical slices, each usable end to end. Slices 4 and 6 are the
differentiator; everything before them exists to make them possible.

## Groundwork

Two pieces that are not vertical slices — nothing about them is usable end to end — and that
block slices 2, 3 and 5 all the same. Both are small, and both exist because the alternative is
every slice solving the same problem its own way:

| Piece                     | Why it blocks                                                                                                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Database test harness** | Every "done when" in slices 2 to 7 is a claim about data and permissions. With only pure-logic unit tests, an agent can assert it works but cannot show it.                                           |
| **Component gallery**     | The design system names ten components; two exist. Without `DataTable`, `StatusBadge` and `Avatar` delivered once, each slice invents its own table, and the suite ends up with three design systems. |

The gallery carries the ratchet that keeps it honest: **a component that is not in the gallery
is not finished**, so every slice extends it rather than bypassing it.

## Slices

| #   | Slice                     | Includes                                                                                                                          |
| --- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Foundation                | Organisation (single row), email + password auth, people directory, fixed roles, app shell, es-ES                                 |
| 2   | Assets                    | Assets, models, categories, manufacturers, locations, custody, state (in use / in repair / in stock / retired), per-asset history |
| 3   | Service desk              | Tickets, queues, public and internal comments, attachments, status workflow, employee portal, outbound email                      |
| 4   | **Ticket ↔ asset**        | Pick an affected asset when opening a ticket; the asset page lists its tickets                                                    |
| 5   | Projects                  | Projects, tasks, statuses by group, kanban board, owners, due dates                                                               |
| 6   | **Ticket → project work** | Escalate a ticket to a task, or to a project; the records stay linked                                                             |
| 7   | Search and activity       | Global search (Postgres FTS) across the three domains; activity log per record                                                    |
| 8   | Seed and walkthrough      | Seed at realistic volume and the end-to-end script that defines "done"                                                            |

Slice 2's **state** and its **custody** are orthogonal, as Shelf.nu models them: an asset can be
in use and held by Laura, or in use and be the floor printer nobody holds. An earlier draft of
this table used `available / in_custody / checked_out`, which duplicated custody in a second
column and shipped a `checked_out` value nothing in the MVP could ever set — bookings are
[post-v1](roadmap-v1.md). The vocabulary here is the one the design system already maps to tones.

Slice 6 escalates to **either** a task or a project, because _"what work resolves this"_ and
_"what programme is this attended under"_ are different questions, and a request that justifies a
whole project has no task to point at yet. See the
[amendment to ADR 0005](adr/0005-single-suite-and-relations.md#amendment-2026-10-07-ticket--project).

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
5. The technician escalates the ticket to a task in a project, and a second ticket to a project
   directly; every record shows the link, and the ticket keeps its own status.
6. Global search finds the person, the asset, the ticket and the task from one box — and finds
   only what the searcher is allowed to see.
7. Every record shows who changed what, and when.

Realistic seed data is not decoration: developing against three records hides pagination,
search ranking, deep hierarchies and the states that only appear at volume. Which is why the
seed is **not** built here: it starts in slice 2 and every slice extends it. A seed written in
slice 8 would mean slices 2 to 7 were developed against exactly the three records this paragraph
condemns.

The seed is **deterministic**, from a fixed random seed: `AST-0142` means the same machine on
every machine, so a screenshot from last month still compares and a bug report still resolves.

### How the criterion was verified

**By hand, on the operator's deployment, not by an automated test.** Slice 8
([#13](https://github.com/NauelG/unitati/issues/13)) planned to assert the seven steps twice: an
integration test chaining them through the domain functions, and a Playwright spec walking them
through the interface. It was closed as not planned:

- the seed at volume and `test:db` in CI already existed, built slice by slice;
- the staging environment it assumed was removed, and the repository is deployment-agnostic
  ([ADR 0025](adr/0025-deployment-agnostic.md)) — the MVP runs, with real data, wherever its
  operator deploys the image;
- Playwright would add a dependency, browsers in CI and selector maintenance while the screens
  still change almost every release.

The consequence is accepted and stated plainly: **nothing in CI fails if a later change breaks
the seven-step walkthrough.** Each slice's own tests still guard its part; the chain across
slices is guarded by nobody. The cheapest repair, if a regression ever slips through, is the
seven-step integration test on its own — `test:db` already runs in CI — before any browser
tooling.

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
