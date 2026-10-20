# Roadmap to v1

Every capability Unitati may ever ship, classified once, so that the question asked of any
new idea is **"why does this get in?"** and never "why would we leave it out?".

The raw material comes from seven reference products (see [sources](#sources)); the
classification comes from the triage rule below. [MVP scope](mvp-scope.md) is the minimum
subset of this document.

## Triage rule

Applied in order. The first matching tier wins.

| #   | Test                                                                 | Tier      |
| --- | -------------------------------------------------------------------- | --------- |
| 1   | Does it serve a relation between domains?                            | MVP       |
| 2   | Without it, does day-to-day work break?                              | v1        |
| 3   | Does it exist because the reference product is old or serves others? | Discarded |
| 4   | Everything else                                                      | Post-v1   |

Tiers 3 and 4 must carry a written reason. A capability with no reason is not classified,
it is merely postponed, and it will come back as an argument every quarter.

> The reference products hold more than 700 entities and permissions between them. That is
> an inventory of the possible, **not a backlog**. GLPI ships 623 classes in `src/` and our
> own [alternatives](alternatives.md) concludes its UX is unusable day to day. Breadth is
> what we are competing against, not what we are copying.

## Scope decisions

Settled before classifying anything; each one cuts off a branch of the tree.

| #   | Decision                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | No pilot team. "Done" is a seeded end-to-end walkthrough, not two weeks of someone else's work (see [MVP scope](mvp-scope.md)).                |
| 2   | No initial load of an existing user base. Every install starts empty.                                                                          |
| 3   | Tenancy: tenant-ready at N=1. See [ADR 0004](adr/0004-tenancy.md).                                                                             |
| 4   | Configurable deployment without limit; configurable product only as closed catalogues. See [ADR 0004](adr/0004-tenancy.md) and the rule below. |
| 5   | The three domains are never switched off, only hidden per role. See [ADR 0005](adr/0005-single-suite-and-relations.md).                        |
| 6   | Relations are pairwise join tables behind the `links` facade. See [ADR 0005](adr/0005-single-suite-and-relations.md).                          |
| 7   | Fixed roles over granular permissions; users never author roles. See [ADR 0007](adr/0007-roles-and-permissions.md).                            |
| 8   | UI in Spanish (es-ES) from day one, externalised from the first screen. See [ADR 0008](adr/0008-ui-language.md).                               |

**Configurability rule.** Catalogues are data and the user owns them: queues, asset
categories, models, locations, manufacturers, ticket statuses, canned responses. Structure
is product and we own it: the state machine, the role model, relation types and record
schemas. If turning something into an option means maintaining two behaviours forever, it
is not configuration — it is a decision we are refusing to make.

Plane's `State` / `StateGroup` is the shape that satisfies both: users name their own
statuses, but every status belongs to a system-owned group (`backlog`, `unstarted`,
`started`, `completed`, `cancelled`). Catalogue configurable, structure fixed.

## MVP

Serves a cross-domain relation, or is the minimum without which one cannot be demonstrated.
Slices and sequencing live in [MVP scope](mvp-scope.md).

| Domain        | In                                                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Foundation    | Organisation (single row), email + password auth, people, fixed roles, app shell, es-ES                                      |
| Directory     | `Person`, `Team`, `Department`, `Location`                                                                                   |
| Assets        | `Asset`, `AssetModel`, `Category`, `Manufacturer`, `Location`, custody, status, per-asset history                            |
| Service desk  | `Ticket`, `Queue`, public and internal comments, **attachments**, status workflow, employee portal, outbound email on change |
| Projects      | `Project`, `Task`, `State` + `StateGroup`, kanban board, owner, due date                                                     |
| **Relations** | **Ticket ↔ Asset** and **Ticket → Task**                                                                                     |
| Cross-cutting | Global search (Postgres FTS), activity log, realistic seed                                                                   |

Attachments are in because a service desk without a screenshot is not a service desk.
Outbound email is in because otherwise the requester has to poll the portal to find out
whether anyone answered.

## v1

Day-to-day breaks without these, but no MVP relation needs them.

### Service desk

| Capability                   | Why                                                   | Seen in              |
| ---------------------------- | ----------------------------------------------------- | -------------------- |
| SLAs per queue and priority  | Without targets a service desk cannot be run          | Zammad               |
| Canned responses             | Same answer typed fifty times                         | Zammad, OpenSupports |
| Tags                         | Cross-cutting classification the queue cannot express | Zammad, OpenSupports |
| Knowledge base               | Deflects the repeat question; holds all documentation | Zammad, OpenSupports |
| Inbound email to ticket      | Users write email whether we support it or not        | Zammad, OpenSupports |
| Mail templates and signature | Outbound mail must look like the organisation         | OpenSupports, Zammad |
| Ticket merge and split       | Duplicates arrive daily                               | Zammad               |

The knowledge base is its own domain, `knowledge`, and absorbed "wiki and project pages": one
place to write documentation, so that it is trusted
([ADR 0031](adr/0031-knowledge-base-spaces-page-tree-and-revisions.md)).

### Assets

| Capability                           | Why                                                 | Seen in         |
| ------------------------------------ | --------------------------------------------------- | --------------- |
| CSV import                           | Only bulk entry path; manual typing does not scale  | Snipe-IT, Shelf |
| QR / barcode labels, print, scan     | Core to inventory work, not decoration              | Shelf, Snipe-IT |
| `ReportFound`                        | Scan a lost device's label and report it; near-free | Shelf           |
| Physical audit sessions              | Annual inventory is a legal requirement for many    | Shelf, Snipe-IT |
| Signed handover, delivery and return | Signed handover of equipment has legal value        | Snipe-IT, Shelf |
| Equipment request                    | An employee asks for equipment instead of mailing   | Snipe-IT        |
| Licences and seats                   | Software is the other half of IT inventory          | Snipe-IT        |
| Consumables, accessories, components | The rest of what a technician hands out             | Snipe-IT        |
| Kits                                 | "Laptop + dock + monitor" moves as one unit         | Shelf, Snipe-IT |
| Maintenance records                  | Repair history feeds the replacement decision       | Snipe-IT        |

### Projects

| Capability        | Why                                     | Seen in         |
| ----------------- | --------------------------------------- | --------------- |
| Milestones        | A project without dates is a list       | Leantime, Plane |
| Task dependencies | Blocking is the one relation tasks need | Plane           |
| Labels            | Classification across projects          | Plane           |

### Cross-cutting

| Capability                        | Why                                                 | Seen in                |
| --------------------------------- | --------------------------------------------------- | ---------------------- |
| In-app notifications and mentions | Otherwise coordination happens elsewhere            | Zammad, Plane          |
| Saved views and filters           | Every user rebuilds the same filter daily           | Shelf, Plane           |
| REST API and outgoing webhooks    | An unintegrable tool becomes the fourth silo        | all                    |
| English locale alongside es-ES    | One file, once the strings are already externalised | Zammad, OpenSupports   |
| Dark mode                         | Already specified in the design system              | —                      |
| Basic reports                     | Tickets per model, MTTR, asset ageing — the pitch   | Leantime, OpenSupports |
| Audit log                         | Who changed what, beyond the activity feed          | Zammad, Shelf          |

## Post-v1

Legitimate, unscheduled, with the reason they wait.

| Capability                          | Why it waits                                                                                                                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Asset bookings and reservations     | A fourth domain in disguise: calendar, availability, overlaps, overdue, partial check-in. Teams and other suites already cover it. Shelf is stronger here and we will not beat it. |
| Custom fields                       | The classic scope sink, and in tension with "opinionated defaults, few knobs"                                                                                                      |
| Active multi-tenancy (org UI)       | The data model is ready from day one; the experience has no demand yet ([ADR 0004](adr/0004-tenancy.md))                                                                           |
| SSO: LDAP, OIDC, SCIM               | Email + password is self-contained; SSO arrives with the first organisation that requires it                                                                                       |
| Automation: macros, triggers, rules | Automating a workflow nobody has run yet automates a guess                                                                                                                         |
| Time tracking                       | Only pays off where hours are billed; not our target user                                                                                                                          |
| Gantt and timeline                  | Kanban plus milestones covers the MVP team size                                                                                                                                    |
| Estimates and story points          | Agile ceremony, not IT operations                                                                                                                                                  |
| Cycles and sprints                  | Same                                                                                                                                                                               |
| Project → asset batches             | Needs assets and projects mature; the third relation, after the two that define the product                                                                                        |
| MCP server for AI assistants        | Requires a stable API first                                                                                                                                                        |
| Satisfaction surveys                | Needs ticket volume to mean anything                                                                                                                                               |

## Discarded

Will not be built. Reopening one needs a new reason, not a reminder.

| Capability                                                                 | From         | Reason                                                              |
| -------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------- |
| Depreciation, purchase orders, order items, suppliers as financial records | Snipe-IT     | Accounting. [Vision](vision.md) states Unitati is not an ERP        |
| Tiers, plan limits, billing                                                | Shelf        | Commercial SaaS plumbing; Unitati is self-hosted and single-install |
| Gamification, idea boards, goal and logic canvases                         | Leantime     | Product management for a different audience                         |
| Full CMDB with discovery agent                                             | GLPI, iTop   | [Vision](vision.md) rules out RMM and endpoint agents               |
| ITIL process engine: CAB, problem management                               | OTOBO, iTop  | [Vision](vision.md) rules out full ITIL                             |
| Live chat                                                                  | Zammad       | A different product with its own staffing model                     |
| Public registration, user bans, captcha                                    | OpenSupports | Unitati serves an internal directory; there is no anonymous public  |
| XML-defined data model                                                     | iTop         | Contradicts "boundaries in code mirror boundaries in the domain"    |

## Sources

Feature extraction ran against the shipped data model — entities, enums and permissions —
rather than marketing pages.

| Product      | License | Stack               | Taken as reference for         |
| ------------ | ------- | ------------------- | ------------------------------ |
| Shelf.nu     | AGPLv3  | Remix / Prisma / PG | ITAM model and UX              |
| Snipe-IT     | AGPLv3  | Laravel / MySQL     | ITAM breadth and permissions   |
| Zammad       | AGPLv3  | Rails / Vue         | Service desk                   |
| OpenSupports | GPLv3   | PHP / React         | Service desk, lighter          |
| Plane        | AGPLv3  | Django / React      | Projects, state model          |
| Leantime     | AGPLv3  | PHP                 | Projects, module boundaries    |
| GLPI         | GPLv3   | PHP / MySQL         | Coverage ceiling, as a warning |
