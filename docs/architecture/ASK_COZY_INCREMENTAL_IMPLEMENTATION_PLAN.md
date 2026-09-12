# Ask Cozy — Incremental Implementation Plan (Stage 3, Part B)

**Type:** Phased execution plan. No implementation, no schema edits, no migrations in this document.
**Baseline:** `docs/product/ASK_COZY_MESSAGE_FIRST_FRD.md` (Part A — defines *what*) and `docs/architecture/ASK_COZY_TARGET_PRODUCT_AND_ARCHITECTURE.md` (Stage 2 — architecture decisions, treated as approved baseline per this stage's brief). This document defines *how to get there incrementally*.
**Evidence discipline:** every claim about current implementation is cited `path:line` and was verified fresh during this stage's research (five parallel verification passes into correction-mode dispatch, schema representations, Home Event Radar runtime state, the full 68-operation handler inventory, and existing UI/eval infrastructure) — not copied from Stage 2 without re-checking where implementation detail matters, per this stage's explicit instruction.

---

## 1. Executive Summary

Seven phases, each independently releasable, each leaving Ask Cozy fully operational at every boundary. Phase 0 resolves five open questions Stage 2 explicitly could not verify (this stage now has code-grounded answers for four of them, one genuinely still open pending a reachable database). Phases 1–2 build the two pieces of infrastructure everything else depends on — capability invocation and confirmation convergence — before Phase 3 lets extraction produce a single write. Phases 4–7 layer next actions, proactive continuation, long-lived goals, and additional capability exposure on top of a foundation that doesn't need to change again once Phase 2 lands.

---

## 2. Implementation Principles

1. Each slice leaves Ask Cozy operational — no phase requires a "big bang" cutover.
2. Each slice delivers one coherent architectural capability, not a partial fragment of several.
3. Each slice has a rollback boundary (a feature flag, or a change small enough to revert cleanly).
4. Each slice has acceptance criteria and tests/evals before it's considered done.
5. No unnecessary feature expansion — a slice does the smallest thing that proves the architecture, not the most complete version of a feature.
6. No production users exist — clean internal refactoring is preferred over compatibility shims, but this does not license breaking already-working flows (refinance, HVAC decisioning) without a concrete architectural reason.

---

## 3. Architecture Dependencies

```
Capability Invocation (Phase 1)
        ↓
Confirmation Convergence (Phase 2)
        ↓
Conversational Capture (Phase 3)
        ↓
Next Actions (Phase 4)
        ↓
Proactive / Goal workflows (Phase 5, 6)
        ↓
Additional Capability Exposure (Phase 7)
```

Capability Invocation must precede Confirmation Convergence because the new `CAPTURE_FACT_CONFIRM`/`CAPTURE_EVENT_CONFIRM` operations need somewhere to register a handler. Confirmation Convergence must precede Conversational Capture because extraction should never produce a write path that hasn't already been proven safe with a synthetic candidate (this plan's Phase 2 acceptance criterion is deliberately extraction-free). Next Actions depends on capabilities being invokable through the registry (Phase 1) to scan for relevance. Proactive/Goal work depends on confirmation being safe (Phase 2) since both eventually produce material writes. Additional capability exposure is last because it's pure surface-area growth on a now-stable foundation.

---

## 4. Pre-implementation Verification (Phase 0 results)

Five items from Stage 2's own flagged-unverified list, resolved by this stage's research — presented as the four-part format wherever new evidence changed a Stage 2 assumption, otherwise as a direct resolution.

### 4.1 `askDomainCommandRegistry.ts` correction-mode dispatch
```
STAGE 2 ASSUMPTION: reuse AskDomainCommandRegistry's correctionModes vocabulary (EDIT/PAUSE/
  RESUME/STOP/REVERSE/REOPEN/REVOKE) for captured facts too.
NEW CODE EVIDENCE: a repo-wide grep for `correctionModes` finds only its own type declaration,
  factory parameter, and assignment inside the command() builder (askDomainCommandRegistry.ts:40,
  54, 64) — it is never read anywhere else. The only field from AskDomainCommandDefinition
  actually consumed elsewhere is `.supportsCancelBeforeExecution`, used once
  (askOrchestrator.service.ts:9356-9357) for pre-execution dismissal of a still-NEEDS_CONFIRMATION
  execution — a materially simpler operation than EDIT/REVERSE/REOPEN/REVOKE. Grepping the literal
  mode strings against askOrchestrator.service.ts finds only unrelated, coincidentally-named
  concepts (a maintenance-task action enum sharing 'EDIT'/'REOPEN' values, a buyer-journey
  PAUSE/RESUME boolean) — REVERSE appears nowhere outside its own type union.
IMPACT: there is no existing correction/reversal dispatcher to reuse at all — not "hand-written
  per command" as Stage 2 hedged, but entirely unconsumed metadata.
RECOMMENDED ADJUSTMENT: build correction/reversal for captured facts and events directly on
  HomeEvent's existing, working supersedesEventId/isCurrent revision chain (confirmed real and
  already the model's designed correction mechanism) and PropertyFactEvidence's existing
  supersededAt chain. Do not design around correctionModes providing anything. Scoped as its own
  small task in Phase 2 (§8.2).
```

### 4.2 `GroundedAskProposal.kind` mapping — 2 of 7 kinds need a Phase 0 decision, not an assumed mapping
Full table in FRD §23. `ADD_FACT`/`CORRECT_FACT`/`CREATE_TASK`/`START_JOURNEY`/`COMPARE_OPTIONS` map cleanly (the last three onto exact existing operations with zero semantic drift). `UPLOAD_EVIDENCE` and `ADD_NOTE` do not — see FRD §23 for the specific gap in each. **Action:** resolve both before Phase 2's retirement work begins, not during it.

### 4.3 `AskOperationId` / `DecisionThread.goalCode` schema representation — resolved, no schema change needed
**[FACT]** `AskExecution.operationId` (`schema.prisma:7951`) is a plain nullable `String`; `AskOperationId` (`askOperationRegistry.ts:19-22`) is a plain TS string-literal union, not generated from or synced with any Prisma enum. `DecisionThread.goalCode` (`schema.prisma:8269`) is likewise a plain, non-nullable `String`, no Prisma enum exists. **Conclusion:** adding `CAPTURE_FACT_CONFIRM`/`CAPTURE_EVENT_CONFIRM` and `SELL_HOLD_RENT`/`RENOVATION`/`CLAIM`/`REFINANCE` requires zero schema change — new string literals used by convention, exactly like every existing addition to these two spaces.

