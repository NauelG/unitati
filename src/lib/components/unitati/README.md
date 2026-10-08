# `components/unitati/`

The app's design-system components: the `ut-` families in
[`docs/design/design-system.html`](../../../../docs/design/design-system.html), reproduced as
Svelte components. The stylesheet beside that file is the reference rendering, not a dependency —
nothing here imports it.

## The ratchet

**A component that is not in the gallery is not finished.**

[`/dev/components`](<../../../routes/(app)/dev/components/+page.svelte>) renders every variant and
every state of everything in this folder. Adding a component means adding its section; adding a
variant means adding its example. The gallery is the only place where a reviewer sees the whole
set at once, so a component missing from it is a component nobody will notice has rotted.

The route exists only in development. It is not a surface to secure, document or keep
accessible — it is a workbench.

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

- **Colour only through a token.** `var(--brand)`, never `#1d5cf0`. `src/app.css` is the one
  place a colour is defined; a literal here is a second source of truth.
- **`tv()` builds every class string.** No template-literal concatenation: tailwind-variants
  already resolves conflicts and keeps the variant table readable as a table.
- **Status arrives as a key, never as text.** `status.ts` holds the vocabulary and maps each key
  to a tone and a message, so a label is translatable and a typo is a type error.
- **Colour means a domain or a state, never a person.** `Avatar` has no tone variant on purpose.

## What is deliberately missing

`RecordRef`, `RelatedRecords`, `AssetTimeline`, `GlobalSearch` and `TicketDetailLayout` are
specified in the design system and not built: each needs a domain that does not exist yet. See
issues #7, #8, #9 and #12.

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
