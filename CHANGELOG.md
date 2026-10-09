# Changelog

All notable changes to Unitati are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/): while the product is pre-1.0,
minor bumps carry features and patch bumps carry fixes.

## [0.8.1] - 2026-10-09

### Fixed

- Staging retention counted releases that never finished deploying. A release now carries a
  `.release-complete` marker, written only once it has served a healthy response, and only
  marked releases count toward the five kept; unmarked ones are removed on the next run. The
  previous behaviour would have let a run of failed deploys evict the last known-good release,
  which is the single thing the releases layout exists to keep — and it was not hypothetical: a
  deploy was killed by the OOM killer during `npm ci` and left a directory behind that occupied
  a slot.
- `scripts/staging-deploy.sh` holds an `flock` for the length of a deploy. systemd will not start
  the timer's oneshot while it is already running, but nothing stopped a hand-run deploy from
  racing one, and two deploys sharing a clone, a symlink and a database is not a race worth
  debugging after the fact.

## [0.8.0] - 2026-10-08

### Added

- `APP_ENV` (`development`, `staging` or `production`), a runtime variable that says where a build
  runs ([ADR 0013](docs/adr/0013-app-env-and-the-non-production-surface.md)). `NODE_ENV` cannot:
  staging runs the production build. Unset means `development` under `vite dev` and `production`
  in a build; a value outside the vocabulary stops the server at start. **Staging's
  `unitati.env` must now set `APP_ENV=staging`.**
- An environment badge in the app header and on the login screen, in every environment but
  production, with one tone per environment so a development screenshot is not mistaken for a
  staging one.
- The Unitati logo in the sidebar, the mobile header and the login screen, as the `Logo`
  component (mark and lockup), taken from `docs/design/assets/brand`.
- `Logo` and `EnvironmentBadge` sections in the component gallery.

### Changed

- The component gallery (`/dev/components`) and its menu entry are available in every environment
  but production, not just under `vite dev`, so a pull request's verification guide can use it on
  staging. It still answers 404 in production. Amends decision 4 of
  [ADR 0011](docs/adr/0011-component-layers-and-the-gallery.md).
- The favicon is the Unitati mark, with an `apple-touch-icon`, instead of the SvelteKit
  template's Svelte logo.

## [0.7.0] - 2026-10-08

### Added

