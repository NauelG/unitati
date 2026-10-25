# 0051. Staff can follow knowledge pages

- **Status:** accepted
- **Date:** 2026-10-25
- **Issue:** [#330](../../../issues/330)
- **Amends:** [ADR 0031](0031-knowledge-base-spaces-page-tree-and-revisions.md), [ADR 0040](0040-transactional-notifications.md)

## Context

[ADR 0040](0040-transactional-notifications.md) lets staff follow tickets, tasks and projects and
hear about them as `followed.activity`. Pages were left out on purpose in #17: `notifications.page_id`
existed only for the mention of a page comment (#326) and `notify` skipped followers for pages.
People who maintain documentation still need to know when a page they care about changes.

## Decision

1. **Staff only.** Following a page needs `knowledge.manage` (technician, admin). Employees cannot
   follow, not even a published page in a `portal` space. Followers are filtered by their **current**
   role when a notification is written; the row stays, so a promotion brings the notices back (the
   same rule as for tickets and projects).
2. **What notifies:** publish, save (a new revision, drafts included), restore, archive, unarchive and
   a new page comment. Not move or reorder (they change structure, not content), and not archiving a
   space. A change through an API key notifies too, with the service account as actor.
3. **A subtree counts once.** Archiving or unarchiving a page with subpages sends one notification
   per follower, which points at the root page ("archived together with N subpages"). Only the pages
   the operation **actually changes** count: followers of a subpage that was already archived (or, on
   unarchive, was archived on its own earlier and stays archived) are not told. `notify` takes the
   pages whose followers hear (`followerPageIds`) and collapses them per person.
4. **Auto-follow** is a normal follow row, which the person can undo: the page's creator, whoever
   saves or restores a revision, whoever comments, whoever a comment mentions. Only people with
   `knowledge.manage` are stored (`followPage` skips anyone else), it is idempotent, and an API key has
   no person to follow. There is no backfill: existing pages start with no followers.
5. **Delivery reuses `followed.activity`** and its preference (email off by default). No new type, no
   digest and no coalescing: there is no autosave, so every save is deliberate. The usual `notify`
   rules apply: the actor is excluded, the strongest type wins (a follower who is also mentioned
   gets `mention`).
6. **Links.** A save or restore leads to that revision (`snapshot.revision`,
   `/knowledge/<tag>/revisions/<n>`, the revision view), a comment to the comment, everything else to
   the page. The "stop following" line of a mail always points at the page itself, where the follow
   control lives, never at a revision or a comment. A restore says which version it restored
   ("restored v1"); the link goes to the new revision it created.
7. **Schema.** `follows.page_id` references `pages` with `ON DELETE CASCADE`; the check becomes
   exactly one of ticket, task, project or page, with a partial unique index on (person, page).
8. **UI.** `FollowControl` sits in the page header, not in the editor. It is hidden on an archived
   page unless the viewer already follows it, so they can still stop; following an archived page is
   refused in the domain (`followKnowledgePage`, mapped to 409 by the route). `unfollowFromNotification` handles `pageId`, so unfollowing works from the inbox and
   from the email.

The knowledge domain decides _what_ happened to a page (`knowledge/following.ts`); the follow rows and
the delivery rules stay in `notifications`, reached through its entry point.

## Out of scope

Following a space (it would need a watch concept, which ADR 0031 avoided), following by employees,
digests, and retroactive follows.

## Consequences

- Page comments now create follows and notify followers; who may comment and how mentions work do not
  change.
- Every knowledge write that notifies returns its mails after commit, like the other producers; the
  write functions take optional mail dependencies for tests.
- Noisy pages are possible. If that proves real, coalescing is a cross-cutting change in `notify` and
  gets its own issue.
