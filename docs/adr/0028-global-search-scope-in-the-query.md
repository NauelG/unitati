# 0028. Global search composes per-domain scoped sub-queries

- **Status:** accepted
- **Date:** 2026-10-18

## Context

Global search (#12) has to look across assets, tickets, projects, tasks and people, which
[ADR 0002](0002-server-modules-by-domain.md) puts in different domains that may not read each
other's tables. It also has to honour [ADR 0007](0007-roles-and-permissions.md): an `employee`
finds their own assets, shared assets by name and tag only, and their own tickets.

Two shortcuts were rejected. Filtering after the query leaks totals: "47 results" of which 3
render tells an employee how many machines the company owns. A `search/` module that imported
every table would break ADR 0002 and restate each domain's scope rules a second time.

## Decision

1. **Each domain builds its own sub-query**, over its own tables, carrying its own permission
   scope (`requireAssetScope`, `requireTicketScope`, …), and exports it from its `index.ts`
   (`assetHits`, `ticketHits`, `projectHits`, `taskHits`, `personHits`). All return the same
   seven columns (`kind, id, code, title, subtitle, rank, exact`) and `null` when the viewer holds
   no read permission for the domain, which leaves the group out instead of showing an empty one.
2. **`search/` only composes.** It joins the sub-queries with `UNION ALL` and, in the same
   statement, groups, ranks (`row_number`) and counts (`count(*) over`) per group. The `total` of
   a group is therefore computed over what the viewer may see.
3. **You may search exactly what you may see.** A row an employee sees only as shared is matched
   against `assets.search_shared` (name and tag), never `search` (serial) or the model name.
4. **An exact code is matched inside the same scope**, as `lower(code) = lower(typed)`. A code the
   viewer may not see finds nothing, not a refusal, which would confirm the record exists. Exact
   hits form their own first group and are removed from their type group.
5. **Terms are prefix queries over letters and digits only**, so tsquery operators can never come
   from the viewer and a half-typed word already matches. Identity fields use `simple` +
   `unaccent`, prose uses `spanish` (per field, as in #7, #8, #10); `ts_rank` values of different
   dictionaries are compared across domains, a deliberate simplification.
6. **Retired assets and archived projects (and their tasks) are excluded.** People, including
   leavers, are not.
7. **"Its tickets" for the top asset** are read through `links.relatedTo`, which scopes the other
   side. It is staff-only today (the shared view never shows history), so an employee gets no such
   group.
8. **The in-app transport is `/api/search`**, a thin handler over `search()`. The public API
   endpoint is #35.

## Consequences

- A new searchable domain adds one `*Hits` function and one group; `search/` does not learn its
  tables.
- Adding a record kind touches `SearchHitKind`, the group `case` in `search/search.ts` and
  `hrefOf`.
- The three `person.*` activity verbs exist in the enum before anything emits them, because the
  issue asked for them with this slice; Postgres cannot drop enum values, so they stay.
