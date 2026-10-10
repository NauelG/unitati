# Changelog

All notable changes to Unitati are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/): while the product is pre-1.0,
minor bumps carry features and patch bumps carry fixes.

## [0.23.0] - 2026-10-10

### Added

- The motion system (#87): three tokens (`--motion-fast` 120ms, `--motion-base` 160ms,
  `--motion-slow` 240ms, nothing above that ceiling) plus `--ease-out`/`--ease-in-out`, read by
  every transition and animation that used to hardcode a duration — Button, Field, Pager,
  AppShell's nav/collapse button, DataTable's sort button, AssetsNav's tabs, both app/portal
  sign-out links.
- `prefers-reduced-motion` kills all non-essential motion in one global CSS layer
  (`src/app.css`), not per-component goodwill: every `animation`/`transition` collapses to
  `0.01ms`. The one thing CSS cannot reach — `document.startViewTransition()` — is guarded in
  JS instead, in the root `+layout.svelte`'s `onNavigate` hook (`prefersReducedMotion()`,
  `src/lib/motion.ts`).
- View Transitions on same-origin navigation (feature-detected; Firefox degrades to an instant
  swap, no polyfill, no error — D12). `AppShell`'s sidebar and topbar carry their own
  `view-transition-name` (`shell-sidebar` / `shell-topbar`), pulled out of the default root
  capture and held motionless, so only the content between them crossfades.
- S1, the record morph: `DataTable`'s first cell gets `view-transition-name: record-{tag}`
  when the row links somewhere (`toViewTransitionName`, `src/lib/motion.ts`); the asset and
  ticket detail headers' code chips, and every `RecordRef` chip, carry the same name for their
  record. Clicking in travels the tag into place; Back reverses it.
- List physics: `DataTable` rows glide to their new position on a sort toggle via
  `animate:flip` (Svelte's directive only attaches to a real DOM element, so the row is a plain
  `<tr>` replicating `ui/table`'s own styling rather than `Table.Row` — ADR 0011, compose
  around the vendored primitive) and fade in via `tw-animate-css`'s `animate-in fade-in`, the
  app's first real import of that package outside the vendored `ui/` primitives.
- The vendored dropdown/popover/dialog/sheet primitives (`ui/select`, `ui/popover`,
  `ui/dialog`, `ui/alert-dialog`, `ui/sheet` — ADR 0011: never hand-edited) get a consistent
  120ms-in/160ms-out open/close duration through an attribute-selector override in `app.css`,
  the same retheming move already used for the sheet overlay's colour; `ui/sheet-content`'s own
  plain (non-state-gated) `transition duration-200` gets the same treatment separately.
- `AppShell`'s `<main>` scroll restoration (ADR 0015 addendum, #96) now waits for any in-flight
  View Transition to finish before writing `scrollTop` (`afterViewTransitionSettles`,
  `src/lib/motion.ts`) — restoring it mid-animation would otherwise bake the jump into the
  browser's "new" snapshot instead of landing after the morph settles, as the issue specifies.
- `StatusBadge` pulses once (a ≤160ms scale keyframe) when its `status` prop changes after
  mount — never on the badge's own first render, which would explain nothing.
- A "Motion" gallery page (`/dev/components/motion`): the constitution's six rules, the three
  tokens rendered live, the current `prefers-reduced-motion` read, a local S1 demo pair, and a
  reorderable FLIP list.
- `.ut-transition-fast` (`src/app.css`): the micro-feedback duration/easing pairing
  (`--motion-fast` + `--ease-out`), shared by every hover/press/toggle transition instead of
  each one spelling out `duration-[var(--motion-fast)] ease-[var(--ease-out)]` by hand.
  `AssetsNav`'s tab styling also moves from a conditional baked into a template literal to a
  `tv()` variant (ADR 0011 rule 2).

## [0.22.0] - 2026-10-10

### Added

- `/assets/[tag]` finishes the `WorkPanel` rollout ADR 0019 deferred: its six hand-rolled
  `panel`/`panelTitle` template-string sections (details, custody, state, location, note,
  timeline) now compose `WorkPanel` the same way `/service-desk/[tag]` already did, closing the
  one page ADR 0019 explicitly left one step behind the new grammar.
- `/dev/components/patterns` gains composed screen specimens (#101, following the gallery
  contract from #85): a list index at one row and fifty rows, a ticket detail with both public
  and internal messages next to a related-asset panel carrying a 70-character asset name at the
  320px rail width, an asset detail with long model/location values, and a catalogue list at one
  row and fifty rows. Each specimen reuses the real route's own composition (a single `WorkPanel`
  where the real page has one, a bare list where the catalogue page has one) rather than wrapping
  already-bounded panels in another — no second, nested border repeating the seam ADR 0019 just
  eliminated.

## [0.20.1] - 2026-10-10

### Fixed

- `AppShell`'s mobile drawer stayed open after tapping a nav link, since nothing ever flipped
  `drawerOpen` back to `false` once SvelteKit's client-side router took over — `afterNavigate`
  now closes it on every navigation, the same hook that already resets `<main>`'s scroll
  position.
- `AppVersion` was rendered only inside the desktop `<aside>` (`hidden md:block`), so the mobile
  drawer's `<nav>` never showed it. It now also renders in the drawer's own footer, same markup
  as the desktop sidebar's.

## [0.21.0] - 2026-10-10

### Added

