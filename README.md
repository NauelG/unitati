<p align="center">
  <strong>unitati</strong><br />
  Projects, service desk and IT asset management for internal IT teams, on one data model.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.1.2-2563eb" alt="Version 0.1.2" />
  <img src="https://img.shields.io/badge/status-evaluation-f59e0b" alt="Status: evaluation" />
  <img src="https://img.shields.io/badge/SvelteKit-3-FF3E00?logo=svelte&logoColor=white" alt="SvelteKit 3" />
  <img src="https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte&logoColor=white" alt="Svelte 5" />
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript strict" />
  <img src="https://img.shields.io/badge/Tailwind-4-38B2AC?logo=tailwindcss&logoColor=white" alt="Tailwind CSS 4" />
  <img src="https://img.shields.io/badge/Postgres-Drizzle-4169E1?logo=postgresql&logoColor=white" alt="Postgres + Drizzle" />
  <img src="https://img.shields.io/badge/tests-Vitest-6E9F18?logo=vitest&logoColor=white" alt="Vitest" />
  <img src="https://img.shields.io/badge/Node-24-339933?logo=nodedotjs&logoColor=white" alt="Node 24" />
  <img src="https://img.shields.io/badge/semver-2.0.0-blue" alt="SemVer" />
  <img src="https://img.shields.io/badge/license-TBD-lightgrey" alt="License: to be decided" />
</p>

---

## What is unitati?

Internal IT teams usually run three separate tools: one for **projects** (e.g. Leantime), one for **tickets** (e.g. OpenSupports) and one for **assets** (e.g. Snipe-IT, Shelf). The real cost is not three tabs. It is **disconnected data**:

1. **Three directories.** The same people exist three times, with three logins and three permission models.
2. **No context.** A ticket doesn't know which laptop it is about, and the laptop doesn't know its incident history.
3. **No continuity.** A hardware refresh is planned in one tool, while the assets it replaces live in another. There is no shared search or cross-cutting report.

unitati puts the three areas on **one data model**, where the relations are the product:

| Relation                 | Example                                                                   |
| ------------------------ | ------------------------------------------------------------------------- |
| Ticket ↔ Asset           | "Laptop won't boot" is linked to `LT-0142`; the laptop shows the ticket   |
| Asset → incident history | `LT-0142` has had 4 tickets in 6 months, so it is a replacement candidate |
| Ticket → Task            | A recurring issue becomes a task in the "Wi-Fi upgrade" project           |
| Project → Assets         | "2027 laptop refresh" targets every asset of model X older than 4 years   |
| Person → everything      | One profile: assigned devices, open tickets, tasks owned                  |

Suites that already unify these exist, but they are commercial SaaS or carry dated, admin-heavy UX. See [alternatives](docs/alternatives.md).

## Status

**Evaluation phase (v0.1.0).** Docs and scaffold only, with no product features yet. Already in place:

- Product docs: [vision](docs/vision.md), [alternatives](docs/alternatives.md), [domain model](docs/domain-model.md), [MVP scope](docs/mvp-scope.md).
- Scaffold: SvelteKit + Postgres/Drizzle, domain folders, a placeholder login screen and app shell, both showing the running version.
- Versioning policy, with its CI gate.

Next: MVP slice 1, which covers auth, the people directory and the app shell. See [MVP scope](docs/mvp-scope.md).

## Architecture

Decisions are recorded one per file in [`docs/adr/`](docs/adr/):

- **One SvelteKit app, modular monolith** ([ADR 0001](docs/adr/0001-stack-and-architecture.md)). One Node container plus Postgres.
- **Server code by business domain** ([ADR 0002](docs/adr/0002-server-modules-by-domain.md)): `directory`, `assets`, `service-desk`, `projects` and `links`.
  - Routes never query the database.
  - Domains never import each other's tables; cross-domain relations go through `links`.
- **SemVer with a visible version** ([ADR 0003](docs/adr/0003-semver-and-changelog.md)).

```
src/
  routes/
    (app)/            authenticated app (shell shows the version)
    (auth)/login/     login screen (shows the version)
  lib/
    version.ts        running version, injected at build time
    components/       shared UI components
    server/
      directory/      people, teams, departments, locations
      assets/         IT asset management
      service-desk/   tickets, queues, comments
      projects/       projects, milestones, tasks, boards
      links/          typed cross-domain relations
      db/             connection + aggregated Drizzle schema
      shared/         pure helpers (Outcome type)
```

