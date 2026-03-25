# Guidance Engine — Functional Requirements Document (FRD)

**Reviewed:** 2026-03-25
**Scope:** Full stack — backend services, API, database schema, frontend hooks/components
**Source Files Reviewed:** 14 backend service files, 1 controller, 1 route file, 4 DB models, 8 DB enums, frontend API client, hooks, mappers, display utilities, and UI components

---

## 1. Feature Overview

The Guidance Engine is a deterministic, signal-driven action planning system for homeowners. It converts platform signals (from AI tools, workers, inspections, recalls, weather events, etc.) into structured, step-by-step action journeys that guide homeowners from awareness to execution.

**Core Value Proposition:**
When a risk is detected (e.g., appliance near end-of-life, coverage gap, freeze risk, safety recall), the engine automatically creates an ordered action plan (journey), enriches it with priority/confidence/financial context, deduplicates and suppresses noise, and surfaces the single most actionable next step per risk.

---

## 2. Architecture

### 2.1 Layered Architecture

```
Signal Sources (tools/workers/jobs)
        ↓
  Signal Normalization & Upsert (guidanceSignalResolver)
        ↓
  Journey Ensure / Create / Reuse (guidanceJourney)
        ↓
  Template Steps Hydration (guidanceStepResolver.ensureTemplateSteps)
        ↓
  Journey State Recomputation (guidanceStepResolver.recomputeJourneyState)
        ↓
  Enrichment Pipeline (confidence + priority + financial + copy)
        ↓
  Suppression Filter (guidanceSuppression)
        ↓
  API Response → Frontend
```

### 2.2 Signal-to-Journey Flow

1. A tool or worker calls `POST /guidance/signals/resolve` or `POST /guidance/tool-completions`
2. `guidanceSignalResolverService.resolveAndPersistSignal()` normalizes and upserts the signal by `dedupeKey`
3. `guidanceJourneyService.ensureJourneyForSignal()` looks up or creates a journey using the template matching the signal's `signalIntentFamily`
4. `guidanceStepResolverService.ensureTemplateSteps()` creates all steps from the matched template
5. `recomputeJourneyState()` recalculates `executionReadiness`, `currentStepKey`, `isLowContext`, and `status`
6. When fetched via `GET /guidance`, all active journeys are enriched and suppression is applied before returning

---

## 3. Database Schema

### 3.1 Enums

| Enum | Values |
|------|--------|
| `GuidanceIssueDomain` | SAFETY, MAINTENANCE, INSURANCE, FINANCIAL, COMPLIANCE, MARKET_VALUE, ASSET_LIFECYCLE, CLAIMS, PRICING, NEGOTIATION, BOOKING, DOCUMENTATION, NEIGHBORHOOD, ONBOARDING, WEATHER, ENERGY, OTHER |
| `GuidanceDecisionStage` | AWARENESS, DIAGNOSIS, DECISION, EXECUTION, VALIDATION, TRACKING |
| `GuidanceExecutionReadiness` | NOT_READY, NEEDS_CONTEXT, READY, TRACKING_ONLY, UNKNOWN |
| `GuidanceSignalStatus` | ACTIVE, RESOLVED, SUPPRESSED, ARCHIVED |
| `GuidanceJourneyStatus` | ACTIVE, COMPLETED, ABORTED, ARCHIVED |
| `GuidanceStepStatus` | PENDING, IN_PROGRESS, COMPLETED, SKIPPED, BLOCKED |
| `GuidanceSeverity` | INFO, LOW, MEDIUM, HIGH, CRITICAL, UNKNOWN |
| `GuidanceJourneyEventType` | JOURNEY_CREATED, JOURNEY_STATUS_CHANGED, JOURNEY_READINESS_CHANGED, STEP_STATUS_CHANGED, STEP_STARTED, STEP_COMPLETED, STEP_SKIPPED, STEP_BLOCKED, STEP_UNBLOCKED, CONTEXT_UPDATED, DERIVED_DATA_UPDATED |

### 3.2 Model: GuidanceSignal (`guidance_signals`)

**Purpose:** Normalized, deduplicated representation of a risk/opportunity detected by any platform feature.

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID PK | |
| `propertyId` | String FK | Required |
| `homeAssetId` | String? FK | Optional — links to specific home asset |
| `inventoryItemId` | String? FK | Optional — links to specific inventory item |
| `signalKey` | String? | Optional external ID for imports/backfills |
| `signalIntentFamily` | String | Inferred category (e.g., `recall_detected`, `freeze_risk`) |
| `issueDomain` | GuidanceIssueDomain | Broad domain classification |
| `decisionStage` | GuidanceDecisionStage | What stage the homeowner is at |
| `executionReadiness` | GuidanceExecutionReadiness | Default: UNKNOWN |
| `status` | GuidanceSignalStatus | Default: ACTIVE |
| `severity` | GuidanceSeverity? | Optional — can be inferred |
| `severityScore` | Int? | 0-100 |
| `confidenceScore` | Decimal(5,4)? | 0.0000–1.0000 |
| `sourceType` | SignalSourceType? | TOOL, WORKER, SYSTEM, etc. |
| `sourceFeatureKey` | String? | Feature slug that generated signal |
| `sourceToolKey` | String? | Tool slug (e.g., `coverage-intelligence`) |
| `sourceEntityType` | String? | Entity type (e.g., RECALL_MATCH, INCIDENT) |
| `sourceEntityId` | String? | Foreign entity ID |
| `sourceRunId` | String? | Run/job ID for traceability |
| `sourceProvenanceId` | String? FK | Links to SignalProvenance |
| `dedupeKey` | String? | Used to find and update existing signal |
| `duplicateGroupKey` | String? | Groups related signals for merging |
| `actionWeaknessFlags` | String[] | e.g., `["STALE_SIGNAL"]` |
| `contextPrerequisites` | String[] | Context keys that must exist |
| `missingContextKeys` | String[] | Context keys that are absent |
| `canonicalFirstStepKey` | String? | First step to execute for this signal |
| `recommendedToolKey` | String? | Tool to launch for resolution |
| `recommendedFlowKey` | String? | Flow to route to |
| `payloadJson` | Json? | Full source data from the tool/worker |
| `metadataJson` | Json? | Internal metadata including freshness |
| `firstObservedAt` | DateTime | When first detected |
| `lastObservedAt` | DateTime | When last updated |
| `resolvedAt` | DateTime? | When resolved |
| `archivedAt` | DateTime? | When archived |

**Indexes (11):**
- `(propertyId, status, lastObservedAt DESC)` — primary list query
- `(propertyId, executionReadiness)` — readiness filter
- `(propertyId, issueDomain)` — domain filter
- `(propertyId, signalIntentFamily)` — family filter
- `(propertyId, dedupeKey)` — deduplication lookup
- `(duplicateGroupKey)` — group merge lookup
- `(homeAssetId)` — asset-scoped lookup
- `(inventoryItemId)` — item-scoped lookup
- `(sourceEntityType, sourceEntityId)` — source entity lookup
- `(sourceToolKey, sourceFeatureKey)` — source tool lookup
- `(sourceProvenanceId)` — provenance lookup

### 3.3 Model: GuidanceJourney (`guidance_journeys`)

