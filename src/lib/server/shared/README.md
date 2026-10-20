# shared

Pure helpers with no domain knowledge. Never imports from a domain folder.

`events.ts` is the in-process domain-event registry (ADR 0023): a domain emits a fact after
commit, another subscribes in `server/subscriptions.ts`, and neither imports the other.

`storage.ts` (the `Storage` interface, local-filesystem and in-memory implementations), `mail.ts`
(`Mailer`, SMTP transport with attachments, `sendQuietly`) and `runtime.ts` (the singletons built from
the environment) are infrastructure any domain may use (ADR 0036). `runtime.ts` is the one file here
that reads the environment.
