# 0001. Stack and architecture

- **Status:** accepted
- **Date:** 2026-10-06

## Context

Unitati combines three domains (assets, service desk, projects) in one self-hosted application. The author already maintains SvelteKit applications (`renyst`, `mod-minihub`), so reusing that stack lowers the learning cost and lets tooling, skills and conventions be shared.

## Decision

A **modular monolith** in **SvelteKit**, deployed as one Node container plus Postgres.

| Concern            | Choice                                      | Status            |
| ------------------ | ------------------------------------------- | ----------------- |
| Framework          | SvelteKit 3, Svelte 5 (runes), TypeScript 6 | installed         |
| Build              | Vite 8, `@sveltejs/adapter-node`            | installed         |
| Styling            | Tailwind CSS 4 (`@tailwindcss/vite`)        | installed         |
| Database           | PostgreSQL 17 via `compose.yaml`            | installed         |
| ORM                | Drizzle ORM + `postgres` (postgres.js)      | installed         |
| Lint / format      | ESLint 10 + Prettier 3                      | installed         |
| Module boundaries  | dependency-cruiser (ADR 0048)               | installed         |
| Unit tests         | Vitest 4                                    | installed         |
| UI components      | shadcn-svelte + bits-ui                     | planned (slice 1) |
| Auth               | better-auth                                 | planned (slice 1) |
| Validation / forms | zod 4 + sveltekit-superforms                | planned (slice 1) |
| i18n               | Paraglide                                   | planned (P1)      |
| E2E tests          | Playwright                                  | planned           |
| Background jobs    | pg-boss (queue on Postgres, no Redis)       | planned (slice 8) |
| Search             | Postgres full-text search                   | planned (slice 7) |

The planned items follow `renyst` (Postgres, Drizzle, better-auth, shadcn-svelte, superforms, Paraglide). They are added when their slice starts, not before.

### Alternatives considered

- **React Router 7 / Next.js:** large ecosystem and Shelf uses Remix, but it is a second stack to maintain alongside the existing Svelte apps.
- **SQLite (as in mod-minihub):** simpler to operate, but full-text search, concurrent technicians and cross-domain referential integrity are more comfortable on Postgres.
- **Prisma:** more mature, but Drizzle keeps SQL explicit and matches `renyst`.
- **Separate API + SPA:** better client/server separation, but twice the deployment surface for a single-team product.

## Consequences

- One language, one deploy, one database.
- SvelteKit config lives inline in `vite.config.ts` (the `sv` default, as in `renyst`).
- The app is served at the root of its origin, with no `kit.paths.base` ([ADR 0014](0014-served-at-the-root-of-the-origin.md)).
- Domain boundaries are enforced by convention ([ADR 0002](0002-server-modules-by-domain.md)), not by packages. If a domain ever needs to be extracted, its folder is already the unit to move.
