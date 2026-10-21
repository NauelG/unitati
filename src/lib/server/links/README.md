# links

Typed relations between records of different domains (ticket → asset, ticket → task, ticket → project). Owns the cross-domain graph so no domain has to know another domain's tables. See `docs/domain-model.md` and ADR 0005.

| File                         | Owns                                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `schema.ts`                  | One join table per pair, each with real foreign keys: `ticket_asset`, `ticket_task`, `ticket_project`                      |
| `ticket-asset.ts`            | `linkAsset` (inside the caller's transaction) and `unlinkAsset` (behind `tickets.manage`)                                  |
| `ticket-work.ts`             | `linkTask`/`linkProject` (inside the caller's transaction), their `linkTicketTo…` wrappers, `unlinkTask`/`unlinkProject`   |
| `ticket-handover.ts`         | `linkHandover` (inside the caller's transaction), `linkHandoverByCode`, `unlinkHandover` (#279)                            |
| `ticket-category.ts`         | `categoryInOrganisation`, `linkCategory` (inside the caller's transaction), `requestedCategory` (#271)                     |
| `notify-handover-decided.ts` | The `handover.accepted`/`handover.rejected` subscriber: one internal system note per linked ticket (#279)                  |
| `escalate.ts`                | `escalateTicket`: link an existing task or project, or create one and link it, in one transaction                          |
| `escalation-draft.ts`        | `escalationDraft(ticket)`: the title and description an escalation form pre-fills                                          |
| `related.ts`                 | `relatedTo(viewer, record)`: the uniform read facade over every relation                                                   |
| `timeline.ts`                | `mergeAssetTimeline`/`mergeTaskTimeline`/`mergeProjectTimeline` (activity + live tickets on one rail), `recentTicketCount` |
| `notify-task-completed.ts`   | The `task.completed` subscriber: a `task.linked_completed` notification per ticket, one mail per technician (#152, #302)   |
| `index.ts`                   | The public surface: callers import from here and never from a file inside                                                  |

## Decisions worth knowing before changing this

- **The interface is generic; the storage is not.** `relatedTo` returns the same `RelatedGroup` shape whichever table answered, which is what lets `RecordRef` and `RelatedRecords` stay ignorant of storage. There is no `kind` column and no polymorphic `link` table: the relation _is_ the table.
- **A relation is live, activity is the past.** `relatedTo` reads each record's status from the record itself, so resolving a ticket changes what the asset page shows without any write to the asset. `link.asset.added` and `link.asset.removed` are recorded against the **ticket** only; recording them on the asset too would put the ticket in the asset's timeline twice, once of them stale.
- **You attach what you can see.** `linkAsset` asks `assets` (`requireAssetScope`) whether the actor may see the asset, so an employee can attach the laptop they hold or a shared printer and nothing else, whatever the form posted. Rules stay in their domain; `links` composes them.
- **An asset's tickets are history.** `relatedTo` returns no ticket group to anyone without `tickets.view` (ADR 0007: the shared view never shows history).
- **The pair is unique** so ticket merge and split (#20) cannot land the same link twice. `linkAsset` uses `ON CONFLICT DO NOTHING` and answers `already_linked`, because a unique violation would abort the transaction a ticket is being opened in.
- **Only `schema.ts` holds foreign keys into other domains' tables.** That is the job: a foreign key to both sides is what the database needs to refuse a link to nothing. `activity` makes the same trade. Reads are another matter: for tasks, projects and (since #149) tickets, `related.ts` asks the owner (`taskSummaries`, `projectSummaries`, `tasksOfProject`, `ticketSummaries`) instead of joining its table. The asset reads predate that and still join.
- **The asset's rail is a merge, and the ticket appears once.** `mergeAssetTimeline` dates a ticket by when it was linked and shows the status it has today. Its own events never reach the asset's rail, because `link.asset.*` hangs off the ticket; reading them there would show the ticket twice, once stale. It is pure: the page fetches both halves from their owners and hands them in.
- **The rail is newest first; `relatedTo` is oldest first.** Issue #9 says the asset page lists its tickets "oldest to newest", and `relatedTo` does return them that way. The page shows the merged rail, which every timeline in the product orders newest first, so the tickets read newest first there. The two are not in tension — one is the data, the other a view of it — but if a flat oldest-first ticket list is ever wanted, it is `relatedTo(asset)` as it stands.

## Ticket → work (#149)

Two more relations, `ticket_task` (`resolved_in`) and `ticket_project` (`handled_in`), built exactly like `ticket_asset`. Seen from the other side they read `resolves` (a task), `handles` (a project, tickets linked to it directly) and `resolves_via_tasks` (a project, tickets linked to any of its tasks, each with the `via` task). Relation names are keys; the words belong to the UI.

- **Linking is idempotent.** A pair that already exists is a success that writes no row and no activity: the insert is `ON CONFLICT DO NOTHING … RETURNING`, and the activity is written only when a row came back. (`linkAsset` still answers `already_linked`; work links do not, because an escalation form can be submitted twice.)
- **The target is read through its owner's scope.** A task or project outside `requireTaskScope`/`requireProjectScope` is `task_not_found`/`project_not_found`, never forbidden. A task of an archived project is `project_archived`; unlinking works on archived targets, because the link belongs here.
- **Activity hangs off the ticket**, with a snapshot of the tag and title/name (`link.task.added`, `link.project.removed`, …). The task's or project's page merges the live relation through `timeline.ts`. Renaming a task never rewrites a past entry.
- **Nothing here writes the ticket row.** Status, priority, queue, assignee and `updated_at` are untouched by every function in this module.
- **Escalation is a link plus, sometimes, a new record.** `new_task` and `new_project` need `projects.manage` on top of `tickets.manage` (`forbidden_create` otherwise) and run `projects`' own `openTask`/`openProject` inside the escalation's transaction; if the link cannot then be made, the new record is rolled back with it. No separate `ticket.escalated` verb exists. Any ticket status can be escalated.
- **The requester's restricted view.** A viewer holding only `tickets.view.own`, on their own ticket, also gets the tasks and projects it was escalated to that are _outside_ their scope, reduced to tag, title and state, with `restricted: true` and `href: null` (ADR 0007, amendment 2026-10-15). Targets inside their scope come back whole, with their link. For any other viewer, items are filtered by the scope of their own kind.
- **A project's status is `{ archived, progress }`**, where `progress` is `projects`' own `projectProgress` for staff and `null` on a restricted item or for the requester (who never gets it, nor a task's `projectTag`, in the payload either), since the counts of a project you cannot open would describe tasks you cannot see. `resolves_via_tasks` goes only through tasks the viewer may open, because its `via` reference is a record in its own right.
- **`assetRelations` narrows `relatedTo`'s answer** to the asset relations the existing panels know how to draw; the ticket's panel (#150) draws the task and project groups itself; the task's and project's own panels arrive with #151.

## Ticket → handover (#279)

`ticket_handover` (`fulfilled-by`) relates a ticket to the handover that answers it, built like `ticket_asset`. Seen from the ticket it reads `fulfilled_by` (staff only: a handover is signature evidence), from the handover `fulfils`. A handover has no page yet, so its item has `href: null` and the constellation leaves it out.

- **`assets` never imports `links`.** `deliver` and `takeBack` take an `afterIssue(tx, handover)` hook that runs in their transaction; the route passes `linkHandover` through it, so the link and the custody commit together and a throw rolls both back.
- **A decision leaves a note, nothing more.** `notifyHandoverDecided` writes one internal, authorless comment per linked ticket through `service-desk`'s `addSystemNote`. Status, assignee and queue are never touched (ADR 0035). A handover with no link finds no rows and does nothing.
- **No `activity` entry.** The panel shows the link and the note shows the outcome; a third record would only repeat them.

`ticket_category` (`requests`) records the asset category an equipment request form asked for, written in the ticket's opening transaction. It has no related-panel entry: the ticket page reads it through `requestedCategory` and shows it as a detail, and Deliver filters on it.