**Purpose:** Deterministic action plan for a signal or merged group of signals. Created once per risk scope and reused until completed or archived.

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID PK | |
| `propertyId` | String FK | |
| `homeAssetId` | String? FK | |
| `inventoryItemId` | String? FK | |
| `primarySignalId` | String? FK | Source signal that created this journey |
| `journeyKey` | String? | Stable slug for the journey template |
| `journeyTypeKey` | String? | Template type key (e.g., `asset_lifecycle_resolution`) |
| `issueDomain` | GuidanceIssueDomain | |
| `decisionStage` | GuidanceDecisionStage | Default: AWARENESS; updated to current step's stage |
| `executionReadiness` | GuidanceExecutionReadiness | Default: UNKNOWN; recomputed after every step change |
| `status` | GuidanceJourneyStatus | Default: ACTIVE |
| `mergedSignalGroupKey` | String? | Shared group key across merged signals |
| `currentStepOrder` | Int? | Order of the active step |
| `currentStepKey` | String? | stepKey of the active step |
| `isLowContext` | Boolean | True if any missingContextKeys exist |
| `missingContextKeys` | String[] | Keys lacking context |
| `contextSnapshotJson` | Json? | Source signal metadata snapshot |
| `derivedSnapshotJson` | Json? | Accumulated tool output (`byStep`, `byTool`, `latest`) |
| `startedAt` | DateTime | |
| `completedAt` | DateTime? | Set when all required steps are terminal |
| `abortedAt` | DateTime? | Set on ABORTED status (never set programmatically currently) |
| `archivedAt` | DateTime? | |
| `lastTransitionAt` | DateTime? | Updated on every state change |

**Indexes (8):**
- `(propertyId, status, updatedAt DESC)` — active journeys list
- `(propertyId, executionReadiness, status)` — readiness filter
- `(propertyId, issueDomain, status)` — domain filter
- `(propertyId, currentStepOrder)` — step pointer
- `(primarySignalId)` — signal lookup
- `(mergedSignalGroupKey)` — merge group
- `(homeAssetId)` — asset scope
- `(inventoryItemId)` — item scope

**`derivedSnapshotJson` Structure:**
```json
{
  "byStep": {
    "<stepKey>": {
      "updatedAt": "<ISO>",
      "toolKey": "<toolKey>",
      "data": { /* normalized tool fields */ },
      "raw": { /* original producedData */ },
      "freshness": { "isStale": false, "ageDays": 5, "maxAgeDays": 30 }
    }
  },
  "byTool": {
    "<toolKey>": {
      "updatedAt": "<ISO>",
      "stepKey": "<stepKey>",
      "data": { /* normalized */ },
      "freshness": { ... }
    }
  },
  "latest": { /* merged flat normalized fields from all completed tools */ },
  "updatedAt": "<ISO>"
}
```

### 3.4 Model: GuidanceJourneyStep (`guidance_journey_steps`)

**Purpose:** Individual ordered step within a journey. Created from template definition. Tracks status transitions and produced data.

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID PK | |
| `journeyId` | String FK | Cascades on delete |
| `stepOrder` | Int | 1-based ordering |
| `stepKey` | String | Stable slug (e.g., `check_coverage`) |
| `stepType` | String? | DECISION, VALIDATION, EXECUTION, DIAGNOSIS, AWARENESS, TRACKING |
| `label` | String | Display label |
| `description` | String? | Optional description |
| `decisionStage` | GuidanceDecisionStage? | Stage this step belongs to |
| `executionReadiness` | GuidanceExecutionReadiness | Default: UNKNOWN |
| `status` | GuidanceStepStatus | Default: PENDING |
| `isRequired` | Boolean | Default: true |
| `toolKey` | String? | Tool to launch (e.g., `replace-repair`) |
| `flowKey` | String? | Flow identifier |
| `routePath` | String? | Frontend path pattern |
| `requiredContextKeys` | String[] | Context needed to proceed |
| `missingContextKeys` | String[] | Context currently absent |
| `blockedReasonCode` | String? | Machine code for block reason |
| `blockedReason` | String? | Human-readable block explanation |
| `skippedReasonCode` | String? | Machine code for skip reason |
| `skippedReason` | String? | Human-readable skip reason |
| `inputContextJson` | Json? | Snapshot of context at time of execution |
| `producedDataJson` | Json? | Output produced by completing this step |
| `startedAt` | DateTime? | |
| `completedAt` | DateTime? | |
| `skippedAt` | DateTime? | |
| `blockedAt` | DateTime? | |
| `unblockedAt` | DateTime? | |

**Unique Constraints:** `(journeyId, stepOrder)`, `(journeyId, stepKey)`

**Indexes (4):**
- `(journeyId, status, stepOrder)` — step list with filtering
- `(journeyId, decisionStage, status)` — stage-level queries
- `(journeyId, executionReadiness)` — readiness filter
- `(toolKey)` — tool cross-reference

### 3.5 Model: GuidanceJourneyEvent (`guidance_journey_events`)

**Purpose:** Append-only audit ledger of all transitions within a journey. No updates — only creates.

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID PK | |
| `propertyId` | String FK | Cascades on delete |
| `journeyId` | String FK | Cascades on delete |
| `stepId` | String? FK | SetNull on step delete |
| `signalId` | String? FK | SetNull on signal delete |
| `eventType` | GuidanceJourneyEventType | |
| `fromJourneyStatus` | GuidanceJourneyStatus? | |
| `toJourneyStatus` | GuidanceJourneyStatus? | |
| `fromStepStatus` | GuidanceStepStatus? | |
| `toStepStatus` | GuidanceStepStatus? | |
| `actorUserId` | String? | Who triggered the change |
| `reasonCode` | String? | Machine-readable reason |
| `reasonMessage` | String? | Human-readable reason |
| `payloadJson` | Json? | Snapshot of relevant data at transition time |
| `createdAt` | DateTime | Auto-set; no updatedAt |

**Indexes (5):**
- `(propertyId, createdAt DESC)`
- `(journeyId, createdAt DESC)`
- `(stepId, createdAt DESC)`
- `(signalId, createdAt DESC)`
- `(eventType, createdAt DESC)`

---

## 4. Backend Service Files — Detailed Reference

### 4.1 `guidanceTypes.ts`

**Role:** Shared type definitions, enums (as const arrays), and utility functions. No DB access.

**Exports:**
- `GUIDANCE_ISSUE_DOMAINS`, `GUIDANCE_DECISION_STAGES`, `GUIDANCE_EXECUTION_READINESS`, `GUIDANCE_SIGNAL_STATUS`, `GUIDANCE_JOURNEY_STATUS`, `GUIDANCE_STEP_STATUS`, `GUIDANCE_SEVERITY`, `GUIDANCE_STEP_SKIP_POLICY` — const arrays (used for Zod enum inference and type safety)
- `GuidanceIssueDomain`, `GuidanceDecisionStage`, etc. — TypeScript union types
- `GuidanceSignalSourceInput` — loose input type for signal ingestion (all optional except `propertyId`)
- `NormalizedGuidanceSignalInput` — strict normalized output with required fields
- `GuidanceStepTemplate` — template step definition
- `GuidanceJourneyTemplate` — full journey template with steps
- `GuidanceToolCompletionInput` — input for recording tool output
- `GuidanceNextStepResult` — next step resolution result DTO
- `GuidanceExecutionGuardRequest/Result` — execution guard types

**Utility Functions:**
- `getGuidanceModels()` — validates and returns Prisma model handles; throws 500 if models unavailable (used as runtime check for schema migration state)
- `isTerminalStepStatus(status)` → boolean — COMPLETED or SKIPPED
- `isActionableStepStatus(status)` → boolean — PENDING, IN_PROGRESS, or BLOCKED
- `clampSeverityScore(value)` → number|null — clamps to 0–100
- `clampConfidenceToDecimal(value)` → number|null — normalizes to 0–1 (divides by 100 if >1)
- `decimalToNumber(value)` → number|null — safely converts Prisma Decimal type

---

### 4.2 `guidanceTemplateRegistry.ts`

**Role:** Static, in-memory registry of all hardcoded journey templates. Single source of truth for what steps belong to each journey type. No DB access.

**Templates Defined (6 + 1 default):**

