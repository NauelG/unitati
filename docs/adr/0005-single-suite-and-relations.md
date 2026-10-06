# 0005. One indivisible suite, related by pairwise join tables

- **Status:** accepted
- **Date:** 2026-10-06

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
domain: `ticket_asset`, `ticket_task`, and later `project_asset`.

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
- **Switchable modules.** Rejected: a Unitati with the inventory switched off is Zammad,
  which is free, mature and has a better helpdesk UX than we will write in six months. It
  would also empty the ticket screen the design system is built around.
