# 0015. AppShell and responsive navigation

- **Status:** accepted
- **Date:** 2026-10-09

## Context

UI overhaul ([#81](https://github.com/NauelG/unitati/issues/81)) phase 2
([#83](https://github.com/NauelG/unitati/issues/83)). `(app)/+layout.svelte` is a route file, so it
cannot appear in the component gallery ([ADR 0011](0011-component-layers-and-the-gallery.md)) —
exactly why it drifted unnoticed. Measured at `v0.13.0` against the spec
(`docs/design/design-system.html`, AppShell section; `docs/design/assets/css/components.css`):

| Spec                                     | Implemented                         |
| ---------------------------------------- | ----------------------------------- |
| sidebar `background: var(--surface-2)`   | `surface-1`                         |
| `.ut-nav-item { height: 32px }`          | `var(--size-row)` — the table token |
| active = `brand-soft` bg + `brand` text  | `surface-2` + `ink`                 |
| `.ut-nav-section` headings               | none                                |
| search entry, `⌘K` hint                  | absent                              |
| `.ut-count` per module                   | absent                              |
| Settings + version at the sidebar bottom | version in the top header           |

Also: below `md`, the sidebar was `hidden` with no replacement — phones had zero navigation.

## Decision

**One `AppShell`, in the gallery, consumed by a thin `(app)/+layout.svelte`.**

### Spec conformance

`src/lib/components/unitati/AppShell.svelte` is a `tv()` component with slots for `sidebar`,
`brandbar`, `navSection`, `navItem`, `navIcon`, `navDot`, `navLabel`, `navCount`, `kbd`,
`sidebarFooter`, `topbar` and `main`. The six drifts above are closed one for one: `surface-2`
sidebar, `--size-row-compact` (32px — already in `tokens.css`, just unused; **not** a new
component-level size) nav rows, `brand-soft`/`brand`/`aria-current="page"` active state (this rule
already existed in `components.css`, `.ut-nav-item[aria-current="page"]` — it had simply never been
read), `MODULES`/`DIRECTORY` section headings, a `.ut-count` per module, and `AppVersion` moved to
the sidebar bottom.

Directory gets an icon with no dot, same as the spec's own markup (`design-system.html`'s AppShell
example draws a dot beside Assets/Service desk/Projects only, never beside People) — there is no
`--directory` colour token to paint one with, only `--asset`/`--desk`/`--project`. The issue's prose
lists `users` among "the icons already exist" without separating which rows also carry a dot; the
concrete HTML is the more precise source, the same way ADR 0018 treated the CSS spec as more precise
than prose that invented six page widths it never asked for.

A link's `section` (`'modules' | 'directory' | undefined`) decides whether `AppShell` renders a
heading above it — the first time a link in a new section appears, not a heading per link — so
`Overview` and the non-production gallery link render outside either section, exactly where the
spec's own example places things that are not a module: before `MODULES` and after `DIRECTORY`.
`(app)/+layout.svelte` builds this array (href, label, icon, section, accent, count) and the
permission filter that was already there; `AppShell` owns none of that policy, only the shape.

### Settings

The issue's own answer stands: no Settings route exists yet, so none renders. `AppShell` takes an
optional `settings` snippet prop and nothing calls it — the slot is reserved, not simulated with a
link to `/dev/components`.

### Search

A button styled as a nav item, first in the sidebar, gated on `showSearch` (the caller passes
`!isProduction(APP_ENV)`, the same gate the gallery link already used). Clicking it dispatches a
plain DOM `CustomEvent('unitati:command-palette')` on `window` — not a callback prop — so phase 7's
palette can listen for it with no import edge back into `AppShell`. Until then it is a tooltip
("⌘K — próximamente") and nothing else.

### Counters

One `count*(organisationId)` read per domain, added where `listLocations` and `listManufacturers`
already set the precedent: a bare `organisationId` parameter, no `SessionUser`, because nothing
here is redacted per viewer.

- `assets.countActive` — `state <> 'retired'`.
- `service-desk.countOpen` — `status not in ('resolved', 'closed')`.
- `directory.countPeople` — every person.

Aggregated in `(app)/+layout.server.ts` with `Promise.all`, each gated on the same permission(s)
that already decide whether the link shows at all (`ASSET_READ_PERMISSIONS`,
`TICKET_READ_PERMISSIONS`, `'people.view'`, from `src/lib/domain/access.ts`): a viewer who cannot
see a module gets `undefined` for its count, never a number for a link that isn't rendered.

### Mobile drawer

`shadcn-svelte add sheet` vendored `src/lib/components/ui/sheet/` (and pulled in
`ui/button` as a dependency — the first components in that folder; `ui/table` already existed).
ADR 0011's rule holds: neither file is hand-edited. Two gaps the vendoring exposed, both fixed
outside `ui/`, in the files their own doc comments already claim:

- `#lib/utils.ts` was missing `WithoutChildrenOrChild`, which `sheet-content.svelte` imports.
  Added there — the file's header comment already frames it as "part of that contract".
- The vendored overlay ships `bg-black/10`. Retheming it to `--scrim` (#83's first real use of
  that token) is a `[data-slot='sheet-overlay']` rule in `src/app.css`, the file that already maps
  every other shadcn-svelte token onto ours — not a fork of `sheet-overlay.svelte`.

Below `md`, a hamburger in the topbar opens the same `navList` snippet `AppShell`'s own sidebar
renders — one source of truth, not a second nav list that can drift from the first. Focus trap and
`Esc` come from bits-ui's `Dialog` underneath `Sheet`, not from anything hand-rolled.

### Desktop collapse, with no flash

Collapsing the sidebar changes its width and hides every label — the two things a hydration
mismatch would make visible as a flash. Both are driven by a CSS attribute selector
(`html[data-sidebar-collapsed]` in `src/app.css`), not by Svelte's reactive `$state`, and the
attribute is set by an inline `<script>` in `app.html`'s `<head>` — before `<body>` paints anything
— reading `localStorage.getItem('unitati:sidebar')`. This is the same shape as a dark-mode toggle
(the issue's own reference to mode-watcher's pattern): the source of truth for layout is an
attribute set before paint, not component state that only exists after hydration.

`--size-sidebar-current` is the var `AppShell` actually reads for its width; `--size-sidebar` stays
exactly what `tokens.json` already documents it as — "Expanded". `--size-sidebar-collapsed: 64px`
is new, and `tokens.json`/`tokens.css` under `docs/design/` are **not** updated to match: that
folder is the frozen design handoff (last touched the commit that unpacked it), and ADR 0018 already
established that drift against it is something this codebase measures, not something it edits back
into the spec. The gap tokens.json calls out — "Expanded… width" with no collapsed counterpart — is
closed in the app's own tokens, and noted here instead.

`AppShell` still keeps a small `collapsed = $state(...)`, initialised by reading the same attribute
off `document.documentElement` at component init (which happens after the inline script has already
run) — not to drive layout, only so the toggle button itself shows the right icon and label
(`panel-left`, "Contraer"/"Expandir"). A hydration mismatch here is possible in principle but not
observed in practice, since the attribute read happens after the script that sets it; if it ever
is, the cost is one icon on one button for one frame, not the sidebar's width.

### Gallery

A static `AppShell` specimen under a fixed-height, `overflow-hidden` wrapper — the issue's own
"fake counts" instruction — in `(app)/dev/components/+page.svelte`, same `section()` pattern every
other entry on that page uses.

## Consequences

`(app)/+layout.svelte` goes from owning the sidebar and header markup to building a links array,
aggregating three counts, and composing `AppShell` with a `topbarEnd` snippet for the one thing
that stays route-specific: the signed-in user and the sign-out form.

The collapse mechanism's split between "what CSS alone can flash-free toggle" (width, labels) and
"what still needs component state" (the toggle button's own icon) is more moving parts than a
single `$state` boolean would be. It is the deliberate cost of the issue's own "without layout
flash" requirement; a future `localStorage`-driven `$state` alone, synced in an `$effect`, would be
simpler and would flash once per hard reload.

Two Lucide icons (`menu`, `panel-left`) and four (`package`, `ticket`, `folder-kanban`, `users`)
join the four the spec already named, all already available in `@lucide/svelte`; no icon had to be
approximated.
