---
name: Feature or slice
about: A unit of work specified well enough for an agent to implement unattended
title: ''
labels: ''
assignees: ''
---

<!--
The contract for this body lives in docs/agents/issue-tracker.md.
Written in English. Delete this comment before submitting.

An AFK agent reads this body and nothing else: what the body omits, the agent invents.
-->

One or two sentences: what this is and why it exists.

## Context

Why now, what it unblocks, which decisions already constrain it.

## Scope

- Each bullet is a deliverable, not an aspiration.

## Out of scope

Not optional. An omission with no reason comes back as an argument every quarter.

- **Thing deliberately absent** — the reason, and where it belongs instead (issue number or tier).

## Data model

Real tables, columns, types, foreign keys and constraints, with the owning domain (ADR 0002).
"A table for custody" is not a data model; it is a wish.

## Done when

Verifiable criteria. If a human has to judge whether one passed, it is not a criterion.

- [ ] …

## Verification

```bash
npm run check
npm run lint
npm test
```

Plus any step no command can cover.

## References

- ADRs, docs, and existing files this work must follow or extend.
