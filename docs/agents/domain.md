# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This repo is **single-context**: one domain model, one ADR directory.

## Before exploring, read these

- **`docs/domain-model.md`**: the domain vocabulary for this repo. It plays the role that `GLOSSARY.md` plays in other repos; there is no root `GLOSSARY.md` and none should be created.
- **`docs/adr/`**: read the ADRs that touch the area you're about to work in.

If a file you expect doesn't exist, **proceed silently**. Don't flag its absence and don't suggest creating it upfront.

## Where new terms and decisions go

- A new or sharpened term goes into `docs/domain-model.md`. Never into a new `GLOSSARY.md`: a second vocabulary file would split the source of truth.
- A new architectural decision goes into `docs/adr/NNNN-title.md`, numbered after the highest existing ADR.

`/domain-modeling` (reached via `/grill-with-docs` and `/improve-codebase-architecture`) writes both lazily, when a term or decision actually gets resolved.

## File structure

```
/
├── docs/
│   ├── domain-model.md   ← the glossary
│   └── adr/              ← architectural decisions
└── src/
```

## Use the domain model's vocabulary

When your output names a domain concept (an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `docs/domain-model.md`. Don't drift to synonyms the domain model explicitly avoids.

If the concept you need isn't there yet, that's a signal: either you're inventing language the project doesn't use (reconsider), or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0002 (server modules by domain), but worth reopening because…_