| Template Key | Signal Families | Domain | Steps | First Step |
|---|---|---|---|---|
| `asset_lifecycle_resolution` | `lifecycle_end_or_past_life`, `maintenance_failure_risk` | ASSET_LIFECYCLE | 5 | `repair_replace_decision` |
| `coverage_gap_resolution` | `coverage_gap`, `coverage_lapse_detected` | INSURANCE | 4 | `check_coverage` |
| `recall_safety_resolution` | `recall_detected` | SAFETY | 3 | `safety_alert` |
| `weather_risk_resolution` | `freeze_risk` | WEATHER | 3 | `weather_safety_check` |
| `inspection_followup_resolution` | `inspection_followup_needed` | MAINTENANCE | 4 | `assess_urgency` |
| `financial_exposure_resolution` | `financial_exposure`, `cost_of_inaction_risk` | FINANCIAL | 4 | `estimate_out_of_pocket_cost` |
| `generic_guidance_resolution` | `generic_actionable_signal` (fallback) | OTHER | 1 | `review_signal` |

**Template: `asset_lifecycle_resolution` (5 steps)**

| Order | stepKey | stepType | Stage | Readiness | isRequired | toolKey | skipPolicy |
|---|---|---|---|---|---|---|---|
| 1 | `repair_replace_decision` | DECISION | DECISION | NEEDS_CONTEXT | true | `replace-repair` | DISALLOWED |
| 2 | `check_coverage` | VALIDATION | VALIDATION | NEEDS_CONTEXT | true | `coverage-intelligence` | DISALLOWED |
| 3 | `validate_price` | VALIDATION | VALIDATION | NEEDS_CONTEXT | true | `service-price-radar` | DISALLOWED |
| 4 | `prepare_negotiation` | VALIDATION | VALIDATION | NEEDS_CONTEXT | false | `negotiation-shield` | ALLOWED |
| 5 | `book_service` | EXECUTION | EXECUTION | READY | true | `booking` | DISALLOWED |

**Template: `coverage_gap_resolution` (4 steps)**

| Order | stepKey | Stage | toolKey | skipPolicy |
|---|---|---|---|---|
| 1 | `check_coverage` | DIAGNOSIS | `coverage-intelligence` | DISALLOWED |
| 2 | `estimate_exposure` | DECISION | `true-cost` | DISCOURAGED |
| 3 | `compare_coverage_options` | DECISION | `insurance-trend` | DISCOURAGED |
| 4 | `update_policy_or_documents` | EXECUTION | `documents` | DISALLOWED |

**Template: `recall_safety_resolution` (3 steps)**

| Order | stepKey | Stage | toolKey | skipPolicy |
|---|---|---|---|---|
| 1 | `safety_alert` | AWARENESS | `recalls` | DISALLOWED |
| 2 | `review_remedy_instructions` | DIAGNOSIS | `recalls` | DISALLOWED |
| 3 | `recall_resolution` | EXECUTION | `recalls` | DISALLOWED |

**Template: `weather_risk_resolution` (3 steps)**

| Order | stepKey | Stage | toolKey | skipPolicy |
|---|---|---|---|---|
| 1 | `weather_safety_check` | AWARENESS | `home-event-radar` | DISALLOWED |
| 2 | `protect_exposed_systems` | DIAGNOSIS | `maintenance` | DISCOURAGED |
| 3 | `schedule_weather_followup` | EXECUTION | `booking` | ALLOWED (optional) |

**Template: `inspection_followup_resolution` (4 steps)**

| Order | stepKey | Stage | toolKey | skipPolicy |
|---|---|---|---|---|
| 1 | `assess_urgency` | DIAGNOSIS | `inspection-report` | DISALLOWED |
| 2 | `estimate_repair_cost` | DECISION | `service-price-radar` | DISCOURAGED |
| 3 | `route_specialist` | EXECUTION | `booking` | DISALLOWED |
| 4 | `track_resolution` | TRACKING | `home-event-radar` | ALLOWED |

**Template: `financial_exposure_resolution` (4 steps)**

| Order | stepKey | Stage | toolKey | skipPolicy |
|---|---|---|---|---|
| 1 | `estimate_out_of_pocket_cost` | DIAGNOSIS | `true-cost` | DISCOURAGED |
| 2 | `compare_action_options` | DECISION | `do-nothing-simulator` | DISCOURAGED |
| 3 | `evaluate_savings_funding` | DECISION | `home-savings` | DISCOURAGED |
| 4 | `route_financial_plan` | TRACKING | `capital-timeline` | ALLOWED (optional) |

**Key Exports:**
- `getGuidanceTemplateBySignalFamily(family)` → returns matching template or DEFAULT_TEMPLATE
- `listGuidanceTemplates()` → returns all 6 templates
- `getStepSkipPolicy(journeyTypeKey, stepKey)` → GuidanceStepSkipPolicy ('DISCOURAGED' default if not found)
- `TOOL_DEFAULT_STEP_KEY` — maps toolKey → default stepKey for `recordToolCompletion` resolution

---

### 4.3 `guidanceSignalResolver.service.ts`

**Role:** Normalizes raw signal inputs and upserts them into the database. First processing layer.

**Key Logic:**

**`inferSignalIntentFamily(input)`** — Priority-ordered inference:
1. If `signalIntentFamily` explicitly provided → slugify and use it
2. `sourceEntityType === 'RECALL_MATCH'` or feature/tool key contains 'recall' → `recall_detected`
3. `sourceEntityType === 'REPLACE_REPAIR_ANALYSIS'` or feature/tool key matches → `lifecycle_end_or_past_life`
4. `sourceEntityType === 'COVERAGE_ANALYSIS'` or 'INSURANCE_POLICY' or key contains 'coverage' → `coverage_gap`
5. `sourceEntityType === 'INSPECTION_REPORT'` or key contains 'inspection' → `inspection_followup_needed`
6. `sourceEntityType === 'INCIDENT'` → check `payloadJson.typeKey/incidentType` for: coverage→`coverage_lapse_detected`, freeze/weather→`freeze_risk`, maintenance/lifecycle→`maintenance_failure_risk`
7. Feature key contains 'financial', 'cost', or tool key contains 'savings' → `financial_exposure`
8. Default → `generic_actionable_signal`

**`computeDedupeKey(input)`** → `"<propertyId>:<signalIntentFamily>:<scope>"`
- Scope: `inventoryItemId` ?? `homeAssetId` ?? `"<entityType>:<entityId>"` ?? `"PROPERTY"`

**`computeDuplicateGroupKey(input)`** → `"<propertyId>:<mergeCluster>:<scope>"`
- Merge clusters: lifecycle, maintenance, coverage, financial families → `"system_failure_bundle"` (groups them for deduplication)
- Others → `"<issueDomain>:<signalIntentFamily>"`

**`inferSeverity(input, family)`** — Falls back to family defaults if no severity/severityScore:
- recall_detected, freeze_risk → HIGH
- coverage_gap, lifecycle_end_or_past_life → MEDIUM
- All others → null

**`normalizeSignal(input)`** — Returns `NormalizedGuidanceSignalInput`:
- Infers signal family, domain, stage, readiness
- Computes dedupeKey and duplicateGroupKey
- Assesses signal freshness; if stale: reduces confidence by -0.2, adds `STALE_SIGNAL` weakness flag, adds `refresh_signal_context` to missingContextKeys, downgrades READY → NEEDS_CONTEXT

**`upsertSignal(normalized)`** — Finds existing by `(propertyId, dedupeKey, status='ACTIVE')` → update if found, create if not. Always resets `status` to ACTIVE and clears `resolvedAt`/`archivedAt` on update.

**`archiveSignal(signalId)`** — Sets `status=ARCHIVED`, `archivedAt=now`

---

### 4.4 `guidanceStepResolver.service.ts`

**Role:** Manages journey step lifecycle — creation, status transitions, and journey state recomputation.

**`ensureTemplateSteps(params)`**
- Loads all existing steps for journey
- For each template step: creates if missing, updates metadata fields (label, stepOrder, toolKey, etc.) if existing
- Does NOT change `status` of existing steps (preserves progress)
- Returns all steps ordered by stepOrder

