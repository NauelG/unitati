# 0006. Email and password authentication

- **Status:** accepted, partly superseded by [ADR 0056](0056-single-sign-on-with-oidc-and-scim.md)
- **Date:** 2026-10-06

## Context

[ADR 0001](0001-stack-and-architecture.md) adopts the stack of `renyst-app`, and the
convention is to follow it. On authentication that convention cannot be copied wholesale:
renyst-app uses Better Auth with **magic link plus OTP by email**, an allowlist and
`SUPERADMIN_EMAILS`.

Copying it would drag SMTP into the first slice of the MVP: without a mail server there is
no login, not even in development, so the first thing to build would be mail infrastructure
plus a development mail catcher.

It is also worth separating what is genuinely a convention from what is a product choice
that happened to be made once.

## Decision

Authenticate with **email and password** via Better Auth.

The **structure** of renyst-app is kept, because that is the actual convention:

- `src/lib/server/auth/` with `index.ts` and `guards.ts`, plus `access/roles.ts`
- the session resolved in `hooks.server.ts` into `locals.user`
- guards enforced by route-group layouts; nothing else reads cookies
- roles as Better Auth `additionalFields`

Magic link, OIDC, LDAP and SCIM are post-v1 in the [roadmap](../roadmap-v1.md).

## Consequences

- The MVP is self-contained: it runs with Postgres and nothing else, and a developer can log
  in on a fresh clone with no mail server.
- Outbound mail still arrives in the MVP, for ticket notifications — but as a feature that
  degrades (a notification fails) rather than as a hard dependency of the login screen.
- Passwords bring their own obligations: hashing, rate limiting, reset flow, and a password
  policy. Better Auth covers them; they must not be hand-rolled.
- For an internal service desk this is also better UX: an employee reporting a fault from a
  warehouse floor does not wait for an email to arrive before they can report it.
- The divergence from renyst-app is deliberate and recorded here, so that the next person to
  notice it finds the reason instead of assuming an oversight.

> **Note (ADR 0056):** OpenID Connect single sign-on now sits beside email and password and can
> be made mandatory, in which case only admins keep a password (the break-glass `/login/local`).
> Email and password remains the default and the only method of an installation without an identity
> provider.
