# 0036. The handover document is generated once, at decision time, and stored

- **Status:** accepted
- **Date:** 2026-10-20

## Context

A signed handover ([ADR 0035](0035-handover-evidence-and-signing-tokens.md)) is used on the day of
a dispute, by people who do not use Unitati: HR, a lawyer, the employee. What they ask for is a
**file**. The database already holds the evidence. The question is whether a PDF is a stored artefact
or a view rendered on demand, and how it is produced.

The codebase has no PDF generation. File bytes are kept behind a `Storage` interface (local
filesystem by default, `UPLOADS_DIR`), but that interface lives inside `service-desk`, coupled to
ticket attachments. So does the mailer, which only sends plain text. The runtime image is
`node:*-slim`, and Unitati is meant to run anywhere a container runs
([ADR 0025](0025-deployment-agnostic.md)).

## Decision

1. **The PDF is generated once, when the handover is decided**, accepted or rejected, and stored.
   Once a document is stored it is never regenerated or replaced. Its sha256 is stored on the handover beside the storage key. A document
   rendered again on demand would not have the same bytes, so its hash would prove nothing.
2. **It is self-contained:** the organisation's brand, the handover code, its direction, the
   rendered agreement text and its sha256, every asset snapshot, the person's name and email as they
   were, the decision and its reason, the drawn signature, timestamp, IP and user agent, the issuing
   technician, and for a return the condition recorded for each asset. Someone holding only the file
   can read everything the database would tell them.
3. **A copy is mailed at decision time** to the person and to the issuing technician, as an
   attachment, when mail is on. The person receiving their own copy at the moment of signing is
   strong evidence on its own.
4. **Generated in-process with PDFKit**, a pure JavaScript library with flowing text, pagination
   and image embedding. A static font file with full Latin coverage is embedded, so the accents of
   a Spanish or Catalan agreement do not depend on the reader's fonts.
5. **Stored through the same `Storage` interface, promoted to `shared/`.** The handover keeps the
   key and the hash of its document and its signature image. Nothing is copied into the
   `attachments` table: a handover document is not an attachment. Nobody uploads it, it can never be
   replaced, and it can never be deleted. Generalising that table stays deferred; projects and
   tasks got their own tables instead ([ADR 0039](0039-attachments-per-owning-domain.md)).
6. **The mailer moves to `shared/` too, and learns attachments**, because `assets` must send mail
   and may not reach into `service-desk` to do it ([ADR 0002](0002-server-modules-by-domain.md)).

## Consequences

- One new runtime dependency and one embedded font. No browser, no external service.
- A layout change to the PDF applies only to handovers decided after it. Old documents keep their
  old look, which is what makes them evidence.
- Generation runs after the decision commits. If it fails, the decision stands and the handover
  shows that its document is missing. It can be generated later from the frozen evidence, once,
  and that document is the one stored. The evidence is the fact; the document is its certified copy.
- A pending, expired or waived handover has no document, because nobody decided anything.
- Moving `Storage` and the mailer to `shared/` is a prefactor that touches `service-desk` imports and
  nothing else.

## Alternatives considered

- **No stored PDF: the database is the truth and the PDF is rendered on demand.** Rejected: a
  re-rendered file is not the file the employee received, and a hash that changes with the template
  of the day cannot be checked against anything.
- **HTML to PDF through a headless Chromium** (Playwright, Puppeteer). Rejected: hundreds of
  megabytes in a slim image, a browser process to supervise, and the same output reachable with a
  library.
- **pdf-lib.** Rejected: it is a lower-level drawing API, and pagination of flowing legal text would
  be ours to write.
- **Generalising `Attachment` first.** Deferred: it is a refactor with its own decision, and a
  document that can never be replaced or deleted does not share an attachment's lifecycle anyway.
