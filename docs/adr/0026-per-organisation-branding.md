# 0026. Per-organisation branding

- **Status:** accepted
- **Date:** 2026-10-15
- **Amends:** [ADR 0004](0004-tenancy.md)

## Context

Unitati has to be usable as a white-label product: a customer runs it under their own name, not
ours. [ADR 0004](0004-tenancy.md) listed per-organisation branding as out of scope, and the
internal-versus-OSS decision forbids company-specific names in code, so the answer cannot be a fork
or a constant someone edits. The decisions below come from the planning issue (#157, Q1–Q27) and
are built in slices; this ADR records the whole model, and the first slice (#159) builds the
product name.

## Decision

1. **The brand is edited in the app**, by an administrator, at `/settings/platform/branding`,
   under `organisation.manage`. It applies without a redeploy.
2. **It belongs to the organisation**, stored 1:1 in `organisation_branding`, owned by the
   `directory` domain. No row means the default brand; the row is created on first save, never on
   setup.
3. **Customisable:** product name, horizontal logo (light and optional dark cut), symbol, favicon
   and apple-touch-icon (both derived), and one brand colour. **Not customisable:** fonts, radii,
   domain colours, state colours, the login tagline, email templates, custom CSS, custom domain.
4. **The product name** is required, trimmed, 1–40 user-perceived characters (graphemes, not UTF-16
   units), default "Unitati". It replaces the old `app_name` message everywhere. The OpenAPI title,
   `MAIL_FROM` and mail bodies keep "Unitati": they name the software or are operator settings.
5. **Golden rule.** Once the brand is _customised_ (it differs from Unitati's default), Unitati's
   art never shows. Without uploaded assets a text wordmark replaces the lockup and a monogram
   replaces the mark, as HTML rather than generated images.
6. **One colour, derived.** The administrator picks a single hex; the rest of the family is derived
   in OKLCH so text contrast holds in both themes. The primary action stays ink.
7. **Assets live in the database** (`bytea`), processed before storage, and only the processed result
   is kept. They reference `organisation_branding` with `ON DELETE CASCADE`.
8. **"Powered by Unitati" cannot be removed:** no setting, env var or prop. It shows only when the
   brand is customised.
9. **The brand reaches every page through SSR.** A root `+layout.server.ts` loads it, so there is no
   flash of the wrong brand. `/login` and `/setup` have no session, so a public resolver returns the
   installation's single organisation (N=1, ADR 0004). Before setup there is no organisation and
   the default brand is shown.
10. **Brand changes write no activity entry**: configuration audit belongs to #39.

## Alternatives rejected

- **Environment variables per installation.** Every change needs the operator, and the setting is
  instance-scoped, so it would be rewritten for multi-tenancy (#42).
- **A build-time fork per customer.** The opposite of white-label for an open-source product.
- **Files on disk through `Storage`.** It needs `UPLOADS_DIR` and would move `Storage` out of
  `service-desk`; at most three small files fit comfortably in `pg_dump`.
- **Editing individual colour tokens.** Too many ways to break contrast.

## Consequences

- One N=1 assumption lives in the public resolver (`getBrand(null)` takes the first
  organisation). It is revisited with #42.
- `sharp` becomes a native dependency once the asset slices land (#161).
- The brand is cached in memory per organisation and invalidated on write. That assumes a single
  Node process: several replicas would need invalidation across processes, or a short TTL.
- The table's `CHECK` on `product_name` counts code points (`char_length`), and one grapheme can be
  several (a ZWJ emoji is five). The bound is therefore a loose backstop (400); the 40-grapheme
  rule is enforced in the domain.
- Until the favicon slice (#162) ships, the browser favicon stays Unitati's even when the name is
  customised.
