# Guidance Engine (Deterministic Resolution Journey)

## 1) Overview

The **Guidance Engine** is CtC's deterministic cross-product orchestration layer that turns raw signals from Home Tools, workers, and backend services into:

- normalized actionable signals
- deterministic journeys
- ordered step plans
- strict execution-readiness gates
- reusable derived intelligence across tools
- clear "what to do next" UX contracts

This system is intentionally **rule-based** (non-LLM) and is designed to be auditable, predictable, and safe for production.

---

## 2) High-Level Architecture

1. A tool/worker/backend flow emits a signal (or completion output).
2. `guidanceSignalResolver` normalizes the signal and applies dedupe/freshness metadata.
3. `guidanceJourneyService` selects a deterministic template and creates/reuses journey + steps.
4. `guidanceStepResolver` manages step transitions and computes current/next step.
5. `guidanceDerivedDataService` merges tool outputs into structured journey snapshots.
6. Intelligence layers (financial, confidence, priority, copy) enrich responses.
7. `guidanceSuppression` performs dedupe/conflict/noise filtering for final surfaced actions.
8. `guidanceBookingGuard` blocks unsafe execution actions when prerequisites are incomplete.
9. API contracts feed frontend components/hooks for dashboard, risk, maintenance, booking, and tool pages.

Key files:

- `apps/backend/src/services/guidanceEngine/*`
- `apps/backend/src/controllers/guidance.controller.ts`
- `apps/backend/src/routes/guidance.routes.ts`
- `apps/frontend/src/lib/api/guidanceApi.ts`
- `apps/frontend/src/features/guidance/*`
- `apps/frontend/src/components/guidance/*`

---

## 3) Database Schema (Prisma)

Source: `apps/backend/prisma/schema.prisma`

### 3.1 Enums

### `GuidanceIssueDomain`
- `SAFETY`
- `MAINTENANCE`
- `INSURANCE`
- `FINANCIAL`
- `COMPLIANCE`
- `MARKET_VALUE`
- `ASSET_LIFECYCLE`
- `CLAIMS`
- `PRICING`
- `NEGOTIATION`
- `BOOKING`
- `DOCUMENTATION`
- `NEIGHBORHOOD`
- `ONBOARDING`
- `WEATHER`
- `ENERGY`
- `OTHER`

### `GuidanceDecisionStage`
- `AWARENESS`
- `DIAGNOSIS`
- `DECISION`
- `EXECUTION`
- `VALIDATION`
- `TRACKING`

### `GuidanceExecutionReadiness`
- `NOT_READY`
- `NEEDS_CONTEXT`
- `READY`
- `TRACKING_ONLY`
- `UNKNOWN`

### `GuidanceSignalStatus`
- `ACTIVE`
- `RESOLVED`
- `SUPPRESSED`
- `ARCHIVED`

### `GuidanceJourneyStatus`
- `ACTIVE`
- `COMPLETED`
- `ABORTED`
- `ARCHIVED`

### `GuidanceStepStatus`
- `PENDING`
- `IN_PROGRESS`
- `COMPLETED`
- `SKIPPED`
- `BLOCKED`

### `GuidanceSeverity`
- `INFO`
- `LOW`
- `MEDIUM`
- `HIGH`
- `CRITICAL`
- `UNKNOWN`

### `GuidanceJourneyEventType`
- `JOURNEY_CREATED`
- `JOURNEY_STATUS_CHANGED`
- `JOURNEY_READINESS_CHANGED`
- `STEP_STATUS_CHANGED`
- `STEP_STARTED`
- `STEP_COMPLETED`
- `STEP_SKIPPED`
- `STEP_BLOCKED`
- `STEP_UNBLOCKED`
- `CONTEXT_UPDATED`
- `DERIVED_DATA_UPDATED`

### 3.2 Tables

### `GuidanceSignal` (`guidance_signals`)
Purpose: normalized persistent actionable signal from any source.

