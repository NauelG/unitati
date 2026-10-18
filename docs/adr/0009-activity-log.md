# 0009. One activity table, typed foreign keys, versioned payload

- **Status:** accepted
- **Date:** 2026-10-07

## Context

Two slices of the MVP ask for history. Slice 2 needs "every custody change, with who and
when" on an asset. Slice 7 needs an "activity log per record" across all three domains. The
design system asks for both to render through one component: `AssetTimeline` takes "a list of
events, each with kind, an icon, an optional `RecordRef`, a status badge, and a timestamp",
and the ticket detail layout renders "system events (a link created, a status change) as one
muted line".

If each slice answers the question on its own, slice 2 builds a custody table and slice 7
builds a generic log, and the same event is stored twice — the second time behind a migration.

Three storage shapes were on the table, and two separate questions hang off whichever wins:
where does the event point, and what does it carry.

**Where it points.** A generic log normally carries `record_type` + `record_id`, which is the
polymorphic shape [ADR 0005](0005-single-suite-and-relations.md) rejected for relations
because no foreign key can protect a column that sometimes means `assets` and sometimes
`tasks`. The argument there was about relations, but the guarantee is the same one: the
database must refuse history attached to a record that does not exist.

**What it carries.** The timeline mixes three shapes of entry in one rail — a reference to
another record (`TCK-1093`, _In progress_), a state change (`available` → `in_repair`), and a
plain sentence ("Keyboard replaced under warranty"). A pair of `old_value` / `new_value`
columns holds the second and breaks on the first and the third.

## Decision

**One `activity` table**, owned by a cross-cutting `activity` module, with:

- **Typed, nullable foreign keys** — one per entity that can carry history (`asset_id`,
  `ticket_id`, `task_id`, `project_id`, `person_id`) — and a `CHECK` constraint that exactly
  one is set. Real referential integrity, one table to query.
- **`verb`**, an enum, as the canonical key of what happened. The same principle the design
  system states for `StatusBadge`: _"Consumer provides the status key; the component maps it
  to text and tone. Never pass free text."_ An activity row stores the key; the renderer
  produces the sentence through paraglide.
- **`payload`**, `jsonb`, constrained at the boundary by a **TypeScript discriminated union
  keyed on `verb`** and validated with Zod on write. The union is what turns a `jsonb` column
  into a contract: adding a verb without its payload shape, or without its message, fails to
  compile.
- **`actor_person_id`**, a nullable foreign key — nullable because the system acts too.
- **Snapshots alongside identifiers in the payload.** An entry that records a custody change
  stores both `toPersonId` and the person's name _as it was_. The identifier is for linking;
  the snapshot is the fact.

**Activity rows are written by the domain function that caused them, inside the same
transaction.** Not by a Drizzle hook and not by a helper in `shared/`.

**The timeline is a merge at read time, not a table.** A record's timeline is the union of its
live relations (from `links`, rendering each related record's _current_ state) and its past
events (from `activity`). Relations and events are different natures and keeping them apart is
what lets a linked ticket show today's status instead of the status it had when it was linked.

## Consequences

- The database refuses activity attached to a record that does not exist, which is the same
  guarantee ADR 0005 bought for relations.
- A new entity with history costs a column and a line in the `CHECK`. With four principal
  entities that is cheap; it would not be with thirty, and thirty is not where this product is
  going.
- **An agent cannot invent a payload shape.** Without the discriminated union, four agents
  produce four variants of `custody.assigned` and the renderer fills with branches.
- **History survives renames and deactivation.** `people.active` exists so that "their asset
  and ticket history survives"; storing only an identifier would make that history change
  retroactively whenever a name changed, and a record of the past that rewrites itself is not
  an audit trail.
- Custody needs no table of its own: `asset.custodian_person_id` holds the present,
  `activity` holds the past. "Who held it in March" is a scan by verb — a rare query at an
  acceptable cost.
- Because the renderer is an exhaustive `switch` over `verb`, the compiler reports a verb added
  without its translation, instead of shipping an English string into a Spanish interface.
- Writing in the caller's transaction means an action and its history commit together. Custody
  assigned without its entry is worse than neither: it is a history that cannot be trusted,
  and a history that cannot be trusted is not read.

## Alternatives considered

- **Polymorphic `activity` with `record_type` + `record_id`.** Rejected: it gives up the
  referential guarantee [the vision](../vision.md) calls non-negotiable, for a saving of four
  nullable columns.
- **One activity table per domain** (`asset_activity`, `ticket_activity`, …). Rejected: it
  keeps the integrity but charges a migration _and_ a `UNION` branch in every cross-domain
  query for each new domain. The `CHECK` is cheaper at this scale.
- **A pre-rendered `summary` column.** Rejected twice over: a history written in Spanish stays
  Spanish forever, which breaks the English locale already on the roadmap, and it violates the
  design system's own "never pass free text".
- **Classic audit columns** (`field`, `old_value`, `new_value`). Rejected: they express a state
  change and nothing else. They cannot hold "linked to `TCK-1093`", where the value is a
  record reference, nor a free-text repair note.
- **A generic write hook on Drizzle.** Rejected: a hook knows that a row changed, not what it
  meant. It can only produce "field X: a → b", which is the useless log this ADR exists to
  avoid. `shared/` cannot help either, since it may not import from a domain and therefore
  cannot know the verbs.
- **A dedicated `custody` table beside the activity log.** Rejected: the activity table with a
  typed foreign key, a verb and a payload already _is_ a table of custody events. Building the
  second one is the duplication this ADR was written to prevent.

## Addendum: a target without a foreign key (locations, #179)

`activity.location_id` is the sixth target and the first with **no foreign key**. Every other
target uses `cascade`, which is right for a record whose history is meaningless without it. A
location is different: its deletion is itself an event an audit (#24) needs to read afterwards.
`restrict` would forbid deleting any location with history, `cascade` would erase the entry that
records the delete, and `set null` would break `activity_exactly_one_target`. So the column is a
bare `uuid`, still counted by the `CHECK` and indexed like the others.

The rule that follows: **an entry for a target without a foreign key carries its own snapshot.**
Nothing can be resolved through the id once the row is gone, so `catalogue.location.*` payloads hold
the name and the full path as they read when written (`updated` holds the path _after_ the change,
and both parent paths for a move). Nothing is joined at read time, which is also why the
organisation feed shows these entries with no record link.

Only locations have this history among the catalogues, because moving or renaming one changes what
every asset in it "is at". The `catalogue.` verb prefix reserves the space; each further catalogue
needs its own decision. A move writes one entry, on the moved location: descendants and assets have
no row that changed.
