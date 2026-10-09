# activity

What happened, to which record, and when. Cross-cutting rather than a domain: it owns one table
that every domain writes into, and nothing in it knows what an asset or a ticket is (ADR 0009).

A row holds a **verb** — the canonical key of what happened, never a rendered sentence — and a
**payload** whose shape the verb decides. `verbs.ts` is the vocabulary, `payload.ts` the contract
that turns a `jsonb` column into one, and `$lib/components/unitati/activity.ts` turns an entry
into words through paraglide.

Adding a verb means three edits, and the compiler insists on all three: the list in `verbs.ts`,
its shape in `payload.ts`, and its case in the renderer. Miss either of the last two and
`npm run check` fails.

**Entries are written by the domain function that caused them, inside that domain's own
transaction.** An action and its history commit together, because custody assigned without its
entry is worse than neither: it is a history that cannot be trusted, and one that cannot be
trusted is not read.

## The table

`schema.ts` holds it, and it arrived with the first domain that writes into it (#7, slice 2)
rather than with the contract — because its foreign key to `assets` had to exist from its first
migration. Added later it would have left a window in which history could point at an asset that
never existed.

Five nullable target columns and a `CHECK` that **exactly one** is set, written as a sum of casts
rather than a chain of `OR`s so that two targets are refused as well as none. `asset_id` and
`person_id` and `ticket_id` carry their foreign keys now; `task_id` and `project_id` are columns
waiting for #10, and they already satisfy the constraint.

Both the `activity_verb` `pgEnum` and the `CHECK` are derived from `verbs.ts` — the enum from
`ACTIVITY_VERBS`, the constraint from `ACTIVITY_TARGETS` indexed against the real columns, so a
name in that list with no column fails to compile.

## Writing and reading

`recordActivity` takes a **`Transaction`, not a `Database`**. That is the ADR's "same
transaction" rule expressed in a type rather than in a comment: a caller who has not opened one
cannot call it. The payload is validated with Zod on the way in, because `jsonb` would take any
shape and the union only binds data that came through that gate.

`listActivity` reads a record's entries back, newest first. It is the _events_ half of a timeline
only: ADR 0009 merges live relations in at read time, from `links.relatedTo`. The two
link verbs hang off the ticket, so an asset's timeline reads its tickets from the live relation.