- `EmptyState`, a shared empty-grid shape (#86): an optional title, one required sentence, a
  Lucide icon in a soft `--brand-soft` disc, a primary action and an optional keyboard-shortcut
  hint — deliberately one modest size, never the oversized card the issue itself complained
  about. `DataTable`'s own empty grid composes it instead of its former bare `<p>`, as do the
  four catalogues. The assets index distinguishes "no data yet" from "no matching filtered
  results" with different icon/title/action — the latter offers a "clear filter" link instead of
  "register the first asset".
- `DataTable`'s header is `position: sticky` against `main` — the shell's own scrollport — while
  a wide table scrolls horizontally without losing its rounded panel corners: `panel` drops
  `overflow-hidden` (which would have made the panel itself the sticky header's scrolling
  ancestor instead of `main`) in favour of `overflow-x-auto overflow-y-visible`, and the four
  visual corners round by hand on whichever head/body cell is first or last in its row.
- The asset inventory renders at the existing `compact` row density (`--size-row-compact`),
  unused until now.
- `Breadcrumbs`, a data-driven, 56px local nav bar above a record's own header (#86): segments
  come from the page's own `+page.server.ts` — never parsed back out of the URL, which a
  reserved route segment or a custom tag would make unreliable — and the last segment is always
  the current, unlinked record. `/assets/[tag]` and `/service-desk/[tag]` both gain one: asset →
  its catalogue, ticket → its queue (linking to `/service-desk?queue=…`) → the ticket itself. It
  sits beside the existing `PageHeader`/`TicketDetailLayout`, not a second copy of either.
- `shadcn-svelte add tabs` (#86): `ui/tabs` joins the other vendored primitives (`ui/dialog`,
  `ui/select`, …) in `.prettierignore`'s byte-identical-to-upstream set. No `unitati/Tabs.svelte`
  wrapper yet and no gallery page — same footing as `ui/table`, `ui/popover` or `ui/textarea`
  today, none of which have one either: the gallery's coverage guard only binds `unitati/*.svelte`
  files, and the issue's own text allows deferring a themed wrapper until a real page needs one.
- The queues catalogue (`/service-desk/queues`) moves to the same `Dialog`/`ConfirmDialog` shape
  (ADR 0020) the three asset catalogues already use, replacing its always-live inline rename
  field and bare, unconfirmed delete form — the one catalogue screen that had not yet migrated.
  A delete refusal (a queue with open tickets) now surfaces through `Alert`'s `danger` tone
  instead of a raw, un-styled `<p role="alert">`, on queues and consistently across the asset
  catalogues too.

## [0.20.0] - 2026-10-10

### Added

- Task-sized form workflows (#100, ADR 0020): a `Dialog` shape joins `Alert`/`ConfirmDialog` for
  short, one-to-three-field creates and edits, composed directly around shadcn-svelte's vendored
  `ui/dialog` the same way `ConfirmDialog` composes `ui/alert-dialog` — the app's own typography
  and radius, one scroll container, no nested dialog or sheet. Unlike `ConfirmDialog`, it owns no
  footer: `children` is the whole `<form>`, including its own Guardar/Cancelar row, since a
  create/edit form already knows its own submit label and `use:enhance` shape.
- The three asset catalogues — `NameCatalogue` (categories, manufacturers) and `assets/models` —
  reclassify from `PageLayout`'s `form` variant to `index` (ADR 0020 supersedes ADR 0018's
  "catalogues are forms"): the list is the page, a header `Nuevo…` action opens the new `Dialog`
  to create, and each row's `Editar` opens the same dialog prefilled from that row instead of
  three always-live inline inputs per model and two per category/manufacturer. `Eliminar` keeps
  `ConfirmDialog`, unchanged.
- `/assets/new` moves from `PageLayout`'s `form` variant alone to `record`: the inline
  `<details>` "create a model here" subflow becomes a `WorkPanel` (ADR 0019) in the 340px side
  column, visible instead of collapsed, so registering an asset and creating its missing model
  are two legible tasks side by side above 1100px instead of one collapsed block fighting the
  asset fields for a 672px column. `PageLayout`'s `record` variant documentation widens from
  "record detail" to any page with a genuinely secondary task, since this is its first non-detail
  consumer.

- A `Sheet` shape joins `Dialog`: contextual editing of a record already open in its own page,
  composed around `ui/sheet`'s `Sheet.Root`/`Sheet.Content` the same way `AppShell`'s mobile
  drawer already does. `/assets/[tag]`'s `Editar` button opens it over the exact same
  `editAssetForm` validation and the exact same `/assets/[tag]/edit` POST action — the canonical
  route's own `href` stays the fallback for no-JS and direct navigation. Closing a dirty edit
  (Escape, the overlay, or Cancel) routes through `ConfirmDialog` instead of discarding silently,
  read from Superforms' own `tainted` store at the moment of closing.

- The composition-patterns gallery page (`/dev/components/patterns`) gains the Dialog/Sheet/full
  page decision table, replacing the row that pointed at #100 as a still-pending decision.

### Deferred (tracked as the next slice of #100)

- Visual-token polish for `service-desk/new`.

## [0.19.0] - 2026-10-10

### Added

- Reusable feedback taxonomy for persistent alerts and destructive confirmation (#99), with toast
  ownership staying on #89. `unitati/Alert.svelte` wraps shadcn-svelte's `alert` with four tones
  (`info`/`success`/`warning`/`danger`), neutral surfaces for `info` instead of `--brand` so a
  notice never reads as the asset domain, and a `role`/`aria-live` chosen from the tone:
  `alert`/assertive for a form-level validation failure, `status`/polite for a persistent warning
  or notice that must not interrupt on every repaint. `unitati/ConfirmDialog.svelte` is composed
  around the vendored shadcn-svelte `ui/alert-dialog` (bits-ui underneath, the same `Sheet.Root`/
  `Sheet.Content` composition `AppShell` already uses per ADR 0011) for a destructive or
  relationship-changing action: it never submits anything itself — the caller's real
  `<form method="POST">` lives in its `action` snippet, which receives the confirm button (label
  and danger tone owned by the dialog) as a parameter to place inside — and `pending` disables
  Cancel/Confirm and blocks Escape/the overlay while that POST is in flight, so a slow network
  never leaves the dialog ambiguous about whether it closed because the mutation succeeded.
  `RelatedRecords`' unlink confirmation and all three catalogues' delete actions (the shared
  Categories/Manufacturers `NameCatalogue.svelte` and `assets/models`) migrate to it, preserving
  their exact POST payloads and permission guards, through a shared `confirmSubmit()` helper
  instead of three copies of the same `use:enhance` shape; a forced server failure now keeps the
  dialog open with the error shown in place instead of closing unconditionally.
  `service-desk/new`'s form-level error becomes the first `Alert tone="danger"` specimen. Both
  components join the gallery (`/dev/components/alert`, `/dev/components/confirm-dialog`), and
  the composition-patterns page gains the feedback decision table the taxonomy needed: which of
  Field/SelectField's own error, Alert, ConfirmDialog or the still-unbuilt Toast (#89) answers
  which situation, and why.

## [0.18.0] - 2026-10-10

### Added

- `SelectField` and the new `SearchSelectField` replace browser-painted dropdowns with
  accessible, token-styled components (#98). `select`, `popover` and `command` are vendored
  through the project's shadcn-svelte/bits-ui pipeline into `src/lib/components/ui/` (ADR 0011);
  `SelectField` keeps its existing consumer contract (`name`, `label`, `options`, `value`,
  `required`, `disabled`, `hint`, `error`, `autocomplete`, a new `labelHidden` for a dense row
  whose column heading already names the field) but now renders the vendored primitive instead
  of a native `<select>`, so the options menu is painted by the application on every platform.
  `SearchSelectField` adds a combobox for a long or remote list: it filters a fixed `options`
  list client-side, or asks a permission-scoped `searchUrl` as the user types, the same
  debounced/abortable contract `AssetPicker` already used for its multi-select search. Both
  components post through a named hidden input under normal HTML form semantics (Superforms
  enhanced submissions and plain route-action POSTs included). The four raw `<select>` elements
  on the asset models catalogue page (`assets/models/+page.svelte`) are migrated to `SelectField`.
  `utils.ts` gains the `WithoutChild`/`WithoutChildren` type helpers the vendored primitives
  expect, alongside the existing `WithoutChildrenOrChild`. Gallery specimens document both
  components' states (required/disabled/error/selected/long text for `SelectField`; local,
  remote, pre-selected-remote and clearable for `SearchSelectField`).

## [0.17.0] - 2026-10-10

### Added

- UI overhaul — Phase 3: information layer (#84): the Overview at `/` stops being a static
  greeting and gains two real modes. An **empty organisation** sees a four-step onboarding
  checklist (register an asset, define a queue, open the portal, add a person beyond the
  registering admin), each step with its own description, one action link, and completion
  derived from real counts — not a dismissible flag. A **working organisation** sees four KPI
  cards (open tickets, waiting on user, active assets, unassigned), "Your work" (the viewer's
  own open assignment, top 5), and recent activity (the organisation's latest 8 events, merged
  across assets and tickets, newest first). A **partially populated** organisation gets the
  working dashboard plus a secondary strip of whichever onboarding steps remain — the checklist
  never hard-switches away after the first record.
  `KpiCard.svelte` (`src/lib/components/unitati/`) is the new primitive: a label and a tabular
  Instrument Sans number, with an optional left accent border reserved for a count that is
  waiting (`warning`) or wrong (`danger`) — never decoration on a plain count. It has a gallery
  page under `/dev/components/kpi-card` (#85's per-component template) covering the empty,
  normal and warning states, and a slot for phase #90's sparkline.
  The domain layer grows four scoped aggregate queries, each living with the table it counts
  (ADR 0002): `assetSummary` and `ticketSummary` take the viewer and reuse the same
  `requireAssetScope`/`requireTicketScope` the record lists already enforce, so a redacted
  viewer's summary agrees with the list it describes; `countTeams` sits beside `countPeople`;
  `hasPortalActivity` and `myOpenTickets` round out the service-desk module. `activity` gains
  `listRecentActivity`, an organisation-wide feed distinct from `listActivity`'s per-record
  timeline, joined into `assets`/`tickets` for the `RecordRef` each entry links to.
  The live summary lands on `PageHeader` for `/assets` ("50 activos · 4 sin asignar"),
  `/service-desk` ("1 solicitud abierta · 0 esperando respuesta") and `/directory`
  ("12 personas · 3 equipos"), replacing the static lede the moment there is anything to count,
  and falling back to it for a genuinely empty list. Message keys follow the `_one`/`_other`
  pattern already used by `related_affects_*`, with the two counts composed through `·` rather
  than concatenated as raw tokens (ADR 0008).
  Known gap, documented rather than worked around: the directory has no self-serve "add a
  person" screen yet, so that checklist action links to `/directory` itself; a real create-person
  form is its own future ticket.

## [0.16.0] - 2026-10-10

### Changed

- UI overhaul — Phase 4: the gallery as the design-system conformance surface (#85, following
  the corrective shell (#96) and visual-language (#97) phases). The 1042-line
  `/dev/components/+page.svelte` monolith is replaced with a category index (Actions, Fields,
  Feedback, Data, Relations, Conversation, Navigation, Layout) over one page per component at
  `/dev/components/[component]`, resolved from a static manifest
  (`gallery/manifest.ts`) with compile-time discovery instead of 20 hand-written route folders.
  Each page uses a shared template (`gallery/ComponentDocPage.svelte`): purpose, when to use it
  and when not to, its exact semantic role, live variants and states (focus/disabled/error/empty/
  long strings, as the component has them), a props table and a copyable usage snippet. A
  regression test (`gallery/gallery.guard.spec.ts`) fails `npm test` if a new
  `src/lib/components/unitati/*.svelte` file has neither a manifest entry nor a documented
  exception in `GALLERY_EXCEPTIONS` — the "not in the gallery, not finished" rule (ADR 0011) is
  now enforced in CI, not just convention.
  `/dev/components/tokens` renders the surface/ink, typography ladder, spacing, radius, elevation
  and size tokens straight from `docs/design/assets/tokens.json` at request time, with a
  long-text specimen and a one-row "low-data" `DataTable` specimen alongside it.
  `/dev/components/coverage` derives the `ut-*` vocabulary from
  `docs/design/assets/css/components.css` and marks each class implemented or not-yet-built
  against the manifest, instead of asserting the old reference's classes are all still required.
  `/dev/components/patterns` documents composition — the nav shell's independent scroll, a list
  toolbar inside one work panel, the ticket thread/composer as the primary surface with
  `RelatedRecords` as the secondary rail, and today's single confirmation pattern (RelatedRecords'
  inline ask/confirm, since this system has no `Alert`/`ConfirmDialog`/`Toast` yet) — rather than
  only documenting atoms. Every nested route keeps the same `isProduction(APP_ENV)` 404 guard
  (ADR 0013) the index already had.

## [0.15.0] - 2026-10-10

### Changed

- UI overhaul — visual language and work surfaces (#97, ADR 0019): revises the radius grammar
  so `Button` moves from `--radius-full` to `--radius-md` (8px, matching `Field`/`SelectField`,
  which were already correct) and `StatusBadge`/`EnvironmentBadge` move the other way, to a true
  `--radius-full` pill — full-pill geometry is now reserved for status/environment markers, not
  every control. `src/app.css`'s blanket `h1, h2 { font-family: var(--font-display) }` drops the
  `h2` half: Unbounded is the brand/primary-title face, not a tag-level default, and five panel
  headings on `/service-desk/[tag]` and `/assets/[tag]` were rendering in it by accident.
  `RelatedRecords`'s group label grows from an arbitrary 11px to the named `text-xs` (12px) scale
  with a 20px gap above each group. `TicketThread`'s public replies gain the same bordered
  `surface-1` card the internal-note variant always had, instead of floating borderless on
  whatever sits behind the thread. A new `WorkPanel` component (`src/lib/components/unitati/`)
  gives the three-surface shape (canvas / primary work area / secondary panel) a real
  implementation of the `.ut-panel` chrome the design system already named; `/service-desk/[tag]`
  replaces its five hand-rolled `panel`/`panelTitle` template strings with it and composes its
  ticket header + thread inside one `WorkPanel` as the record's primary work area. `/service-desk`
  attaches its search/filter toolbar to `DataTable`'s own panel corners instead of floating it
  separately above the table. `docs/design/assets/{tokens.json,css/tokens.css,css/components.css}`
  are updated to match; `design-system.html` itself is not hand-edited, per `docs/design/README.md`
  — it picks up the change at the next real handoff extraction.

## [0.14.2] - 2026-10-10

### Fixed

- Asset registration (#102): `/assets/new`'s `load` seeded the register form with a default
  `state`, which Superforms treats as a posted submission and validates immediately — on every
  visit, before the user touched the form, it shipped Zod's raw English sentences ("Too small:
  expected string to have >=1 characters" on Name, "Invalid UUID" on Model) as `$errors.name` /
  `$errors.assetModelId`, and `AssetFields` rendered them unconditionally inside an otherwise
  Spanish page. The load now passes `errors: false` to `superValidate`, matching the no-error
  behaviour the inline model form already had; `localiseInvalid` continues to own the Spanish
  text for every real submission failure. Regression tests drive the actual `load` and action
  paths (not `localiseInvalid` in isolation) for the register form, the inline model form and
  the edit form — a blank Name/Model, and a forged invalid-UUID Model, each come back Spanish
  without reaching the database — rather than reasserting the fix on one screenshot alone.

## [0.14.1] - 2026-10-09

### Fixed

- `AppShell` (#96, ADR 0015 addendum): the authenticated shell is now a `h-dvh overflow-hidden`
  viewport-height workspace instead of a `min-h-screen` document — the sidebar and topbar stay put
  while `<main>` scrolls on its own. The nav-items region (search entry and links) also scrolls
  independently inside a stable brand row and footer, so the sidebar's `surface-2` background
  paints to the bottom of the viewport regardless of how short the link list is. The desktop
  collapse control moves out of the nav list and into the brand row as an icon-only button
  (`aria-expanded`, `sr-only` label); nav labels grow to 14px/20px with a 40px hit area, and the
  count/`⌘K` hint move from an ad-hoc 11px to 12px with tabular numerals. Both scrollports share a
  `.ut-scrollbar` utility that themes the native scrollbar's appearance only. A new
  `MainScrollRestoration` helper restores `<main>`'s scroll position on browser Back/Forward, since
  SvelteKit's built-in restoration only targets `window`.

## [0.14.0] - 2026-10-09

### Changed

- UI overhaul — phase 2 of #81: `AppShell` (ADR 0015) replaces the hand-written shell in
  `(app)/+layout.svelte`, closing all six measured drifts against the design system (sidebar on
  `surface-2`, 32px nav rows, `brand-soft`/`brand` active state, `MODULES`/`DIRECTORY` section
  headings, a count per module, Settings slot + `AppVersion` at the sidebar bottom). Below 768px a
  left-sheet drawer (vendored via `shadcn-svelte add sheet` — `ui/sheet`, `ui/button`) replaces
  having no navigation at all; the sidebar itself collapses to a 64px rail on desktop, persisted in
  `localStorage` with no layout flash on reload. A search entry ships with its `⌘K` hint, inert
  until phase 7's command palette listens for the `unitati:command-palette` event it dispatches.
  Each module's `.ut-count` comes from a new, permission-gated domain read — `assets.countActive`,
  `service-desk.countOpen`, `directory.countPeople` — aggregated once in
  `(app)/+layout.server.ts`.

## [0.13.0] - 2026-10-09

### Changed

- UI overhaul — phase 1 of #81: one page-layout vocabulary for the whole app. `PageLayout`
  (`index` / `record` / `form`) and `PageHeader` replace every route file that declared its own
  `max-w-*` container (six distinct page widths), plus a `--size-page-max: 2400px` ceiling token:
  content is now fluid below it and centred beyond it, instead of capped at 1152px regardless of
  viewport. `TicketDetailLayout` narrows to the record header it always rendered — the grid and
  the width ceiling now live in `PageLayout`'s `record` variant. Both app shells' gutter is
  `p-[var(--space-6)]` on every side. Login and setup gain a two-column brand panel (the three
  domain colours as a motif) and compose `PageLayout`'s `form` variant for their card. A Vitest
  guard fails the suite if a route under `(app)`, `(portal)` or `(auth)` declares its own
  `max-w-*` again. See [ADR 0018](docs/adr/0018-page-layout-vocabulary.md).

## [0.12.0] - 2026-10-09

### Added

- Related records (slice 4, part 3 of 3). The ticket detail gains a **Registros relacionados** panel
  in its side column, listing the assets the ticket affects with the status each one has today. The
  group title pluralises ("Equipo afectado" / "Equipos afectados"). The employee's ticket in the
  portal shows the same panel, narrowed to the equipment they hold or that is shared.
- **Unlinking** an asset from a ticket, for `tickets.manage` only and with an inline confirmation,
  because it destroys context and context is the product. Focus moves into the prompt and comes back
  to where the user was. A technician can; an employee gets no control and the action answers 404.
- The asset page shows its tickets on the history rail, merged with the asset's own events and
  newest first, each with the status it has **today**: resolving a ticket changes what the asset
  page reads without anything being written to the asset. A line above the rail says how many
  tickets were raised on the machine in the last six months, which is what turns it into a
  replacement candidate.
- `RecordRef` (an inline, clickable reference to any record, tinted by domain) and `RelatedRecords`,
  both in `/dev/components` with every state, including the confirmation and a refused unlink.
- In the ticket thread, "Vinculó el activo" / "Desvinculó el activo" now carries the asset as a
  `RecordRef`, built from the tag and name recorded when it happened.

### Changed

- `AssetTimeline` takes the merged list (`mergeAssetTimeline`) instead of activity entries, and
  draws a ticket with the desk colour. The link sentences no longer repeat the asset tag, since the
  reference beside them shows it.

### Known

- There is no screen yet to attach an asset to a ticket that is already open; assets are picked when
  the ticket is opened.

## [0.11.0] - 2026-10-09

### Added

- A ticket can be opened about one or several assets (slice 4, part 2 of 3). The portal form and the
  staff form gain an **Equipos afectados** picker: a search box that asks the server as you type and
  keeps what you choose as chips. It matches part of a word, so `mac` finds a MacBook, and it never
  hands over the whole inventory, which at volume would either be slow or hide the asset you need.
- `createTicket` links the picked assets inside the transaction that opens the ticket. If any is
  refused, nothing is created: no ticket, no first comment, no history, and the uploaded files are
  deleted. An employee can attach only what they hold or what is shared, whatever id the form
  carries; staff can attach any asset of their organisation. A repeated id links once.
- Staff see **"Vinculó el activo AST-0142"** in the ticket thread when an asset is attached. The
  requester does not: who attached what is staff business.
- `listAssetChoices` in `assets`: id, tag and name of the assets a viewer may pick, inside the same
  scope as the inventory list. A viewer who sees only shared rows matches on tag and name alone, so
  searching cannot reveal a model.
- `AssetPicker`, in `/dev/components`.

### Known

- A request refused because of an asset still consumes a `TCK-####` number, since the sequence is not
  transactional.

## [0.10.0] - 2026-10-09

### Added

- The first cross-domain relation (slice 4, part 1 of 3): `ticket_asset`, a join table with real
  foreign keys to the ticket and to the asset and a unique constraint on the pair, so the database
  refuses a link to an asset that does not exist and a ticket merge (#20) cannot land the same link
  twice. Deleting an asset removes its links and leaves the tickets.
- The `links` domain, which owns the relations and the one read interface over them:
  `relatedTo(viewer, record)` returns groups of `RecordRef`-shaped items, oldest first, each with the
  status its record has **today** rather than a status copied from the past. An employee sees only
  the assets they could attach themselves; the tickets of an asset are shown to staff only.
- `linkAsset` and `unlinkAsset`. An employee can attach an asset they hold or a shared one and
  nothing else, whatever id the request carries; unlinking needs `tickets.manage`. Linking twice is a
  typed `already_linked` failure and does not abort the transaction a ticket is being opened in.
- Two activity verbs, `link.asset.added` and `link.asset.removed`, recorded against the **ticket**
  with the asset's id, tag and name as they were. They are deliberately absent from the asset's own
  timeline, which reads the live relation instead.

## [0.9.0] - 2026-10-09

### Added

- The service desk (slice 3). Queues, tickets, comments and attachments, with the migration that
  creates them and the real foreign key `activity.ticket_id` was waiting for.
- Tickets get a `TCK-####` code from their own sequence, editable and unique per organisation, and
  the enforced workflow `new` → `in_progress` → `waiting_on_user` → `resolved` → `closed`, with
  reopening as an explicit move back to `in_progress`. An illegal jump is a typed `invalid_transition`
  failure from the domain function, not an exception, because the later SLA metrics are computed
  from transitions.
- The opening message is the first comment; there is no `description` column. Comments are
  `public` or `internal`, and an internal note is filtered **in the query**: an employee's payload
  does not contain it, rather than the page hiding it.
- Attachments on a comment, behind a `Storage` interface (`put` / `get` / `delete`) over the local
  filesystem at `UPLOADS_DIR`, served from `/attachments/[id]` as a download and scoped to the
  organisation and to the comments the viewer may read.
- Outbound mail over SMTP (`nodemailer`, `SMTP_*` and `MAIL_FROM`) to the requester only, for a new
  public comment and for the move to `resolved`. It is sent after commit and never awaited; a
  failure is logged and the comment is still saved. With `SMTP_HOST` unset, mail is off. A `mailpit`
  service in `compose.yaml` catches it in development.
- Staff screens under `/service-desk`: the list with search and queue and status filters, the new
  ticket form, the detail with the conversation and the actions (reply, internal note, status,
  priority, assignee, queue), and `/service-desk/queues`.
- The employee portal as its own route group at `/portal`, with a minimal layout and no sidebar.
  An employee is sent there from `/`, always opens a ticket as themselves, and cannot set the
  requester or the priority even by posting the field.
- Ticket subject and comment body are searched with the Spanish dictionary through `unaccent`, so
  "impresoras" finds "impresora"; a viewer who cannot read internal notes does not match on them.
- `TicketDetailLayout`, `TicketThread` and `TicketComposer`, all in `/dev/components`, and a plain
  (dotless) variant of the badge. Six ticket verbs join the activity log.
- The seed opens queues and a handful of tickets in every status.

### Changed

- The sidebar's Service desk link points at `/service-desk`.

## [0.8.2] - 2026-10-09

### Fixed

- The server ignored `SIGTERM` after any request that had touched the database, and had to be
  killed. `adapter-node` stops accepting, drains, and emits `sveltekit:shutdown`, but Node exits
  only once no handles remain and the Postgres pool's sockets are handles — and nothing closed the
  pool. `closeDb` now ends it on that event, which takes shutdown from never to 255 ms. This was a
  production defect, not an inconvenience: `docker stop` allows ten seconds before `SIGKILL`, a
  quarter of what the process previously needed to notice the signal at all, so every container
  restart would have severed in-flight requests.
- `closeDb` never calls `getDb()`. That getter is deliberately lazy, and opening a connection in
  order to close it is exactly the connection nobody asked for that the laziness avoids. A process
  that served no request still exits immediately.

## [0.8.1] - 2026-10-09

### Fixed

- Staging retention counted releases that never finished deploying. A release now carries a
  `.release-complete` marker, written only once it has served a healthy response, and only
  marked releases count toward the five kept; unmarked ones are removed on the next run. The
  previous behaviour would have let a run of failed deploys evict the last known-good release,
  which is the single thing the releases layout exists to keep — and it was not hypothetical: a
  deploy was killed by the OOM killer during `npm ci` and left a directory behind that occupied
  a slot.
- `scripts/staging-deploy.sh` holds an `flock` for the length of a deploy. systemd will not start
  the timer's oneshot while it is already running, but nothing stopped a hand-run deploy from
  racing one, and two deploys sharing a clone, a symlink and a database is not a race worth
  debugging after the fact.

## [0.8.0] - 2026-10-08

### Added

- `APP_ENV` (`development`, `staging` or `production`), a runtime variable that says where a build
  runs ([ADR 0013](docs/adr/0013-app-env-and-the-non-production-surface.md)). `NODE_ENV` cannot:
  staging runs the production build. Unset means `development` under `vite dev` and `production`
  in a build; a value outside the vocabulary stops the server at start. **Staging's
  `unitati.env` must now set `APP_ENV=staging`.**
- An environment badge in the app header and on the login screen, in every environment but
  production, with one tone per environment so a development screenshot is not mistaken for a
  staging one.
- The Unitati logo in the sidebar, the mobile header and the login screen, as the `Logo`
  component (mark and lockup), taken from `docs/design/assets/brand`.
- `Logo` and `EnvironmentBadge` sections in the component gallery.

### Changed

- The component gallery (`/dev/components`) and its menu entry are available in every environment
  but production, not just under `vite dev`, so a pull request's verification guide can use it on
  staging. It still answers 404 in production. Amends decision 4 of
  [ADR 0011](docs/adr/0011-component-layers-and-the-gallery.md).
- The favicon is the Unitati mark, with an `apple-touch-icon`, instead of the SvelteKit
  template's Svelte logo.

## [0.7.0] - 2026-10-08

### Added

- The inventory screens, closing slice 2 (#7): `/assets` (server-side pagination and search),
  `/assets/new`, `/assets/[tag]`, `/assets/[tag]/edit`, and the catalogue at `/assets/models`,
  `/assets/categories` and `/assets/manufacturers`. A technician registers an asset, hands it to
  a person and takes it back, and the detail page shows all three events newest first.
- On the detail page, custody, state, location and notes are separate actions rather than form
  fields: each is an event with its own history entry, and a form that could set `custodian` would
  write the row without the entry that makes the history trustworthy (ADR 0009).
- A model can be created inline from `/assets/new`, and is preselected when it is made.
- **Redaction holds in the payload.** An employee sees their own equipment in full and, for shared
  equipment, the tag, name and location only. Checked against the JSON SvelteKit sends to the
  browser (`__data.json`), not just the rendered page.
- `AssetTimeline`, `Pager` and `SelectField` components, and `Button` renders a link when given
  an `href`. All four have their variants and states in `/dev/components`.
- `npm run db:seed`: 200 assets with custody, state, location and notes, deterministic from a
  fixed seed and idempotent (a second run changes nothing). It applies its plan through the
  domain's own functions, so the history it shows is history the app could have written. On an
  empty database it also does `/setup`'s job and prints demo logins for an administrator, a
  technician and an employee. It refuses any `DATABASE_URL` whose host is not `localhost`.
- Editing and deleting for manufacturers, categories and models. Deleting an entry something still
  uses answers with a sentence instead of a 500: `restrict` is a typed `in_use` outcome.
- `requireAnyPermission` and `listLocations`, for screens several permissions reach and for the
  location picker.
- `advanceAssetTagSequence`: anything that writes explicit tags in bulk (the seed now, the CSV
  import in #21 next) must move `asset_code_seq`, or the next asset registered by hand draws
  `AST-0001` and is refused as a duplicate.
- Route-level specs for what the browser is sent: the real `load` functions against Postgres,
  asserting that an employee's page data carries no serial, custody or history for shared
  equipment, and that the registering, catalogue and edit screens answer 404.

### Changed

- #7's acceptance criteria: the shared view keeps `assetTag` (it is the identifier in the URL and
  what lets an employee name the floor printer on a ticket), and the search criterion is
  `macbook` / `pro` / `pró`, not `mcbook` — `unaccent` strips diacritics, it does not correct
  spelling, and typo tolerance would be its own `pg_trgm` issue.
- `FullAssetView` carries `assetModelId` and `AssetModelEntry` carries `manufacturerId` and
  `categoryId`, so forms preselect by id instead of matching on names.
- `Field` and `SelectField` accept a `null` value and no longer declare a fallback for it. A form
  library hands `undefined` for an optional field, and Svelte refuses `bind:value={undefined}`
  into a prop that has a fallback.
- The navigation shows "Inventario" to anyone holding any asset-read permission, not only
  `assets.view`: an employee reaches it through `assets.view.own` and `assets.view.shared`.

### Fixed

- An asset tagged `new`, `models`, `categories` or `manufacturers` was registered happily and then
  unreachable: the static route wins over `/assets/[tag]`. Those tags are now refused by the
  schema, so the rule holds for the import in #21 as well as for a form.
- A crafted form could attach an asset to another organisation's model or location, or a model to
  another organisation's manufacturer or category, and read that name back in a listing. A
  foreign key proves a row exists, not that it is yours. Registering, editing and every catalogue
  write now look the reference up inside the actor's organisation and answer `*_not_found`.

## [0.6.1] - 2026-10-08

### Added

- A staging environment, documented in
  [ADR 0012](docs/adr/0012-environments-and-real-verification.md). It runs the production build
  behind `tailscale serve` on the tailnet, against its own `unitati_staging` database, and it is
  where a pull request's _Guia de verificació en real_ is executed from now on. Dev mode could
  never stand in for it: the first HTTPS request emitted
  `__Secure-better-auth.session_token; Secure`, a cookie form `http://localhost:5173` cannot
  produce, so bugs on that path were invisible by construction.
- `scripts/staging-deploy.sh` deploys a ref of `origin`, never a working tree, so staging proves
  what was pushed rather than what sits on somebody's disk. It builds into
  `releases/<timestamp>-<sha>` and swaps an atomic symlink; a failed health check reverts it and
  attaches the journal, so a broken build cannot take staging down. Migrations are **not**
  reverted — they are forward-only, and a destructive one needs a plan of its own.
- `scripts/staging-autodeploy.sh` gates the five-minute poll: deploy only once every check run
  for that exact commit has completed green, with the verified SHA pinned so a push landing
  mid-run cannot smuggle in a commit nobody checked. It reads the check-runs API, because GitHub
  Actions leaves `/commits/<sha>/status` reporting `{"state":"pending","total":0}` for ever and a
  gate built on that endpoint would never open.
- One artefact serves every environment: no origin and no base path are baked into the build.
  `adapter-node` reconstructs the origin from `PROTOCOL_HEADER` and `HOST_HEADER`, and
  `tailscale serve` was measured to send `x-forwarded-host` including the port, so form `POST`s
  pass the CSRF check with nothing in between.

## [0.6.0] - 2026-10-08

### Added

- The four inventory tables (`src/lib/server/assets/schema.ts`): `manufacturers`, `categories`,
  `asset_models` and `assets`. The catalogue hangs off the **model**, not off each asset, and
  `asset_model_id` is `not null` — an asset with no model is an asset no report can group. The
  model's manufacturer and category are `restrict`, not `set null`, because a model with
  neither would put every report into a growing "unclassified" bucket.
- `asset_tag` is `AST-####` from the `asset_code_seq` sequence, **editable**, and unique per
  organisation (ADR 0010). The generated value is a default, not a constant: #21 imports tags an
  organisation already has stuck on its hardware.
- State and custody as two axes that do not constrain each other: an asset can be `in_use` with
  nobody holding it (the floor printer) and `in_stock` in a technician's drawer. The
  `asset_state` enum is built **from** `ASSET_STATES`, so it is not a third copy of a vocabulary
  that already has an owner (ADR 0011).
- `serial` is nullable with a **partial** unique index: two assets without one coexist, two with
  the same one in an organisation do not.
- The `activity` table, with its `CHECK` that **exactly one** target column is set — written as
  a sum of casts, so two targets are refused as well as none — and its foreign key to `assets`.
  It lands here rather than with the contract in 0.5.0 because that key has to exist from its
  first migration; added later it would have left a window in which history could point at an
  asset that never existed. The `activity_verb` enum and the `CHECK` are both derived from
  `verbs.ts`.
- `recordActivity` takes a **`Transaction`, not a `Database`**: ADR 0009's "same transaction"
  rule expressed as a type, so a caller who has not opened one cannot write history. An action
  and its entry commit together, because custody assigned without its entry is a history that
  cannot be trusted.
- The asset domain functions with their permission scope and **field-level redaction**. An
  `employee` sees their own equipment in full and **name and location only** for a shared asset —
  in the payload, not merely in the markup, which is why `SharedAssetView` is a separate type
  with nowhere to put a serial.
- Full-text search: generated `tsvector` columns on `assets` and `asset_models` behind GIN
  indexes, `simple` + `unaccent` and never the Spanish dictionary, because model names and
  serials are not prose. A second vector, `search_shared`, covers only what a shared view
  exposes: searching the full one would let an employee confirm a serial they may not read.
- `drizzle-zod`, with the schemas generated **from** the Drizzle tables, so a new column cannot
  leave a stale validator behind. `organisation_id` is omitted from every input schema — the
  tenancy scope comes from the session, never from the payload (ADR 0004).
- `src/lib/server/db/errors.ts` reads a constraint violation back out of a failed query, and
  `db/testing/refusal.ts` lets a spec assert the constraint by name rather than merely that
  something threw.

### Notes

- The migration creates the `unaccent` extension and an `immutable_unaccent` wrapper by hand,
  above what `drizzle-kit` generates. Plain `unaccent(text)` is `STABLE`, and Postgres refuses a
  non-immutable expression in a generated column.
- `unaccent` strips accents; it does not correct typos. `macbook`, `MACBOOK`, `pro` and `pró`
  all find a "MacBook Pró"; `mcbook` does not, and would need `pg_trgm`.

## [0.5.0] - 2026-10-08

### Added

- The activity contract (`src/lib/server/activity/`), the first half of what slice 2 needs
  before it can write a single history entry. A row holds a **verb** — the canonical key of
  what happened, never a rendered sentence — and a **payload** whose shape the verb decides.
  Adding a verb takes three edits and the compiler insists on all three: the list, the payload
  shape, and the sentence. Omitting the shape is a missing property; omitting the sentence fails
  the renderer's exhaustive `switch`.
- Payloads carry an identifier **and** a snapshot. A custody entry stores the person's name as
  it was, so renaming somebody does not rewrite what the history says happened (ADR 0009).
- The listing contract (`src/lib/server/shared/pagination.ts`): `limit`, `offset` and `total`,
  settled at the first list screen rather than the third. With 200 rows, loading everything
  works — which is why it is a trap, since it keeps working until the install with 4,000.
  `perPage` is clamped, because `?perPage=100000` is otherwise a denial of service anyone can
  type, and a malformed page number yields page one instead of an error.
- `src/lib/domain/status.ts` holds the status vocabulary — the keys, with no labels and no
  tones. Three layers need the same list and none of them owns it: the badge pairs each key
  with a tone and a message, the activity payload validates against it, and the `assets` schema
  will build its `pgEnum` from it. A key added without its tone fails `npm run check`.

### Fixed

- `zod` was imported by the login and setup form actions while being nobody's declared
  dependency: it arrived only as a transitive one through `sveltekit-superforms`. The day that
  package changes its range, the application breaks for a reason nothing in `package.json`
  would explain. It is a direct dependency now.

## [0.4.0] - 2026-10-08

### Added

- `StatusBadge`, `Avatar` and `DataTable`, the three components every MVP slice needs. The design
  system names ten and two existed; these are the ones that unblock a list screen, so slices 2, 3
  and 5 no longer each build their own table.
- `StatusBadge` takes a status key, never display text, so its label stays translatable and
  `status="En curso"` fails `npm run check`. The keys come in three families — ticket status,
  priority, asset state — because a ticket is never `in_stock`. Priority `normal` renders no
  badge: a column that shouts "Normal" on every row teaches the reader to stop looking.
- `/dev/components`, the gallery, and the ratchet it enforces: a component that is not in it is
  not finished. It exists only in development — its load returns 404 otherwise, its markup sits
  behind `dev`, and the app shell's entry to it disappears from a production build along with
  every fixture.
- [ADR 0011](docs/adr/0011-component-layers-and-the-gallery.md) records the conventions: two
  component folders with two owners, `tv()` for every class string, colour only through a token,
  and status as a key.

### Changed

- `src/lib/components/ui/` now holds `shadcn-svelte` output and nothing else; our own
  design-system components live in `src/lib/components/unitati/`. The first
  `shadcn-svelte add button` would have written `ui/button/` beside a hand-written
  `ui/Button.svelte` — two things called Button in one folder, one vendored and one ours.
- `components.json` aliases say `#lib` instead of `$lib`. `shadcn-svelte` validates its aliases
  against resolvable paths and this repo addresses `src/lib` through Node subpath imports, so with
  `$lib` the CLI refused to run at all. Adding a component was impossible before this.
- `Button` and `Field` are rewritten with `tailwind-variants`, which was installed and unused
  while both composed class strings by hand — the pattern the next agent would have copied.
  `Button` also becomes the pill the design system specifies rather than the rounded rectangle it
  had been, and its disabled state drops the shadow as the reference CSS does.

### Fixed

- `Field` generated its `id` with `crypto.randomUUID()`, so the server and the client produced
  different ones and hydrating the SSR'd login and setup forms left every `<label for>` pointing
  at an id that no longer existed. It uses `$props.id()`.

## [0.3.0] - 2026-10-07

### Added

- Postgres in the test loop. A second Vitest project, `db`, runs `src/**/*.db.spec.ts` against
  a real database, so a slice's acceptance criteria can be proven instead of asserted. Until
  now every spec was pure logic, which means every claim about rows and about access control
  was a claim nothing in the repo could contradict. `npm run test:db` runs it,
  `npm run test:db:watch` watches it, and `npm test` still runs `server` only and still passes
  with Docker stopped.
- `src/lib/server/db/testing/` holds the harness: it creates `unitati_test` if it is missing,
  migrates it, and truncates every table before each test. The table list is read off the
  Drizzle schema, so adding a table to a domain is enough — a hand-kept list is a list that
  falls behind, and a table missing from it leaks rows into the next test.
- `src/lib/server/directory/directory.db.spec.ts`, the worked example, proves that `listPeople`
  scopes to one organisation (ADR 0004) rather than asserting it. Two of its tests insert the
  same globally unique slug, which fails without truncation and so tests the harness itself.
- `.env.test`, committed, points the test run at `unitati_test`. Vite's `loadEnv` lets a
  `DATABASE_URL` exported in the shell override that file, so a developer with the development
  connection string in their environment would have watched `TRUNCATE` empty their own
  database. The harness now refuses any database whose name does not end in `_test`, before it
  opens a connection.
- CI starts Postgres from the same `compose.yaml` developers use and runs both projects, so a
  red database test fails the build.

### Changed

- The `db` project does not run its files in parallel, and runs its tests in a random order.
  One database truncated between tests means two files at once would delete each other's rows,
  so isolation wins over the wall clock; randomising the order then exercises "these tests do
  not depend on each other" on every run rather than asserting it once.

## [0.2.1] - 2026-10-06

### Changed

- The design system is no longer a single 2.08 MB HTML file. `docs/design/assets/` now holds
  each asset as a real file — `tokens.css`, `components.css`, `tokens.json`, 12 brand SVGs,
  18 icons and the logo concept — and `design-system.html` links them instead of embedding
  them as base64. The file dropped to 103 KB, so it is reviewable in a diff.
- The stylesheet is now a single source of truth. The old file carried the same 19.4 KB of
  CSS twice: once inline to render the examples, once base64-encoded as a download. Those
  two copies could drift apart without anyone noticing; now they are one file.
- The concept render ships as AVIF with a WebP fallback in a `<picture>`, 1.23 MB down to
  157 KB for the pair. It is 1774x887 with 60k distinct colours, so no palette fits it and
  lossless compression had nothing left to give: `optipng -o7` beats a plain zlib pass by
  0.4%. AVIF at q90 measures an SSIM of 0.9945, and the authoritative logo artwork is the
  vector set beside it, which is untouched. Re-encoding needs `avifenc`, `cwebp` and
  ImageMagick; without them the extractor emits a losslessly recompressed PNG instead, so
  the page renders either way and only its weight depends on the toolchain.
- `README.md` leads with the brand lockup, light and dark, and keeps three badges instead of
  eleven. The rest duplicated the Stack section, which says the same with more detail.
- The product is written "Unitati" everywhere it is read as a name: the Spanish interface
  (`app_name`, the login heading, the setup lede), `AGENTS.md`, the ADRs and the remaining
  docs. It matches what `tokens.json` and the brand SVGs already said. Identifiers keep the
  lowercase spelling, because they are not the name: the npm package, the repository slug,
  the Postgres role and database, the `provision.ts` slug fallback, and every file path.
- The README's Status section described an app that no longer exists. It claimed "no product
  features yet" and announced slice 1 as next, when slice 1 had already shipped. It now says
  what runs — setup, authentication, the people directory, roles — and names the four server
  folders that are still empty, so the gap is explicit rather than implied. The `src/` tree
  gains `hooks.server.ts`, `setup/`, `directory/`, `auth/` and `access/`.
- Ignore files (`.gitignore`, `.prettierignore`, `.eslintignore`) are exempt from the version
  gate ([ADR 0003](docs/adr/0003-semver-and-changelog.md)). They steer tooling and never reach
  the build, yet touching one alone used to force a release: 0.1.2 was published for exactly
  that reason.
- `package-lock.json` had drifted to `0.1.2` while `package.json` said `0.2.0`; both now agree.

### Added

- `docs/design/extract-assets.mjs`: unpacks a design handoff into `assets/` plus an HTML
  shell. It refuses to guess a filename for an asset the handoff never names, and stops if an
  embedded stylesheet has drifted from its downloadable copy.
- `docs/design/README.md`: what lives in the folder, which files are generated, and how to
  unpack the next handoff.

## [0.2.0] - 2026-10-06

### Added

- MVP slice 1. An empty installation walks through `/setup`, creates its organisation and
  first admin in one transaction, and lands on the app shell.
- Email and password authentication via Better Auth (ADR 0006), with sessions resolved once
  per request in `hooks.server.ts` and route-group guards.
- Directory: `organisation`, `person`, `department`, `location`, `team`. A person exists
  without a credential, so equipment can be held by someone who never signs in.
- Fixed roles with granular permissions (ADR 0007). Denials answer 404 rather than 403, so a
  refusal does not confirm that a record exists.
- Every aggregate root carries `organisation_id` and all access is scoped by it (ADR 0004).
- Spanish interface with Paraglide, externalised from the first screen (ADR 0008).
- App shell with the design-system tokens, one colour per domain, and navigation filtered by
  permission.
- `Button` and `Field` components; `Field` wires label, error and description for screen
  readers.

### Changed

- `src/routes/layout.css` becomes `src/app.css`, the entry point shadcn-svelte expects.
- The database connection resolves on first use instead of at import time, so importing a
  module no longer opens a connection a build never asked for.
- `drizzle-orm` and `postgres` move to `dependencies`: they ship at runtime.

### Notes

- `overrides` pins Better Auth's `@sveltejs/kit` peer to ours. Better Auth declares `^2.0.0`
  and this project runs SvelteKit 3; the peer is optional and only the `svelte-kit` helper
  touches it. The override is surgical on purpose — `legacy-peer-deps` would disable peer
  checking for every package.
- Shipped without `formsnap`: it requires `sveltekit-superforms@^2`, while version 3 is the
  one that supports SvelteKit 3 natively. Its job — accessible field wiring — is what the
  design system specifies as `Field`.

## [0.1.2] - 2026-10-06

### Added

- `docs/roadmap-v1.md`: every capability classified as MVP, v1, post-v1 or discarded, each
  with a written reason. Built from the shipped data models of Shelf.nu, Snipe-IT, Zammad,
  OpenSupports, Plane, Leantime and GLPI.
- ADR 0004 (tenant-ready at N=1), ADR 0005 (one indivisible suite, pairwise join tables),
  ADR 0006 (email and password authentication), ADR 0007 (fixed roles over granular
  permissions), ADR 0008 (Spanish UI, English codebase).
- `docs/design/design-system.html`: exported design system — tokens, components and layouts.

### Changed

- `docs/mvp-scope.md` rewritten as the minimum subset of the roadmap. Inbound email and CSV
  import move to v1; attachments and outbound notification enter the MVP.
- Exit criterion replaced by a seeded end-to-end walkthrough. The previous one required a
  pilot team that does not exist, which made it unverifiable.
- The estimate is removed rather than replaced: the first trustworthy one comes from
  measuring slice 1.
- `docs/domain-model.md`: cross-domain relations are pairwise join tables with real foreign
  keys instead of a polymorphic `Link` table; adds `Organisation` and `State` / `StateGroup`.
- `docs/vision.md`: non-goals now cover tenancy, switchable modules and asset bookings.

## [0.1.1] - 2026-10-06

### Fixed

- `vite build` no longer requires `DATABASE_URL`. Building analyses the app without opening a
  connection, so environments that legitimately have no database credentials (CI, image builds)
  can build it. The variable is still mandatory when the app starts.

## [0.1.0] - 2026-10-06

### Added

- Evaluation docs: vision, alternatives, domain model, MVP scope, internal vs open source decision.
- ADR 0001 (stack and architecture), ADR 0002 (server modules by domain), ADR 0003 (SemVer and changelog).
- SvelteKit 3 + Svelte 5 + TypeScript scaffold with Tailwind CSS 4, Drizzle ORM and PostgreSQL 17 (`compose.yaml`).
- Domain folders under `src/lib/server/` and the shared `Outcome` type.
- Running version injected at build time and shown in the app shell and on the login screen.
- Version-bump CI gate (`scripts/check-version-bump.mjs`) and GitHub Actions workflow.
