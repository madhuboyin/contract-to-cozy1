---
title: "Home Intelligence Phase 1 — Source Parity Status"
document_type: "Implementation status report"
status: "Phase 1 in progress — Slice 1 complete"
date: "August 23, 2026"
---

# Home Intelligence Phase 1 — Source Parity Status

Tracks the HI-ATT-008 source-parity matrix in [`HOME_INTELLIGENCE_FUNCTIONAL_COMPLETENESS_FRD_AND_IMPLEMENTATION_PLAN.md`](./HOME_INTELLIGENCE_FUNCTIONAL_COMPLETENESS_FRD_AND_IMPLEMENTATION_PLAN.md) §8.1 against what the codebase actually produces. Per HI-ATT-008 and Phase 1's functional exit: **Fix's read authority does not change until every row below is `DONE`.**

| Fix behavior | Authoritative input | Status | Evidence |
| --- | --- | --- | --- |
| Active incidents | `Incident` | **DONE (pre-existing)** | `loadIncidentActions` (`homeActionSourcePromotion.service.ts`) reads the same `incident` table with equivalent active-status filtering. No new work needed. |
| Overdue maintenance | `ChecklistItem` | **DONE (pre-existing, previously undocumented)** | `orchestration.service.ts`'s `mapChecklistItemToAction`/`isChecklistActionable` reads every `ChecklistItem` for the property and computes the same overdue semantics Resolution Center uses (active status + `nextDueDate` in the past), flowing through `getOrchestrationSummary()` → `adaptOrchestratedActionToHomeAction()` into a MAINTENANCE-kind Home Action. Building a dedicated loader for this would have produced duplicate action cards for the same `ChecklistItem`. |
| Warranty renewal or expiry | `Warranty` | **DONE (this slice)** | New `loadCoverageRenewalActions` loader in `homeActionSourcePromotion.service.ts`, COVERAGE-kind, `id: coverage-renewal:warranty:<id>`. |
| Insurance renewal or expiry | `InsurancePolicy` | **DONE (this slice)** | Same loader, `id: coverage-renewal:insurance:<id>`. |
| Inventory coverage gap | `detectCoverageGaps()` | **DONE (pre-existing, previously undocumented)** | `orchestration.service.ts` (line ~2183) calls `detectCoverageGaps(propertyId)` directly and turns each gap into an `OrchestratedAction` (`actionKey: COVERAGE_GAP::<inventoryItemId>`) → COVERAGE-kind Home Action via the same `adaptOrchestratedActionToHomeAction()` path. (Note: the *separate* `loadCoverageActions` loader in `homeActionSourcePromotion.service.ts` reads `CoverageReview`, an unrelated model, and is not this path — that was the initial false-adjacency trap HI-ATT-008 warns about, but the real producer already exists elsewhere.) |
| Property health insight | `Property.healthScore.insights` + appliance install-year gaps | **NOT STARTED** | No equivalent anywhere. `healthScore` and `majorAppliances` are computed (`calculateHealthScore()` + `listPropertyApplianceInventory()`), not raw Prisma fields, and Resolution Center's own access path (`getPropertyById(propertyId, userId)`) is `userId`-auth-scoped — a dependency shape none of today's `(propertyId, db)`-only loaders have. Heaviest remaining row. |
| Active execution item | `Booking` | **NOT STARTED** | `RankedHomeAction`/`OperationalWorkItem` carry no scheduling/provider/price data today; needs either a new capability resolving `workItem.id` → `OperationalWorkExecution` → `Booking`, or an equivalent reconciliation path. |
| Repair/replace decision insight | `ReplaceRepairAnalysis` + `GuidanceJourney` | **NOT STARTED** | `HomeAction.options[]`/`tradeoffs[]` are structurally similar but don't carry `verdict`/`impactLevel` precision. |
| Coverage decision insight | `CoverageAnalysis` + detector result | **NOT STARTED** | Same class of gap as the row above — `exposureCents`/`gapType`/`hasSavedAnalysis` precision has no Home Action equivalent. |

**Summary: 5 of 9 rows done (2 pre-existing and now documented, 2 newly implemented this slice), 4 remain.** Per HI-ATT-008 and the Phase 1 functional exit condition, Fix's read authority stays on `resolutionCenter.service.ts` until the remaining 4 rows (health insight, booking reconciliation, repair/replace decision insights, coverage decision insights) are done. This is intentionally not a full Phase 1 completion — see the FRD's Phase 1 status note for the explicit fallback this follows.

## This slice's implementation

`apps/backend/src/services/homeActionSourcePromotion.service.ts`:
- `HomeActionSourceDb`'s optional field group extended with `warranty` | `insurancePolicy` (defensive `if (!db.warranty || !db.insurancePolicy) return [];` guard, matching the existing `loadInspectionFindingActions` convention — keeps the 5 existing test files with fake `db` stubs that don't declare these fields working unmodified).
- New `loadCoverageRenewalActions(propertyId, db, evaluatedAt?)`: same 90-day-upcoming / expired threshold as `resolutionCenter.service.ts`'s renewal logic, COVERAGE-kind, `MATERIAL_FINANCIAL` safety tier (matching the existing `loadCoverageActions` precedent), `SOON` priority when expired / `PLAN` when upcoming, `RECOMMENDATION_FEEDBACK` controls (no completion adapter — matches Phase 0's ownership declaration for the COVERAGE kind).
- Registered in `getPromotedHomeActions()`'s loader list.
- Test coverage: `apps/backend/tests/unit/homeActionCoverageRenewalPromotion.test.js` — expired warranty, upcoming insurance policy, out-of-window exclusion, missing-`expiryDate` exclusion, and the defensive-guard no-throw case for stubs without `warranty`/`insurancePolicy`.

No change to `resolutionCenter.service.ts`, its API, or the Fix frontend in this slice.
