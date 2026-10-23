## Project

Unitati: projects, service desk and ITAM on one data model. Start with `README.md` and `docs/`.

## Conventions

- Architecture: server code by business domain, see `docs/adr/0002-server-modules-by-domain.md`. Routes never query the database; domains never import each other's tables (use `links`).
- Module boundaries live in `.dependency-cruiser.cjs` and run first in `npm run lint` (ADR 0048). Never add an entry to `.dependency-cruiser-known-violations.json` without justifying it in the pull request.
- Domain vocabulary: `docs/domain-model.md`. New architectural decisions go in `docs/adr/NNNN-title.md`.
- Code, comments and docs in English. Pull request descriptions are the one exception: they are written in Catalan, see `docs/agents/pull-requests.md`.
- Cross-domain reactions go through `shared/events.ts` (ADR 0024): emit after commit from the owning domain, subscribe in `subscriptions.ts`; never import another domain's tables to react.
- Configurable catalogues live under `/settings/{module}`, registered in the settings section registry; never as a route inside the module.
- Commits: Conventional Commits, signed off with `git commit -s` (DCO; CI rejects a pull request with an unsigned commit). See `docs/adr/0041-license-agpl-3.0-only.md`.
- License: AGPL-3.0-only. The "Código fuente" link in `AppVersion` is a license obligation: never hide or remove it.
- Before finishing a change: `npm run check`, `npm run lint`, `npm test`.

## Versioning & changelog

SemVer in `package.json`; `CHANGELOG.md` follows Keep a Changelog. Every change that ships app behaviour bumps the version in the same pull request (features → minor, fixes → patch while pre-1.0). The same PR adds its own dated `## [x.y.z] - YYYY-MM-DD` heading (`[Unreleased]` never survives) and updates the version badge in `README.md`.

The running version is injected at build time (`__APP_VERSION__`, read via `src/lib/version.ts`) and shown in the app shell and on the login screen.

Every version bump that lands on `main` is released as a `vX.Y.Z` git tag and a public image `ghcr.io/nauelg/unitati:X.Y.Z`. Do not tag or push images by hand: `.github/workflows/publish-image.yml` does both, once CI is green, for any version that has no tag yet (`docs/adr/0023-container-image-on-ghcr.md`). A PR that does not bump the version releases nothing.

CI enforces all of this with `scripts/check-version-bump.mjs`. See `docs/adr/0003-semver-and-changelog.md` for the full policy and the paths exempt from bumping.

## Agent skills

### Pull requests

Four sections in Catalan — Problema, Solució, Tests, Guia de verificació en real — prefilled from `.github/pull_request_template.md`. This format is the repo's, and takes precedence over the vendored `pr` skill. See `docs/agents/pull-requests.md`.

### Issue tracker

Issues and specs live as GitHub issues in `NauelG/unitati`, driven through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each label string equal to its name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `docs/domain-model.md` is the glossary, `docs/adr/` holds the decisions. See `docs/agents/domain.md`.
