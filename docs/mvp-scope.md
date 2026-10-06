# MVP scope

Goal: replace the three-app setup for one real team. The work is planned as thin vertical slices, each one usable end to end.

## P0: MVP

| #   | Slice               | Includes                                                                                    |
| --- | ------------------- | ------------------------------------------------------------------------------------------- |
| 1   | Foundation          | Auth (email + password), people directory, roles (admin / technician / employee), app shell |
| 2   | Assets              | Asset CRUD, models, categories, locations, check-out / check-in to a person, history        |
| 3   | Service desk        | Tickets, queues, public and internal comments, employee portal, status workflow             |
| 4   | **Ticket ↔ asset**  | Pick an affected asset when opening a ticket; asset page shows its tickets                  |
| 5   | Projects            | Projects, tasks, kanban board, owners, due dates                                            |
| 6   | **Ticket → task**   | Escalate a ticket to a project task; the two stay linked                                    |
| 7   | Search and activity | Global search (Postgres FTS) across the three domains; activity log per record              |
| 8   | Inbound email       | Email to a mailbox creates or updates a ticket                                              |

Slices 4 and 6 are the differentiator. Build them as early as possible, right after their dependencies.

## P1

- SLAs (response and resolution targets per queue and priority)
- QR / barcode labels for assets
- CSV import from Snipe-IT and Shelf exports
- REST API and outgoing webhooks
- Project → assets (refresh projects created from an inventory filter)
- i18n (English and Spanish)

## P2

- Gantt view and milestones timeline
- Licenses and consumables
- Time tracking on tickets and tasks
- LDAP / OIDC SSO
- MCP server for AI assistants
- Reports (tickets per asset model, MTTR, asset ageing)

## Rough estimate

One person, part-time (~10 h/week). These numbers are order of magnitude only:

| Block        | Weeks      |
| ------------ | ---------- |
| Slices 1–2   | 4–5        |
| Slices 3–4   | 4–5        |
| Slices 5–6   | 3–4        |
| Slices 7–8   | 3–4        |
| **P0 total** | **~14–18** |

## Exit criterion

The MVP is done when one team runs its day-to-day work on it for two weeks without opening Leantime, OpenSupports or Snipe-IT.
