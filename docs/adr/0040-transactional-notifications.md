# 0040. Notifications are written inside the owning domain's transaction

- **Status:** accepted
- **Date:** 2026-10-21
- **Issue:** [#33](../../../issues/33), [#301](../../../issues/301), [#302](../../../issues/302)

## Context

People need to hear that something concerns them: a ticket or a task was assigned to them, someone
replied, someone mentioned them. [ADR 0024](0024-in-process-domain-events.md) gives domains a way to
react to each other after commit, but an event emitted after commit can be lost if the process dies
in between, which is acceptable for a courtesy mail and not for an inbox that people rely on.

## Decision

1. **A cross-cutting module `src/lib/server/notifications/`, shaped like `activity`.** It owns the
   `notifications`, `notification_preferences` and `follows` tables. A domain calls
   `notify(tx, …)` **inside its own transaction**, so the notification commits with the change that
   caused it or not at all. It can neither be lost nor announce something that rolled back.
2. **Why not events (ADR 0024).** Events are emitted after commit; between commit and handler the
   notification can vanish. ADR 0024 stays right for reactions that may be lost; this narrows it for
   notifications. The one exception is the linked task (#302): `projects` cannot know tickets exist,
   so that notification is still raised by a subscriber on `task.completed`.
3. **Why not computed from `activity`.** Mentions are not activity, and "everything that concerns
   me" would be an expensive query over a table that grows without bound.
4. **Notifications target people, not users.** A person without a user gets no in-app row; an
   inactive person gets nothing. Mail (#302) can still reach a person without a user.
5. **A snapshot per row** (`code`, `title`, `actorName`, a short excerpt). The inbox reads what it
   read when the thing happened, even if the record is renamed. Rows cascade away with the record.
6. **Exactly one target**, with typed foreign keys and a `CHECK`, as in ADR 0009. The module imports
   the tables of `service-desk` and `projects` for those keys and calls none of their functions;
   no domain imports its tables (ESLint enforces both).
7. **Polling, not push.** The bell polls `GET /notifications/unread` every 60 s while the tab is
   visible, and once when it becomes visible again.
8. **Cleanup is opportunistic.** Opening the inbox deletes the viewer's read rows older than 90 days.
   There is no scheduler.
9. **`DIRECT_TYPES`** (`ticket.assigned`, `task.assigned`, `mention`) always appear in-app; their
   in-app channel cannot be turned off. Defaults and preferences are stored sparsely: only rows that
   differ from `DEFAULTS` exist.

## Email

Added with #302. Mail is a channel of the same notification, not a second system.

1. **One mail per notification**, plain text, sent right after the producer's commit with
   `sendNotificationEmails` (one unawaited `sendQuietly` each), no digest and no retries. Without
   SMTP nothing is sent and nothing fails (ADR 0006).
2. **`notify` decides, the producer sends.** `notify` applies the preferences and returns the
   `PendingEmail[]`; the domain sends them after its transaction commits, so a rolled-back change
   never mails.
3. **Subjects start with the record's code**, `[TCK-0042] {title}`, so mail clients keep threading a
   ticket. `ticket.resolved` keeps the subject of the mail it replaced, `[TCK-0042] Resuelta: {title}`.
4. **Body:** the inbox's sentence for the type (`src/lib/notification-sentence.ts` is shared by both),
   an excerpt of the comment in quotes when there is one, the absolute link to the record built from
   `BETTER_AUTH_URL`, and the footer pointing at `/account/notifications`. A recipient without
   `tickets.view`, or without a user, is linked to the portal.
5. **The excerpt** is `plainExcerpt(body, 280)` from `shared/markdown.ts`: rendered through the same
   pipeline as the page, tags stripped, whitespace collapsed, cut at a word boundary with `…`. It is
   stored in the snapshot, so the inbox shows the same words.
6. **Defaults keep the three mails that existed before** (`ticket.replied`, `ticket.resolved`,
   `task.linked_completed` on), so an installation that never opens the preferences receives what it
   did. `ticket.commented` and `followed.activity` are off by default; every mail can be switched
   off at `/account/notifications`, and the in-app channel of every type but the direct ones.
7. **The linked task groups its mail.** A completed task can be linked to several tickets of the same
   technician: one in-app row per ticket, one mail per person listing them, with the old subject
   `[TSK-0007] Tarea completada: {title}`. Like every notification, it no longer reaches the person
   who completed the task.
8. **An internal comment only reaches staff**, by mail as in-app: `notify` drops anybody without
   `tickets.comment.internal` before preferences are read, so no preference can widen it.

## Consequences

- Every producer pays one small write inside its transaction.
- Producers send the mails `notify` returns, after commit.
- Later producers add a call, never an enum value or a migration.
- A mail can still be lost if the process dies right after commit; the in-app row cannot.
