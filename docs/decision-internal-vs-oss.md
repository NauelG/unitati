# Internal tool vs open source

- **Status:** decided — keep building (2026-10-09)
- **Date:** 2026-10-06 (decided 2026-10-09)

## Options

| Criterion          | Internal tool                    | Open source (self-hosted)                  |
| ------------------ | -------------------------------- | ------------------------------------------ |
| Scope pressure     | Low: only your current workflows | Higher: installers, docs, configurability  |
| Feedback           | One or two organisations         | Community issues, real-world variety       |
| Quality bar        | "Works for us"                   | Upgrades, migrations, security disclosures |
| Maintenance cost   | Low                              | Ongoing (issues, PRs, releases)            |
| Career / portfolio | Invisible                        | Public proof of work                       |
| Monetisation path  | None                             | Hosting, support, open-core (later)        |
| Legal risk         | IP may belong to the employer    | Same, plus the license choice              |

## Decision (2026-10-09)

**Keep building, as recommended below.** Three days of further research — the dated
re-verification in [`alternatives.md`](alternatives.md#re-verification-2026-10-09) — confirmed
the niche is still unclaimed: no existing tool pairs this product's self-hosted/OSS-ready posture
with a modern UX and one data model across tickets, assets and projects. [ADR 0016](adr/0016-ux-and-features-compound.md)
records the corollary this decision depends on: UX and features compound, so the product only
stays worth building if the weaker half keeps getting the work it needs — which is the ten-phase
UI overhaul this decision, read together with ADR 0016, now justifies committing to.

The two sub-decisions below were deferred on 2026-10-06 and **remain explicitly open**: closing
this decision's `Status` does not close them. They need their own trigger (the first public push)
to get resolved, not a calendar date.

## Recommendation

**Build it as "OSS-ready, single-tenant, self-hosted"** and postpone publishing.

An internal tool is a subset of an OSS one. If you design for OSS from day one (env-based config, migrations, no hard-coded company data, English codebase), you can use it internally for free. The reverse needs a rewrite.

Concretely, from day one:

- no company-specific data or names in code; everything goes through configuration or seed data;
- versioned migrations;
- a single `compose.yaml` deploy;
- English code and docs, with i18n for the UI.

## Deferred decisions

- **License, decided before the first public push:**
  - **AGPLv3** protects against closed SaaS forks; companies are wary of it.
  - **MIT** maximises adoption; anyone can make a closed SaaS fork.
  - Reference points: Zammad, Snipe-IT and Plane are AGPLv3; FreeITSM is MIT.
- **Repository visibility:** private until the MVP is usable.

## Risk to check now

If development happens during working hours or on company equipment, review the **IP assignment clause** of your employment contract before publishing anything.
