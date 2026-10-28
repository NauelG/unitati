# 0056. Single sign-on with OIDC and SCIM

- **Status:** accepted
- **Date:** 2026-10-27
- **Issue:** [#43](../../../issues/43), first slice [#408](../../../issues/408)
- **Partly supersedes:** [ADR 0006](0006-email-and-password-authentication.md)
- **Amends:** [ADR 0033](0033-staff-managed-credentials.md)

## Context

Sign-in is email and password through Better Auth ([ADR 0006](0006-email-and-password-authentication.md)),
and access is granted by staff with a one-time temporary password
([ADR 0033](0033-staff-managed-credentials.md)). An organisation that already runs an identity
provider (authentik is the first) wants its people to sign in there, and wants a leaver to lose
access without anybody remembering to revoke it in a second system.

A `user` is a credential; the `person` it belongs to lives in `directory`, and `people.user_id` is
nullable. Whatever SSO adds has to respect that: it links an identity to a person, it does not
replace the directory.

## Decision

1. **OpenID Connect through `@better-auth/sso`**, one provider per installation, registered
   statically (`defaultSSO`) from `OIDC_ISSUER`, `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET`, with
   discovery from the issuer and scopes `openid email profile`. The three are all-or-none: with none
   set nothing about SSO is visible and the installation behaves as before. SAML waits for an IdP
   that does not speak OIDC.
2. **Hybrid configuration.** The issuer, id and secret live in the environment; everything an admin
   tunes (`authentication_settings`: button label, JIT provisioning, SSO required, auto-redirect)
   lives in the database. No secret is ever stored, so no encryption at rest is introduced. The
   plugin's management API (provider registration and the rest) is closed: the provider comes from
   the environment and nowhere else, and the resolver refuses any provider that is not that one.
3. **Identity.** An IdP identity is linked to a person by email **once**, and only when the ID
   token carries `email_verified=true`. From then on the link is `(provider, external_id)`
   (`person_identities`, `provider = oidc:<issuer>`, `external_id` = the `sub` claim, compared
   case-sensitively); the email is never used to match that identity again. The link is a directory
   table; the `auth` domain reaches it through `directory`'s public functions.
4. **Resolution at the callback**, in `@better-auth/sso`'s `resolveUser` hook and in one
   transaction: (1) an existing link finds the person; (2) otherwise a verified email and an active
   person with that address and no link for this provider links them (`person.identity.linked`);
   (3) otherwise, with JIT provisioning on, the person and the link are created (`person.created`
   with `via: 'sso'`); (4) otherwise the sign-in is refused. An inactive person is refused; an active
   person without a user gets one with role `employee`. A new identity whose email another person
   holds is refused and leaves one open `email_taken` provisioning warning for an admin.
5. **The IdP is authoritative for what it supplies.** Full name and email are overwritten on every
   sign-in (an email only from a token that vouches for it) and are read-only in `/directory` for a
   linked person. An email change updates `people.email` and `users.email` in one transaction.
   Unlinking (admins) removes the link, ends the person's SSO sessions and makes both editable again
   (`person.identity.unlinked`). The email of an **inactive** person stays editable even with a user,
   so an admin can free an address the IdP has handed to a new hire.
6. **The IdP decides access.** An authenticated identity that resolves to an active person gets in;
   Unitati does not ask an admin to grant it again. Roles are still Unitati's: SCIM Groups will
   supply them (#409), never the OIDC `groups` claim, because two sources of role would fight.
7. **Sessions.** An SSO session lasts at most **12 hours from creation and is never refreshed**, so
   a leaver loses access within a working day even without SCIM. Password sessions keep 30 days,
   refreshed. The method is `sessions.auth_method` (`password` or `sso`), set by a Better Auth
   database hook; the same hook stops Better Auth's refresh from moving an SSO session's
   `expires_at`. Unitati never calls the IdP's end-session endpoint: signing out of Unitati must not
   sign the person out of every other application. Signing out lands on `/signed-out`.
8. **SSO required.** Turning it on revokes every password session of a non-admin user in the same
   transaction and keeps their password hashes, so turning it off restores password sign-in. While
   it is on, opening a password session is refused for a non-admin **inside session creation**, not
   in a form action, so Better Auth's own endpoint is closed too; the refusal reads like a wrong
   password. "Grant access" and "Reset password" are offered only for admins.
9. **Break-glass.** `/login/local` is always reachable, never redirects and cannot be disabled by
   any setting. While SSO is required it accepts admins only. With SSO required and auto-redirect
   on, `/login` goes straight to the IdP, except when reached from an SSO error or from signing out
   (`?noauto=1`). Refusals land on `/login/sso-error`, which never redirects.
10. **Deep links** survive the round trip: the requested path is carried as the callback URL and
    validated as same-origin by the existing redirect guard.

## Consequences

- Settings and the sign-in screen read the environment once; a half-configured set of variables
  stops the server at start. Without the variables every setting reads as off, whatever the database
  remembers, so dropping them cannot lock staff out of the password form.
- Better Auth's adapter runs with native transactions, which the SSO plugin requires for
  `resolveUser`. `better-auth` is raised to 1.7.14 to match the plugin.
- Linking by email trusts the IdP's `email_verified`. The authentik guide
  ([sso-authentik.md](../sso-authentik.md)) says how to make that claim mean something.
- A person whose `sub` changes at the IdP (a recreated account) is a new identity: it links again
  by email, unless an admin has freed or unlinked the old one.
- The issuer is part of the provider key and is kept exactly as configured, trailing slash and all;
  changing it orphans existing links.
- SCIM provisioning, deprovisioning and group-to-role mapping are the next slice (#409); until it
  ships, roles are managed in Unitati only and leavers are cut off by the 12-hour session.
