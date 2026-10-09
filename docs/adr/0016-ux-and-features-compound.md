# 0016. UX and features compound

- **Status:** accepted
- **Date:** 2026-10-09

## Context

Two documents already pointed the same way without saying so out loud.
[`alternatives.md`](../alternatives.md) rejects GLPI on UX alone — it "covers everything, but the
UX is too dated for daily use" — even though GLPI already ships ticket↔asset links, the relation
this product is built on. [`vision.md`](../vision.md) states "the relations are the product," but
a product can have the right relations and still lose to a tool nobody wants to open.

A UX/architecture audit against `v0.10.0` (2026-10-09) made the gap concrete: ~58% of the desktop
viewport used against ~90% in the two tools this product replaces, six different page containers
across 15 routes, zero motion/keyboard/perceived-speed primitives, about a third of the design
system's vocabulary implemented. None of that is a missing feature — the ticket↔asset relation
already works. It is the surface the relation is delivered through.

GLPI is the proof by counter-example: capability without legibility does not win. The risk on the
other side is symmetric and just as real — legibility without capability does not win either, and
a redesign that never ships the relations is a different kind of nothing.

## Decision

**UX is as important as the features; the differentiator is the sum, not either alone.**

Formulated by the user, 2026-10-09: "UX is as important as the features; the differentiator is
the sum."

Consequence for sequencing — and this is the rule the parent overhaul issue cites as its
justification: **work goes to whichever half is currently weaker.** At `v0.10.0` that is the UX
(the audit numbers above), so the ten-phase UI overhaul precedes further feature slices. This is
not a UX-first doctrine: the rule is symmetric. When the UX reaches bar, the same rule sends work
back to features the moment they become the weaker half. Whichever side is weaker is read from
evidence (an audit, a measurement, a user complaint), not asserted from a role or a preference.

## Consequences

Roadmap ordering stops being a standing debate between "ship features" and "polish UI" — it is a
measurement question, re-askable at any time: which half is weaker right now? That requires the
weaker half to be measurable, which is why the audit produced numbers (viewport %, container
count, primitive count) rather than an opinion.

This ADR is the justification the ten-phase UI overhaul issue (#81) cites for running before the
next feature slice. The ADRs that phases 1 and 2 of that overhaul write are owned by their own
phases, because they justify code landing in the same pull request; this ADR owns the sequencing
rule itself, which belongs to no single phase and is written down here instead.
