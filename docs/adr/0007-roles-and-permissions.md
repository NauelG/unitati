# 0007. Fixed roles over granular permissions

- **Status:** accepted
- **Date:** 2026-10-06
- **Amended:** 2026-10-14 — employees see their assigned tasks. See
  [Amendment](#amendment-2026-10-14-employees-see-their-assigned-tasks).

## Context

[MVP scope](../mvp-scope.md) names three roles — admin, technician, employee — and states no
rules, which leaves the question that actually matters unanswered: what does an employee see?

The references diverge. Snipe-IT uses fine-grained `entity.action` permissions
(`assets.view`, `assets.checkout`, `assets.audit`, `assets.files`). Shelf.nu uses four closed
roles (`OWNER`, `ADMIN`, `BASE`, `SELF_SERVICE`). The configurability rule in the
[roadmap](../roadmap-v1.md) already rules out user-authored roles: that is structure, not
catalogue.

## Decision

Granular permissions in code, grouped into roles the product owns.

- Permissions take the form `entity.action` and are the only thing authorisation checks test.
- Roles are product constants: `admin`, `technician`, `employee`.
- Users never create or edit roles in v1.

Rules for `employee`, the role that needs defining:

| Can                                                                              | Cannot                                          |
| -------------------------------------------------------------------------------- | ----------------------------------------------- |
| Open tickets and see **their own**                                               | See anyone else's, including their department's |
| Read **public** comments on their tickets                                        | See internal comments, ever                     |
| See the assets **in their custody**                                              | See the general inventory, or who holds what    |
| See name and location of assets marked **shared**                                | See cost, purchase or history of those assets   |
| See the **tasks assigned to them** and the projects that contain them, read-only | See any other task, or change anything          |

The fourth row exists because of a case that breaks the product without it: an employee
reporting a fault on the floor printer, which is in nobody's custody. Without minimum read
access they cannot find it, cannot link it, and the ticket ↔ asset relation — the
differentiator — fails for every shared asset. Minimum read is name and location only.

## Consequences

- Authorisation reads as a capability (`assets.view`), not as a role comparison
  (`if role === 'admin'`). Changing what a role can do is one table, not a search across the
  codebase.
- Internal precision without external configurability: the pieces for user-defined roles
  exist, and the product keeps the decision.
- `employee` is deliberately the narrowest role. Widening it later is a product decision;
  narrowing it after people have grown used to seeing things is a regression.
- Shared assets need an explicit marker on the asset. That flag is part of the asset model
  from the MVP, not a later addition.
- Every permission check is scoped by organisation as well ([ADR 0004](0004-tenancy.md)).

## Amendment 2026-10-14: employees see their assigned tasks

The employee row "Cannot — see projects at all" is replaced by "Can — see the tasks assigned to
them and the projects that contain them, read-only. Cannot — see any other task, or change
anything" (#121, under #10). The permission is `projects.view.assigned`, granted to `employee`;
`technician` keeps `projects.view` and `projects.manage`.

**Why.** It is the `tickets.view.own` shape: an employee is on the hook for a piece of work
(somebody put them on a task), and a role that cannot see the work it was assigned is a role that
has to be told about it somewhere else. The rule stays a row filter in the domain
(`projects/scope.ts`), not a second set of screens. An employee without a directory record holds
the permission but is assigned nothing, so they see nothing — never every unassigned task.

**What it does not do.** There is no per-project membership: seeing a project because one of its
tasks is yours is derived, not granted, and the employee gets no view of the project's other tasks
or of who else works on it beyond the assignees of tasks they can see. Membership is #58.
