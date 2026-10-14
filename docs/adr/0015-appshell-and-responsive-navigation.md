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

## Addendum: viewport-height shell, independent scroll, brand-row collapse (#96)

Measured from `v0.14.0` screenshots: the sidebar's `surface-2` background painted only as tall as
`<nav>`'s content (the `flex` column, not the `<aside>` it sits in, carried the colour), and
`min-h-screen` on the root `<div>` let the _document_ grow with page content — a long record page
scrolled the brand row and topbar off-screen along with everything else. The collapse button also
lived inside `sidebarFooter`, styled as a full nav row (`navItem`), which read as a sixth
navigation entry rather than a shell control.

**Viewport height, not minimum height.** The root becomes `h-dvh overflow-hidden` — the dynamic
viewport unit rather than `100vh`, so mobile browser chrome showing/hiding does not leave a
scrollbar gap or clip content. `<aside>` and the right-column flex wrapper both get `h-full`; the
topbar keeps `shrink-0` (unchanged — it was already a stable row, just one the document could
carry off-screen).

**`<main>` and the nav-items region are the scrollers, not the document.** `<main>` is `min-h-0
min-w-0 flex-1 overflow-y-auto overscroll-y-contain`: `min-h-0` overrides flexbox's default
`min-height: auto`, the one-line reason a flex child refuses to shrink below its content's height
and the scrollport never activates. `<nav>`'s content splits into three stacked regions instead of
one flowing column: a `shrink-0` brand row, a new `min-h-0 flex-1 overflow-y-auto` nav-items region
(the search entry and every link), and the existing `shrink-0 mt-auto` footer (settings slot,
version). `sidebar`'s own background moves with this split implicitly — it was already on `<nav>`,
and `<nav>` is now genuinely `h-full`, so the colour reaches the bottom regardless of how short the
link list is.

**Collapse moves to the brand row, as an icon button.** `brandbar` gains a `rail` variant
(`flex-col`, so the 64px rail stacks logo over button instead of trying to fit both side by side)
and a new `collapseButton` slot — a bare icon button, `aria-expanded` reflecting state, an
`sr-only` label carrying the same expand/collapse string the tooltip shows, no visible text. The
old `sidebarFooter` button is removed outright, not kept as a duplicate; `aria-pressed` becomes
`aria-expanded`, the correct ARIA state for a control that reveals/hides content (the sidebar's
labels) rather than toggling a persistent setting.

**Typography:** `navItem` moves from `text-[13px] leading-4` to `text-sm leading-5` (14px/20px) and
gains `min-h-10` — the hit area is 40px even though the row's own padding still reads as the
32px-token rhythm `--size-row-compact` established; a row's paint height and its tap target are
two different numbers, the same distinction a table cell and its interactive control already keep
separate. `navCount` and `kbd` move from a hand-picked `text-[11px]` to `text-xs` (12px) with
`tabular-nums` on the count, so digits do not jitter width as they change. `navSection` headings
were already `text-xs` (12px/16px) — no change.

**Scrollbar:** a `.ut-scrollbar` utility in `src/app.css`, applied to both `<main>` and the
nav-items region, themes the _native_ scrollbar (`scrollbar-width: thin`, `scrollbar-color`, the
`::-webkit-scrollbar*` pseudo-elements) rather than replacing the scrolling engine — the issue's
own prohibition on a JS overlay scrollbar or `scrollbar-width: none`. `forced-colors` resets to
`scrollbar-color: auto`, since a thin custom thumb can disappear under some high-contrast palettes
where the system's own scrollbar would not.

**Scroll restoration.** SvelteKit's built-in scroll restoration targets `window`; with `<main>` as
the scroller, a browser Back to a long list would otherwise always land at the top. A new
`MainScrollRestoration` class (`src/lib/components/unitati/main-scroll-restoration.ts`, unit
tested) remembers `<main>`'s `scrollTop` keyed by pathname in `beforeNavigate` and resolves it in
`afterNavigate`: a `popstate` navigation (Back/Forward) restores the remembered value, every other
navigation type — link, `goto`, a fresh load — starts at the top, matching `window`'s own default
behaviour. The topbar is not `position: sticky` over `<main>`; it is a sibling flex row above a
separate scrollport, so a hash-targeted heading is never hidden behind it the way a sticky header
would hide one — no `scroll-margin-top` compensation was needed.

**Gallery specimen unaffected.** The `/dev/components` AppShell specimen already wraps the
component in a fixed-height, `overflow-hidden` container (`h-[420px]`) to show a static slice
without the component dictating the gallery page's own height; swapping `min-h-screen` for
`h-dvh` on `AppShell`'s own root does not change that — the wrapper still clips it the same way it
clipped `min-h-screen`. Its description now names the independently-scrolling nav and main.

