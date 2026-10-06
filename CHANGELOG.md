# Changelog

All notable changes to unitati are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/): while the product is pre-1.0,
minor bumps carry features and patch bumps carry fixes.

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
