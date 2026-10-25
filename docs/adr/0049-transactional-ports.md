# 0049. In-transaction participation between domains goes through ports

- **Status:** accepted
- **Date:** 2026-10-24
- **Issue:** [#359](../../../issues/359)

## Context

[ADR 0005](0005-single-suite-and-relations.md) puts the cross-domain relations in `links`, and
`links` reads tickets, assets, pages and tasks through their owners' functions. The other direction
was the problem: `service-desk` called `links` while it wrote a ticket or a comment (link the
assets a ticket is about, record the category an equipment request asked for, cite the pages a
reply links, redact link entries in the thread). Together with `links` calling `service-desk`
(`ticketInOrganisation`) that made the only import cycle in `src/lib/server`. It worked only because
every cross use sat inside a function body.

Those calls cannot be events ([ADR 0024](0024-in-process-domain-events.md)). They must share the
ticket's or the comment's transaction, and they must be able to **refuse** it: a ticket opened
"about nothing", or a public reply citing a page its readers cannot open, must not commit
([ADR 0040](0040-transactional-notifications.md) makes the same argument for notifications). Events
run after commit and cannot refuse.

## Decision

1. **`links` sits above the domains.** It may import any of them; no domain imports it.
   `.dependency-cruiser.cjs` enforces it for `service-desk` (`direction-service-desk`) and
   `no-circular` keeps the graph acyclic ([ADR 0048](0048-module-boundaries-enforced-by-dependency-cruiser.md)).
2. **The consuming domain declares a port.** In-transaction participation that is an _invariant of
   the operation_ is an interface in the consumer's own vocabulary (`service-desk/ports.ts`:
   `TicketPorts`). Each port takes the caller's `tx` and returns an `Outcome`, so a refusal is typed
   and the caller decides to roll back. Each has a documented contract.
3. **One implementation per port, registered as one object.** The domain that owns the relation
   implements it (`links/ticket-ports.ts`); `server/ports.ts#registerPorts()` hands it over at
   startup. That file is root composition code, like `subscriptions.ts`: the only place that knows
   both sides. `hooks.server.ts`, the seed and the database test harness call it.
4. **An unregistered port throws**, with a message that names `registerPorts()`. Skipping the link
   or the citation would write a ticket without the relation it was supposed to carry.
5. **Reads a sibling owns go through the same object.** `service-desk` may not import `projects` or
   `assets` (ADR 0002), and two answers it needs belong to them: which link entries of a thread the
   viewer may read (`projects`) and whether a category is the organisation's (`assets`). They are
   ports too, not transactional, wired in `server/ports.ts`.
6. **Per-call hooks stay** for participation the _caller_ decides: `assets`' `afterIssue(tx, …)` lets
   the technician choose whether a handover fulfils a ticket. A port is for what is always true.
7. **Rules that are not relations leave `links`.** Redacting history that names restricted work is
   `projects`' rule (`redactWorkEntries`); `links` applies it to its feed.

A generic port mechanism in `shared/` is deferred until a second domain needs ports: with one
consumer the mechanism would be speculation.

## Consequences

- The cycle is gone and the `links` ↔ `service-desk` entries leave the dependency-cruiser baseline.
- Forgetting `registerPorts()` in a new entry point fails on the first ticket, loudly, not silently.
- Database specs get the ports from the harness once per process. A spec that needs them absent
  calls `clearTicketPorts()` and restores them.
- A new port is three edits (declare, implement, register) in three places, which is the price of
  the two domains never importing each other.
