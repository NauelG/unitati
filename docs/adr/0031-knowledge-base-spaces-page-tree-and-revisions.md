# 0031. The knowledge base: spaces bound the audience, pages form a tree, saves are revisions

- **Status:** accepted
- **Date:** 2026-10-18

## Context

The roadmap carried two documentation items: a knowledge base for the service desk (#17, v1,
"deflects the repeat question") and wiki and project pages (#49, post-v1, waiting because "two
places to write docs means neither is trusted"). #17 said only "articles and topics, linkable
from a ticket reply". Neither said who reads what, how documents nest, or what happens when two
technicians edit the same one.

A third-party wiki (Docmost, AGPL) was considered and set aside. Embedding it would bring back the
problem the product exists to remove: a second directory, a second permission model, and
documents that cannot point at an asset or a ticket. Docmost informed the shape (spaces, a page
tree, history); it is not a component.

## Decision

1. **A domain of its own, `knowledge`, and the only place documentation is written.** It owns
   `Space`, `Page` and `PageRevision`. #49 is absorbed: project documentation is pages linked to a
   project, not a second editor inside `projects`.
2. **A space is the audience boundary.** A space's audience is `staff` (technicians and admins) or
   `portal` (employees as well), and every page in it shares that audience. **A page has no
   audience of its own**, so there is no inheritance to compute and no "child more public than
   its parent" to refuse: whether a reader may see a page is one comparison against its space,
   made in the query ([ADR 0028](0028-global-search-scope-in-the-query.md)). A space also carries
   a name, a description, an icon from a closed set of lucide icons and a colour from a fixed
   palette of tokens with light and dark values; never a free hex, because nothing outside the
   tokens defines a colour. Spaces are a catalogue only admins maintain, under
   `/settings/knowledge`: choosing what every employee can read is configuration of the
   organisation, not everyday content.
3. **Pages form a typeless tree inside a space.** `parent_id` points at a page of the same space.
   Siblings are ordered by hand through a fractional `position`
   ([ADR 0021](0021-board-positions-and-project-write-lock.md)), and a cycle is refused under the
   organisation-row lock ([ADR 0027](0027-locations-hierarchy-coordinates-and-deletion.md) §7).
   Titles are not unique, not even among siblings: unlike a location, a page is identified by its
   code, never by its path.
4. **Page codes are `DOC-####` and never editable** (amends
   [ADR 0010](0010-human-readable-record-codes.md)). Pages link to one another by code, and ADR
   0010 made codes editable for reasons that do not apply here: no label is printed and no import
   brings codes of its own.
5. **A page is a draft, published or archived, and is never deleted.** Draft is only the state of
   a page that has never been published; every staff member sees drafts and employees never do.
   Saving a published page publishes the change at once. A published page cannot sit under a
   draft. Archiving a page archives its subtree in one transaction, and so does unarchiving. A
   space with pages is archived rather than deleted; an empty one may be deleted.
6. **Every save appends a revision, and a stale save is refused.** `page_revisions` is
   append-only and unbounded: each row is the full markdown and title as saved, with author and
   time. The edit form carries the revision it was based on; the save locks the page row, and if
   the latest revision is no longer that one it answers a typed `stale_revision` instead of
   overwriting. Restoring an old revision appends a new one. Moving a page writes no revision,
   because its content did not change.
7. **Moving a page moves its subtree, across spaces too.** When the target space has a different
   audience the move changes who can read every page in the subtree, so the screen confirms it by
   naming the count. An admin may change a space's audience under the same confirmation.
8. **Relations go through `links`** ([ADR 0005](0005-single-suite-and-relations.md)), one table
   per pair. The first two are `ticket_page` (a ticket _cites_ a page) and `project_page` (a page
   _documents_ a project); `asset_model_page` and `asset_page` follow. A citation is created when
   a reply inserts a page through the composer's picker, or by hand from the ticket; removing the
   link from the text keeps it. A public reply cites only published pages of `portal` spaces; an
   internal note, any published page its author can read. A requester whose cited page is no
   longer readable to them sees its code and nothing else: stricter than the restricted view of
   escalated tasks ([ADR 0007](0007-roles-and-permissions.md), amendment 2026-10-15), because a
   page title can be sensitive on its own.
9. **Only `technician` and `admin` write pages** (`knowledge.manage`). Reading is
   `knowledge.view`, filtered by the space's audience; `employee` holds it.
10. **Pages are written in the rich text editor's `document` profile.** The editor and the
    markdown renderer take a profile; `comment` is the one ticket replies use, and `document` adds
    headings (h2 to h4), tables, a horizontal rule and a page picker. One editor, one sanitiser:
    widening what comments allow later is a change to their profile, not a second component.

## Consequences

- A space's audience is the single question every read asks, so search, the portal, citations
  and attachments (when they come) cannot disagree about who may read a page.
- Two people editing the same page lose nothing: the second save is refused and told why. The UX
  for that refusal has to be built, which is the cost [ADR 0021](0021-board-positions-and-project-write-lock.md)
  avoided on the board. There it was a drop retried in a second; here it is minutes of writing that
  cannot hold a row lock while someone types.
- Revisions are kept forever. They are text, and the volume of a team's documentation is small;
  if it ever weighs, old revisions can be compacted without changing what a page is.
- Moving pages or changing a space's audience can publish internal content to every employee.
  The confirmation is the only guard, deliberately: a rule that forbade it would push people to
  copy pages instead, and a copy has no history.
- Images and file attachments wait. The `Storage` they need lives in `service-desk`; moving it to
  `shared` is a refactor with production data behind it and gets its own change.
- Global search gains one group of page hits; archived pages and old revisions are not indexed.

## Alternatives considered

- **An embedded third-party wiki (Docmost).** Rejected: a second directory and permission model,
  an AGPL dependency the open-source decision has not settled, and documents outside the data
  model the relations need.
- **One tree with no spaces, project documentation linked to a root page.** Rejected in favour of
  spaces as the audience boundary: without them audience has to live on each page, inherit down
  the tree, and be re-checked on every move.
- **Per-space members or per-category permissions** (Zammad's model). Rejected: permissions per
  container contradict fixed roles ([ADR 0007](0007-roles-and-permissions.md)) and need the
  membership #58 has not designed.
- **Editable codes with links stored by UUID.** Rejected: it keeps ADR 0010 uniform at the price
  of a link format that is not the code a person pastes into a sentence.
- **A pending draft of changes on a published page** (Confluence). Rejected: two states per page,
  each with its own concurrency, to protect against a half-done change that a revision restore
  already undoes.
- **Last save wins, history in the activity log only.** Rejected: it loses work silently and
  cannot restore what a page used to say.
- **Real-time collaborative editing (Yjs).** Rejected: a sync server and a document model of its
  own, for a team-sized write load that optimistic concurrency covers.

## Addendum: decisions of the second design session (2026-10-22, #17)

The design above holds. A second session, after `Storage` moved to `shared/`, notifications and
members-only projects landed, and the editor shipped without profiles, settled what the first one
left open. Each point amends or completes the numbered decision or consequence it names.

1. **Page attachments are in; inline images stay out.** Amends the consequence that "images and
   file attachments wait": the reason is gone, because `Storage` lives in `shared/` (#272) and
   [ADR 0039](0039-attachments-per-owning-domain.md) fixes the pattern. `page_attachments` is the
   knowledge domain's own table, written through `shared/attachments.ts` with the same limits
   (5 files per submission, 10 MiB each), download only (#325). Images embedded in the body need
   permission-checked serving, `<img>` in the sanitiser and paste and drop in the editor, which is
   a separate change.
2. **No mentions in page bodies.** The `document` profile has none, as descriptions have none
   (#33). Mentions are allowed in page comments.
3. **Page comments are staff-only, to write and to read**, in `staff` and `portal` spaces alike
   (#326). They are an internal conversation about the document; an employee with a problem in a
   guide opens a ticket. A mention notifies through the existing `mention` type, and
   `notifications` gains a `page_id` target (the `CHECK` widens to four). Only active staff can be
   mentioned. Comments write no activity and no revision.
4. **No page following.** The only notification a page produces is a comment mention. Following
   knowledge pages is a follow-up (#330).
5. **A requester whose cited page is no longer readable sees its code and nothing else** (decision
   8). This is deliberately not [#310](https://github.com/NauelG/unitati/issues/310)'s shape for
   restricted tasks and projects, which carries no code, title or id: there the code was a
   handle to something the viewer could not otherwise learn of, while here the code is already in
   the text of the reply (`/knowledge/DOC-0012`), so hiding it from the ref protects nothing. Do
   not align the two.
6. **Members-only projects** ([ADR 0042](0042-per-project-visibility.md)): a page's "projects it
   documents" list goes through the projects scope, and projects the viewer cannot see appear as
   "N elementos restringidos", #310's shape. Linking a page to a project requires seeing the
   project. The page itself is governed only by its space's audience.
7. **One canonical link.** The page picker inserts `/knowledge/DOC-####`. An employee who opens it
   is redirected to `/portal/knowledge/DOC-####`; a reader who cannot see the page gets the usual 404.
8. **Portal suggestions appear only on the free-form ticket form**, while the subject is typed,
   not on request forms ([ADR 0037](0037-request-forms-not-ticket-types.md)).
9. **The editor profiles are this work.** [#209](https://github.com/NauelG/unitati/issues/209)
   closed without shipping any: `renderMarkdown` has a single allow-list and `RichTextEditor`
   takes no profile. The `document` profile of decision 10 is built with the editing change (#324)
   and no longer depends on #209.

### What the first sub-issue (#322) fixed in the schema

- A space's `icon` and `colour` are **text keys** of closed sets in `domain/knowledge.ts`,
  validated by the domain, not Postgres enums: both sets will grow, and Postgres cannot drop an
  enum value. The colours are tokens (`--kb-<key>`) with a light and a dark value in `app.css`.
- `page_tag` has **no update path**: nothing in the domain writes it after the insert, and a
  spec asserts it.
- The audience is applied **in the query** ([ADR 0028](0028-global-search-scope-in-the-query.md)):
  `readableSpaces` and `readablePages` in `knowledge/scope.ts`. A viewer without `knowledge.view`
  makes them throw rather than return an empty list.
- Changing a space's audience takes the **count the admin confirmed** and refuses `count_changed`
  if the number of non-archived pages (drafts included) is different when the space row is
  locked. Creating a page must take the same lock (#323) for the guarantee to hold.
