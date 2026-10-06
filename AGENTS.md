## Project

unitati: projects, service desk and ITAM on one data model. Start with `README.md` and `docs/`.

## Conventions

- Architecture: server code by business domain, see `docs/adr/0002-server-modules-by-domain.md`. Routes never query the database; domains never import each other's tables (use `links`).
- Domain vocabulary: `docs/domain-model.md`. New architectural decisions go in `docs/adr/NNNN-title.md`.
- Code, comments and docs in English.
- Commits: Conventional Commits.
- Before finishing a change: `npm run check`, `npm run lint`, `npm test`.

## Versioning & changelog

SemVer in `package.json`; `CHANGELOG.md` follows Keep a Changelog. Every change that ships app behaviour bumps the version in the same pull request (features → minor, fixes → patch while pre-1.0). The same PR adds its own dated `## [x.y.z] - YYYY-MM-DD` heading (`[Unreleased]` never survives) and updates the version badge in `README.md`.

The running version is injected at build time (`__APP_VERSION__`, read via `src/lib/version.ts`) and shown in the app shell and on the login screen.

CI enforces all of this with `scripts/check-version-bump.mjs`. See `docs/adr/0003-semver-and-changelog.md` for the full policy and the paths exempt from bumping.
