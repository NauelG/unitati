# 0019. Visual language and work surfaces

- **Status:** accepted
- **Date:** 2026-10-10

## Context

Part of #81. `v0.14.0` screenshots of `/service-desk`, `/service-desk/TCK-0001`, `/assets/new`
and `/assets/models` show controls floating on a light-grey canvas, conversation content
blending into that canvas while right-side panels are bounded, and inconsistent geometry
among inputs, buttons, cards and status pills.

Measured against `src/app.css:18-24`: canvas `--surface-0` vs white `--surface-1` contrasts at
**1.08:1**, sidebar `--surface-2` vs canvas at **1.06:1**, the soft `--border` vs white at
**1.26:1**. `--ink-muted` against canvas is **5.81:1** — the problem is surface separation and
information hierarchy, not a blanket failure of text colour.

Three concrete drifts, each against the design system's own already-written intent:

- `docs/design/assets/tokens.json` already documents `radius-md` ("Buttons, inputs, selects,
  nav items") and `radius-sm` as the badge/record-chip radius — but `Button.svelte:11` and the
  reference's own `.ut-btn` in `components.css` both hard-coded `radius-full`, while
  `Field.svelte` and `SelectField.svelte` correctly read `radius-md`. The button, not the
  system, had drifted from its own documented grammar.
- `src/app.css:188-192` applied Unbounded to **every** `h1` and `h2`. `RelatedRecords.svelte:19`
  sets its "affected asset" group label at 11px uppercase — a size nobody chose for a heading,
  just a colliding default — while five `<h2>` panel titles on `/service-desk/[tag]` and
  `/assets/[tag]` (`panelTitle = 'text-sm font-semibold'`, no font override) silently rendered
  in the display face purely because they are `<h2>` elements, not because any page title
  decision was made.
- `TicketThread.svelte:14-30` drew a public reply with no background or border at all — the
  "boxed" visual quality lived only on the internal-note variant — so a ticket's primary
  content area had the least visible chrome of anything on the page.

[ADR 0016](0016-ux-and-features-compound.md): UX and features compound. A single compositional
system across list, detail and form surfaces is needed before adding more visual effects, and
[ADR 0011](0011-component-layers-and-the-gallery.md) is why that system lives in `tv()`
components with a gallery, not in per-route class strings.

## Decision

**Neutral canvas + clearly delimited white work panels.** Three semantic surface levels, one
radius grammar, typography by role instead of by heading tag.

### Radius grammar

- **8px (`--radius-md`)**: action buttons, inputs, select triggers, search controls, icon
  buttons — at default size, for every one of them. `Button.svelte`'s base moves from
  `--radius-full` to `--radius-md`; `components.css`'s `.ut-btn` matches it. `Field` and
  `SelectField` needed no change: they already read `--radius-md`.
- **Full pill (`--radius-full`)**: reserved for badges and status/environment markers —
  `StatusBadge`, `EnvironmentBadge` (which composes `StatusBadge`'s `badge` export), avatars,
  status dots, progress bars. `StatusBadge`'s base moves from `--radius-sm` to `--radius-full`,
  and `tokens.json`'s `radius-sm` usage note drops "Badges" (record chips keep it).
- **12px (`--radius-lg`)**: panels and cards — `DataTable`'s panel, `RelatedRecords`'s root,
  `TicketComposer`'s box, and the new `WorkPanel` below. Unchanged; it was already consistent.
- Radius never represents product state. `RecordRef`'s chip stays `--radius-sm`: a record
  reference is not a status badge, and this decision does not fold it into the pill rule.

### Typography by role, not by tag

`src/app.css`'s base layer now sets `font-family: var(--font-display)` on `h1` only. Every
real page title in the codebase already renders as an `h1` with an explicit `font-display`
class (`PageHeader`, `TicketDetailLayout`, the auth screens' own titles) — the rule is a safety
net, not the mechanism. The `h2` rule is removed outright: it was never a deliberate role
assignment, only the reason five unrelated panel headings (`ticket_detail_details`,
`ticket_action_status/priority/assign/queue` on `/service-desk/[tag]`, their mirrors on
`/assets/[tag]`) rendered in the display face. They now render in Instrument Sans, which is
what their own class (`text-sm font-semibold`, no font override) always asked for.

Roles, as implemented (not a new global font swap):

- **Unbounded** — brand and a page's own primary title only (`PageHeader.title`,
  `TicketDetailLayout.title`, the two auth-screen headings, `AuthBrandPanel`'s pitch line).
- **Instrument Sans** — nav, body, form metadata, panel/section headings. This is every other
  heading in the product now, including the five panel titles above.
- **Martian Mono** — record tags/codes (`PageHeader.code`, `TicketDetailLayout.tag`,
  `RecordRef`, `DataTable`'s code-emphasis column) and other code-like values. Unchanged.

`RelatedRecords`'s group label (`"Equipo afectado"` / `"Equipos afectados"`) moves from an
11px arbitrary size to `text-xs` (12px, Tailwind's named scale, same token value) — the
smallest size now has a name instead of being invented at the call site. The gap above each
group grows from `--space-4` (16px) to `--space-5` (20px), matching the "section gap inside a
detail view" `--space-5` already carries in `tokens.json`; the first group keeps its tighter
`--space-3` lead-in under the panel's own heading.

### Three surface levels and `WorkPanel`

- **Canvas** (`--surface-0`): the app shell background. Nothing renders directly on it except
  the shell chrome and the pages composed above.
- **Primary work area**: the content a page exists to show — a data table, or a ticket's
  conversation. On `/service-desk/[tag]` this is `TicketDetailLayout` (the record header) and
  `TicketThread` together, now composed inside one `WorkPanel` so the conversation reads as a
  bounded white panel instead of floating on the canvas the way it did before this ADR.
  `TicketComposer` stays its own box directly below that panel — it already had a border
  (`--border-strong`) and a distinct dark-mode-ready affordance (⌘↵ to send); nesting it inside
  `WorkPanel` too would double the chrome for no new information.
- **Secondary/contained regions**: side-rail panels, grouped actions, toolbars. The new
  `src/lib/components/unitati/WorkPanel.svelte` is a `tv()` composition with an optional
  `heading`/`actions` head (border-bottom, `title-3`-scale text) and a padded body — exactly
  the `.ut-panel`/`.ut-panel-head`/`.ut-panel-title`/`.ut-panel-body` shape `components.css`
  already named but that no component had ever implemented. `/service-desk/[tag]` replaces its
  five hand-rolled `panel`/`panelTitle` template strings with it; the `/dev/components` gallery
  specimen does the same. `RelatedRecords` keeps its own root: its heading needs
  `tabindex="-1"` and a bound element for the unlink-confirmation focus return (see its own
  comments), which is that component's concern and not `WorkPanel`'s generic shape to carry.

`TicketThread`'s public reply card gains the same `border` + `bg-[var(--surface-1)]` +
padding the internal-note variant always had; the internal variant now only swaps the
background to `--warning-soft` and clears the border, instead of being the only variant with
any chrome at all. A reply reads as a bounded card regardless of visibility; the warning tint,
not the presence of a box, is what marks it internal.

### `/service-desk` list: toolbar attaches to the table

The search/filter form above `DataTable` gets its own top-rounded, bottom-border-free panel
(`rounded-t-[var(--radius-lg)] border border-b-0`) sized to meet the table's own panel exactly;
`DataTable` receives `class="rounded-t-none"` so its existing border continues the toolbar's
rather than drawing a second, separate container. This is the "toolbar visually part of the
table work area" requirement without the parallel table container the issue explicitly warned
against — `DataTable`'s own panel chrome does all the drawing; the toolbar only borrows its
corners.

## Consequences

- **Deferred to the page-by-page rollout child issue**: `/assets/[tag]` has the identical
  hand-rolled `panel`/`panelTitle` pattern this ADR replaces on `/service-desk/[tag]`, and does
  not get `WorkPanel` in this PR. It is left exactly as it was — correct under the old rule,
  now one page behind the new one — rather than touched speculatively outside this issue's own
  two named proof screens.
- **`design-system.html` is not hand-edited.** `docs/design/README.md` is explicit that the
  page is "regenerated from the next handoff" and a hand-edit "would be overwritten" — only
  `tokens.json`, `tokens.css` and `components.css` are the editable source of truth. This PR
  updates those three; `design-system.html` itself picks up the change at the next real handoff
  extraction, the same as every other reference update since ADR 0011.
- Dark theme (#90) is not switched on here, but every surface and radius decision above reads
  through the same tokens `[data-theme="dark"]` already defines in `tokens.css` — nothing in
  this ADR is a light-mode-only value.
- A future component that wants the three-surface shape reaches for `WorkPanel` instead of
  copying a `rounded-[var(--radius-lg)] border …` string, the same ratchet ADR 0011 already
  describes for every other `unitati/` component.
