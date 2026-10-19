# 0034. CSV import is stateless, all or nothing, and drives the domains through one transaction

- **Status:** accepted
- **Date:** 2026-10-19

## Context

Organisations arrive with their people and assets in spreadsheets (#21). Entering them one by one
is the main obstacle to adopting the product. An import crosses domains: a person needs a
department and a location, an asset needs a model, a location and a custodian. It must be safe to
repeat, must not leave half a file behind, and must not open a second way to write records that
bypasses what each domain already enforces and records.

## Decision

1. **Any CSV, through a column-mapping step.** The mapping is pre-filled from header aliases
   (English and Spanish, accents and case ignored). A column can also be replaced by a fixed value.
2. **Stateless flow, re-validated on confirm.** The browser keeps the file and resends it with the
   mapping on every step (`analyse`, `preview`, `commit`). The server stores nothing between steps:
   no upload table, no session, no temporary file. `commit` plans again inside its transaction, so
   what is written is what is true at that moment, not what the preview saw. A row that became a
   duplicate between preview and confirm is skipped, like any existing email.
3. **All or nothing.** If the plan has any error, nothing is written, catalogue values included.
   The errors are returned grouped by kind (count and first five rows) and as a table of the first
   200 in row order. Rows are numbered as in a spreadsheet: the header is row 1.
4. **Create only.** An existing email is skipped, not updated and not an error, so the same file can
   be imported again. A repeated email inside the file is an error on every occurrence after the
   first.
5. **Visible catalogue creation, exact matching.** A department or location that does not exist is
   created, and the preview lists it first. Names match by trimmed, lower-cased, accent-free
   comparison. A location is resolved by code, then by full path (`›` or `/`), then by a name that
   exactly one location carries; a name carried by several is an error (`location_ambiguous`), and
   anything else creates the missing tail of the chain under the deepest existing ancestor. The same
   new path in many rows is created once. Fuzzy matching was rejected: a typo would silently attach
   people to the wrong place.
6. **People are identified by email.** Name is never an identity for creation. Creating people, and
   the departments and locations they need, requires `people.manage`.
7. **One transaction across domains: the `executor`.** `imports/` is an orchestration module that
   owns no tables (ADR 0002) and calls only exported functions of the domains. Those functions take
   an optional trailing `WriteOptions = { executor?, via? }` and run as
   `(options.executor ?? getDb()).transaction(...)`. Called with the import's transaction, Drizzle
   opens a **savepoint**: a unique violation the function catches rolls back only itself, and the
   import's transaction stays usable, which in Postgres it would not after a failed statement.
   Rejected alternatives: compensation (deleting what was created when a later row fails) leaves
   activity and ids behind and fails halfway; two transactions (catalogues, then people) break "all
   or nothing"; events (ADR 0024) are post-commit by design, so a failure could not undo anything.
8. **No batch table.** Records created by an import are ordinary records. Their activity says so:
   `person.created` carries `via: 'import'` and `person.location.changed` has
   `reason: 'imported'`. Nothing groups an import's records afterwards, and there is no undo.
9. **Limits.** 5 MB and 5,000 rows, enforced on the server by `parseCsv` and checked on the client
   before uploading. `adapter-node` rejects bodies above `BODY_SIZE_LIMIT` (512K by default) before
   any of this runs, so the image sets `BODY_SIZE_LIMIT=6M`: the 5 MB file plus multipart overhead.
   Lowering it breaks imports and logo uploads.
10. **Encoding and delimiter.** UTF-8 first, Windows-1252 if the bytes are not valid UTF-8 (what
    Excel writes on Windows). A BOM is stripped. The delimiter is `;` if the first line has more of
    them than `,` outside quotes.

## Consequences

- A new importable record type is a field list, a planner and a commit built from the same
  domain functions; the CSV, mapping and location logic are shared.
- The domain functions gain an optional parameter, not a second code path: without it they behave
  exactly as before.
- `no-restricted-imports` forbids `src/lib/server/imports/` from importing any module's `schema`.
- JavaScript is required for the screen, as for the other dialogs.
- Large files are read into memory once per step. The limits keep that bounded.
