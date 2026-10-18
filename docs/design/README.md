# Design system

The visual language of unitati: colour tokens, typography, spacing scales, components
and reference layouts. Open `design-system.html` in a browser to read it.

The radius grammar, typography roles and three-surface vocabulary (canvas / primary work
area / secondary panel) are recorded as a decision in
[ADR 0019](../adr/0019-visual-language-and-work-surfaces.md); the files under `assets/` below
are the implementation of that decision, not a second description of it.

**`design-system.html` is the handoff's own reference; `/dev/components` is where that
reference becomes enforced.** The gallery ([ADR 0011](../adr/0011-component-layers-and-the-gallery.md))
renders every `unitati/` component's real variants and states, derives its coverage page from
`assets/css/components.css` directly, and a regression guard fails the build if a new component
ships without a gallery page. The two are meant to agree; when they do not, `/dev/components`
describes the decisions reviewers have actually approved, and this reference is what is due to
catch up at the next handoff.

## Layout

```
design-system.html      Generated. The documentation page.
extract-assets.mjs      Unpacks a handoff into the files below.
assets/
  tokens.json           Every token with its light/dark value and a written usage note.
  css/tokens.css        The tokens as custom properties. Nothing else defines a colour.
  css/components.css    Component styles, prefixed ut-. Values come from tokens.css.
  css/docs-page.css     Chrome of this documentation page only. Not part of the system.
  brand/*.svg           Marks, wordmarks, lockups and app icons.
  icons/*.svg           Lucide icons used across the interface.
  img/logo-concept.*    Logo exploration, for reference. AVIF, with WebP behind it.
```

`css/docs-page.css` exists to style the documentation you are reading. It is deliberately
kept apart: its `bk-` prefix never appears in the product, and importing it into the
application would be a mistake.

## Editing

Edit the files under `assets/`. They are the source of truth.

Do not hand-edit `design-system.html`: it is regenerated from the next handoff and your
changes would be overwritten. Change the markup in the handoff instead, or edit the
stylesheets, which is where appearance actually lives.

A token changes in exactly two places, together: `assets/tokens.json` (the value and its
usage note) and `assets/css/tokens.css` (the custom property). Components must never
hardcode a colour; they reference `var(--token)` so that light and dark themes keep
working.

## Typography

Every size is a named role, a single Tailwind utility that sets size, line-height, tracking and
weight together. The family stays separate (`font-display`, `font-sans`, `font-mono`). Roles come
from `assets/tokens.json` `type.groups` and are defined in `src/app.css` `@theme inline`.

| Utility          | Size / line-height | Tracking  | Weight | Family  | Use                                          |
| ---------------- | ------------------ | --------- | ------ | ------- | -------------------------------------------- |
| `text-display`   | 36 / 42            | `-0.02em` | 700    | display | Login pitch line, one per screen             |
| `text-title-1`   | 24 / 30            | `-0.02em` | 600    | display | Module index page title                      |
| `text-title-2`   | 18 / 26            | `-0.01em` | 600    | display | Record title in a detail view                |
| `text-title-3`   | 16 / 22            | -         | 600    | sans    | Panel, dialog and sheet headings             |
| `text-body-lg`   | 16 / 24            | -         | 400    | sans    | Long-form text: ticket thread, composer      |
| `text-body`      | 14 / 20            | -         | 400    | sans    | Default UI text (`text-sm` is the same)      |
| `text-label`     | 13 / 16            | -         | 500    | sans    | Form labels, button text, breadcrumbs        |
| `text-small`     | 13 / 18            | -         | 400    | sans    | Metadata, helper text, errors                |
| `text-caption`   | 12 / 16            | `0.04em`  | 600    | sans    | Column headers, badges (sentence case)       |
| `text-record-id` | 12 / 18            | `-0.01em` | 500    | mono    | Record tags; add `tabular-nums` where needed |
| `text-mono`      | 11 / 16            | -         | 400    | mono    | Version, serials, keyboard hints             |

`body-strong` is `text-body font-medium`. No arbitrary `text-[Npx]` or `leading-[Npx]` outside the
vendored `ui/` folder: if a role is missing, add it to `app.css` and `tokens.json` in the same
change. `src/lib/components/unitati/type-roles.guard.spec.ts` enforces this. Components build
classes with `tv` from `#lib/tv.js`, which teaches tailwind-merge that a role is a font size and not a
colour.

## Spacing

`--space-N` custom properties and Tailwind numerals (`mb-2`, `py-2`, `gap-1`) spell the same
values: Tailwind's 4 px base equals `--space-N`. Decision: `unitati/` components use
`[var(--space-N)]`, because they are the handoff made code; routes may use Tailwind numerals for
layout glue, but never for a value that `tokens.json` names (the padding of a panel, the gap of a
form row). There is no repo-wide rewrite; the rule only stops new drift.

## Unpacking a new handoff

Design handoffs arrive as one self-contained HTML file with every asset inlined as a
base64 `data:` URI and the stylesheet duplicated into a `<style>` block. That shape costs
us three things: diffs become unreadable, the assets cannot be used from application code,
and the duplicated CSS lets the rendered examples and the downloadable stylesheet drift
apart without anyone noticing.

So each handoff gets unpacked:

```sh
node docs/design/extract-assets.mjs path/to/new-handoff.html
node docs/design/extract-assets.mjs --check    # report only, write nothing
```

This rewrites `assets/` and leaves an HTML shell that links those files. The CSS that
renders the examples is then the same file you would download, so the two cannot diverge.

Photographs are re-encoded to AVIF and WebP and emitted as a `<picture>`, with WebP on the
`<img>` because every browser renders it. That needs `avifenc`, `cwebp` and ImageMagick:

```sh
sudo apt install libavif-bin webp imagemagick
```

Without them the image falls back to a losslessly recompressed PNG, which needs nothing but
Node. The page renders either way; only its weight changes. Each re-encoding must come out
both smaller and above an SSIM of 0.97 against the original, so an encoder that misbehaves
is dropped rather than shipped unseen. The concept render measures 0.9945.

Vector assets are never re-encoded. The logo files under `brand/` are the authoritative
artwork, and they stay byte-identical to what the designer exported.

The extractor refuses to guess. If a handoff carries an asset it never names, extraction
fails and asks you to name it in `UNNAMED`, rather than inventing a filename that would
become a permanent reference the moment the HTML links it. Likewise, if an embedded
stylesheet no longer matches its downloadable copy character for character, it stops:
the copies have already diverged, and picking a winner silently is how a design system
starts lying about itself.
