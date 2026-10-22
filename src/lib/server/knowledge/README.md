# knowledge

The knowledge base: **spaces**, the **pages** inside them, and the **revisions** of each page
([ADR 0031](../../../../docs/adr/0031-knowledge-base-spaces-page-tree-and-revisions.md) and its
addendum). This folder is the domain with **the spaces catalogue** (#322) and **the page tree and its
lifecycle** (#323) built: tables, permissions, the audience scope, activity, `/settings/knowledge`,
and the `/knowledge` screens. Editing and revisions are #324, attachments, comments, citations, the
portal and search the sub-issues after.

## What it owns

- **`knowledge_spaces`** — the audience boundary. A space is `staff` (technicians and admins) or
  `portal` (every employee too), and carries a name, description, an `icon` and a `colour`. Both
  are **text keys of the closed sets** in `src/lib/domain/knowledge.ts` (`SPACE_ICONS`,
  `SPACE_COLOURS`), validated by the domain and not by Postgres, because both sets will grow.
- **`pages`** — a typeless tree inside a space (`parent_id`, fractional `position`). `title` and
  `body` are the latest revision, kept on the row so a read is one query. `page_tag`
  (`DOC-####`, from `page_code_seq`) is the canonical link and **has no update path**.
- **`page_revisions`** — append-only history: the full title and markdown as saved, author and
  time. No update or delete path exists.
- **`page_code_seq`** and the enum **`knowledge_space_audience`**.

`activity` gains two targets, `spaceId` and `pageId`, and eleven verbs, all declared now so later
sub-issues add no enum values. Only the three `space.*` verbs are written here.

## Invariants

- **`pages.revision = max(page_revisions.number)`** at every commit, and creating a page inserts
  revision 1 in the same transaction (`createPage`). A move, a publish or an archive writes no
  revision: the content did not change.
- **A page's parent is in the same space.** The database cannot say it (it is a comparison between
  two rows), so the domain enforces it under the organisation lock.
- **Any write that changes what a space's audience covers locks the space row**
  (`FOR UPDATE`): `changeSpaceAudience`, `archiveSpace`, `updateSpace`. Creating or moving a page
  into a space must take the same lock, or the count an admin confirmed can be wrong by the time it
  is applied.
- **A space is archived with its pages in one transaction** (`archiveSpace`); archived means
  read-only, and the catalogue refuses to edit, re-audience or re-archive an archived space.
- **A space with any page, archived included, cannot be deleted** (`has_pages`): the pages still
  carry history and revisions.

## The tree and its writes (`pages.ts`)

- **Lock order, in every page write: the organisation row, then the space rows by id.** The
  organisation lock serialises structural writes, so two opposite moves (A under B, B under A)
  answer one `cycle` (ADR 0027 §7); the space locks are the ones `changeSpaceAudience` takes.
- A move carries the whole subtree (`space_id` of every descendant). When the target space has a
  different audience, `movePage` needs `confirmedCount` equal to the non-archived subtree size
  (`confirmation_required` / `count_changed`); `previewMove` answers that figure.
- A published page cannot sit under a draft (`parent_unpublished`), on publish or on move. There is no
  unpublish and no delete.
- `archivePage` archives the subtree in one transaction; `unarchivePage` restores the page and the
  pages archived **at the same instant**, so a branch archived on its own earlier stays archived.
- Positions are fractional (`shared/position.ts`, ADR 0021) and the siblings are renumbered when a gap
  collapses.
- Reads: `listSpaceTree` and `getPageByTag` start from `readablePages`; `includeArchived` is a staff
  read and ignored for everybody else.

## Who sees what

Two questions in two places, as in the other domains. May they reach the screen? A capability,
gated by `requirePermission` in the route (ADR 0007). Which rows? Data, here: every read starts
from `scope.ts`, **in the query** ([ADR 0028](../../../../docs/adr/0028-global-search-scope-in-the-query.md)),
never as a filter after loading.

- `knowledge.view` — every role. Without it, `readableSpaces` returns `null` and
  `requireSpaceScope` / `readablePages` **throw**: an empty list would be indistinguishable from a
  correctly-scoped empty one and would hide a route that forgot its guard.
- `knowledge.manage` (technician, admin) is what makes a viewer **staff** for the scope: both
  audiences, and drafts.
- Everyone else reads `portal` spaces and, inside them, **published** pages.
- `readableSpaces` — organisation, not archived, and `portal` unless staff.
- `readablePages` — the page's space is readable **and** the page is not archived **and**, for a
  non-staff viewer, `published_at is not null`. Archived pages reach staff only through
  `includeArchived`.
- `knowledge.manage` is required by **every write on pages** (`requirePagesManage`), which throws.
- `knowledge.spaces.manage` (admin) is required by **every write on the catalogue**
  (`requireSpacesManage`), as a backstop to the route's gate. It throws: calling a write from the
  wrong place is a programming error, not a business outcome.
- Counts follow the same rule: an employee's `pageCount` counts published pages only, so a draft
  is not even visible as a number.

## The audience change is confirmed against a count

Changing a space's audience publishes internal content to every employee, or hides it from them.
`previewAudienceChange` answers how many non-archived pages are affected (drafts included: they
would become visible when published, and hidden ones become hidden). `changeSpaceAudience` takes
that number back as `confirmedCount` and refuses `count_changed` if it differs when the space is
locked. A change to the audience the space already has is a no-op.

## Imports

- Other domains import this one only through `index.ts`. They do not import its tables.
- `knowledge` imports `directory` (organisations, people) and `activity`, and nothing else. Pages
  relate to tickets, assets and projects through `links` (ADR 0005); it never imports
  `service-desk`.
- `scope.ts` is a leaf: every file in the folder may import it, and it imports no sibling but
  `schema.ts`.
- `activity/schema.ts` imports this folder's tables for its foreign keys. That is the one inversion
  `activity` already has with every domain (see its schema comment).

## Files

| File            | What                                                                     |
| --------------- | ------------------------------------------------------------------------ |
| `schema.ts`     | the tables, the enum and the sequence                                    |
| `scope.ts`      | `readableSpaces`, `readablePages`, `requireSpaceScope`, write guard      |
| `spaces.ts`     | the catalogue: list, create, update, audience change, archive, delete    |
| `pages.ts`      | the page tree: reads, create, reorder, move, publish, archive            |
| `validation.ts` | Zod input for the catalogue; holds `icon` and `colour` to the closed set |
| `index.ts`      | the public surface                                                       |
