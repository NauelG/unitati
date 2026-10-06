# Design system

The visual language of unitati: colour tokens, typography, spacing scales, components
and reference layouts. Open `design-system.html` in a browser to read it.

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
  img/logo-concept.png  Logo exploration, for reference.
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

The extractor refuses to guess. If a handoff carries an asset it never names, extraction
fails and asks you to name it in `UNNAMED`, rather than inventing a filename that would
become a permanent reference the moment the HTML links it. Likewise, if an embedded
stylesheet no longer matches its downloadable copy character for character, it stops:
the copies have already diverged, and picking a winner silently is how a design system
starts lying about itself.
