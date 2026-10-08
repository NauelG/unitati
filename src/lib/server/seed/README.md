# seed

`npm run db:seed`: a believable inventory for development — 200 assets with custody, state,
location and notes, spread over 13 models, 26 people and 4 locations.

## Properties

- **Deterministic.** `plan.ts` is pure: a fixed seed in, the same plan out, on any machine.
  `AST-0142` means the same thing in everyone's database. The plan makes every random draw for
  every asset whether or not it is used, so asking for fewer assets yields the same first ones.
- **Idempotent.** Assets are registered with explicit tags; a second run is refused by the unique
  index and skips that asset, events included. It adds nothing and removes nothing.
- **Through the domain, where one exists.** Everything about an asset goes through `assets`:
  `apply.ts` calls `registerAsset`, `assignCustody`, `changeState`… rather than inserting rows, so
  the timeline a seeded asset shows is one a real action could have produced. `directory` has no
  write functions yet, so people and locations are inserted into its exported tables, and the demo
  credentials go through Better Auth. That is the honest boundary today; the directory CRUD slice
  is what removes it.
- **Local only.** It creates accounts with a published password, so `guard.ts` refuses any
  `DATABASE_URL` whose host is not `localhost`.

## What it does to an installation

On an empty database it does `/setup`'s job (organisation `Acme` and `admin@acme.test`), because
otherwise `npm run db:seed && npm run dev` would leave nobody able to sign in and `/setup`
locked. On an installation that already has an organisation it writes into that one.

It also gives two seeded people a credential, so the redaction can be seen working:
`tom.technician@acme.test` (technician) and `eva.employee@acme.test` (employee, who holds some
of the equipment). The password is printed by the script.

## Why a script that boots Vite

`scripts/seed.mjs` cannot `import` this folder with plain `node`: it reaches for
`$app/env/private` and the `#lib/*` aliases through the SvelteKit plugin. It stands up Vite in
middleware mode (no port, no HMR) and runs the seed through its module runner, so there is one
way to resolve an import, not two.

This is a composition root — it touches `directory`, `assets` and `activity` — which is why it sits
beside the domains. ADR 0002 forbids a _domain_ importing another's tables; the seed is not a
domain, but it keeps to the spirit where it can (see "Through the domain" above). #13 brings it to
volume and extends it to tickets and projects.
