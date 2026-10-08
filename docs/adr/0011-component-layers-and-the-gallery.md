# 0011. Component layers and the gallery

- **Status:** accepted
- **Date:** 2026-10-08

## Context

The design system names ten components. Two existed, and both lived in
`src/lib/components/ui/` — which is also where `components.json` points shadcn-svelte's `ui`
alias. The first `shadcn-svelte add button` would have written `ui/button/` beside a
hand-written `ui/Button.svelte`: two things called Button, one vendored and one ours, in one
folder.

Those two components also composed Tailwind class strings by hand with template literals, while
`tailwind-variants` sat installed and unused. An agent reading them for reference copies the
pattern, and conditional class concatenation is where conflicting utilities silently fight.

Slices 2, 3 and 5 each ship a list screen. Without a table delivered once, all three build one.

## Decision

1. **Two folders, two owners.**
   - `src/lib/components/ui/` holds `shadcn-svelte add` output and nothing else. It is in
     `.prettierignore`, so it stays byte-identical to upstream and diffable against the next
     `add`. Never hand-edited; composed around.
   - `src/lib/components/unitati/` holds our design-system components. Formatted, linted and
     reviewed like any other code.
2. **`tv()` builds every class string** under `unitati/`. No template-literal concatenation:
   tailwind-variants resolves conflicting utilities and keeps a variant table readable as a
   table. A positional or conditional style is a variant, not an `if` returning a string.
3. **Colour only through a token.** `var(--brand)`, never a hex literal. `src/app.css` is the
   one place a colour is defined.
4. **A component that is not in the gallery is not finished.** `/dev/components` renders every
   variant and every state of everything in `unitati/`. It exists in every environment but
   production: its `load` returns 404 there. _(Originally "only in development", gated on `dev`;
   amended by [ADR 0013](0013-app-env-and-the-non-production-surface.md), because staging runs
   the production build.)_
5. **Status arrives as a key, never as display text.** `unitati/status.ts` holds the vocabulary
   and maps each key to a tone and a message function, so a label stays translatable and a typo
   fails `npm run check`.
6. **`components.json` aliases use `#lib`.** This repo addresses `src/lib` through Node subpath
   imports (ADR 0001), and `shadcn-svelte` validates its aliases against resolvable paths: with
   `$lib` the CLI refuses to run at all.

## Consequences

The gallery is a maintenance cost paid deliberately: a component gains a section, a variant
gains an example. In exchange there is one place where a reviewer sees the whole set, which is
the only way a drifting component gets noticed.

The route survives a production build as an unreachable stub. SvelteKit discovers routes from
the filesystem and its config offers no route-exclusion option, so "no file, no route" is the
only way to make one truly absent. The 404 is the guarantee; the stub is dead weight.

The status vocabulary in `status.ts` currently has no server-side counterpart, because the
`assets` and `service-desk` tables do not exist yet. When they land (#7, #8) their columns must
reference these same keys, or there will be two vocabularies to keep in step.
