# 0049. Record screens compose the app's record reads

- **Status:** accepted
- **Date:** 2026-10-25
- **Issue:** [#360](../../../issues/360)

## Context

The ticket, asset, project and task pages each compose four to six domains in `load`, derive
capability flags with `can()`, load picker data only when those flags allow it, and stream a
rail. That read policy lives in the HTTP adapter, mixed with transport (cookies, search
params, `superValidate`), and is tested only through `load({ … } as never)`, or not at all
(the asset page). The flags name permissions where the view needs acts: the project page's
`canManage` is the bare permission and `+page.svelte` recombines it with `archivedAt`, while
the task page folds archiving into its own `canManage`.

[ADR 0002](0002-server-modules-by-domain.md) says where tables and rules live, not where a
screen's cross-domain composition lives. Sharing a read with the API is **not** the
motivation. Every `/api/v1` GET already calls one domain function
([ADR 0022](0022-api-layer-and-api-keys.md)), and the shared cross-domain reads, the
timelines, already live in `links/record-timelines.ts`.

## Decision

1. **`src/lib/server/screens/` is a leaf orchestrator**, like `imports/` and `search/`. It
   owns no tables, imports only the domains' `index` files, and nothing under
   `src/lib/server` imports it. Only app routes do.
2. **One function per record kind:** `taskScreen`, `projectScreen`, `ticketScreen`,
   `assetScreen`, each `(viewer: SessionUser, tag: string, context?) =>
Promise<Outcome<XScreen, 'not_found'>>`. There is no generic screen type. The convention is
   what they share.
3. **Two layers at the entrance.** The route keeps its guard (redirect to login, 404). The
   screen re-checks read access with `can()` and returns `not_found`. A screen imports nothing
   that throws HTTP.
4. **`may` holds acts, not permissions:** verbs with the record's state already applied
   (`may.unarchive` is true on an archived project, `may.comment` is false). Each screen types
   its own `may`. The domain's write functions stay the authority: `may` mirrors their
   refusals and never replaces them.
5. **`choices` (picker data) are loaded if and only if the act they serve is allowed**.
   Otherwise they are empty or `null`.
6. **Slow reads are returned as promises** (`rail`). The route decides whether to await them or
   stream them (#89).
7. **`context` carries user intent only** (`{ fromTicket }`). Transport values stay in the
   route: cookies, `?view=`, form seeding, Markdown rendering.
8. **The view reads `data.may.<act>`.** Record state (`archivedAt`, `visibility`) may decide
   what is shown, never whether a control exists.
9. **Neither the API nor any domain imports `screens/`.** The `screens-are-a-leaf` rule in
   `.dependency-cruiser.cjs` ([ADR 0048](0048-module-boundaries-enforced-by-dependency-cruiser.md))
   enforces it. An API composition, if one is ever needed, goes into the owning domain or
   `links`, as `record-timelines.ts` does.
10. **Tests:** one `screens/<kind>.db.spec.ts` per screen, against the test database, with a
    role matrix. Read-policy tests that call `load` move there. Route specs keep transport and
    actions only.

## Considered options

- **In `links`.** Rejected: it would give `links` two reasons to change (relations and
  screens), and it is already the largest module.
- **In each owning domain.** Rejected: it adds domain-to-domain edges
  (assets → links/service-desk, service-desk → assets) and deepens the service-desk ↔ links
  cycle.
- **Next to each route (`record.server.ts`).** Testable, but it fixes no rule, and the policy
  stays under `routes/`.
- **A generic `RecordView<K>`.** Shallow: the sections differ (the asset has no follow, the
  ticket's thread is its timeline, the asset is a full/shared union).
- **Two functions per record (screen + rail).** Rejected: the rail's visibility policy would be
  split across two functions that must agree.
- **The API projects from screens.** Rejected: it couples the versioned public contract to a
  screen's shape and loads data the API throws away.

## Consequences

- A record page's `load` becomes: guard → screen → 404 → transport → return.
- "Screen" is implementation vocabulary, not domain vocabulary: it stays out of
  `docs/domain-model.md`.
- Other pages may adopt a screen when their `load` composes several domains. They are not
  required to.
- `screens` joins the business modules of ADR 0048, so a route reaches it through its
  `index.ts` only.