**`markStepStatus(params)`** — Core step transition function:
1. Looks up step by `stepId` or `(journeyId, stepKey)`
2. Validates transition is allowed per `VALID_STEP_TRANSITIONS`:
   - PENDING → IN_PROGRESS, COMPLETED, SKIPPED, BLOCKED
   - IN_PROGRESS → COMPLETED, SKIPPED, BLOCKED, PENDING
   - COMPLETED → COMPLETED (idempotent)
   - SKIPPED → SKIPPED, PENDING, IN_PROGRESS
   - BLOCKED → BLOCKED, PENDING, IN_PROGRESS, COMPLETED, SKIPPED
3. Rejects backward transitions (PENDING from IN_PROGRESS/SKIPPED/BLOCKED) unless `allowBackwardTransition` flag set
4. Enforces skip policy: DISALLOWED → throws 400; DISCOURAGED/required → requires `reasonCode` or `reasonMessage`
5. For COMPLETED on critical steps: requires `producedData` or pre-existing `producedDataJson`
6. Updates step fields per transition (clears old state, sets timestamps)
7. On skip of required/non-ALLOWED step: marks journey as `isLowContext=true`, adds `"skipped:<stepKey>"` to `missingContextKeys`
8. Creates `GuidanceJourneyEvent` record
9. If `producedData` provided: calls `guidanceDerivedDataService.mergeStepOutput()`
10. Calls `recomputeJourneyState()` and returns `{step, journey}`

**`recomputeJourneyState(params)`** — Deterministic journey state computation:
1. Loads journey + all steps
2. Finds `currentStep` = first step with actionable status (PENDING/IN_PROGRESS/BLOCKED)
3. Computes `nextReadiness`:
   - Any BLOCKED step → NOT_READY
   - No actionable step → TRACKING_ONLY
   - Current step is EXECUTION stage + all prior required steps COMPLETED → READY
   - Otherwise → NEEDS_CONTEXT
4. Upgrades TRACKING_ONLY → NOT_READY if any critical required step is not COMPLETED
5. Downgrades READY → NEEDS_CONTEXT if `isLowContext` true
6. Checks completion: all required steps terminal AND no blocked required AND no critical incomplete → status=COMPLETED
7. Only writes to DB if state actually changed (change detection via field comparison)
8. Creates JOURNEY_READINESS_CHANGED and JOURNEY_STATUS_CHANGED events when these fields change

**`resolveNextStep(params)`** → `GuidanceNextStepResult`:
- Calls `recomputeJourneyState()` first
- Returns first actionable step as both `currentStep` and `nextStep`
- Computes `missingPrerequisites` = required steps with stepOrder < currentStep that are not COMPLETED
- Returns `blockedReason`, `warnings`, `recommendedToolKey`, `recommendedFlowKey`

**Critical Required Steps (12)** — steps that CANNOT be skipped to mark journey complete:
`repair_replace_decision`, `check_coverage`, `validate_price`, `estimate_out_of_pocket_cost`, `compare_action_options`, `assess_urgency`, `estimate_repair_cost`, `safety_alert`, `weather_safety_check`, `protect_exposed_systems`, `review_remedy_instructions`, `recall_resolution`

---

### 4.5 `guidanceDerivedData.service.ts`

**Role:** Normalizes tool output (producedData) and stores it in `journey.derivedSnapshotJson`. Maintains `byStep`, `byTool`, and `latest` sections.

**`mergeStepOutput(params)`:**
1. Loads journey's current `derivedSnapshotJson`
2. Normalizes producedData using `normalizeToolOutput(toolKey, data)`
3. Computes tool freshness for the normalized data
4. Updates `byStep[stepKey]`, `byTool[toolKey]` (if toolKey present), and merges into `latest`
5. Adds `<toolKey>ObservedAt` and `<toolKey>Stale` flags to `latest`
6. Creates `DERIVED_DATA_UPDATED` event

**Tool Output Normalization Mappings:**

| toolKey | Extracted Fields |
|---|---|
| `replace-repair` | `replaceRepairVerdict`, `replaceRepairConfidence`, `breakEvenMonths`, `expectedAnnualRepairRiskCents`, `estimatedReplacementCostCents` |
| `coverage-intelligence` | `coverageOverallVerdict`, `insuranceVerdict`, `warrantyVerdict`, `coverageConfidence`, `deductibleUsd`, `expectedCoverageNetImpactUsd` |
| `service-price-radar` | `fairPriceMin`, `fairPriceMax`, `fairPriceCurrency`, `fairPriceConfidence`, `fairPriceConfidenceScore` |
| `negotiation-shield` | `negotiationLeverage`, `negotiationScriptType`, `negotiationConfidence` |
| `inspection-report` | `inspectionOverallScore`, `inspectionCondition`, `inspectionCriticalIssues`, `inspectionTotalRepairCost`, `inspectionSuggestedCredit` |
| `recalls` | `recallStatus`, `recallResolutionType`, `recallResolutionNotes` |
| `booking` | `bookingId`, `bookingStatus`, `bookingScheduledAt` |
| `do-nothing-simulator` | `doNothingRunId`, `costOfInactionMinCents`, `costOfInactionMaxCents`, `doNothingIncidentLikelihood`, `doNothingRiskScoreDelta`, `doNothingSummary` |
| `home-savings` | `homeSavingsRunId`, `potentialMonthlySavings`, `potentialAnnualSavings`, `categoriesWithSavings` |
| `true-cost` | `annualTotalNow`, `total5yCost`, `taxes5y`, `insurance5y`, `maintenance5y`, `utilities5y`, `trueCostConfidence` |
| (unknown) | Returns producedData as-is |

---

### 4.6 `guidanceFinancialContext.service.ts`

**Role:** Evaluates financial exposure and impact score from `derivedSnapshotJson.latest`.

**`evaluate(input)`** → `GuidanceFinancialContext`:

```
financialImpactScore = clamp(round(
  exposureWeight (0–40)  =  min(exposureBase / 20,000 * 40, 40)
+ delayWeight   (0–30)  =  min(costOfDelay / 10,000 * 30, 30)
+ fundingWeight (0–15)  =  15 if fundingGapFlag else 0
+ coverageWeight(0–15)  =  15 if NOT_COVERED, 8 if PARTIAL, 0 otherwise
), 0, 100)

fundingGapFlag = upcomingCost > 0 AND upcomingCost > potentialAnnualSavings * 1.15

costOfDelay = (costOfInactionMaxCents / 100) OR costOfDelay field

coverageImpact = derived from latest.coverageOverallVerdict / insuranceVerdict:
  - Contains "covered" (not "not") → COVERED
  - Contains "partial" → PARTIAL
  - Contains "gap", "not", or "none" → NOT_COVERED
  - Else → UNKNOWN
```

---

### 4.7 `guidanceConfidence.service.ts`

**Role:** Computes a 0–1 confidence score representing how reliable the guidance action is.

**`evaluate(input)`** → `{confidenceScore, confidenceLabel}`:

```
Base:               signal.confidenceScore ?? 0.58

Missing context:    -0.08 per missing key (max -0.35)
Derived richness:   +0.08 if derivedLatest has ≥ 4 keys; -0.06 if 0 keys
Reliable source:    +0.06 if sourceToolKey in reliable set
Digital twin:       (completeness - 0.5) * 0.22 (range: -0.11 to +0.11)
Signal freshness:   -0.10 if stale; +0.03 if age ≤ 7 days
Derived freshness:  -0.08 if stale; +0.02 if age ≤ 14 days
Readiness:          +0.04 if READY; -0.04 if NOT_READY with missing keys

Labels: HIGH ≥ 0.72, MEDIUM 0.45–0.71, LOW < 0.45
```

**Reliable Source Tools:** `coverage-intelligence`, `replace-repair`, `service-price-radar`, `inspection-report`, `recalls`, `true-cost`, `do-nothing-simulator`, `home-savings`

---

### 4.8 `guidancePriority.service.ts`

**Role:** Computes a 0–100 priority score and categorizes it into bucket/group.

**`score(input)`** → `{priorityScore, priorityBucket, priorityGroup}`:

