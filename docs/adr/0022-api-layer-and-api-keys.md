# 0022. The API is one more adapter, authenticated by scoped API keys

- **Status:** accepted
- **Date:** 2026-10-14
- **Issue:** [#35](../../../issues/35)

## Context

The [roadmap](../roadmap-v1.md) puts a REST API in v1 because _"an unintegrable tool becomes
the fourth silo"_, and the MCP server (#51) waits on it. Today the only HTTP surface is the UI
itself: form actions plus a few JSON endpoints that serve pickers and the palette.

Five questions have to be settled before the first endpoint, because each is expensive to
reverse once integrations exist:

1. Where the API sits relative to the domains ([ADR 0002](0002-server-modules-by-domain.md)).
2. What an endpoint looks like: resources, commands, or both.
3. How a caller authenticates, and what a credential may do.
4. Who stores and verifies the credential: Better Auth or the product.
5. How the documentation stays true to the code.

## Decision

### The API is an adapter, and every endpoint is declared once

`/api/v1` routes follow the same rule as every other route: validate, call a domain function,
shape the response. They never query the database.

Each endpoint is declared once, in a registry. A declaration holds:

- the method and path,
- a stable use-case id (`tickets.create`),
- the permission or permissions it requires,
- Zod schemas for its input and output,
- the handler, which calls the domain function.

That single declaration drives input validation, authorisation **and** the OpenAPI document.
The documentation cannot drift from the code, because nothing else produces it.

### Resources for reading, explicit actions for use cases

- Reading and creating go through resources: `GET /tickets`, `GET /tickets/{tag}`,
  `POST /tickets`.
- State changes go through one action endpoint per domain function:
  `POST /tickets/{tag}/status`, `/assign`, `/priority`, `/queue`, `/comments`.
- `PATCH` exists only where the domain itself exposes a plain field edit, such as an asset's
  descriptive details (`updateAssetDetails`). Status, custody, assignment and every other
  rule-bound change is an action, never a field in a `PATCH` body. A generic field write would
  bypass the domain's transitions: a status change is a rule, not a column write.
- Records are addressed by their human-readable code, never by UUID
  ([ADR 0010](0010-human-readable-record-codes.md)).

### API keys, and only API keys, on `/api/v1`

- Callers send `Authorization: Bearer <key>`.
- `/api/v1` ignores session cookies. A browser session does not reach the API, and an API key
  does not reach anything outside `/api/v1`. This keeps a single way in and adds no CSRF
  surface.
- A missing, malformed, expired or revoked key is `401` with a JSON body. It never redirects
  to `/login`.

### What a key may do: role ∩ scopes

A key carries **scopes**, which are permission strings from the catalogue in
[ADR 0007](0007-roles-and-permissions.md).

- The effective permission set of a request is **the owner's role permissions ∩ the key's
  scopes**.
- The intersection is evaluated on every request, not frozen at creation. Demoting a user
  narrows their keys immediately.
- At creation, the scopes offered are limited to what the creator's role holds.
- `can()` honours the scopes when the principal carries them. Every domain that already asks
  `can(viewer, …)` therefore respects them without change, including row-level decisions: a
  technician's key scoped to `tickets.view.own` sees only their own tickets.

Roles stay product constants. Scopes narrow a role; they never widen it, and they are not
user-authored roles.

### Two kinds of owner

- A **personal key** acts as the user who created it. Activity is attributed to that person.
- A **service account** is an organisation-owned principal with a product role and no person,
  for integrations that must outlive the employee who set them up. It uses the same
  formula: the role permissions ∩ the key's scopes. Its activity is attributed to the
  service account, not left anonymous.

### The product stores keys, not Better Auth's plugin

The `@better-auth/api-key` plugin was considered and rejected:

- Its organisation-owned keys require Better Auth's `organization` plugin, which brings its
  own organisations, members and roles. Those would duplicate
  [ADR 0004](0004-tenancy.md) and ADR 0007.
- Its session mocking (`enableSessionForAPIKeys`) would make a key valid wherever a session
  is read, form actions included. Better Auth's own documentation advises against it.
- Its permissions are a free-form `Record<string, string[]>`, not the product's typed
  catalogue.

Keys live in a product table owned by a new cross-cutting `api` server module, alongside the
endpoint registry. The `auth` module keeps only Better Auth's tables. `api` depends on `auth`
(the owner is a user) and on `directory` (the organisation), and `directory` already imports
`auth`. Putting keys in `auth` would therefore create a cycle.

- A key is a fixed prefix (`unt_`) followed by 32 bytes from a CSPRNG, base64url-encoded.
- Only its SHA-256 hash is stored, and lookup is by hash. A slow password hash is unnecessary
  for a 256-bit random secret.
- The full key is shown once, at creation. The UI identifies a key by its first characters.

This is not the hand-rolled password crypto that [ADR 0006](0006-email-and-password-authentication.md)
forbids. There is no low-entropy secret to protect, so there is no stretching to get wrong.

### Errors, versioning, limits

- Errors share one envelope, `{ "error": { "code", "message", "issues"? } }`:
  - `400` for invalid input, with `issues` taken from Zod,
  - `401` for authentication,
  - `404` for both "not found" and "not allowed", as in ADR 0007,
  - `409` for a domain refusal (e.g. an illegal transition),
  - `429` with `Retry-After`.
- The path carries the major version. Additive changes ship in `v1`; a breaking change is
  `v2`, served alongside it.
- Rate limiting is per key, with a fixed window held in process. One Node container serves
  the app ([ADR 0001](0001-stack-and-architecture.md)), so shared storage would buy nothing
  at N=1.

### Documentation is generated

- An OpenAPI 3.1 document is built from the registry with Zod 4's native JSON Schema output.
  No specification library is added.
- It is downloadable as `openapi.json` and rendered in the app with the design system.
- Each operation states the permission it requires.

## Consequences

- `SessionUser` gains an optional `scopes`, and `can()` gains the intersection. This is the
  only change the domains see.
- Activity gains an actor column for service accounts. A personal key needs no schema change:
  it acts as a person who already exists.
- Writing `last_used_at` on every request would turn every read into a write, so it is
  throttled to at most once a minute per key.
- Webhooks are a separate decision. They push, while this API is pulled.
- The MCP server (#51) can be built over the same registry: the use-case ids and schemas are
  already the tool catalogue.
- The in-process rate limit does not survive horizontal scaling. If a second container is
  ever added, the limit moves to Postgres or a shared store. That is a local change behind
  one function.
