# 0027. Locations are a typeless tree, identified by path

- **Status:** accepted
- **Date:** 2026-10-16

## Context

A location began as a flat name an asset could point at, seeded and never editable. Real
organisations place equipment in buildings, floors and rooms, and want to say where a building is
(#177, #178). Four things have to be decided together because each constrains the others: how
places nest, what must be unique, what happens to the things that point at a place when it goes,
and where a catalogue with this many fields is edited.

## Decision

1. **A hierarchy without types.** `locations.parent_id` points at another location in the same
   organisation. There is no `type` column ("building", "floor", "room"): depth is the only
   structure, and what a node _is_ is a matter of its name. A type would force a fixed vocabulary
   onto organisations whose sites do not fit it, and nothing in the product branches on it.
2. **Siblings are unique by name.** `UNIQUE NULLS NOT DISTINCT (organisation_id, parent_id, name)`.
   `NULLS NOT DISTINCT` is what makes two _roots_ siblings; without it a root's `parent_id` is
   null and null never equals null. "Floor 1" may therefore exist under every building.
3. **The code is unique across the organisation.** `UNIQUE (organisation_id, code)`, nulls
   distinct, so any number of locations can go without one. A code is the short identifier on a
   label or a spreadsheet (`BCN-1-A`); it only works as one if it names exactly one place.
4. **Coordinates without PostGIS.** `latitude` and `longitude` are `double precision`, both or
   neither, enforced by a `CHECK` as well as by validation. There is no spatial query to run, so
   an extension would be weight with no use. The UI is es-ES, so the form parser accepts a comma
   as the decimal separator.
5. **`restrict` on assets only.** `assets.location_id` and `locations.parent_id` are
   `on delete restrict`: a place that still holds assets or has children cannot be deleted, and
   the refusal is a typed `in_use` the screen can explain. `people.location_id` stays `set null`:
   losing a desk is not worth blocking a delete, and #176 revisits it.
6. **The path is the display identity.** Wherever a location is shown beside an asset it is the
   path, `Barcelona office › Floor 1`, built by one recursive query in `directory`
   (`locationPaths`). The name alone is ambiguous by design (point 2). `location.changed` keeps its
   `…LocationName` keys so old rows still parse, but since this version the value is the path at
   the time of the move; a later rename does not rewrite history.
7. **A cycle is refused under a lock.** Giving a location a parent first takes `select … for update`
   on the organisation's row (the ADR 0021 pattern), then refuses if the new parent is the location
   itself or one of its descendants. Without the lock, "A under B" and "B under A" each look fine
   to a transaction that cannot see the other's uncommitted row, and together they detach both
   from every root.
8. **A catalogue with more than three fields is edited in a `Sheet` on its own list page**, with no
   canonical edit route (extends ADR 0020 §Catalogues). `/settings/assets/locations` has no `/new`
   or `/[id]`.

## Consequences

- Listing is tree-ordered by the array of ancestor names, not by the joined string, so a
  separator character cannot interleave `Barcelona › Floor 1` with `Barcelona 2`.
- Moving a subtree changes the path of every descendant and writes nothing to the activity log;
  the assets in it did not move.
- Every write that sets a parent serialises on the organisation row. Locations change rarely, so
  the contention is theoretical.
- An asset's location can no longer vanish silently when its place is deleted; whoever deletes it
  must first move the assets.
- Counts are direct only: an asset on `Floor 1` does not count for `Barcelona office`.

## Addendum (2026-10-18): deleting a location people sit at (#176)

Point 5 left "#176 revisits it". #176 decided: `people.location_id` stays `on delete set null`, on
purpose.

- A person's location is informative; an asset's is inventory truth. `restrict` would force N
  manual edits to delete one place, and there is no bulk edit to make that bearable.
- What replaces the silence: the confirmation says how many people will lose the location, and the
  delete transaction writes one `person.location.changed` entry per person
  (`to: null`, `reason: 'location_deleted'`, `from` carrying the id and path at deletion). A
  refused delete rolls the transaction back, so no person entry survives it.
- A technician (`assets.manage`) may delete a location people sit at, with the same warning as an
  admin. Requiring `people.manage` would be a dead end for them.
