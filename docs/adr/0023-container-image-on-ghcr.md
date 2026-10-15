# 0023. The container image is published privately on ghcr, one tag per version

- **Status:** accepted
- **Date:** 2026-10-15

## Context

[ADR 0001](0001-stack-and-architecture.md) names the production artefact: one Node container plus
Postgres. Until now nothing built it. Staging runs the production build from a source checkout
([ADR 0012](0012-environments-and-real-verification.md)), which cannot be the shape of a production
deployment. There is no public release yet, so the image must not be public either.

## Decision

1. **The image is `ghcr.io/nauelg/unitati`, private**, under the owner's account. It is linked to
   the private repository through the `org.opencontainers.image.source` label, so it inherits the
   repository's visibility. Making it public later is a visibility switch on the package, not a
   change of artefact.
2. **One image for every environment** (ADR 0012): no origin, base path or secret is baked in.
3. **One image tag per version.** `.github/workflows/publish-image.yml` runs after CI succeeds on
   `main`. When `package.json` carries a version with no `vX.Y.Z` tag, it pushes `X.Y.Z` and
   `latest`, and then creates the tag. The tag is created last, so a tag always means that its
   image exists. A merge that does not bump the version publishes nothing.
4. **The container migrates on start**: its command runs `node scripts/migrate.mjs` and then the
   server. The journal makes it a no-op when nothing is pending, and a failed migration exits the
   container instead of serving a half-migrated schema. The image carries production dependencies
   only, so it uses drizzle-orm's runtime migrator (same files, same journal) instead of
   `drizzle-kit`. The accepted limit: several replicas starting together could race on the schema.
   That is not a case today; if it becomes one, the migration moves to a one-shot step or takes an
   advisory lock.
5. **State lives outside the image**: attachments in the `/data/uploads` volume, data in Postgres.

## Consequences

- During fast iteration every bumped PR produces an image. That is deliberate and cheap; pruning old
  versions can wait until it matters.
- Pulling needs a token with `read:packages` on the host.
- Staging keeps its source-checkout flow for now. Moving it onto the image is a separate decision.
