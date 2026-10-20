# 0035. A handover is its own record, signed through a single-use link

- **Status:** accepted
- **Date:** 2026-10-20

## Context

Custody today is a technician recording a fact: `assignCustody` sets
`assets.custodian_person_id` and writes `custody.assigned` to `activity`
([ADR 0009](0009-activity-log.md)). Nobody on the receiving end confirms anything. When a laptop
goes missing, the first question HR or a lawyer asks is _where did the employee sign for it_, and
the honest answer is "nowhere" (#25, roadmap v1).

Four facts about the codebase shape the answer:

- A `Person` may have no `users` row, and the portal requires one. Most people who receive
  equipment cannot sign in.
- Every person has an email (`people.email` is `NOT NULL`), but mail is optional: with no SMTP host
  the mailer is `null` ([ADR 0006](0006-email-and-password-authentication.md)).
- Custody is sometimes recorded with no confirmation at all, and has to stay possible (executives,
  equipment handed over before Unitati existed).
- There is no scheduler: no cron, no queue, no background jobs.

## Decision

1. **A handover is a record of its own, beside custody, never instead of it.** Custody is the
   physical fact; a handover is the receiving person's statement about it. Assigning or returning
   custody never waits on a signature, and rejecting a handover never undoes custody. The technician
   resolves a rejection by returning the custody or by issuing a new, corrected handover.
2. **One handover covers every asset of one operation.** It has a direction, `delivery` or
   `return`, one person, and N assets. It is required when **at least one** of those assets belongs
   to a category marked _requires handover_, and it then lists **all** of them.
3. **States:** `pending`, `accepted`, `rejected`, `waived`. `expired` is never stored: a pending
   handover whose `expires_at` has passed _is_ expired, computed at read time. A decided handover
   never reopens. Correcting one means issuing a new one, the same way a page revision is never
   edited ([ADR 0031](0031-knowledge-base-spaces-page-tree-and-revisions.md)).
4. **Signing goes through a single-use link, never through a session.** The handover carries a
   token of 32 random bytes; only its sha256 is stored, the same treatment API keys get
   ([ADR 0022](0022-api-layer-and-api-keys.md)). The token expires after 14 days by default
   (configurable per organisation), is consumed by the decision, and **resending replaces it**, so
   the previous link stops working. The link is mailed to the person's email when mail is on. In
   every case the technician can copy it or show it as a **QR code** for in-person signing. That
   covers organisations without SMTP, and it puts the signature on the signer's own device, so the
   IP and user agent recorded are theirs and not the technician's.
5. **No one-time code by email.** It would go to the same inbox as the link, so it adds friction
   without adding a second factor.
6. **The evidence is a set, frozen at decision time:** the decision (accept, or reject with a
   mandatory reason); a drawn signature for an acceptance; the timestamp, IP and user agent; the
   person's name and the destination email _as they were_; a snapshot of every asset (tag, name,
   serial, model); and the **literal rendered text** of the agreement with its sha256. This is a
   simple electronic signature under eIDAS. Its weight comes from the evidence around it, not from
   the drawing.
7. **The agreement text is a versioned template.** One global template per direction, with an
   optional override per category, maintained under `/settings/assets/`. Editing appends a version
   and never rewrites one. A handover points at the version it used _and_ keeps its own rendered
   copy, so a template edited tomorrow cannot change what someone signed yesterday. When the
   handover's assets that require it span categories with different overrides, the global template
   applies.
8. **Waiving is a permission, not a checkbox.** `assets.handover.waive` (admins by default) records
   a `waived` handover with a mandatory reason, written to `activity` like any other outcome. If
   every technician could waive, nobody would ask for a signature.
9. **On return, the technician's signature is their authenticated action.** They record the
   condition of each asset and confirm; the session already proves who they are. The employee signs
   the return through the same link. If they never do, the custody is still returned and the
   handover stays pending, then expired, and visible.
10. **No reminders until a scheduler exists.** Expiry is exact without one. The handover list shows
    what is pending, rejected or expired, with a resend action. Automatic reminders wait for the
    scheduler SLAs will need anyway.
11. **Handovers are kept indefinitely and never deleted.** Signature, IP and user agent are personal
    data, held on legitimate interest and legal obligation for as long as the employment
    relationship and its legal claims last. A handover's foreign key to `people` is `restrict`, and
    the snapshot in decision 6 means a renamed person does not rewrite what they signed.

## Consequences

- `assignCustody` keeps its invariant: an asset somebody holds is refused, and a handover never
  produces two holders.
- The signing page is the first route that serves data to someone with no session. It lives
  outside `(app)` and `(portal)`, under the organisation's brand
  ([ADR 0026](0026-per-organisation-branding.md)), and the auth and password-change redirects in
  `hooks.server.ts` must let it through. Tokens are never logged.
- A consumed link must still answer "already decided" rather than "unknown", so the decision moves
  the hash from `token_hash` to `consumed_token_hash` instead of discarding it (#275). Neither
  column ever holds the token itself.
- Its interface is in the UI language ([ADR 0008](0008-ui-language.md)); the agreement is in
  whatever language the organisation wrote it.
- Custody becomes multi-asset in one transaction: N custodies and their handover commit together,
  and the mail goes out after the commit. A failed send leaves a pending handover that can be
  resent, never a custody with no handover.
- `assets` emits `handover.accepted` and `handover.rejected` after commit
  ([ADR 0024](0024-in-process-domain-events.md)). `service-desk` reacts by adding an internal note
  to any ticket linked to the handover, and never closes the ticket: that is each organisation's
  policy, not ours.

## Alternatives considered

- **Custody pending until signed**, as Snipe-IT does with checkout acceptance. Rejected: the laptop
  has left the store whether or not the employee signs, and a model that says otherwise lies about
  where the equipment is.
- **Signing in the portal.** Rejected: it excludes exactly the people with no credential, who are
  most of the people receiving equipment.
- **Signing on the technician's screen.** Rejected: the IP and user agent would be the technician's,
  which is the evidence least worth having. The QR code gives in-person signing without that cost.
- **One handover per asset.** Rejected: real handover forms list everything handed over, kits are
  on the roadmap, and moving from one asset to N later is a migration.
- **An advanced or qualified signature provider** (Signaturit, DocuSign). Deferred: cost and an
  external dependency that most organisations do not need for a laptop. The evidence set does not
  prevent adding one later.
- **The technician decides each time whether to ask.** Rejected: in practice nobody would ask, and
  the audit value is gone.
