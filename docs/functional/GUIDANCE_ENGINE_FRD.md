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

## 9. Template Registry Deep Review — Step Keys & Route Validation

**Source file:** `apps/backend/src/services/guidanceEngine/guidanceTemplateRegistry.ts`
**Frontend resolver:** `apps/frontend/src/features/guidance/utils/guidanceDisplay.ts` → `resolveGuidanceStepHref()`
**Review date:** 2026-03-25

### 9.1 How `routePath` is resolved at runtime

`resolveGuidanceStepHref()` applies this priority chain:

1. Use `step.routePath` if present → replace `:propertyId`, `:itemId`, `:inventoryItemId`, `:homeAssetId` params
2. Fall back to `FALLBACK_TOOL_ROUTE[step.toolKey]` if `routePath` is absent
3. After substitution, call `stripUnresolvedSegments()` — if any `:param` placeholders remain unresolved (e.g., `:itemId` with no inventoryItemId on the journey), returns `null` (no href generated)
4. Special override: if `step.toolKey === 'replace-repair'` AND `journey.inventoryItemId` is set, bypasses both routePath and fallback and builds the path directly as `/dashboard/properties/{propertyId}/inventory/items/{inventoryItemId}/replace-repair`
5. Final fallback: if route still null, try `FALLBACK_TOOL_ROUTE[next.recommendedToolKey]`

All resolved routes have guidance context appended as query params: `?guidanceJourneyId=...&guidanceStepKey=...&guidanceSignalIntentFamily=...`

**`FALLBACK_TOOL_ROUTE` map (from `guidanceDisplay.ts`):**

