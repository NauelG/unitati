# directory

People, teams, departments, locations and the organisation's brand, name and colour (`getBrand`, `updateBranding`). The single directory every other domain points to: a ticket requester, an asset assignee and a task owner are all the same `Person`.

## Departments

`departments.ts` owns the catalogue behind `/settings/directory/departments`.

- `listDepartments(organisationId)` returns `{ id, name, peopleCount }`, by name, from one grouped query.
- `createDepartment`, `renameDepartment` and `deleteDepartment` return an `Outcome`. Renaming to the same name succeeds without writing. Deleting answers `{ kind: 'in_use', people }` while anyone is in the department: `people.department_id` is `set null`, so the database would not refuse, and the check lives in the `DELETE` itself.
- `departmentInput` is the Zod schema: the name trimmed, 1-80 characters.

## Locations

`locations.ts` owns the tree ([ADR 0027](../../../../docs/adr/0027-locations-hierarchy-coordinates-and-deletion.md)).

- `listLocations(organisationId)` returns every location with its `path`, `depth` and coordinates, tree-ordered, in one recursive query.
- `locationPaths(organisationId, ids)` is the only other place the path recursion lives: `assets` calls it instead of re-implementing it.
- `createLocation`, `updateLocation` and `deleteLocation` return an `Outcome`. Updating a parent locks the organisation row first and answers `cycle` for a loop; deleting answers `in_use` while children or assets remain. A person that points at the location is cleared, not blocking.
- `countLocationChildren(organisationId, id)` backs the `in_use` message.
- `locationInput` (`validation.ts`) is the one Zod schema, shared by the Settings route and the API: trimmed text, blank becomes `null`, coordinates both-or-neither, comma accepted as decimal separator.
