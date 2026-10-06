# 0008. Spanish UI, English codebase, translatable from the first screen

- **Status:** accepted
- **Date:** 2026-10-06

## Context

Code, comments and documentation are in English (`AGENTS.md`). The design system is written
in English. The first user of the product is Spanish-speaking, and
[internal vs open source](../decision-internal-vs-oss.md) anticipates "English code and
docs, with i18n for the UI" while the roadmap kept i18n as a later concern.

Leaving i18n for later is the decision that quietly gets expensive: retrofitting it means
revisiting every component in the product to extract strings, one at a time. It is a dull,
error-prone day of work, which is exactly the kind of work that keeps being postponed.

## Decision

The interface ships in **Spanish (es-ES)**, and every string is externalised through
Paraglide from the first screen.

- Message keys are English (`m.ticket_create()`), consistent with the codebase.
- `es-ES` is the only locale in the MVP; `en` is a v1 item.
- Code, comments, documentation, ADRs, commit messages, database identifiers and API
  payloads stay in English.

## Consequences

- Adding a language is adding a file, not touching the product.
- The marginal cost is near zero because it is paid from the first component; the same work
  done later costs a full pass over the UI.
- Paraglide is already in the planned stack ([ADR 0001](0001-stack-and-architecture.md)), so
  this adds no new dependency.
- A single locale carries no synchronisation burden: there is no second file to drift.
- Shipping only Spanish limits open-source adoption. That is accepted for now and cheap to
  reverse — precisely because the strings are already externalised.
- Reviewers will see English keys rendering Spanish text. That is intended: the key is an
  identifier, not a translation.