Key columns:
- scope: `propertyId`, optional `homeAssetId`, optional `inventoryItemId`
- classification: `signalIntentFamily`, `issueDomain`, `decisionStage`, `executionReadiness`
- quality: `severity`, `severityScore`, `confidenceScore`
- provenance: `sourceType`, `sourceFeatureKey`, `sourceToolKey`, `sourceEntityType`, `sourceEntityId`, `sourceRunId`, `sourceProvenanceId`
- dedupe/merge: `dedupeKey`, `duplicateGroupKey`
- readiness context: `actionWeaknessFlags[]`, `contextPrerequisites[]`, `missingContextKeys[]`
- routing hints: `canonicalFirstStepKey`, `recommendedToolKey`, `recommendedFlowKey`
- payload: `payloadJson`, `metadataJson`
- audit: `firstObservedAt`, `lastObservedAt`, `resolvedAt`, `archivedAt`, timestamps

Indexes include:
- property/status recency
- property/readiness
- property/domain
- property/family
- dedupe/group keys
- source entity/tool lookup

### `GuidanceJourney` (`guidance_journeys`)
Purpose: deterministic plan for a primary signal or merged signal group.

Key columns:
- scope: `propertyId`, optional `homeAssetId`, optional `inventoryItemId`
- signal link: optional `primarySignalId`
- type/status: `journeyKey`, `journeyTypeKey`, `issueDomain`, `decisionStage`, `executionReadiness`, `status`
- merge pointer: `mergedSignalGroupKey`
- progress pointer: `currentStepOrder`, `currentStepKey`
- context: `isLowContext`, `missingContextKeys[]`, `contextSnapshotJson`
- derived intelligence: `derivedSnapshotJson`
- lifecycle: `startedAt`, `completedAt`, `abortedAt`, `archivedAt`, `lastTransitionAt`

Indexes include:
- property/status recency
- property/readiness/status
- property/domain/status
- current step pointer
- primary signal id
- merged group key
- asset/item scope

### `GuidanceJourneyStep` (`guidance_journey_steps`)
Purpose: ordered step state machine per journey.

Key columns:
- identity/order: `journeyId`, `stepOrder`, `stepKey`
- semantics: `stepType`, `label`, `description`, `decisionStage`, `executionReadiness`
- state: `status`, `isRequired`
- routing: `toolKey`, `flowKey`, `routePath`
- context gating: `requiredContextKeys[]`, `missingContextKeys[]`
- block/skip metadata: `blockedReasonCode`, `blockedReason`, `skippedReasonCode`, `skippedReason`
- data: `inputContextJson`, `producedDataJson`
- timing: `startedAt`, `completedAt`, `skippedAt`, `blockedAt`, `unblockedAt`

Constraints:
- unique `(journeyId, stepOrder)`
- unique `(journeyId, stepKey)`

### `GuidanceJourneyEvent` (`guidance_journey_events`)
Purpose: transition/audit ledger for journey + step changes.

Key columns:
- scope: `propertyId`, `journeyId`, optional `stepId`, optional `signalId`
- event: `eventType`
- transitions: `fromJourneyStatus`, `toJourneyStatus`, `fromStepStatus`, `toStepStatus`
- actor/reason: `actorUserId`, `reasonCode`, `reasonMessage`
- data: `payloadJson`
- timestamp: `createdAt`

Indexes include property/journey/step/signal/eventType by recency.

---

## 4) Backend Module Map

Directory: `apps/backend/src/services/guidanceEngine/`

### 4.1 Core Types + Template Registry

- `guidanceTypes.ts`
  - canonical enums/types for backend contracts
  - model access helper (`getGuidanceModels`)
  - shared utility clamps/conversions

- `guidanceTemplateRegistry.ts`
  - deterministic journey templates by `signalIntentFamily`
  - current major templates:
    - `asset_lifecycle_resolution`
    - `coverage_gap_resolution`
    - `recall_safety_resolution`
    - `inspection_followup_resolution`
    - `financial_exposure_resolution`
  - also defines `TOOL_DEFAULT_STEP_KEY` for tool completion mapping

### 4.2 Signal Ingestion/Normalization

