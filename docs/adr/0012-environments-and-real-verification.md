# 0012. Environments and verification in real

## Context

Every pull request carries a **Guia de verificació en real** ([pull-requests.md](../agents/pull-requests.md)):
a checklist of route, action and expected result that proves the change in a running app. Until
now the only running app was `npm run dev` on a developer machine, so that section was verified
against the dev server — which does not run the production build, does not serve over HTTPS, and
therefore cannot reach the code paths that exist only there.

The question was where the app should run in order to be verified: a public domain, a LAN
address, or something else. What the development host actually offers, measured rather than
assumed: `talos` is a Tailscale node with MagicDNS, has **no** reverse proxy installed, and its
`tailscale serve` already publishes another application at `/` on port 443.

[Scope decision 1](../roadmap-v1.md) states there is no pilot team, so nobody outside the tailnet
needs access. A public domain with its own TLS would be cost without return, and it stays
available for the day a pilot exists.

## Decision

1. **Three environments; one artefact serves all of them.**

| Environment    | Host               | Origin                                    | Database          | Artefact                  |
| -------------- | ------------------ | ----------------------------------------- | ----------------- | ------------------------- |
| **dev**        | developer machine  | `http://localhost:5173`                   | `unitati`         | `vite dev`                |
| **staging**    | `talos`            | `https://talos.nutria-pirate.ts.net:8443` | `unitati_staging` | the production build      |
| **production** | does not exist yet | —                                         | —                 | the container of ADR 0001 |

2. **The verification guides are executed against staging, because staging runs the production
   build.** Dev mode cannot stand in for it. The first HTTPS request proved the point: Better Auth
   emitted `__Secure-better-auth.session_token; HttpOnly; Secure; SameSite=Lax`, a cookie form
   `http://localhost:5173` can never produce. A bug in that path is invisible in dev by
   construction.

3. **No origin and no base path are baked into the build.** `kit.paths.base` stays empty and
   `adapter-node` reconstructs the origin at runtime from `PROTOCOL_HEADER` and `HOST_HEADER`.
   Measured on talos: `tailscale serve` sends `x-forwarded-proto: https` and an
   `x-forwarded-host` that **includes the port**, so form `POST`s pass SvelteKit's CSRF check with
   no reverse proxy in between, no `PORT_HEADER` and no `kit.paths.origin`. One build therefore
   runs in every environment, which is what makes the version in `/_app/version.json` mean
   something (ADR 0003).

4. **Staging is published on the tailnet, not the public internet**, over HTTPS on port 8443
   because 443 already belongs to another application on that node. Mounting Unitati under a path
   on the shared hostname was rejected: it requires `kit.paths.base`, which is build-time
   configuration, which would produce two non-interchangeable artefacts reporting the same
   version. See [#66](https://github.com/NauelG/unitati/issues/66).

5. **Staging deploys a ref of `origin`, never a working tree.** `scripts/staging-deploy.sh`
   unpacks the ref into `releases/<timestamp>-<sha>`, installs, builds, migrates, swaps an atomic
   symlink and health-checks the result. A failed check reverts the symlink to the release that
   was serving, so a broken build cannot take staging down. Deploying from `origin` is what
   catches the file that was never committed.

   **A release becomes a rollback target only once it has served a healthy response**, recorded as
   a `.release-complete` marker inside it. Retention counts complete releases only, and incomplete
   ones are removed on the next run. Without that distinction a run of failed deploys would evict
   the last known-good release — the one thing this layout exists to keep. It is not hypothetical:
   a deploy was killed by the OOM killer during `npm ci` and left a directory behind.

   One deploy runs at a time, enforced with an `flock` on `.deploy.lock`. systemd will not start
   the timer's oneshot while it is already running, but nothing stops a hand-run deploy from
   racing one, and two deploys sharing a clone, a symlink and a database is not a race worth
   debugging after the fact.

6. **Staging updates itself, gated on CI.** `unitati-staging-update.timer` polls `origin/main`
   every five minutes and deploys it only when every check run for that exact commit has
   completed with `success`, `skipped` or `neutral`. Without the gate a broken push would deploy
   itself minutes later and take staging down with nobody having touched anything, which is the
   opposite of what staging is for; the health check and rollback are the second net, not the
   first. The verified SHA is pinned when handing over to the deploy, so a push landing mid-run
   cannot smuggle in a commit nobody checked.

   The gate reads the **check-runs** API, not the combined status API: GitHub Actions writes check
   runs and leaves `/commits/<sha>/status` reporting `{"state":"pending","total":0}` for ever, so
   a gate built on that endpoint would never open. Measured on this repository.

   Deciding not to deploy — nothing new, CI still running, CI red — exits zero. Those are
   expected, recurring states, and a failed unit for them would cry wolf until nobody reads it.
   Only a deploy that actually failed exits non-zero, which keeps `systemctl --user --failed`
   meaningful.

7. **The database is not part of the rollback.** Migrations are forward-only. A deploy that
   applies a destructive migration and then fails its health check leaves the previous release
   running against a schema it was not written for. Additive migrations are safe; destructive ones
   need a plan of their own, in the pull request that introduces them.

8. **Secrets live outside the clone**, in `$STAGING_ROOT/unitati.env` at mode 600, with a
   `BETTER_AUTH_SECRET` of its own. Staging must not be able to accept a session cookie signed
   for dev, and a secret inside a git tree is a secret waiting to be committed.

9. **Debt recorded rather than hidden.**
   - Node comes from `nvm`, so the systemd unit pins an absolute versioned path. `nvm install`
     plus a prune breaks it; the deploy's health check turns that into a failed deploy with the
     journal attached. The production container of ADR 0001 retires the problem.
   - `TimeoutStopSec=15` is a mitigation for
     [#69](https://github.com/NauelG/unitati/issues/69): the server does not exit on `SIGTERM`
     because the Postgres pool is never closed. Until that lands, every restart costs the timeout.
   - `tailscale serve` injects `tailscale-user-login` and `tailscale-user-name` into every
     request. Nothing reads them and nothing should: they exist only behind the tailnet, so
     trusting them would be an authentication mechanism production does not have.

## Consequences

- Which environment a build is running in is the runtime variable `APP_ENV`, not `NODE_ENV`
  (staging runs the production build). See [ADR 0013](0013-app-env-and-the-non-production-surface.md);
  `unitati.env` on staging must set `APP_ENV=staging`.
- A verification guide can name one URL, identical for everyone with tailnet access, instead of
  describing a local setup.
- Staging accumulates whatever the verification guides create. It is a copy of nothing, and no
  one should expect its data to survive.
- A broken build cannot break staging. A broken migration can.
- This changes nothing about automated testing: Playwright stays deferred to MVP slice 8. It
  changes where the manual half of "done" happens.
