# 0003. SemVer, changelog and visible version

- **Status:** accepted
- **Date:** 2026-10-06

## Context

unitati will run in more than one environment (local, staging, one or more organisations if it goes open source). When something breaks, the first question is "which build is this?". A prose rule like "remember to bump the version" fails without anyone noticing, so the policy needs a gate.

## Decision

1. **Semantic Versioning** in `package.json`, the single source of truth.
   - Pre-1.0: features bump **minor**, fixes bump **patch**.
   - From 1.0: standard SemVer; breaking changes (data model, API, configuration) bump **major**.
2. **Every pull request that ships app behaviour bumps the version.** That PR also:
   - adds exactly one dated heading `## [x.y.z] - YYYY-MM-DD` to `CHANGELOG.md` ([Keep a Changelog](https://keepachangelog.com/en/1.1.0/)), with no `[Unreleased]` section left behind;
   - updates the version badge in `README.md`.
3. **The running version is visible**, both in the app shell and on the login screen.
   - Vite injects it at build time as `__APP_VERSION__`, and code reads it through `src/lib/version.ts`.
   - SvelteKit's `version.name` uses the same value, so `/_app/version.json` reports it too.
   - `package.json` is not imported into client code, which keeps the dependency list out of the bundle.
4. **CI enforces it.** `scripts/check-version-bump.mjs` runs on every pull request and fails if any of the above is missing.
   - Changes that only touch docs, CI or agent files (`docs/`, `.github/`, `README.md`, `AGENTS.md`, …) are exempt.
5. **Releases are tagged** `vX.Y.Z` on the merge commit in `main`.

Same policy as `renyst-app`, minus its in-app release notes.

## Consequences

- Every deployed build identifies itself, which makes bug reports and support unambiguous.
- Version numbers move fast pre-1.0, and that is fine.
- Two concurrent PRs may claim the same version; the second one rebases and bumps again.
