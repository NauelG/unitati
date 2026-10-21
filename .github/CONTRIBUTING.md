# Contributing to Unitati

Thanks for considering a contribution. The [README](../README.md) introduces the product;
this file covers development, architecture, releases and the DCO.

## Architecture

Unitati is a modular monolith: one SvelteKit application (Svelte 5, TypeScript, Tailwind CSS 4)
and PostgreSQL 17 with Drizzle ORM. Vite builds it; Vitest checks the domains and components.
See [ADR 0001](../docs/adr/0001-stack-and-architecture.md) for the stack and
[ADR 0002](../docs/adr/0002-server-modules-by-domain.md) for the boundaries.

Server code is organised by business domain in `src/lib/server/`: `directory`, `assets`,
`service-desk`, `projects` and `links`. Routes in `src/routes/` never query the database;
domains do not import one another's tables. The `links` domain owns cross-domain relations.
The domain vocabulary lives in [`docs/domain-model.md`](../docs/domain-model.md), and decisions
in [`docs/adr/`](../docs/adr/). The component gallery is at `/dev/components` in non-production
environments, with its tokens and assets documented in [`docs/design/`](../docs/design/README.md).

```text
src/
  hooks.server.ts      resolves the session once per request
  routes/
    (app)/             staff app: directory, assets, service desk, projects, settings
    (portal)/          employee portal
    (auth)/            setup and login
    api/v1/            versioned API
  lib/
    components/        shared UI components, including AppVersion
    server/            domain modules, auth, access, activity, notifications and db
    version.ts         build-time version and source URL
```

The repository is deployment-agnostic: one container image runs in every environment, configured
through environment variables ([ADR 0025](../docs/adr/0025-deployment-agnostic.md)). Operational
details, reverse proxy headers and migrations are in the [self-hosting guide](../docs/self-hosting.md).

## Development

Requires Node 24 (`.nvmrc`) and Docker with Compose v2, either as `docker compose` or the
standalone `docker-compose` binary. The `db:*` scripts resolve whichever command is installed.

```sh
npm ci
cp .env.example .env   # set BETTER_AUTH_SECRET (openssl rand -base64 32)
npm run db:start        # Postgres in Docker; waits until it is healthy
npm run db:migrate      # apply the schema
npm run db:seed         # local demo data; prints demo logins (localhost only)
npm run dev             # http://localhost:5173
```

An empty installation sends every route to `/setup`, where you create the organisation and its
first administrator; after that, use `/login`. The seed creates 200 assets, people, tickets and
projects for local exploration. For outbound mail, run `npm run mail:start`, set
`SMTP_HOST=localhost` and `SMTP_PORT=1025` in `.env`, and open Mailpit at
<http://localhost:8025>.

| Command                                      | Purpose                                                         |
| -------------------------------------------- | --------------------------------------------------------------- |
| `npm run check`                              | Type-check with svelte-check                                    |
| `npm run lint` / `npm run format`            | Check formatting and lint / write formatting                    |
| `npm test`                                   | Run unit and component tests once (no database needed)          |
| `npm run test:unit`                          | Watch unit and component tests                                  |
| `npm run test:db` / `npm run test:db:watch`  | Run database tests / watch them; needs `db:start`               |
| `npm run db:generate` / `npm run db:migrate` | Generate and apply Drizzle migrations                           |
| `npm run db:push`                            | Push a schema directly for prototyping only                     |
| `npm run db:studio`                          | Open Drizzle Studio                                             |
| `npm run db:stop`                            | Stop the development database                                   |
| `npm run build` / `npm run preview`          | Build / preview the production output                           |
| `npm run check:version-bump`                 | Run the release policy gate (`BASE_REF=origin/main` by default) |

`npm run test:db` uses `.env.test` and a database whose name ends in `_test`: the test harness
empties tables between tests and refuses any other database. An exported `DATABASE_URL` overrides
`.env.test`, so check it before running the test suite. Building does not connect to the database
([`src/env.ts`](../src/env.ts)).

## Versioning and releases

Before 1.0, a feature bumps the minor version and a fix, chore, refactor or test bumps the patch.
A pull request that ships app behaviour updates `package.json` and `package-lock.json`, adds one
dated heading to [`CHANGELOG.md`](../CHANGELOG.md), and updates the version badge in the
[README](../README.md). Keep that bump in its own `chore: release X.Y.Z` commit; versions are
assigned in merge order. `scripts/check-version-bump.mjs` enforces this, with docs-only changes
exempt ([ADR 0003](../docs/adr/0003-semver-and-changelog.md)). The version is injected as
`__APP_VERSION__`, shown in the app shell and login, and served at `/_app/version.json`.

After CI succeeds on `main`, [the publish workflow](workflows/publish-image.yml) creates a
`vX.Y.Z` tag and a public `ghcr.io/nauelg/unitati:X.Y.Z` image for each new version. Do not
tag or push the image by hand. A pull request without a version bump releases nothing.

## License and sign-off

Unitati is licensed under the [GNU Affero General Public License v3.0 only](../LICENSE). By
contributing, you agree that your contribution is licensed under the same terms.

Every commit must be signed off, certifying the
[Developer Certificate of Origin 1.1](https://developercertificate.org/): that you wrote the
change, or otherwise have the right to submit it under the project's license.

```sh
git commit -s -m "fix: describe the change"
```

That appends a trailer with the name and email of your Git identity, which must match the commit
author:

```
Signed-off-by: Ada Lovelace <ada@example.com>
```

The `DCO sign-off` check fails a pull request with any commit that lacks it. To sign off commits
you already made:

```sh
git rebase --signoff origin/main
git push --force-with-lease
```

There is no contributor license agreement. The decision and its trade-offs are in
[ADR 0041](../docs/adr/0041-license-agpl-3.0-only.md).

## Pull requests

- [Conventional Commits](https://www.conventionalcommits.org/) for titles and commits.
- One pull request per change. A change that ships app behaviour bumps the version and updates
  `CHANGELOG.md` and the README badge ([ADR 0003](../docs/adr/0003-semver-and-changelog.md)).
- Before opening it: `npm run check && npm run lint && npm test`, plus `npm run test:db` when the
  change touches the database.
- The description follows [`pull_request_template.md`](pull_request_template.md); see
  [`docs/agents/pull-requests.md`](../docs/agents/pull-requests.md).
