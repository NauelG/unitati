# Vision

## Problem

Small and mid-sized IT teams usually run three separate tools:

- a project tool (e.g. Leantime),
- a helpdesk (e.g. OpenSupports),
- an asset inventory (e.g. Snipe-IT, Shelf).

Having three tabs open is a minor annoyance. The real cost is **disconnected data**:

- the same people exist three times, with three logins and three permission models;
- a ticket does not know which laptop it is about, and the laptop does not know its incident history;
- a hardware refresh project is planned in one tool, while the assets it replaces live in another;
- there is no single search and no cross-cutting report ("which models generate the most tickets?").

Suites that unify the three exist (see [alternatives](alternatives.md)), but they are commercial SaaS or carry dated, admin-heavy UX.

## Target user

The internal IT team of an SMB or mid-sized organisation: **2–30 technicians** serving tens to a few thousand employees. Employees interact only through a simple portal (open a ticket, see my devices).

## Value proposition

**The relations are the product.**

| Relation                 | Example                                                                   |
| ------------------------ | ------------------------------------------------------------------------- |
| Ticket ↔ Asset           | "Laptop won't boot" is linked to `LT-0142`; the laptop shows the ticket   |
| Asset → incident history | `LT-0142` has had 4 tickets in 6 months, so it is a replacement candidate |
| Ticket → Task            | A recurring issue becomes a task in the "Wi-Fi upgrade" project           |
| Project → Assets         | "2027 laptop refresh" targets every asset of model X older than 4 years   |
| Person → everything      | One profile: assigned devices, open tickets, tasks owned                  |

Plus: one directory, one permission model, one global search, one activity log.

## Principles

1. **Fast, modern UX first.** It must feel like Linear, not like a 2010 ERP. Keyboard-friendly, few clicks, no "configure 40 fields before first use".
2. **Opinionated defaults, few knobs.** Custom fields exist, but only as an escape hatch.
3. **Self-hosted, single binary-ish.** One container plus Postgres.
4. **Boundaries in code mirror boundaries in the domain** (see [ADR 0001](adr/0001-stack-and-architecture.md)).

## Non-goals (for now)

- Not an ERP: no accounting, purchasing or invoicing.
- No RMM or endpoint discovery agent in the MVP; CSV import and API only.
- Not multi-tenant SaaS; one installation serves one organisation.
- No full ITIL process engine (change advisory boards, problem management).
