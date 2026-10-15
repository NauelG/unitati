# 0025. The repository is deployment-agnostic

- **Status:** accepted
- **Date:** 2026-10-15
- **Supersedes:** [ADR 0012](0012-environments-and-real-verification.md)

## Context

[ADR 0012](0012-environments-and-real-verification.md) tied Unitati to one host: a staging
environment on `talos`, published by `tailscale serve` on port 8443, deployed from a source
checkout by `scripts/staging-deploy.sh` and kept on `origin/main` by a systemd timer. It also made
that host the place where every pull request's _Guia de verificació en real_ was executed.

[ADR 0023](0023-container-image-on-ghcr.md) then gave the project a real deployment artefact: one
container image per version, configured only through environment variables. Unitati now runs
from that image on a platform of its own, so the source-checkout staging became a second,
redundant way of running the app, and the repository was documenting one person's machine.

## Decision

1. **The repository ships an artefact, not a deployment.** What it publishes is the container
   image of ADR 0023. Where and how that image runs (platform, host, origin, database, how many
   environments) is the operator's choice and is not documented here.
2. **The talos staging is removed**, together with `scripts/staging-deploy.sh` and
   `scripts/staging-autodeploy.sh`. Nothing in the repository refers to a specific host any more.
3. **The _Guia de verificació en real_ runs against whatever environment the author chooses.** The
   reasoning of ADR 0012 still holds as advice: dev mode does not run the production build, so a
   change that touches cookies, HTTPS or anything build-only is best verified on a production
   build. The repository no longer names that environment.
4. **What ADR 0012 decided about the artefact still stands**, because ADR 0023 and ADR 0014 rely
   on it: no origin and no base path are baked into the build, adapter-node reads its origin from
   `PROTOCOL_HEADER` and `HOST_HEADER`, secrets live outside the image, and migrations are
   forward-only. A deployment that applies a destructive migration and then fails leaves the
   previous release running against a schema it was not written for. Additive migrations are
   safe; destructive ones need a plan of their own, in the pull request that introduces them.
5. **`APP_ENV` keeps its three values** ([ADR 0013](0013-app-env-and-the-non-production-surface.md)).
   `staging` is a kind of environment an operator may run, not a reference to the removed host.

## Consequences

- Fewer moving parts in the repository: no deploy scripts, no systemd units, no host-specific
  debt (the pinned nvm path, the `TimeoutStopSec` mitigation for #69).
- The repository no longer guarantees that a shared, always-current environment exists. Whoever
  needs one runs the image.
- ADR 0012 stays in the record as superseded; its measurements about `tailscale serve` and
  adapter-node remain valid history.