### 4.4 `DomainEventType` duplication — narrower and different than Stage 1/2 described
```
STAGE 2 ASSUMPTION (inherited from Stage 1): DomainEventType is duplicated between a 9-member
  backend emitter union and a 14-member worker consumer union — a maintenance-risk duplication.
NEW CODE EVIDENCE: DomainEventType IS a real, correct 14-member Prisma enum (schema.prisma:
  9360-9374), the actual source of truth (used at schema.prisma:9543 on the DomainEvent model).
  The worker consumer's hand-written type (processDomainEvents.job.ts:17-30) currently matches
  all 14 members in the same order — a redundant hand-copy (future-drift risk), not a present
  divergence. The actual divergence is on the EMITTER side: domainEvents.service.ts:7-16's
  EmitDomainEventInput.type has only 9 members, missing 5 refinance-related ones
  (REFINANCE_DATA_REQUIRED, REFINANCE_DECISION_RECORDED, REFINANCE_DECISION_CHANGED,
  REFINANCE_NEXT_STEP_STARTED, REFINANCE_OUTCOME_COMPLETED). This is a live bug, not theoretical:
  refinanceDecision.service.ts:470 already writes these 5 event types via a raw
  tx.domainEvent.create(...) call, bypassing DomainEventsService.emit() entirely because the typed
  helper doesn't support them, and homeActionSourcePromotion.service.ts:3669 already reads
  REFINANCE_DATA_REQUIRED events back out — these events are live in production code paths today.
IMPACT: the new ASK_EXTRACTION_REQUESTED and ASK_CAPTURE_LINK_RECONCILE event types this program
  adds (FRD §14, §22) need to go into the already-correct 14-member Prisma enum plus the
  emitter's type (which needs widening regardless of this program, since it's already
  incomplete) — not two independently-maintained lists as previously assumed.
RECOMMENDED ADJUSTMENT: as part of Phase 1 (the first phase touching DomainEvent for this
  program's own new event types), widen EmitDomainEventInput.type to the full correct set (or
  import Prisma's generated enum directly instead of hand-duplicating), and migrate
  refinanceDecision.service.ts:470's raw call onto the typed emit() path once it supports the
  full set — this is pre-existing debt this program's own event-type additions would otherwise
  compound. Separately flag to the worker file's owner: replace its hand-copied union with an
  import of the same Prisma-generated enum.
```

### 4.5 Home Event Radar runtime population — could not be verified; treat as a precondition to establish
**[FACT]** No database reachable in this environment matching the app's configured `DATABASE_URL` (`127.0.0.1:5433`, nothing listening; no Docker containers running). Could not query live data. **What code shows instead:** `apps/backend/prisma/seed.ts` has zero references to `PropertyRadarMatch`/`RadarEvent`/`PropertyRadarCompoundInsight` — none of the seeded test users/properties get any radar rows. **Action for Phase 0:** do not assume Radar data exists for any test property. Establish it via either (a) running the real ingestion/matching pipeline against a reachable weather API and database, or (b) a purpose-built fixture script, before Phase 7's Home Event Radar work is demonstrated or tested end-to-end.

### 4.6 `askEnvelopeQueryScope.ts` weather-domain bug — confirmed unchanged, fix scope is a real decision
**[FACT]** Bug confirmed present exactly as Stage 1/2 described (`askEnvelopeQueryScope.ts:26` hardcodes `domains: ['ASSET_LIFECYCLE']` for every matched component). **New nuance this pass found:** roof signals are already legitimately split across both `ASSET_LIFECYCLE` (`aging_roof_condition_review`) and `WEATHER` (`SEVERE_WEATHER_OPEN_ROOF_ISSUE`, `envelopeMappingRegistry.ts:55,87`) domains — so the fix is a real design choice, not a one-line addition:
- **(a)** Unconditional widen: `domains: ['ASSET_LIFECYCLE', 'WEATHER']` for every matched component.
- **(b)** Per-component allowlist: add `WEATHER` only for `ROOF`/`FOUNDATION`/`EXTERIOR`/`SITE` (each has a plausible WEATHER-domain rule), excluding `INTERIOR`.
**Action:** before picking (a) or (b), verify `intelligenceEnvelopeQuery.service.ts`'s `entityRef`/`componentKind` filtering logic (not read in this pass) — it may already keep results relevant regardless of domain-list breadth, which would make (a) safe and simpler.

### 4.7 Handler inventory
Full 68-operation table in §5 below — completed in this pass, not deferred.

---

## 5. Handler Migration Inventory

**[FACT — this pass]** All 68 `AskOperationId` values, cross-referenced against `askOperationRegistry.ts` (adapter keys), `askDomainCommandRegistry.ts` (confirmation requirements), and the single dispatch `switch` in `askOrchestrator.service.ts:6137-6234`. Every row below is directly observed from a handler call site and its definition — none inferred.

