# `components/unitati/`

The app's design-system components: the `ut-` families in
[`docs/design/design-system.html`](../../../../docs/design/design-system.html), reproduced as
Svelte components. The stylesheet beside that file is the reference rendering, not a dependency —
nothing here imports it.

## The ratchet

**A component that is not in the gallery is not finished.** Every variant, and every branch —
`Avatar` renders three different ways depending on `meta` and `imageUrl`, so the gallery shows
all three.

[`/dev/components`](<../../../routes/(app)/dev/components/+page.svelte>) renders every variant and
every state of everything in this folder. Adding a component means adding its section; adding a
variant means adding its example. The gallery is the only place where a reviewer sees the whole
set at once, so a component missing from it is a component nobody will notice has rotted.

The route exists in every environment but production (`APP_ENV`, see
[ADR 0013](../../../../docs/adr/0013-app-env-and-the-non-production-surface.md)) and answers 404
there. It is not a surface to secure, document or keep accessible — it is a workbench.

## Two folders, two owners

| Folder                | Owner                                                     |
| --------------------- | --------------------------------------------------------- |
| `components/unitati/` | Ours. Formatted, linted and reviewed like any other code. |
| `components/ui/`      | `shadcn-svelte add` output. Vendored verbatim.            |

`components/ui/` is in `.prettierignore` so it stays byte-identical to upstream and diffable
against the next `add`. Never hand-edit a file there: compose around it instead, the way
`DataTable.svelte` wraps `ui/table`.

`components.json` aliases use `#lib`, not `$lib`. This repo addresses `src/lib` through Node
subpath imports, and `shadcn-svelte` validates its aliases against real resolvable paths — with
`$lib` the CLI refuses to run at all.

## Rules these components keep

Decided in [ADR 0011](../../../../docs/adr/0011-component-layers-and-the-gallery.md); summarised
here because this is the folder they govern.

- **Colour only through a token.** `var(--brand)`, never `#1d5cf0`. `src/app.css` is the one
  place a colour is defined; a literal here is a second source of truth.
- **`tv()` builds every class string.** No template-literal concatenation: tailwind-variants
  already resolves conflicts and keeps the variant table readable as a table. A positional or
  conditional style is a variant, not an `if` returning a string.
- **Status arrives as a key, never as text.** `status.ts` holds the vocabulary and maps each key
  to a tone and a message, so a label is translatable and a typo is a type error.
- **Colour means a domain or a state, never a person.** `Avatar` has no tone variant on purpose.

## What is deliberately missing

`GlobalSearch` is specified in the design system and not built: it needs a domain that does not
exist yet (#12). `RecordRef` and `RelatedRecords` are built (#9); `TicketDetailLayout` leaves its
side column to the caller, so the page puts `RelatedRecords` there.

`TicketThread`, `TicketComposer` and `TicketDetailLayout` are built (#8). The thread renders what
`ticketThread` returns — comments merged with `activity` events at read time; it never reorders and never decides who sees an internal note —
the query already did.

`AssetTimeline` takes the merged list `mergeAssetTimeline` (in `links`) returns: past events from
`activity` and tickets from the live relation, on one rail. The ticket dot exists because tickets
now appear; the project dot arrives with the first project entry — not before, because a variant
nothing can render is a variant nobody tests.

Two things in this folder are not in the design system and exist because a screen needed them:
`SelectField` (the `Field` of a `<select>`, sharing its styles) and `Pager` (previous / next as
links, because a page is a URL). `Button` renders an `<a>` when given an `href`.

`src/lib/utils.ts` carries only the `cn` and `WithElementRef` that `ui/table` imports —
`shadcn-svelte add button` was run against it and needs nothing more. A component that wants
`WithoutChild` or `WithoutChildren` will fail to compile with a clear message; add them then,
not before.

## The gallery and the production build

`+page.server.ts` returns 404 unless `dev`, and the markup sits behind `{#if dev}`, so a
production build collapses the load to an unconditional 404, drops the nav entry from the app
shell, and ships none of the fixtures. The route **entry** survives as a stub: SvelteKit
discovers routes from the filesystem and its config has no route-exclusion option, so "no file,
no route" is the only way to make one truly absent. The 404 is the guarantee; the stub is
unreachable weight.
