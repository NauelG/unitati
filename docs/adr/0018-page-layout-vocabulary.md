# 0018. Page layout vocabulary

- **Status:** accepted
- **Date:** 2026-10-09

## Context

UI overhaul (#81) phase 1 (#82). Measured at `v0.12.0`: 15 route files declared their own
`max-w-*` container — six distinct page widths (`2xl`/`3xl`/`5xl`/`6xl` + `sm`/`md` on auth).
Navigating Assets → Directory → Queues moved the content edge 1152 → 1024 → 672px. The chrome is
296px (sidebar 248 + 2×24 gutters); content capped at 1152px used 75.4% of a 1920px viewport and
56.6% of 2560px. The ticket list packed seven columns into 1152px (~164px each) while the viewport
could give 2288px.

`TicketDetailLayout.svelte` set `mx-auto max-w-6xl` on its root and a fluid
`min-[1100px]:grid-cols-[minmax(0,1fr)_340px]` grid inside it — a fluid layout boxed by its own
container, capping the conversation column at ~790px regardless of viewport.

The spec (`docs/design/assets/css/components.css`) has no page-container max-width anywhere:
`.ut-shell { grid-template-columns: var(--size-sidebar) 1fr }`, `.ut-main { padding: var(--space-6)
}`, `.ut-detail-grid { grid-template-columns: minmax(0,1fr) 340px }`. The six widths were invented
by the implementation, one route at a time, with nothing to stop a seventh.

## Decision

**One page-layout vocabulary, three shapes, no per-page container.**

### Ceiling token (D1)

`--size-page-max: 2400px` in `src/app.css`. Content is fluid below it and centred beyond it — full
width only wins when the content actually fills it (one 440px card adrift in a 1790px row looks
worse than a narrow box).

### `PageLayout` (`src/lib/components/unitati/PageLayout.svelte`)

A `tv()`-based component with a discriminated `variant`:

- **`index`** — fluid to `--size-page-max`, centred beyond it. Lists and tables.
- **`record`** — the same ceiling, plus `grid-cols-[minmax(0,1fr)_340px]` above the `min-[1100px]`
  breakpoint (the side column falls under the main column below it). Record detail.
- **`form`** — `max-w-2xl mx-auto`, a fixed measure that never reads the ceiling. Create/edit
  forms and prose.

No variant renders its own heading; that is `PageHeader`'s job (or, for a record with its own
chips and provenance, the record's own header component — see below).

### `PageHeader` (`src/lib/components/unitati/PageHeader.svelte`)

The header shape every list, record and form page shares: an optional mono `code` above the
title, the `title` itself, an optional one-line `summary` snippet (`ink-muted`; until phase 3
feeds it live data, the existing lede strings pass through unchanged), and optional right-aligned
`actions`. It replaces the hand-built `<h1>` + lede flex block that was copy-pasted across the
route files.

A record whose header carries content `PageHeader` does not model — `TicketDetailLayout`'s status
chips and provenance line — keeps its own header component instead of forcing that content
through `PageHeader`'s props. `PageHeader` stays a shape for the common case; a record's
distinguishing chrome is that record's concern.

### `TicketDetailLayout` narrows to a header

`TicketDetailLayout.svelte` no longer owns a root container or a grid — both were the per-page
container this ADR removes. It renders only the record header it always had (code, status,
priority chips, title, provenance, actions); the grid and the width ceiling now come from
`PageLayout`'s `record` variant, which the route composes it inside of.

### Regression guard

`src/routes/page-layout.guard.spec.ts` walks every `.svelte` file under `src/routes/(app)` and
`src/routes/(portal)` and fails if any line matches Tailwind's named width scale
(`max-w-{xs,sm,md,lg,xl,2xl,…}`). `max-w-[var(--size-page-max)]` — an arbitrary value, not the
named scale — is how `PageLayout` itself reads the ceiling token, and is never flagged.

An inner element that legitimately needs its own measure (a search field capped at `max-w-md`, a
gallery's prose note capped at `max-w-2xl`) is allowed with a `layout-ok` marker comment next to
the match: on the same line when the tag closes there, or on one of the two lines immediately
before it when a multi-line attribute list means the match line itself cannot host a comment. The
guard looks back far enough (20 lines) to cover a realistic multi-attribute component invocation.

### `(auth)` gains a brand panel, and the guard now covers it too

`login` and `setup` had no shell at all before this phase: a bare `<main>` centring a card on the
full viewport, with the card's own `max-w-sm` / `max-w-md` as the only width decision either route
made. Per the issue's own done-when ("`(auth)` uses `form`"), both routes now compose
`PageLayout`'s `form` variant for their content measure, same as every other create/edit screen.

The full-viewport, two-column chrome around it — a `src/routes/(auth)/AuthBrandPanel.svelte` on
the left (the three domain colours as a motif, the same `--asset` / `--desk` / `--project` tokens
the app shell's nav already uses for its accents) and the form on the right — is auth-specific
page chrome, the same way the sidebar is `(app)`-specific chrome: `PageLayout` owns the content
area's width policy, not the page's outer shell. Inside the form side, the actual card keeps a
narrower `max-w-sm` / `max-w-md` than the `form` variant's `max-w-2xl` ceiling — a deliberate,
`layout-ok`-annotated inner measure, the same escape hatch a bounded search field uses elsewhere.

`src/routes/page-layout.guard.spec.ts` now walks `(auth)` as well as `(app)` and `(portal)`.

### Gutter

`(app)/+layout.svelte` and `(portal)/+layout.svelte` both set `main`'s padding to
`p-[var(--space-6)]` on all sides (previously `px-6 py-8` in `(app)`, and `mx-auto max-w-3xl px-6
py-8` in `(portal)` — the portal's own per-page container, removed the same way as the other 15).

### Catalogues are forms

`NameCatalogue.svelte` (categories, manufacturers) and `assets/models/+page.svelte` compose
`PageLayout`'s `form` variant, per the issue's own mapping ("new/edit/catalogues-as-forms …
→ form") — not `index`, even though each renders a list underneath its inline create row. A
catalogue's list is secondary to the one-field form that grows it; the vocabulary classifies by
that form, the same as the asset/ticket create screens.

## Consequences

Every `(app)` and `(portal)` route renders inside `PageLayout` now; a new route that reaches for
its own `max-w-*` fails `npm test` instead of landing unreviewed. The three shapes are also now
the only three a reviewer needs to recognise, instead of six ad-hoc widths that happened to
accumulate one route at a time.

`PageHeader`'s `summary` is a `Snippet`, not a plain string, so every call site wraps its lede in
`{#snippet summary()}…{/snippet}` — slightly more ceremony than a prop, chosen because the spec
names it a snippet and phase 3 is expected to feed it richer content than a string line.

The portal does not gain a `record` variant: per the phase's own scope, it only swaps between
`form` and `index`. Its ticket-detail page (no side column, no 340px rail) uses `index`; a future
portal redesign is where a `record`-shaped portal page would be decided, not this phase.
