# 0045. Archiving an asset that should never have been registered

- **Status:** accepted
- **Date:** 2026-10-23

## Context

An asset could be neither archived nor deleted. `retired` is a lifecycle state: the asset existed and
left service. A duplicate or mistyped registration is a different thing, and filing it as `retired`
pollutes the state distribution and the history.

## Decision

1. **Archiving is not a state.** `assets.archived_at` is independent of `state`; `ASSET_STATES` is
   unchanged and the asset keeps its state.
2. **The row stays.** Tag and serial remain taken (unique constraints are untouched), and the
   `ActivityLog` keeps pointing at the asset.
3. **Hidden by the scope.** `requireAssetScope` excludes archived rows, so lists, search, summary,
   distribution, labels, ticket links and `countActive` skip them. Only the detail page, for a viewer
   with `assets.manage`, passes `includeArchived`. Writes on an archived asset answer as if it were gone,
   except restoring it.
4. **Guard.** Archiving is refused (`has_history`) when somebody holds the asset or it appears in any
   handover. The remedy is `retired`.
5. **Audit.** `asset.archived` and `asset.unarchived`, no payload, no mandatory reason. Idempotent.
6. **No API endpoint.** UI only, behind `assets.manage`.

## Consequences

- A mistaken tag cannot be reused while its asset is archived.
- Hard deletion remains unavailable by design.
