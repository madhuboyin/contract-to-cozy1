# Guidance, Actions & Home Intelligence

[Library home](README.md) · [Flags](FLAGS.md)

20 documents. Flag key: 🔴 conflicting/superseded · 🟠 status lags reality or cites missing code · 🟡 historical snapshot. Blank = no issue found (not proof it is current - check *Last changed*).

## Requirements (FRD/PRD) (3)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
|  | [Home Action Health-Factor Copy FRD and Implementation Plan](../product/HOME_ACTION_HEALTH_FACTOR_COPY_FRD.md) | v1.6 · Phase 1 shipped (`4d6bdfee`) · Phase 2 shipped (`81efe900`) · §12 decision-card  | 2026-09-02 | 877 |
| 🟠 C3 | [Guidance Engine — Functional Requirements Document](../functional/GUIDANCE_ENGINE_FRD.md) | v2.1 · Living Document — reflects current implementation; resolved gaps removed as of v | 2026-07-27 | 998 |
| 🔴 C3 | [GUIDANCE_ENGINE_FRD_Updated.md](../functional/GUIDANCE_ENGINE_FRD_Updated.md) | v1.0 · Ready for Implementation | 2026-03-31 | 94 |

## Plan (3)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
|  | [Home Intelligence Functional Completeness](../product/HOME_INTELLIGENCE_FUNCTIONAL_COMPLETENESS_FRD_AND_IMPLEMENTATION_PLAN.md) | v1.32 · "Approved for implementation planning" | 2026-08-30 | 1461 |
| 🟡 | [Guidance Overview — Inline Step Actions Plan](../functional/GUIDANCE_OVERVIEW_INLINE_PLAN.md) |  | 2026-04-10 | 182 |
| 🟡 | [Guidance Engine — Phased Implementation Plan](../functional/guidance-engine-implementation-plan.md) |  | 2026-03-29 | 616 |

## Feature reference (5)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
|  | [Unified Home Action Card Enhancement Brief](../product/UNIFIED_HOME_ACTION_CARD_ENHANCEMENT_BRIEF.md) | Implemented. Retained as the product contract and acceptance reference. | 2026-08-10 | 437 |
|  | [Dashboard — Next Best Move: Changes Reference](../dashboard-next-best-move-changes.md) |  | 2026-05-04 | 346 |
| 🟠 C3 | [Guidance Engine (Deterministic Resolution Journey)](../architecture/GUIDANCE_ENGINE.md) |  | 2026-03-24 | 690 |
| 🟡 | [INTELLIGENCE_LAYERS.md](../functional/INTELLIGENCE_LAYERS.md) |  | 2026-02-22 | 95 |
| 🟡 | [DECISION_TRACE_LITE.md](../functional/DECISION_TRACE_LITE.md) |  | 2026-01-14 | 492 |

## Audit / analysis (5)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
|  | [Home Operations & Action Management — Slice 0-8 Launch Review](../product/HOME_OPERATIONS_SLICE_0_8_LAUNCH_REVIEW.md) |  | 2026-07-30 | 40 |
| 🟠 C9 | [Home Operations and Action Management Capability Audit and Implementation Plan](../product/HOME_OPERATIONS_AND_ACTION_MANAGEMENT_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md) | Recommended implementation plan<br> | 2026-07-29 | 1582 |
|  | [Guidance Engine Homeowner CTA Audit FRD](../functional/GUIDANCE_ENGINE_HOMEOWNER_CTA_AUDIT_FRD.md) | v1.1 · Audit-only (no implementation changes) | 2026-07-28 | 260 |
| 🟡 | [Guidance Engine — Gap Analysis](../functional/guidance-engine-gap-analysis.md) |  | 2026-03-29 | 631 |
| 🟡 | [Deterministic Next Steps Findings](../functional/DETERMINISTIC_NEXT_STEPS_FINDINGS.md) |  | 2026-03-24 | 242 |

## Status / phase record (3)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
|  | [Home Intelligence Phase 0 — Registry and Ownership Report](../product/HOME_INTELLIGENCE_PHASE0_REGISTRY_REPORT.md) | "Phase 0 complete" | 2026-08-25 | 166 |
|  | [Home Intelligence Phase 1 — Source Parity Status](../product/HOME_INTELLIGENCE_PHASE1_SOURCE_PARITY_STATUS.md) | "Phase 1 functional implementation complete — source parity, Fix cutover, and bo | 2026-08-25 | 83 |
|  | [Home Operations Slice 0 — Completion Endpoint Matrix](../product/HOME_OPERATIONS_SLICE_0_COMPLETION_ENDPOINT_MATRIX.md) |  | 2026-07-29 | 74 |

## Data / asset (1)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
|  | [Deterministic_Resolution_Journeys_Logic_Document.docx](../functional/Deterministic_Resolution_Journeys_Logic_Document.docx) |  | 2026-03-25 |  |

## Flag details for this area

- 🟠 **architecture/GUIDANCE_ENGINE.md** - Three overlapping Guidance Engine specs (this, FRD_Updated, architecture/GUIDANCE_ENGINE.md); no doc says which governs. Last touched Mar 24-26 (FRD had a Jul 27 touch).
- 🟠 **functional/GUIDANCE_ENGINE_FRD.md** - Three overlapping Guidance Engine specs (this, FRD_Updated, architecture/GUIDANCE_ENGINE.md); no doc says which governs. Last touched Mar 24-26 (FRD had a Jul 27 touch).
- 🔴 **functional/GUIDANCE_ENGINE_FRD_Updated.md** - Named "Updated" but is v1.0 "Ready for Implementation" (Mar 31), a different feature (resolution concierge) from GUIDANCE_ENGINE_FRD v2.1. `initiatedByUser` exists in code -> status is stale, and the name misleads.
- 🟠 **product/HOME_OPERATIONS_AND_ACTION_MANAGEMENT_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md** - Status "Recommended implementation plan" never advanced. Project memory says Home Continuity is fully on main (not re-verified in code here); sibling audits with the same header (Tax, Coverage, Ownership Cost) were updated to "Implemented".
