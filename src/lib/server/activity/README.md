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

The table, its `CHECK` that exactly one target column is set, and the write helper land with the
first domain that writes into it (#7, slice 2). This folder currently holds the contract only.
