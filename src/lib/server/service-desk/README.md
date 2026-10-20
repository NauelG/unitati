# service-desk

Tickets, queues, public and internal comments, attachments, and the outbound mail that tells a
requester somebody answered. Later: canned responses, SLAs, inbound email.

| File             | Owns                                                                                                                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema.ts`      | `queues`, `tickets`, `ticket_comments`, `attachments`; the enums and the `TCK-####` sequence                                                                                             |
| `index.ts`       | The public surface: routes import from here and never from a file inside                                                                                                                 |
| `tickets.ts`     | Scoped reads, `createTicket` (which also links the assets a ticket is about, through `links`, in the same transaction), and the writes that are events (status, priority, assign, queue) |
| `comments.ts`    | The thread (comments merged with `activity`), `addComment`, `getAttachment`                                                                                                              |
| `queues.ts`      | Queue CRUD and the default queue a portal ticket lands in                                                                                                                                |
| `transitions.ts` | The status workflow, as data                                                                                                                                                             |
| `scope.ts`       | Which tickets a viewer sees; who sees internal notes                                                                                                                                     |
| `mail.ts`        | The ticket mail templates, including `taskCompletedMail`; exported for domains that react to events (ADR 0023). Sending lives in `shared/mail.ts`                                        |
| `summaries.ts`   | Reads other domains draw on: `ticketSummaries`, `assignedOpenTickets`                                                                                                                    |

## Decisions worth knowing before changing this

- **The opening message is the first comment.** There is no `description` column, so there is one
  shape for "a message with attachments" and one place to render and index it.
- **Transitions are enforced in the domain**, not by a constraint. SLA metrics (#14) are computed
  from transitions; if any jump were allowed they would measure noise.
- **An internal note is filtered in the query.** `ticketThread` and `getAttachment` take the
  viewer, and a viewer without `tickets.comment.internal` never receives the row.
- **Mail degrades.** It is sent after commit and not awaited; with SMTP down the comment is still
  saved (ADR 0006). With `SMTP_HOST` unset it is off.
- **A portal ticket has no queue picker.** It lands in the organisation's first queue
  (`defaultQueue`); staff choose.
- **A ticket tag is a URL segment.** `RESERVED_TICKET_TAGS` names the static routes beside it
  under `/service-desk`.