**Scroll-ownership audit.** No route under `(app)` sets its own `min-h-screen`/`h-screen` or a
document-level scroll assumption that would conflict with `<main>` becoming the scroller: the
`overflow-hidden` seen on `DataTable`, `NameCatalogue` and the directory/model catalogue pages is
corner-clipping for a rounded card border, not a second scroll container. The asset record,
ticket record and gallery pages render inside `PageLayout` (ADR 0018) with no height assumption of
their own, so they inherit `<main>`'s scrollport unchanged. Wide tables still overflow the
viewport horizontally with no scroll affordance of their own — a pre-existing gap, out of this
issue's scope the same way sticky table headers are (#86).

## Addendum: collapsible navigation groups (#122)

A module with several work screens (Projects → Proyectos, Tareas) needs a parent row with
children. `AppShellNavLink` is now a discriminated union: a **leaf** (as before) or a **group**
`{ id, label, icon, section, accent, children }`. A group has no `href`, `count` or `permission` of
its own; every child keeps its own. Visibility lives in one pure function,
`resolveNavigation` (`app-shell-nav.ts`), unit-tested apart from any rendering:

- **A group is visible when at least one child is.** An all-hidden group disappears.
- **A group with exactly one visible child renders as a flat leaf**: the group's label, icon and
  accent with that child's `href` and `count`. A one-option disclosure is a wasted click. This is
  also why Assets and Service desk are already groups of one (`Inventario`, `Tickets`) and render
  exactly as before: the rule is exercised in production without special-casing, and the next
  child costs one array entry.
- **The parent only expands or collapses; it never navigates.** It is a `<button>` with a
  chevron, `aria-expanded` and `aria-controls`. A row that both navigates and toggles does two
  things at once, and keyboard and screen-reader users cannot tell which one they will get.
- **Auto-expand.** A group is open when the current route is inside one of its children
  (`aria-current="page"` on that child), whatever was stored. While it holds the current page its
  button is `aria-disabled`: collapsing it would hide the row that says where the viewer is, and a
  control that silently does nothing is worse than one that says so.
- **Persistence** follows the sidebar collapse: `localStorage` (`unitati:nav-groups`, the ids the
  viewer opened by hand), no flash. The nav is not in the DOM when `app.html`'s inline script
  runs, so it cannot set an attribute on it; it injects a `<style id="ut-nav-open">` that opens the
  stored groups before the first paint, and `AppShell` removes it on mount once its own state
  agrees. Children are always in the DOM and shown by `[data-open]`, so open/closed is plain CSS
  and SSR renders the same markup. Writes merge into whatever is stored, since the gallery mounts
  several shells on one page.
- **Rail mode.** There is no room for indented children in 64px, so the parent icon opens a
  popover (the vendored shadcn-svelte one; no new dependency, ADR 0017) listing the children with
  their counts. Enter/Space open it, ArrowUp/Down/Home/End move, Escape closes and returns focus to
  the icon. The swap to the popover happens after mount, so hydration sees what the server
  rendered; until then the rail simply hides the inline children with CSS.
- **Mobile drawer** behaves like the expanded sidebar; navigating closes it, as before.
- **Counts** belong to children. The parent shows none.
- **Keymap.** The `g`-prefix shortcuts are built from the resolved leaves (`navLeaves`), so a
  shortcut keeps working whether its link is top-level, a child or a flattened group. The command
  palette's navigation actions are static (`palette-actions.ts`) and unaffected.

Three levels (Settings as a group with modules and catalogues beneath it) were rejected: they do not
fit the icon rail, and Settings gets its own secondary navigation inside `/settings` (#123).

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

## Addendum: the Settings area (#123)

The `settings` snippet `AppShell` reserved now has a route behind it.

- **One rule for catalogues.** Every configurable catalogue lives in `/settings/{module}/{catalogue}`,
  never inside the module. The module keeps only its work screens, and nobody has to guess where
  the next catalogue goes. The existing asset and service-desk catalogues move there in #126.
- **The registry.** `src/lib/settings/sections.ts` lists every section once: `module`, `href`, a
  message-function label and the `permission` that manages it. The sidebar link, the secondary
  navigation, the `/settings` index and the guards all read it through `visibleSections`, so
  adding a section is one entry and a section the viewer cannot manage is hidden everywhere at
  once.
- **Visibility rule.** _Configuración_ appears at the bottom of the sidebar, above the version,
  only when at least one registry section is visible. `AppShell` hands the snippet `{ rail }` so
  the row centres its icon in the 64px rail; the mobile drawer renders the same snippet.
- **Own navigation.** Inside `/settings` a secondary navigation (`SettingsNav`: a side list from
  `md`, a compact scrolling strip below it) groups sections by module. Settings is not a sidebar
  group, for the reason already given: a third level does not fit the icon rail.
- **Guards answer 403, not 404.** `requirePermission` hides a resource by answering 404. Here
  there is nothing to hide: the area is announced by the sidebar for anyone who can use it, so a
  signed-in viewer without access is told so. `/settings/*` is 403 when no section is visible,
  and each section's page and every action checks its own permission
  (`requireSettingsSection`).