```
severityWeight    = severityScore ?? severityBase(severity)  * 0.35
  Where: CRITICAL=100, HIGH=82, MEDIUM=58, LOW=32, INFO=16, UNKNOWN=22

urgencyWeight     = signalUrgencyBoost + deadlineUrgencyBoost
  signalUrgencyBoost:
    recall/freeze/weather families → +24
    inspection                     → +16
    coverage/lifecycle             → +12
    financial/cost_of_inaction     → +10
    others                         → +4
  deadlineUrgencyBoost (from payloadJson.deadlineAt/dueAt/expiresAt/policyExpiresAt):
    overdue (days ≤ 0) → +24, ≤7d → +18, ≤30d → +10

financialWeight   = financialImpactScore * 0.28

safetyBoost       = +18 if issueDomain is SAFETY or WEATHER

confidenceWeight  = confidenceScore * 12

readinessWeight   = +6 READY, -4 NOT_READY, -10 TRACKING_ONLY, 0 otherwise

priorityScore = clamp(round(all weighted sum), 0, 100)

Buckets: HIGH ≥ 72, MEDIUM 40–71, LOW < 40
Groups:  IMMEDIATE (HIGH), UPCOMING (MEDIUM), OPTIMIZATION (LOW)
```

---

### 4.9 `guidanceValidation.service.ts`

**Role:** Data validation, freshness checking, math sanity checking, and confidence penalty application.

**Freshness Max Age Rules:**

| Signal Family | Max Days |
|---|---|
| `recall_detected` | 30 |
| `freeze_risk` | 14 |
| `coverage_gap`, `coverage_lapse_detected` | 180 |
| `financial_exposure`, `cost_of_inaction_risk` | 180 |
| `lifecycle_end_or_past_life`, `maintenance_failure_risk`, `inspection_followup_needed` | 365 |
| All others | 180 (default) |

| Tool | Max Days |
|---|---|
| `service-price-radar`, `recalls` | 30 |
| `do-nothing-simulator`, `home-savings`, `true-cost` | 120 |
| `coverage-intelligence`, `replace-repair` | 180 |
| `booking`, `inspection-report` | 365 |
| All others | 180 (default) |

**`validateMathAndSafety(input)`** → `{issues, confidencePenalty, shouldSuppress, sanitized}`:

| Condition | Code | Penalty |
|---|---|---|
| Priority score out of 0–100 | `PRIORITY_OUT_OF_RANGE` | -0.08 |
| Financial score out of 0–100 | `FINANCIAL_SCORE_OUT_OF_RANGE` | -0.08 |
| Cost of delay < 0 | `NEGATIVE_COST_OF_DELAY` | -0.06 |
| Break-even months < 0 | `NEGATIVE_BREAK_EVEN` | -0.12 |
| Signal stale | `STALE_SIGNAL` | -0.18 |
| Derived data stale | `STALE_DERIVED_DATA` | -0.12 |
| TRACKING_ONLY + priority > 75 | `TRACKING_PRIORITY_CONFLICT` | -0.10 |
| Missing context + readiness=READY | `READINESS_CONTEXT_CONFLICT` | -0.12 |
| Very weak (priority≤10 AND financial≤10 AND confidence<0.2 AND not READY) | `VERY_WEAK_ACTION` | shouldSuppress=true |

Maximum combined confidencePenalty is capped at 0.60.

**`inferObservedAtFromPayload`** — Tries these fields in order: `observedAt`, `generatedAt`, `quoteDate`, `reportDate`, `policyExpiresAt`, `expiresAt`, `createdAt`, `timestamp`

---

### 4.10 `guidanceSuppression.service.ts`

**Role:** Multi-stage deduplication and filtering of enriched guidance actions before surfacing to the user. Applied as the final step in `getPropertyGuidance`.

**`suppress(actions)`** → `{filteredActions, suppressedSignals}`:

**Stage 1 — Signal dedup by dedup key:**
- Groups by `mergedSignalGroupKey` (if present) or `domain:family:itemId:assetId`
- Keeps highest-priority action per key; others → `DUPLICATE_SIGNAL_MERGED`

**Stage 2 — Remove tracking-only:**
- `executionReadiness === TRACKING_ONLY` on journey or next → `TRACKING_ONLY`

**Stage 3 — Remove weak signals:**
- Low severity (INFO/LOW/UNKNOWN) AND confidence < 0.45 AND financial < 20 AND not SAFETY/WEATHER → `WEAK_SIGNAL`

**Stage 4 — Remove validation-suppressed:**
- `validationShouldSuppress === true` → `VALIDATION_SUPPRESSED`

**Stage 5 — Remove redundant actions:**
- Next step already has produced data in `derivedSnapshotJson.byStep` but step is not yet COMPLETED, AND is in set of high-value decision steps → `REDUNDANT_STEP_ALREADY_RESOLVED`

**Stage 6 — Dedup by journey ID:**
- One action per journey; keeps highest priority → `DUPLICATE_JOURNEY_ACTION`

**Stage 7 — Conflict resolution by scope:**
- Groups by `domain:inventoryItemId:homeAssetId`
- Detects REPLACE vs DEFER intent conflict (from nextStep/label keyword matching)
- If conflict: suppresses lower-priority → `CONFLICTING_ACTION_SUPPRESSED`
- If no conflict: keeps highest priority

**Stage 8 — Final dedup by journey+step+tool:**
- Dedupes `journey.id:nextStep.stepKey:recommendedToolKey` → `FINAL_RESPONSE_DUPLICATE`

**Final output:** Sorted by priorityScore descending.

---

### 4.11 `guidanceJourney.service.ts`

**Role:** Orchestrator service. Coordinates signal ingestion, journey creation/reuse, enrichment, and property-level guidance assembly.

**`ingestSignal(input)`:**
- Calls `guidanceSignalResolverService.resolveAndPersistSignal()`
- Calls `ensureJourneyForSignal()`
- Returns `{signal, journey}`

**`ensureJourneyForSignal(params)`:**
- Finds reusable journey via three-pass strategy:
  1. `mergedSignalGroupKey` match (same group, item, asset)
  2. Strict match: `journeyTypeKey` + `mergedSignalGroupKey` + item + asset
  3. Loose match: `journeyTypeKey` + item + asset (any active journey of same type)
- If no journey found: creates new journey with signal as `primarySignal`, sets all context fields
- If journey found: updates `primarySignalId` (if null), merges `missingContextKeys`, updates `contextSnapshotJson`
- Always: calls `ensureTemplateSteps()` then `recomputeJourneyState()`

**`recordToolCompletion(input)`:**
- If `journeyId` provided: loads that journey directly
- Otherwise: calls `ingestSignal()` to create/find signal and journey
- Resolves step key: `input.stepKey` ?? `TOOL_DEFAULT_STEP_KEY[toolKey]` ?? first PENDING/IN_PROGRESS step ?? `journey.currentStepKey`
- Calls `markStepStatus()` with the resolved step key
- Calls `resolveNextStep()`
- Returns `{signal, journey, step, next}`

**`getPropertyGuidance(propertyId)`:**
- Fetches all ACTIVE journeys with steps + primarySignal
- Fetches all ACTIVE signals
- Resolves `resolveNextStep()` for each journey in parallel
- Enriches each journey with `enrichAction()`
- Applies `guidanceSuppressionService.suppress()`
- Returns only surfaced signals (those tied to surfaced journeys)
- Returns: `{propertyId, counts, signals, journeys, next, suppressedSignals}`

**`enrichAction(params)`** — Main enrichment pipeline:
1. Evaluates financial context (`guidanceFinancialContextService.evaluate()`)
2. Applies step copy polish (`guidanceCopyService.polishStepLabel()`)
3. Assesses signal freshness
4. Assesses derived data freshness for the next step's toolKey
5. Resolves digital twin completeness from multiple candidate fields
6. Evaluates confidence (`guidanceConfidenceService.evaluate()`)
7. Scores priority (`guidancePriorityService.score()`)
8. Validates math and safety (`guidanceValidationService.validateMathAndSafety()`)
9. Applies confidence penalty from validation issues
10. Recomputes priority bucket/group after penalty
11. Builds action explanation copy
12. Polishes warnings (combines base warnings + validation warnings)
13. Polishes blocked reason

