# 0047. API refusals are declared per endpoint

- **Status:** accepted
- **Date:** 2026-10-23
- **Issue:** [#350](../../../issues/350)

## Context

The HTTP status of a domain refusal used to come from the failure's _name_: the shared mapper
matched the `_not_found` suffix and a few special strings, and sent everything else to `409`.
A failure added to a domain therefore got a status nobody chose, a bare `not_found` became
`409 not_found` (two local mappers patched around it by hand), and the same condition answered
differently on different endpoints. The generated OpenAPI document could not list the error codes
either: it advertised a generic `409` on every write, and the real codes lived in hand-written
prose that could drift from the behaviour.

Once v1.0.0 declares the API stable, any silent change of a published status is a breaking change
(ADR 0003, ADR 0022).

## Decision

**Every endpoint declares a refusal table next to its schemas and permissions.** The table maps
each failure its domain call can return to one explicit HTTP answer. It lives in the API adapter,
and the domain is not touched: domains keep returning outcomes and never learn about HTTP
(ADR 0002). The same failure may answer differently on different endpoints, because the answer
depends on where the reference came from (a person in the body is a `400`, in the path a `404`).

- The table is **exhaustive** over the failure union: a member missing from it, or an entry that
  is not a member, does not compile. For object failures the key is their `kind`.
- The handler receives **`refuse`**, typed against its own table. Refusing with a failure the
  table does not cover does not compile. It returns the error to throw.
- An object failure's message and `details` are computed from the typed member. When the adapter
  needs facts the domain does not return (the counts behind `in_use`, composed from two domains),
  the handler refuses with a richer member of its own and the table is typed against that.

### Closed vocabulary

Each entry has a statically known status:

| Entry         | Status | Behaviour                                                                                             |
| ------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| not found     | 404    | Code `not_found` (ADR 0007: a record that does not exist and one the key may not see are one answer). |
| conflict      | 409    | Code is the failure's name; message derived from it unless given; optional computed `details`.        |
| field         | 400    | Code `invalid_input` with one issue on a named body path.                                             |
| forbidden     | 403    | `forbidden_create`.                                                                                   |
| unprocessable | 422    | `invalid_input`.                                                                                      |
| unreachable   | none   | Never documented. Reaching it is an internal error (`500`).                                           |

### Rules for `unreachable`

It is allowed only when the endpoint's _input_ makes the failure impossible (the API accepts no
inbound attachments and offers no waiver), and it carries a mandatory `why` saying so. Reaching it
means an assumption was wrong, and that must show up as a bug and not behind an invented refusal.
Failures the handler turns into a success before refusing (`already_linked`, `archived` on
archive) stay out of the table: it covers real refusals only.

### OpenAPI is derived from the table

When an endpoint has a table: `404` is always emitted; `400` when it has input, listing the body
paths that can be rejected; `409`, `403` and `422` only when the table has entries of that kind.
Each status narrows `error.code` to an enum over the shared `Error` schema, with one description
line per code. `unreachable` never appears. Error prose leaves the endpoint descriptions, so there
is one source of truth.

## Considered options

- **A semantic kind declared in the domain** (`kind: 'conflict' | 'not_found' | …` on each
  failure). Rejected: it cannot tell a body reference from a path reference, and it would leak the
  "not allowed is a 404" presentation rule of ADR 0007 into domains.
- **Domain defaults with adapter overrides.** Rejected: two sources of truth, and an override that
  is forgotten fails silently, which is exactly the accident this decision removes.

## Consequences

- Adding a failure to a domain union stops every endpoint that surfaces it from compiling until
  someone decides how the API answers it.
- The migration is complete: the name-based mapper, the local mappers and the status-only
  `refusals` list are gone. An endpoint with no table refuses nothing (`refuse` accepts no
  failure), so the table is mandatory for any endpoint that refuses.
- The MCP server (#51) can read the table to describe each use case's failure modes.
