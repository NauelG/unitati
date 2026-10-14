<p align="center">
  <picture>
    <source
      media="(prefers-color-scheme: dark)"
      srcset="docs/design/assets/brand/unitati-lockup-inverse.svg"
    />
    <img src="docs/design/assets/brand/unitati-lockup.svg" alt="Unitati" width="340" />
  </picture>
</p>

<p align="center">
  Projects, service desk and IT asset management for internal IT teams, on one data model.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.37.0-1d5cf0" alt="Version 0.37.0" />
  <img src="https://img.shields.io/badge/status-evaluation-f59e0b" alt="Status: evaluation" />
  <img src="https://img.shields.io/badge/license-TBD-lightgrey" alt="License: to be decided" />
</p>

---

## What is Unitati?

Internal IT teams usually run three separate tools: one for **projects** (e.g. Leantime), one for **tickets** (e.g. OpenSupports) and one for **assets** (e.g. Snipe-IT, Shelf). The real cost is not three tabs. It is **disconnected data**:

1. **Three directories.** The same people exist three times, with three logins and three permission models.
2. **No context.** A ticket doesn't know which laptop it is about, and the laptop doesn't know its incident history.
3. **No continuity.** A hardware refresh is planned in one tool, while the assets it replaces live in another. There is no shared search or cross-cutting report.

Unitati puts the three areas on **one data model**, where the relations are the product:

| Relation                 | Example                                                                   |
| ------------------------ | ------------------------------------------------------------------------- |
| Ticket ↔ Asset           | "Laptop won't boot" is linked to `LT-0142`; the laptop shows the ticket   |
| Asset → incident history | `LT-0142` has had 4 tickets in 6 months, so it is a replacement candidate |
| Ticket → Task            | A recurring issue becomes a task in the "Wi-Fi upgrade" project           |
| Project → Assets         | "2027 laptop refresh" targets every asset of model X older than 4 years   |
| Person → everything      | One profile: assigned devices, open tickets, tasks owned                  |

Suites that already unify these exist, but they are commercial SaaS or carry dated, admin-heavy UX. See [alternatives](docs/alternatives.md).

## Status

**Evaluation phase.** Slices 1 and 2 of 8 have shipped: the app runs, you can sign in, and the inventory half of the product works. In place:

- **Setup and authentication.** An empty installation sends every route to `/setup`, which creates the organisation and the first administrator in one transaction. Email and password through Better Auth ([ADR 0006](docs/adr/0006-email-and-password-authentication.md)); the session resolves once per request and route groups guard the rest.
- **People directory.** `organisation`, `person`, `department`, `location` and `team`. A person exists without a credential, so equipment can be held by someone who never signs in.
- **Roles and scoping.** Fixed roles with granular permissions ([ADR 0007](docs/adr/0007-roles-and-permissions.md)): a denial answers 404 rather than 403, so refusing does not confirm that a record exists. Every aggregate root carries `organisation_id`, and all access is scoped by it ([ADR 0004](docs/adr/0004-tenancy.md)).
- **App shell** built on the design-system tokens, one colour per domain, navigation filtered by permission. Spanish interface through Paraglide ([ADR 0008](docs/adr/0008-ui-language.md)).
- **Inventory.** Register, edit, search and page through assets; assign custody and take it back; change state and location; keep a timeline of everything that happened to a machine ([ADR 0009](docs/adr/0009-activity-log.md)). Manufacturers, categories and models are maintained in the app. An employee sees their own equipment in full and **name, tag and location only** for shared equipment — in the payload sent to the browser, not merely in the markup.
- Product docs, the [design system](docs/design/README.md), and the versioning policy with its CI gate.

Not built yet: service desk, projects, and the links between them. Those three folders under `src/lib/server/` hold a README and nothing else.

Next: slice 3, the service desk. The eight slices and the exit criterion that defines "done" are in [MVP scope](docs/mvp-scope.md).

## Architecture

Decisions are recorded one per file in [`docs/adr/`](docs/adr/):

- **One SvelteKit app, modular monolith** ([ADR 0001](docs/adr/0001-stack-and-architecture.md)). One Node container plus Postgres.
- **Server code by business domain** ([ADR 0002](docs/adr/0002-server-modules-by-domain.md)): `directory`, `assets`, `service-desk`, `projects` and `links`.
  - Routes never query the database.
  - Domains never import each other's tables; cross-domain relations go through `links`.
- **SemVer with a visible version** ([ADR 0003](docs/adr/0003-semver-and-changelog.md)).

```
src/
  hooks.server.ts     resolves the session once per request
  routes/
    (app)/            authenticated app (shell shows the version)
      directory/      people index
      assets/         inventory: list, register, detail, edit, catalogue
    (auth)/
      setup/          first run: organisation + first administrator
      login/          login screen (shows the version)
    sign-out/
  lib/
    version.ts        running version, injected at build time
    components/       shared UI components (Button, Field, AppVersion)
    paraglide/        generated from messages/, not committed
    server/
      auth/           Better Auth wiring, guards, provisioning
      access/         role and permission checks
      directory/      people, teams, departments, locations
      assets/         inventory, custody, catalogue
      activity/       the history every domain writes to
      seed/           development seed (npm run db:seed)
      service-desk/   tickets, queues, comments, mail, uploads
      projects/       projects, milestones, tasks    — stub
      links/          typed cross-domain relations   — stub
      db/             connection + aggregated Drizzle schema
      shared/         pure helpers (Outcome type, shared columns)
```

