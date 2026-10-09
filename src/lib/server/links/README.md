# links

Typed relations between records of different domains (ticket → asset, ticket → task, project → asset). Owns the cross-domain graph so no domain has to know another domain's tables. See `docs/domain-model.md` and ADR 0005.

| File              | Owns                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `schema.ts`       | One join table per pair, each with real foreign keys: today `ticket_asset`                |
| `ticket-asset.ts` | `linkAsset` (inside the caller's transaction) and `unlinkAsset` (behind `tickets.manage`) |
| `related.ts`      | `relatedTo(viewer, record)`: the uniform read facade over every relation                  |
| `index.ts`        | The public surface: callers import from here and never from a file inside                 |

## Decisions worth knowing before changing this

- **The interface is generic; the storage is not.** `relatedTo` returns the same `RelatedGroup` shape whichever table answered, which is what lets `RecordRef` and `RelatedRecords` stay ignorant of storage. There is no `kind` column and no polymorphic `link` table: the relation _is_ the table.
- **A relation is live, activity is the past.** `relatedTo` reads each record's status from the record itself, so resolving a ticket changes what the asset page shows without any write to the asset. `link.asset.added` and `link.asset.removed` are recorded against the **ticket** only; recording them on the asset too would put the ticket in the asset's timeline twice, once of them stale.
- **You attach what you can see.** `linkAsset` asks `assets` (`requireAssetScope`) whether the actor may see the asset, so an employee can attach the laptop they hold or a shared printer and nothing else, whatever the form posted. Rules stay in their domain; `links` composes them.
- **An asset's tickets are history.** `relatedTo` returns no ticket group to anyone without `tickets.view` (ADR 0007: the shared view never shows history).
- **The pair is unique** so ticket merge and split (#20) cannot land the same link twice. `linkAsset` uses `ON CONFLICT DO NOTHING` and answers `already_linked`, because a unique violation would abort the transaction a ticket is being opened in.
- **Allowed to import two other domains' tables.** That is the job: a foreign key to both sides is what the database needs to refuse a link to nothing. `activity` makes the same trade.
