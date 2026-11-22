# Providers, Pricing & Renovation Execution

[Library home](README.md) · [Flags](FLAGS.md)

23 documents. Flag key: 🔴 conflicting/superseded · 🟠 status lags reality or cites missing code · 🟡 historical snapshot. Blank = no issue found (not proof it is current - check *Last changed*).

## Requirements (FRD/PRD) (4)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
|  | [Provider Portfolio & Availability — Functional Requirements Document](../functional/PROVIDER_PORTFOLIO_AVAILABILITY_FRD.md) | Phase 1 (backend CRUD) and Phase 2 (frontend wiring, items 1-3) implemented.** S | 2026-08-21 | 301 |
|  | [Provider Profile Management — Functional Requirements Document](../functional/PROVIDER_PROFILE_MANAGEMENT_FRD.md) |  | 2026-08-21 | 122 |
|  | [Provider Reviews — Functional Requirements Document](../functional/PROVIDER_REVIEWS_FRD.md) |  | 2026-08-21 | 81 |
|  | [Provider Trust & Compliance Verification — Functional Requirements Document](../functional/PROVIDER_TRUST_COMPLIANCE_FRD.md) |  | 2026-07-07 | 568 |

## Feature reference (5)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
|  | [Renovation Workspace and Requirements Advisor](../functional/HOME_RENOVATION_RISK_ADVISOR.md) | v1.0.0 · Production | 2026-07-29 | 950 |
|  | [Service Quote Decision and Service Price Radar](../functional/SERVICE_PRICE_RADAR.md) | Implemented | 2026-07-28 | 414 |
|  | [DIY Project Center](../functional/DIY_PROJECT_CENTER.md) |  | 2026-06-27 | 1711 |
| 🟡 | [Negotiation Shield](../functional/NEGOTIATION_SHIELD.md) |  | 2026-03-13 | 608 |
| 🟡 C12 | [SERVICE_CATEGORY_CONFIG TABLE - COMPLETE IMPACT ANALYSIS](../functional/SERVICE_CATEGORY_CONFIG_ANALYSIS.md) |  | 2026-01-03 | 493 |

## Audit / analysis (2)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
| 🟠 C9 | [Renovation Compliance and Execution Capability Audit and Implementation Plan](../product/RENOVATION_COMPLIANCE_AND_EXECUTION_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md) | Recommended implementation plan<br> | 2026-07-29 | 1697 |
|  | [Service Price Radar Capability Audit and Implementation Plan](../product/SERVICE_PRICE_RADAR_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md) | Implemented; database reconciliation remains operator-owned | 2026-07-28 | 1450 |

## Status / phase record (3)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
|  | [Renovation: the project handoff in Ask — design](../architecture/RENOVATION_PROJECT_HANDOFF_IN_ASK_DESIGN.md) | v1.371 · Decisions ruled by the owner on October 13, 2026 (§7, which supersedes §4 and th | 2026-10-13 | 159 |
|  | [Live Project Execution Tracker](../functional/LIVE_PROJECT_EXECUTION_TRACKER.md) |  | 2026-10-11 | 606 |
|  | [Service Quote Decision Capability Manifest](../product/capability-discovery/SERVICE_QUOTE_DECISION_MANIFEST.md) |  | 2026-07-28 | 78 |

## Runbook / ops (9)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
|  | [DIY project commands: rollout (step 7 of the stateful GUIDE)](../operations/DIY_PROJECT_COMMANDS_ROLLOUT.md) |  | 2026-10-07 | 67 |
|  | [DIY project guide: rollout (step 5 of the stateful GUIDE)](../operations/DIY_PROJECT_GUIDE_ROLLOUT.md) |  | 2026-10-07 | 55 |
|  | [DIY project start from Ask: rollout (step 8 of the stateful GUIDE)](../operations/DIY_PROJECT_START_ROLLOUT.md) |  | 2026-10-07 | 63 |
|  | [DIY step commands: rollout (step 6 of the stateful GUIDE)](../operations/DIY_STEP_UPDATE_ROLLOUT.md) |  | 2026-10-07 | 62 |
|  | [DIY completion outbox: rollout (step 3 of the stateful GUIDE)](../operations/DIY_COMPLETION_OUTBOX_ROLLOUT.md) |  | 2026-10-06 | 72 |
|  | [DIY step and project transitions: rollout (step 2 of the stateful GUIDE)](../operations/DIY_STEP_TRANSITIONS_ROLLOUT.md) |  | 2026-10-06 | 34 |
|  | [DIY reverse reconciliation: rollout (step 4 of the stateful GUIDE)](../operations/DIY_TASK_RECONCILIATION_ROLLOUT.md) |  | 2026-10-06 | 53 |
|  | [DIY template revisions — rollout runbook](../operations/DIY_TEMPLATE_REVISIONS_ROLLOUT.md) | ready for the owner to run. Written October 6, 2026 with slice 1e of | 2026-10-06 | 137 |
|  | [Service Price Benchmark Source Operations Runbook](../operations/SERVICE_PRICE_BENCHMARK_SOURCE_OPERATIONS_RUNBOOK.md) |  | 2026-07-28 | 212 |

## Flag details for this area

- 🟠 **product/RENOVATION_COMPLIANCE_AND_EXECUTION_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md** - Status "Recommended implementation plan" never advanced. Project memory says Home Continuity is fully on main (not re-verified in code here); sibling audits with the same header (Tax, Coverage, Ownership Cost) were updated to "Implemented".
