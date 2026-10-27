# 0053. Labels on tickets

- **Status:** accepted
- **Date:** 2026-10-26
- **Issue:** [#16](../../../issues/16), first slice [#391](../../../issues/391)

## Context

A ticket is classified by queue (who works it), status and priority (fixed enums), channel, request
form ([ADR 0037](0037-request-forms-not-ticket-types.md)) and its relations through `links`. None of
these can hold an organisation's own vocabulary: "supplier X", "ISO audit", "recurring".

Custom fields are the usual answer and stay post-v1: they are "the classic scope sink" in
[roadmap-v1.md](../roadmap-v1.md). A catalogue of names the organisation owns is the cheap
alternative, with no second behaviour to maintain.

In Unitati "tag" already means **identifier**: `ticketTag` (`TCK-####`), `assetTag`, `pageTag`, the
`/service-desk/{tag}` URL segment. Reusing the word for a classification would make every sentence
about it ambiguous.

## Decision

1. **The concept is a _label_** in code, glossary and API, and "Etiqueta" in the es-ES interface.
   Never "tag".
2. **A flat, organisation-owned catalogue, edited in settings** at `/settings/service-desk/labels`
   (permission `tickets.manage`). There is no inline creation from a ticket: the catalogue is the only
   defence against sprawl (duplicates, typos, case variants), and adding inline creation later is easy
   where removing it once the catalogue holds typos is not.
3. **Names are unique per organisation ignoring case and padding**, through a unique index on
   `(organisation_id, lower(name))`. A name has 1 to 50 characters and an optional description at
   most 200. The colour is a key of the palette shared with queues
   (`src/lib/domain/catalogue-color.ts`), never free hex.
4. **Tables belong to `service-desk`**: `labels` and `ticket_labels`. Both ends are service-desk
   tables, so the join is not in `links`, which [ADR 0002](0002-server-modules-by-domain.md) keeps for
   cross-domain relations. `ticket_labels.label_id` is `on delete restrict`: a label on a ticket
   cannot be deleted, and the refusal points at archiving. Same organisation on both ends is enforced
   in the write path.
5. **Archive, not hide.** An archived label stays on the tickets that carry it and can be removed
   from them, but cannot be added to any ticket.
6. **One save, one activity entry.** The ticket's label set is saved as a whole; the domain computes
   what was added and removed and writes a single `ticket.labels.changed` entry with
   `{ added: {id, name}[], removed: {id, name}[] }` in the same transaction
   ([ADR 0009](0009-activity-log.md)). Names are snapshots, as in `ticket.queue.changed`. A save that
   changes nothing writes nothing.
7. **Internal to staff.** Labels need `tickets.view` to be seen and `tickets.manage` to be applied; no
   new permission ([ADR 0007](0007-roles-and-permissions.md)). They never appear in the portal, in
   outbound email or in notifications, and `ticket.labels.changed` is not among the verbs a requester
   sees. An internal label such as `usuario-conflictivo` must not leak.
8. **Delivered in slices**: this one builds the catalogue, the ticket detail and the thread line;
   the list chips and filter, the creation form, the REST API and the seed follow.

## Considered options

- **Exclusive or grouped values** ("Impact: high / medium / low"). Out of scope: a classification
  with exclusive values is a custom field, which stays post-v1.
- **Per-user (private) labels.** They organise a person's inbox, not the ticket; that need belongs to
  saved views, which are post-v1.
- **A vocabulary shared with tasks, projects, assets and pages.** No competitor shares one, and the
  meaning of a word differs per domain; each domain would get its own implementation.
- **Requester-visible labels.** No competitor documents them, and the leak risk outweighs the use.
- **Merging labels, cascade delete, free hex colours, per-queue scoping, domain events.** None has a
  consumer yet. No other domain reacts to labels ([ADR 0024](0024-in-process-domain-events.md)).

## Consequences

- Queues and labels share one palette; the CSS variables are `--catalogue-<key>`.
- Renaming a label propagates to every ticket through the foreign key; the thread keeps the name the
  label had when it was applied or removed.
- Notifications on label changes are deliberately absent: classification is not news.