## Versioning

Unitati follows [Semantic Versioning](https://semver.org/). Pre-1.0, features bump the minor version and fixes bump the patch.

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
| [`docs/design/`](docs/design/README.md)                                | Design system: tokens, brand assets, components, layouts       |
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
cp .env.example .env   # then set BETTER_AUTH_SECRET: openssl rand -base64 32

npm run db:start     # Postgres 17 in Docker (waits until healthy)
npm run db:migrate   # create the schema
npm run db:seed      # 200 assets, people, history and a few tickets; prints demo logins (localhost only)
npm run db:stop      # stop it

# Outbound mail is optional. To see it locally: docker compose up -d mailpit, set
# SMTP_HOST=localhost and SMTP_PORT=1025 in .env, read it at http://localhost:8025

npm run dev          # dev server on http://localhost:5173
npm run dev -- --open

npm run check        # type-check (svelte-check)
npm run lint         # prettier + eslint
npm run format       # prettier --write
npm test             # unit tests once (no database, no Docker needed)
npm run test:unit    # vitest in watch mode
npm run test:db      # tests against Postgres; needs db:start
npm run test:db:watch # the same, in watch mode

npm run db:generate  # drizzle migrations from the schema
npm run db:migrate   # apply migrations
npm run db:push      # push schema directly (prototyping only)
npm run db:studio    # drizzle studio

npm run build        # production build
npm run preview      # preview the production build

npm run check:version-bump   # versioning gate (BASE_REF=origin/main by default)
```

An empty installation sends every route to [`/setup`](http://localhost:5173/setup), which creates
the organisation and the first administrator. After that, [`/login`](http://localhost:5173/login).

### Environment

| Variable             | Required      | Purpose                                            |
| -------------------- | ------------- | -------------------------------------------------- |
| `DATABASE_URL`       | to run        | Postgres connection string                         |
| `BETTER_AUTH_SECRET` | to run        | Signs session cookies and tokens                   |
| `BETTER_AUTH_URL`    | in production | Public origin; defaults to `http://localhost:5173` |

None of them is needed to `build`: building analyses the app without opening a connection
(see `src/env.ts`).

`npm run test:db` reads its own `DATABASE_URL` from the committed `.env.test`, which points at
`unitati_test`. A `DATABASE_URL` exported in your shell overrides that file, so the harness
refuses any database whose name does not end in `_test` — it truncates every table between
tests and will not do that to yours.

### Environments

Three environments, **one artefact**: no origin and no base path are baked into the build, so a
single `npm run build` output runs in all of them. See
[ADR 0012](docs/adr/0012-environments-and-real-verification.md).

| Environment    | Origin                                                   | Database          | Artefact                  |
| -------------- | -------------------------------------------------------- | ----------------- | ------------------------- |
| **dev**        | `http://localhost:5173`                                  | `unitati`         | `vite dev`                |
| **staging**    | `https://talos.nutria-pirate.ts.net:8443` (tailnet only) | `unitati_staging` | the production build      |
| **production** | does not exist yet                                       | —                 | the container of ADR 0001 |

**A pull request's _Guia de verificació en real_ is executed against staging**, because dev mode
does not run the production build and cannot reach the paths that only exist there — secure
cookies being the first of them.

Staging updates itself: `unitati-staging-update.timer` polls `origin/main` every five minutes and
deploys it **only when CI for that exact commit is green**. Without that gate a broken push would
deploy itself minutes later and take staging down with nobody having touched anything. To deploy
by hand, or to deploy something other than `main`:

```sh
~/staging/repo/scripts/staging-deploy.sh                # deploys origin/main
~/staging/repo/scripts/staging-deploy.sh feat/x         # deploys a branch
DRY_RUN=1 ~/staging/repo/scripts/staging-autodeploy.sh  # what would the timer do?
```

The script deploys a ref of `origin`, never a working tree, so staging proves that what was
pushed works. It builds into `releases/<timestamp>-<sha>`, swaps an atomic symlink, restarts the
systemd user unit and health-checks the result; a failed check reverts the symlink to the release
that was serving. Migrations are **not** reverted — they are forward-only.

```sh
systemctl --user list-timers unitati-staging-update.timer
journalctl --user -u unitati-staging-update -n 50
journalctl --user -u unitati-staging -f
```

### Deploying

`node --env-file=.env build` serves on port 3000. Behind a reverse proxy, adapter-node must be
told its public origin or **every form submission is rejected** as cross-site: set
`PROTOCOL_HEADER=x-forwarded-proto` and `HOST_HEADER=x-forwarded-host`. The `ORIGIN` variable
of earlier versions no longer exists in adapter-node 6.

Unitati is served at the **root of its origin**: `kit.paths.base` stays empty. A deployment that
needs isolation gets its own hostname, port or Tailscale Service, never a subpath — see
[ADR 0014](docs/adr/0014-served-at-the-root-of-the-origin.md).

## Contributing

- [Conventional Commits](https://www.conventionalcommits.org/).
- One pull request per change. It bumps the version and updates `CHANGELOG.md` and the README badge (see [Versioning](#versioning)).
- Before opening a PR: `npm run check && npm run lint && npm test`, plus `npm run db:start && npm run test:db` when the change touches the database.
- Architectural decisions go in a new `docs/adr/NNNN-title.md`.

## License

To be decided before the first public release (AGPLv3 vs MIT). See [internal vs open source](docs/decision-internal-vs-oss.md).