| toolKey | Fallback route |
|---|---|
| `replace-repair` | `/dashboard/replace-repair` ← global page (different from template's item-scoped routePath) |
| `coverage-intelligence` | `/dashboard/properties/:propertyId/tools/coverage-intelligence` |
| `service-price-radar` | `/dashboard/properties/:propertyId/tools/service-price-radar` |
| `negotiation-shield` | `/dashboard/properties/:propertyId/tools/negotiation-shield` |
| `inspection-report` | `/dashboard/inspection-report` |
| `booking` | `/dashboard/bookings?propertyId=:propertyId` |
| `recalls` | `/dashboard/properties/:propertyId/recalls` |
| `documents` | `/dashboard/vault` ← **BROKEN** (vault is at root `/vault`, not `/dashboard/vault`) |
| `home-event-radar` | `/dashboard/properties/:propertyId/tools/home-event-radar` |
| `do-nothing-simulator` | `/dashboard/properties/:propertyId/tools/do-nothing` |
| `home-savings` | `/dashboard/properties/:propertyId/tools/home-savings` |
| `capital-timeline` | `/dashboard/properties/:propertyId/tools/capital-timeline` |
| `true-cost` | `/dashboard/properties/:propertyId/tools/true-cost` |
| `insurance-trend` | `/dashboard/properties/:propertyId/tools/insurance-trend` |
| `maintenance` | **NOT IN MAP** — no fallback |

---

### 9.2 Step-by-Step Validation — All 22 Steps

**Legend:** ✅ Valid | ⚠️ Issue | ❌ Broken

#### Template 1 — `asset_lifecycle_resolution`

| # | stepKey | stepType | decisionStage | isRequired | skipPolicy | toolKey | flowKey | routePath | Route exists? | Assessment |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `repair_replace_decision` | DECISION | DECISION | true | DISALLOWED | `replace-repair` | `replace-repair-analysis` | `/dashboard/properties/:propertyId/inventory/items/:itemId/replace-repair` | ✅ | ⚠️ Requires `:itemId` (from `journey.inventoryItemId`). If null, `stripUnresolvedSegments` returns null; special-case override builds item-scoped path when `inventoryItemId` is set, BUT if `inventoryItemId` is null the override doesn't fire and fallback hits `FALLBACK_TOOL_ROUTE['replace-repair']` = `/dashboard/replace-repair` (global page — different tool context). |
| 2 | `check_coverage` | VALIDATION | VALIDATION | true | DISALLOWED | `coverage-intelligence` | `coverage-analysis` | `/dashboard/properties/:propertyId/tools/coverage-intelligence` | ✅ | ✅ Valid. |
| 3 | `validate_price` | VALIDATION | VALIDATION | true | DISALLOWED | `service-price-radar` | `service-price-radar` | `/dashboard/properties/:propertyId/tools/service-price-radar` | ✅ | ✅ Valid. |
| 4 | `prepare_negotiation` | VALIDATION | VALIDATION | false | ALLOWED | `negotiation-shield` | `negotiation-shield` | `/dashboard/properties/:propertyId/tools/negotiation-shield` | ✅ | ✅ Valid. |
| 5 | `book_service` | EXECUTION | EXECUTION | true | DISALLOWED | `booking` | `booking` | `/dashboard/bookings` | ✅ | ⚠️ Global bookings list — no property context in path. `FALLBACK_TOOL_ROUTE['booking']` = `/dashboard/bookings?propertyId=:propertyId` is more contextual than the template's own routePath. Template routePath should be updated to match fallback. |

**Template 1 issues: 2 (steps 1, 5)**

---

#### Template 2 — `coverage_gap_resolution`

| # | stepKey | stepType | decisionStage | isRequired | skipPolicy | toolKey | flowKey | routePath | Route exists? | Assessment |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `check_coverage` | DIAGNOSIS | DIAGNOSIS | true | DISALLOWED | `coverage-intelligence` | `coverage-analysis` | `/dashboard/properties/:propertyId/tools/coverage-intelligence` | ✅ | ✅ Valid. |
| 2 | `estimate_exposure` | DECISION | DECISION | true | DISCOURAGED | `true-cost` | `true-cost-ownership` | `/dashboard/properties/:propertyId/tools/true-cost` | ✅ | ✅ Valid. `flowKey` (`true-cost-ownership`) differs from `toolKey` (`true-cost`) — minor inconsistency but `flowKey` is not used for routing. |
| 3 | `compare_coverage_options` | DECISION | DECISION | true | DISCOURAGED | `insurance-trend` | `insurance-cost-trend` | `/dashboard/properties/:propertyId/tools/insurance-trend` | ✅ | ✅ Valid. `flowKey` (`insurance-cost-trend`) differs from `toolKey` (`insurance-trend`). |
| 4 | `update_policy_or_documents` | EXECUTION | EXECUTION | true | DISALLOWED | `documents` | `vault` | `/dashboard/vault` | ❌ **DOES NOT EXIST** | ❌ **BROKEN.** Vault lives at `/vault` (root-level route) and `/vault/[propertyId]`, not under `/dashboard/`. Both the template `routePath` and `FALLBACK_TOOL_ROUTE['documents']` point to `/dashboard/vault` which does not exist. User receives a 404. No `:propertyId` in either path. Correct path should be `/vault/:propertyId` or `/vault`. |

**Template 2 issues: 1 broken (step 4), 2 flowKey inconsistencies (steps 2, 3)**

---

#### Template 3 — `recall_safety_resolution`

| # | stepKey | stepType | decisionStage | isRequired | skipPolicy | toolKey | flowKey | routePath | Route exists? | Assessment |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `safety_alert` | AWARENESS | AWARENESS | true | DISALLOWED | `recalls` | `recall-alert` | `/dashboard/properties/:propertyId/recalls` | ✅ | ✅ Valid. |
| 2 | `review_remedy_instructions` | DIAGNOSIS | DIAGNOSIS | true | DISALLOWED | `recalls` | `recall-remedy` | **MISSING** | — | ⚠️ No `routePath`. Falls back to `FALLBACK_TOOL_ROUTE['recalls']` = `/dashboard/properties/:propertyId/recalls` — **same page as step 1**. No distinct UI destination for "review remedy instructions". The `flowKey: 'recall-remedy'` implies a sub-view exists but there is no routing path to differentiate it. |
| 3 | `recall_resolution` | EXECUTION | EXECUTION | true | DISALLOWED | `recalls` | `recall-resolution` | **MISSING** | — | ⚠️ No `routePath`. Same fallback as steps 1 and 2 — all three recall steps route to the identical recalls list page. The `flowKey: 'recall-resolution'` implies a confirmation view but has no route. |

**Template 3 issues: 2 missing routePaths (steps 2, 3) — all 3 steps resolve to the same page**

---

#### Template 4 — `weather_risk_resolution`

| # | stepKey | stepType | decisionStage | isRequired | skipPolicy | toolKey | flowKey | routePath | Route exists? | Assessment |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `weather_safety_check` | AWARENESS | AWARENESS | true | DISALLOWED | `home-event-radar` | `home-event-radar` | `/dashboard/properties/:propertyId/tools/home-event-radar` | ✅ | ✅ Valid. |
| 2 | `protect_exposed_systems` | DIAGNOSIS | DIAGNOSIS | true | DISCOURAGED | `maintenance` | `maintenance-weather-checklist` | `/dashboard/maintenance?propertyId=:propertyId` | ✅ (`/dashboard/maintenance` exists) | ⚠️ **Inconsistent format.** All other routes embed `:propertyId` in the URL path segment; this step uses a query param (`?propertyId=:propertyId`). Whether the maintenance page reads and respects this query param is unverified. Additionally, `FALLBACK_TOOL_ROUTE['maintenance']` does **not exist** — if this step ever loses its `routePath`, there is no fallback and `resolveGuidanceStepHref` returns `null`. |
| 3 | `schedule_weather_followup` | EXECUTION | EXECUTION | false | ALLOWED | `booking` | `booking` | `/dashboard/providers?category=PLUMBING` | ✅ (`/dashboard/providers` exists) | ⚠️ **Hardcoded category.** `PLUMBING` is hardcoded regardless of the actual weather event type (freeze risk could require electrical, roofing, HVAC, etc.). No `:propertyId` in path at all — no property context. `FALLBACK_TOOL_ROUTE['booking']` = `/dashboard/bookings?propertyId=:propertyId` would be more appropriate and contextual. |

**Template 4 issues: 2 (steps 2, 3)**

---

#### Template 5 — `inspection_followup_resolution`

| # | stepKey | stepType | decisionStage | isRequired | skipPolicy | toolKey | flowKey | routePath | Route exists? | Assessment |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `assess_urgency` | DIAGNOSIS | DIAGNOSIS | true | DISALLOWED | `inspection-report` | `inspection-report-analysis` | `/dashboard/inspection-report` | ✅ | ⚠️ **Missing property context.** This is the global inspection report page — not property-scoped. All other first steps use `/dashboard/properties/:propertyId/tools/...` or `/dashboard/properties/:propertyId/...`. The inspection-report page at `/dashboard/inspection-report` is the generic top-level page. The user is not landed in the context of their specific property's inspection report. `FALLBACK_TOOL_ROUTE['inspection-report']` also uses `/dashboard/inspection-report` (same global path). |
| 2 | `estimate_repair_cost` | DECISION | DECISION | true | DISCOURAGED | `service-price-radar` | `service-price-radar` | **MISSING** | — | ⚠️ No `routePath`. Falls back to `FALLBACK_TOOL_ROUTE['service-price-radar']` = `/dashboard/properties/:propertyId/tools/service-price-radar` ✅ — valid fallback. Note: `TOOL_DEFAULT_STEP_KEY['service-price-radar'] = 'validate_price'` which does not exist in this template — cross-journey step resolution falls to `currentStep` by accident. |
| 3 | `route_specialist` | EXECUTION | EXECUTION | true | DISALLOWED | `booking` | `booking` | `/dashboard/bookings` | ✅ | ⚠️ Global bookings list, no property context (same issue as `book_service` in template 1). `FALLBACK_TOOL_ROUTE['booking']` = `/dashboard/bookings?propertyId=:propertyId` is better. `TOOL_DEFAULT_STEP_KEY['booking'] = 'book_service'` — `book_service` does not exist in this template; falls back to `currentStep` which is `route_specialist`. Works by coincidence. |
| 4 | `track_resolution` | TRACKING | TRACKING | true | ALLOWED | `home-event-radar` | `home-event-radar` | **MISSING** | — | ⚠️ No `routePath`. Falls back to `FALLBACK_TOOL_ROUTE['home-event-radar']` = `/dashboard/properties/:propertyId/tools/home-event-radar` ✅ — valid fallback. But see [MED-8] — this step's `executionReadiness: TRACKING_ONLY` causes the journey to be suppressed from the surface list once it becomes the current step. |

**Template 5 issues: 3 (steps 1, 3 routing; steps 2, 4 missing routePath; TOOL_DEFAULT_STEP_KEY cross-journey mismatches for steps 2, 3, 4)**

---

#### Template 6 — `financial_exposure_resolution`

| # | stepKey | stepType | decisionStage | isRequired | skipPolicy | toolKey | flowKey | routePath | Route exists? | Assessment |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `estimate_out_of_pocket_cost` | DIAGNOSIS | DIAGNOSIS | true | DISCOURAGED | `true-cost` | `true-cost-ownership` | **MISSING** | — | ⚠️ No `routePath`. Falls back to `FALLBACK_TOOL_ROUTE['true-cost']` = `/dashboard/properties/:propertyId/tools/true-cost` ✅ — valid fallback. `TOOL_DEFAULT_STEP_KEY['true-cost'] = 'estimate_out_of_pocket_cost'` matches this template ✅. In `coverage_gap_resolution`, true-cost maps to `estimate_exposure` — mismatch resolved by currentStep fallback. |
| 2 | `compare_action_options` | DECISION | DECISION | true | DISCOURAGED | `do-nothing-simulator` | `do-nothing-simulator` | **MISSING** | — | ⚠️ No `routePath`. Falls back to `FALLBACK_TOOL_ROUTE['do-nothing-simulator']` = `/dashboard/properties/:propertyId/tools/do-nothing` ✅ (`tools/do-nothing` directory exists). Note: `toolKey` is `do-nothing-simulator` but the actual route segment is `do-nothing` — the inconsistency is absorbed by `FALLBACK_TOOL_ROUTE`. |
| 3 | `evaluate_savings_funding` | DECISION | DECISION | true | DISCOURAGED | `home-savings` | `home-savings` | **MISSING** | — | ⚠️ No `routePath`. Falls back to `FALLBACK_TOOL_ROUTE['home-savings']` = `/dashboard/properties/:propertyId/tools/home-savings` ✅ — valid fallback. |
| 4 | `route_financial_plan` | TRACKING | TRACKING | false | ALLOWED | `capital-timeline` | `home-capital-timeline` | **MISSING** | — | ⚠️ No `routePath`. Falls back to `FALLBACK_TOOL_ROUTE['capital-timeline']` = `/dashboard/properties/:propertyId/tools/capital-timeline` ✅ — valid fallback. `flowKey` (`home-capital-timeline`) differs from `toolKey` (`capital-timeline`). |

**Template 6 issues: 4 missing routePaths (all steps) — all resolved via fallback**

---

#### Default Template — `generic_guidance_resolution`

| # | stepKey | stepType | decisionStage | isRequired | skipPolicy | toolKey | flowKey | routePath | Route exists? | Assessment |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `review_signal` | AWARENESS | AWARENESS | true | DISCOURAGED | `home-event-radar` | `home-event-radar` | **MISSING** | — | ⚠️ No `routePath`. Falls back to `FALLBACK_TOOL_ROUTE['home-event-radar']` = `/dashboard/properties/:propertyId/tools/home-event-radar` ✅ — valid fallback. |

---

### 9.3 `TOOL_DEFAULT_STEP_KEY` — Cross-Journey Mapping Validation

`TOOL_DEFAULT_STEP_KEY` is used in `recordToolCompletion()` to find the step to transition when a tool reports completion but no explicit `stepKey` is provided. The mapping is global — it does not account for which journey template the journey belongs to.

| toolKey | Mapped stepKey | Correct for template(s) | Wrong for template(s) | Behaviour when wrong |
|---|---|---|---|---|
| `replace-repair` | `repair_replace_decision` | `asset_lifecycle_resolution` ✅ | — | — |
| `coverage-intelligence` | `check_coverage` | `asset_lifecycle_resolution`, `coverage_gap_resolution` ✅ | — | — |
| `recalls` | `recall_resolution` | `recall_safety_resolution` ⚠️ | — | Maps directly to step 3 (`recall_resolution`), **skipping** steps 1 (`safety_alert`) and 2 (`review_remedy_instructions`). Semantically a recall tool completion should first acknowledge (`safety_alert`), not immediately resolve. |
| `booking` | `book_service` | `asset_lifecycle_resolution` ✅ | `inspection_followup_resolution` (uses `route_specialist`) | `book_service` not found in inspection journey → falls back to `currentStep`, which may be `route_specialist` ✅ by coincidence |
| `home-event-radar` | `weather_safety_check` | `weather_risk_resolution` ✅ | `inspection_followup_resolution` (uses `track_resolution`) | `weather_safety_check` not found → falls back to `currentStep` which may be `track_resolution` ✅ by coincidence |
| `inspection-report` | `assess_urgency` | `inspection_followup_resolution` ✅ | — | — |
| `service-price-radar` | `validate_price` | `asset_lifecycle_resolution` ✅ | `inspection_followup_resolution` (uses `estimate_repair_cost`) | `validate_price` not found → falls back to `currentStep` which may be `estimate_repair_cost` ✅ by coincidence |
| `negotiation-shield` | `prepare_negotiation` | `asset_lifecycle_resolution` ✅ | — | — |
| `do-nothing-simulator` | `compare_action_options` | `financial_exposure_resolution` ✅ | — | — |
| `home-savings` | `evaluate_savings_funding` | `financial_exposure_resolution` ✅ | — | — |
| `true-cost` | `estimate_out_of_pocket_cost` | `financial_exposure_resolution` ✅ | `coverage_gap_resolution` (uses `estimate_exposure`) | `estimate_out_of_pocket_cost` not found → falls back to `currentStep` which may be `estimate_exposure` ✅ by coincidence |

**Net finding:** `TOOL_DEFAULT_STEP_KEY` works correctly for single-template tools. For tools used across multiple templates (`coverage-intelligence`, `service-price-radar`, `booking`, `home-event-radar`, `true-cost`), the cross-template mapping is incorrect but saved by `currentStep` fallback logic. One genuine semantic bug: `recalls` → `recall_resolution` skips the acknowledgment and remedy review steps.

---

### 9.4 `flowKey` Validation

`flowKey` is stored in the DB step record but is **not used** by `resolveGuidanceStepHref()` or any routing function in the frontend. It is pure metadata at present.

| stepKey | toolKey | flowKey | Consistent with toolKey? | Notes |
|---|---|---|---|---|
| `repair_replace_decision` | `replace-repair` | `replace-repair-analysis` | ⚠️ Different | No routing consequence |
| `check_coverage` (asset) | `coverage-intelligence` | `coverage-analysis` | ⚠️ Different | No routing consequence |
| `validate_price` | `service-price-radar` | `service-price-radar` | ✅ Same | — |
| `prepare_negotiation` | `negotiation-shield` | `negotiation-shield` | ✅ Same | — |
| `book_service` | `booking` | `booking` | ✅ Same | — |
| `check_coverage` (coverage) | `coverage-intelligence` | `coverage-analysis` | ⚠️ Different | No routing consequence |
| `estimate_exposure` | `true-cost` | `true-cost-ownership` | ⚠️ Different | No routing consequence |
| `compare_coverage_options` | `insurance-trend` | `insurance-cost-trend` | ⚠️ Different | No routing consequence |
| `update_policy_or_documents` | `documents` | `vault` | ⚠️ Different | No routing consequence (both broken anyway) |
| `safety_alert` | `recalls` | `recall-alert` | ⚠️ Different | Implies tab/view, not used |
| `review_remedy_instructions` | `recalls` | `recall-remedy` | ⚠️ Different | Implies tab/view, not used |
| `recall_resolution` | `recalls` | `recall-resolution` | ⚠️ Different | Implies tab/view, not used |
| `weather_safety_check` | `home-event-radar` | `home-event-radar` | ✅ Same | — |
| `protect_exposed_systems` | `maintenance` | `maintenance-weather-checklist` | ⚠️ Different | No routing consequence |
| `schedule_weather_followup` | `booking` | `booking` | ✅ Same | — |
| `assess_urgency` | `inspection-report` | `inspection-report-analysis` | ⚠️ Different | No routing consequence |
| `estimate_repair_cost` | `service-price-radar` | `service-price-radar` | ✅ Same | — |
| `route_specialist` | `booking` | `booking` | ✅ Same | — |
| `track_resolution` | `home-event-radar` | `home-event-radar` | ✅ Same | — |
| `estimate_out_of_pocket_cost` | `true-cost` | `true-cost-ownership` | ⚠️ Different | No routing consequence |
| `compare_action_options` | `do-nothing-simulator` | `do-nothing-simulator` | ✅ Same | toolKey is `do-nothing-simulator`; actual route is `tools/do-nothing` — inconsistency between toolKey and URL handled in FALLBACK_TOOL_ROUTE |
| `evaluate_savings_funding` | `home-savings` | `home-savings` | ✅ Same | — |
| `route_financial_plan` | `capital-timeline` | `home-capital-timeline` | ⚠️ Different | No routing consequence |
| `review_signal` (default) | `home-event-radar` | `home-event-radar` | ✅ Same | — |

**Summary:** `flowKey` is inconsistent for 11 of 24 steps. Since it is not used for routing, there is no functional impact today, but if `flowKey` is ever wired for navigation or deep-linking, these inconsistencies will cause bugs.

---

### 9.5 `stepType` Validation

`stepType` is stored as `String?` in the DB — no enum constraint. Values used across templates:

| Value | Used on steps | Maps to `decisionStage`? |
|---|---|---|
| `AWARENESS` | `safety_alert`, `weather_safety_check`, `review_signal` | ✅ matches stage |
| `DIAGNOSIS` | `assess_urgency`, `check_coverage` (coverage template), `protect_exposed_systems`, `estimate_out_of_pocket_cost` | ✅ matches stage |
| `DECISION` | `repair_replace_decision`, `estimate_exposure`, `compare_coverage_options`, `compare_action_options`, `evaluate_savings_funding`, `estimate_repair_cost` | ✅ matches stage |
| `VALIDATION` | `check_coverage` (asset template), `validate_price`, `prepare_negotiation` | ⚠️ `VALIDATION` is a valid `GuidanceDecisionStage` but is NOT one of the recognised stepType values elsewhere — `VALIDATION` stage steps will never trigger `READY` readiness (see [HIGH-7] in §8) |
| `EXECUTION` | `book_service`, `update_policy_or_documents`, `recall_resolution`, `schedule_weather_followup`, `route_specialist` | ✅ matches stage |
| `TRACKING` | `track_resolution`, `route_financial_plan` | ✅ matches stage |
| (none/null) | — | — |

**Finding:** `stepType` duplicates `decisionStage` for all steps except the three `VALIDATION` steps in `asset_lifecycle_resolution`. Those steps have `stepType: 'VALIDATION'` but use `decisionStage: 'VALIDATION'` — and the `recomputeJourneyState()` only considers `decisionStage === 'EXECUTION'` for READY readiness. The `stepType` field adds no independent logic and is effectively redundant metadata.

---

### 9.6 Consolidated Route Findings Summary

| # | Severity | Step(s) | Issue |
|---|---|---|---|
| R-1 | ❌ BROKEN | `update_policy_or_documents` (coverage template step 4) | `routePath: '/dashboard/vault'` does not exist. Vault is at `/vault` (root) and `/vault/[propertyId]`. `FALLBACK_TOOL_ROUTE['documents']` also points to same broken path. User receives 404. |
| R-2 | ⚠️ MISSING routePath | `review_remedy_instructions`, `recall_resolution` (recall steps 2, 3) | No `routePath`. All 3 recall steps resolve to the same page `/dashboard/properties/:propertyId/recalls`. No distinct page exists for remedy review or resolution confirmation. |
| R-3 | ⚠️ MISSING routePath | `estimate_repair_cost`, `track_resolution` (inspection steps 2, 4) | No `routePath`. Both fall back correctly via `FALLBACK_TOOL_ROUTE`. |
| R-4 | ⚠️ MISSING routePath | All 4 financial steps (`estimate_out_of_pocket_cost`, `compare_action_options`, `evaluate_savings_funding`, `route_financial_plan`) | No `routePath` on any financial template step. All fall back correctly via `FALLBACK_TOOL_ROUTE`. |
| R-5 | ⚠️ MISSING routePath | Default template `review_signal` | No `routePath`. Falls back correctly via `FALLBACK_TOOL_ROUTE`. |
| R-6 | ⚠️ NO property context | `book_service` (asset step 5), `route_specialist` (inspection step 3) | `routePath: '/dashboard/bookings'` has no `:propertyId`. `FALLBACK_TOOL_ROUTE['booking']` = `/dashboard/bookings?propertyId=:propertyId` is more contextual. Template routePaths should match the fallback. |
| R-7 | ⚠️ NO property context | `assess_urgency` (inspection step 1) | `routePath: '/dashboard/inspection-report'` is a global page, not property-scoped. All other tool routePaths use `/dashboard/properties/:propertyId/...`. |
| R-8 | ⚠️ INCONSISTENT format | `protect_exposed_systems` (weather step 2) | `routePath: '/dashboard/maintenance?propertyId=:propertyId'` embeds `propertyId` as a query param while all other routes embed it in the path. No FALLBACK_TOOL_ROUTE entry for `maintenance`. |
| R-9 | ⚠️ HARDCODED value | `schedule_weather_followup` (weather step 3) | `routePath: '/dashboard/providers?category=PLUMBING'` hardcodes `PLUMBING`. Weather events may require electrical, HVAC, roofing. No property context. |
| R-10 | ⚠️ CONDITIONAL null | `repair_replace_decision` (asset step 1) | `routePath` requires `:itemId`. If `journey.inventoryItemId` is null, special-case fires but fails to build path → falls back to global `/dashboard/replace-repair`. The template is only valid for item-scoped journeys. |
| R-11 | ⚠️ SEMANTIC BUG | `TOOL_DEFAULT_STEP_KEY['recalls'] = 'recall_resolution'` | When a recall tool completion is recorded, it immediately transitions `recall_resolution` (step 3) instead of starting from `safety_alert` (step 1). Steps 1 and 2 are never auto-transitioned. |
| R-12 | ⚠️ FALLBACK only | `replace-repair` FALLBACK_TOOL_ROUTE | `FALLBACK_TOOL_ROUTE['replace-repair']` = `/dashboard/replace-repair` (global page). If `routePath` resolution fails (no inventoryItemId), user lands on the wrong tool page. |
| R-13 | ℹ️ NOT USED | All `flowKey` values | `flowKey` is stored in DB but not read by `resolveGuidanceStepHref()` or any other routing function. 11 of 24 steps have flowKey inconsistent with toolKey. No functional impact today. |
| R-14 | ℹ️ REDUNDANT | All `stepType` values | `stepType` duplicates `decisionStage` for every step — the field is not used in any business logic. The `VALIDATION` stepType on asset lifecycle steps is notable because `decisionStage: VALIDATION` steps will never reach READY readiness (see [HIGH-7]). |

---

## 10. Summary Statistics

| Category | Count |
|---|---|
| Backend service files | 14 |
| API endpoints | 10 |
| DB models | 4 |
| DB enums | 8 |
| Journey templates | 7 (6 domain + 1 default) |
| Total template steps | 22 (21 across 6 templates + 1 default) |
| Signal intent families covered | 9 named + 1 generic |
| Suppression stages | 8 |
| Validation rules | 8 |
| **Broken routes** | **1** (R-1: `/dashboard/vault`) |
| **Steps missing routePath** | **9** (R-2 through R-5) |
| **Steps with routing context issues** | **5** (R-6, R-7, R-8, R-9, R-10) |
| **TOOL_DEFAULT_STEP_KEY mismatches** | **5 cross-journey** (1 semantic bug, 4 benign fallbacks) |
| **flowKey inconsistencies** | **11 of 24 steps** |
| Critical issues identified | 5 |
| High priority issues identified | 8 |
| Medium priority issues identified | 10 |
| Low priority considerations | 8 |
| Template registry route findings | 14 (1 broken, 8 warnings, 5 info) |
| Route-destination pages audited | 15 |
| Fully integrated pages | 4 (replace-repair, service-price-radar, negotiation-shield, true-cost) |
| Informational-only pages (no step completion) | 3 (coverage-intelligence, maintenance, recalls) |
| Dead-end pages (zero guidance integration) | 7 (inspection-report, home-event-radar, insurance-trend, do-nothing, home-savings, capital-timeline, vault) |
| Journey steps permanently stuck (frontend gaps) | 10 across 5 templates |

---

## 11. Route-Destination Page Guidance Integration Audit

This section reviews each page referenced by a `routePath` in `guidanceTemplateRegistry.ts` (or reachable via `FALLBACK_TOOL_ROUTE`) to determine whether the page actually fulfills its role in the guidance journey. Five integration dimensions are assessed per page:

| Dimension | Meaning |
|---|---|
| **Reads params** | Page reads `guidanceJourneyId`, `guidanceStepKey`, `guidanceSignalIntentFamily` from URL query string |
| **Calls completion API** | Page calls `POST /guidance/tool-completion` (or equivalent) when the user takes the relevant action |
| **Checks execution guard** | Page (or a child component) calls `GET /guidance/execution-guard` before allowing a booking/execution action |
| **Shows guidance UI** | Page renders `GuidanceInlinePanel` or `GuidanceWarningBanner` |
| **Advances step** | Step status changes to `COMPLETED` in the DB as a result of user action on this page |

---

### 11.1 Per-Page Integration Status Matrix

| Page | Template step(s) routed here | Reads params | Calls completion API | Checks execution guard | Shows guidance UI | Advances step |
|---|---|---|---|---|---|---|
| `replace-repair` | `repair_replace_decision` (asset lifecycle step 1) | ✅ Yes (lines 220–222) | ✅ Yes (via `runReplaceRepairAnalysis`) | ❌ No | ✅ `GuidanceInlinePanel` | ✅ Yes |
| `coverage-intelligence` | `review_coverage` (coverage step 1), `identify_coverage_gap` (coverage step 2) | ❌ No | ❌ No | ❌ No | ✅ `GuidanceInlinePanel` (informational only) | ❌ No |
| `service-price-radar` | `get_service_estimate` (cost-optimization step 1) | ✅ Yes (lines 589–591) | ✅ Yes (lines 289–296) | ❌ No | ✅ `GuidanceInlinePanel` | ✅ Yes |
| `negotiation-shield` | `prepare_negotiation` (cost-optimization step 2) | ✅ Partial (journeyId + stepKey only) | ✅ Yes (via `negotiationShieldApi`) | ❌ No | ✅ `GuidanceInlinePanel` | ✅ Yes |
| `true-cost` | `evaluate_true_cost` (cost-optimization step 3) | ✅ Partial (journeyId + stepKey only) | ✅ Yes (via `getTrueCostOwnership`) | ❌ No | ✅ `GuidanceInlinePanel` | ✅ Yes |
| `providers` | `route_specialist`, `schedule_weather_followup` (booking / weather step) | ✅ Yes (all 3 params) | ✅ Yes (passes to booking flow) | ✅ `useExecutionGuard()` | ✅ `GuidanceWarningBanner` | ✅ Yes (via booking) |
| `inspection-report` | `assess_urgency` (inspection step 1) | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |
| `home-event-radar` | `review_market_event` (market-shift step 1) | ❌ No (redirects away) | ❌ No | ❌ No | ❌ No | ❌ No |
| `maintenance` | `protect_exposed_systems` (weather step 2) | ❌ No | ❌ No | ❌ No | ✅ `GuidanceInlinePanel` (informational only) | ❌ No |
| `insurance-trend` | `update_coverage_profile` (coverage step 3) | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |
| `do-nothing` | `simulate_inaction` (cost-optimization step 4) | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |
| `home-savings` | `review_savings_opportunity` (market-shift step 2) | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |
| `capital-timeline` | `plan_capital_expense` (asset lifecycle step 3) | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |
| `recalls` | `safety_alert`, `identify_recalled_item` (recall steps 1–2) | ❌ No | ❌ No | ❌ No | ✅ `GuidanceInlinePanel` (informational only) | ❌ No |
| `vault` (broken) | `review_contract` (coverage step 4) | N/A — route broken | N/A | N/A | N/A | N/A |

**Legend:** ✅ = implemented, ❌ = not implemented, Partial = some but not all params

---

### 11.2 Fully Integrated Pages (Steps Complete the Journey)

Three pages (plus the `providers` booking endpoint) complete the guidance loop correctly:

**`replace-repair` (`/dashboard/properties/[id]/inventory/items/[itemId]/replace-repair`)**
- Reads all 3 guidance params from `searchParams`.
- Passes `guidanceJourneyId`, `guidanceStepKey`, and `guidanceSignalIntentFamily` to `runReplaceRepairAnalysis()` which calls `POST /guidance/tool-completion`.
- `GuidanceInlinePanel` shown with journey context.
- Step transitions to `COMPLETED` on analysis run.
- **No gap** for the happy path. Missing: execution guard (booking-stage validation) is absent, though `repair_replace_decision` is a `VALIDATION` stage step so this is acceptable.

**`service-price-radar` (`/dashboard/properties/[id]/tools/service-price-radar`)**
- Reads all 3 guidance params.
- Passes to `createPriceRadarAnalysis()` API call.
- Also chains forward: on completion, navigates to `negotiation-shield` with `guidanceStepKey: 'prepare_negotiation'` hardcoded (line 334 of `ServicePriceRadarClient.tsx`).
- **Gap:** The hardcoded `guidanceStepKey: 'prepare_negotiation'` for the chain navigation bypasses `resolveNextStep()` — the frontend decides what the next step key is rather than letting the journey engine resolve it. If the template step order changes, this will silently break.

**`negotiation-shield` and `true-cost`**
- Both read `guidanceJourneyId` and `guidanceStepKey` but **not `guidanceSignalIntentFamily`**.
- Pass the two params to their respective API calls.
- Steps advance correctly.
- **Gap:** Missing `guidanceSignalIntentFamily` means the backend cannot log the intent family on the step completion event. Suppression logic that keys on `intentFamily` may behave differently for steps completed here vs. the reference implementation (`replace-repair`).

**`providers` (`/dashboard/properties/[id]/providers`)**
- Full integration: reads all 3 params, passes to booking, uses `useExecutionGuard()`, shows `GuidanceWarningBanner`.
- This is the only execution-stage page with a guard.
- **Gap:** The booking step itself (under `bookings/`) does not complete a guidance step — the journey step for `book_service`/`route_specialist` is completed via the providers page's API call, but if the user navigates directly to `/dashboard/bookings` (bypassing providers), no guidance completion is recorded.

---

### 11.3 Informational-Only Pages (Show Panel But Never Advance Steps)

These pages show a `GuidanceInlinePanel` to surface journey context to the user, but **do not read guidance query params and do not call the completion API**. Steps routed to these pages will remain in `PENDING` or `IN_PROGRESS` state indefinitely unless advanced by another mechanism.

| Page | Step(s) stuck | Impact |
|---|---|---|
| `coverage-intelligence` | `review_coverage`, `identify_coverage_gap` | Coverage journey steps 1 and 2 never complete. Journey can never reach `READY` readiness. |
| `maintenance` | `protect_exposed_systems` | Weather journey step 2 never completes. Journey stays in `IN_PROGRESS`. |
| `recalls` | `safety_alert`, `identify_recalled_item` | Recall steps 1 and 2 never complete. Combined with `TOOL_DEFAULT_STEP_KEY` bug (see R-11), step 3 (`recall_resolution`) gets transitioned directly — but steps 1 and 2 remain `PENDING` in the DB causing readiness to stay `NOT_READY`. |

---

### 11.4 Dead-End Pages (Zero Guidance Integration)

These pages have **no guidance logic at all** — they do not read params, show a panel, call completion, or check the guard. When a guidance journey routes a user here, the user lands on the page with no context about why they were sent there, no in-context explanation, and the journey step never advances.

| Page | Step(s) affected | Template | Notes |
|---|---|---|---|
| `inspection-report` | `assess_urgency` | Inspection urgency | Global, non-property-scoped page. Also has the wrong `routePath` format (see R-7). |
| `home-event-radar` | `review_market_event` | Market shift | Immediately redirects to a different URL (`/dashboard/home-event-radar?propertyId=...`), discarding all guidance query params in the redirect target. |
| `insurance-trend` | `update_coverage_profile` | Coverage | Full guidance integration absent. Step can never complete. |
| `do-nothing` | `simulate_inaction` | Cost optimization | Full guidance integration absent. |
| `home-savings` | `review_savings_opportunity` | Market shift | Full guidance integration absent. |
| `capital-timeline` | `plan_capital_expense` | Asset lifecycle | Full guidance integration absent. |
| `vault` | `review_contract` | Coverage | Route is broken (R-1 — path mismatch `/dashboard/vault` vs. actual `/vault`). Page is unreachable via guidance routing. |

---

### 11.5 Booking Completion Gap

The `book_service` step in most templates resolves to `providers` via `FALLBACK_TOOL_ROUTE`, which correctly enforces the execution guard and calls the completion API. However, there is an end-to-end gap:

1. `bookings/` page has **no guidance integration** — if a user reaches it directly (e.g., via notification link, deep link, or browser back-button navigation), no guidance context is applied and the `book_service` step is never formally completed.
2. When a booking is created through the `providers` page, the step is completed via the guidance API call made from the providers page, **not from the bookings confirmation screen**. This means if the booking API succeeds but the guidance completion call fails (network error, race condition), the step remains stuck.
3. There is no idempotency retry or eventual-consistency mechanism for step completion — a transient failure on `POST /guidance/tool-completion` silently leaves the journey in a broken state.

---

### 11.6 Summary of Route-Destination Gaps

| Severity | Gap | Affected pages / steps |
|---|---|---|
| **CRITICAL** | `review_contract` step unreachable — route `/dashboard/vault` is broken | vault / coverage journey step 4 |
| **CRITICAL** | `home-event-radar` redirect discards all guidance query params | `review_market_event` / market-shift journey step 1 |
| **HIGH** | Coverage journey steps 1–2 (`review_coverage`, `identify_coverage_gap`) never complete — `coverage-intelligence` page is informational only | Coverage journey blocked at step 1 |
| **HIGH** | `insurance-trend`, `do-nothing`, `home-savings`, `capital-timeline` — zero guidance integration | 4 steps across 3 templates permanently stuck |
| **HIGH** | `inspection-report` — zero guidance integration + wrong route format | `assess_urgency` step never completes |
| **HIGH** | `recalls` — informational only; combined with `TOOL_DEFAULT_STEP_KEY` bug, steps 1–2 stay `PENDING` | Recall journey broken in both frontend and backend |
| **MEDIUM** | `negotiation-shield` and `true-cost` do not pass `guidanceSignalIntentFamily` | Incomplete step completion events; potential suppression side-effects |
| **MEDIUM** | `service-price-radar` hardcodes next `guidanceStepKey` in chain navigation — bypasses engine step resolution | Silent breakage if template step order changes |
| **MEDIUM** | `maintenance` (`protect_exposed_systems`) never completes — informational panel only | Weather journey step 2 stuck |
| **MEDIUM** | `bookings/` page has no guidance integration — direct booking bypasses guidance tracking | `book_service` step not completed on direct access |
| **LOW** | Booking step completion is non-atomic — transient failure on completion API leaves journey in broken state with no retry | All booking-stage steps |

---

### 11.7 Recommended Remediation

1. **Fix `vault` route** — Change `routePath` in `coverage_journey` step 4 from `/dashboard/vault` to the actual route (see R-1 in Section 9).
2. **Fix `home-event-radar` redirect** — The `page.tsx` redirect must forward guidance query params (`guidanceJourneyId`, `guidanceStepKey`, `guidanceSignalIntentFamily`) to the destination URL.
3. **Integrate `coverage-intelligence`** — Read all 3 guidance params; call `POST /guidance/tool-completion` when the user completes the coverage review interaction (e.g., closes the analysis modal or acknowledges the recommendation).
4. **Integrate `inspection-report`** — Add guidance param reading and completion API call. Fix the `routePath` to a property-scoped path (see R-7).
5. **Integrate `insurance-trend`, `do-nothing`, `home-savings`, `capital-timeline`** — Each needs param reading + a completion trigger (e.g., "I've reviewed this" acknowledgment button, or auto-complete on page load if the step is informational).
6. **Fix `recalls` informational panel** — Add completion API call when user acknowledges the safety alert or identifies the recalled item. Also fix the `TOOL_DEFAULT_STEP_KEY['recalls']` semantic bug (see R-11).
7. **Add `guidanceSignalIntentFamily` to `negotiation-shield` and `true-cost`** — Both should pass the full param set to the completion API.
8. **Remove hardcoded `guidanceStepKey` from chain navigation in `service-price-radar`** — Instead fetch the next step from the journey engine (`GET /guidance/journey/:id`) after completing the current step, then navigate to the resolved `href`.
9. **Add guidance integration to `bookings/` confirmation** — Either add a completion call on booking confirmation, or implement at-least-once delivery (retry queue) for the step completion call from `providers/`.
10. **Add execution guard to `inspection-report` and `insurance-trend`** — Both are potential booking precursors; guard enforcement prevents users from bypassing prerequisite steps.

---

*Section 11 generated from direct review of all 15 route-destination page files, `GuidanceInlinePanel`/`GuidanceWarningBanner` usage grep, guidance query param grep, and `useExecutionGuard` hook grep across the entire `apps/frontend/src/app/(dashboard)/` tree.*

---

*Generated from direct source code review of all 14 service files, controller, routes, Prisma schema, frontend routing structure (`/apps/frontend/src/app`), and `guidanceDisplay.ts` resolver.*