- `guidanceSignalResolver.service.ts`
  - infers/normalizes family/domain/stage/readiness
  - infers severity from explicit score or family defaults
  - computes dedupe key and duplicate-group key
  - stamps freshness metadata (`observedAt`, stale assessment)
  - downgrades stale signals (adds weakness flag + missing context + readiness downgrade)
  - upserts active signal by dedupe key

### 4.3 Journey + Steps

- `guidanceJourney.service.ts`
  - signal ingestion entrypoint
  - journey reuse (strict and fallback scope match)
  - template step provisioning
  - tool completion recording
  - property guidance assembly
  - enrichment pipeline (financial, confidence, priority, copy, validation)

- `guidanceStepResolver.service.ts`
  - step creation from templates
  - step transition engine
  - journey state recomputation
  - next-step resolution
  - Step 6 hard guards:
    - required steps cannot be skipped silently
    - backward transitions blocked unless explicitly allowed
    - critical required steps need completion data
    - journey cannot complete while critical required steps remain incomplete

### 4.4 Intelligence + Polish Services

- `guidancePriority.service.ts`
- `guidanceFinancialContext.service.ts`
- `guidanceConfidence.service.ts`
- `guidanceCopy.service.ts`
- `guidanceSuppression.service.ts`

(Details in Sections 5-8.)

### 4.5 Derived Data + Validation + Execution Guard

- `guidanceDerivedData.service.ts`
  - normalizes per-tool outputs and merges into journey snapshots
  - maintains `byStep`, `byTool`, and `latest` views
  - writes freshness metadata for derived tool outputs

- `guidanceValidation.service.ts`
  - score sanitization
  - freshness assessment (signal/tool windows)
  - math + safety validation checks
  - completion-data meaningfulness checks

- `guidanceBookingGuard.service.ts`
  - evaluates execution safety for booking/inspection/claim escalation/provider handoff/execution
  - blocks when prerequisites incomplete or readiness/context uncertain
  - returns reasons + missing prerequisite step labels

### 4.6 API Layer

- `guidance.controller.ts`
  - property guidance
  - active journeys list
  - journey detail
  - signal resolve endpoint
  - step status endpoints (complete/skip/block)
  - next-step endpoint
  - execution-guard endpoint
  - tool completion endpoint

- `guidance.routes.ts`
  - all Guidance API routes under `/api/properties/:propertyId/guidance/*`
  - body validation + Step 6 params/query validation

- `guidanceMapper.ts`
  - maps Prisma model payloads to API-safe DTOs

---

## 5) Priority Engine

File: `guidancePriority.service.ts`

Priority score is deterministic and bounded `[0..100]`.

Inputs:
- severity (`severityScore` or inferred severity base)
- urgency (family urgency + due-date/deadline urgency)
- financial impact (`financialImpactScore`)
- safety boost (SAFETY/WEATHER domain)
- confidence score
- readiness weight (`READY`, `NOT_READY`, `TRACKING_ONLY`)

Current formula:

```text
priorityScore = clamp(
  severity * 0.35
  + urgencyBoost
  + financialImpactScore * 0.28
  + safetyBoost
  + confidenceScore * 12
  + readinessWeight,
  0, 100
)
```

Buckets:
- `HIGH` (`>=72`) → group `IMMEDIATE`
- `MEDIUM` (`40..71`) → group `UPCOMING`
- `LOW` (`<40`) → group `OPTIMIZATION`

---

## 6) Signal Suppression + Signal Merging Engine

Main file: `guidanceSuppression.service.ts`

Signal merge/suppression is multi-stage.

### Stage A: Signal-level dedupe/merge
- `signalDedupKey` uses merged group key first (if present), else domain/family/scope key.
- keeps highest-priority action, suppresses duplicates with reason `DUPLICATE_SIGNAL_MERGED`.

### Stage B: Noise filtering
Suppresses:
- tracking-only (`TRACKING_ONLY`)
- weak signals (low severity + low confidence + low financial impact, except safety/weather)
- validation-suppressed (`VALIDATION_SUPPRESSED`)
- redundant downstream actions already resolved by prior step outputs (`REDUNDANT_STEP_ALREADY_RESOLVED`)