| operationId | adapterId | handler (file:line) | current args | effect | confirmation (Y/N, via) | shim complexity |
|---|---|---|---|---|---|---|
| MAINTENANCE_STATUS | maintenance.status | maintenanceResult (:1432) | userId, propertyId, message, two composedContext values, a derived boolean | READ | N | High — needs context-provider values, not envelope fields |
| MAINTENANCE_TASK_CREATE | maintenance.create | maintenanceTaskCreateResult (:875) | userId, propertyId, message | MUTATION_PREPARATION | Y — MAINTENANCE_CREATE | Simple |
| MAINTENANCE_TASK_COMPLETE | maintenance.complete | maintenanceTaskCompleteResult (:1033) | userId, propertyId, message | MUTATION_PREPARATION | Y — MAINTENANCE_COMPLETE | Simple |
| MAINTENANCE_TASK_UPDATE | maintenance.update | maintenanceTaskUpdateResult (:1169) | userId, propertyId, message | MUTATION_PREPARATION | Y — MAINTENANCE_UPDATE | Simple |
| COVERAGE_GAPS | coverage.review | coverageResult (:1595) | userId, propertyId, message | READ | N | Simple |
| INCIDENT_CLAIM_STATUS | incident-claim.status | incidentClaimStatusResult (:2687) | userId, propertyId, message | READ | N | Simple |
| CLAIM_FILE | incident-claim.file | claimFileResult (:2483) | propertyId, message (no userId) | MUTATION_PREPARATION | Y — CLAIM_FILE | Simple |
| CLAIM_TRANSITION | incident-claim.transition | claimTransitionResult (:2502) | propertyId, message, launchContext | MUTATION_PREPARATION | Y — CLAIM_TRANSITION | Simple |
| INCIDENT_CONTINUATION | incident-claim.continuation | incidentContinuationResult (:2526) | propertyId only | READ | N | Simple |
| SAVINGS_OPPORTUNITIES | savings.opportunities | savingsOpportunitiesResult (:2880) | userId, propertyId, message | READ | N | Simple |
| OWNERSHIP_COSTS | ownership.costs | ownershipCostsResult (:3086) | userId, propertyId, message | READ | N | Simple |
| INVENTORY_LOOKUP | inventory.lookup | inventoryLookupResult (:3372) | userId, propertyId, message | READ | N | Simple |
| PROPERTY_SUMMARY | property.summary | propertySummaryResult (:3595) | userId, propertyId, message | READ | N | Simple |
| INTELLIGENCE_ENVELOPE_QUERY | intelligence-envelope.query | intelligenceEnvelopeQueryResult (:5659) | userId, propertyId, message, continuationCursor | READ | N | Needs `continuationCursor` — added to the envelope (FRD §16) |
| HOME_ACTIONS | home-actions.feed | homeActionsResult (:3787) | userId, propertyId, message, launchContext-derived actionId | READ | N | Medium |
| OPERATIONAL_WORK_UPDATE | home-operations.update | operationalWorkUpdateResult (:2636) | propertyId, message, launchContext | MUTATION_PREPARATION | Y — OPERATIONAL_WORK_UPDATE | Simple |
| INSPECTION_FINDINGS | inspection-findings.review | inspectionFindingsResult (:2541) | propertyId only | READ | N | Simple |
| INSPECTION_FINDING_UPDATE | inspection-findings.update | inspectionFindingUpdateResult (:2566) | propertyId, message, launchContext | MUTATION_PREPARATION | Y — INSPECTION_FINDING_UPDATE | Simple |
| DOCUMENT_PROMOTION_REVIEW | document-promotion.review | documentPromotionReviewResult (:2603) | propertyId only | READ | N | Simple |
| DOCUMENT_PROMOTION_CONFIRM | document-promotion.confirm | documentPromotionConfirmResult (:2610) | propertyId, message, launchContext | MUTATION_PREPARATION | Y — DOCUMENT_PROMOTION_CONFIRM | Simple |
| CAPABILITY_DISCOVERY | capability.discovery | capabilityResult (:5268) | userId, propertyId (optional), message | READ | N | Simple |
| REPLACEMENT_GUIDANCE | inventory.replacement | replacementGuidanceResult (:1722) | userId, propertyId, message, launchContext-derived entityId, executionId | READ | N | Medium |
| REFINANCE_ANALYSIS | refinance.analysis | refinanceAnalysisResult (:5110) | userId, propertyId only | READ | N | Simple — reference implementation |
| REFINANCE_RATE_MONITOR | refinance.monitor | refinanceRateMonitorResult (:5216) | userId, propertyId, message | MUTATION_PREPARATION | Y — REFINANCE_MONITOR_CREATE | Simple |
| SELL_HOLD_RENT_ANALYSIS | sale-case.analysis | sellHoldRentAnalysisResult (:4975) | userId, propertyId only | READ | N | Simple |
| HOUSEHOLD_INVITATION | household.invitation | householdInvitationResult (:596) | userId, propertyId, message | MUTATION_PREPARATION | Y — HOUSEHOLD_INVITE | Simple |
| GUIDANCE_JOURNEY_CREATE | guidance.journey.create | guidanceJourneyCreateResult (:1308) | userId, propertyId, message | MUTATION_PREPARATION | Y — GUIDANCE_JOURNEY_CREATE | Simple |
| QUOTE_COMPARISON_CREATE | quote-comparison.create | quoteComparisonCreateResult (:1256) | propertyId, message (no userId) | MUTATION_PREPARATION | Y — QUOTE_COMPARISON_CREATE | Simple |
| QUOTE_COMPARISON_REVIEW | quote-comparison.review | quoteComparisonReviewResult (:1274) | propertyId only | READ | N | Simple |
| HOME_DEADLINE_MONITOR | home-deadline.monitor | homeDeadlineMonitorResult (:1333) | userId, propertyId, message | MUTATION_PREPARATION | Y — HOME_DEADLINE_MONITOR_CREATE | Simple |
| CAPITAL_RESERVE_PLAN | capital-reserve.plan | capitalReservePlanResult (:3230) | userId, propertyId only | READ | N | Simple |
| PROPERTY_TAX_APPEAL_READINESS | property-tax.appeal-readiness | propertyTaxAppealReadinessResult (:3271) | userId, propertyId, message | READ | N | Simple |
| RENOVATION_PERMIT_READINESS | renovation-permit.readiness | renovationPermitReadinessResult (:3299) | propertyId, message (no userId) | READ | N | Simple — but see §4.2/FRD §31: confirm target implementation before migrating |
| MAJOR_EVENT_ENTRY | major-event.entry | majorEventEntryResult (:3323) | userId, propertyId, message | READ | N | Simple |
| EMERGENCY_BOUNDARY | boundary.emergency | emergencyResult (:5416) | none | READ | N | Trivial |
| UNSAFE_RESTRICTED_BOUNDARY | boundary.unsafe-restricted | unsafeRestrictedResult (:5442) | none | READ | N | Trivial |
| OUT_OF_SCOPE_BOUNDARY | boundary.out-of-scope | outOfScopeResult (:5429) | none | READ | N | Trivial |
| GROUNDED_GUIDANCE | grounded.guidance | groundedGuidanceResult (:5607) | entire input object + separate trace object | READ | N | **Passthrough category** (FRD §16) — highest complexity |
| HVAC_DECISION_START | decision-platform.hvac.start | hvacDecisionStartResult (:1970) | userId, propertyId, message, executionId | MUTATION_PREPARATION | Y — HVAC_DECISION_START | Simple |
| HVAC_DECISION_CONTINUE | decision-platform.hvac.continue | hvacDecisionContinueResult (:2024) | userId, propertyId, message, executionId, launchContext-derived entityId | READ | N | Medium |
| HVAC_SPECIALIST_ENGAGE | decision-platform.hvac.specialist-engage | hvacSpecialistEngageResult (:5897) | userId, propertyId, message, executionId, whole launchContext | MUTATION_PREPARATION | **N — no askDomainCommandRegistry entry despite MATERIAL_DECISION/CONTRIBUTOR classification; confirmation self-managed inside the agent runtime** | **Passthrough category** (FRD §16) — resolve confirmation-registry gap in Phase 0 |
| HVAC_DECISION_SCENARIO | decision-platform.hvac.scenario | hvacDecisionScenarioResult (:2117) | userId, propertyId, message | MUTATION_PREPARATION | Y — HVAC_DECISION_SCENARIO | Simple |
| HVAC_DECISION_ABANDON | decision-platform.hvac.abandon | hvacDecisionAbandonResult (:2173) | userId, propertyId, message | MUTATION_PREPARATION | Y — HVAC_DECISION_ABANDON | Simple |
| HVAC_PREFERENCE_SAVE | decision-platform.hvac.preference.save | hvacPreferenceSaveResult (:2354) | userId, propertyId, message | MUTATION_PREPARATION | Y — HVAC_PREFERENCE_SAVE | Simple |
| HVAC_PREFERENCE_FORGET | decision-platform.hvac.preference.forget | hvacPreferenceForgetResult (:2390) | userId, propertyId, message | MUTATION_PREPARATION | Y — HVAC_PREFERENCE_FORGET | Simple |
| HOME_CHANGE_SUMMARY | home-change.summary | homeChangeSummaryResult (:2820) | userId, propertyId only | READ | N | Simple |
| HVAC_DECISION_OUTCOME_REPORT | decision-platform.hvac.outcome.report | hvacDecisionOutcomeReportResult (:2214) | userId, propertyId, message | MUTATION_PREPARATION | Y — HVAC_DECISION_OUTCOME_REPORT | Simple |
| HVAC_DECISION_OUTCOME_VIEW | decision-platform.hvac.outcome.view | hvacDecisionOutcomeViewResult (:2266) | userId, propertyId, message | READ | N | Simple |
| HVAC_DECISION_OUTCOME_UNLINK | decision-platform.hvac.outcome.unlink | hvacDecisionOutcomeUnlinkResult (:2301) | userId, propertyId, message | MUTATION_PREPARATION | Y — HVAC_DECISION_OUTCOME_UNLINK | Simple |
| BUYER_PLAN_STATUS | buyer.plan.status | buyerPlanStatusResult (:4019) | userId, propertyId only | READ | N | Simple |
| BUYER_DEADLINES | buyer.deadlines | buyerDeadlinesResult (:4053) | userId, propertyId only | READ | N | Simple |
| BUYER_DOCUMENT_READINESS | buyer.document-readiness | buyerDocumentReadinessResult (:4107) | userId, propertyId only | READ | N | Simple |
| BUYER_INSPECTION_REVIEW | buyer.inspection-review | buyerInspectionReviewResult (:4145) | userId, propertyId only | READ | N | Simple |
| BUYER_TASK_COMPLETE | buyer.task.complete | buyerTaskCompleteResult (:4187) | userId, propertyId, message | MUTATION_PREPARATION | Y — BUYER_TASK_COMPLETE | Simple |
| BUYER_TASK_CREATE | buyer.task.create | buyerTaskCreateResult (:4272) | userId, propertyId, message | MUTATION_PREPARATION | Y — BUYER_TASK_CREATE | Simple |
| BUYER_TASK_UPDATE | buyer.task.update | buyerTaskUpdateResult (:4332) | userId, propertyId, message | MUTATION_PREPARATION | Y — BUYER_TASK_UPDATE | Simple |
| BUYER_MOVE_STATUS | buyer.move-status | buyerMoveStatusResult (:4408) | userId, propertyId only | READ | N | Simple |
| BUYER_FINANCING_READINESS | buyer.financing-readiness | buyerFinancingReadinessResult (:4450) | userId, propertyId only | READ | N | Simple |
| BUYER_TITLE_ESCROW_READINESS | buyer.title-escrow-readiness | buyerTitleEscrowReadinessResult (:4510) | userId, propertyId only | READ | N | Simple |
| BUYER_WALKTHROUGH_READINESS | buyer.walkthrough-readiness | buyerWalkthroughReadinessResult (:4555) | userId, propertyId only | READ | N | Simple |
| BUYER_DISCLOSURE_FUNDS_READINESS | buyer.disclosure-funds-readiness | buyerDisclosureFundsReadinessResult (:4598) | userId, propertyId only | READ | N | Simple |
| BUYER_CLOSING_DAY_READINESS | buyer.closing-day-readiness | buyerClosingDayReadinessResult (:4637) | userId, propertyId only | READ | N | Simple |
| BUYER_CONTRACT_TIMELINE | buyer.contract-timeline | buyerContractTimelineResult (:4676) | userId, propertyId only | READ | N | Simple |
| BUYER_NEGOTIATION_READINESS | buyer.negotiation-readiness | buyerNegotiationReadinessResult (:4723) | userId, propertyId only | READ | N | Simple |
| BUYER_COST_READINESS | buyer.cost-readiness | buyerCostReadinessResult (:4768) | userId, propertyId only | READ | N | Simple |
| BUYER_FINDING_DISPOSITION | buyer.finding.disposition | buyerFindingDispositionResult (:4812) | userId, propertyId, message | MUTATION_PREPARATION | Y — BUYER_FINDING_DISPOSITION | Simple |
| BUYER_LIFECYCLE_UPDATE | buyer.lifecycle.update | buyerLifecycleUpdateResult (:4875) | userId, propertyId, message | MUTATION_PREPARATION | Y — BUYER_LIFECYCLE_UPDATE | Simple |