**`resolveNextStepWithIntelligence(params)`:**
- Calls `getJourneyById()` then `resolveNextStep()` then `enrichAction()`
- Returns only the enriched `next` result

---

### 4.12 `guidanceBookingGuard.service.ts`

**Role:** Guards booking/execution actions against incomplete guidance prerequisites. Called before booking creation.

**`evaluateExecutionGuard(request)`** → `GuidanceExecutionGuardResult`:
1. Queries all ACTIVE journeys for property, optionally scoped by journeyId/inventoryItemId/homeAssetId
2. For each journey:
   a. If `executionReadiness=UNKNOWN` OR `isLowContext=true` OR `missingContextKeys.length>0`: adds block reason, surfaces first incomplete required step
   b. Finds "execution steps" matching `targetAction`:
      - BOOKING: `toolKey='booking'` or stepKey in `[book_service, route_specialist]`
      - INSPECTION_SCHEDULING: `route_specialist`, any stepKey with 'schedule', or `toolKey='booking'`
      - CLAIM_ESCALATION: stepKey/flowKey contains 'claim' or 'escalat'
      - PROVIDER_HANDOFF / EXECUTION: `decisionStage === 'EXECUTION'`
   c. For each execution step: checks all prior required steps are COMPLETED (if not → missingPrerequisite)
   d. If any execution step is BLOCKED: adds reason
   e. If execution steps exist and readiness !== READY: adds general reason

**`assertCanExecute(request)`:** Calls `evaluateExecutionGuard`, throws APIError 409 with `GUIDANCE_EXECUTION_BLOCKED` code if blocked.

---

### 4.13 `guidanceCopy.service.ts`

**Role:** Generates all user-facing copy for guidance — step labels, action explanations, warnings, and blocked reasons.

**`polishStepLabel(args)`** — Priority:
1. `STEP_LABEL_MAP[stepKey]` — hardcoded map for 18 step keys
2. `replaceGenericVerb(label)` — uses label if not generic ("View Details", "Open Tool", etc.)
3. `toolKey` mapping for 8 common tools
4. Fallback: "Review Next Step"

**`buildActionExplanation(context)`** → `{what, why, risk, nextStep}`:
- `what`: Signal family humanized ("Recall Detected") or domain risk ("Insurance Risk Needs Attention")
- `why`: Priority-based context: safety domains → safety impact; NOT_COVERED → out-of-pocket; COVERED → validate eligibility; fundingGapFlag → cost exceeds savings; default → home risk
- `risk`: If costOfDelay > 0 → "$X estimated cost increase"; HIGH priority → "risk increases quickly"; LOW confidence → "confirm details before execution"; default → "avoidable cost and stress"
- `nextStep`: polishStepLabel output

**`polishWarnings(warnings, options)`** — Rewrites internal codes to user-friendly text; appends funding gap and low confidence warnings.

**`polishBlockedReason(blockedReason, options)`** — Converts technical blocked reasons to readable sentences with step prerequisite labels.

**`polishExecutionGuardReasons(reasons, missingPrerequisites)`** — Formats execution guard reasons with step labels appended.

---

### 4.14 `guidanceMapper.ts`

**Role:** Pure data mapping functions from Prisma model objects to API DTOs. No business logic, no DB access.

**`mapGuidanceSignal(signal)`** — Outputs 25 fields; converts Decimal to number, Date to ISO string, nulls optional fields.

**`mapGuidanceStep(step)`** — Outputs 28 fields; includes `displayLabel` (enriched label from copy service), `producedData` (maps from `producedDataJson`).

**`mapGuidanceJourney(journey)`** — Outputs 34 fields; computes `progress.completedCount/totalCount/percent`; includes `primarySignal` via `mapGuidanceSignal`.

**`mapGuidanceEvent(event)`** — Outputs 13 fields; maps `payloadJson` to `payload`.

---

## 5. API Endpoints

**Base path:** `/api/properties/:propertyId/guidance`
**Auth:** `authenticate` (JWT required) + `propertyAuthMiddleware` (property ownership check)
**Rate Limiting:** `apiRateLimiter` on all routes

| Method | Path | Controller | Description | Response |
|--------|------|-----------|-------------|----------|
| GET | `/` | `getPropertyGuidance` | Full property guidance with suppression | 200 `{counts, signals, journeys, next, suppressedSignals}` |
| GET | `/journeys` | `listActiveGuidanceJourneys` | Active journeys list (reuses getPropertyGuidance internally) | 200 `{journeys, suppressedSignals}` |
| GET | `/journeys/:journeyId` | `getGuidanceJourneyDetail` | Journey detail + events + enriched next step | 200 `{journey, next, events}` |
| POST | `/signals/resolve` | `resolveGuidanceSignal` | Ingest signal, create journey | 201 `{signal, journey}` |
| GET | `/next-step?journeyId=` | `getGuidanceNextStep` | Get enriched next step for journey | 200 `{...GuidanceNextStepResult with enrichment}` |
| GET | `/execution-guard?targetAction=` | `getGuidanceExecutionGuard` | Check if execution is blocked | 200 `GuidanceExecutionGuardResult` |
| POST | `/steps/:stepId/complete` | `completeGuidanceStep` | Mark step COMPLETED | 200 `{step, journey}` |
| POST | `/steps/:stepId/skip` | `skipGuidanceStep` | Mark step SKIPPED | 200 `{step, journey}` |
| POST | `/steps/:stepId/block` | `blockGuidanceStep` | Mark step BLOCKED | 200 `{step, journey}` |
| POST | `/tool-completions` | `recordGuidanceToolCompletion` | Record tool output, transition step | 201 `{signal, journey, step, next}` |

**Zod Validation Schemas Applied:**
- All routes: `propertyId` must be UUID
- `journeyId`, `stepId` in params: must be UUID
- Signal resolve body: all optional fields with string/number constraints
- Complete step body: optional `producedData` object
- Skip step body: optional `reasonCode` (2-80 chars), `reasonMessage` (max 500), `producedData`
- Block step body: optional `reasonCode`, `reasonMessage`, `missingContextKeys` array
- Tool completion body: `sourceToolKey` required (string 2-120), `status` enum, all others optional

---

## 6. Integration Points

### 6.1 Tool Controllers Calling Guidance

| Controller | Integration Point | Signal Family Triggered |
|---|---|---|
| `booking.controller.ts` | `guidanceBookingGuardService.assertCanExecute()` before create | Guards execution |
| `doNothingSimulator.controller.ts` | `guidanceJourneyService.recordToolCompletion()` on success | `cost_of_inaction_risk` |
| `homeSavings.controller.ts` | `guidanceJourneyService.recordToolCompletion()` on success | `financial_exposure` |
| `trueCostOwnership.controller.ts` | `guidanceJourneyService.recordToolCompletion()` on success | `financial_exposure` |

### 6.2 Expected Tool Integrations (require verification)

The following tools are referenced in templates and `TOOL_DEFAULT_STEP_KEY` but their controller integration status needs validation:
- `coverageAnalysis.controller.ts` — should call `recordToolCompletion` for `coverage_gap`
- `replaceRepairAnalysis.controller.ts` — should call `recordToolCompletion` for `lifecycle_end_or_past_life`
- `negotiationShield.controller.ts` — should call `recordToolCompletion`
- `servicePriceRadar.controller.ts` — should call `recordToolCompletion`
- `recalls.controller.ts` — should call `recordToolCompletion` and/or `ingestSignal` for `recall_detected`
- `inspectionReport.routes.ts` — should ingest `inspection_followup_needed` signals

### 6.3 Worker/Job Integrations (require verification)

