# Alternatives

Existing products that cover **projects (P)**, **ticketing (T)** and **IT asset management (A)**. The question this answers is whether Unitati needs to exist.

Research date: 2026-10-06. Cells marked _unverified_ were not confirmed against current vendor docs.

## Market map

| Name                           | License                                                 | Self-host            | Stack                       | P                                           | T                 | A                               | UX / key weakness                                                      |
| ------------------------------ | ------------------------------------------------------- | -------------------- | --------------------------- | ------------------------------------------- | ----------------- | ------------------------------- | ---------------------------------------------------------------------- |
| GLPI                           | GPLv3                                                   | Yes                  | PHP / MySQL                 | Full (projects + Gantt)                     | Full              | Full (CMDB, inventory agent)    | Broadest OSS coverage; dense, forms-heavy UI, steep admin curve        |
| iTop                           | AGPLv3                                                  | Yes                  | PHP / MySQL                 | Plugin                                      | Full              | Full (CMDB-first)               | Strong data model; dated UI, rigid XML datamodel                       |
| Odoo                           | LGPLv3 Community; Helpdesk is Enterprise (_unverified_) | Yes                  | Python / JS                 | Full                                        | Full (Enterprise) | Partial (maintenance/equipment) | Modern UI, but an ERP with ITSM bolted on; open-core lock-in           |
| Jira Service Mgmt + Assets     | Commercial                                              | No (Data Center EOL) | Java                        | Full                                        | Full              | Full                            | Powerful; expensive, admin-heavy, cloud-only push                      |
| Freshservice                   | Commercial                                              | No                   | SaaS                        | Full (Pro+)                                 | Full              | Full                            | Modern UX, all three linked; per-seat cost, no self-host               |
| ManageEngine ServiceDesk Plus  | Commercial                                              | Yes                  | Java                        | Full                                        | Full              | Full                            | All three natively on-prem; cluttered, dated UI                        |
| HaloITSM / HaloPSA             | Commercial                                              | Yes (_unverified_)   | .NET                        | Full in PSA, partial in ITSM (_unverified_) | Full              | Full                            | Very configurable but overwhelming; MSP-oriented                       |
| ServiceNow                     | Commercial                                              | No                   | Java / SaaS                 | Full                                        | Full              | Full                            | Enterprise gold standard; very expensive and heavy                     |
| ERPNext + Frappe Helpdesk      | GPLv3 / AGPLv3 (_unverified_)                           | Yes                  | Python / Vue                | Full                                        | Full              | Partial (financial assets)      | Closest modern OSS; generalist ERP, assets are accounting not IT       |
| Request Tracker 6              | GPLv2                                                   | Yes                  | Perl                        | Partial                                     | Full              | Full (built-in Assets)          | Rock solid; old-school UX                                              |
| OTOBO / Znuny                  | GPLv3                                                   | Yes                  | Perl                        | None                                        | Full              | Full (ITSM CMDB)                | Full ITIL; heavy OTRS-era UI                                           |
| Dolibarr                       | GPLv3                                                   | Yes                  | PHP                         | Full                                        | Partial           | Partial (accounting)            | Light coverage of all three; SMB ERP, not IT-focused                   |
| KIX Start                      | GPL/AGPL (_unverified_)                                 | Yes                  | Perl backend (_unverified_) | None                                        | Full              | Full                            | 2024+ rewrite, mobile-first agent app; small community outside Germany |
| FreeITSM                       | MIT                                                     | Yes                  | PHP / MySQL                 | Partial (tasks)                             | Full              | Full                            | New in 2026, solo maintainer; maturity unproven                        |
| Seredina                       | AGPLv3                                                  | Yes                  | TS / Fastify / React / PG   | None                                        | Full              | Full (CMDB, endpoint agent)     | Modern stack, AI copilot, MCP server; v0.3, very early                 |
| Zammad                         | AGPLv3                                                  | Yes                  | Rails / Vue                 | None                                        | Full              | Plugin (i-doit / Snipe-IT)      | Best OSS helpdesk UX; no ITAM or projects                              |
| Redmine + plugins              | GPLv2                                                   | Yes                  | Rails                       | Full                                        | Plugin (paid)     | Plugin                          | Plugin patchwork, fragile integration, old UI                          |
| SuperOps                       | Commercial                                              | No                   | SaaS                        | Full (PSA)                                  | Full              | Full (RMM inventory)            | Modern, AI-heavy; built for MSPs                                       |
| InvGate                        | Commercial                                              | Yes (_unverified_)   | SaaS                        | Partial                                     | Full              | Full (separate product)         | Clean UX; weak projects                                                |
| Snipe-IT / OpenProject / Plane | AGPLv3 / GPLv3 / AGPLv3                                 | Yes                  | Laravel / Rails / Py+React  | Snipe-IT none; others Full                  | None              | Snipe-IT Full; others none      | Best of breed each; the "glue three apps" route                        |

