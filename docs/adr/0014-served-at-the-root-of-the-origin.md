# 0014. Unitati is served at the root of its origin

- **Status:** accepted
- **Date:** 2026-10-09

## Context

Unitati has no `kit.paths.base`: every internal link is root-relative and the app assumes it owns
its origin. That is a decision, and until now it was recorded nowhere. A `svelte.config.js` with a
`BASE_PATH` escape hatch existed in a working tree on 2026-10-07 and never reached git
(`git log --all -S BASE_PATH` and `git log --all -- svelte.config.js` are both empty), so there is
no record of the intent in either direction.

Serving staging on `talos` raised the question directly. The node's `tailscale serve` already mounts
another application at `/` on port 443, so mounting Unitati under a path such as `/_unitati` was
evaluated and rejected.

## Decision

1. **Unitati is served at the root of its origin.** `kit.paths.base` stays empty.
2. **A deployment that needs isolation gets its own hostname, port or Tailscale Service**, never a
   subpath.
3. **There is no `BASE_PATH` variable and no `svelte.config.js` escape hatch.**

### Why not a subpath

- **`kit.paths.base` is build-time configuration.** A build with a base and a build without one are
  two non-interchangeable artefacts reporting the same version through `/_app/version.json`. That
  contradicts the purpose [ADR 0003](0003-semver-and-changelog.md) gives the version: every deployed
  build identifies itself.
- **Every root-relative link would have to be prefixed with `base`.** SvelteKit's documentation
  requires it for all of them and suggests wrapping the prefix in a component to make it bearable.
  The failure mode is silent when development runs without a base and staging runs with one.
- **The alternative costs nothing.** A separate port, hostname or Tailscale Service lets the app
  keep its origin to itself, and one artefact serves every environment
  ([ADR 0012](0012-environments-and-real-verification.md)).

### What is not decided here

`kit.paths.origin` is a different concern: it is scheme and host, not path. It is also unnecessary
today, because `adapter-node` reconstructs the origin from `PROTOCOL_HEADER` and `HOST_HEADER`,
verified working on `talos` where `tailscale serve` sends `x-forwarded-host` including the port.

## Consequences

- **Links stay plain.** `href="/assets"` is correct everywhere, with no wrapper to forget.
- **An installation that genuinely cannot get its own hostname or port reopens this**, with that
  evidence attached. Supporting a subpath doubles the artefact count and taxes every link for the
  rest of the project, which is why it needs more than a preference.
- **There is deliberately no automated guard.** The natural one, a test asserting `base` from
  `$app/paths` is `''`, does not work: in the `server` Vitest project the virtual module's
  `__SVELTEKIT_PATHS_BASE__` is `undefined` whatever `kit.paths.base` is. Verified by setting
  `paths: { base: '/x' }` in `vite.config.ts` and reading the value from a spec: still `undefined`.
  Such a test would pass or fail identically with any configuration, so it would guard nothing while
  looking like it did. A text-matching test over `vite.config.ts` was ruled out as well. The
  protection is this record, the README sentence, and review.
