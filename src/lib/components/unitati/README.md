# `components/unitati/`

The app's design-system components: the `ut-` families in
[`docs/design/design-system.html`](../../../../docs/design/design-system.html), reproduced as
Svelte components. The stylesheet beside that file is the reference rendering, not a dependency —
nothing here imports it.

## The ratchet

**A component that is not in the gallery is not finished.** Every variant, and every branch —
`Avatar` renders three different ways depending on `meta` and `imageUrl`, so the gallery shows
all three.

[`/dev/components`](<../../../routes/(app)/dev/components/+page.svelte>) is a category index over
one page per component (`/dev/components/[component]`), each built from the shared template in
[`gallery/ComponentDocPage.svelte`](<../../../routes/(app)/dev/components/gallery/ComponentDocPage.svelte>):
purpose, when to use it, props, every live variant and state, and a copyable usage snippet.
Adding a component means adding its entry to
[`gallery/manifest.ts`](<../../../routes/(app)/dev/components/gallery/manifest.ts>) and its spec
under `gallery/specs/`; adding a variant means adding its example to that spec. A regression test,
[`gallery/gallery.guard.spec.ts`](<../../../routes/(app)/dev/components/gallery/gallery.guard.spec.ts>),
fails `npm test` if a `unitati/*.svelte` file has neither a manifest entry nor a documented
exception — so a component missing from the gallery is caught in CI, not noticed by a reviewer
days later.

The gallery also has a token page (`/dev/components/tokens`, rendered straight from
`tokens.json`), a coverage page (`/dev/components/coverage`, deriving the `ut-*` vocabulary from
`components.css`) and a composition-patterns page (`/dev/components/patterns`).

Every route under `/dev/components` exists in every environment but production (`APP_ENV`, see
[ADR 0013](../../../../docs/adr/0013-app-env-and-the-non-production-surface.md)) and answers 404
there — a runtime check in the shared
[`+layout.server.ts`](<../../../routes/(app)/dev/components/+layout.server.ts>), not a
build-time `dev` flag and not one copy per page. `assets/+server.ts` keeps its own check: it is
an API endpoint, not a page, so a parent layout's `load` never runs for it. It is not a surface
to secure, document or keep accessible — it is a workbench.

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
- **Sizes come from `text-<role>`, never an arbitrary value.** `text-title-3`, `text-label`,
  `text-small`, … set size, line-height, tracking and weight together (`src/app.css`, from
  `tokens.json`). A missing role is added there, not spelt as `text-[13px]`; the guard
  `type-roles.guard.spec.ts` fails the build otherwise.
- **Colour means a domain or a state, never a person.** `Avatar` has no tone variant on purpose.

## Shared patterns

Composed by routes instead of re-spelled; each has a gallery page.

- **`ListToolbar`**: the `GET` search form of an index screen, attached to the table panel (ADR
  0019). Put it and the `DataTable` in one `<div>` and give the table `class="rounded-t-none"`.
  Not for record pages, which have no table to attach to.
- **`FormError`**: the form-level error line (`role="alert"`). Empty children render nothing, so
  write `<FormError>{message}</FormError>` without an `{#if}`. A single field's error stays on `Field`.
- **`DescriptionList`**: label/value pairs as a `104px 1fr` grid (`.ut-dl`), values left-aligned and
  wrapping inside their own column. Never `flex justify-between`. Not for tabular data: use `DataTable`.
- **`FormActions`**: the action row of a form in a `Dialog` or `Sheet`. **Secondary first, primary
  last, right-aligned**: `[Cancelar][Guardar]`. The form still owns the row (ADR 0020); this is its layout.
- **`SegmentedControl`**: `.ut-btn-group`. Options with `href` are links (`aria-current`), the rest
  buttons (`aria-pressed`). Not for navigating between sections.

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

Each route's `+page.server.ts` checks `isProduction(APP_ENV)` and returns 404 there (ADR 0013);
nothing in the markup is conditional on it. A production build still ships the fixtures and the
route **entries** as unreachable weight: SvelteKit discovers routes from the filesystem and its
config has no route-exclusion option, so "no file, no route" is the only way to make one truly
absent. The 404 is the guarantee; the stub is the cost of not having that option. The app shell's
nav entry is hidden in production as a convenience (`src/routes/(app)/+layout.svelte`), not the
guard — every nested route 404s on its own even if the link were still shown.
