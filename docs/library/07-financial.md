# Coverage, Risk & Financial Tools

[Library home](README.md) · [Flags](FLAGS.md)

25 documents. Flag key: 🔴 conflicting/superseded · 🟠 status lags reality or cites missing code · 🟡 historical snapshot. Blank = no issue found (not proof it is current - check *Last changed*).

## Requirements (FRD/PRD) (3)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
|  | [Property Tax Center — Functional Requirements Document](../functional/PROPERTY_TAX_CENTER_FRD.md) | Implemented | 2026-07-28 | 364 |
| 🟠 C20 | [Home Reserve / Sinking Fund Planner — Functional Requirements Document](../functional/HOME_RESERVE_FUND_PLANNER_FRD.md) |  | 2026-07-07 | 512 |
| 🟡 | [CLAIMS_ASSISTANCE_PRD.md](../functional/CLAIMS_ASSISTANCE_PRD.md) |  | 2026-01-07 | 471 |

## ADR (decision) (1)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
|  | [ADR: Consolidate Ownership Cost Intelligence](../architecture/ADR-OWNERSHIP-COSTS-CONSOLIDATION.md) | Accepted | 2026-07-28 | 74 |

## Plan (1)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
|  | [Mortgage Refinance Radar](../product/mortgage-refinance-radar-enhancement-plan.md) | Capability implementation and audit gap closure complete; controlled external-al | 2026-08-01 | 514 |

## Feature reference (4)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
|  | [Mortgage Refinance Radar](../functional/mortgage-refinance-radar.md) | Production in-product experience; external email and Web Push remain controlled- | 2026-08-01 | 243 |
| 🟠 C15 | [Hidden Asset Finder](../functional/HIDDEN_ASSET_FINDER.md) |  | 2026-07-28 | 1122 |
|  | [Home Improvement Financing Center](../functional/HOME_IMPROVEMENT_FINANCING.md) |  | 2026-06-27 | 833 |
| 🟡 | [CLAIMS_ASSISTANCE.md](../functional/CLAIMS_ASSISTANCE.md) | Backend + Frontend MVP complete, extensible foundation | 2026-01-07 | 638 |

## Audit / analysis (8)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
|  | [Mortgage Refinance Radar Capability Audit and Implementation Plan](../product/MORTGAGE_REFINANCE_RADAR_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md) | Implemented; controlled external-alert rollout gated \| | 2026-08-01 | 928 |
| 🟠 C9 | [Hidden Savings and Benefits Capability Audit and Implementation Plan](../product/HIDDEN_SAVINGS_AND_BENEFITS_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md) | Recommended implementation plan | 2026-07-29 | 2557 |
| 🟠 C9 | [Capital Decision Planning Capability Audit and Implementation Plan](../product/CAPITAL_DECISION_PLANNING_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md) | Recommended implementation plan | 2026-07-28 | 2621 |
| 🟠 C21 | [Coverage and Premium Optimization Capability Audit and Implementation Plan](../product/COVERAGE_AND_PREMIUM_OPTIMIZATION_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md) | Implementation complete; real-user launch remains gated | 2026-07-28 | 2468 |
|  | [Ownership Cost Intelligence Capability Audit and Implementation Plan](../product/OWNERSHIP_COST_INTELLIGENCE_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md) | Technical implementation complete through Slice 9; real-user launch remains fail | 2026-07-28 | 2206 |
|  | [Ownership Cost Intelligence Slice 9 Launch Evidence](../product/OWNERSHIP_COST_SLICE_9_LAUNCH_EVIDENCE.md) |  | 2026-07-28 | 67 |
|  | [Property Tax and Tax Appeal Capability Audit and Implementation Plan](../product/PROPERTY_TAX_AND_TAX_APPEAL_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md) | Implemented — Slices 0–9 complete July 28, 2026 | 2026-07-28 | 1876 |
| 🟡 C12 | [Risk Assessment Feature - Comprehensive Documentation](../functional/RISK_ASSESSMENT_COMPREHENSIVE_DOCS.md) | ✅ Core Implementation Complete, ⚠️ Minor Issues Pending | 2026-01-03 | 1420 |

## Status / phase record (1)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
|  | [ContractToCozy — Living Home Record and Coverage Intelligence](../functional/INVENTORY_AND_COVERAGE.md) | Implemented beta contract | 2026-07-23 | 114 |

## Runbook / ops (6)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
|  | [Mortgage Refinance Radar alert rollout and incident runbook](../operations/MORTGAGE_REFINANCE_RADAR_ALERT_ROLLOUT_AND_INCIDENT_RUNBOOK.md) |  | 2026-08-01 | 134 |
|  | [Mortgage Refinance Radar measurement and optimization](../operations/MORTGAGE_REFINANCE_RADAR_MEASUREMENT_AND_OPTIMIZATION.md) |  | 2026-08-01 | 48 |
|  | [Ownership Cost Intelligence Operations and Governance](../operations/OWNERSHIP_COST_INTELLIGENCE_OPERATIONS_AND_GOVERNANCE.md) | Active runbook | 2026-07-28 | 133 |
|  | [Ownership Cost Intelligence Target-Build Review](../operations/OWNERSHIP_COST_TARGET_BUILD_REVIEW_CHECKLIST.md) |  | 2026-07-28 | 85 |
|  | [Property Tax Center Operations and Governance](../operations/PROPERTY_TAX_CENTER_OPERATIONS_AND_GOVERNANCE.md) | Active runbook | 2026-07-28 | 209 |
|  | [Coverage & Premium Review Release and Source Operations Runbook](../product/COVERAGE_RELEASE_AND_SOURCE_OPERATIONS_RUNBOOK.md) |  | 2026-07-27 | 281 |

## Data / asset (1)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
|  | [mortgage-refinance-radar-enhancement-plan.docx](../product/mortgage-refinance-radar-enhancement-plan.docx) |  | 2026-07-25 |  |

## Flag details for this area

- 🟠 **functional/HIDDEN_ASSET_FINDER.md** - Route exists in code but many cited frontend/worker files do not (14/24 and 3/8): implementation moved or partial. Verify before relying on file-level detail.
- 🟠 **functional/HOME_RESERVE_FUND_PLANNER_FRD.md** - Core reserve-fund route, page and schema exist, but three cited paths are missing (including the by-design workers Prisma path); verify file-level architecture before implementation.
- 🟠 **product/CAPITAL_DECISION_PLANNING_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md** - Status "Recommended implementation plan" never advanced. Project memory says Home Continuity is fully on main (not re-verified in code here); sibling audits with the same header (Tax, Coverage, Ownership Cost) were updated to "Implemented".
- 🟠 **product/COVERAGE_AND_PREMIUM_OPTIMIZATION_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md** - Claims implementation complete but four cited code paths no longer exist. Outcome requirements may still govern; file-level implementation map is stale.
- 🟠 **product/HIDDEN_SAVINGS_AND_BENEFITS_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md** - Status "Recommended implementation plan" never advanced. Project memory says Home Continuity is fully on main (not re-verified in code here); sibling audits with the same header (Tax, Coverage, Ownership Cost) were updated to "Implemented".
