# Pull requests

The pull request is where a human becomes aware of a change and decides whether to trust it. A description that only restates the diff is worthless: the diff is already there. The description exists to answer what broke, what changed, what proves it, and how to see it running.

`.github/pull_request_template.md` is the single source of truth for the shape. It is prefilled by GitHub on every new pull request.

## Description

Written in **Catalan**, in four sections:

1. **Problema**: what was wrong or missing, from the point of view of whoever uses the app first, then the technical cause. Reference the issue with "Tanca #N"; if there is none, say where the problem came from.
2. **Solució**: what changed and why. Call out behaviour changes, database migrations, new environment variables, and any architectural decision that belongs in `docs/adr/`.
3. **Tests**: what was added or run, and whether it was confirmed to fail against the old code. Include the result of `npm run check`, `npm run lint` and `npm test`.
4. **Guia de verificació en real**: a checklist of manual steps — route, action, **Esperat:** result — that proves the change in the running app. Warn when a step mutates data, and run those against a copy of the database.

The first line is always the version the pull request carries. Titles follow Conventional Commits, with the description in Catalan (for example `fix: corregeix el càlcul de l'estat`).

Never sign or attribute anything to an AI tool, anywhere.

> This document defines the pull request format for unitati. It takes precedence over the vendored `pr` skill in `.agents/skills/pr/`, which describes a different format and is not used here.

## Versioning

A pull request that ships app behaviour bumps the version in the same pull request, per [ADR 0003](../adr/0003-semver-and-changelog.md):

- `fix`, `chore`, `refactor`, `test`: **patch** (`0.1.2` → `0.1.3`).
- `feat`: **minor** (`0.1.2` → `0.2.0`).
- A breaking change to the data model, the API or how the app is operated: **minor** while the major is `0`, and called out in **Solució**.

A bump touches four places:

- `package.json` and `package-lock.json` (`npm version X.Y.Z --no-git-tag-version`). Vite injects it as `__APP_VERSION__`; the app shell and the login screen read it through `src/lib/version.ts`.
- The version badge in `README.md`.
- A new dated `## [x.y.z] - YYYY-MM-DD` section at the top of `CHANGELOG.md` (Keep a Changelog; entries in English, no `[Unreleased]` left behind).

Keep the bump in its own `chore: release X.Y.Z` commit. Versions are assigned in **merge order**: when another pull request merges first, drop the release commit, rebase on the new `main`, bump again, and update the `Versió` line in the description.

Changes that only touch `docs/`, `.github/`, `.agents/`, `AGENTS.md`, `README.md`, `CHANGELOG.md` or `.gitignore` ship no app behaviour and need no bump. Write `sense canvi` on the version line. `scripts/check-version-bump.mjs` enforces this on every pull request.

## Checks before pushing

Run `npm run check`, `npm run lint` and `npm test` after the last edit — `vitest` does not type-check, so the test run alone proves nothing about types. With several open pull requests, merge them locally in the intended order and run the same three commands: a clean textual merge can still fail type-checking.