- `coverageLapseIncidents.job.ts` — should ingest `coverage_lapse_detected` signals
- `freezeRiskIncidents.job.ts` — should ingest `freeze_risk` signals

---

## 7. Frontend Integration

### 7.1 API Client (`guidanceApi.ts`)

8 typed API functions wrapping all backend endpoints. Exports all enum types and DTOs.

### 7.2 React Query Hooks

| Hook | Stale Time | Purpose |
|---|---|---|
| `useGuidance(propertyId, options?)` | 20s | Fetches property guidance; provides filtered/sorted `actions`, `nextByJourney` map, counts |
| `useJourney(propertyId, journeyId?)` | default | Fetches journey detail when journeyId provided |
| `useExecutionGuard(propertyId, targetAction, options?)` | — | Evaluates execution guard before actions |

`useGuidance` options: `issueDomains[]`, `toolKey`, `limit`

### 7.3 Utility Functions

**`guidanceMappers.ts`:**
- `mapGuidanceJourneyToActionModel(journey, next?)` → `GuidanceActionModel` — enriches with resolved href, isBlocked flag, progress
- `filterGuidanceActions(actions, options)` — filters by domain/readiness/progress, sorts by priority

**`guidanceDisplay.ts`:**
- `buildJourneyTitle(journey, signal)` — constructs display title from signal family + domain
- `buildJourneySubtitle(journey)` — generates subtitle from journey metadata
- `resolveGuidanceStepHref(step, propertyId, contextIds?)` — routes to correct page based on `routePath` pattern, replaces `:propertyId`, `:itemId` etc.

### 7.4 UI Components

| Component | Purpose |
|---|---|
| `GuidanceActionCard` | Full card per action — title, status badges, CTA, journey progress strip, risk text |
| `GuidanceDrawer` | Side/bottom sheet with full journey steps list |
| `GuidanceStepList` | Ordered step list with status badges and action buttons |
| `GuidanceJourneyStrip` | Compact visual step progress indicators (dots/badges) |
| `GuidancePrimaryCta` | Primary action button navigating to next step's route |
| `GuidanceStatusBadge` | Readiness and severity display badge |
| `GuidanceWarningBanner` | Warning/error message display |
| `GuidanceEmptyState` | Empty state when no active guidance |
| `GuidanceInlinePanel` | Compact inline guidance panel |

---

## 8. Identified Gaps, Issues, and Risks

### 8.1 Critical / Blocking Issues

**[CRITICAL-1] `GuidanceNextStepResult` uses `any` types**
- `guidanceTypes.ts:172` — `currentStep: any | null` and `nextStep: any | null`
- These types flow through the entire enrichment pipeline and into the frontend
- No compile-time guarantee that step fields (stepKey, toolKey, etc.) exist
- Risk: Silent runtime failures if DB schema or template adds/removes fields

**[CRITICAL-2] `listActiveGuidanceJourneys` is inefficient — calls full `getPropertyGuidance`**
- `guidance.controller.ts:53` — `listActiveGuidanceJourneys` calls the full `getPropertyGuidance()` which runs the entire enrichment + suppression pipeline but only returns `journeys`
- This means `resolveNextStep()` is called N times per journey (N parallel DB queries) for a list endpoint that might not need full enrichment
- Risk: Performance regression at scale; N+1 queries pattern for the journeys list endpoint

**[CRITICAL-3] No transaction wrapping in multi-step writes**
- `ensureJourneyForSignal()`: journey create + event create + `ensureTemplateSteps()` (N step creates) + `recomputeJourneyState()` (journey update + events) — none wrapped in a transaction
- `markStepStatus()`: step update + optional journey update + event create + optional `mergeStepOutput()` (journey update + event) + `recomputeJourneyState()` — none wrapped in a transaction
- Risk: Partial writes if any step fails. A journey can be created without steps if `ensureTemplateSteps` fails. A step can be marked COMPLETED without the derived data being merged.

**[CRITICAL-4] `recordToolCompletion` step key resolution can silently fail**
- `guidanceJourney.service.ts:544-549` — if `TOOL_DEFAULT_STEP_KEY[sourceToolKey]` is undefined AND no current PENDING/IN_PROGRESS step exists AND `journey.currentStepKey` is null, throws a 400 error
- But if `journeyId` is NOT provided and signal ingestion creates a NEW journey, `currentStepKey` may be null before `recomputeJourneyState` has run
- Risk: Tool completions without a journeyId can fail to record if the journey was just created

**[CRITICAL-5] `isRedundantAction` in suppression has a logic bug**
- `guidanceSuppression.service.ts:90-109` — checks if `byStep[stepKey]` has previous output AND step is not COMPLETED, and classifies as redundant
- But `previousOutput` presence doesn't mean the step was already resolved — it means data was MERGED (could be from a different step or re-run)
- This incorrectly suppresses actions where tool data was collected but the step was never formally COMPLETED
- Risk: Valid actions get suppressed when a tool ran but the step wasn't formally marked

### 8.2 High Priority Issues

**[HIGH-1] `ensureTemplateSteps` does not delete removed template steps**
- If a template is updated to remove a step, the old step persists in the journey (it only creates/updates, never deletes)
- Journey completion logic would still require the orphaned step to be terminal
- Risk: Journeys created before a template update can never be completed if they have extra required steps

**[HIGH-2] `recomputeJourneyState` skips writing if fields unchanged but can emit events**
- `guidanceStepResolver.service.ts:437-460` — there's a `shouldWriteJourneyUpdate` guard, but the event creation for `JOURNEY_READINESS_CHANGED` at line 462 checks `journey.executionReadiness !== nextReadiness` on the OLD journey object
- If the DB write was skipped (no change), the event might still be emitted based on stale in-memory comparison
- Risk: Duplicate readiness-changed events

**[HIGH-3] `getJourneyById` calls `resolveNextStep` twice in `getGuidanceJourneyDetail`**
- `guidance.controller.ts:73-77` — controller calls `guidanceJourneyService.getJourneyById()` (which internally calls `resolveNextStepWithIntelligence`) AND then separately calls `resolveNextStepWithIntelligence` again
- This results in 2× `resolveNextStep()` calls per journey detail request, each triggering a `recomputeJourneyState()` DB write cycle
- Risk: Unnecessary DB load, potential for race conditions writing the same state twice

**[HIGH-4] No `ABORTED` status transition mechanism**
- `GuidanceJourneyStatus.ABORTED` exists in enum and schema (`abortedAt` field) but:
  - No API endpoint to abort a journey
  - No service method to set `status=ABORTED`
  - No template or business rule defines when a journey should be aborted
- Risk: Journeys that become irrelevant (e.g., homeowner sells property, replaces appliance outside platform) stay as ACTIVE forever

**[HIGH-5] `dedupeKey` is nullable in schema but used as the deduplication key**
- `schema.prisma:3113` — `dedupeKey String?` (nullable)
- `guidanceSignalResolver.service.ts:302-308` — upsert logic queries `status='ACTIVE' AND dedupeKey=normalized.dedupeKey`
- If `dedupeKey` is null in DB, a `findFirst` with `dedupeKey: null` would match ANY signal with null dedupeKey for that property
- Risk: Accidental signal merging when dedupeKey is null; should be NOT NULL at schema level

**[HIGH-6] `GuidanceSignal.signalKey` is unused**
- `schema.prisma:3094` — `signalKey String?` commented as "Optional external signal id (for imports/backfills)"
- No service code sets, reads, or indexes this field
- It has no index, no validation, and no integration point
- Risk: Dead schema column that adds confusion

**[HIGH-7] `VALIDATION` decision stage is in enum but not in template steps' journey lifecycle**
- `GuidanceDecisionStage.VALIDATION` exists but the `asset_lifecycle_resolution` template uses it for steps 2-4, yet `recomputeJourneyState()` only checks `decisionStage === 'EXECUTION'` for READY readiness
- Steps in VALIDATION stage will never trigger READY readiness — only EXECUTION stage does
- Risk: `check_coverage` and `validate_price` in asset lifecycle journey always resolve to NEEDS_CONTEXT even when all prerequisites are met

