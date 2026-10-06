# 0004. Tenant-ready at N=1

- **Status:** accepted
- **Date:** 2026-10-06

## Context

[Vision](../vision.md) rules out multi-tenant SaaS, and
[internal vs open source](../decision-internal-vs-oss.md) settles on "OSS-ready,
single-tenant, self-hosted". Multi-tenancy is nevertheless wanted at some point, which
leaves two bad options and one good one.

Retrofitting tenancy is the expensive failure mode: it is not a column, it is every query,
every uniqueness constraint, every join and every test in the codebase at once. Teams
postpone it precisely because it has become too large, which is how products end up
single-tenant forever.

Building actual multi-tenancy now is the other failure mode: tenant administration, switching,
invitations per organisation, routing and isolation testing, all to serve one organisation.

## Decision

Model the data for many organisations; ship the experience for one.

1. An `organisation` table exists and is populated with exactly one row.
2. Every aggregate root carries `organisation_id`.
3. Uniqueness constraints are scoped by `organisation_id`, never global.
4. **All** data access goes through a layer that injects the organisation scope. There is
   no second code path for "the single-tenant case".

Explicitly out of scope: organisation management UI, organisation switching, subdomain or
path routing, per-organisation branding, billing, cross-organisation reporting.

Row Level Security is **not** adopted now. It is defence in depth rather than a feature,
and it costs connection roles and operational complexity. It can be added on top of this
decision later without rewriting anything — which is the test this decision has to pass.

## Consequences

- Single-tenant is multi-tenant with one row. The multi-tenant path runs in production from
  day one, with N=1, so it cannot rot unexercised.
- Adding the second organisation is an insert plus the UI that was deliberately skipped,
  never a migration of the data model.
- Every query carries a scope it does not yet need. That is the premium paid for the option,
  and it is small: one column and one access helper.
- Forgetting the scope on a new query is now the critical bug class. It is contained by
  having exactly one way to reach the database, not by reviewer discipline.
- This supersedes the unqualified "not multi-tenant" non-goal in the vision, which now
  states the same thing about the _product_ while this ADR governs the _schema_.

## Alternatives considered

- **Single-tenant, retrofit later.** Rejected: the rewrite is the thing that never happens.
- **Full multi-tenancy now.** Rejected: building an organisation switcher for one organisation.
- **Schema or database per tenant.** Rejected: heaviest isolation, hardest migrations, and
  it answers a question nobody has asked yet. Still reachable from here.

Shelf.nu, on a comparable stack, models exactly this shape (`Organization`,
`UserOrganization`, `OrganizationRoles`), as does Plane (`Workspace`, `WorkspaceMember`).