### Stage C: Journey-level duplicate action pass
- ensures one strongest surfaced action per journey (`DUPLICATE_JOURNEY_ACTION`)

### Stage D: Conflict suppression
- classifies intents (`REPLACE`, `DEFER`, `EXECUTE`, `NEUTRAL`)
- suppresses conflicting intents in same scope (e.g., replace vs defer)
- reason: `CONFLICTING_ACTION_SUPPRESSED`

### Stage E: Final response dedupe
- final action key by journey+step+recommended tool
- reason: `FINAL_RESPONSE_DUPLICATE`

Also emits lightweight suppression summary logs.

---

## 7) Financial Context Awareness

File: `guidanceFinancialContext.service.ts`

Derived from journey/signal/tool outputs (latest snapshot + payload hints):
- `financialImpactScore` `[0..100]`
- `fundingGapFlag`
- `costOfDelay` (sanitized non-negative)
- `coverageImpact` (`COVERED`/`PARTIAL`/`NOT_COVERED`/`UNKNOWN`)

Logic includes:
- savings/funding gap detection
- cost-of-delay influence
- coverage status influence
- out-of-pocket exposure weighting

---

## 8) Confidence Layer + Copy Polish

### Confidence
File: `guidanceConfidence.service.ts`

Confidence factors:
- signal confidence baseline
- missing context penalties
- derived-data richness bonus/penalty
- source-tool reliability boost
- readiness context adjustments

Output:
- `confidenceScore` `[0..1]`
- `confidenceLabel`: `HIGH` / `MEDIUM` / `LOW`

### Copy/Explanation
File: `guidanceCopy.service.ts`

Provides:
- non-generic step labels (replaces vague labels)
- calm actionable explanation object:
  - `what`
  - `why`
  - `risk`
  - `nextStep`
- polished warning and blocked reason messages
- polished execution-guard reason text

---

## 9) Validation & Guardrails (Production Safety)

Step 6 additions are centered in `guidanceValidation.service.ts` plus resolver/guard integrations.

### 9.1 Math & sanity validation
- clamps and validates:
  - priority score
  - financial impact score
  - cost of delay
  - confidence score
  - break-even months
- produces validation issues (`WARN`/`ERROR` style)
- applies confidence penalties
- can suppress very weak actions safely

### 9.2 Freshness handling
- freshness windows by signal family and tool key
- stale signal behavior:
  - weakness flag
  - missing context marker
  - confidence downgrade
  - readiness downgrade (`READY` -> `NEEDS_CONTEXT`)
- stale derived data persisted and surfaced through enrichment warnings

### 9.3 State transition safety
In `guidanceStepResolver`:
- prevents invalid transition patterns
- prevents silent skipping of required steps
- enforces critical completion data
- prevents completion of journey if critical required steps are not completed

### 9.4 Execution guard hardening
In `guidanceBookingGuard`:
- blocks execution when prerequisites incomplete
- blocks uncertain/low-context execution with clear explanation
- always returns missing prerequisite suggestions

### 9.5 API validation
In `guidance.routes`:
- validates params/query/body for all guidance endpoints
- enforces UUID identifiers where required
- validates target actions for execution guard

---

## 10) Journey + Next-Step Resolution Logic

Next-step result contract includes:
- `journeyId`
- `currentStep`
- `nextStep`
- `executionReadiness`
- `missingPrerequisites[]`
- `warnings[]`
- `blockedReason`
- `recommendedToolKey`, `recommendedFlowKey`

With intelligence enrichment (`resolveNextStepWithIntelligence`) the payload also carries:
- priority fields
- confidence fields
- financial fields
- explanation copy fields
- validation warnings

---

## 11) Backend Integration Points (Home Tools + Workers)

Guidance is wired into key tool/worker completion paths.

### 11.1 Core guidance APIs
- `apps/backend/src/routes/guidance.routes.ts`
- `apps/backend/src/controllers/guidance.controller.ts`