**[HIGH-8] Priority score formula components can exceed 100 before clamping**
- `guidancePriority.service.ts:73-102` — sum can be: 100*0.35 (35) + 24 urgency + 24 deadline + 100*0.28 (28) + 18 safety + 1*12 confidence + 6 readiness = 147
- The formula regularly exceeds 100 and relies on clamping
- This means the weighting percentages stated in comments are misleading — safety + urgency bonuses effectively dominate
- Risk: Misleading priority scores; financial weight (28%) is nullified when safety/urgency is high

### 8.3 Medium Priority Issues / Gaps

**[MED-1] `CLAIM_ESCALATION` and `PROVIDER_HANDOFF` target actions have no matching steps in any template**
- `guidanceBookingGuard.service.ts:22-37` — CLAIM_ESCALATION looks for stepKey containing 'claim' or 'escalat'; PROVIDER_HANDOFF falls through to `decisionStage === 'EXECUTION'`
- No template has a claim escalation step
- Risk: Execution guard for these actions evaluates incorrectly (likely always returns `executionSteps=[]` for CLAIM_ESCALATION)

**[MED-2] `insurance-trend` and `capital-timeline` tools referenced in templates have no `normalizeToolOutput` mapping**
- `guidanceDerivedData.service.ts:32-137` — `insurance-trend` and `capital-timeline` tools are referenced in template step `toolKey` fields but have no normalization case
- Their output will be stored as raw `producedData` without normalized fields in `derivedSnapshotJson.latest`
- Risk: Financial context and confidence scoring won't benefit from these tools' data

**[MED-3] `SUPPRESSED` status on GuidanceSignal is never set programmatically**
- `GuidanceSignalStatus.SUPPRESSED` exists in enum but no service code sets a signal to SUPPRESSED
- Suppression currently only operates on the in-memory `EnrichedGuidanceAction[]` list (via `guidanceSuppressionService`), not persisted to DB
- Risk: A suppressed signal reappears as ACTIVE on next fetch; suppression is not durable

**[MED-4] No rate limiting or debouncing on signal ingestion**
- `POST /signals/resolve` is protected by `apiRateLimiter` (general API limiter) but:
  - Tools calling `recordToolCompletion` (e.g., do-nothing-simulator, home-savings) can theoretically create a new signal on every tool run
  - No per-property-per-family rate limit prevents the same signal from being ingested in rapid succession
- Risk: Rapid tool reruns generate high event volume; suppression is in-memory only per request

**[MED-5] `protect_exposed_systems` step in weather template uses `toolKey: 'maintenance'`**
- `guidanceTemplateRegistry.ts:224` — `toolKey: 'maintenance'` is not in `TOOL_DEFAULT_STEP_KEY` mapping
- `normalizeToolOutput()` in derived data service has no case for 'maintenance'
- Risk: If a maintenance completion is recorded, the step output won't be normalized; confidence scoring won't get the reliable source bonus

**[MED-6] Digital twin completeness sourced from multiple candidates with priority undefined**
- `guidanceJourney.service.ts:105-122` — 8 candidate locations checked in order, but the sources can disagree
- No documented contract for which source should win
- Risk: Confidence scores can be non-deterministic if journey context and signal payload disagree

**[MED-7] `GuidanceJourney` has no `signalKey` field — no way to query journeys by external signal ID**
- Unlike `GuidanceSignal.signalKey` (which is also unused), there is no external reference on Journey
- Risk: External systems cannot correlate journeys to their own signal IDs

**[MED-8] `track_resolution` step is TRACKING_ONLY readiness — immediately suppressed in list view**
- In `inspection_followup_resolution`, step 4 has `executionReadiness: TRACKING_ONLY`
- `guidanceSuppression.service.ts:143-151` — TRACKING_ONLY actions are suppressed
- Risk: If a user has completed steps 1-3, the journey's `currentStep` becomes `track_resolution`, which is then suppressed — the journey disappears from the surface list before it's actually completed

**[MED-9] `missingContextKeys` accumulates from signal to journey but is never cleared**
- When a signal is upserted with `missingContextKeys`, these are merged into the journey permanently
- Even after the relevant step is COMPLETED with produced data, the journey's `missingContextKeys` remains populated
- Risk: `isLowContext` stays true and `executionReadiness` stays NEEDS_CONTEXT even after context has been provided through tool completion

**[MED-10] No `CONFLICT_RESOLVED` event type**
- Suppression identifies conflicting actions (REPLACE vs DEFER) but no event is persisted recording this decision
- Risk: No audit trail for why a valid action was suppressed due to conflict

### 8.4 Low Priority / Design Considerations

**[LOW-1] `guidanceCopy.service.ts` step label map is not extensible without code changes**
- `STEP_LABEL_MAP` hardcodes 18 step labels — adding new steps requires a code deploy
- Consideration: Move to template registry or DB-driven labels

**[LOW-2] `GuidanceIssueDomain` has 17 values, but only 6 are used by templates**
- COMPLIANCE, MARKET_VALUE, CLAIMS, PRICING, NEGOTIATION, DOCUMENTATION, NEIGHBORHOOD, ONBOARDING, ENERGY, OTHER — all unused as `issueDomain` in templates
- These domains generate generic_guidance_resolution journeys only
- Consideration: Document which domains are planned vs genuinely unused

**[LOW-3] No mechanism to transition a journey from COMPLETED back to ACTIVE**
- If a completed journey's underlying risk resurfaces (e.g., coverage lapses again), a new signal is ingested
- `findReusableJourney` only looks for `status: 'ACTIVE'` — COMPLETED journeys are never reused
- This creates a new journey, which is correct, but leaves the old completed journey without a "reopened" event
- Consideration: Add a journey reopen/reactivate flow for recurring risks

**[LOW-4] `getPropertyGuidance` and `listActiveGuidanceJourneys` are functionally identical**
- Both call `getPropertyGuidance()` internally; `listActiveGuidanceJourneys` just omits `signals`, `next`, and `counts`
- Consideration: Either document the intended difference or consolidate to a single endpoint

**[LOW-5] No pagination on guidance endpoints**
- `listActiveJourneysForProperty` and `listSignalsForProperty` have no pagination (no `take`/`skip`)
- For properties with many historical signals/journeys (if archival is not enforced), these can return unbounded result sets
- Consideration: Add pagination or enforce max result count

**[LOW-6] `confidenceScore` stored as `Decimal(5,4)` in DB but displayed as float**
- `decimalToNumber()` handles conversion but is called in every mapper
- Consideration: Store as Float for consistency since Prisma's Decimal type adds complexity

**[LOW-7] `GuidanceJourneyEvent.fromJourneyStatus` and `toJourneyStatus` nullable even for JOURNEY_STATUS_CHANGED events**
- By schema, these are optional — but JOURNEY_STATUS_CHANGED events logically require both
- Risk: Inconsistent event records; no enforcement at the application layer

**[LOW-8] No `sourceRunId` deduplication at signal ingestion**
- Multiple calls with the same `sourceRunId` will not be deduplicated against each other; only `dedupeKey` is used
- Risk: If a tool runs multiple times for the same entity, each run creates a new upsert (which is correct behavior via dedupeKey) but `sourceRunId` uniqueness is never checked

---

## 9. Summary Statistics

| Category | Count |
|---|---|
| Backend service files | 14 |
| API endpoints | 10 |
| DB models | 4 |
| DB enums | 8 |
| Journey templates | 7 (6 domain + 1 default) |
| Total template steps | 20 (across all templates) |
| Signal intent families covered | 9 named + 1 generic |
| Suppression stages | 8 |
| Validation rules | 8 |
| Critical issues identified | 5 |
| High priority issues identified | 8 |
| Medium priority issues identified | 10 |
| Low priority considerations | 8 |

---

*Generated from direct source code review of all 14 service files, controller, routes, Prisma schema, and frontend integration code.*