- The inventory screens, closing slice 2 (#7): `/assets` (server-side pagination and search),
  `/assets/new`, `/assets/[tag]`, `/assets/[tag]/edit`, and the catalogue at `/assets/models`,
  `/assets/categories` and `/assets/manufacturers`. A technician registers an asset, hands it to
  a person and takes it back, and the detail page shows all three events newest first.
- On the detail page, custody, state, location and notes are separate actions rather than form
  fields: each is an event with its own history entry, and a form that could set `custodian` would
  write the row without the entry that makes the history trustworthy (ADR 0009).
- A model can be created inline from `/assets/new`, and is preselected when it is made.
- **Redaction holds in the payload.** An employee sees their own equipment in full and, for shared
  equipment, the tag, name and location only. Checked against the JSON SvelteKit sends to the
  browser (`__data.json`), not just the rendered page.
- `AssetTimeline`, `Pager` and `SelectField` components, and `Button` renders a link when given
  an `href`. All four have their variants and states in `/dev/components`.
- `npm run db:seed`: 200 assets with custody, state, location and notes, deterministic from a
  fixed seed and idempotent (a second run changes nothing). It applies its plan through the
  domain's own functions, so the history it shows is history the app could have written. On an
  empty database it also does `/setup`'s job and prints demo logins for an administrator, a
  technician and an employee. It refuses any `DATABASE_URL` whose host is not `localhost`.
- Editing and deleting for manufacturers, categories and models. Deleting an entry something still
  uses answers with a sentence instead of a 500: `restrict` is a typed `in_use` outcome.
- `requireAnyPermission` and `listLocations`, for screens several permissions reach and for the
  location picker.
- `advanceAssetTagSequence`: anything that writes explicit tags in bulk (the seed now, the CSV
  import in #21 next) must move `asset_code_seq`, or the next asset registered by hand draws
  `AST-0001` and is refused as a duplicate.
- Route-level specs for what the browser is sent: the real `load` functions against Postgres,
  asserting that an employee's page data carries no serial, custody or history for shared
  equipment, and that the registering, catalogue and edit screens answer 404.

### Changed

- #7's acceptance criteria: the shared view keeps `assetTag` (it is the identifier in the URL and
  what lets an employee name the floor printer on a ticket), and the search criterion is
  `macbook` / `pro` / `pró`, not `mcbook` — `unaccent` strips diacritics, it does not correct
  spelling, and typo tolerance would be its own `pg_trgm` issue.
- `FullAssetView` carries `assetModelId` and `AssetModelEntry` carries `manufacturerId` and
  `categoryId`, so forms preselect by id instead of matching on names.
- `Field` and `SelectField` accept a `null` value and no longer declare a fallback for it. A form
  library hands `undefined` for an optional field, and Svelte refuses `bind:value={undefined}`
  into a prop that has a fallback.
- The navigation shows "Inventario" to anyone holding any asset-read permission, not only
  `assets.view`: an employee reaches it through `assets.view.own` and `assets.view.shared`.

### Fixed

- An asset tagged `new`, `models`, `categories` or `manufacturers` was registered happily and then
  unreachable: the static route wins over `/assets/[tag]`. Those tags are now refused by the
  schema, so the rule holds for the import in #21 as well as for a form.
- A crafted form could attach an asset to another organisation's model or location, or a model to
  another organisation's manufacturer or category, and read that name back in a listing. A
  foreign key proves a row exists, not that it is yours. Registering, editing and every catalogue
  write now look the reference up inside the actor's organisation and answer `*_not_found`.

## [0.6.1] - 2026-10-08

### Added

- A staging environment, documented in
  [ADR 0012](docs/adr/0012-environments-and-real-verification.md). It runs the production build
  behind `tailscale serve` on the tailnet, against its own `unitati_staging` database, and it is
  where a pull request's _Guia de verificació en real_ is executed from now on. Dev mode could
  never stand in for it: the first HTTPS request emitted
  `__Secure-better-auth.session_token; Secure`, a cookie form `http://localhost:5173` cannot
  produce, so bugs on that path were invisible by construction.
- `scripts/staging-deploy.sh` deploys a ref of `origin`, never a working tree, so staging proves
  what was pushed rather than what sits on somebody's disk. It builds into
  `releases/<timestamp>-<sha>` and swaps an atomic symlink; a failed health check reverts it and
  attaches the journal, so a broken build cannot take staging down. Migrations are **not**
  reverted — they are forward-only, and a destructive one needs a plan of its own.
- `scripts/staging-autodeploy.sh` gates the five-minute poll: deploy only once every check run
  for that exact commit has completed green, with the verified SHA pinned so a push landing
  mid-run cannot smuggle in a commit nobody checked. It reads the check-runs API, because GitHub
  Actions leaves `/commits/<sha>/status` reporting `{"state":"pending","total":0}` for ever and a
  gate built on that endpoint would never open.
- One artefact serves every environment: no origin and no base path are baked into the build.
  `adapter-node` reconstructs the origin from `PROTOCOL_HEADER` and `HOST_HEADER`, and
  `tailscale serve` was measured to send `x-forwarded-host` including the port, so form `POST`s
  pass the CSRF check with nothing in between.

## [0.6.0] - 2026-10-08

### Added

- The four inventory tables (`src/lib/server/assets/schema.ts`): `manufacturers`, `categories`,
  `asset_models` and `assets`. The catalogue hangs off the **model**, not off each asset, and
  `asset_model_id` is `not null` — an asset with no model is an asset no report can group. The
  model's manufacturer and category are `restrict`, not `set null`, because a model with
  neither would put every report into a growing "unclassified" bucket.
- `asset_tag` is `AST-####` from the `asset_code_seq` sequence, **editable**, and unique per
  organisation (ADR 0010). The generated value is a default, not a constant: #21 imports tags an
  organisation already has stuck on its hardware.
- State and custody as two axes that do not constrain each other: an asset can be `in_use` with
  nobody holding it (the floor printer) and `in_stock` in a technician's drawer. The
  `asset_state` enum is built **from** `ASSET_STATES`, so it is not a third copy of a vocabulary
  that already has an owner (ADR 0011).
- `serial` is nullable with a **partial** unique index: two assets without one coexist, two with
  the same one in an organisation do not.
- The `activity` table, with its `CHECK` that **exactly one** target column is set — written as
  a sum of casts, so two targets are refused as well as none — and its foreign key to `assets`.
  It lands here rather than with the contract in 0.5.0 because that key has to exist from its
  first migration; added later it would have left a window in which history could point at an
  asset that never existed. The `activity_verb` enum and the `CHECK` are both derived from
  `verbs.ts`.
- `recordActivity` takes a **`Transaction`, not a `Database`**: ADR 0009's "same transaction"
  rule expressed as a type, so a caller who has not opened one cannot write history. An action
  and its entry commit together, because custody assigned without its entry is a history that
  cannot be trusted.
- The asset domain functions with their permission scope and **field-level redaction**. An
  `employee` sees their own equipment in full and **name and location only** for a shared asset —
  in the payload, not merely in the markup, which is why `SharedAssetView` is a separate type
  with nowhere to put a serial.
- Full-text search: generated `tsvector` columns on `assets` and `asset_models` behind GIN
  indexes, `simple` + `unaccent` and never the Spanish dictionary, because model names and
  serials are not prose. A second vector, `search_shared`, covers only what a shared view
  exposes: searching the full one would let an employee confirm a serial they may not read.
- `drizzle-zod`, with the schemas generated **from** the Drizzle tables, so a new column cannot
  leave a stale validator behind. `organisation_id` is omitted from every input schema — the
  tenancy scope comes from the session, never from the payload (ADR 0004).
- `src/lib/server/db/errors.ts` reads a constraint violation back out of a failed query, and
  `db/testing/refusal.ts` lets a spec assert the constraint by name rather than merely that
  something threw.

### Notes

- The migration creates the `unaccent` extension and an `immutable_unaccent` wrapper by hand,
  above what `drizzle-kit` generates. Plain `unaccent(text)` is `STABLE`, and Postgres refuses a
  non-immutable expression in a generated column.
- `unaccent` strips accents; it does not correct typos. `macbook`, `MACBOOK`, `pro` and `pró`
  all find a "MacBook Pró"; `mcbook` does not, and would need `pg_trgm`.

## [0.5.0] - 2026-10-08

### Added

- The activity contract (`src/lib/server/activity/`), the first half of what slice 2 needs
  before it can write a single history entry. A row holds a **verb** — the canonical key of
  what happened, never a rendered sentence — and a **payload** whose shape the verb decides.
  Adding a verb takes three edits and the compiler insists on all three: the list, the payload
  shape, and the sentence. Omitting the shape is a missing property; omitting the sentence fails
  the renderer's exhaustive `switch`.
- Payloads carry an identifier **and** a snapshot. A custody entry stores the person's name as
  it was, so renaming somebody does not rewrite what the history says happened (ADR 0009).
- The listing contract (`src/lib/server/shared/pagination.ts`): `limit`, `offset` and `total`,
  settled at the first list screen rather than the third. With 200 rows, loading everything
  works — which is why it is a trap, since it keeps working until the install with 4,000.
  `perPage` is clamped, because `?perPage=100000` is otherwise a denial of service anyone can
  type, and a malformed page number yields page one instead of an error.
- `src/lib/domain/status.ts` holds the status vocabulary — the keys, with no labels and no
  tones. Three layers need the same list and none of them owns it: the badge pairs each key
  with a tone and a message, the activity payload validates against it, and the `assets` schema
  will build its `pgEnum` from it. A key added without its tone fails `npm run check`.

### Fixed

- `zod` was imported by the login and setup form actions while being nobody's declared
  dependency: it arrived only as a transitive one through `sveltekit-superforms`. The day that
  package changes its range, the application breaks for a reason nothing in `package.json`
  would explain. It is a direct dependency now.

## [0.4.0] - 2026-10-08

### Added

- `StatusBadge`, `Avatar` and `DataTable`, the three components every MVP slice needs. The design
  system names ten and two existed; these are the ones that unblock a list screen, so slices 2, 3
  and 5 no longer each build their own table.
- `StatusBadge` takes a status key, never display text, so its label stays translatable and
  `status="En curso"` fails `npm run check`. The keys come in three families — ticket status,
  priority, asset state — because a ticket is never `in_stock`. Priority `normal` renders no
  badge: a column that shouts "Normal" on every row teaches the reader to stop looking.
- `/dev/components`, the gallery, and the ratchet it enforces: a component that is not in it is
  not finished. It exists only in development — its load returns 404 otherwise, its markup sits
  behind `dev`, and the app shell's entry to it disappears from a production build along with
  every fixture.
- [ADR 0011](docs/adr/0011-component-layers-and-the-gallery.md) records the conventions: two
  component folders with two owners, `tv()` for every class string, colour only through a token,
  and status as a key.

### Changed

- `src/lib/components/ui/` now holds `shadcn-svelte` output and nothing else; our own
  design-system components live in `src/lib/components/unitati/`. The first
  `shadcn-svelte add button` would have written `ui/button/` beside a hand-written
  `ui/Button.svelte` — two things called Button in one folder, one vendored and one ours.
- `components.json` aliases say `#lib` instead of `$lib`. `shadcn-svelte` validates its aliases
  against resolvable paths and this repo addresses `src/lib` through Node subpath imports, so with
  `$lib` the CLI refused to run at all. Adding a component was impossible before this.
- `Button` and `Field` are rewritten with `tailwind-variants`, which was installed and unused
  while both composed class strings by hand — the pattern the next agent would have copied.
  `Button` also becomes the pill the design system specifies rather than the rounded rectangle it
  had been, and its disabled state drops the shadow as the reference CSS does.

### Fixed

- `Field` generated its `id` with `crypto.randomUUID()`, so the server and the client produced
  different ones and hydrating the SSR'd login and setup forms left every `<label for>` pointing
  at an id that no longer existed. It uses `$props.id()`.

## [0.3.0] - 2026-10-07

### Added

- Postgres in the test loop. A second Vitest project, `db`, runs `src/**/*.db.spec.ts` against
  a real database, so a slice's acceptance criteria can be proven instead of asserted. Until
  now every spec was pure logic, which means every claim about rows and about access control
  was a claim nothing in the repo could contradict. `npm run test:db` runs it,
  `npm run test:db:watch` watches it, and `npm test` still runs `server` only and still passes
  with Docker stopped.
- `src/lib/server/db/testing/` holds the harness: it creates `unitati_test` if it is missing,
  migrates it, and truncates every table before each test. The table list is read off the
  Drizzle schema, so adding a table to a domain is enough — a hand-kept list is a list that
  falls behind, and a table missing from it leaks rows into the next test.
- `src/lib/server/directory/directory.db.spec.ts`, the worked example, proves that `listPeople`
  scopes to one organisation (ADR 0004) rather than asserting it. Two of its tests insert the
  same globally unique slug, which fails without truncation and so tests the harness itself.
- `.env.test`, committed, points the test run at `unitati_test`. Vite's `loadEnv` lets a
  `DATABASE_URL` exported in the shell override that file, so a developer with the development
  connection string in their environment would have watched `TRUNCATE` empty their own
  database. The harness now refuses any database whose name does not end in `_test`, before it
  opens a connection.
- CI starts Postgres from the same `compose.yaml` developers use and runs both projects, so a
  red database test fails the build.

### Changed

- The `db` project does not run its files in parallel, and runs its tests in a random order.
  One database truncated between tests means two files at once would delete each other's rows,
  so isolation wins over the wall clock; randomising the order then exercises "these tests do
  not depend on each other" on every run rather than asserting it once.

## [0.2.1] - 2026-10-06

### Changed

- The design system is no longer a single 2.08 MB HTML file. `docs/design/assets/` now holds
  each asset as a real file — `tokens.css`, `components.css`, `tokens.json`, 12 brand SVGs,
  18 icons and the logo concept — and `design-system.html` links them instead of embedding
  them as base64. The file dropped to 103 KB, so it is reviewable in a diff.
- The stylesheet is now a single source of truth. The old file carried the same 19.4 KB of
  CSS twice: once inline to render the examples, once base64-encoded as a download. Those
  two copies could drift apart without anyone noticing; now they are one file.
- The concept render ships as AVIF with a WebP fallback in a `<picture>`, 1.23 MB down to
  157 KB for the pair. It is 1774x887 with 60k distinct colours, so no palette fits it and
  lossless compression had nothing left to give: `optipng -o7` beats a plain zlib pass by
  0.4%. AVIF at q90 measures an SSIM of 0.9945, and the authoritative logo artwork is the
  vector set beside it, which is untouched. Re-encoding needs `avifenc`, `cwebp` and
  ImageMagick; without them the extractor emits a losslessly recompressed PNG instead, so
  the page renders either way and only its weight depends on the toolchain.
- `README.md` leads with the brand lockup, light and dark, and keeps three badges instead of
  eleven. The rest duplicated the Stack section, which says the same with more detail.
- The product is written "Unitati" everywhere it is read as a name: the Spanish interface
  (`app_name`, the login heading, the setup lede), `AGENTS.md`, the ADRs and the remaining
  docs. It matches what `tokens.json` and the brand SVGs already said. Identifiers keep the
  lowercase spelling, because they are not the name: the npm package, the repository slug,
  the Postgres role and database, the `provision.ts` slug fallback, and every file path.
- The README's Status section described an app that no longer exists. It claimed "no product
  features yet" and announced slice 1 as next, when slice 1 had already shipped. It now says
  what runs — setup, authentication, the people directory, roles — and names the four server
  folders that are still empty, so the gap is explicit rather than implied. The `src/` tree
  gains `hooks.server.ts`, `setup/`, `directory/`, `auth/` and `access/`.
- Ignore files (`.gitignore`, `.prettierignore`, `.eslintignore`) are exempt from the version
  gate ([ADR 0003](docs/adr/0003-semver-and-changelog.md)). They steer tooling and never reach
  the build, yet touching one alone used to force a release: 0.1.2 was published for exactly
  that reason.
- `package-lock.json` had drifted to `0.1.2` while `package.json` said `0.2.0`; both now agree.

### Added

- `docs/design/extract-assets.mjs`: unpacks a design handoff into `assets/` plus an HTML
  shell. It refuses to guess a filename for an asset the handoff never names, and stops if an
  embedded stylesheet has drifted from its downloadable copy.
- `docs/design/README.md`: what lives in the folder, which files are generated, and how to
  unpack the next handoff.

## [0.2.0] - 2026-10-06

### Added

- MVP slice 1. An empty installation walks through `/setup`, creates its organisation and
  first admin in one transaction, and lands on the app shell.
- Email and password authentication via Better Auth (ADR 0006), with sessions resolved once
  per request in `hooks.server.ts` and route-group guards.
- Directory: `organisation`, `person`, `department`, `location`, `team`. A person exists
  without a credential, so equipment can be held by someone who never signs in.
- Fixed roles with granular permissions (ADR 0007). Denials answer 404 rather than 403, so a
  refusal does not confirm that a record exists.
- Every aggregate root carries `organisation_id` and all access is scoped by it (ADR 0004).
- Spanish interface with Paraglide, externalised from the first screen (ADR 0008).
- App shell with the design-system tokens, one colour per domain, and navigation filtered by
  permission.
- `Button` and `Field` components; `Field` wires label, error and description for screen
  readers.

### Changed

- `src/routes/layout.css` becomes `src/app.css`, the entry point shadcn-svelte expects.
- The database connection resolves on first use instead of at import time, so importing a
  module no longer opens a connection a build never asked for.
- `drizzle-orm` and `postgres` move to `dependencies`: they ship at runtime.

### Notes

- `overrides` pins Better Auth's `@sveltejs/kit` peer to ours. Better Auth declares `^2.0.0`
  and this project runs SvelteKit 3; the peer is optional and only the `svelte-kit` helper
  touches it. The override is surgical on purpose — `legacy-peer-deps` would disable peer
  checking for every package.
- Shipped without `formsnap`: it requires `sveltekit-superforms@^2`, while version 3 is the
  one that supports SvelteKit 3 natively. Its job — accessible field wiring — is what the
  design system specifies as `Field`.

## [0.1.2] - 2026-10-06

### Added

- `docs/roadmap-v1.md`: every capability classified as MVP, v1, post-v1 or discarded, each
  with a written reason. Built from the shipped data models of Shelf.nu, Snipe-IT, Zammad,
  OpenSupports, Plane, Leantime and GLPI.
- ADR 0004 (tenant-ready at N=1), ADR 0005 (one indivisible suite, pairwise join tables),
  ADR 0006 (email and password authentication), ADR 0007 (fixed roles over granular
  permissions), ADR 0008 (Spanish UI, English codebase).
- `docs/design/design-system.html`: exported design system — tokens, components and layouts.

### Changed

- `docs/mvp-scope.md` rewritten as the minimum subset of the roadmap. Inbound email and CSV
  import move to v1; attachments and outbound notification enter the MVP.
- Exit criterion replaced by a seeded end-to-end walkthrough. The previous one required a
  pilot team that does not exist, which made it unverifiable.
- The estimate is removed rather than replaced: the first trustworthy one comes from
  measuring slice 1.
- `docs/domain-model.md`: cross-domain relations are pairwise join tables with real foreign
  keys instead of a polymorphic `Link` table; adds `Organisation` and `State` / `StateGroup`.
- `docs/vision.md`: non-goals now cover tenancy, switchable modules and asset bookings.

## [0.1.1] - 2026-10-06

### Fixed

- `vite build` no longer requires `DATABASE_URL`. Building analyses the app without opening a
  connection, so environments that legitimately have no database credentials (CI, image builds)
  can build it. The variable is still mandatory when the app starts.

## [0.1.0] - 2026-10-06

### Added

- Evaluation docs: vision, alternatives, domain model, MVP scope, internal vs open source decision.
- ADR 0001 (stack and architecture), ADR 0002 (server modules by domain), ADR 0003 (SemVer and changelog).
- SvelteKit 3 + Svelte 5 + TypeScript scaffold with Tailwind CSS 4, Drizzle ORM and PostgreSQL 17 (`compose.yaml`).
- Domain folders under `src/lib/server/` and the shared `Outcome` type.
- Running version injected at build time and shown in the app shell and on the login screen.
- Version-bump CI gate (`scripts/check-version-bump.mjs`) and GitHub Actions workflow.