### 11.2 Tool completion hooks (`recordToolCompletion`)
Representative integrations:
- Replace vs Repair: `controllers/replaceRepairAnalysis.controller.ts`
- Coverage Intelligence: `controllers/coverageAnalysis.controller.ts`
- Service Price Radar: `controllers/servicePriceRadar.controller.ts`
- Negotiation Shield: `controllers/negotiationShield.controller.ts`
- Do-Nothing Simulator: `controllers/doNothingSimulator.controller.ts`
- Home Savings: `controllers/homeSavings.controller.ts`
- True Cost: `controllers/trueCostOwnership.controller.ts`
- Recalls: `controllers/recalls.controller.ts`
- Inspection report ingestion path: `routes/inspectionReport.routes.ts`

### 11.3 Execution guard insertion
- Booking flow guard + completion hook:
  - `controllers/booking.controller.ts`
  - uses `guidanceBookingGuardService.assertCanExecute`

### 11.4 Signal source compatibility
Signal resolver supports:
- explicit guidance signal input
- tool-derived entity types
- incident/worker patterns (e.g., recall/freeze/weather/coverage incident keys)
- direct and indirect feature source keys

---

## 12) Frontend Architecture

### 12.1 API + Hooks
- API contracts: `apps/frontend/src/lib/api/guidanceApi.ts`
- Property guidance hook: `apps/frontend/src/features/guidance/hooks/useGuidance.ts`
- Journey detail hook: `apps/frontend/src/features/guidance/hooks/useJourney.ts`
- Execution guard hook: `apps/frontend/src/features/guidance/hooks/useExecutionGuard.ts`

### 12.2 Mapping + Routing
- DTO-to-UI mapping: `features/guidance/utils/guidanceMappers.ts`
- deterministic step href/context routing: `features/guidance/utils/guidanceDisplay.ts`
  - appends `guidanceJourneyId`, `guidanceStepKey`, `guidanceSignalIntentFamily`

### 12.3 Reusable Guidance Components
Directory: `apps/frontend/src/components/guidance/`

- `GuidanceInlinePanel`
- `GuidanceActionCard`
- `GuidancePrimaryCta`
- `GuidanceJourneyStrip`
- `GuidanceWarningBanner`
- `GuidanceDrawer`
- `GuidanceStepList`
- `GuidanceStatusBadge`
- `GuidanceEmptyState`

Step 6 UI safety:
- fallback CTA labels
- safe empty/partial journey rendering
- safe warning defaults
- no broken card behavior on partial payloads

### 12.4 Key Surface Integrations
Representative frontend surfaces currently wired:
- Risk Assessment page: guidance-driven row CTAs + inline panel
  - `app/(dashboard)/dashboard/properties/[id]/risk-assessment/page.tsx`
- Maintenance page panel
  - `app/(dashboard)/dashboard/maintenance/page.tsx`
- Coverage pages/tool pages via inline panel + context headers
- Recall alerts surface
  - `app/(dashboard)/dashboard/properties/[id]/recalls/RecallAlertsClient.tsx`
- Provider booking page execution block UI
  - `app/(dashboard)/dashboard/providers/[id]/book/page.tsx`

---

## 13) Mobile Navigation & Mobile UX Pattern

### 13.1 Mobile tool registries
- AI/mobile catalogs: `apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts`
- Home Tool registry bridge: `apps/frontend/src/features/tools/toolRegistry.ts`

Guidance itself is not a separate nav destination; it is a cross-layer overlay that attaches to:
- mobile tool entries
- mobile-compatible pages
- bottom-sheet journey detail (`GuidanceDrawer` uses bottom mode on narrow screens)

### 13.2 Mobile guidance behavior
- `GuidanceInlinePanel` provides loading/error/empty/data states compatible with stacked mobile sections
- CTA and warning components keep action context visible without requiring desktop layouts
- step detail opens in sheet behavior appropriate for mobile viewport

### 13.3 Context propagation in mobile and desktop flows
Guidance context query params are preserved into downstream tool routes:
- `guidanceJourneyId`
- `guidanceStepKey`
- `guidanceSignalIntentFamily`

These are consumed by tool-specific clients/APIs (Replace/Repair, Coverage Intelligence, Service Price Radar, Negotiation Shield, True Cost, Do-Nothing, Home Savings, provider flows) to update step/journey state after tool completion.

