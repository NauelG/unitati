# 0044. An organisation setting lends the technician role `people.edit`

- **Status:** accepted
- **Date:** 2026-10-22

## Context

A technician reads the directory (`people.view`) but cannot change it: every write needed
`people.manage` (ADR 0007), which only admins hold. Organisations where the service desk keeps the
directory up to date need technicians to edit it, and ADR 0007 says users never author roles in v1.

`people.manage` cannot simply be handed to technicians. It also covers granting access, resetting
passwords, changing roles and deactivating people, so it is the permission through which a privilege
escalates: a technician able to change a role could make themselves an admin.

## Decision

1. **`people.manage` is split.** A new `people.edit` covers the directory's data: create, update and
   import people, comment on them, and manage departments. `people.manage` keeps credentials, roles
   and (de)activation. Admins hold both.
2. **Roles stay product constants.** The `technician` row of the role table is unchanged. An
   organisation-level switch, `organisations.technicians_edit_directory` (default `false`), lends
   that role `people.edit`, and nothing else. It is a named capability with a name and a reason, not
   a role editor.
3. **The grant rides on the session user.** `resolveSessionUser` reads the switch in the same query
   that resolves the user and sets `SessionUser.grants`. `can()` and `permissionsOf()` read the role's
   permissions plus `grants`. The switch applies on the next request, with no cache to invalidate.
   API keys resolve their owner the same way, and their `scopes` still only narrow what the owner
   holds.
4. **Only admins flip it**, from `/settings/directory/permissions`, guarded by `organisation.manage`.
5. **A credential holder's email is an access change.** The address is also the sign-in, so
   `updatePerson` moving it goes through `changeAccessEmail`. That path stays behind `people.manage`;
   a technician with `people.edit` who tries it gets the existing `email_locked` refusal. Otherwise
   editing a person would be an account takeover.

## Alternatives considered

- **Always give technicians `people.edit`.** Simplest, but not configurable; rejected because the
  request is that the organisation decides.
- **A role/permission matrix editable by admins.** General, but it reverses ADR 0007, needs a UI and a
  decision about which permissions may be lent, and is far larger than this need. This ADR does not
  close the door: the switch can grow into it.

## Consequences

- Adding a similar capability for another module repeats the pattern (a column, a grant, a section).
  If a third appears, revisit the matrix.
- The API-key scope checklist lists `people.edit`; a key narrows its owner's permissions as usual.
- Choosing the role of a new API key still reads the role table, not `grants`, so a technician cannot
  mint a key that outranks the role's own permissions.