Not individually reviewed: Ralph (ITAM/DCIM only), osTicket and UVdesk (ticketing only), SysAid, Ivanti, SolarWinds Service Desk, Atera and NinjaOne (RMM + ticketing), Lansweeper (discovery only).

## Evaluated and discarded

| Product                                    | Why                                                                    |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| ERPNext / Frappe                           | Generalist ERP; assets are financial, not IT inventory                 |
| GLPI                                       | Covers everything, but the UX is too dated for daily use               |
| Leantime + OpenSupports + Snipe-IT / Shelf | The current setup: three apps, three user lists, no links between them |

## Where the gap is

- **Projects are the missing piece.** Most ITSM suites do tickets and assets well, but projects are weak or a plugin.
- **The OSS suites that cover all three are built on old foundations** (PHP/Perl, forms-first, admin-heavy).
- **Modern OSS tools do one thing each** (Zammad, Plane, Snipe-IT). Gluing them together leads to duplicated directories, broken links between records and no shared search.
- **New entrants exist but are immature** (Seredina, FreeITSM), and neither has projects.
- **Only commercial SaaS offers all three on one data model with modern UX.** Freshservice is the reference to study.

**Niche:** self-hosted, open-source-ready, modern UX, with one data model where tickets, assets and tasks link to each other.

## Watch list

- **Freshservice**: UX and cross-module flows. Reference for what "integrated" should feel like.
- **Seredina**: closest stack and positioning; check whether it adds projects.
- **FreeITSM**: MIT, fast-moving solo project.
- **GLPI**: functional checklist. Its features are a reference, not its UX.

## Sources

- [openmsp: Open Source ITSM 2026](https://www.openmsp.ai/blog/open-source-itsm)
- [Cycloid: Open-Source IT Asset Tracking 2026](https://www.cycloid.io/blog/open-source-it-asset-tracking/)
- [Zammad i-doit integration](https://zammad.com/en/product/features/i-doit-integration)
- [OTOBO CMDB docs](https://doc.otobo.org/manual/packages/ITSMConfigurationManagement/master/en/content/overview.html)
- [Request Tracker (Wikipedia)](https://en.wikipedia.org/wiki/Request_Tracker)
- [iTop Project Management extension](https://www.itophub.io/wiki/page?id=extensions%3Aproject_management)
- [ERPNext (Wikipedia)](https://en.wikipedia.org/wiki/ERPNext)
- [Frappe Helpdesk](https://frappe.io/erpnext/open-source-saas-help-desk-software)
- [Freshservice project management](https://support.freshservice.com/support/solutions/articles/50000003092-get-started-with-project-management)
- [ServiceDesk Plus project management](https://itrtech.africa/blog/it-project-management-servicedesk-plus/)
- [HaloPSA features](https://usehalo.com/halopsa/features/)
- [SuperOps review](https://work-management.org/itsm/superops-review/)
- [InvGate](https://invgate.com/itdb/invgate-service-management)
- [Dolibarr modules](https://doxygen.dolibarr.org/dolibarr_19.0/build/html/modules.html)
- [FreeITSM](https://github.com/edmozley/freeitsm)
- [Seredina](https://github.com/Haphior/seredina)
