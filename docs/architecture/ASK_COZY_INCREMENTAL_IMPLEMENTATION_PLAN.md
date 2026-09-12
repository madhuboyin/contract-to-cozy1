# Ask Cozy — Incremental Implementation Plan (Stage 3, Part B)

**Type:** Phased execution plan. No implementation, no schema edits, no migrations in this document.
**Baseline:** `docs/product/ASK_COZY_MESSAGE_FIRST_FRD.md` (Part A — defines *what*) and `docs/architecture/ASK_COZY_TARGET_PRODUCT_AND_ARCHITECTURE.md` (Stage 2 — architecture decisions, treated as approved baseline per this stage's brief). This document defines *how to get there incrementally*.
**Evidence discipline:** every claim about current implementation is cited `path:line` and was verified fresh during this stage's research (five parallel verification passes into correction-mode dispatch, schema representations, Home Event Radar runtime state, the handler inventory (67 operations documented, confirmed complete against the registry per §4.8), and existing UI/eval infrastructure) — not copied from Stage 2 without re-checking where implementation detail matters, per this stage's explicit instruction.
**Revision note 1:** an external review round against this document and the FRD together, checked against fresh code reading rather than taken on faith, found: a second, undocumented dispatch surface for confirmed-write execution (§4.9, new); Phase 3's own representative mortgage-rate example targets a fact the current capture path rejects (§9); Phase 3's async-fallback delivery has an unstated dependency on Phase 5 infrastructure (§9, §15); a real contradiction between this document's own §8 and §20 on which phase adds three schema fields (§20, fixed); and one review claim — that the request's instructions prohibit production-usage gating and rollout flags — was checked directly against the original request text and found unsupported (the request explicitly asks for these flags and this risk ordering in its own §39/§40); Phase 7's "production use, not just tested" gate is this document's own addition beyond the request's vaguer "proves stable," softened accordingly (§13).
**Revision note 2:** a follow-up review round found revision 1 had acknowledged two gaps without closing them. Both now closed: §9 specifies the financing writer's full atomicity/idempotency contract (transaction shape modeled on `capturePropertyFact`, evidence-create gating the profile upsert for replay safety, and verification that the existing financing context assembler already reads real evidence over its synthetic fallback with zero reader-side change) and explicitly revises Phase 3's acceptance criterion to exclude proactive async-fallback delivery rather than leaving that gap implicit; §18/§19 decide the child-execution delivery contract (a bounded, one-level-deep `childExecutions` field on the response, plus a one-line frontend change) instead of deferring the choice.

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

### 4.7 Handler inventory, and the one confirmation-registry question it surfaced
Full handler table in §5 below — completed in this pass, not deferred. That table surfaced one open question worth resolving here rather than leaving implicit: `HVAC_SPECIALIST_ENGAGE` is classified `MATERIAL_DECISION`/`CONTRIBUTOR` in `askOperationRegistry.ts` but has **no entry** in `askDomainCommandRegistry.ts` — every other material-write operation has one. Its confirmation (if any) is handled inside the specialist-agent runtime itself, not via the standard command path. **Action:** confirm with whoever owns the HVAC specialist-agent pattern whether that self-managed confirmation is an intentional design choice (the agent runtime has its own audit trail, so a second confirmation layer may be redundant) or a genuine gap that predates this program — before this operation is migrated in Phase 1, since the capability-invocation layer's "passthrough" category (FRD §16) needs to know which behavior to preserve.

### 4.8 Handler count: a caveat on this pass's own inventory — **CLOSED this revision**
**[FACT — this pass]** The table in §5 documents **67** operations, cross-referenced by name against `askOperationRegistry.ts`, `askDomainCommandRegistry.ts`, and the orchestrator's dispatch `switch`. Earlier drafts of this stage's documents referred to "68 operations" throughout (an estimate carried from the research task's framing, not a recount against the finished table) — the table itself, once built, contains 67 distinct `operationId` values.

**Action closed this revision:** ran the automated diff this subsection originally deferred to Phase 0 — the exact `AskOperationId` string-literal union in `askOperationRegistry.ts:19-99` (67 literals) against the 67 `operationId` values in §5's table. Result: **exact match, no missing operation, no extra row, no duplicate.** Every count derived from this table elsewhere in this document and the FRD (Simple/Medium/Trivial/Passthrough/High tallies, the "25 require confirmation" figure) is now confirmed complete against the registry's full literal union, not merely "relative to the rows documented." No Phase 0 action remains for this item.

### 4.9 Confirmed-write execution is a second, undocumented dispatch surface — new finding this revision
```
STAGE 2 ASSUMPTION: `capability.invoke()` (§2.4's `operationId → skill adapter → capability
  handler registry → input shim → existing domain service` model) is the one dispatch surface
  the orchestrator uses per operation, and migrating it plus the routing `switch`
  (askOrchestrator.service.ts:6137-6234) satisfies Test G ("a new capability's PR diff touches
  the registry, never askOrchestrator.service.ts's dispatch switch").
NEW CODE EVIDENCE: the 6137-6234 switch (and the handler call sites §5's table documents) only
  produce each operation's *result* — for the 25 confirmation-required rows, that result is a
  MUTATION_PREPARATION (the confirmation card), not the actual write. The actual write happens
  later, when the homeowner confirms, inside a SEPARATE if/else chain keyed on
  `execution.operationId` starting at askOrchestrator.service.ts:8285 (e.g. `CLAIM_FILE` at
  :8286 calling `ClaimsService.createClaim`, `INSPECTION_FINDING_UPDATE` at :8315 calling
  `acceptFindingAsWork`/`dismissFinding`/`resolveFinding`, `DOCUMENT_PROMOTION_CONFIRM` at :8327
  with its own three-way `kind` dispatch inside). This chain runs well past line 8360 and is not
  cross-referenced by, or included in, §5's inventory, Phase 1's "Work," or Test G's stated scope.
IMPACT: Phase 1 (capability invocation) and the current Handler Migration Inventory only replace
  the PREPARE-time dispatch. Test G would not actually hold after Phase 1: a new confirmed-write
  capability still requires a new branch in the 8285+ chain, exactly the outcome Test G exists to
  prevent. This is a second, equally real instance of the same problem §16/§17 already target —
  just not the one those sections' code reading found.
RECOMMENDED ADJUSTMENT: fold migrating the 8285+ confirmed-write chain into Phase 2 ("Confirmation
  Convergence & Write Safety" — the phase whose whole purpose is the write path, and which already
  touches every one of these operations' `AskConfirmationReceipt` completion step). Extend the
  capability-handler registry (or add a second, confirm-time registry keyed the same way) so each
  of the 25 confirmation-required operations in §5 registers its confirmed-write handler exactly
  once, and retire the 8285+ chain incrementally exactly as Phase 1 retires 6137-6234. Update Test
  G (FRD §17, this document §23) to state explicitly that it covers both the propose-time dispatch
  and the confirm-time execution dispatch — a capability is not fully migrated until neither
  remains.
```
Reflected in Phase 2's Work (§8) and Test G's restated scope (§23) below.

---

## 5. Handler Migration Inventory

**[FACT — this pass]** 67 `AskOperationId` values documented, confirmed complete against the registry's full literal union (§4.8), cross-referenced against `askOperationRegistry.ts` (adapter keys), `askDomainCommandRegistry.ts` (confirmation requirements), and the single dispatch `switch` in `askOrchestrator.service.ts:6137-6234`. Every row below is directly observed from a handler call site and its definition — none inferred.

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

**Coverage: 67 operations documented above, none guessed, confirmed complete** — §4.8 records the automated diff against `askOperationRegistry.ts`'s full literal union: exact match, nothing missing. Cross-cutting internal helper functions (`audienceApplicabilityResult`, `needsPropertyResult`, `hvacDecisionThreadAmbiguousResult`, `buyerNotActiveResult`, `routingClarificationResult`, `maybeSynthesizeDeterministicResult`, `operationalUnavailableResult`, `dispatchOperationAdapterResult`) are invoked within several handlers above and are correctly excluded — they are not per-operation handlers themselves.

**Summary (recounted directly from the table above, correcting an earlier draft's arithmetic error):** 58 "Simple" (pure scalar destructure, including `INTELLIGENCE_ENVELOPE_QUERY` once `continuationCursor` is added to the envelope), 3 "Medium" (need one `launchContext`-derived field), 3 "Trivial" (no envelope fields at all), 2 "Passthrough" (`GROUNDED_GUIDANCE`, `HVAC_SPECIALIST_ENGAGE` — receive the whole envelope/launchContext, per FRD §16's new adapter category), 1 "High" (`MAINTENANCE_STATUS` — needs context-provider values the envelope doesn't carry). 58+3+3+2+1 = 67, matching the table's row count. 25 require confirmation via `AskDomainCommandRegistry`; `HVAC_SPECIALIST_ENGAGE`'s confirmation status is flagged **[OPEN]** pending Phase 0's decision (§4.7 above / FRD §16).

---

## 6. Phase 0 — Pre-implementation Verification

Output: this document's §4 (already complete) plus the remaining decisions it flags as open — `UPLOAD_EVIDENCE`/`ADD_NOTE` target representations (§4.2), the envelope-scope fix choice for `askEnvelopeQueryScope.ts` (§4.6), `HVAC_SPECIALIST_ENGAGE`'s confirmation-registry question (§4.7). §4.8's handler-count diff is closed as of this revision (exact match, no open action). §4.9 (the confirmed-write dispatch surface) is a scoping decision for Phase 2, not Phase 0 — no code changes start there before Phase 1 either way.

**Acceptance criterion:** all items in §4 have either a resolved answer (4.1, 4.3, 4.4, 4.8) or an explicit, documented decision/action (4.2's two gaps, 4.6's fix choice, 4.7's confirmation question) before Phase 1 begins.

---

## 7. Phase 1 — Capability Invocation Foundation

**Goal:** remove domain dispatch from the orchestrator without changing product behavior.

**Work:** `CapabilityInvocationEnvelope` (FRD §16, including the `continuationCursor` field and the passthrough category for `GROUNDED_GUIDANCE`/`HVAC_SPECIALIST_ENGAGE`), `CapabilityHandlerRegistry` keyed by adapter id, `capability.invoke()`, incremental migration of the handlers per §5's inventory (67 operations documented and confirmed complete per §4.8; Simple/Trivial rows first — lowest risk, highest count; Medium rows next; Passthrough rows last, since they need the adapter-category decision from Phase 0 settled first). Widen `EmitDomainEventInput.type` to the full 14-member `DomainEventType` enum as part of this phase's own `DomainEvent` touch-points (§4.4).

**Acceptance criterion:** existing Ask behavior is functionally equivalent for all 67 documented operations (§4.8's diff confirmed this is the complete set) (verified against the existing 48-file `apps/backend/tests/ask/` suite, unchanged pass rate), and the propose-time dispatch (the 6137-6234 switch) no longer requires domain-specific switch logic inside the orchestrator for any migrated operation. This phase migrates propose-time dispatch only — the confirm-time execution dispatch (§4.9) is Phase 2's, not this phase's, so Test G is not fully satisfied until Phase 2 also lands.

**Independently releasable:** yes — this phase changes nothing a homeowner can observe.

---

## 8. Phase 2 — Confirmation Convergence & Write Safety

**Goal:** prove the write path safe with a synthetic candidate before extraction ever produces a real one.

**Work:**
- Extend `AskConfirmationReceipt`'s pattern to the new `CAPTURE_FACT_CONFIRM`/`CAPTURE_EVENT_CONFIRM` operation family (FRD §22) — no schema change to the receipt itself (Stage 2's decision), but new schema fields on the target models: `PropertyFactEvidence.captureExecutionId` + its unique constraint, `Warranty.sourceExecutionId` + its unique constraint, `HomeEvent.providerName`/`warrantyId`, `captureChannel`/`attribution`/`extractionConfidence` on both `PropertyFactEvidence` and `HomeEvent`, `AskExecution.parentExecutionId`/`linkedExecutionId` (full inventory in §17). These columns land now — before extraction exists — because the new confirm operation family writes them for every capture regardless of source (a routed, deterministic capture is `attribution: FIRSTHAND` with high confidence too); Phase 3 is what first makes an LLM the thing setting non-trivial values into columns Phase 2 already created (see §20's corrected phase assignment).
- **New this revision (§4.9):** migrate the 25 confirmation-required operations' confirm-time write dispatch off the `askOrchestrator.service.ts:8285+` if/else chain and onto a confirm-time capability handler, one registry entry per operation, exactly as Phase 1 migrates the propose-time switch. This is Phase 2's work, not Phase 1's, because it's fundamentally a write-safety concern (the same handlers this phase is already touching for `AskConfirmationReceipt` convergence) — see §4.9 for why Phase 1 alone does not satisfy Test G.
- Implement the commit-time claim-token re-verification for the `DomainEvent`-backed extraction job (FRD §22, Stage 2's fourth-round correction) — this is infrastructure Phase 2 builds even though Phase 3 is what first uses it, since Phase 2's acceptance criterion explicitly requires proving retry/reclaim safety before extraction exists.
- Implement bidirectional `linkedExecutionId` + `ASK_CAPTURE_LINK_RECONCILE` async reconciliation (FRD §22) for the event/warranty pairing case — buildable and testable synthetically before extraction can produce such a pair.
- Resolve §4.1's correction finding: build `HomeEvent`/`PropertyFactEvidence` correction on their existing supersession chains, not on `correctionModes`.
- Map `GroundedAskProposal`'s 5 clean kinds onto their target operations; resolve `UPLOAD_EVIDENCE`/`ADD_NOTE` per Phase 0's decision; do not retire `GroundedAskProposal`/`GroundedAskArtifact` until all 7 have passing parity tests (FRD §23, explicit).

**Acceptance criterion:** a synthetically-created candidate fact/event (created directly via a test harness, no LLM involved) can be confirmed, retried under a simulated lease-reclaim race, rejected, and persisted exactly once — including the event+warranty pairing case under simulated concurrent confirmation — with zero LLM extraction involved anywhere in this phase's tests. Additionally (§4.9): all 25 confirmation-required operations from §5 execute their confirmed write through the new confirm-time registry, with the `askOrchestrator.service.ts:8285+` chain deleted, not just shrunk — this is what makes Test G actually true.

**Independently releasable:** yes, behind a flag (§21) — the new operation family exists and is testable without any conversational trigger reaching it yet.

---

## 9. Phase 3 — Conversational Capture MVP

**Goal:** capture homeowner-supplied information from ordinary conversation, narrow scope.

**Recommended first supported types:** scalar fact, simple retrospective home event (per the request's explicit recommendation — not warranty, not goal, not every category at once).

**Work:** deterministic pre-filter (FRD §13) with its own unit-test suite; extraction evaluation harness and corpus (FRD §15) built *alongside* the extraction pass itself, not after (per the request's explicit sequencing instruction, since this is the one genuinely new deterministic component with no existing analog to inherit test discipline from); constrained extraction (FRD §14); candidate execution creation using Phase 2's now-proven write path; confirmation via the existing `confirmation` field (not a new block — FRD §14's correction); persistence via `capturePropertyFact` (extended) and the new `HomeEvent` writer; `PropertyChange` fan-in (existing, unchanged); correction path (via §8.2's supersession-based mechanism, not `correctionModes`); a minimal `PropertyFinancingProfile.interestRateBps` writer (new this revision — see the mortgage-rate finding below).

```
NEW EVIDENCE AGAINST THE REQUEST'S OWN REPRESENTATIVE EXAMPLE (not a Stage 2 assumption — this
  scenario is the request's §36/Phase-3 text, checked against fresh code this pass):
NEW CODE EVIDENCE: `financial.currentMortgage`/`financial.financingProfile` are marked
  `writable: false` in `factCatalog.ts:127-128` (`canonicalOwner: PropertyFinancingProfile`), and
  `capturePropertyFact.ts:270-271` throws `Property Context fact is not writable through
  contextual capture` for any non-writable key. `PropertyFinancingProfile` (`schema.prisma:19375`)
  is a separate, `propertyId`-unique 1:1 model with `interestRateBps: Int?` — not a
  `PropertyFactEvidence` row — so the generic extended `capturePropertyFact` writer this phase
  already plans cannot serve this example regardless of the writable flag; a distinct writer is
  needed no matter what.
IMPACT: "My mortgage rate is 6.75%" would fail today exactly as extraction would try to persist
  it, via the exact path this phase's own Work list names as the persistence mechanism.
RECOMMENDED ADJUSTMENT: add one small, explicitly-scoped writer for this phase (contract specified
  below) — a one-field, one-model writer, small, but new, not "already extended
  `capturePropertyFact`" as originally scoped, and belongs in this phase's estimate rather than
  being silently absorbed by it.
```

**Financing writer — end-to-end integrity contract (specified this revision, sequencing corrected in a follow-up round):**
- **Model, not the generic path.** `capturePropertyFact`'s existing pattern (`capturePropertyFact.ts:283-311`) is the template, not a function to extend — same four effects (canonical write, supersede-prior, create-evidence, emit `PropertyChange`), all atomic — but the **order is not a straight copy of that function's**, because this writer's idempotency check has to run first (see below), and a naive copy of the original order would let the blanket supersession step re-supersede the row it just created. The corrected, single sequence (`capturePropertyFinancingFact`):
  1. Inside one `prisma.$transaction`, attempt `tx.propertyFactEvidence.create(...)` first, keyed on the new `captureExecutionId` + its `@@unique([propertyId, factKey, captureExecutionId])` constraint (Phase 2's addition). This is the idempotency gate, and it must be the transaction's first statement — see the rollback note below for why.
  2. **Only on that create's success** (this is a first-time attempt, not a replay): within the *same* transaction, supersede prior active evidence — `tx.propertyFactEvidence.updateMany({ where: { propertyId, factKey, supersededAt: null, id: { not: newEvidence.id } }, data: { supersededAt: observedAt } })`. **The `id: { not: newEvidence.id }` clause is required and was missing from an earlier draft of this contract** — without it, this blanket `updateMany` (which matches every active row for the fact key, with no awareness that one of them is the row this same transaction just created) would immediately re-supersede the new row alongside the genuinely-stale ones, leaving no active evidence at all for the assembler to read.
  3. Upsert `PropertyFinancingProfile.interestRateBps` by `propertyId` (`schema.prisma:19375-19399`).
  4. Emit `PropertyChange`, then commit.
  - **Duplicate-key recovery is an outer-catch, not an inner one.** A `P2002` on step 1's create aborts the whole Postgres transaction — once any statement inside a transaction errors, that transaction can't safely run further statements, so steps 2-4 cannot be reached this attempt regardless of whether the JS error is caught inline. The correct handling wraps the entire `prisma.$transaction(...)` call, not the create alone: catch `P2002` at that outer boundary, then issue a fresh, separate (non-transactional) `findUnique` on `(propertyId, factKey, captureExecutionId)` against the row the *original*, successful attempt already committed, and return that result — never retry steps 2-4 for a replay. This mirrors the outer-catch shape FRD §22 already specifies generically for `PropertyFactEvidence` ("create on `captureExecutionId` with `P2002`-catch-and-return"); this writer follows it exactly rather than inventing a different one.
  - `capturePropertyFact`'s own `!definition.writable` gate (`:270-271`) stays exactly as-is for its existing generic-UI caller; this is a new, separate function for the conversational-capture caller specifically, not a bypass flag threaded through the old one.
- **Why this ordering, not the original function's:** this is the same failure class Stage 2's second-round correction already named generically ("a stale replay must not resurrect a value a later, unrelated correction already superseded"), applied here to a mutable 1:1 model instead of an append-only evidence log — the create-first ordering is what stops a retried confirmation from reapplying a stale rate over a newer one written by a *different*, later execution in between.
- **Normalization:** `Math.round(rate * 100)` (percent → basis points, 6.75 → 675), validated against a sane bounds check (reject obviously-wrong values, e.g. negative or > 100%) before the transaction opens.
- **Reader side — verified this revision, zero change needed.** `financingAssembler` (`prismaAssemblers.ts:974-1000`) already reads real evidence in preference to a synthetic default: `evidence.get('financial.currentMortgage') ?? mortgageEvidence`, where `evidence` is `loadEvidence(propertyId, 'FINANCIAL')` — a generic `PropertyFactEvidence` query, filtered `supersededAt: null`, keyed by `factKey` (`:50-57`), ranked by `selectEvidence`'s existing known/verified/source-priority ordering (`:23-45`). Once the new writer creates a live, non-superseded `PropertyFactEvidence` row for `financial.currentMortgage`, this assembler surfaces it automatically and stops falling back to the hand-built `mortgageEvidence` placeholder — no assembler code changes; this claim is falsifiable directly by reading `:1020-1022`'s ternary, which already prefers `evidence.get(key)` when present.

**Async-fallback delivery — dependency, with an explicit acceptance-scope carve-out (revised this revision, not just documented as a dependency):** per FRD §10's Turn Processing Contract, a synchronous extraction attempt that misses its ~1.5s budget falls back to the existing `DomainEvent` outbox, completing later via a worker. The only delivery mechanism this program builds for "a background process created something the homeowner should see, outside the request/response cycle" is `notifyWithAskContinuation`, generalized in **Phase 5**, not this phase — pulling a duplicate, narrower version of that mechanism into Phase 3 would pre-empt Phase 5's own scope and violate this plan's own "no unnecessary feature expansion" principle (§2.5) for a genuinely rare tail case (the common case completes synchronously). Given that trade-off, **this phase's acceptance criterion below is scoped to exclude proactive delivery of the fallback tail — explicitly, not silently:**

**Representative scenarios:** "My mortgage rate is 6.75%." (covered by the writer above) / "I replaced my roof last summer for $14,500." (warranty explicitly deferred — Stage 2 §14's Candidate item 2 pattern is designed but not required for MVP scope).

**Acceptance criterion (revised this revision):** information supplied naturally in conversation and captured within the synchronous extraction attempt becomes structured, confirmed home knowledge, delivered inline in that same turn's response (via §19's `childExecutions` field) and visible to the existing aggregation-context read path on the next turn, with the extraction evaluation corpus clearing its pilot thresholds (FRD §15). The mortgage-rate scenario specifically exercises the new `PropertyFinancingProfile` writer and its idempotency/atomicity contract above, not `capturePropertyFact`. **Explicitly out of this phase's acceptance bar:** proactive delivery of an async-fallback capture — that capture is durably persisted and correctly idempotent (Phase 2's guarantees hold regardless of delivery timing) and becomes visible the next time the homeowner opens that session, but Phase 3 does not push it to their attention; a homeowner watching the same open session live does not see it appear on its own either, since there is no live refresh channel. This is a real, accepted scope reduction for this phase, not an oversight — full proactive delivery of the fallback tail is Phase 5's acceptance criterion, not this one's.

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

Only after Phases 1–2 prove stable (the request's own §36 criterion) — **softened this revision:** an earlier draft required "production use, not just tested" as this phase's gate. That specific bar is this document's own addition, not the request's: the request's §36 asks only that "the core architecture proves stable," and its own §41 states there are currently no production users at all, which a hard production-use gate sits awkwardly against. Demonstrated stability under this program's own test/eval suites (§23/§24) is the actual gate; a genuine production rollout, once users exist, only strengthens that signal rather than being required to reach it. Candidates, prioritized by the Three Jobs (Stage 1/2), not code availability: Seller Prep (needed by Phase 6, effectively co-scheduled), Home Event Radar query capability (blocked on §4.5/§4.6), Home Renovation Advisor (blocked on §4.2's naming-ambiguity resolution — do not wire until resolved), coverage/insurance, personalization-supported ranking (explicitly deferred per Stage 2 §23 — core next-actions works without it), documents, additional maintenance intelligence.

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
| API changes | No new endpoint — extraction is server-internal to the existing turn endpoint. The response *contract* does change (this slice is what first populates `childExecutions`, §18/§19), but that's tracked there, not as a new API surface. |
| Frontend changes | The `CAPTURE_EVENT_CONFIRM` child execution arrives via the routed turn's `childExecutions` field (§19, decided this revision) and is spread into `AskWorkspace.tsx`'s flat `executions` state in `ask()`; it then renders the existing `confirmation` field exactly like any other execution (no new block type, per FRD §14/§28, and no new rendering code — §19) |
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

**New this revision:** Phase 3's async-fallback delivery has a partial, previously-unstated dependency on Phase 5 (§9) — the synchronous capture path and the write itself have no such dependency, only the proactive-notification half of the fallback case does. This does not block Phase 3 from shipping before Phase 5 (the fallback write is still safe and eventually visible per §9), it only means the *fully delivered* async-fallback experience isn't complete until Phase 5 lands too.

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
| Two new `DomainEventType` enum members (`ASK_EXTRACTION_REQUESTED`, `ASK_CAPTURE_LINK_RECONCILE`), taking the enum from 14 to 16; `EmitDomainEventInput.type` widened from its current 9 members to the full set (16, once this program's 2 additions land — the pre-existing 9→14 gap and this program's 14→16 addition are the same widening edit, done once) | `DomainEvent` (Prisma enum) | **New finding this pass** (§4.4) — the enum itself needs 2 new members; the emitter's TS type is separately missing 5 pre-existing (refinance) members regardless of this program, a gap this program's additions would otherwise compound rather than fix |

**Per the request's instruction:** this is documentation only. No migration script. Schema edits go directly into `prisma/schema.prisma` when implementation begins; applying them to any database (local or otherwise) is the user's own step, not part of this plan or any future implementation session's automatic responsibility.

---

## 18. API Change Inventory

No new public API endpoints — extraction and next-action generation are internal to the existing `POST /api/ask/executions` turn lifecycle. The one surface change: `submitAskCapture`/`confirmAskExecution`-equivalent calls now also apply to the `CAPTURE_FACT_CONFIRM`/`CAPTURE_EVENT_CONFIRM` operation family, using existing endpoint shapes. **Response contract change (decided this revision, §19):** `AskExecutionResponseSchema` (`ask.contract.ts:495-529`) gains `childExecutions: AskExecutionResponse[]` (max 3, one level deep, no further nesting) — an additive field on the existing `POST /api/ask/executions` response, not a new endpoint or a breaking change to any existing field.

---

## 19. Frontend Change Inventory

**[FACT — this pass]** `AskWorkspace.tsx`'s `BlockView` is a single 1707-line function with an inline `if (block.type === 'X')` chain — no per-block component split. Changes required: one new `if` branch for `PROACTIVE_INSIGHT` (mirrored in `apps/frontend/src/features/ask/types.ts`); **no change needed for confirmation rendering itself** (the existing `confirmation` field's renderer, already exercised by 25 commands, is reused as-is per FRD §14/§28's correction — this removes what would otherwise have been a second new-block frontend change).

**Child-execution delivery — decided this revision (FRD §16/§28, no longer [OPEN]):** rendering was never the gap; *discovery* was. **[FACT — this pass]** `ask()` (`AskWorkspace.tsx:1435`) appends exactly one execution — `response.data` — to state, and `updateExecution` (`:1532`) only replaces the entry whose `executionId` already matches; neither had any way to learn a turn also created a *separate* child `AskExecution` for a captured candidate.

**Decision:** `AskExecutionResponseSchema` gets a new field, `childExecutions: z.array(AskExecutionResponseSchema_NoChildren).max(3).default([])` — bounded exactly like the existing `captureRequests: z.array(...).max(3)` precedent, each entry a **full** `AskExecutionResponse` object (not a thin summary), with its own `childExecutions` fixed at `[]` by construction (one level of nesting only — a captured candidate cannot itself spawn a further nested candidate inline, matching Stage 2's own decision not to allow arbitrarily deep candidate chains, and sidestepping unbounded recursive-type definition). This is a real, additive schema change — §14/§16's "zero new schema" claim is now scoped correctly to mean "the confirmation-card mechanism itself needs no new block type," not "the response contract needs no change at all."

**Full contract, addressing discovery/render/edit/refresh in one place:**
- **Discovered:** for a synchronous capture (the common case — extraction completes within the turn's ~1.5s budget), the candidate's child `AskExecution` is embedded directly in `childExecutions` on the *same* turn response that triggered it — no separate fetch. For the async-fallback case (§9), the child is not embedded anywhere (the original response already returned) — see §9's explicit acceptance-scope carve-out for that path.
- **Rendered:** `ask()`'s existing `setExecutions` call is extended one line — `setExecutions((current) => [...current, response.data!, ...(response.data!.childExecutions ?? [])])` — after which each child is an ordinary entry in the flat `executions` array, rendered by whatever per-execution bubble/loop already renders every other execution today. `ConfirmationCard` and `BlockView` need **no changes**: they already operate per-`executionId`, agnostic to whether that execution arrived as the "main" response or via `childExecutions`.
- **Edited (before confirm):** a child's own `captureRequests`/`suppliedInput` mechanism (FRD §22, existing) applies identically to any other execution — nothing child-specific to add.
- **Refreshed after confirmation:** `ConfirmationCard.confirm()`'s existing `onCompleted(response.data)` → `updateExecution` (`:1532`) already matches by `executionId` and replaces in place. Because the child's real `executionId` is now present in the flat `executions` array (from the line above), this **already works unmodified** once the schema field lands — no new refresh path needed.

Net frontend diff: one schema field, one line in `ask()`. Everything else in the existing confirm/render/edit path is reused exactly as-is.

---

## 20. Backend Change Inventory

Summarized by phase — full detail per-slice in §14's template, per-operation in §5:

| Phase | New backend modules/files | Modified existing files | New Prisma fields (see §17) |
|---|---|---|---|
| 1 | `services/ask/capabilityInvocation/` (envelope type, registry, `capability.invoke()`), one shim file per operation family | `askOrchestrator.service.ts` (propose-time dispatch `switch`, lines 6137-6234, replaced incrementally), `domainEvents.service.ts` (`EmitDomainEventInput.type` widened) | None |
| 2 | `services/ask/captureConfirmation/` (new operation-family handlers), `services/ask/captureLinkReconciliation.ts`, one confirm-time handler per confirmation-required operation (§4.9, new this revision) | `groundedAsk.service.ts` (kind-by-kind migration), `capturePropertyFact.ts` (idempotency check), `modules/propertyContext/application/` (`HomeEvent`/`Warranty` writers), `askOrchestrator.service.ts` (confirm-time dispatch chain, lines 8285+, replaced incrementally — §4.9) | `PropertyFactEvidence.captureExecutionId`, `Warranty.sourceExecutionId`, `AskExecution.parentExecutionId`/`linkedExecutionId`, `HomeEvent.providerName`/`warrantyId`, `captureChannel`/`attribution`/`extractionConfidence` on `PropertyFactEvidence` and `HomeEvent` (**corrected this revision** — these three columns are added here, in Phase 2, because the new confirm operation family writes them for every capture regardless of source; see Phase 2's Work, §8) |
| 3 | `services/ask/conversationalUnderstanding/` (pre-filter, extraction call, candidate-set persistence), `capturePropertyFinancingFact` (§9's full atomicity/idempotency contract, new this revision — modeled directly on `capturePropertyFact.ts:283-311`'s transaction shape, not a bypass of it) | `askOrchestrator.service.ts` (one new call site) | None new — Phase 3 is the first to write non-trivial `attribution`/`extractionConfidence` values into the columns Phase 2 already added, not a new column itself. No change needed to `prismaAssemblers.ts`'s financing assembler (verified §9 — its existing `evidence.get(key) ?? mortgageEvidence` fallback already prefers real evidence). |
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
| `askCapabilityInvocationV2` | Phase 1's registry-based dispatch (per-operation, can be enabled incrementally per §5's migration order) | Remove once every operation (the confirmed complete set per §4.8) is migrated and the old switch is deleted |
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

**High-risk (sequence first, per the request's explicit risk-based ordering):** write confirmation correctness (Phase 2's entire purpose, now including the confirm-time dispatch migration found this revision, §4.9), idempotency under lease-reclaim races (Stage 2's fourth-round finding — genuinely subtle, needs dedicated race-condition tests, §23), extraction accuracy (no amount of architecture fixes a poorly-calibrated pre-filter), event/fact classification (a `GOAL` misclassified as a `FACT` creates the wrong kind of record), async retry races (the shared-lease-ownership contract, Stage 2's third-round finding), authorization (re-check at confirmation completion, not just proposal time), handler migration (67 operations documented and confirmed complete against the registry per §4.8, 2 genuine structural outliers found this pass that Stage 2 didn't know about, plus a second dispatch surface for the 25 confirmation-required operations found this revision, §4.9), child-execution delivery for captured candidates (§19 — decided, an in-turn `childExecutions` schema field; risk here is implementation fidelity, not an open design question), the Phase 3 mortgage-rate example's writer and its atomicity/replay-ordering contract (§9 — small but previously unscoped, and the ordering itself needed a correction after this document's first draft of it).

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
- **Test G:** New capability added → registry/shim registration → no new orchestrator domain branch, **covering both dispatch surfaces (corrected this revision, §4.9)**: neither the propose-time registry (Phase 1) nor the confirm-time registry (Phase 2) gains a new `askOrchestrator.service.ts` branch when a new confirmation-required capability is added.
- **Test H (added this pass, relabeled this revision):** the `DomainEvent`-backed **extraction job's** candidate-set persistence — not the `AskConfirmationReceipt` confirmation saga, which is a separate mechanism with its own, already-correct lease pattern — whose claim is reclaimed mid-flight while the original attempt is still running does not persist the stale attempt's result once its claim token has moved on (FRD §22, Stage 2's fourth-round correction — this is the one race condition subtle enough to deserve its own named acceptance test, not just inclusion in "idempotency works").
- **Test I (added this pass):** All 7 `GroundedAskProposal` kinds — including `UPLOAD_EVIDENCE` and `ADD_NOTE`, whose target representations this pass found were not yet decided — have passing parity tests before the old mechanism is deleted.

---

## 28. Recommended First Implementation Slice

**What is the smallest first implementation slice that proves the new Ask Cozy architecture without introducing unnecessary scope?**

**Answer:** Phase 2's acceptance criterion, taken literally as the first slice: **a synthetically-created candidate fact — not yet reachable from any real conversation — confirmed through the new `AskConfirmationReceipt`-based `CAPTURE_FACT_CONFIRM` path, persisted to `PropertyFactEvidence` with its new idempotency fields, and visible on the next aggregation-context read.** No extraction, no pre-filter, no LLM call — the candidate is created directly by a test harness or an internal debug endpoint, exercising exactly the chain the request itself names as the best first proof point: *one conversationally captured fact + canonical confirmation + persistence + future-context reuse* — with "conversationally captured" deliberately faked at this stage so the slice isolates write-path correctness from extraction-quality risk entirely.

**Why this is the best first proof point:** it validates the two hardest, highest-risk pieces of the entire program — the capability-invocation layer's new operation family and the confirmation saga's replay/idempotency correctness (§25's top risks) — using zero LLM involvement, so a failure is unambiguously an architecture bug, not a prompt-quality problem. It requires no schema beyond what Phase 2 already needs for real capture, so nothing here is thrown away once Phase 3 adds the real trigger. And it's a complete, demonstrable vertical slice on its own — "the fact exists, was confirmed once, and Cozy remembers it next turn" — not a fragment of a larger feature, satisfying the implementation-philosophy requirement (§2) that every slice deliver a coherent capability rather than partial infrastructure with nothing to show for it yet.

Building the whole conversational system first, or starting with extraction before the write path is proven safe, would put the least-tested, highest-variance component (an LLM call) in front of the most safety-critical one (a material write) — exactly backwards from the risk-based ordering this plan follows throughout.
