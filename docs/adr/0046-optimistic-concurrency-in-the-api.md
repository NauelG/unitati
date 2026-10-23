# 0046. Optimistic concurrency in the API: `baseRevision`, not `ETag`

- **Status:** accepted
- **Date:** 2026-10-23

## Context

The knowledge base (ADR 0031) keeps every page as a chain of revisions, and the domain already
refuses a save whose author did not start from the current one: `stale_revision`, decided under
the page row lock. The REST API (ADR 0022) is the first caller outside the editor, and it has no
convention for concurrent writes. Without one, two clients that read the same page silently
overwrite each other.

HTTP offers `ETag` with `If-Match` and `412 Precondition Failed`. We chose not to use it.

## Decision

1. **A resource with revisions is written with a required `baseRevision` body field**: the
   revision number the client read. The domain compares it under the resource's lock.
2. **A mismatch is `409 stale_revision`** with `details: { revision, authorName, savedAt }`: the
   current revision, who saved it and when. Nothing is written, and the client decides whether to
   re-read and merge or to repeat the write on top.
3. **No `ETag`, `If-Match` or `412`.** The API carries everything in JSON, so the revision is
   already a field the client holds. An optional header would let a client that omits it
   overwrite others silently; a required body field cannot be forgotten.
4. A write whose content equals the current one writes no revision and answers `200` with the same
   `revision`, whatever the base: there is nothing to lose.
5. This applies to every future resource with revisions, with the same field name and error.

## Consequences

- A client reads, edits, and sends `baseRevision` back; on `409` it re-reads and retries.
- `PATCH` on a page without `baseRevision` is `400`: the omission is loud.
- Generic HTTP caches and tools that understand `If-Match` get nothing from this. The API answers
  `Cache-Control: no-store` anyway.
