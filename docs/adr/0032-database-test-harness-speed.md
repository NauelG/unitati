# 0032. The database test harness empties with DELETE and shares one module graph

- **Status:** accepted
- **Date:** 2026-10-19

## Context

`npm run test:db` runs every `*.db.spec.ts` against a real Postgres, one file at a time, emptying
every table before each test. It is the slowest step of CI and grew with the code: 58 files and
760 tests took around 105 s on a GitHub runner and 150 s or more on a laptop. Two costs had nothing
to do with what the tests prove:

- **`TRUNCATE` before every test.** Even on near-empty tables it costs about 80 ms, because it swaps
  the files of 30 tables and their indexes. No test could finish faster than 60 ms; across 760
  tests that was half the run. A `DELETE` of the same tables costs about 3 ms.
- **Re-importing the app for every file.** Vitest isolates each file in a fresh module graph by
  default, so the app was imported and set up 58 times: about a third of the run.

With those two gone, the WAL flush of every commit became the next largest cost.

## Decision

1. **Tables are emptied with `DELETE`, in one transaction, with
   `session_replication_role = replica`.** The foreign-key triggers are off for that transaction, so
   the deletes need no order and fire no cascades. Every table ends empty, so nothing dangles. This
   needs a superuser, which the compose and CI databases are.
   - It loses nothing against `TRUNCATE ... RESTART IDENTITY`. That clause only resets sequences a
     column owns, and none does: the tag sequences are standalone and were never reset.
     `tables.db.spec.ts` fails the day a column owns one.
   - It still commits, so deferred constraints and the activity `CHECK` (ADR 0009) are still
     exercised. That is why a rolled-back transaction stays rejected.
2. **The `db` Vitest project runs with `isolate: false`.** Files share one module graph. The harness
   (`src/lib/server/db/testing/setup.ts`) resets, before every test, the state a module keeps for
   the life of the process: the brand cache, the event subscriptions and the dispatch mode. A
   module that adds process-wide state must add its reset there. The rate limiter needs none,
   because it is keyed by API key and every test creates its own.
3. **The test database runs with `synchronous_commit = off`**, set on the database by the global
   setup. A crash can lose the last commits but cannot corrupt anything, and the data is worthless.

Files still run one at a time (`fileParallelism: false`) and in random order (`shuffle`).

## Consequences

- On a laptop, the suite went from about 150–190 s to about 30 s; CI gains in proportion.
- **Physical row order is no longer insertion order.** `TRUNCATE` gave every test fresh files, so a
  query without `order by` happened to return rows in the order they were written. After `DELETE`
  and vacuum, Postgres reuses free space and that no longer holds, just as in production. A test
  that reads "the last row" must order explicitly. The first one found was fixed in the same
  change; others surface as order failures and are fixed the same way.
- A test can see module state left by another file if a new piece of process-wide state is not
  reset in the harness. The random order is what exposes it.
