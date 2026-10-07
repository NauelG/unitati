# 0005. One indivisible suite, related by pairwise join tables

- **Status:** accepted
- **Date:** 2026-10-06
- **Amended:** 2026-10-07 — `ticket_project` added to the list of relations. See
  [Amendment](#amendment-2026-10-07-ticket--project).

## Context

Two questions that look independent and are not.

**Can a team install only the service desk?** Leantime ships a `Modulemanager`, so the idea
has precedent — but what it switches off is `Wiki`, `Ideas`, `Canvas` and `Gamecenter`.
Nobody switches off `Projects`. It toggles accessories, not core domains.

**How are cross-domain records related?** Zammad has a generic `link` entity and Leantime
has `Entityrelations`, both polymorphic. Shelf.nu, on a stack much closer to ours, is
consistently the opposite: `BookingNote`, `LocationNote`, `TeamMemberNote` and `AuditNote`
as separate tables, `AssetKit`, `AssetLocation` and `BookingAsset` as explicit joins. Plane
agrees: `IssueRelation`, `CycleIssue`, `ModuleIssue`.

The second question depends on the first, because a polymorphic link whose target domain
can be switched off needs a code path for "the target no longer exists".

## Decision

**The three domains are always installed.** Visibility is a matter of roles and user
preference; existence is not configurable. Switching a domain off is a non-goal.

**Relations are pairwise join tables**, each with real foreign keys, owned by the `links`
domain: `ticket_asset`, `ticket_task`, `ticket_project`, and later `project_asset`.

The `links` domain exposes a uniform read interface — `relatedTo(record)` — that backs the
`RecordRef` and `RelatedRecords` components of the design system. The interface is generic;
the storage is not.

## Consequences

- The database cannot hold a ticket linked to an asset that does not exist. For a product
  whose [vision](../vision.md) states "the relations are the product", that guarantee is
  not negotiable, and it is exactly what a polymorphic table cannot express: no foreign key
  can point at a column that sometimes means `assets` and sometimes `tasks`.
- A new relation type costs a migration. With three relations in v1 that is trivial; it
  would not be with thirty. Thirty is not where this product is going — there are four
  principal entities.
- The generic surface the design system needs lives in the facade, so callers never learn
  the storage shape and it can change without touching them.
- Because domains are never absent, no link ever faces a missing target.
- Hiding by role delivers what people actually ask for. "I only want the helpdesk" means
  "do not clutter my screen", which hiding solves. Nobody is asking for the tables to be
  absent.
- Eight install combinations are never created, so they never have to be tested — a cost
  that would otherwise be paid on every feature, forever.

## Alternatives considered

- **Polymorphic `Link` table.** Rejected: no referential integrity. Zammad needs it because
  its object types are user-defined at runtime; ours are three named relations with their
  own semantics. Paying for that generality without having that problem buys nothing.
- **Hybrid: joins for core relations, generic table for the rest.** Rejected: two mechanisms
  to maintain and a permanent argument about which one a new relation belongs to.
- **Switchable modules.** Rejected: a unitati with the inventory switched off is Zammad,
  which is free, mature and has a better helpdesk UX than we will write in six months. It
  would also empty the ticket screen the design system is built around.

## Amendment 2026-10-07: ticket → project

The decision above is unchanged: relations are pairwise join tables with real foreign keys,
owned by `links`. What changed is the list. **`ticket_project` joins `ticket_asset` and
`ticket_task` as an MVP relation.**

The original list assumed a ticket escalates into one thing: a task. That assumption did not
survive contact with the products that have both domains:

| Product          | ticket ↔ task                      | ticket ↔ project                 | Shape                                                       |
| ---------------- | ---------------------------------- | -------------------------------- | ----------------------------------------------------------- |
| **GLPI**         | `ProjectTask_Ticket`, many-to-many | `Itil_Project`, many-to-many     | Two separate relation classes                               |
| **Freshservice** | yes                                | yes                              | "associate tickets with the projects **and** project tasks" |
| **Linear**       | yes (issue)                        | yes (project)                    | `CustomerRequest` as its own entity, pointing at either     |
| **iTop**         | no                                 | `related_project_id` on `Ticket` | Project only, one-to-many                                   |
| **Zammad**       | —                                  | —                                | No projects                                                 |

**No product ships ticket → task alone.** Three of the four that hold both domains model both
levels; the fourth models only the project. Two cases are behind that, and both are real:

- _"The intranet search is broken"_ becomes **a task** in the backlog of the Intranet project.
  Frequent.
- _"We need a tool to manage X"_ is not a task, it is **a project**. Rarer, higher impact, and
  it has nothing to link to until the project is decomposed.

The two relations carry different meanings, and the labels say so: a task **resolves** the
ticket; a project **handles** it. That distinction is what the earlier list collapsed.

The worry that argued against the second relation — two link buttons become a choice the user
pays for every time — is real, and Linear answers it in the interface rather than the schema: a
single action with a target picker, not two competing affordances. So the MVP ships **one
"Escalate" dialog** whose consequence text updates with the chosen target, and whose primary
button names the act. [ADR 0007](0007-roles-and-permissions.md)'s rule still applies: removing a
link destroys context, so unlinking is the act that gets a confirmation, not escalating.

One schema consequence follows for every join table in `links`, including the two that already
existed: **a composite unique constraint on the pair.** Ticket merge and split
([#20](../../../issues/20)) will move the losing record's links onto the winner, and without the
constraint a link the winner already held is inserted twice, putting the same asset in the
relation panel twice with no explanation.

GLPI deserves a caveat, since [alternatives.md](../alternatives.md) describes it as _"dense,
forms-heavy UI, steep admin curve"_ with 623 classes in `src/`. Citing it to justify one more
relation is citing the product this one reacts against. The pattern stands without it:
Freshservice and Linear carry no such baggage and model the same two levels.
