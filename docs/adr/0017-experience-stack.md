# 0017. Experience stack

- **Status:** accepted
- **Date:** 2026-10-09

## Context

The ten-phase UI overhaul (#81) adds an experience layer — motion, data-viz, toasts, animated
numbers — on top of the foundation phases. Before any of that code lands, the libraries it is
built on need picking, for the same reason [ADR 0011](0011-component-layers-and-the-gallery.md)
picked `tailwind-variants` up front: choosing per-component invites three answers to one question.

The repository already carries `bits-ui`, `mode-watcher` and `tw-animate-css` from day one, all
at zero imports. Nothing forced that choice to be revisited, and without a rule it would not be.

## Decision

### Dependency rule (D12)

**Every dependency has a phase and a first import assigned. Anything still unimported when its
phase closes gets removed.** No dependency sits in `package.json` "for later" — "later" is a
phase number, or the dependency is not in yet.

Applied retroactively: `bits-ui` and `mode-watcher` have been installed since day one with no
import anywhere in `src/`, from before this rule existed. Both are removed now. `mode-watcher`
is not banned — phase 9 (#90, dark mode) assigns it a phase and a first import and will reinstall
it there; removing it now closes the gap where it sat installed and unimported with nothing
tracking when that was supposed to end. `bits-ui` carries no such phase assignment anywhere in
the overhaul plan; if a future phase needs it, that phase installs it fresh, the same way.

### Selected

| Need               | Pick                       | Phase | Why                                                                                                                                                                                                                                                                  |
| ------------------ | -------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Charts / data-viz  | `layerchart@^2.6`          | 9     | shadcn-svelte's own chart base: Svelte-5-native, renders to token-fed SVG, vendors through the same `shadcn-svelte add` pipeline as every other component ([ADR 0011](0011-component-layers-and-the-gallery.md)) instead of a second, differently-styled dependency. |
| Toasts             | `svelte-sonner@^1.2`       | 8     | The de-facto Svelte port of the toast pattern already proven in Sonner; no in-house toast stack to design and maintain.                                                                                                                                              |
| Number transitions | `@number-flow/svelte@^0.4` | 10    | Purpose-built for the one interaction it is used for (an animated number on change); a general animation library would be a second runtime for one effect.                                                                                                           |

### Rejected

| Candidate                     | Role considered   | Why rejected                                                                                                                                                                                                                                                                                                               |
| ----------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chart.js, ECharts, ApexCharts | Charts / data-viz | Each renders to canvas or its own SVG dialect outside the token system; `layerchart` already sits inside the shadcn-svelte vendoring path and reads the same CSS custom properties as every other component.                                                                                                               |
| GSAP, anime.js, Motion One    | General animation | **No second animation runtime.** The north star constitution caps motion at ≤240ms, transform/opacity only, `prefers-reduced-motion` respected globally — `svelte/motion` plus CSS covers that envelope entirely. A second runtime would duplicate what the platform already does for the one thing this product animates. |

### Vendoring

Every one of these libraries that produces UI (not just behaviour) is vendored the same way:
through `shadcn-svelte add` into `src/lib/components/ui/`, per [ADR 0011](0011-component-layers-and-the-gallery.md)
decision 1. There is one pipeline for "a component arrived from outside," not one per library.

## Consequences

The dependency rule is retroactive policy, not a one-time cleanup: the next unimported dependency
found at a phase boundary gets removed the same way, without a separate decision each time.

Three additions (`layerchart`, `svelte-sonner`, `@number-flow/svelte`) and two removals
(`bits-ui`, `mode-watcher`) are scheduled against specific phases of #81, not installed yet. Each
phase's pull request is where the version actually lands in `package.json` and where D12 is
checked against what that phase actually imported.
