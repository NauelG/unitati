# assets

IT asset management: assets, models, categories, custody (check-out / check-in). Later: kits,
licences and consumables.

## The shape of it

The catalogue hangs off the **model**, not off each asset: `manufacturers` and `categories` point
at `asset_models`, and `assets.asset_model_id` is `not null`. An asset with no model is an asset
no report can group, which is why the chain is required rather than convenient.

Two axes describe an asset and **neither constrains the other**:

- **State** — `in_use` / `in_repair` / `in_stock` / `retired`, from `ASSET_STATES` in
  `$lib/domain/status.ts`. The `pgEnum` is built _from_ that list; it is not a second copy.
- **Custody** — `custodian_person_id`, the present tense. The past is `activity`.

`shared` is an explicit boolean, never derived from "has no custodian". The floor printer is
shared because somebody said so.

## Who sees what

Two different questions, answered in two different places:

- **May they reach the screen?** A capability, gated by `requirePermission` in the route
  (ADR 0007). Nothing in this folder re-checks it for writes.
- **Which rows, and how much of each?** Data, so it lives here. `visibleAssets` builds the `WHERE`
  clause and `view.ts` narrows each row. An `employee` gets their own equipment in full and
  **name and location only** for a shared asset — in the payload, not merely in the markup, which
  is why `SharedAssetView` is a separate type with nowhere to put a serial.

`redaction.db.spec.ts` and `view.spec.ts` are the proof; they are the most important tests here.

## Codes and search

`asset_tag` is `AST-####` from the `asset_code_seq` sequence, **editable**, and the identifier in
the URL (ADR 0010). The generated value is a default, not a constant: #21 imports tags an
organisation already has on its hardware.

`search` on `assets` and `asset_models` is a generated `tsvector` with a GIN index, built with
`simple` + `unaccent` — never the Spanish dictionary, because model names and serials are not
prose. It needs the `immutable_unaccent` wrapper the migration creates: plain `unaccent()` is
`STABLE` and Postgres refuses a non-immutable expression in a generated column.

`unaccent` strips accents; it does not correct typos. `macbook`, `MACBOOK`, `pro` and `pró` all
find a "MacBook Pró"; `mcbook` does not, and would need `pg_trgm`.

## Validation

`validation.ts` generates Zod schemas **from** the Drizzle tables, so a new column cannot leave a
stale validator behind. `organisation_id` is omitted from every input schema: the tenancy scope
comes from the session, never from the payload (ADR 0004).
