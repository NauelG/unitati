# assets

IT asset management: assets, models, categories, custody (check-out / check-in). Later: kits,
licences and consumables.

A decided handover has one stored PDF (`handover-documents.ts`, ADR 0036). `decideHandover`
generates it after the decision commits; `ensureHandoverDocument(id)` repairs a missing one and
never replaces an existing file. `renderHandoverDocument` takes only frozen evidence and returns
PDF bytes. `/handover-documents/[id]` serves those stored bytes to staff with `assets.view` and
to the signer with `assets.view.own`. The installation's `ORGANISATION_TIME_ZONE` supplies the
local decision time alongside UTC; no database row or attachment row is created for the file.

Reading handovers back is `handover-list.ts`: `listHandovers`, `getHandover`, `listOwnHandovers`
and `custodyHandover`. A handover's state comes only from `deriveHandoverState`
(`src/lib/domain/handover.ts`): `expired` is a pending handover past `expires_at`, never stored.
`resendHandover` (`handover-resend.ts`) swaps the token hash and the expiry on a pending or
expired handover and writes `handover.resent`.

Files on an asset (`attachments.ts`, ADR 0039) live in `asset_attachments`: invoice, warranty,
delivery note. Same limits as everywhere (5 files, 10 MiB each) and the same bytes-first, rows-second
discipline as projects. Reading is for `assets.view` only: a viewer restricted to own or shared
assets gets `asset_not_found`, because an invoice carries a price and a supplier. Writing trusts the
route's `assets.manage` gate. Downloads are `/asset-attachments/{id}`, always `attachment`; each add
and remove writes `asset.attachment.*` with the filename as a snapshot.

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

Two exports exist for other domains, so they never restate these rules: `requireAssetScope` (the
`WHERE` for "may this person see this asset", which `links` composes when somebody attaches one)
and `listAssetChoices` (id, tag and name for the pickers on the ticket forms). The second exists
because a shared row carries no uuid and a link needs one; it only returns rows that passed the
same scope, and matches partial words (`ilike`) because a picker filters as you type, on the same
surface the viewer can see: an employee cannot discover a model through it.

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

## Screens

Under `src/routes/(app)/assets/`: `/assets` (list, search, pager), `/assets/new`,
`/assets/[tag]` (detail, with the custody, state, location and note actions, and the timeline),
`/assets/[tag]/edit`. The catalogues live under `/settings/assets/` (models, categories,
manufacturers); the old `/assets/...` catalogue paths answer a 308 to them.

Three rules the screens keep, each of which cost a bug to learn:

- **A reference that arrives from a form is checked against the organisation.** A foreign key
  proves a row exists, not that it is yours. `registerAsset`, `updateAssetDetails` and the
  catalogue writes look the model, manufacturer, category and location up inside the actor's
  organisation, and answer `*_not_found` otherwise.
- **Custody, state and location are never form fields.** They are events, and go through
  `assignCustody`, `changeState` and `changeLocation` so each writes its history entry.
  `forms.ts` deliberately omits `custodianPersonId`.
- **A denial is a 404.** `requireAnyPermission` reaches `/assets` for any of the three read
  permissions; the catalogue and every write need `assets.manage` (custody needs
  `assets.checkout`, and waiving the handover a delivery requires needs `assets.handover.waive`,
  admins only).

## Seed

`npm run db:seed` — see [`../seed/README.md`](../seed/README.md).
