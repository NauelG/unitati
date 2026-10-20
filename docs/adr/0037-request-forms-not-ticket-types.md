# 0037. Request forms say what a ticket is; queues say who works it

- **Status:** accepted
- **Date:** 2026-10-20

## Context

Employees need to ask for equipment (#271), and the request must be told apart from an incident,
because a technician fulfils it with a handover
([ADR 0035](0035-handover-evidence-and-signing-tokens.md)). Tickets have no type. They have a
**queue**, configurable per organisation, and small teams often use queues as types ("Requests",
"Incidents"). But an employee never picks a queue: the portal files every ticket in the first one.

A queue and a type answer different questions. A queue is **who works it**: routing, the
technician's inbox, and later its SLA (#14). A type is **what it is**, and that decides the flow:
which fields the form asks for and what fulfils it. Folding one into the other breaks the day the
answers diverge. When hardware requests from one office go to another team, splitting the queue
loses the fact that these tickets are requests.

## Decision

1. **A request form is what an employee picks in the portal.** It is a configurable catalogue under
   `/settings/service-desk/`, with a name, a description, a **target queue**, and a system-owned
   **kind**. The kind is fixed in code, because code depends on it, the same split as `State` and
   `StateGroup`. The first kind is `equipment`. The existing free-text ticket stays as it is.
2. **A ticket remembers the form it came from** (`tickets.request_form_id`, nullable). Nothing else
   in the ticket model changes: no type column, and staff-created tickets have no form.
3. **The queue is still the routing.** A form only chooses the starting queue, and a technician can
   move the ticket like any other.
4. **No approval step.** The technician decides. Approval needs a department head in `directory`
   and a new ticket status, and it can be added to a form later without changing this model.

## Consequences

- An organisation adds a "Request a laptop" and a "Request a phone" form, each pointed at whichever
  queue handles it, without touching code. A new kind (software, access) is a code change, because
  its fields and its fulfilment are code.
- Reporting "how many equipment requests" reads `request_form_id` and the kind, never a queue name.

## Alternatives considered

- **Queues as types, with the portal letting the employee pick one.** Rejected: it mixes routing with
  meaning, and it shows employees the organisation's internal structure.
- **A configurable ticket type column.** Rejected: it adds a new concept across the whole service
  desk, while forms only have to exist where the employee chooses.
