# Guidance Engine — Functional Requirements Document

**Version:** 2.1
**Last Updated:** 2026-03-26
**Status:** Living Document — reflects current implementation; resolved gaps removed as of v2.1
**Audience:** Backend engineers, frontend engineers, QA, product

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Database Schema](#3-database-schema)
4. [Signal Ingestion Pipeline](#4-signal-ingestion-pipeline)
5. [Journey and Step Engine](#5-journey-and-step-engine)
6. [Scoring, Confidence, and Suppression](#6-scoring-confidence-and-suppression)
7. [Journey Templates](#7-journey-templates)
8. [API Reference](#8-api-reference)
9. [Frontend Integration](#9-frontend-integration)
10. [Gaps and Issues](#10-gaps-and-issues)
11. [Recommended Remediation Roadmap](#11-recommended-remediation-roadmap)

---

## 1. Overview

The Guidance Engine is a signal-driven, deterministic action planning system that converts platform events into ordered, step-by-step journey plans for homeowners. It is not an AI system — all routing, sequencing, and state transitions are rule-based and deterministic.

### 1.1 Design Principles

- **Signal-first:** Everything starts with a `GuidanceSignal` produced by a tool, worker, or external resolver. Journeys do not exist without signals.
- **Deterministic:** Given a `signalIntentFamily`, the same journey template and step sequence is always produced. No AI inference in routing.
- **Stateful:** Journey and step state is persisted in PostgreSQL. Every transition is recorded in an append-only event log.
- **Non-blocking surface:** The guidance layer advises — it does not prevent tool usage. The execution guard is the only hard block, and it applies only at booking/execution stage.
- **Template-driven:** Journey structure is hardcoded in `guidanceTemplateRegistry.ts`. Templates are not stored in the database; they are code.

### 1.2 Scope

| Layer | Included |
|---|---|
| Backend services | 14 TypeScript service/utility files under `apps/backend/src/services/guidanceEngine/` |
| API | 10 REST endpoints under `/api/guidance` |
| Database | 4 Prisma models, 8 enums, 28+ indexes |
| Frontend utilities | `guidanceDisplay.ts`, `GuidanceInlinePanel`, `GuidanceWarningBanner`, `useExecutionGuard` |
| Journey templates | 6 domain templates + 1 default (22 steps total) |
| Worker integration | Signal ingestion via BullMQ workers (not scoped in detail here) |

---

## 2. Architecture

### 2.1 High-Level Data Flow

```
Platform event / tool output
        │
        ▼
GuidanceSignalResolver    ← normalizes, deduplicates, persists signal
        │
        ▼
GuidanceJourneyService    ← orchestrates the full pipeline
  │   ├── ensureJourneyForSignal()     ← finds or creates journey from template
  │   ├── GuidanceStepResolver         ← hydrates steps, manages transitions
  │   ├── GuidanceConfidenceService    ← computes confidence score
  │   ├── GuidanceFinancialContext     ← computes financial impact
  │   ├── GuidancePriorityService      ← computes priority score + bucket
  │   ├── GuidanceValidationService    ← validates freshness and math
  │   └── GuidanceSuppression          ← 8-stage dedup/filter before surface
        │
        ▼
REST API (guidance.routes.ts / guidance.controller.ts)
        │
        ▼
Frontend (GuidanceInlinePanel, GuidanceWarningBanner, useExecutionGuard)
```

### 2.2 Service Responsibilities

| File | Responsibility |
|---|---|
| `guidanceTypes.ts` | Enums, interfaces, type utilities (`getGuidanceModels`, `clampConfidenceToDecimal`) |
| `guidanceTemplateRegistry.ts` | Hardcoded journey templates, `TOOL_DEFAULT_STEP_KEY`, skip policies |
| `guidanceSignalResolver.service.ts` | Signal normalization, deduplication, upsert |
| `guidanceJourney.service.ts` | Main orchestrator: ingest, ensure journey, record completion, surface |
| `guidanceStepResolver.service.ts` | Step hydration from template, status transitions, `recomputeJourneyState()` |
| `guidanceConfidence.service.ts` | Confidence score (0–1) with 8 adjustment factors |
| `guidanceFinancialContext.service.ts` | Financial impact score (0–100), funding gap, cost-of-delay |
| `guidancePriority.service.ts` | Priority score (0–100), bucket (CRITICAL/HIGH/MEDIUM/LOW), group |
| `guidanceValidation.service.ts` | Signal/tool freshness assessment, math/safety validation |
| `guidanceSuppression.service.ts` | 8-stage in-memory deduplication and filtering before surface |
| `guidanceDerivedData.service.ts` | Merges step tool outputs into `derivedSnapshotJson` |
| `guidanceBookingGuard.service.ts` | Execution guard: evaluates prerequisite completion before booking |
| `guidanceCopy.service.ts` | Human-readable label polishing, blocked reason formatting |
| `guidanceMapper.ts` | Prisma model → DTO mapping for API responses |

---

## 3. Database Schema

### 3.1 Models

#### `GuidanceSignal` (`guidance_signals`)

Normalized actionable signal. One signal per unique event/trigger. Produced by any tool, worker, or external resolver.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `propertyId` | String FK | Required. Cascade delete. |
| `homeAssetId` | String FK? | Optional asset scope. SetNull on delete. |
| `inventoryItemId` | String FK? | Optional item scope. SetNull on delete. |
| `signalKey` | String? | External signal identifier for imports. No unique constraint. |
| `signalIntentFamily` | String | **Plain string — no enum constraint.** Routes to journey template. |
| `issueDomain` | `GuidanceIssueDomain` | Enum-constrained domain. |
| `decisionStage` | `GuidanceDecisionStage` | Starting decision stage. |
| `executionReadiness` | `GuidanceExecutionReadiness` | Default: `UNKNOWN`. |
| `status` | `GuidanceSignalStatus` | Default: `ACTIVE`. |
| `severity` | `GuidanceSeverity?` | Nullable. No DB default enforced. |
| `severityScore` | Int? | Application-computed 0–100. **No range constraint at DB level.** |
| `confidenceScore` | Decimal(5,4)? | Range should be 0–1. **No check constraint at DB level.** |
| `sourceType` | `SignalSourceType?` | |
| `sourceFeatureKey` | String? | |
| `sourceToolKey` | String? | Plain string — no FK to tools. |
| `sourceEntityType` | String? | |
| `sourceEntityId` | String? | |
| `sourceRunId` | String? | |
| `sourceProvenanceId` | String? FK | |
| `dedupeKey` | String? | **No UNIQUE constraint** — enforced in application only. |
| `duplicateGroupKey` | String? | No FK to any group table. |
| `actionWeaknessFlags` | String[] | |
| `contextPrerequisites` | String[] | |
| `missingContextKeys` | String[] | |
| `canonicalFirstStepKey` | String? | |
| `recommendedToolKey` | String? | |
| `recommendedFlowKey` | String? | |
| `payloadJson` | Json? | Untyped. |
| `metadataJson` | Json? | Untyped. |
| `firstObservedAt` | DateTime | |
| `lastObservedAt` | DateTime | |
| `resolvedAt` | DateTime? | **No constraint ensuring set when status=RESOLVED.** |
| `archivedAt` | DateTime? | **No constraint ensuring set when status=ARCHIVED.** |

**Indexes:** `(propertyId, status, lastObservedAt)`, `(propertyId, executionReadiness)`, `(propertyId, issueDomain)`, `(propertyId, signalIntentFamily)`, `(propertyId, dedupeKey)`, `(duplicateGroupKey)`, `(homeAssetId)`, `(inventoryItemId)`, `(sourceEntityType, sourceEntityId)`, `(sourceToolKey, sourceFeatureKey)`, `(sourceProvenanceId)`

---

#### `GuidanceJourney` (`guidance_journeys`)

Deterministic action plan for one signal or merged signal group. Steps are child records.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `propertyId` | String FK | Cascade delete. |
| `homeAssetId` | String FK? | SetNull on delete. |
| `inventoryItemId` | String FK? | SetNull on delete. |
| `primarySignalId` | String FK? | SetNull on delete. |
| `journeyKey` | String? | **Nullable — journey without key can't be matched to template.** |
| `journeyTypeKey` | String? | **Nullable — critical routing key stored as unvalidated string.** |
| `issueDomain` | `GuidanceIssueDomain` | |
| `decisionStage` | `GuidanceDecisionStage` | Default: `AWARENESS`. |
| `executionReadiness` | `GuidanceExecutionReadiness` | Default: `UNKNOWN`. |
| `status` | `GuidanceJourneyStatus` | Default: `ACTIVE`. |
| `mergedSignalGroupKey` | String? | No FK to any group table. |
| `currentStepOrder` | Int? | Denormalized current position. |
| `currentStepKey` | String? | Denormalized current step. |
| `isLowContext` | Boolean | Default: false. |
| `missingContextKeys` | String[] | |
| `contextSnapshotJson` | Json? | Untyped context snapshot. |
| `derivedSnapshotJson` | Json? | Merged tool output. **Untyped — no schema enforcement.** |
| `startedAt` | DateTime | |
| `completedAt` | DateTime? | |
| `abortedAt` | DateTime? | |
| `archivedAt` | DateTime? | |
| `lastTransitionAt` | DateTime? | **No enforcement that this is updated on every state change.** |

**Indexes:** `(propertyId, status, updatedAt)`, `(propertyId, executionReadiness, status)`, `(propertyId, issueDomain, status)`, `(propertyId, currentStepOrder)`, `(primarySignalId)`, `(mergedSignalGroupKey)`, `(homeAssetId)`, `(inventoryItemId)`

**Missing index:** `(propertyId, journeyTypeKey, status)` — finding active journeys of a specific type requires scanning all journeys for a property.

---

#### `GuidanceJourneyStep` (`guidance_journey_steps`)

One row per template step, created when the journey is initialized.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `journeyId` | String FK | Cascade delete. |
| `stepOrder` | Int | |
| `stepKey` | String | |
| `stepType` | String? | **Plain nullable string — should be an enum.** |
| `label` | String | |
| `description` | String? | |
| `decisionStage` | `GuidanceDecisionStage?` | |
| `executionReadiness` | `GuidanceExecutionReadiness` | Default: `UNKNOWN`. |
| `status` | `GuidanceStepStatus` | Default: `PENDING`. |
| `isRequired` | Boolean | Default: true. |
| `toolKey` | String? | **Plain string — no FK, no validation against known tools.** |
| `flowKey` | String? | Stored but never read by routing logic. Dead metadata. |
| `routePath` | String? | Copied from template at creation. **Stale if template changes.** |
| `requiredContextKeys` | String[] | |
| `missingContextKeys` | String[] | |
| `blockedReasonCode` | String? | **Plain string — should be enum for queryability.** |
| `blockedReason` | String? | |
| `skippedReasonCode` | String? | **Plain string — should be enum.** |
| `skippedReason` | String? | |
| `inputContextJson` | Json? | Input context at step start. |
| `producedDataJson` | Json? | Tool output stored at completion. |
| `startedAt` | DateTime? | |
| `completedAt` | DateTime? | |
| `skippedAt` | DateTime? | |
| `blockedAt` | DateTime? | |
| `unblockedAt` | DateTime? | |

**Unique constraints:** `(journeyId, stepOrder)`, `(journeyId, stepKey)`
**Indexes:** `(journeyId, status, stepOrder)`, `(journeyId, decisionStage, status)`, `(journeyId, executionReadiness)`, `(toolKey)`

**Missing index:** `(journeyId, toolKey)` — `GuidanceBookingGuardService` filters steps by `toolKey` pattern but no index covers this lookup.

---

#### `GuidanceJourneyEvent` (`guidance_journey_events`)

Append-only transition ledger. One row per state change or significant action.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `propertyId` | String FK | Cascade delete. |
| `journeyId` | String FK | Cascade delete. |
| `stepId` | String FK? | SetNull on delete. |
| `signalId` | String FK? | SetNull on delete. |
| `eventType` | `GuidanceJourneyEventType` | |
| `fromJourneyStatus` | `GuidanceJourneyStatus?` | |
| `toJourneyStatus` | `GuidanceJourneyStatus?` | |
| `fromStepStatus` | `GuidanceStepStatus?` | |
| `toStepStatus` | `GuidanceStepStatus?` | |
| `actorUserId` | String? | **No actorType field — can't distinguish user vs. system events.** |
| `reasonCode` | String? | |
| `reasonMessage` | String? | |
| `payloadJson` | Json? | Event-specific details. Untyped. |
| `createdAt` | DateTime | Append-only — no `updatedAt`. |

**Indexes:** `(propertyId, createdAt)`, `(journeyId, createdAt)`, `(stepId, createdAt)`, `(signalId, createdAt)`, `(eventType, createdAt)`

**Missing index:** `(journeyId, eventType)` — querying events of a specific type within a journey scans the full event log for that journey.

**Missing fields:** `fromJourneyReadiness` / `toJourneyReadiness` for `JOURNEY_READINESS_CHANGED` events — the event type exists but the before/after readiness values are not recorded. `changedKeys String[]` for `CONTEXT_UPDATED` / `DERIVED_DATA_UPDATED` events — these event types record that something changed but not what.

---

### 3.2 Enums

| Enum | Values | Notes |
|---|---|---|
| `GuidanceIssueDomain` | SAFETY, MAINTENANCE, INSURANCE, FINANCIAL, COMPLIANCE, MARKET_VALUE, ASSET_LIFECYCLE, CLAIMS, PRICING, NEGOTIATION, BOOKING, DOCUMENTATION, NEIGHBORHOOD, ONBOARDING, WEATHER, ENERGY, OTHER | **11 of 17 values have no corresponding journey template** (see Gap DB-9) |
| `GuidanceDecisionStage` | AWARENESS, DIAGNOSIS, DECISION, EXECUTION, VALIDATION, TRACKING | Used at both journey and step level |
| `GuidanceExecutionReadiness` | NOT_READY, NEEDS_CONTEXT, READY, TRACKING_ONLY, UNKNOWN | `UNKNOWN` journeys can linger with no migration path |
| `GuidanceSignalStatus` | ACTIVE, RESOLVED, SUPPRESSED, ARCHIVED | Status/timestamp consistency not enforced at DB level |
| `GuidanceJourneyStatus` | ACTIVE, COMPLETED, ABORTED, ARCHIVED | |
| `GuidanceStepStatus` | PENDING, IN_PROGRESS, COMPLETED, SKIPPED, BLOCKED | |
| `GuidanceSeverity` | INFO, LOW, MEDIUM, HIGH, CRITICAL, UNKNOWN | `severity` field is nullable — no DB default |
| `GuidanceJourneyEventType` | JOURNEY_CREATED, JOURNEY_STATUS_CHANGED, JOURNEY_READINESS_CHANGED, STEP_STATUS_CHANGED, STEP_STARTED, STEP_COMPLETED, STEP_SKIPPED, STEP_BLOCKED, STEP_UNBLOCKED, CONTEXT_UPDATED, DERIVED_DATA_UPDATED | `JOURNEY_READINESS_CHANGED` has no corresponding readiness fields on the model |

**Missing enum:** No `GuidanceStepType` enum — `stepType` in `GuidanceJourneyStep` is `String?`. Template values are: AWARENESS, DIAGNOSIS, DECISION, VALIDATION, EXECUTION, TRACKING.

**Missing enum:** No `GuidanceSignalIntentFamily` enum — `signalIntentFamily` in `GuidanceSignal` is a plain `String`. The 9 named families in the template registry should be enum-constrained to prevent silent routing failures.

---

## 4. Signal Ingestion Pipeline

### 4.1 Entry Point: `resolveAndPersistSignal()`

Called by any platform feature to convert a raw event into a guidance signal.

```
raw signal input
    │
    ▼
inferSignalIntentFamily()    ← maps sourceToolKey + payload hints → intentFamily string
    │
    ▼
normalizeSignal()            ← fills severity, stage, readiness, dedupeKey defaults
    │
    ▼
computeDedupeKey()           ← SHA-style key: propertyId + intentFamily + entityId + sourceToolKey
    │
    ▼
upsertSignal()               ← INSERT ... ON CONFLICT(dedupeKey) DO UPDATE
    │
    ▼
GuidanceJourneyService.ingestSignal()
```

### 4.2 Deduplication

- `dedupeKey` is computed deterministically from `{propertyId}:{intentFamily}:{sourceEntityId}:{sourceToolKey}`.
- Upsert updates `lastObservedAt`, `severityScore`, `confidenceScore`, `payloadJson` on repeat.
- **Gap:** No UNIQUE constraint on `dedupeKey` in the DB — race conditions on concurrent ingests can create duplicate signal rows.

### 4.3 Signal → Journey Routing

`signalIntentFamily` is looked up in `templateByFamily` map (built at startup from `guidanceTemplateRegistry.ts`). If no match, `DEFAULT_TEMPLATE` is used. The match is a plain string comparison — any typo or new intent family silently falls to DEFAULT.

---

## 5. Journey and Step Engine

### 5.1 Journey Creation: `ensureJourneyForSignal()`

1. Query for an existing `ACTIVE` journey for the same `propertyId` + `journeyTypeKey` (+ optional `inventoryItemId` / `homeAssetId`).
2. If found: associate the new signal, update `lastTransitionAt`.
3. If not found: create journey row, call `ensureTemplateSteps()` to hydrate all steps from the template.
4. `recomputeJourneyState()` is called after every mutation.

### 5.2 Step Lifecycle State Machine

```
PENDING → IN_PROGRESS → COMPLETED
                      ↘ SKIPPED
       → BLOCKED      ↗
```

Valid transitions enforced by `VALID_STEP_TRANSITIONS` map in `guidanceStepResolver.service.ts`:

| From | Allowed To |
|---|---|
| PENDING | IN_PROGRESS, SKIPPED, BLOCKED |
| IN_PROGRESS | COMPLETED, SKIPPED, BLOCKED, PENDING |
| BLOCKED | IN_PROGRESS, PENDING |
| COMPLETED | (terminal — no transitions out) |
| SKIPPED | PENDING (re-open only) |

`CRITICAL_REQUIRED_STEP_KEYS` (12 keys) bypass skip-policy enforcement and cannot be skipped regardless of policy setting.

### 5.3 Journey State Recomputation: `recomputeJourneyState()`

Runs after every step transition. Updates on the journey:
- `currentStepKey` / `currentStepOrder` — the lowest-order non-COMPLETED, non-SKIPPED step
- `decisionStage` — derived from current step's `decisionStage`
- `executionReadiness` — `READY` only when all required steps are COMPLETED; `NOT_READY` if any required step is BLOCKED; `TRACKING_ONLY` if all non-tracking steps are done
- `missingContextKeys` — union of all step-level missing keys
- `isLowContext` — true if any required step has missing context
- Journey `status` → `COMPLETED` when all required steps are COMPLETED

### 5.4 Step Completion: `recordToolCompletion()`

Called by frontend tools when a user completes a tool action.

```
POST /api/guidance/tool-completion
{
  propertyId, journeyId?, stepKey?, toolKey?, toolOutput
}
```

1. Resolves `stepKey` from request body, or falls back to `TOOL_DEFAULT_STEP_KEY[toolKey]`.
2. Finds the journey step by `(journeyId, stepKey)`.
3. Merges `toolOutput` into step's `producedDataJson`.
4. Calls `markStepStatus(step, 'COMPLETED')`.
5. Calls `GuidanceDerivedDataService.mergeStepOutput()` to update `derivedSnapshotJson` on the journey.
6. Calls `recomputeJourneyState()`.

**`TOOL_DEFAULT_STEP_KEY` map (global, not journey-aware):**

| toolKey | Default stepKey | Journey context |
|---|---|---|
| `replace-repair` | `repair_replace_decision` | asset_lifecycle only |
| `coverage-intelligence` | `check_coverage` | asset_lifecycle AND coverage_gap (same key — safe) |
| `recalls` | `recall_resolution` | recall_safety — **skips steps 1 and 2** |
| `booking` | `book_service` | asset_lifecycle; conflicts with inspection_followup's `route_specialist` |
| `home-event-radar` | `weather_safety_check` | weather_risk; conflicts with inspection_followup's `track_resolution` |
| `inspection-report` | `assess_urgency` | inspection_followup only |
| `service-price-radar` | `validate_price` | asset_lifecycle; conflicts with inspection_followup's `estimate_repair_cost` |
| `negotiation-shield` | `prepare_negotiation` | asset_lifecycle only |
| `do-nothing-simulator` | `compare_action_options` | financial_exposure only |
| `home-savings` | `evaluate_savings_funding` | financial_exposure only |
| `true-cost` | `estimate_out_of_pocket_cost` | financial_exposure; conflicts with coverage_gap's `estimate_exposure` |

### 5.5 `resolveNextStep()`

Returns the next actionable step and recommended tool. Filters out COMPLETED, SKIPPED, and TRACKING_ONLY steps. Used by the frontend to build the "Next Step" CTA.

---

## 6. Scoring, Confidence, and Suppression

### 6.1 Priority Scoring (`guidancePriority.service.ts`)

Produces `priorityScore` (0–100), `priorityBucket` (CRITICAL/HIGH/MEDIUM/LOW), and `priorityGroup`.

**Component weights:**
- Severity: 35% (CRITICAL=100, HIGH=80, MEDIUM=55, LOW=30, INFO=10, UNKNOWN=20)
- Urgency modifier: variable (+20 for AWARENESS/DIAGNOSIS, +10 for DECISION, +5 for EXECUTION)
- Financial impact: 28% of `financialImpactScore`
- Safety boost: +18 flat for SAFETY domain or CRITICAL severity
- Confidence: 12% of `confidenceScore × 100`
- Readiness adjustment: +5 for READY, −8 for NOT_READY

**Buckets:** CRITICAL ≥ 72, HIGH ≥ 52, MEDIUM ≥ 30, LOW < 30.

### 6.2 Confidence Scoring (`guidanceConfidence.service.ts`)

Produces `confidenceScore` (0–1) and `confidenceLabel` (HIGH/MEDIUM/LOW).

**Adjustments from base (`signalConfidence` or 0.58):**
- Missing context keys: −0.08 per key (max −0.35)
- Derived snapshot richness (≥4 keys): +0.08; empty: −0.06
- Reliable source tool: +0.06 (8 tools qualify)
- Twin completeness: ±0.22 × (completeness − 0.5)
- Signal freshness ≤7 days: +0.03; stale: −0.10
- Derived freshness ≤14 days: +0.02; stale: −0.08
- Journey readiness READY: +0.04; NOT_READY + missing keys: −0.04

**Labels:** HIGH ≥ 0.72, MEDIUM ≥ 0.45, LOW < 0.45.

### 6.3 Financial Context (`guidanceFinancialContext.service.ts`)

Produces `financialImpactScore` (0–100), `fundingGapFlag`, `costOfDelay`, `coverageImpact`.

Reads from signal payload and derived snapshot. Weighted components: replacement cost (30%), repair cost (20%), estimated coverage gap (25%), cost of delay (25%). Penalty for coverage gap: +15 when funding gap detected.

### 6.4 Validation (`guidanceValidation.service.ts`)

- `assessSignalFreshness()` — compares `lastObservedAt` against per-family max-age table. Families with 1-day max-age: `freeze_risk`, `inspection_followup_needed`. Families with 30-day max-age: `coverage_gap`, `financial_exposure`, `lifecycle_end_or_past_life`.
- `assessToolFreshness()` — compares tool output age against per-tool max-age. `inspection-report`: 30 days. `coverage-intelligence`: 60 days. `service-price-radar`: 7 days.
- `validateMathAndSafety()` — sanity checks on score ranges and required field presence.

### 6.5 Suppression Pipeline (`guidanceSuppression.service.ts`)

8 in-memory stages applied before surface. **Not persisted — suppressed items are filtered from the response but remain ACTIVE in the DB.**

| Stage | Purpose |
|---|---|
| 1. Dedup by key | Remove identical `dedupeKey` within the same request batch |
| 2. Tracking-only filter | Remove journeys in TRACKING_ONLY readiness unless explicitly requested |
| 3. Weak signal filter | Remove signals below minimum confidence threshold |
| 4. Validation filter | Remove signals flagged by `validateMathAndSafety()` |
| 5. Redundant filter | Remove lower-priority signals already covered by a higher-priority active journey |
| 6. Dedup by journey | Remove duplicate journey representations for the same underlying issue |
| 7. Conflict scope filter | Remove conflicting signals where a READY journey already covers the same domain |
| 8. Final dedup | Deduplicate surface list by `(journeyId, stepKey)` |

---

## 7. Journey Templates

All templates are defined in `guidanceTemplateRegistry.ts`. Templates are **not stored in the database** — steps are copied to `GuidanceJourneyStep` rows at journey creation time. Template changes do not retroactively update existing step rows.

### 7.1 `asset_lifecycle_resolution`

**Trigger:** `lifecycle_end_or_past_life`, `maintenance_failure_risk`
**Domain:** ASSET_LIFECYCLE | **Scope:** inventory item (requires `inventoryItemId`)

| # | stepKey | Tool | Stage | Required | routePath |
|---|---|---|---|---|---|
| 1 | `repair_replace_decision` | replace-repair | DECISION | Yes | `/dashboard/properties/:propertyId/inventory/items/:itemId/replace-repair` |
| 2 | `check_coverage` | coverage-intelligence | VALIDATION | Yes | `/dashboard/properties/:propertyId/tools/coverage-intelligence` |
| 3 | `validate_price` | service-price-radar | VALIDATION | Yes | `/dashboard/properties/:propertyId/tools/service-price-radar` |
| 4 | `prepare_negotiation` | negotiation-shield | VALIDATION | No | `/dashboard/properties/:propertyId/tools/negotiation-shield` |
| 5 | `book_service` | booking | EXECUTION | Yes | `/dashboard/bookings` |

### 7.2 `coverage_gap_resolution`

**Trigger:** `coverage_gap`, `coverage_lapse_detected`
**Domain:** INSURANCE | **Scope:** property (no item scope)

| # | stepKey | Tool | Stage | Required | routePath |
|---|---|---|---|---|---|
| 1 | `check_coverage` | coverage-intelligence | DIAGNOSIS | Yes | `/dashboard/properties/:propertyId/tools/coverage-intelligence` |
| 2 | `estimate_exposure` | true-cost | DECISION | Yes | `/dashboard/properties/:propertyId/tools/true-cost` |
| 3 | `compare_coverage_options` | insurance-trend | DECISION | Yes | `/dashboard/properties/:propertyId/tools/insurance-trend` |
| 4 | `update_policy_or_documents` | documents | EXECUTION | Yes | `/dashboard/vault` ⚠️ |

### 7.3 `recall_safety_resolution`

**Trigger:** `recall_detected`
**Domain:** SAFETY | **Scope:** property (optionally item-scoped)

| # | stepKey | Tool | Stage | Required | routePath |
|---|---|---|---|---|---|
| 1 | `safety_alert` | recalls | AWARENESS | Yes | `/dashboard/properties/:propertyId/recalls` |
| 2 | `review_remedy_instructions` | recalls | DIAGNOSIS | Yes | *(none — fallback to recalls page)* |
| 3 | `recall_resolution` | recalls | EXECUTION | Yes | *(none — fallback to recalls page)* |

### 7.4 `weather_risk_resolution`

**Trigger:** `freeze_risk`
**Domain:** WEATHER | **Scope:** property

| # | stepKey | Tool | Stage | Required | routePath |
|---|---|---|---|---|---|
| 1 | `weather_safety_check` | home-event-radar | AWARENESS | Yes | `/dashboard/properties/:propertyId/tools/home-event-radar` ⚠️ |
| 2 | `protect_exposed_systems` | maintenance | DIAGNOSIS | Yes | `/dashboard/maintenance?propertyId=:propertyId` ⚠️ |
| 3 | `schedule_weather_followup` | booking | EXECUTION | No | `/dashboard/providers?category=PLUMBING` ⚠️ |

### 7.5 `inspection_followup_resolution`

**Trigger:** `inspection_followup_needed`
**Domain:** MAINTENANCE | **Scope:** property

| # | stepKey | Tool | Stage | Required | routePath |
|---|---|---|---|---|---|
| 1 | `assess_urgency` | inspection-report | DIAGNOSIS | Yes | `/dashboard/inspection-report` ⚠️ |
| 2 | `estimate_repair_cost` | service-price-radar | DECISION | Yes | *(none — fallback)* |
| 3 | `route_specialist` | booking | EXECUTION | Yes | `/dashboard/bookings` |
| 4 | `track_resolution` | home-event-radar | TRACKING | Yes | *(none — fallback)* |

### 7.6 `financial_exposure_resolution`

**Trigger:** `financial_exposure`, `cost_of_inaction_risk`
**Domain:** FINANCIAL | **Scope:** property

| # | stepKey | Tool | Stage | Required | routePath |
|---|---|---|---|---|---|
| 1 | `estimate_out_of_pocket_cost` | true-cost | DIAGNOSIS | Yes | *(none — fallback)* |
| 2 | `compare_action_options` | do-nothing-simulator | DECISION | Yes | *(none — fallback)* |
| 3 | `evaluate_savings_funding` | home-savings | DECISION | Yes | *(none — fallback)* |
| 4 | `route_financial_plan` | capital-timeline | TRACKING | No | *(none — fallback)* |

### 7.7 `generic_guidance_resolution` (DEFAULT)

**Trigger:** Any unmapped `signalIntentFamily`
**Domain:** OTHER

| # | stepKey | Tool | Stage | Required | routePath |
|---|---|---|---|---|---|
| 1 | `review_signal` | home-event-radar | AWARENESS | Yes | *(none — fallback, but fallback also broken)* |

---

## 8. API Reference

All endpoints require JWT auth and are prefixed `/api/guidance`.

| Method | Path | Controller | Description |
|---|---|---|---|
| `POST` | `/signals` | `ingestSignal` | Ingest a new guidance signal. Creates or updates signal + journey. |
| `GET` | `/properties/:propertyId` | `getPropertyGuidance` | Get all active journeys + surfaced actions for a property. |
| `GET` | `/journeys/:journeyId` | `getJourney` | Get full journey with steps and events. |
| `POST` | `/tool-completion` | `recordToolCompletion` | Record tool output and advance the current step. |
| `POST` | `/journeys/:journeyId/steps/:stepKey/skip` | `skipStep` | Skip a step with reason. Enforces skip policy. |
| `POST` | `/journeys/:journeyId/abort` | `abortJourney` | Abort a journey. |
| `GET` | `/execution-guard` | `evaluateExecutionGuard` | Check if execution prerequisites are met. |
| `POST` | `/journeys/:journeyId/context` | `updateJourneyContext` | Update context snapshot; triggers recompute. |
| `GET` | `/journeys/:journeyId/next-step` | `getNextStep` | Resolve next actionable step with recommended tool and href. |
| `GET` | `/admin/signals` | `listSignals` | Admin: list signals with filters. |

### 8.1 Key Request Schemas

**`POST /signals`** (Zod-validated)
```typescript
{
  propertyId: string,
  signalIntentFamily: string,
  issueDomain: GuidanceIssueDomain,
  decisionStage: GuidanceDecisionStage,
  severity?: GuidanceSeverity,
  sourceToolKey?: string,
  sourceEntityType?: string,
  sourceEntityId?: string,
  payloadJson?: object,
  homeAssetId?: string,
  inventoryItemId?: string,
}
```

**`POST /tool-completion`** (Zod-validated)
```typescript
{
  propertyId: string,
  journeyId?: string,
  stepKey?: string,
  toolKey?: string,
  toolOutput?: object,
  homeAssetId?: string,
  inventoryItemId?: string,
}
```

**`GET /execution-guard`** (query params)
```typescript
{
  propertyId: string,
  targetAction: 'BOOKING' | 'INSPECTION_SCHEDULING' | 'CLAIM_ESCALATION',
  journeyId?: string,
  inventoryItemId?: string,
  homeAssetId?: string,
}
```

---

## 9. Frontend Integration

### 9.1 URL Resolution (`guidanceDisplay.ts`)

`resolveGuidanceStepHref()` builds the navigation URL for a guidance step:

1. Use `step.routePath` if present.
2. If absent, fall back to `FALLBACK_TOOL_ROUTE[step.toolKey]`.
3. Replace `:propertyId`, `:itemId`, `:inventoryItemId`, `:homeAssetId` path params.
4. Special case: `replace-repair` + `inventoryItemId` → item-scoped path.
5. Call `stripUnresolvedSegments()` — if any `:param` placeholder remains unresolved, return `null` (URL is unrenderable).
6. Append guidance context query params: `guidanceJourneyId`, `guidanceStepKey`, `guidanceSignalIntentFamily`.

`FALLBACK_TOOL_ROUTE` map (used when `routePath` is absent):
```
replace-repair        → /dashboard/replace-repair (global — not item-scoped)
coverage-intelligence → /dashboard/properties/:propertyId/tools/coverage-intelligence
service-price-radar   → /dashboard/properties/:propertyId/tools/service-price-radar
negotiation-shield    → /dashboard/properties/:propertyId/tools/negotiation-shield
inspection-report     → /dashboard/inspection-report (not property-scoped)
booking               → /dashboard/bookings?propertyId=:propertyId
recalls               → /dashboard/properties/:propertyId/recalls
documents             → /dashboard/vault  ⚠️ broken path
home-event-radar      → /dashboard/properties/:propertyId/tools/home-event-radar  ⚠️ redirects
do-nothing-simulator  → /dashboard/properties/:propertyId/tools/do-nothing
home-savings          → /dashboard/properties/:propertyId/tools/home-savings
capital-timeline      → /dashboard/properties/:propertyId/tools/capital-timeline
true-cost             → /dashboard/properties/:propertyId/tools/true-cost
insurance-trend       → /dashboard/properties/:propertyId/tools/insurance-trend
```

### 9.2 Guidance UI Components

| Component | Purpose | Advances step? |
|---|---|---|
| `GuidanceInlinePanel` | Shows journey context, current step, progress. Informational only. | No |
| `GuidanceWarningBanner` | Shown when execution guard blocks an action. Shows missing prerequisite steps. | No |
| `useExecutionGuard()` | Hook that calls `GET /guidance/execution-guard` before allowing booking. | Indirectly (blocks until prerequisites met) |

### 9.3 Tool Page Integration Status

| Page | Steps Routed Here | Reads Params | Calls Completion API | Execution Guard | Advances Step |
|---|---|---|---|---|---|
| `replace-repair` | `repair_replace_decision` | ✅ All 3 | ✅ Yes | ❌ | ✅ |
| `service-price-radar` | `validate_price`, `estimate_repair_cost` | ✅ All 3 | ✅ Yes | ❌ | ✅ |
| `negotiation-shield` | `prepare_negotiation` | ⚠️ 2 of 3 (missing `signalIntentFamily`) | ✅ Yes | ❌ | ✅ |
| `true-cost` | `estimate_out_of_pocket_cost`, `estimate_exposure` | ⚠️ 2 of 3 (missing `signalIntentFamily`) | ✅ Yes | ❌ | ✅ |
| `providers` | `route_specialist`, `schedule_weather_followup` | ✅ All 3 | ✅ Yes | ✅ | ✅ |
| `coverage-intelligence` | `check_coverage`, `identify_coverage_gap` | ❌ | ❌ | ❌ | ❌ |
| `maintenance` | `protect_exposed_systems` | ❌ | ❌ | ❌ | ❌ |
| `recalls` | `safety_alert`, `review_remedy_instructions`, `recall_resolution` | ❌ | ❌ | ❌ | ❌ |
| `inspection-report` | `assess_urgency` | ❌ | ❌ | ❌ | ❌ |
| `home-event-radar` | `weather_safety_check`, `review_signal` | ❌ (redirects away) | ❌ | ❌ | ❌ |
| `insurance-trend` | `update_coverage_profile`, `compare_coverage_options` | ❌ | ❌ | ❌ | ❌ |
| `do-nothing` | `compare_action_options` | ❌ | ❌ | ❌ | ❌ |
| `home-savings` | `evaluate_savings_funding` | ❌ | ❌ | ❌ | ❌ |
| `capital-timeline` | `plan_capital_expense`, `route_financial_plan` | ❌ | ❌ | ❌ | ❌ |
| `vault` | `update_policy_or_documents` | N/A — route broken | N/A | N/A | N/A |
| `bookings` | (booking confirmation) | ❌ | ❌ | ❌ | ❌ |

---

## 10. Gaps and Issues

All gaps are assigned a priority:

| Priority | Meaning |
|---|---|
| **P0 — Blocker** | System cannot function correctly. Wrong tool assigned to step (tool cannot deliver what the step promises), broken route (destination unreachable), or data integrity failure. Must be fixed before feature is reliable. |
| **P1 — Structural** | Journey intent is not achievable with current design. Missing critical steps, wrong step sequence for a signal family, cross-journey data collision. |
| **P2 — Integration** | Correct tool and route, but the destination page has no guidance integration — steps get permanently stuck, journey cannot complete. |
| **P3 — Scope/Context** | Correct tool and route, but the context needed to serve the specific journey is lost en route (no item ID, no pre-filtered category, property-wide tool for item-specific journey). |
| **P4 — Database/Infrastructure** | Schema design issues, missing constraints, missing indexes, enum gaps. |
| **P5 — Enhancement** | Missing but non-critical steps, partial param passing, minor UX improvements. |

---

### 10.1 P0 — Blockers

#### P0-1: `coverage_gap_resolution` Step 2 — Wrong Tool: `true-cost` cannot estimate coverage exposure

- **Journey:** `coverage_gap_resolution`
- **Step:** `estimate_exposure` (step 2)
- **Assigned tool:** `true-cost`
- **Problem:** `true-cost` calculates property-wide total cost of ownership (depreciation schedules, aggregate maintenance cost). It has no concept of a coverage gap, a specific uncovered asset, or what a repair would cost if not covered. The step label "Estimate uncovered exposure" is completely undeliverable by this tool.
- **What is needed:** A tool that can estimate the out-of-pocket cost if the gap remains — specifically `service-price-radar` (market repair cost if uninsured) or a dedicated coverage gap calculator.
- **Fix:** Replace `toolKey: 'true-cost'` with `toolKey: 'service-price-radar'` for this step. Update `stepKey` to something like `estimate_uninsured_cost`. Update `routePath` accordingly.

#### P0-2: `coverage_gap_resolution` Step 3 — Wrong Tool: `insurance-trend` cannot compare coverage options

- **Journey:** `coverage_gap_resolution`
- **Step:** `compare_coverage_options` (step 3)
- **Assigned tool:** `insurance-trend`
- **Problem:** `insurance-trend` is a read-only historical visualization of insurance premium trends over time. It has no "compare options" functionality, no policy comparison, no way to select a new policy or warranty. The step label "Compare policy and warranty options" is not deliverable by this tool.
- **What is needed:** A tool or external flow that allows the homeowner to compare insurance/warranty options and take action to change coverage.
- **Fix:** This step either needs a new tool (policy comparison), or should be split into an informational step (use `insurance-trend` to understand market context) and a separate action step (contact broker / initiate policy update). Do not label an informational tool as a comparison/decision tool.

#### P0-3: `coverage_gap_resolution` Step 4 — Broken Route and Missing stepKey Fallback

- **Journey:** `coverage_gap_resolution`
- **Step:** `update_policy_or_documents` (step 4)
- **Problem 1:** `routePath: '/dashboard/vault'` is incorrect. The vault lives at `/vault` (root), not `/dashboard/vault`. `resolveGuidanceStepHref()` will never produce a working URL for this step.
- **Problem 2:** `toolKey: 'documents'` is absent from `TOOL_DEFAULT_STEP_KEY`. If `recordToolCompletion` is called from the vault page without an explicit `stepKey`, the backend cannot resolve which step to complete. The step will never advance.
- **Fix:** Correct `routePath` to the actual vault path. Add `'documents': 'update_policy_or_documents'` to `TOOL_DEFAULT_STEP_KEY`.

#### P0-4: `recall_safety_resolution` — Missing Execution Step for Technician Visit

- **Journey:** `recall_safety_resolution`
- **Problem:** Many safety recalls require a manufacturer-authorized technician visit (e.g., appliance hardware recall, electrical panel recall). The journey ends at "confirm recall outcome" (step 3) with no pathway to book a service. If the recall resolution requires professional intervention, the user has no guided path through the platform.
- **Fix:** Add a conditional step 4 (optional, `isRequired: false`): `schedule_recall_service` → `booking` tool → providers page, pre-filtered to the recall's relevant trade category.

#### P0-5: `financial_exposure_resolution` — No Execution Step

- **Journey:** `financial_exposure_resolution`
- **Problem:** This journey ends at `route_financial_plan` (capital timeline, TRACKING stage) with no execution step. After a homeowner understands their financial exposure, compares options, evaluates savings, and sees the capital timeline — there is no guided action step to actually do anything (book a service, initiate a fix, contact a provider). The journey advises but cannot convert to action.
- **Fix:** Add a final `EXECUTION` stage step: `book_remediation_service` → `booking` tool, required when the financial exposure is tied to a deferrable maintenance issue.

#### P0-6: DEFAULT Template — Wrong Default Tool: `home-event-radar` as Catch-All

- **Journey:** `generic_guidance_resolution`
- **Problem:** Any signal whose `signalIntentFamily` doesn't match a domain template falls to the DEFAULT template, which routes to `home-event-radar`. This tool tracks external weather/market/local events — it is not a general guidance viewer. A lifecycle signal, financial signal, or onboarding signal falling through to DEFAULT will land the user on an event tracking page with no context for why they're there.
- **Additionally:** The fallback route for `home-event-radar` redirects to a different URL, discarding all guidance query params.
- **Fix:** The DEFAULT template should either: (a) route to a generic "guidance overview" page that surfaces the signal details, or (b) the default step should have no `toolKey` and instead surface a "more information needed" state with contact/support CTA.

---

### 10.2 P1 — Structural

#### P1-2: `recall_safety_resolution` — All 3 Steps Use the Same Page with No Differentiation

- **Steps 1, 2, 3** all use `toolKey: 'recalls'`, pointing to the same recalls page. There is no UX guidance for progressing from "acknowledge" → "review remedy" → "confirm resolution". The page shows the same content for all three steps.
- **Additionally:** `TOOL_DEFAULT_STEP_KEY['recalls'] = 'recall_resolution'` (step 3). When the recalls tool fires without a stepKey, the backend directly completes step 3 (`recall_resolution`), bypassing steps 1 (`safety_alert`) and 2 (`review_remedy_instructions`). Both remain `PENDING` in the DB, preventing the journey from reaching `READY` readiness.
- **Fix:** (a) Fix `TOOL_DEFAULT_STEP_KEY['recalls']` to `'safety_alert'` (canonical first step). (b) The recalls page needs to differentiate step state — show acknowledge → review → confirm as a sequential flow guided by the current `guidanceStepKey` query param.

#### P1-3: `weather_risk_resolution` — Narrow Signal Coverage (Only `freeze_risk`)

- `signalIntentFamilies: ['freeze_risk']` only. Hurricane, flood, high winds, extreme heat, and wildfire risk all fall through to `DEFAULT_TEMPLATE` — a single broken step on `home-event-radar`.
- **Fix:** Expand `signalIntentFamilies` to cover all severe weather types, or create separate domain templates per weather type.

#### P1-6: `asset_lifecycle_resolution` — Missing Financial Framing Before Decision

- The journey begins with `repair_replace_decision` (step 1) without any cost-of-delay or financial context. The homeowner must decide repair vs. replace without knowing: what does continued repair cost over time? what is the total cost of ownership for a replacement? what is the cost of doing nothing?
- `true-cost` and `do-nothing-simulator` — the primary tools for this analysis — are entirely absent from this journey.
- **Fix:** Add a pre-decision step: `estimate_cost_impact` → `true-cost` (optional, before step 1 or between steps 1 and 2). This gives the homeowner the financial context needed to make an informed repair-vs-replace decision.

#### P1-7: `financial_exposure_resolution` — Step Order Wrong for `cost_of_inaction_risk` Family

- Both `financial_exposure` and `cost_of_inaction_risk` share the same template with the same step order. For `cost_of_inaction_risk` signals, `do-nothing-simulator` (step 2) is the primary and most relevant tool — it should be step 1. The current template starts with `true-cost` (step 1) regardless of which family triggered it.
- **Fix:** Either (a) create a separate template for `cost_of_inaction_risk` with `do-nothing-simulator` as the canonical first step, or (b) make the template configurable by signal family within a shared structure.

#### P1-8: `financial_exposure_resolution` Step 3 — `home-savings` Tool Fitness Mismatch

- `evaluate_savings_funding` (step 3) is labeled "Evaluate savings and funding options." `home-savings` is a tool for ongoing household savings optimization (energy rebates, recurring cost reduction). It is not a funding tool for a one-time capital expense. The label promises "funding options" that this tool cannot provide.
- **Fix:** Replace with a capital funding tool or combine with `capital-timeline`. Alternatively, relabel the step to match what `home-savings` actually does ("Find savings to offset costs").

#### P1-9: Missing `check_coverage` Step in Multiple Journeys

The following journeys have financial exposure that may be partially or fully covered by insurance or home warranty, yet none include a coverage check step:

| Journey | Why Coverage Check Is Needed |
|---|---|
| `asset_lifecycle_resolution` | Replacement or major repair may be covered by home warranty |
| `inspection_followup_resolution` | Inspection findings may uncover previously covered damage |
| `weather_risk_resolution` | Freeze damage is commonly covered by homeowner's insurance |
| `financial_exposure_resolution` | The financial exposure may be reduceable by insurance |
| `recall_safety_resolution` | Recall repairs may be covered under manufacturer warranty |

**Fix:** Add `check_coverage` (coverage-intelligence tool) as an optional step in each of these journeys at the appropriate point (typically after diagnosis, before execution).

---

### 10.3 P2 — Integration (Pages Not Wired to Guidance Engine)

The following pages are assigned as step destinations but have zero or partial guidance integration. Steps routed to these pages will remain in `PENDING` or `IN_PROGRESS` state indefinitely.

#### P2-1: `coverage-intelligence` — Informational Panel Only

- **Steps stuck:** `check_coverage` (asset_lifecycle step 2), `check_coverage` (coverage_gap step 1)
- **Gap:** Page renders `GuidanceInlinePanel` for context display but does not read guidance query params and does not call `POST /guidance/tool-completion` on any user action.
- **Fix:** When the user completes a coverage review interaction (acknowledges a recommendation, views the full coverage report), call `recordToolCompletion` with `guidanceJourneyId` and `guidanceStepKey` from the URL.

#### P2-3: `recalls` — Informational Panel Only

- **Steps stuck:** `safety_alert`, `review_remedy_instructions`, `recall_resolution`
- **Gap:** No guidance param reading, no completion call. All three steps point to the same page with no differentiation.
- **Fix:** Read `guidanceStepKey` from URL params. Render step-appropriate content: acknowledge button for step 1, remedy review for step 2, resolution confirmation for step 3. Call `recordToolCompletion` at each stage.

#### P2-5: `insurance-trend` — Zero Integration

- **Steps stuck:** `compare_coverage_options` (coverage_gap step 3), `update_coverage_profile`
- **Gap:** No guidance params, no panel, no completion call.
- **Fix:** Add guidance param reading and an acknowledgment trigger.

#### P2-6: `do-nothing`, `home-savings`, `capital-timeline` — Zero Integration

- **Steps stuck:** `compare_action_options`, `evaluate_savings_funding`, `route_financial_plan` (financial_exposure steps 2, 3, 4)
- **Gap:** No guidance params, no panel, no completion call. All three pages are also missing `routePath` in the template (relying on fallback only).
- **Fix:** Add guidance param reading + completion trigger on each page. Add `routePath` to the template steps.

---

### 10.4 P3 — Scope/Context Loss

#### P3-2: `weather_risk_resolution` Step 3 — Hardcoded `PLUMBING` Category

- **Step:** `schedule_weather_followup`
- **Route:** `/dashboard/providers?category=PLUMBING`
- **Problem:** Freeze risk can require HVAC (heating failure), ROOFING (ice dams, snow load), ELECTRICAL (condensation, ice damage), or GENERAL contractors — not only plumbers. The hardcoded `PLUMBING` filter shows the wrong provider type for most freeze risk scenarios.
- **Additionally:** No `propertyId` in the route — the providers page won't know which property context to use.
- **Fix:** The provider category should be derived from the signal payload (which identifies the at-risk system). Pass `propertyId` in the route. Update `routePath` to `/dashboard/properties/:propertyId/providers?category=:serviceCategory`.

#### P3-3: `inspection_followup_resolution` Step 1 — Route Not Property-Scoped Path

- **Step:** `assess_urgency`
- **Current route:** `/dashboard/inspection-report?propertyId=:propertyId` (global page, property via query param)
- **Status:** Guidance integration is wired — params are read, `GuidanceStepCompletionCard` renders with `propertyIdFromUrl ?? selectedPropertyId`. The URL building works correctly (`appendGuidanceContext` appends `&` after existing `?`).
- **Remaining gap:** Route is still a global page with `?propertyId=` instead of a property-scoped path (`/dashboard/properties/:propertyId/tools/inspection-report`). Inconsistent with all other tool routes. Users with multiple properties land on a page that initially shows a property selector rather than pre-loading the guidance-relevant property's report.
- **Fix:** Move the inspection-report page to `/dashboard/properties/[id]/tools/inspection-report` (property-scoped App Router route). Update `routePath` in `guidanceTemplateRegistry.ts` and `FALLBACK_TOOL_ROUTE` in `guidanceDisplay.ts` to `/dashboard/properties/:propertyId/tools/inspection-report`.

#### P3-4: `inspection_followup_resolution` Step 3 — Booking Without Trade Category

- **Step:** `route_specialist`
- **Route:** `/dashboard/bookings`
- **Problem:** The inspection report identifies specific issues (roofing, structural, electrical, plumbing). The booking page gets no pre-selected trade category — the user must start from scratch. The whole point of the inspection followup journey is to route the user to the right specialist, but the execution step doesn't carry that context.
- **Fix:** Pass the identified trade category from inspection findings as a route param or query param to pre-filter the booking flow.

#### P3-5: `recall_safety_resolution` Step 1 — Recall Not Pre-Filtered to Specific Item

- **Step:** `safety_alert`
- **Route:** `/dashboard/properties/:propertyId/recalls`
- **Problem:** If the recall is for a specific appliance (e.g., one particular dishwasher with `inventoryItemId`), the user lands on the property-level recalls list showing all recalls. There is no deep link to the specific recalled item.
- **Fix:** If `journey.inventoryItemId` is set, resolve route to `/dashboard/properties/:propertyId/recalls?itemId=:itemId` or a direct item recall detail page.

#### P3-6: `service-price-radar` Hardcodes Next Step Key in Chain Navigation

- **File:** `ServicePriceRadarClient.tsx` line 334
- **Problem:** When service-price-radar completes, it navigates to `negotiation-shield` with a hardcoded `guidanceStepKey: 'prepare_negotiation'`. This bypasses the journey engine's own `resolveNextStep()`. If the template step order changes or a different step follows price radar in a different journey (e.g., `estimate_repair_cost` in inspection_followup), this hardcoded key will silently advance the wrong step or fail to find the step.
- **Fix:** After calling `recordToolCompletion`, call `GET /guidance/journeys/:journeyId/next-step` to get the engine-resolved next step and its `href`, then navigate to that URL.

---

### 10.5 P4 — Database and Infrastructure

#### P4-1: `signalIntentFamily` Is an Unvalidated String

- **Model:** `GuidanceSignal`
- **Problem:** `signalIntentFamily` is `String` — no enum constraint at the DB level. A typo (e.g., `freez_risk` instead of `freeze_risk`) silently routes to `DEFAULT_TEMPLATE`. There is no DB-enforced set of valid families, no validation error on insert.
- **Fix:** Create a `GuidanceSignalIntentFamily` enum in the Prisma schema with all 9 named families. Migrate existing data. Add enum constraint to the column.

#### P4-2: No UNIQUE Constraint on `dedupeKey`

- **Model:** `GuidanceSignal`
- **Problem:** `dedupeKey` has only an index `@@index([propertyId, dedupeKey])`. Uniqueness is enforced in application logic (upsert). Under concurrent signal ingestion (two workers processing the same event simultaneously), the upsert can race and create duplicate signal rows with the same `dedupeKey`. Once duplicates exist, both can spawn separate journeys for the same issue.
- **Fix:** Add `@@unique([propertyId, dedupeKey])` or `@@unique([dedupeKey])` (if dedupeKey already encodes propertyId). Handle the unique constraint violation in the application as an idempotent upsert.

#### P4-3: `confidenceScore` Has No Range Constraint

- **Model:** `GuidanceSignal`
- **Column:** `confidenceScore Decimal(5,4)`
- **Problem:** `Decimal(5,4)` allows values from −9.9999 to 9.9999. Confidence should be 0.0000–1.0000. No PostgreSQL check constraint prevents out-of-range values from being stored.
- **Fix:** Add `@check(confidenceScore >= 0 AND confidenceScore <= 1)` or validate at the application layer with a hard clamp before write.

#### P4-4: `severityScore` Has No Range Constraint

- **Model:** `GuidanceSignal`
- **Column:** `severityScore Int?`
- **Problem:** Application computes this as 0–100, but no DB constraint enforces the range. Any integer can be stored.
- **Fix:** Add a PostgreSQL check constraint `0 <= severityScore <= 100`.

#### P4-5: `journeyTypeKey` Is Nullable with No FK

- **Model:** `GuidanceJourney`
- **Problem:** `journeyTypeKey String?` — nullable and unvalidated. A journey without a `journeyTypeKey` cannot be matched back to its template for step resolution, skip policy lookup, or display purposes. There is no FK to a template registry table (templates are code-only). Invalid or null `journeyTypeKey` values are indistinguishable from legitimate ones.
- **Fix:** Add NOT NULL constraint. Consider a `GuidanceJourneyTemplate` DB table (even read-only, seeded from code) to enable FK validation.

#### P4-6: `stepType` Stored as `String?` — Should Be Enum

- **Model:** `GuidanceJourneyStep`
- **Problem:** `stepType String?` stores values like `AWARENESS`, `DIAGNOSIS`, `DECISION`, `VALIDATION`, `EXECUTION`, `TRACKING` — the same set as `GuidanceDecisionStage`. As a plain string, there is no DB enforcement, and typos or novel values are accepted silently. The field is also redundant with `decisionStage` and is not read by any business logic.
- **Fix:** Either (a) create `GuidanceStepType` enum and enforce it, or (b) remove `stepType` from the model entirely since it duplicates `decisionStage`.

#### P4-9: `GuidanceIssueDomain` Has 11 Orphaned Enum Values

- **Enum:** `GuidanceIssueDomain`
- **Problem:** 17 values are defined. Journey templates only cover 6 domains: `ASSET_LIFECYCLE`, `INSURANCE`, `SAFETY`, `WEATHER`, `MAINTENANCE`, `FINANCIAL`. The remaining 11 — `COMPLIANCE`, `MARKET_VALUE`, `CLAIMS`, `PRICING`, `NEGOTIATION`, `BOOKING`, `DOCUMENTATION`, `NEIGHBORHOOD`, `ONBOARDING`, `ENERGY`, `OTHER` — have no corresponding journey template. Signals in these domains always fall to `DEFAULT_TEMPLATE` (a single broken step).
- **Fix:** Either (a) create journey templates for the intended domains, or (b) document these as explicitly unimplemented and update the DEFAULT template to surface a useful fallback experience.

#### P4-10: No `routePath` on 9 of 22 Template Steps — All Fallback-Dependent

Steps with no `routePath` in the template rely entirely on `FALLBACK_TOOL_ROUTE`. This is acceptable for tools always scoped the same way, but creates a maintenance hazard: if a tool's URL changes, the fix must be applied in `FALLBACK_TOOL_ROUTE` only (not findable from the template). The entire `financial_exposure_resolution` journey (4 steps) has no routePaths.

**Steps missing routePath:**
- `review_remedy_instructions` (recall step 2) — same page as step 1 and 3, no differentiation
- `recall_resolution` (recall step 3) — same
- `estimate_repair_cost` (inspection step 2)
- `track_resolution` (inspection step 4) — wrong tool anyway (see P1-4)
- `estimate_out_of_pocket_cost` (financial step 1)
- `compare_action_options` (financial step 2)
- `evaluate_savings_funding` (financial step 3)
- `route_financial_plan` (financial step 4)
- `review_signal` (DEFAULT step 1)

**Fix:** Add explicit `routePath` to all steps. Treat `FALLBACK_TOOL_ROUTE` as an emergency fallback only, not as primary routing.

#### P4-11: `routePath` Copied to DB at Journey Creation — No Template Version Tracking

- **Problem:** When a journey is created, template step data (including `routePath`, `toolKey`, `label`, `skipPolicy`) is copied into `GuidanceJourneyStep` rows. If the template is updated in code (e.g., a `routePath` is fixed), existing step rows in the DB retain the old, potentially broken path indefinitely.
- **Fix:** Add `templateVersion String?` to `GuidanceJourney`. When the journey engine detects a version mismatch (template updated since journey was created), flag the journey for step re-hydration or surface a warning.

#### P4-13: Missing Index on `(propertyId, journeyTypeKey, status)`

- **Model:** `GuidanceJourney`
- **Problem:** `ensureJourneyForSignal()` queries: "find an ACTIVE journey for this property with this journeyTypeKey." The existing indexes `(propertyId, status, updatedAt)` and `(propertyId, issueDomain, status)` do not include `journeyTypeKey`. This query scans all journeys for the property.
- **Fix:** Add `@@index([propertyId, journeyTypeKey, status])`.

---

### 10.6 P5 — Enhancements

#### P5-1: `negotiation-shield` and `true-cost` Do Not Pass `guidanceSignalIntentFamily`

- Both pages read `guidanceJourneyId` and `guidanceStepKey` but not `guidanceSignalIntentFamily`. The backend's step completion event cannot record the intent family, which may affect suppression logic that keys on family.

#### P5-2: `asset_lifecycle_resolution` — No `home-savings` or `capital-timeline` Step

- If replacement is expensive, the homeowner has no guided path to explore savings or funding options. Steps go directly from negotiation to booking without affordability consideration.

#### P5-3: `coverage_gap_resolution` — No Re-Verification After Coverage Update

- The journey ends at document upload. There is no final `check_coverage` step to confirm the gap is actually closed.

#### P5-4: `coverage_gap_resolution` — No Platform Pathway to Seek New Coverage

- The journey assumes the homeowner will find and purchase new coverage off-platform. There is no step to connect them with an insurance advisor, broker, or warranty provider through the platform.

#### P5-6: `flowKey` Is Dead Metadata

- `flowKey` is stored on both template steps and `GuidanceJourneyStep` rows. It is not read by `resolveGuidanceStepHref()`, `recordToolCompletion()`, `resolveNextStep()`, or any other business logic function. 11 of 22 steps have `flowKey` values inconsistent with their `toolKey`. The field consumes storage and creates maintenance overhead without any functional value.
- **Recommendation:** Either implement `flowKey` usage (e.g., as a sub-flow router within a tool) or remove it from the template and schema.

---

## 11. Recommended Remediation Roadmap

Ordered by impact and dependency. P0 items block correctness; P1 items block journey completeness; P2 items block step advancement; P3/P4 items improve reliability and correctness.

### Sprint 1 — Unblock Core Journeys (P0)

1. **Fix `coverage_gap_resolution` step 2:** Replace `true-cost` with `service-price-radar`. Update stepKey to `estimate_uninsured_cost`.
2. **Fix `coverage_gap_resolution` step 3:** Replace `insurance-trend` with a coverage comparison mechanism. Relabel the step to reflect what `insurance-trend` actually does (market context), and add a separate action step for selecting new coverage.
3. **Fix vault `routePath`:** Correct to actual vault route. Add `documents` to `TOOL_DEFAULT_STEP_KEY`.
4. **Add execution step to `recall_safety_resolution`:** Add optional `schedule_recall_service` step (booking tool, `isRequired: false`).
5. **Add execution step to `financial_exposure_resolution`:** Add `book_remediation_service` as the final EXECUTION stage step.
6. **Fix DEFAULT template tool:** Replace `home-event-radar` with a neutral guidance overview destination, or create a generic signal review page.

### Sprint 2 — Fix Cross-Journey Collisions and Structural Issues (P1)

7. **Fix `recalls` semantic bug:** Change `TOOL_DEFAULT_STEP_KEY['recalls']` from `recall_resolution` to `safety_alert`.
8. **Add differentiated step content to `recalls` page:** Read `guidanceStepKey` and render acknowledge / remedy / confirm flows.
9. **Add `check_coverage` step** to asset_lifecycle, inspection_followup, weather_risk, financial_exposure, and recall journeys (optional, positioned after diagnosis).

### Sprint 3 — Wire Destination Pages (P2)

10. **`coverage-intelligence`:** Add guidance param reading + completion trigger on coverage review acknowledgment.
11. **`do-nothing`, `home-savings`, `capital-timeline`:** Add guidance param reading + completion trigger. Add explicit `routePath` to template steps.
12. **`insurance-trend`:** Add guidance param reading + acknowledgment completion trigger.

### Sprint 4 — Fix Context Passing and Scope (P3)

13. **Fix `weather_risk` step 3 route:** Derive provider category from signal payload. Add `propertyId` to route.
14. **Fix `recalls` step 1 route:** Add `itemId` query param when `inventoryItemId` is set.
15. **Fix `service-price-radar` chain navigation:** Replace hardcoded `guidanceStepKey: 'prepare_negotiation'` with engine-resolved next step from `GET /guidance/journeys/:id/next-step`.
16. **Add `guidanceSignalIntentFamily` to `negotiation-shield` and `true-cost`** completion API calls.
17. **Move `inspection-report` page to property-scoped path `/dashboard/properties/[id]/tools/inspection-report`; update `routePath` in template registry and fallback route map. (P3-3)**

### Sprint 5 — Database Hardening (P4)

18. **Add `GuidanceSignalIntentFamily` enum** and constrain `signalIntentFamily` column.
19. **Add `UNIQUE` constraint on `dedupeKey`** (or `propertyId + dedupeKey`).
20. **Add check constraints** on `confidenceScore` (0–1) and `severityScore` (0–100).
21. **Add `GuidanceStepType` enum** or remove `stepType` field.
22. **Add `@@index([propertyId, journeyTypeKey, status])`** to `GuidanceJourney`.
23. **Add `@@index([journeyId, toolKey])`** to `GuidanceJourneyStep`.
24. **Add `@@index([journeyId, eventType])`** to `GuidanceJourneyEvent`.

### Sprint 6 — Journey Template Expansion (P4/P5)

25. **Create journey templates** for `COMPLIANCE`, `ENERGY`, and other high-priority orphaned `GuidanceIssueDomain` values (or formally document them as out-of-scope).
26. **Expand `weather_risk_resolution`** to cover all severe weather families beyond `freeze_risk`.
27. **Remove `flowKey`** from template and DB schema (or implement its intended purpose).
28. **Add `templateVersion`** to `GuidanceJourney` for template upgrade detection.

---

*Document last updated 2026-03-26 (v2.1). Resolved gaps removed: P1-1, P1-4, P1-5, P2-2, P2-4, P2-7, P2-8, P3-1, P4-7, P4-8, P4-12, P4-14, P5-5. Generated from direct review of: 14 guidanceEngine service files, `guidance.routes.ts`, `guidance.controller.ts`, `prisma/schema.prisma` (lines 3004–3293), `guidanceDisplay.ts`, 15 frontend tool page files, and `FALLBACK_TOOL_ROUTE` / `TOOL_DEFAULT_STEP_KEY` cross-reference analysis.*
