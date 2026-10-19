# 0029. In-place editing on record pages

- **Status:** accepted
- **Date:** 2026-10-19
- **Extends:** [ADR 0020](0020-form-workflow-shapes.md)

## Context

Part of #208, issue #211. The visual review found the same problem on four record pages (asset,
ticket, project, task): the properties people change most are edited far from where they are
shown, and often twice. The asset page has four panels with a select and a submit button each,
duplicating "Detalles". The ticket page has a "Propiedades" panel of four selects at the bottom of
the side column, duplicating the header chips. Project and task owner and due date are only
reachable through an edit `Sheet`.

ADR 0020 says contextual editing of a record happens in a `Sheet`. That is right for a form of
several fields, and wrong for changing one property of a record you are already looking at.

## Decision

**A single property of an open record is edited where it is displayed.** Three components carry
the pattern: `EditableChip` (record header: status, priority), `EditableDetailRow` ("Detalles":
assignee, queue, custodian, location, owner, due date) and `EditableText` (headings: title, name,
record code).

### Which shape to use

| Task                                           | Shape                         |
| ---------------------------------------------- | ----------------------------- |
| Change one property of the open record         | In place (chip, row, text)    |
| Create something with one to three fields      | `Dialog`                      |
| Edit several fields of a record in its context | `Sheet`                       |
| Create something long, or with a real subflow  | Full page                     |
| Long text (descriptions)                       | Rich text editor, Save/Cancel |

Agreed exceptions: `/assets/new` creates the model in a `Dialog`, and `/directory` creates and
edits people in a per-row `Dialog`, as #202 already set.

### Visual

Always visible. At rest the editable value has a 1px `--border` outline and `--radius-md`; on
hover or focus the outline becomes `--border-strong` and a small chevron appears. Header chips keep
their badge tone and add the same outline. In rows only the value is outlined, not the label, and
the value fills the column so rows line up. **Without permission there is no outline and no
chevron**: the value is plain text and cannot be activated.

### When a field saves

- Single choice (status, priority, queue, location, owner, custodian, assignee): on pick.
- Multiple choice: when the popover closes, and only if the selection changed.
- Date: on day pick. The consumer supplies the calendar through the row's `custom` kind.
- Short text: Enter or blur saves, Escape cancels.
- Long text is not this pattern.

### Errors and concurrency

A failed save rolls the value back and shows a toast (`optimisticEnhance`); there is no inline
message. **Last write wins**; ADR 0021 rejects optimistic-concurrency UX. The one exception is a
short-text validation error (a duplicate code, say): it shows under the input and keeps it in edit
mode.

### JavaScript is required

In-place editing is a client enhancement. Without JavaScript the values render read-only, and no
`sr-only` submit button is kept as a fallback. This is a deliberate trade: a hidden-button fallback
doubles the markup of every field for a case the app does not otherwise support (the board,
search and shortcuts already need JavaScript).

### Deep links

Each component takes `openOnHash`. When the page loads with that hash (`#action-custody`,
`#action-state`, `#action-location`, `#action-status`) or the hash changes to it, the matching
field opens its popover. The list keyboard shortcuts and saved links keep working.

### Mobile

Popovers stay popovers at every width; bits-ui handles collision. Below 640px the content is as
wide as the viewport minus the page margins. There is no bottom-sheet variant.

## Consequences

- The separate action panels disappear from the record pages as each one adopts the components
  (asset, ticket, project, task issues).
- Every in-place field is a one-field form posting to an existing action, so permissions stay
  server-side; the `editable` prop only decides what to draw.
- ADR 0020 keeps `Dialog`, `Sheet` and full page; its "contextual edit" guidance is superseded in
  part for single properties.