---

## 14) Signal Merging + Cross-Tool Context Passing

### 14.1 Merge primitives
- signal dedupe key: property + signal family + scope/entity
- duplicate group key: property + issue domain + signal family + scope
- journey reuse by active scope + journey type + merged group

### 14.2 Cross-tool derived memory
Journey `derivedSnapshotJson` keeps:
- `byStep`: produced output grouped by step key
- `byTool`: produced output grouped by tool key
- `latest`: flattened latest facts for fast downstream access

This enables later steps (and UI) to consume prior outputs without recomputation.

---

## 15) Priority + Suppression Outcome in API Responses

Property guidance response includes:
- `journeys[]` (already enriched + suppression filtered)
- `next[]` (enriched next-step payloads)
- `suppressedSignals[]` (debug/audit reasons)
- counts for active/surfaced/suppressed totals

This allows frontend to render:
- top actions first
- grouped urgency behavior
- clean noise-reduced guidance surfaces

---

## 16) Logging & Auditability

Guidance engine emits lightweight logs for:
- stale signal normalization
- stale derived data merges
- validation adjustments/suppressions
- suppression summary reason counts
- execution guard blocks

Transition-level audit is persisted in `guidance_journey_events`.

---

## 17) Test Coverage

Backend guidance unit tests:
- `apps/backend/tests/unit/guidanceEngine.test.js`
  - template mapping
  - execution guard behaviors
  - dedupe/suppression/conflict checks
  - priority/financial/confidence behavior
  - stale + transition guard validations

Frontend guidance tests:
- `apps/frontend/src/features/guidance/__tests__/guidanceMappers.test.ts`
- `apps/frontend/src/components/guidance/__tests__/GuidanceSafety.test.tsx`

---

## 18) Operational Notes

1. Guidance is deterministic by design; no AI orchestration decides step order.
2. Tool pages remain directly accessible; guidance context is additive.
3. Execution guard is the safety net for premature execution actions.
4. Freshness/validation guardrails prioritize trust over aggressiveness.
5. Suppression is intentionally multi-pass to remove duplicate/conflicting/noisy actions before UI rendering.

---

## 19) Quick File Index

### Backend
- `apps/backend/prisma/schema.prisma`
- `apps/backend/src/routes/guidance.routes.ts`
- `apps/backend/src/controllers/guidance.controller.ts`
- `apps/backend/src/services/guidanceEngine/guidanceTypes.ts`
- `apps/backend/src/services/guidanceEngine/guidanceTemplateRegistry.ts`
- `apps/backend/src/services/guidanceEngine/guidanceSignalResolver.service.ts`
- `apps/backend/src/services/guidanceEngine/guidanceJourney.service.ts`
- `apps/backend/src/services/guidanceEngine/guidanceStepResolver.service.ts`
- `apps/backend/src/services/guidanceEngine/guidanceDerivedData.service.ts`
- `apps/backend/src/services/guidanceEngine/guidancePriority.service.ts`
- `apps/backend/src/services/guidanceEngine/guidanceFinancialContext.service.ts`
- `apps/backend/src/services/guidanceEngine/guidanceConfidence.service.ts`
- `apps/backend/src/services/guidanceEngine/guidanceSuppression.service.ts`
- `apps/backend/src/services/guidanceEngine/guidanceValidation.service.ts`
- `apps/backend/src/services/guidanceEngine/guidanceCopy.service.ts`
- `apps/backend/src/services/guidanceEngine/guidanceMapper.ts`

### Frontend
- `apps/frontend/src/lib/api/guidanceApi.ts`
- `apps/frontend/src/features/guidance/hooks/useGuidance.ts`
- `apps/frontend/src/features/guidance/hooks/useJourney.ts`
- `apps/frontend/src/features/guidance/hooks/useExecutionGuard.ts`
- `apps/frontend/src/features/guidance/utils/guidanceMappers.ts`
- `apps/frontend/src/features/guidance/utils/guidanceDisplay.ts`
- `apps/frontend/src/components/guidance/*`
- `apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts`
- `apps/frontend/src/features/tools/toolRegistry.ts`

