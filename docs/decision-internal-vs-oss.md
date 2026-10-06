# Internal tool vs open source

- **Status:** open
- **Date:** 2026-10-06

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