## Versioning

unitati follows [Semantic Versioning](https://semver.org/). Pre-1.0, features bump the minor version and fixes bump the patch.

- Every pull request that ships app behaviour bumps the version in `package.json`.
- The same PR adds a dated entry to [`CHANGELOG.md`](CHANGELOG.md) ([Keep a Changelog](https://keepachangelog.com/en/1.1.0/)) and updates the version badge above.
- CI enforces this with [`scripts/check-version-bump.mjs`](scripts/check-version-bump.mjs). Releases are tagged `vX.Y.Z`.

The running version is shown **in the app shell and on the login screen**, so every environment identifies the exact build it runs. It is also served at `/_app/version.json`.

## Documentation

| Location                                                               | Contents                                                       |
| ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| [`docs/vision.md`](docs/vision.md)                                     | Problem, target user, value proposition, principles, non-goals |
| [`docs/alternatives.md`](docs/alternatives.md)                         | Market map of existing suites and where the gap is             |
| [`docs/domain-model.md`](docs/domain-model.md)                         | Domains, entities, cross-domain relations and flows            |
| [`docs/roadmap-v1.md`](docs/roadmap-v1.md)                             | Every capability classified: MVP, v1, post-v1, discarded       |
| [`docs/mvp-scope.md`](docs/mvp-scope.md)                               | The minimum subset: vertical slices and the exit criterion     |
| [`docs/design/`](docs/design/)                                         | Exported design system: tokens, components, layouts            |
| [`docs/decision-internal-vs-oss.md`](docs/decision-internal-vs-oss.md) | Open decision: internal tool vs open source, license           |
| [`docs/adr/`](docs/adr/)                                               | Architecture decision records                                  |
| [`CHANGELOG.md`](CHANGELOG.md)                                         | Release history                                                |
| [`AGENTS.md`](AGENTS.md)                                               | Conventions for AI coding agents                               |

## Stack

- [SvelteKit 3](https://svelte.dev/docs/kit) + [Svelte 5](https://svelte.dev/) (runes) + TypeScript (strict), `adapter-node`
- [Tailwind CSS 4](https://tailwindcss.com/)
- [PostgreSQL 17](https://www.postgresql.org/) + [Drizzle ORM](https://orm.drizzle.team/) (postgres.js driver)
- [Vite 8](https://vite.dev/), [Vitest 4](https://vitest.dev/)
- ESLint + Prettier

Planned, added with their slices: [shadcn-svelte](https://shadcn-svelte.com/), [Better Auth](https://better-auth.com/), zod + sveltekit-superforms, Paraglide (i18n), Playwright, pg-boss. See [ADR 0001](docs/adr/0001-stack-and-architecture.md).

## Development

Requires **Node 24** (see `.nvmrc`) and **Docker with the Compose v2 plugin**. The `db:*` scripts call `docker compose` (a Docker subcommand), not the standalone `docker-compose` v1, which reached end of life in July 2023. On Debian or Ubuntu, install it with `apt install docker-compose-plugin`; verify with `docker compose version`.

```sh
npm install
cp .env.example .env

npm run db:start     # Postgres 17 in Docker (waits until healthy)
npm run db:stop      # stop it

npm run dev          # dev server on http://localhost:5173
npm run dev -- --open

npm run check        # type-check (svelte-check)
npm run lint         # prettier + eslint
npm run format       # prettier --write
npm test             # unit tests once
npm run test:unit    # vitest in watch mode

npm run db:generate  # drizzle migrations from the schema
npm run db:migrate   # apply migrations
npm run db:push      # push schema directly (prototyping only)
npm run db:studio    # drizzle studio

npm run build        # production build
npm run preview      # preview the production build

npm run check:version-bump   # versioning gate (BASE_REF=origin/main by default)
```

The login screen is at [`/login`](http://localhost:5173/login). It is a placeholder until auth lands.

## Contributing

- [Conventional Commits](https://www.conventionalcommits.org/).
- One pull request per change. It bumps the version and updates `CHANGELOG.md` and the README badge (see [Versioning](#versioning)).
- Before opening a PR: `npm run check && npm run lint && npm test`.
- Architectural decisions go in a new `docs/adr/NNNN-title.md`.

## License

To be decided before the first public release (AGPLv3 vs MIT). See [internal vs open source](docs/decision-internal-vs-oss.md).