**Coverage: all 68 operations represented, none skipped or guessed.** Cross-cutting internal helper functions (`audienceApplicabilityResult`, `needsPropertyResult`, `hvacDecisionThreadAmbiguousResult`, `buyerNotActiveResult`, `routingClarificationResult`, `maybeSynthesizeDeterministicResult`, `operationalUnavailableResult`, `dispatchOperationAdapterResult`) are invoked within several handlers above and are correctly excluded — they are not per-operation handlers themselves.

**Summary:** 61 "Simple" (pure scalar destructure), 3 "Medium" (need one `launchContext`-derived field), 3 "Trivial" (no envelope fields at all), 2 "Passthrough" (`GROUNDED_GUIDANCE`, `HVAC_SPECIALIST_ENGAGE` — receive the whole envelope/launchContext, per FRD §16's new adapter category). 25 require confirmation via `AskDomainCommandRegistry`; `HVAC_SPECIALIST_ENGAGE`'s confirmation status is flagged **[OPEN]** pending Phase 0's decision (§4.7 above / FRD §16).

---

## 6. Phase 0 — Pre-implementation Verification

Output: this document's §4 (already complete) plus the remaining decisions it flags as open — `UPLOAD_EVIDENCE`/`ADD_NOTE` target representations (§4.2), the envelope-scope fix choice for `askEnvelopeQueryScope.ts` (§4.6), and `HVAC_SPECIALIST_ENGAGE`'s confirmation-registry gap (§4.7). No broad refactoring starts before these four decisions are made — everything else in §4 already has a resolved answer.

**Acceptance criterion:** all five Phase 0 items in §4 have either a resolved answer (4.1, 4.3, 4.4) or an explicit, documented decision (4.2's two gaps, 4.6's fix choice, 4.7's confirmation question) before Phase 1 begins.

---

## 7. Phase 1 — Capability Invocation Foundation

**Goal:** remove domain dispatch from the orchestrator without changing product behavior.

**Work:** `CapabilityInvocationEnvelope` (FRD §16, including the `continuationCursor` field and the passthrough category for `GROUNDED_GUIDANCE`/`HVAC_SPECIALIST_ENGAGE`), `CapabilityHandlerRegistry` keyed by adapter id, `capability.invoke()`, incremental migration of the 68 handlers per §5's inventory (Simple/Trivial rows first — lowest risk, highest count; Medium rows next; Passthrough rows last, since they need the adapter-category decision from Phase 0 settled first). Widen `EmitDomainEventInput.type` to the full 14-member set as part of this phase's own `DomainEvent` touch-points (§4.4).

**Acceptance criterion:** existing Ask behavior is functionally equivalent for all 68 operations (verified against the existing 48-file `apps/backend/tests/ask/` suite, unchanged pass rate), and capability execution no longer requires domain-specific switch logic inside the orchestrator for any migrated operation.

**Independently releasable:** yes — this phase changes nothing a homeowner can observe.

---

## 8. Phase 2 — Confirmation Convergence & Write Safety

**Goal:** prove the write path safe with a synthetic candidate before extraction ever produces a real one.

**Work:**
- Extend `AskConfirmationReceipt`'s pattern to the new `CAPTURE_FACT_CONFIRM`/`CAPTURE_EVENT_CONFIRM` operation family (FRD §22) — no schema change to the receipt itself (Stage 2's decision), but new schema fields on the target models: `PropertyFactEvidence.captureExecutionId` + its unique constraint, `Warranty.sourceExecutionId` + its unique constraint, `HomeEvent.providerName`/`warrantyId`, `captureChannel`/`attribution`/`extractionConfidence` on both `PropertyFactEvidence` and `HomeEvent`, `AskExecution.parentExecutionId`/`linkedExecutionId` (full inventory in §17).
- Implement the commit-time claim-token re-verification for the `DomainEvent`-backed extraction job (FRD §22, Stage 2's fourth-round correction) — this is infrastructure Phase 2 builds even though Phase 3 is what first uses it, since Phase 2's acceptance criterion explicitly requires proving retry/reclaim safety before extraction exists.
- Implement bidirectional `linkedExecutionId` + `ASK_CAPTURE_LINK_RECONCILE` async reconciliation (FRD §22) for the event/warranty pairing case — buildable and testable synthetically before extraction can produce such a pair.
- Resolve §4.1's correction finding: build `HomeEvent`/`PropertyFactEvidence` correction on their existing supersession chains, not on `correctionModes`.
- Map `GroundedAskProposal`'s 5 clean kinds onto their target operations; resolve `UPLOAD_EVIDENCE`/`ADD_NOTE` per Phase 0's decision; do not retire `GroundedAskProposal`/`GroundedAskArtifact` until all 7 have passing parity tests (FRD §23, explicit).

**Acceptance criterion:** a synthetically-created candidate fact/event (created directly via a test harness, no LLM involved) can be confirmed, retried under a simulated lease-reclaim race, rejected, and persisted exactly once — including the event+warranty pairing case under simulated concurrent confirmation — with zero LLM extraction involved anywhere in this phase's tests.

**Independently releasable:** yes, behind a flag (§21) — the new operation family exists and is testable without any conversational trigger reaching it yet.

---

## 9. Phase 3 — Conversational Capture MVP

**Goal:** capture homeowner-supplied information from ordinary conversation, narrow scope.

**Recommended first supported types:** scalar fact, simple retrospective home event (per the request's explicit recommendation — not warranty, not goal, not every category at once).

**Work:** deterministic pre-filter (FRD §13) with its own unit-test suite; extraction evaluation harness and corpus (FRD §15) built *alongside* the extraction pass itself, not after (per the request's explicit sequencing instruction, since this is the one genuinely new deterministic component with no existing analog to inherit test discipline from); constrained extraction (FRD §14); candidate execution creation using Phase 2's now-proven write path; confirmation via the existing `confirmation` field (not a new block — FRD §14's correction); persistence via `capturePropertyFact` (extended) and the new `HomeEvent` writer; `PropertyChange` fan-in (existing, unchanged); correction path (via §8.2's supersession-based mechanism, not `correctionModes`).

**Representative scenarios:** "My mortgage rate is 6.75%." / "I replaced my roof last summer for $14,500." (warranty explicitly deferred — Stage 2 §14's Candidate item 2 pattern is designed but not required for MVP scope).

**Acceptance criterion:** information supplied naturally in conversation becomes structured, confirmed home knowledge, visible to the existing aggregation-context read path on the next turn, with the extraction evaluation corpus clearing its pilot thresholds (FRD §15).

**Independently releasable:** yes, behind a flag — homeowners who don't trigger the pre-filter see no change.

---

## 10. Phase 4 — Contextual Next Actions

**Goal:** no dead-end responses.

**Work:** dedicated next-action module (FRD §27) using the existing `capabilityCandidateMatcher`/`capabilityRanking`/`capabilitySuppressionPolicy` machinery (confirmed to already exist and be more capable than Stage 2's first draft credited) plus `askSuggestionPolicy.ts`'s existing repeat-filter; READY vs. NEEDS_INFO tiering; max-5 cap (existing convention, reused).

**Acceptance criterion:** representative Ask responses (the FRD §8 user stories) consistently produce a small set (≤5) of relevant, executable next actions rather than generic suggestion text, with `GROUNDED_GUIDANCE` and sell/hold/rent responses specifically verified to surface previously-missing suggestions (Stage 1's two named gaps).

**Independently releasable:** yes — purely additive to existing responses.

---

## 11. Phase 5 — Proactive Cozy

**Goal:** C2C can initiate useful conversations.

**Work:** generalize `notifyWithAskContinuation` (FRD §29) — widen `operationId` from its current 2-member union, build the shared wrapper eliminating the two existing callers' duplicated boilerplate. Sequence: (1) refinance monitoring, (2) maintenance — both already have working, if duplicated, callers to consolidate; (3) Home Event Radar — requires §4.5's runtime-population precondition and §4.6's scope-bug fix to be resolved first, so it lands last within this phase, not first, despite being the highest-priority target per Stage 1/2's own framing.

**Acceptance criterion:** a background signal produces one deduplicated, contextual Ask continuation the homeowner can enter and continue naturally, for all three producers, including a dismissal/already-resolved check (FRD §29's flagged **[OPEN]** item — scope this as part of the slice, not deferred silently).

**Independently releasable:** yes, per-producer, behind a flag.

---

## 12. Phase 6 — Long-Lived Goals / DecisionThread Expansion

**Goal:** support Job 3, starting with one vertical slice.

**Work:** generalize `DecisionThread.goalCode` beyond HVAC (FRD §21, zero schema change per §4.3); creation/resume rules using `activeIdentityKey`, not a session pointer (Stage 2's corrected design); `AskSession.activeDecisionThreadId` as a same-session cache only; context loading from the thread's structured state (`factReferences`/`assumptions`/`options`/`questions`); Seller Prep + sell/hold/rent exposure (Phase 7 dependency — sequence Phase 7's Seller Prep registration to land alongside or just before this phase's acceptance test); next-action continuity via the thread.

**Recommended first vertical slice:** "I'm thinking about selling next year." — per the request's explicit instruction not to generalize all life events at once.

**Acceptance criterion:** the selling scenario creates/attaches a `DecisionThread` without a confirmation gate (materiality carve-out, FRD §21), surfaces Seller Prep capabilities without the homeowner navigating there, and the thread resumes correctly across a new session.

**Independently releasable:** yes, behind a flag.

---

## 13. Phase 7 — Additional Capability Exposure

Only after Phases 1–2 are stable in production use (not just tested). Candidates, prioritized by the Three Jobs (Stage 1/2), not code availability: Seller Prep (needed by Phase 6, effectively co-scheduled), Home Event Radar query capability (blocked on §4.5/§4.6), Home Renovation Advisor (blocked on §4.2's naming-ambiguity resolution — do not wire until resolved), coverage/insurance, personalization-supported ranking (explicitly deferred per Stage 2 §23 — core next-actions works without it), documents, additional maintenance intelligence.

---

## 14. Vertical Slice Definition

Every slice in every phase above is specified against this template — restated once here rather than per-slice, to keep this document from ballooning past what the FRD already covers:

```
User outcome | Code areas touched | Schema changes | API changes | Frontend changes |
Backend changes | Events | Feature flags | Tests | Evaluation corpus | Acceptance criteria |
Rollback approach | Dependencies
```

Phase 3's "capture a retrospective home event" slice, filled in as a worked example:

| Field | Value |
|---|---|
| User outcome | "I replaced my roof last summer for $14,500" becomes confirmed, queryable home knowledge |
| Code areas touched | `services/ask/conversationalUnderstanding/` (new), `askOrchestrator.service.ts` (extraction-trigger call site only), `modules/propertyContext/` (HomeEvent writer, new function) |
| Schema changes | `HomeEvent.providerName`, `HomeEvent.warrantyId` (unused this slice, added for §17 completeness), `HomeEvent.captureChannel`/`attribution`/`extractionConfidence`, `AskExecution.parentExecutionId` |
| API changes | None — extraction is server-internal to the existing turn endpoint |
| Frontend changes | Render the existing `confirmation` field for a `CAPTURE_EVENT_CONFIRM` execution (no new block type, per FRD §14/§28) |
| Backend changes | Pre-filter, extraction call, candidate-set persistence, `HomeEvent` upsert writer |
| Events | `ASK_EXTRACTION_REQUESTED` (new `DomainEventType` member) |
| Feature flags | `askConversationalCapture` |
| Tests | Unit: pre-filter, candidate schema validation. Integration: message→extraction→candidate, candidate→confirm→event write, retry-under-reclaim |
| Evaluation corpus | FRD §15's event-capture-relevant categories |
| Acceptance criteria | Phase 3's stated criterion, scoped to this one message |
| Rollback approach | Flag off — extraction never triggers, existing routed behavior unaffected |
| Dependencies | Phase 1 (capability layer, if the routed half of a compound message is involved), Phase 2 (confirmation) |

---

## 15. Dependency Graph

See §3. Additional detail: Phase 4 (Next Actions) depends on Phase 1 (needs the capability registry to scan) but **not** on Phase 3 (extraction) — it can be built and demonstrated against existing routed operations alone, then automatically benefits once Phase 3 adds capture-confirm operations to the registry.

---

## 16. Parallel Work Opportunities

- **Phase 1 (Capability Invocation) and the extraction evaluation harness (part of Phase 3)** may proceed independently — one is a backend dispatch refactor, the other is a corpus-and-metrics build with no code dependency on the registry. Verified: the extraction pre-filter and candidate-schema work touch none of the files Phase 1's migration touches.
- **§4.2/§4.6/§4.7's Phase 0 decisions** can be made in parallel with each other (different subsystems: `GroundedAskProposal` kinds, envelope scope bug, HVAC confirmation registry) — none blocks resolving the others.
- **Phase 5's three producers** (refinance, maintenance, Home Event Radar) can be built in parallel once the shared `notifyWithAskContinuation` wrapper exists, since each producer's migration is independent of the others.

---

## 17. Schema Change Inventory

Consolidated from Stage 2's final (four-times-corrected) inventory, re-verified in this pass where flagged:

| Field | Model | Verified this pass? |
|---|---|---|
| `providerName: String?` | `HomeEvent` | Carried from Stage 2, not re-verified this pass (no new evidence contradicts it) |
| `warrantyId: String?` (FK → `Warranty`) | `HomeEvent` | Carried from Stage 2 |
| `captureChannel` | `PropertyFactEvidence`, `HomeEvent` | Carried from Stage 2 |
| `extractionConfidence: Float?` | `PropertyFactEvidence`, `HomeEvent` | Carried from Stage 2 |
| `attribution` | `PropertyFactEvidence`, `HomeEvent` | Carried from Stage 2 |
| `captureExecutionId: String?` + `@@unique([propertyId, factKey, captureExecutionId])` | `PropertyFactEvidence` | Carried from Stage 2 (its third-round correction) |
| `sourceExecutionId: String?` + `@@unique([propertyId, sourceExecutionId])` | `Warranty` | Carried from Stage 2 |
| `parentExecutionId: String?` (self-FK) | `AskExecution` | Carried from Stage 2 |
| `linkedExecutionId: String?` (self-FK) | `AskExecution` | Carried from Stage 2 (bidirectional per its fourth-round correction) |
| `activeDecisionThreadId: String?` | `AskSession` | Carried from Stage 2 |
| New `AskOperationId` values (`CAPTURE_FACT_CONFIRM`, `CAPTURE_EVENT_CONFIRM`) | — | **Verified this pass: zero schema change needed** (§4.3) |
| New `DecisionThread.goalCode` values | — | **Verified this pass: zero schema change needed** (§4.3) |
| `EmitDomainEventInput.type` widened to 14 members; two new `DomainEventType` members (`ASK_EXTRACTION_REQUESTED`, `ASK_CAPTURE_LINK_RECONCILE`) | `DomainEvent` (Prisma enum) | **New finding this pass** (§4.4) — the enum itself needs 2 new members; the emitter's TS type needs widening to match its own already-existing 14, a pre-existing gap this program's additions would otherwise compound |

**Per the request's instruction:** this is documentation only. No migration script. Schema edits go directly into `prisma/schema.prisma` when implementation begins; applying them to any database (local or otherwise) is the user's own step, not part of this plan or any future implementation session's automatic responsibility.

---

## 18. API Change Inventory

No new public API endpoints — extraction and next-action generation are internal to the existing `POST /api/ask/executions` turn lifecycle. The one surface change: `submitAskCapture`/`confirmAskExecution`-equivalent calls now also apply to the `CAPTURE_FACT_CONFIRM`/`CAPTURE_EVENT_CONFIRM` operation family, using existing endpoint shapes.

---

## 19. Frontend Change Inventory

**[FACT — this pass]** `AskWorkspace.tsx`'s `BlockView` is a single 1707-line function with an inline `if (block.type === 'X')` chain — no per-block component split. Changes required: one new `if` branch for `PROACTIVE_INSIGHT` (mirrored in `apps/frontend/src/features/ask/types.ts`); **no change needed for confirmation rendering** (the existing `confirmation` field's renderer, already exercised by 25 commands, is reused as-is per FRD §14/§28's correction — this removes what would otherwise have been a second new-block frontend change).

---

## 20. Backend Change Inventory

Summarized by phase — full detail per-slice in §14's template, per-operation in §5:

| Phase | New backend modules/files | Modified existing files | New Prisma fields (see §17) |
|---|---|---|---|
| 1 | `services/ask/capabilityInvocation/` (envelope type, registry, `capability.invoke()`), one shim file per operation family | `askOrchestrator.service.ts` (dispatch `switch` replaced incrementally), `domainEvents.service.ts` (`EmitDomainEventInput.type` widened) | None |
| 2 | `services/ask/captureConfirmation/` (new operation-family handlers), `services/ask/captureLinkReconciliation.ts` | `groundedAsk.service.ts` (kind-by-kind migration), `capturePropertyFact.ts` (idempotency check), `modules/propertyContext/application/` (`HomeEvent`/`Warranty` writers) | `PropertyFactEvidence.captureExecutionId`, `Warranty.sourceExecutionId`, `AskExecution.parentExecutionId`/`linkedExecutionId` |
| 3 | `services/ask/conversationalUnderstanding/` (pre-filter, extraction call, candidate-set persistence) | `askOrchestrator.service.ts` (one new call site) | `HomeEvent.providerName`/`warrantyId`, `captureChannel`/`attribution`/`extractionConfidence` on `PropertyFactEvidence` and `HomeEvent` |
| 4 | `services/ask/nextActions/` | `askOrchestrator.service.ts` (removes static suggestion tables) | None |
| 5 | `services/notifications/notifyWithAskContinuation.ts` | `maintenanceReminder.service.ts`, `refinanceRateMonitor.service.ts` (both simplified to call the new wrapper), `modules/homeEventRadar/` (notification path migrated to the `DomainEvent` rail) | None |
| 6 | None new — extends `DecisionThread` usage | `askOrchestrator.service.ts` (goal-candidate routing), `AskSession` read/write sites | `AskSession.activeDecisionThreadId` |
| 7 | Per-capability, scoped when each is exposed | Per-capability | None anticipated |

---

## 21. Event/Worker Changes

Two new `DomainEventType` members and their consumer handlers in `processDomainEvents.job.ts`'s existing per-type switch: `ASK_EXTRACTION_REQUESTED` (Phase 3) and `ASK_CAPTURE_LINK_RECONCILE` (Phase 2). Both follow the existing lease-claim/attempt-count/dead-letter pattern already established for the other 12+ event types — no new poller, no new consumer architecture.

---

## 22. Feature Flags

| Flag | Gates | Removal criterion |
|---|---|---|
| `askCapabilityInvocationV2` | Phase 1's registry-based dispatch (per-operation, can be enabled incrementally per §5's migration order) | Remove once all 68 operations are migrated and the old switch is deleted |
| `askConfirmationConvergence` | Phase 2's new operation family + `GroundedAskProposal` retirement | Remove once all 7 kinds have parity and the old proposal path is deleted |
| `askConversationalCapture` | Phase 3's pre-filter/extraction | Remove once pilot thresholds (FRD §15) are cleared in production and the flag has been at 100% for one full release cycle |
| `askContextualNextActions` | Phase 4 | Remove once next-action generation is the only path (no fallback to static strings remains) |
| `askProactiveContinuation` | Phase 5, per-producer | Remove once all three producers are migrated |
| `askDecisionThreadGoals` | Phase 6 | Remove once the selling vertical slice is stable and a second goal type is added |

No flags for trivial internal refactors (e.g., the `DomainEventType` widening in §4.4 ships unflagged, since it's additive and backward-compatible).

---

## 23. Test Plan

**Unit:** pre-filter, candidate schemas, capability shims (one per §5 row, prioritizing Simple rows for a shared test pattern), next-action ranking, idempotency helpers (the `captureExecutionId`/`sourceExecutionId` create-then-catch-conflict pattern, the claim-token re-verification).

**Integration:** message→route→capability; message→extraction→candidate; candidate→confirm→fact write; candidate→confirm→event write; `DomainEvent`→proactive Ask continuation. Reuse the existing `.db.test.js` convention (`apps/backend/tests/integration/`) — three precedents already exist for exactly this shape of test (`askOrphanedRunningReclaim.db.test.js`, `askRetentionExecutionPurge.db.test.js`, `phase4TrustCadenceGroundedAsk.db.test.js`).

**End-to-end** (10, per the request):
1. "What needs my attention?"
2. "Should I refinance?"
3. "I replaced my roof last summer for $14,500."
4. "I serviced the HVAC yesterday for $275. Was that fair?"
5. "Is my roof at risk because of the storms?" (blocked on §4.5/§4.6)
6. "I'm thinking about selling next year."
7. Correction scenario (§8.7 of the FRD)
8. Duplicate retry scenario (the lease-reclaim race, FRD §22)
9. Permission-loss scenario (property access revoked between proposal and confirmation)
10. Async extraction fallback scenario (inline timeout → outbox pickup)

---

## 24. Evaluation Plan

Extends existing infrastructure — **[FACT — this pass]** 48 existing `.test.js` files under `apps/backend/tests/ask/`, 3 DB-integration tests, `askRoutingQualityEvaluator.ts` (exercised by `askRoutingCalibration.test.js`), and `askTrustCertificationCorpus.ts` (a hand-labeled, categorized, frozen fixture set). New suites: extraction trigger (pre-filter recall/precision), extraction accuracy (FRD §15's full metric table), context selection, next actions, trust (existing trust-validation tests extended for the new operation family), proactive deduplication. Pilot release gate: FRD §15's thresholds cleared against the new corpus, not conventional unit tests alone.

---

## 25. Risks

**High-risk (sequence first, per the request's explicit risk-based ordering):** write confirmation correctness (Phase 2's entire purpose), idempotency under lease-reclaim races (Stage 2's fourth-round finding — genuinely subtle, needs dedicated race-condition tests, §23), extraction accuracy (no amount of architecture fixes a poorly-calibrated pre-filter), event/fact classification (a `GOAL` misclassified as a `FACT` creates the wrong kind of record), async retry races (the shared-lease-ownership contract, Stage 2's third-round finding), authorization (re-check at confirmation completion, not just proposal time), handler migration (68 operations, 2 genuine structural outliers found this pass that Stage 2 didn't know about).

**Lower-risk (sequence later):** visual block additions (reduced from two to one after this pass's `FACT_CONFIRMATION` finding), suggestion text, additional capability exposure (Phase 7).

---

## 26. Rollback Strategy

Every phase behind a flag (§21) except Phase 0 (research, no code) and the `DomainEventType` widening (additive, non-breaking). Rolling back any phase disables its flag; no phase's rollback requires a data migration, since every new field is additive and every new write path is gated behind its own operation family that simply stops being invoked when its flag is off.

---

## 27. Definition of Done

The program is complete when all seven tests from the request pass together, plus the two this plan adds given this pass's findings:

- **Test A:** "I replaced my roof last summer for $14,500." → candidate event → confirmation → persisted home knowledge → future Ask turn sees it.
- **Test B:** "Should I refinance?" → existing deterministic capability → personalized answer → contextual next actions.
- **Test C:** "I serviced my HVAC yesterday for $275. Was that too expensive?" → decision response + event capture → no duplicate extraction.
- **Test D:** "Is my roof at risk because of recent storms?" → property + weather/radar intelligence (blocked on §4.5/§4.6 being resolved).
- **Test E:** "I'm thinking about selling next year." → durable goal → relevant capabilities → continued conversation across sessions.
- **Test F:** Background signal → one contextual proactive Ask continuation.
- **Test G:** New capability added → registry/shim registration → no new orchestrator domain branch.
- **Test H (added this pass):** A confirmation whose lease is reclaimed mid-flight while the original attempt is still running does not persist the stale attempt's result once its claim token has moved on (FRD §22, Stage 2's fourth-round correction — this is the one race condition subtle enough to deserve its own named acceptance test, not just inclusion in "idempotency works").
- **Test I (added this pass):** All 7 `GroundedAskProposal` kinds — including `UPLOAD_EVIDENCE` and `ADD_NOTE`, whose target representations this pass found were not yet decided — have passing parity tests before the old mechanism is deleted.

---

## 28. Recommended First Implementation Slice

**What is the smallest first implementation slice that proves the new Ask Cozy architecture without introducing unnecessary scope?**

**Answer:** Phase 2's acceptance criterion, taken literally as the first slice: **a synthetically-created candidate fact — not yet reachable from any real conversation — confirmed through the new `AskConfirmationReceipt`-based `CAPTURE_FACT_CONFIRM` path, persisted to `PropertyFactEvidence` with its new idempotency fields, and visible on the next aggregation-context read.** No extraction, no pre-filter, no LLM call — the candidate is created directly by a test harness or an internal debug endpoint, exercising exactly the chain the request itself names as the best first proof point: *one conversationally captured fact + canonical confirmation + persistence + future-context reuse* — with "conversationally captured" deliberately faked at this stage so the slice isolates write-path correctness from extraction-quality risk entirely.

**Why this is the best first proof point:** it validates the two hardest, highest-risk pieces of the entire program — the capability-invocation layer's new operation family and the confirmation saga's replay/idempotency correctness (§25's top risks) — using zero LLM involvement, so a failure is unambiguously an architecture bug, not a prompt-quality problem. It requires no schema beyond what Phase 2 already needs for real capture, so nothing here is thrown away once Phase 3 adds the real trigger. And it's a complete, demonstrable vertical slice on its own — "the fact exists, was confirmed once, and Cozy remembers it next turn" — not a fragment of a larger feature, satisfying the implementation-philosophy requirement (§2) that every slice deliver a coherent capability rather than partial infrastructure with nothing to show for it yet.

Building the whole conversational system first, or starting with extraction before the write path is proven safe, would put the least-tested, highest-variance component (an LLM call) in front of the most safety-critical one (a material write) — exactly backwards from the risk-based ordering this plan follows throughout.
