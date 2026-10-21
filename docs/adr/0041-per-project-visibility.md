# 0041. Per-project visibility: members-only projects

- **Status:** accepted
- **Date:** 2026-10-21

## Context

Until now every project was visible to everyone whose role could read projects
([ADR 0007](0007-roles-and-permissions.md)): technicians saw the whole organisation, employees the
tasks assigned to them. A project about a reorganisation, a dismissal or a tender cannot live in
that model (#58, #309).

## Decision

1. **A project has a visibility**: `organisation` (the default, and what every existing project
   becomes) or `members`. A members-only project, and its tasks, exist only for the people listed
   in `project_members` and for admins. Role rules still apply on top: a member employee sees
   what an employee sees.
2. **The scope is the single enforcement point.** `visibleProjects` and `visibleTasks` in
   `projects/scope.ts` carry the membership condition inside the same SQL predicate, so lists,
   records, the board, search, counters and the API pick it up without a change at their call
   sites. A record the viewer cannot see is `not_found`, never a 403 that would confirm it exists.
3. **Writes follow reads.** `lockProject` / `lockProjects` also require that the actor can see the
   project, so every write (project, task, attachment, move, assignment) fails as `*_not_found` on
   a project the actor cannot see. There is no second list of rules to keep in step.
4. **Owner and admins manage membership.** Changing visibility and adding or removing members is
   for the project's owner and for admins; a member who is neither gets `forbidden`. There are no
   per-project roles: a member's powers are their role's.
5. **Assignment never widens access.** Assigning a non-member fails with `not_a_member`; the way
   in is adding them as a member, a deliberate act of someone allowed to give access.
6. **Closing a project seeds its members** with the owner, the actor and everybody currently
   assigned to one of its tasks, each written as `project.member.added`, so that closing a project
   never locks out the people already doing its work. Opening it again keeps the rows.
7. **The owner is always a member** of a members-only project: creating one as `members` adds the
   owner and the creator, changing the owner adds the new one, and removing the owner is refused
   (`is_owner`). Removing a member with tasks asks for confirmation and unassigns them from all of
   them (`task.unassigned` each, then `project.member.removed` with the count).
8. **Notifications follow the record.** The producing domain hands `notify` an `audience` for a
   members-only project or one of its tasks, and `notify` drops every recipient who is neither in it
   nor an admin; `notifications` never reads `projects` tables to decide.
9. **An archived project is read-only for membership too.** Visibility and members cannot be
   changed until it is restored, like every other write.

## Alternatives rejected

- **Per-project roles** (viewer / editor / owner). It doubles the permission model for a need that
  is "who may know this exists". Roles stay global.
- **Filtering in each route or query.** About 30 call sites would each have to remember; one
  forgotten site is a leak. The predicate is composed once.
- **Letting assignment grant access.** Anyone able to assign would be able to widen access, and a
  mistaken click would expose a confidential project.
- **A 403 for a hidden project.** It confirms the project exists.

## Consequences

- Admins see every project, including those they are not a member of; there is no way to hide a
  project from an admin.
- Leaks through other domains (restricted link references, escalation targets, moving a task into
  a hidden project, counters) are closed separately in #310; the scope already covers the counters.
- Members rows are kept on a switch back to `organisation`, so the old list returns.
