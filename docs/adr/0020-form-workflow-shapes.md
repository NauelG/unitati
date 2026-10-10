# 0020. Form workflow shapes: dialog, sheet, full page

- **Status:** accepted
- **Date:** 2026-10-10

## Context

Part of #81. Issue #100. `/assets/new` composes `PageLayout`'s `form` variant (ADR 0018):
`max-w-2xl`, ~672px, centred in whatever viewport opens it. The form itself is one asset (name,
tag, serial, model, state, location, shared) plus an inline `<details>` subflow that creates a
model when the catalogue is missing one — two independent tasks sharing one scroll container, with
no secondary information for either. `/assets/models` composes the same `form` variant for what
ADR 0018 itself calls a catalogue: a one-row inline create form above a list of models, each row
rendering its own always-visible edit inputs — the list, not the form, is the page's actual
content, and the three live edit rows do the opposite of what a flat list promises ("scan down,
nothing moves until you ask it to").

ADR 0018's own "Catalogues are forms" section classified `NameCatalogue.svelte` (categories,
manufacturers) and `assets/models/+page.svelte` as `form` "per the issue's own mapping" — a
decision this ADR revisits with #100's own evidence: a catalogue's _list_ is the page, not the
one-field row that grows it, and conflating the two put six always-live `<input>`s on screen for
every model instead of a read state that commits to an action.

Three separate asks keep landing on the same cramped surface: a one-field "new category", editing
one asset's six fields in the context of a list or record it was already open on, and registering
a brand-new asset with a real subflow. One `max-w-2xl` column cannot be all three without either
cramping the long form or wasting the catalogue's width.

## Decision

**Three task-sized shapes, chosen by what the task needs, not by habit.**

### Dialog (`unitati/Dialog.svelte`)

One to three fields, one primary action — "new category", "edit model". Composed directly around
shadcn-svelte's vendored `ui/dialog` primitives the same way `ConfirmDialog` (#99) composes
`ui/alert-dialog`, so it carries the app's own typography and radius instead of shadcn's default
chrome. One scroll container (`max-h-[calc(100vh-2*var(--space-6))] overflow-y-auto`), no nested
dialog or sheet inside it. Unlike `ConfirmDialog`, it owns no footer or confirm button: `children`
is the whole `<form>`, including its own Guardar/Cancelar row, because a create/edit form already
knows its own submit label and `use:enhance` shape. `pending` blocks Escape and the overlay the
same way `ConfirmDialog`'s does.

**Catalogues reclassify to `index` + Dialog.** `NameCatalogue.svelte` and `assets/models` render
their list as the page (`PageLayout` `index`, fluid to the ceiling) with a header-level "Nuevo…"
action opening a `Dialog`; each row renders read-only text plus `Editar`/`Eliminar`, and `Editar`
opens the same `Dialog` prefilled from that row instead of three always-live `<input>`s. `Eliminar`
keeps `ConfirmDialog`, unchanged. This supersedes ADR 0018 §"Catalogues are forms": the three
catalogue routes move from `form` to `index`, and the guard, gallery and this ADR are now where
that classification lives — ADR 0018's three-shape vocabulary (`index`/`record`/`form`) itself does
not change.

### Sheet — contextual edit

`unitati/Sheet.svelte` composes `ui/sheet`'s own `Sheet.Root`/`Sheet.Content` the same way
`AppShell`'s mobile drawer already does (ADR 0011) — not `ConfirmDialog`'s pattern, which is
destructive-only, and not `Dialog`, which this ADR scopes to one-to-three-field creates.
Right-anchored, `sm:max-w-[760px]`, full width below that breakpoint. Like `Dialog`, it owns no
footer: `children` is the whole `<form>`, which gets a sticky-looking action row for free from a
plain `flex h-full min-h-0 flex-col` layout (fields in a `flex-1 overflow-y-auto` wrapper, the
button row `shrink-0` after it) — no extra prop needed for that shape.

`/assets/[tag]` wires this onto the record it already has open: the `Editar` button's `href` still
points at the canonical `/assets/[tag]/edit` route (so a no-JS visitor, or one who opens it in a
new tab, still gets the full page), but a click with JS available opens the `Sheet` instead,
reusing the exact same `editAssetForm` validation and posting to the exact same action
(`action="/assets/{tag}/edit"`) — never a second copy of either. The record page's own `load` asks
for the same `superValidate` starting point the canonical edit route asks for, once, for a manager
viewing a non-shared row.

**Closing it is the caller's decision, not the component's.** `Sheet` only blocks Escape, the
overlay and its close button while `pending`, the same as `Dialog`. Discarding a dirty edit is a
bigger decision than discarding an empty one, so `/assets/[tag]` reads Superforms' own `tainted`
store at the moment of closing (`get(form.tainted)`, not a `$`-subscribed store — the check only
runs when something tries to close, not on every keystroke) and routes a dirty close through
`ConfirmDialog` ("¿descartar cambios?", non-destructive tone) instead of closing immediately. A
clean close — nothing typed, or already saved — closes straight away.

### Full page: `record`'s side column is not detail-only

`/assets/new` keeps `PageLayout`'s `form` main measure for the asset fields themselves — the task
is still "fill in one asset", not a list — but the inline `<details>` subflow becomes a
`WorkPanel` (ADR 0019) in `record`'s 340px side column instead of a collapsed block fighting the
same 672px column for space. `record`'s grid shape (`main` + `side` above 1100px, side falls below
it under) was written for record _detail_ pages, but nothing in its shape is detail-specific: a
create flow with a genuine secondary task (here, "the model doesn't exist yet") is exactly the
case the side column exists for. `/assets/new` is the first non-detail page to use it; a future
route with no secondary content keeps the plain `form` variant, no side slot.

### Ticket creation stays full-page, unchanged

`service-desk/new` keeps its current full-page `form` composition: a substantial description,
asset selection and attachments do not fit a Dialog's one-to-three-field scope, and the employee
portal must stay independently simple. Visual-token polish for that route is out of scope for this
ADR.

## Consequences

A reviewer now has three names for "where does this form go" instead of reaching for whichever one
a prior route happened to use: Dialog for a short catalogue create/edit, Sheet for contextual
record editing (component shape recorded here, route wiring tracked separately), full page — with
or without a `record` side column — for a creation flow with its own subflow or a long form. The
catalogue reclassification is a visible behaviour change (edit moves from always-live inputs to an
explicit `Editar` action) that existing users of `/assets/models`, `/assets/categories` and
`/assets/manufacturers` will notice; it is deliberate, not a regression, per the done-when
criteria's own "Editing an existing model opens the same dialogue prefilled from its row."

`record`'s side column gaining a non-detail consumer means its doc comment and gallery entry no
longer say "record detail" exclusively — both are updated to describe the shape by what it does
(a 340px side column above 1100px for genuinely secondary content) rather than by the one kind of
page that first used it.

`/assets/[tag]`'s `load` now runs one extra `superValidate` and one extra `listAssetModels` call
for a manager viewing a non-shared asset — the same cost the canonical `/assets/[tag]/edit` route
already paid on its own `load`, now paid twice per visit to the record with its sheet available
rather than once per navigation to the separate edit page. Measuring whether that trade is worth
reconsidering is future work, not a regression this ADR hides: the alternative (lazy-loading the
form data only when the sheet opens, over `fetch`) adds a network round trip and a loading state
to every open instead.
