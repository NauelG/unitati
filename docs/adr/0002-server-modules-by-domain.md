# 0002. Server code organised by business domain

- **Status:** accepted
- **Date:** 2026-10-06

## Context

Unitati has three product areas that, in existing tools, live in three applications. Putting them in one codebase brings back the old risk: one big `db.ts` where every domain reaches into every other domain's tables.

## Decision

Server code lives in `src/lib/server/<domain>/`, and each folder is named after a business concept:

| Folder          | Owns                                                         |
| --------------- | ------------------------------------------------------------ |
| `directory/`    | organisations, people, teams, departments, locations         |
| `assets/`       | assets, models, categories, assignments                      |
| `service-desk/` | tickets, queues, comments                                    |
| `projects/`     | projects, milestones, tasks, boards                          |
| `links/`        | typed cross-domain relations (see `docs/domain-model.md`)    |
| `auth/`         | credentials, sessions, guards (infrastructure, not a domain) |
| `access/`       | the permission table (ADR 0007)                              |
| `db/`           | connection and the aggregated Drizzle schema                 |
| `shared/`       | pure helpers with no domain knowledge                        |

`auth/` and `access/` are infrastructure in the same sense as `db/`: they carry no business
concept of their own. A credential is not a person — `directory` owns who people are, `auth`
owns whether they can sign in.

Each domain owns its tables in `<domain>/schema.ts`; `db/schema.ts` only re-exports them.

Rules:

1. **Routes never query the database.** They validate input, call a domain function and map the result to HTTP (`fail`, `redirect`).
2. **Domain functions return outcomes, not HTTP.** Expected business failures are typed results (`shared/outcome.ts`). Exceptions are only for invariant violations.
3. **Domains never import each other's tables.** `assets`, `service-desk` and `projects` reuse each other's rules only through exported functions, and relate records through `links`. Every domain may depend on `directory`.
4. **Specs live next to their module.**

## Consequences

- The folder tree shows what the application does.
- A cross-domain feature (ticket ↔ asset) touches `links` plus the two domains' public functions, never their tables.
- If two domains start importing each other heavily, that suggests the boundary is wrong.
