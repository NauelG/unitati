# shared

Pure helpers with no domain knowledge. Never imports from a domain folder.

`events.ts` is the in-process domain-event registry (ADR 0023): a domain emits a fact after
commit, another subscribes in `server/subscriptions.ts`, and neither imports the other.
