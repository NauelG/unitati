# 0013. `APP_ENV` and the non-production surface

- **Status:** accepted
- **Date:** 2026-10-08

## Context

[ADR 0012](0012-environments-and-real-verification.md) gave Unitati three environments served by
one build. Two things followed that nobody had decided yet:

- **Nothing on screen said where you were.** Dev and staging look identical to production, down to
  the data. A screenshot in a pull request, or a tab left open overnight, could not be told apart
  from the real thing.
- **The component gallery was tied to `vite dev`.** [ADR 0011](0011-component-layers-and-the-gallery.md)
  gates it on `dev`, which Vite replaces with a literal at build time. Staging runs the production
  build, so there the gallery is unreachable, and the place where pull requests are verified in
  real cannot show a component.

`NODE_ENV` does not help: it reads `production` on staging because staging runs the production
build. `dev` is no better, for the same reason. The only thing that differs between staging and
production is the host they run on, so the answer has to be a variable read at runtime.

## Decision

1. **`APP_ENV` is a runtime variable** with three values: `development`, `staging`, `production`.
   It is declared in `src/env.ts` as **public and non-static**: the browser receives it without a
   `load` function, and it is read when the server starts, not inlined into the bundle, so one
   build still serves every environment.
2. **A value outside the vocabulary stops the server at start.** `prod` is a typo, not a fourth
   environment, and guessing would mean production data behind a staging badge or the reverse.
3. **Unset means `development` under `vite dev` and `production` in a build.** A host that forgets
   the variable is treated as production: no badge, no gallery. That fails toward the safe side
   for the gallery, and it is why `unitati.env` on staging must define `APP_ENV=staging`.
4. **Everything that is not production is the "non-production surface":**
   - `EnvironmentBadge` renders in the app header and on the login screen, with one tone per
     environment so a development screenshot is not mistaken for a staging one. Production
     renders nothing.
   - `/dev/components` answers 404 only in production, and the menu entry appears whenever it is
     reachable. This replaces decision 4 of ADR 0011 ("exists only in development").
5. The logic lives in `src/lib/environment.ts` (`parseAppEnvironment`, `isProduction`) so it is
   testable without SvelteKit.

## Consequences

The gallery's fixtures and copy now ship in the production bundle. They used to be dropped with
the `dev` branch; with a runtime variable the bundler cannot know. The 404 is the guarantee, as it
already was for the route itself, and the cost is a few kilobytes of dead weight in the client.
If that ever matters, the fix is to load the page lazily, not to bake the environment back in.

Every host needs `APP_ENV` in its environment file. The production container of ADR 0001 must
set `APP_ENV=production` explicitly rather than lean on the default, so that the intent is
written down.
