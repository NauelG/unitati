# 0024. Cross-domain reactions go through in-process domain events

- **Status:** accepted
- **Date:** 2026-10-15
- **Issue:** [#152](../../../issues/152)

## Context

`projects` must not know that tickets exist ([ADR 0002](0002-server-modules-by-domain.md)), yet a
technician who escalated a ticket weeks ago will not go looking: when the task that resolves it is
done, they need a mail. [ADR 0021](0021-board-positions-and-project-write-lock.md) makes `moveTask`
the only writer of a task's state, so the fact happens in exactly one place that is forbidden to
name the people who care about it.

Until now there was no mechanism for this. `recordActivity` is a log, not a hook or a bus, and
mail is a fire-and-forget courtesy after commit (`sendQuietly` in `service-desk/mail.ts`).

## Decision

A small typed registry, `server/shared/events.ts`: `on(name, handler)` returns an unsubscribe,
`emit(name, payload)` returns immediately. The first event is `task.completed`. The rules:

1. **Emit after commit, never inside a transaction.** The owning domain's public function emits
   only once the transaction has resolved successfully. A handler never sees uncommitted state, and
   a rolled-back or refused write never emits.
2. **Handlers are async and isolated.** Each runs on its own microtask and is not awaited. A throw
   or rejection is caught and logged with the event and handler names; it affects neither the
   caller nor the other handlers. Tests switch to `sync` dispatch and await `flushEvents()`.
3. **One registration point.** `server/subscriptions.ts` wires every handler; `hooks.server.ts`
   calls it once at startup, and a guard makes a second call (dev HMR) a no-op.
4. **Emitters never know subscribers.** `projects` imports `shared/events.ts` and nothing from
   `links` or `service-desk`; an ESLint `no-restricted-imports` rule enforces it.

`task.completed` is emitted by `moveTask` when the task's **state group** goes from anything other
than `completed` to `completed`. Completed → completed, moves into `cancelled`, no-op moves and
`createTask` into a completed state do not emit; leaving and re-entering `completed` emits again,
because each re-entry is a new fact.

Its first subscriber lives in `links`, the domain allowed to hold the `ticket_task` relation: it
mails each assigned technician once, listing their unresolved tickets.

## Alternatives rejected

- **Return a flag from `moveTask` and let every caller notify.** The board menu, a drag, the task
  record and (later) the API and the palette are separate call sites; three would remember and the
  fourth would forget. An event is emitted in one place and cannot be forgotten.
- **A database outbox with a worker.** It would give guaranteed delivery, but there is no worker
  infrastructure, and the only consumer is a courtesy mail. Revisit when #44 (automation) or #33
  (in-app notifications) need delivery that survives a crash.

## Consequences

- **There is a loss window.** A crash between commit and dispatch loses the event and so the mail.
  This is the guarantee `sendQuietly` already has; it is accepted, not hidden. There are no
  retries, no persistence and no ordering across events.
- **Adding an event** means declaring its payload in `DomainEvents`, emitting it from the one
  function that owns the fact (after commit), and subscribing in `subscriptions.ts`. Add events
  when a subscriber needs them, not speculatively.
- #57 (notification preferences and followers) must absorb the completion mail, and #33 will
  subscribe here too.
