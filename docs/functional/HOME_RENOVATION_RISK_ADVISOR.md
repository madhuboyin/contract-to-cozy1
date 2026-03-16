# Home Renovation Risk Advisor

**Feature codename:** `renovation-advisor`
**Status:** Production
**Entry points:** Home Tools hub, Gemini chat, Home Timeline, Property Dashboard, Capital Planning, Risk Report
**Calculation version:** 1.0.0 | **Rules version:** 1.0.0-internal | **Disclaimer version:** 1.0.0

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Database Tables](#database-tables)
4. [Enums](#enums)
5. [Backend Files](#backend-files)
6. [API Endpoints](#api-endpoints)
7. [Request Validation](#request-validation)
8. [Evaluation Engine](#evaluation-engine)
9. [Rules Data & Assumptions](#rules-data--assumptions)
10. [Fallback Logic](#fallback-logic)
11. [Post-Evaluation Integrations](#post-evaluation-integrations)
12. [Disclaimer & Trust Layer](#disclaimer--trust-layer)
13. [Analytics](#analytics)
14. [Frontend Files & Components](#frontend-files--components)
15. [Mobile Navigation](#mobile-navigation)
16. [Export Capability](#export-capability)
17. [Third-Party Integrations](#third-party-integrations)
18. [Testing](#testing)
19. [Known Limitations](#known-limitations)
20. [Future Enhancements](#future-enhancements)

---

## Overview

The Home Renovation Risk Advisor helps homeowners understand the compliance landscape before (or after) starting a major renovation. Given a renovation type and property location, it evaluates three dimensions in parallel:

- **Permit requirements** — whether a building permit is required, estimated cost and timeline, permit types, and inspection stages
- **Property tax impact** — estimated monthly/annual tax increase, assessed value uplift, and reassessment trigger type
- **Contractor licensing** — whether a licensed contractor is legally required, license categories, and verification links

The advisor is jurisdiction-aware, using city/county/state data from the property profile to select the most specific rules available, degrading to state-level or national defaults when local data is absent. It supports two flows:

- **Pre-project** (`EXPLICIT_PRE_PROJECT`) — evaluates risk before starting work
- **Retroactive compliance** (`RETROACTIVE_COMPLIANCE`) — checks gaps for already-completed renovations (missed permits, unlicensed contractors, pending reassessments)

Results are informational estimates. All outputs carry a confidence level, assumption list, and a context-appropriate disclaimer.

---

## Architecture

```
Frontend (Next.js 14)
  └── page.tsx
        ├── createRenovationAdvisorSession() ──► POST /api/home-renovation-advisor/sessions
        ├── evaluateRenovationAdvisorSession() ► POST /api/.../sessions/:id/evaluate
        └── getRenovationAdvisorSession() ──────► GET  /api/.../sessions/:id

Backend (Express.js)
  └── routes.ts → controller.ts → service.ts
        └── evaluationEngine.service.ts
              ├── permit.evaluator.ts ──────────── (parallel)
              ├── taxImpact.evaluator.ts ────────── (parallel)
              └── licensing.evaluator.ts ─────────── (parallel)
                    ↓
              summaryBuilder.service.ts
              confidence.service.ts
              disclaimerText.ts
                    ↓
              saveEvaluationOutputs() → Prisma (PostgreSQL)
                    ↓ (fire-and-forget)
              runPostEvaluationIntegrations()
                ├── Home Timeline (HomeEvent)
                ├── Digital Twin (HomeTwinScenario)
                └── Compliance Task (PropertyMaintenanceTask)
```

**Data flow for a full evaluation:**

1. `POST /sessions` — creates `HomeRenovationAdvisorSession` in `DRAFT` state, resolves jurisdiction
2. `POST /sessions/:id/evaluate` — sets status to `PROCESSING`, runs 3 evaluators in parallel, saves outputs, sets `COMPLETED`, fires integrations async
3. `GET /sessions/:id` — returns the stored session with re-derived warnings and next actions (checklist-aware)

---

## Database Tables

### `HomeRenovationAdvisorSession` (core session)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `propertyId` | UUID | FK → `Property` |
| `createdByUserId` | UUID? | FK → `User` |
| `status` | `RenovationAdvisorSessionStatus` | DRAFT → PROCESSING → COMPLETED/PARTIAL/FAILED |
| `renovationType` | `HomeRenovationType` | Immutable after creation |
| `customRenovationLabel` | String? | User-provided label override |
| `entryPoint` | `RenovationAdvisorEntryPoint` | Where the session was started from |
| `flowType` | `RenovationAdvisorFlowType` | Default: EXPLICIT_PRE_PROJECT |
| `jurisdictionLevel` | `RenovationJurisdictionLevel` | Resolution granularity |
| `jurisdictionState` | String? | Resolved state code (e.g., "NJ") |
| `jurisdictionCounty` | String? | Resolved county name |
| `jurisdictionCity` | String? | Resolved city name |
| `postalCode` | String? | Resolved postal code |
| `normalizedJurisdictionKey` | String? | e.g., `US-NJ-middlesex-plainsboro-08536` |
| `addressSnapshotJson` | JSON? | Raw address at time of evaluation |
| `projectCostInput` | Decimal(12,2)? | User-provided cost |
| `projectCostSource` | `RenovationProjectCostSource` | How cost was determined |
| `projectCostAssumptionNote` | String? | Explains assumed cost |
| `overallConfidence` | `AdvisorConfidenceLevel` | Default: UNAVAILABLE |
| `overallRiskLevel` | `AdvisorRiskLevel` | Default: UNKNOWN |
| `overallSummary` | String? | Plain-language summary |
| `warningsSummary` | String? | Text summary of warnings count |
| `nextStepsSummary` | String? | Top 3 next actions as text |
| `disclaimerVersion` | String? | Version of disclaimer shown (e.g., "1.0.0") |
| `rulesVersion` | String? | Rules engine version |
| `calculationVersion` | String? | Calculation algorithm version |
| `providerSnapshotVersion` | String? | Rules data snapshot version |
| `isRetroactiveCheck` | Boolean | Default: false |
| `completedModificationReported` | Boolean | Default: false |
| `userConfirmedJurisdiction` | Boolean | Default: false |
| `sessionExpiresAt` | DateTime? | Optional session TTL |
| `lastEvaluatedAt` | DateTime? | Timestamp of last evaluation |
| `archivedAt` | DateTime? | Soft-delete timestamp |
| `linkedTimelineItemId` | String? | FK → `HomeCapitalTimelineItem` |
| `linkedDigitalTwinScenarioId` | String? | FK → `HomeTwinScenario` |
| `linkedRiskEntityId` | String? | Reserved for future risk linkage |
| `linkedTcoEntityId` | String? | Reserved for future TCO linkage |
| `linkedBreakEvenEntityId` | String? | Reserved for future break-even linkage |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

**Indexes:** `(propertyId, createdAt)`, `(propertyId, renovationType)`, `(createdByUserId, createdAt)`, `normalizedJurisdictionKey`, `status`, `isRetroactiveCheck`

---

### `HomeRenovationPermitOutput` (1:1 with session)

| Column | Type | Notes |
|--------|------|-------|
| `requirementStatus` | `PermitRequirementStatus` | |
| `confidenceLevel` | `AdvisorConfidenceLevel` | |
| `confidenceReason` | String? | Human-readable explanation |
| `permitCostMin` / `Max` | Decimal(12,2)? | Estimated permit fee range |
| `permitTimelineMinDays` / `MaxDays` | Int? | Processing time range |
| `applicationPortalUrl` | String? | Link to local permit portal |
| `applicationPortalLabel` | String? | Display label for link |
| `permitSummary` | String? | Plain-language permit summary |
| `dataAvailable` | Boolean | False = national fallback used |
| `sourceType` | `AdvisorDataSourceType` | |
| `sourceLabel` | String? | e.g., "National heuristics v1" |
| `sourceReferenceUrl` | String? | Reference URL for data |
| `sourceRefreshedAt` | DateTime? | When source data was last updated |
| `rawSourcePayloadJson` | JSON? | Raw API response (if applicable) |
| `notes` | String? | Internal notes |

**Child tables:**
- `HomeRenovationPermitTypeRequirement` — one row per permit type (BUILDING, ELECTRICAL, PLUMBING, etc.)
- `HomeRenovationInspectionStage` — one row per required inspection stage

---

### `HomeRenovationTaxImpactOutput` (1:1 with session)

| Column | Type | Notes |
|--------|------|-------|
| `confidenceLevel` | `AdvisorConfidenceLevel` | |
| `assessedValueIncreaseMin` / `Max` | Decimal(12,2)? | |
| `annualTaxIncreaseMin` / `Max` | Decimal(12,2)? | |
| `monthlyTaxIncreaseMin` / `Max` | Decimal(12,2)? | |
| `reassessmentTriggerType` | `PropertyTaxReassessmentTriggerType` | |
| `reassessmentTimelineSummary` | String? | When to expect reassessment |
| `reassessmentRuleSummary` | String? | How reassessment works in this state |
| `plainLanguageSummary` | String? | Homeowner-friendly explanation |
| `millageRateSnapshot` | Decimal(10,6)? | Rate used at time of evaluation |
| `taxModelRegion` | String? | Region of the tax model used |
| `valueUpliftMethod` | String? | e.g., "project_cost_percentage" |
| `dataAvailable` | Boolean | |

---

### `HomeRenovationLicensingOutput` (1:1 with session)

| Column | Type | Notes |
|--------|------|-------|
| `requirementStatus` | `ContractorLicenseRequirementStatus` | |
| `confidenceLevel` | `AdvisorConfidenceLevel` | |
| `consequenceSummary` | String? | What happens if unlicensed work done |
| `verificationToolUrl` | String? | Link to state license lookup |
| `verificationToolLabel` | String? | Display label |
| `plainLanguageSummary` | String? | |
| `dataAvailable` | Boolean | |

**Child table:**
- `HomeRenovationLicenseCategoryRequirement` — one row per license category (GENERAL_CONTRACTOR, ELECTRICAL, PLUMBING, etc.)

---

### `HomeRenovationAdvisorAssumption`

One row per assumption made during evaluation (e.g., estimated project cost, fallback millage rate). Only user-visible assumptions are returned in the API response.

| Column | Type | Notes |
|--------|------|-------|
| `assumptionKey` | String | Unique within session (e.g., `project_cost_assumed`) |
| `assumptionLabel` | String | Display label |
| `assumptionValueText` | String? | e.g., "$55,000" |
| `assumptionValueNumber` | Decimal(18,4)? | Numeric value |
| `assumptionUnit` | String? | e.g., "USD", "days" |
| `sourceType` | `AdvisorDataSourceType` | |
| `confidenceLevel` | `AdvisorConfidenceLevel` | |
| `rationale` | String? | Why this assumption was made |
| `isUserVisible` | Boolean | Whether to show in UI |
| `displayOrder` | Int | Sort order |

---

### `HomeRenovationAdvisorDataPoint`

Structured key-value data points collected during evaluation (for future drill-down views).

| Column | Type | Notes |
|--------|------|-------|
| `sectionKey` | String | e.g., "permit", "tax", "licensing" |
| `fieldKey` | String | e.g., "permit_cost_min" |
| `fieldLabel` | String | Display label |
| `fieldValueText` | String? | Human-readable value |
| `confidenceLevel` | `AdvisorConfidenceLevel` | |
| `freshnessLabel` | String? | e.g., "Updated Jan 2025" |
| `isUserVisible` | Boolean | |
| `displayOrder` | Int | |

---

### `HomeRenovationComplianceChecklist` (1:1 with session, retroactive only)

Tracks what the homeowner reports about a completed renovation.

| Column | Type | Notes |
|--------|------|-------|
| `permitObtainedStatus` | `TriStateChecklistStatus` | YES / NO / UNKNOWN |
| `licensedContractorUsedStatus` | `TriStateChecklistStatus` | |
| `reassessmentReceivedStatus` | `TriStateChecklistStatus` | |
| `notes` | String? | Freeform notes (max 1000 chars) |
| `lastReviewedAt` | DateTime? | Timestamp of last checklist update |

---

## Enums

### Session lifecycle

| Enum | Values |
|------|--------|
| `RenovationAdvisorSessionStatus` | `DRAFT`, `PROCESSING`, `COMPLETED`, `PARTIAL`, `FAILED`, `ARCHIVED` |
| `RenovationAdvisorFlowType` | `EXPLICIT_PRE_PROJECT`, `CHAT_TRIGGERED`, `RETROACTIVE_COMPLIANCE` |
| `RenovationAdvisorEntryPoint` | `CAPITAL_PLANNING`, `HOME_TOOLS`, `GEMINI_CHAT`, `HOME_TIMELINE`, `PROPERTY_DASHBOARD`, `RISK_REPORT`, `OTHER` |

### Renovation types (12)

| Value | Label |
|-------|-------|
| `ROOM_ADDITION` | Room Addition |
| `BATHROOM_ADDITION` | Bathroom Addition |
| `BATHROOM_FULL_REMODEL` | Bathroom Full Remodel |
| `GARAGE_CONVERSION` | Garage Conversion |
| `BASEMENT_FINISHING` | Basement Finishing |
| `ADU_CONSTRUCTION` | ADU Construction |
| `DECK_ADDITION` | Deck Addition |
| `PATIO_MAJOR_ADDITION` | Major Patio Addition |
| `STRUCTURAL_WALL_REMOVAL` | Structural Wall Removal |
| `STRUCTURAL_WALL_ADDITION` | Structural Wall Addition |
| `ROOF_REPLACEMENT` | Roof Replacement |
| `STRUCTURAL_REPAIR_MAJOR` | Major Structural Repair |

**Structural types** (elevated risk when unpermitted): `ROOM_ADDITION`, `BATHROOM_ADDITION`, `GARAGE_CONVERSION`, `ADU_CONSTRUCTION`, `STRUCTURAL_WALL_REMOVAL`, `STRUCTURAL_WALL_ADDITION`, `STRUCTURAL_REPAIR_MAJOR`, `BASEMENT_FINISHING`

### Risk & confidence

| Enum | Values |
|------|--------|
| `AdvisorRiskLevel` | `LOW`, `MODERATE`, `HIGH`, `CRITICAL`, `UNKNOWN` |
| `AdvisorConfidenceLevel` | `HIGH`, `MEDIUM`, `LOW`, `UNAVAILABLE` |

### Permit

| Enum | Values |
|------|--------|
| `PermitRequirementStatus` | `REQUIRED`, `NOT_REQUIRED`, `LIKELY_REQUIRED`, `LIKELY_NOT_REQUIRED`, `UNKNOWN`, `DATA_UNAVAILABLE` |
| `RenovationPermitType` | `BUILDING`, `ELECTRICAL`, `PLUMBING`, `MECHANICAL`, `STRUCTURAL`, `ZONING`, `OTHER` |
| `RenovationInspectionStageType` | `PLAN_REVIEW`, `PRE_CONSTRUCTION`, `FOUNDATION`, `FRAMING`, `ROUGH_IN`, `ELECTRICAL`, `PLUMBING`, `MECHANICAL`, `INSULATION`, `FINAL`, `OTHER` |

### Tax

| Enum | Values |
|------|--------|
| `PropertyTaxReassessmentTriggerType` | `ON_PERMIT`, `ON_COMPLETION`, `NEXT_ASSESSMENT_CYCLE`, `ON_SALE`, `JURISDICTION_SPECIFIC`, `UNKNOWN`, `DATA_UNAVAILABLE` |

### Licensing

| Enum | Values |
|------|--------|
| `ContractorLicenseRequirementStatus` | `REQUIRED`, `MAY_BE_REQUIRED`, `NOT_REQUIRED`, `UNKNOWN`, `DATA_UNAVAILABLE` |
| `RenovationLicenseCategoryType` | `GENERAL_CONTRACTOR`, `ELECTRICAL`, `PLUMBING`, `HVAC`, `ROOFING`, `STRUCTURAL`, `SPECIALTY`, `OTHER` |

### Data & jurisdiction

| Enum | Values |
|------|--------|
| `AdvisorDataSourceType` | `API_VERIFIED`, `CURATED_DATASET`, `REGIONAL_INTERPOLATION`, `INTERNAL_RULE`, `USER_PROVIDED`, `MANUAL_OVERRIDE`, `UNKNOWN` |
| `RenovationJurisdictionLevel` | `STATE`, `COUNTY`, `CITY`, `ZIP`, `MULTI_LEVEL`, `UNKNOWN` |
| `RenovationProjectCostSource` | `USER_INPUT`, `MEDIAN_ASSUMPTION`, `REGIONAL_ESTIMATE`, `PROVIDER_ESTIMATE`, `UNKNOWN` |
| `TriStateChecklistStatus` | `YES`, `NO`, `UNKNOWN` |

---

## Backend Files

```
apps/backend/src/homeRenovationAdvisor/
├── homeRenovationAdvisor.routes.ts        # Express route definitions + middleware
├── homeRenovationAdvisor.controller.ts    # HTTP request handlers (static methods)
├── homeRenovationAdvisor.service.ts       # Business logic orchestrator
│
├── engine/
│   ├── evaluationEngine.service.ts        # Parallel evaluation orchestrator
│   ├── permit/
│   │   ├── permit.evaluator.ts            # Permit requirement evaluation
│   │   ├── permitRules.data.ts            # Static permit heuristics per renovation type
│   │   └── permitRules.provider.ts        # Rules lookup adapter
│   ├── tax/
│   │   ├── taxImpact.evaluator.ts         # Tax impact calculation
│   │   ├── taxRules.data.ts               # Median costs, value uplift %, state triggers
│   │   └── taxRules.provider.ts           # Rules lookup adapter
│   ├── licensing/
│   │   ├── licensing.evaluator.ts         # Licensing requirement evaluation
│   │   ├── licensingRules.data.ts         # Licensing rules + state verification URLs
│   │   └── licensingRules.provider.ts     # Rules lookup adapter
│   ├── jurisdiction/
│   │   └── jurisdiction.resolver.ts       # Property address → JurisdictionContext
│   ├── confidence/
│   │   └── confidence.service.ts          # Confidence scoring + overall computation
│   ├── assumptions/
│   │   └── assumptions.service.ts         # Merges + deduplicates assumptions
│   ├── summary/
│   │   └── summaryBuilder.service.ts      # Risk level, warnings, next actions, summaries
│   ├── retroactive/
│   │   └── retroactiveCompliance.service.ts # Detects completed renos without advisor sessions
│   └── disclaimer/
│       └── disclaimerText.ts              # Context-aware disclaimer text + version
│
├── integrations/
│   └── advisorIntegration.service.ts      # Post-evaluation integrations (fire-and-forget)
├── repository/
│   └── advisorSession.repository.ts       # Prisma data access layer
├── mappers/
│   └── response.mapper.ts                 # DB records → API response shape
├── export/
│   └── advisorExportMapper.ts             # Session → flat export view model
├── types/
│   └── homeRenovationAdvisor.types.ts     # TypeScript interfaces (300+ lines)
└── validators/
    └── homeRenovationAdvisor.validators.ts # Zod v4 schemas
```

**Tests:** `apps/backend/tests/unit/summaryBuilder.test.js` (52 tests), `disclaimerText.test.js` (9 tests), `advisorEdgeCases.test.js` (8 tests) — **272 total backend tests passing**

---

## API Endpoints

All session endpoints require JWT authentication (`Authorization: Bearer <token>`). Property-scoped endpoints also enforce property ownership via `propertyAuthMiddleware`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/home-renovation-advisor/metadata` | JWT | Renovation types, entry points, flow types |
| `POST` | `/api/home-renovation-advisor/sessions` | JWT | Create new advisor session |
| `PATCH` | `/api/home-renovation-advisor/sessions/:id` | JWT | Update project cost or jurisdiction override |
| `POST` | `/api/home-renovation-advisor/sessions/:id/evaluate` | JWT | Run or re-run evaluation |
| `GET` | `/api/home-renovation-advisor/sessions/:id` | JWT | Get session with current results |
| `POST` | `/api/home-renovation-advisor/sessions/:id/archive` | JWT | Soft-delete session |
| `PATCH` | `/api/home-renovation-advisor/sessions/:id/compliance` | JWT | Update retroactive checklist |
| `GET` | `/api/home-renovation-advisor/sessions/:id/export` | JWT | Flat export view model |
| `GET` | `/api/properties/:propertyId/home-renovation-advisor/sessions` | JWT + property | List sessions for property (paginated) |
| `GET` | `/api/properties/:propertyId/home-renovation-advisor/retroactive-candidates` | JWT + property | Detect completed renos without advisor sessions |

### Key behaviors

- **`POST /sessions`** — `renovationType` is immutable after creation. Changing renovation type requires creating a new session.
- **`POST .../evaluate`** — Returns 409 if status is `PROCESSING` (prevents duplicate concurrent evaluations). Returns cached result if `COMPLETED` and `forceRefresh: false`.
- **`PATCH .../compliance`** — Updates are idempotent (upsert). Changing checklist answers immediately changes warnings and risk level on next `GET`.
- **`GET /sessions/:id`** — Re-derives warnings and next actions from stored outputs on every request (so checklist changes are reflected without re-evaluation).

---

## Request Validation

All mutating endpoints use Zod v4 schemas via `validateBody()` middleware.

### `createSessionSchema`
```
propertyId         UUID (required)
renovationType     HomeRenovationType enum (required)
entryPoint         RenovationAdvisorEntryPoint enum (required)
flowType           RenovationAdvisorFlowType (optional)
projectCostInput   number, positive, max $50,000,000 (optional)
jurisdictionOverride:
  state            2-letter uppercase (optional)
  county           max 100 chars (optional)
  city             max 100 chars (optional)
  postalCode       5 digits only (optional)
completedModificationReported  boolean (optional)
isRetroactiveCheck             boolean (optional)
userConfirmedJurisdiction      boolean (optional)
```

### `evaluateSessionSchema`
```
forceRefresh     boolean (optional, default false)
evaluationMode   'FULL' | 'PERMIT_ONLY' | 'TAX_ONLY' | 'LICENSING_ONLY' (optional, default FULL)
```

### `updateSessionSchema`
```
projectCostInput      number or null (optional)
jurisdictionOverride  sub-schema or null (optional)
completedModificationReported  boolean (optional)
userConfirmedJurisdiction      boolean (optional)
(at least one field required)
```

### `updateComplianceChecklistSchema`
```
permitObtainedStatus            TriStateChecklistStatus (optional)
licensedContractorUsedStatus    TriStateChecklistStatus (optional)
reassessmentReceivedStatus      TriStateChecklistStatus (optional)
notes                           string, max 1000 chars, nullable (optional)
```

---

## Evaluation Engine

### Pipeline

```
runEvaluation(ctx: EvaluationContext)
  │
  ├── Promise.all([
  │     evaluatePermit(ctx),
  │     evaluateTaxImpact(ctx),
  │     evaluateLicensing(ctx),
  │   ])
  │
  ├── mergeAssumptions(permit.assumptions, tax.assumptions, licensing.assumptions)
  ├── computeOverallConfidence(permitConf, taxConf, licensingConf)
  ├── computeOverallRiskLevel(permit, licensing, tax, ctx, checklistAnswers?)
  ├── buildWarnings(ctx, permit, tax, licensing, checklistAnswers?)
  ├── buildNextActions(ctx, permit, tax, licensing, riskLevel, linkedEntityIds?)
  ├── buildOverallSummary(ctx, permit, tax, licensing, riskLevel, confidence)
  ├── buildWarningsSummary(warnings)
  ├── buildNextStepsSummary(nextActions)
  └── selectDisclaimerVariant(isRetroactive, unsupportedArea, isLowConfidence)
```

### Permit evaluator

1. Looks up permit rules by `renovationType`
2. Applies jurisdiction confidence penalty:
   - `CITY`/`ZIP` → no penalty
   - `COUNTY` → −1 confidence level
   - `STATE` → −2 confidence levels
   - `UNKNOWN` → −3 confidence levels
3. Maps permit types and inspection stages from rules data
4. Adds fallback assumption if jurisdiction level is below city

### Tax evaluator

1. Resolves project cost (user input or median national estimate for that renovation type)
2. Calculates assessed value increase: `projectCost × valueUpliftMin%` to `projectCost × valueUpliftMax%`
3. Applies state millage rate (property tax rate): `annualTaxIncrease = assessedValueIncrease × millageRate`
4. Derives monthly: `annualTaxIncrease / 12`
5. Confidence penalty: −1 if project cost assumed, −1 if no state jurisdiction

### Licensing evaluator

1. Looks up licensing rules by `renovationType` and `state`
2. Applies jurisdiction penalty: −1 if no state data
3. Maps applicable license categories
4. Builds state-specific license verification URL (15 states supported: CA, TX, FL, NY, AZ, WA, CO, IL, GA, NC, NJ, PA, OH, MI, VA)

### Risk level computation

**Pre-project logic:**
| Condition | Risk Level |
|-----------|-----------|
| Critical tax impact (>$700/mo) + permit required + licensing required | CRITICAL |
| Permit required + licensing required | HIGH |
| Critical tax impact alone | HIGH |
| Permit required, or high tax impact (>$300/mo) + licensing required | MODERATE |
| Default | LOW |

**Retroactive escalation (structural types):**
| Condition | Risk Level |
|-----------|-----------|
| Retroactive + structural + permit required + licensing required | CRITICAL |
| Retroactive + structural + permit required or licensing required | HIGH |

**Checklist-driven escalation:**
| Condition | Risk Level |
|-----------|-----------|
| Permit not obtained + structural + (permit required + licensing required) | CRITICAL |
| Permit not obtained + permit required | HIGH |
| Contractor not licensed + structural + licensing required | HIGH |

### Warning codes

| Code | Severity | Urgency | Trigger |
|------|----------|---------|---------|
| `RETROACTIVE_NO_PERMIT_OBTAINED` | CRITICAL (structural) / WARNING | IMMEDIATE / HIGH | Checklist: permit=NO + permit required |
| `RETROACTIVE_UNLICENSED_CONTRACTOR` | CRITICAL (structural) / WARNING | HIGH / MEDIUM | Checklist: licensed=NO + licensing required |
| `RETROACTIVE_REASSESSMENT_PENDING` | INFO | LOW | Checklist: reassessment=NO + tax data available + annual >$500 |
| `RETROACTIVE_COMPLIANCE_REVIEW` | WARNING | HIGH (structural) / MEDIUM | Retroactive flow, no checklist answers yet |
| `PERMIT_REQUIRED` | CRITICAL | HIGH | Permit status = REQUIRED |
| `PERMIT_LIKELY_REQUIRED` | WARNING | MEDIUM | Permit status = LIKELY_REQUIRED |
| `CONTRACTOR_LICENSE_REQUIRED` | CRITICAL | HIGH | Licensing status = REQUIRED |
| `CONTRACTOR_LICENSE_MAY_BE_REQUIRED` | WARNING | MEDIUM | Licensing status = MAY_BE_REQUIRED |
| `MATERIAL_TAX_INCREASE` | WARNING | LOW | Monthly tax increase > $300 |
| `JURISDICTION_UNRESOLVED` | WARNING | MEDIUM | No state in property address |
| `JURISDICTION_PARTIAL` | INFO | LOW | Jurisdiction level = STATE or UNKNOWN |
| `LOW_CONFIDENCE_ESTIMATE` | WARNING | LOW | Permit or tax confidence = LOW or UNAVAILABLE |
| `PROJECT_COST_ASSUMED` | INFO | LOW | No project cost provided by user |

### Next actions (capped at 5, sorted by priority)

**Pre-project flow:**
1. Verify permit requirements (if permit required)
2. Verify contractor license (if licensing required)
3. Verify locally — estimates are directional (if low confidence or no state)
4. Review TCO impact (if material tax impact > $150/mo)
5. Run break-even analysis (if permit + tax, or HIGH/CRITICAL risk)
6. Update Digital Twin after completion (structural types)

**Retroactive flow:**
1. Record what was done (compliance checklist)
2. Confirm permit status and keep records (if permit required)
3. Collect contractor documentation (if licensing required or structural)
4. Watch for property tax reassessment notice (if material tax impact)
5. Review and update Home Digital Twin

### Confidence computation

Overall confidence = median of (permit, tax, licensing) confidence levels.

Confidence ladder: `HIGH → MEDIUM → LOW → UNAVAILABLE`

Source type → base confidence:
- `API_VERIFIED`, `CURATED_DATASET` → HIGH
- `REGIONAL_INTERPOLATION`, `INTERNAL_RULE`, `USER_PROVIDED`, `MANUAL_OVERRIDE` → MEDIUM
- `UNKNOWN` → LOW

---

## Rules Data & Assumptions

All rules are currently static (no external API calls). The provider pattern (`permitRules.provider.ts`, etc.) is designed to swap in live data sources without changing evaluator logic.

### Permit rules (per renovation type)

Defined in `permitRules.data.ts`. Each entry includes:
- `requirementStatus` — REQUIRED / LIKELY_REQUIRED / NOT_REQUIRED
- `permitCostMin` / `Max` — estimated fee range in USD
- `permitTimelineMinDays` / `MaxDays` — processing time range
- `permitTypes[]` — which permit types apply and whether required or conditional
- `inspectionStages[]` — which inspection stages are expected
- `summary` — plain-language description

### Tax rules (per renovation type + state)

Defined in `taxRules.data.ts`. Includes:
- **Median national project costs** (with low/high range) used when no user cost provided
- **Value uplift percentages** (% of project cost added to assessed property value):
  - ADU: 60–90% | Room Addition: 50–80% | Bathroom Addition: 55–85%
  - Deck: 60–80% | Roof Replacement: 60–80% | Remodel: 50–70%
  - Garage Conversion: 40–70% | Structural Wall Removal: 30–60%
- **State reassessment trigger types** for all 50 states

### Licensing rules (per renovation type + state)

Defined in `licensingRules.data.ts`. Each entry includes:
- `requirementStatus`
- `consequenceSummary` — what happens if unlicensed work is done
- `plainLanguageSummary` — homeowner-friendly explanation
- `licenseCategories[]` — which license types apply and whether required/conditional
- `notes` — caveats (e.g., cosmetic remodels may not require licensed contractors)

### Median national project costs

| Renovation Type | Median | Low | High |
|----------------|--------|-----|------|
| Room Addition | $55,000 | $22,000 | $130,000 |
| Bathroom Addition | $30,000 | $15,000 | $75,000 |
| Bathroom Full Remodel | $15,000 | $5,000 | $40,000 |
| Garage Conversion | $25,000 | $10,000 | $60,000 |
| Basement Finishing | $35,000 | $12,000 | $80,000 |
| ADU Construction | $150,000 | $60,000 | $350,000 |
| Deck Addition | $15,000 | $5,000 | $45,000 |
| Major Patio Addition | $10,000 | $3,000 | $30,000 |
| Structural Wall Removal | $8,000 | $3,000 | $20,000 |
| Structural Wall Addition | $6,000 | $2,500 | $15,000 |
| Roof Replacement | $12,000 | $5,000 | $30,000 |
| Major Structural Repair | $20,000 | $5,000 | $60,000 |

---

## Fallback Logic

The advisor degrades gracefully at every level. Fallbacks are always disclosed to the user via warnings, confidence chips, and the disclaimer bar.

| Missing data | Fallback behavior |
|-------------|------------------|
| No city in property address | Uses state-level rules; `JURISDICTION_PARTIAL` warning added |
| No state in property address | Uses national defaults; `JURISDICTION_UNRESOLVED` warning; confidence = UNAVAILABLE |
| No project cost from user | Uses national median for renovation type; `PROJECT_COST_ASSUMED` assumption + warning |
| No permit data for jurisdiction | Returns `DATA_UNAVAILABLE` status; `dataAvailable = false`; `LOW_CONFIDENCE_ESTIMATE` warning |
| No tax data for state | Uses national median millage rate (~1.1%); confidence degrades |
| No licensing rules for state | Returns `UNKNOWN` status; no state verification URL |
| Entire evaluation fails | Session marked `FAILED`; user shown retry prompt |
| Module excluded (PERMIT_ONLY etc.) | Excluded modules return skipped stubs with `UNAVAILABLE` confidence |

### Confidence propagation

```
No state + assumed cost → permit confidence = LOW, tax confidence = LOW
→ overallConfidence = LOW (median)
→ disclaimer variant = 'low_confidence'
→ UI shows amber "Some estimates use fallback rules" notice
```

```
No state at all → overallConfidence = UNAVAILABLE
→ uiMeta.unsupportedArea = true
→ disclaimer variant = 'unsupported_area'
→ UI shows "Limited local data available" amber card
```

---

## Post-Evaluation Integrations

All integrations run **fire-and-forget** after the evaluation response is returned. Failures are caught and logged but never surface to the user. All integrations are **idempotent**.

### 1. Home Timeline

- Creates a `HomeCapitalTimelineItem` record via `HomeEventsAutoGen.ensureEvent()`
- **Idempotency key:** `renovation-advisor:{sessionId}:evaluated`
- **Event type:** `IMPROVEMENT`, **subtype:** `HOME_RENOVATION_RISK_CHECK`
- **Title:** `Renovation check: {renovationLabel}`
- **Meta:** sessionId, renovationType, overallRiskLevel, overallConfidence, permitStatus, licensingStatus, isRetroactive

### 2. Digital Twin Scenario

- Looks up the property's `HomeDigitalTwin`
- Checks for existing `HomeTwinScenario` with `scenarioType: RENOVATION` and matching `advisorSessionId` in `inputPayload`
- Creates scenario if not found (idempotent check via `advisorSessionId` in payload)
- Persists `linkedDigitalTwinScenarioId` back to session

### 3. Compliance Task

- Creates a `PropertyMaintenanceTask` only when permit or licensing status requires action
- **Action key:** `renovation-advisor:{sessionId}:compliance-task` (idempotent via `createFromActionCenter`)
- Not created for LOW risk scenarios

### 4. Linked Entity ID persistence

- After integrations complete, writes `linkedDigitalTwinScenarioId` and `linkedTimelineItemId` back to the session
- These IDs power the "Logged to Home Timeline" and "Digital Twin scenario created" chips in the UI

---

## Disclaimer & Trust Layer

The advisor includes a persistent disclaimer selected based on session context. The disclaimer version is persisted to the session; the text is computed at response time.

| Variant | Trigger | Text summary |
|---------|---------|-------------|
| `unsupported_area` | `overallConfidence = UNAVAILABLE` | National defaults used; verify everything locally |
| `retroactive` | `flowType = RETROACTIVE_COMPLIANCE` | Informational only; not legal/tax advice |
| `low_confidence` | `overallConfidence = LOW` | Some estimates use fallback rules |
| `standard` | Default | Informational guidance; verify with local building department |

**Version:** `DISCLAIMER_VERSION = '1.0.0'`

The `disclaimerVersion` field is stored on the session (for audit purposes). The `disclaimerText` is returned in each API response and rendered in `AdvisorDisclaimerBar` below the results section.

---

## Analytics

**Module key:** `renovation_advisor`
**Feature key:** `renovation_advisor_session`
**Source:** `HOME_TOOLS`

| Event | Trigger | Metadata |
|-------|---------|---------|
| `featureOpened` | Session created | `renovationType`, `entryPoint`, `flowType` |
| `featureOpened` + `event: retroactive_check_started` | Session created with retroactive flow | `renovationType`, `flowType` |
| `toolUsed` | Evaluation completed | `renovationType`, `overallConfidence`, `overallRiskLevel`, `isReEvaluation`, `dataAvailable` |

---

## Frontend Files & Components

**Page:** `apps/frontend/src/app/(dashboard)/dashboard/home-renovation-risk-advisor/page.tsx`

### Component inventory

| File | Purpose |
|------|---------|
| `AdvisorInputCard.tsx` | Renovation type selector, project cost input, jurisdiction label, Run/Re-run button |
| `AdvisorSummaryCard.tsx` | Risk chip, confidence chip, last-checked date, 3-row outcome grid (permit/tax/licensing), low-confidence notice, re-run button |
| `AdvisorPermitCard.tsx` | Permit status badge, cost/timeline grid, expandable permit types and inspection stages, application portal link, source metadata |
| `AdvisorTaxCard.tsx` | Tax metrics grid (monthly/annual increase, assessed value), reassessment trigger, source metadata |
| `AdvisorLicensingCard.tsx` | Licensing status badge, consequence summary, license category chips, state verification link |
| `AdvisorWarningsCard.tsx` | Warnings sorted CRITICAL→WARNING→INFO, severity icons (XCircle/AlertTriangle/Info), critical count badge |
| `AdvisorNextActionsCard.tsx` | Priority-sorted numbered actions (max 5), top action highlighted, external link and internal route icons |
| `AdvisorAssumptionsCard.tsx` | Collapsible list of user-visible assumptions with label, value, unit, and rationale |
| `AdvisorLinkedIntegrations.tsx` | Chips showing "Logged to Home Timeline" and "Digital Twin scenario created" (with link) |
| `AdvisorRetroactiveBar.tsx` | Amber context banner shown when `flowType = RETROACTIVE_COMPLIANCE` |
| `AdvisorDisclaimerBar.tsx` | Muted info bar shown below results with context-appropriate disclaimer text |
| `AdvisorSkeleton.tsx` | Loading placeholder matching the result card layout |
| `AdvisorUtils.ts` | Formatting helpers: `formatRenovationType`, `formatRiskLevel`, `formatConfidence`, `formatPermitStatus`, `formatLicenseStatus`, `formatMoneyRange`, `formatDayRange`, and color class helpers |

### State management

- **TanStack React Query v5** for server state (2-minute stale time, 2-second polling while `PROCESSING`)
- Session ID stored in URL search params (`?sessionId=...`) for shareability
- `renovationType` and `projectCost` held in local React state
- When renovation type changes from the current session's type, a new session is always created (renovation type is immutable)

### Mutations

| Mutation | When | Behavior |
|---------|------|---------|
| `createAndEvaluateMutation` | No session, or renovation type changed | Creates new session + evaluates immediately |
| `rerunMutation` | Same renovation type, session exists | Updates cost, force-evaluates existing session |

### Key UI logic

- **Polling:** `refetchInterval` returns `2000` while `session.status === 'PROCESSING'`, `false` otherwise
- **Unsupported area:** Shows amber card in the Details section when `uiMeta.unsupportedArea === true`
- **Retroactive bar:** Shown above input card when `session.flowType === 'RETROACTIVE_COMPLIANCE'`
- **Desktop sidebar:** Shows property context card, renovation type/risk/confidence summary, and "How it works" card at `lg` breakpoint

### Frontend types

`apps/frontend/src/types/index.ts` — `RenovationAdvisorSession`, `RenovationAdvisorSessionSummary`, `CreateRenovationAdvisorSessionInput`, `UpdateRenovationAdvisorSessionInput`, `EvaluateRenovationAdvisorSessionInput`, `RenovationAdvisorWarning`, `RetroactiveCandidate`

### API client methods

`apps/frontend/src/lib/api/client.ts`:

| Method | Endpoint |
|--------|---------|
| `createRenovationAdvisorSession(input)` | `POST /api/home-renovation-advisor/sessions` |
| `updateRenovationAdvisorSession(id, input)` | `PATCH /api/home-renovation-advisor/sessions/:id` |
| `evaluateRenovationAdvisorSession(id, input)` | `POST /api/home-renovation-advisor/sessions/:id/evaluate` |
| `getRenovationAdvisorSession(id)` | `GET /api/home-renovation-advisor/sessions/:id` |
| `archiveRenovationAdvisorSession(id)` | `POST /api/home-renovation-advisor/sessions/:id/archive` |
| `updateRenovationAdvisorCompliance(id, input)` | `PATCH /api/home-renovation-advisor/sessions/:id/compliance` |
| `getAdvisorSessionExport(id)` | `GET /api/home-renovation-advisor/sessions/:id/export` |
| `getRetroactiveCandidates(propertyId)` | `GET /api/properties/:id/home-renovation-advisor/retroactive-candidates` |

---

## Mobile Navigation

The advisor is registered in the mobile tool catalog as:

```
navTarget: 'tool:home-renovation-risk-advisor'
```

URL: `/dashboard/home-renovation-risk-advisor?propertyId={id}`

The page uses `MobilePageContainer` and `MobileSection` primitives from the CtC design system, with a 2-column desktop layout (`lg:grid-cols-[1fr_320px]`) and single-column mobile layout. Design tokens come from `mobileDesignTokens.ts`.

---

## Export Capability

`GET /api/home-renovation-advisor/sessions/:id/export` returns a flat JSON export view model suitable for PDF generation, print views, or external sharing.

**Export model includes:**
- Session metadata (id, propertyId, jurisdiction string, evaluatedAt, flowType)
- Overall findings (risk level, confidence, summary)
- Module findings — each with status, confidence, human-readable ranges, source label
  - Permit: cost range (e.g., "$500–$1,500"), timeline range (e.g., "14–90 days")
  - Tax: monthly range, annual range, reassessment type
  - Licensing: status, consequence summary
- Warnings (CRITICAL and WARNING only — INFO warnings excluded from export)
- Next actions (all, with priority)
- User-visible assumptions
- Compliance checklist (retroactive sessions only)
- Disclaimer text + version
- `exportedAt` timestamp

---

## Third-Party Integrations

The Renovation Risk Advisor has **no external API dependencies** in its current rules-engine implementation. All permit, tax, and licensing data comes from static curated datasets bundled with the application.

### Internal CtC integrations

| System | Integration | Trigger |
|--------|-------------|---------|
| **Home Capital Timeline** | Creates `HomeCapitalTimelineItem` record | After evaluation completes |
| **Home Digital Twin** | Creates `HomeTwinScenario` with `scenarioType: RENOVATION` | After evaluation completes |
| **Property Maintenance Tasks** | Creates compliance task for high-risk sessions | After evaluation completes |
| **Gemini AI Chat** | Extended with renovation advisor context instructions | `GEMINI_CONTEXT_INSTRUCTION_TEMPLATE` updated in `ai-constants.ts` — Cozy reminds users about permits/licensing/tax and can suggest the advisor |
| **Analytics emitter** | `featureOpened` + `toolUsed` events | On session create and evaluate |

### Future API integrations (planned)

The provider pattern (`permitRules.provider.ts`, `taxRules.provider.ts`, `licensingRules.provider.ts`) is designed to plug in real data sources. Candidates:
- **OpenDataSoft / local municipality APIs** — live permit fee schedules
- **ATTOM Data** — property tax assessment data
- **BuildPermit / PermitFlow** — real-time permit status APIs
- **State licensing board APIs** — contractor license verification

---

## Testing

**Backend unit tests** use Node.js native test runner (`node:test`), import from `dist/` (compiled output).

| Test file | Tests | Coverage |
|-----------|-------|---------|
| `summaryBuilder.test.js` | 52 | `computeOverallRiskLevel` (standard + retroactive), `buildOverallSummary` (retroactive/low-confidence/unsupported), `buildWarningsSummary` (singular/plural), `buildWarnings` (all 13 warning codes + urgency), `buildNextActions` (pre-project + retroactive + cap at 5), `getRenovationLabel` |
| `disclaimerText.test.js` | 9 | All 4 variant texts, `selectDisclaimerVariant` priority rules, `DISCLAIMER_VERSION` format |
| `advisorEdgeCases.test.js` | 8 | `buildExportViewModel`: null modules, warning severity filtering, range formatting, retroactive checklist inclusion |

**To run:**
```bash
cd apps/backend
npm run build          # Required — tests import from dist/
node --test tests/unit/
```

---

## Known Limitations

1. **Static rules data** — Permit costs, tax uplift percentages, and licensing rules are national heuristics, not live jurisdiction-specific data. Accuracy degrades significantly outside top 15 states.

2. **15 states have verification URLs** — License lookup links only for CA, TX, FL, NY, AZ, WA, CO, IL, GA, NC, NJ, PA, OH, MI, VA. All other states show no verification URL.

3. **Tax reassessment triggers** — State-level triggers are approximations. Many counties and municipalities override state defaults (e.g., Cook County, IL reassesses triennially; rest of Illinois is annual).

4. **No ADU-specific zoning rules** — ADU regulations (setbacks, owner-occupancy, size limits) vary enormously by city. The advisor flags ADU as REQUIRED/CRITICAL but cannot surface local zoning details.

5. **Renovation type is immutable** — Changing renovation type after session creation requires a new session (by design — the evaluation is scoped to a single type).

6. **No permit status polling** — The advisor does not pull live permit status from municipal systems. It only estimates requirements.

7. **Retroactive candidate detection** — Relies on `HomeEvent.subtype` matching renovation type names. Events not created through the advisor or with unrecognized subtypes will not be detected.

8. **No background job queue** — Evaluations run synchronously. For large batch retroactive checks, this could time out.

---

## Future Enhancements

### Data & rules
- [ ] **Live permit APIs** — Integrate OpenDataSoft or BuildPermit APIs for real-time permit fee schedules and local requirements
- [ ] **ATTOM / CoreLogic tax data** — Replace static millage rates with live assessment data per county
- [ ] **State licensing board APIs** — Add 35 remaining state verification URLs and live license status checks
- [ ] **City-level rules** — Expand from state-level to city-level permit and licensing rules (starting with top 50 cities)
- [ ] **Zoning data** — Add ADU-specific zoning rules by municipality

### Features
- [ ] **Retroactive checklist UI** — Full UI for completing the compliance checklist (currently API-only)
- [ ] **PDF export** — Frontend PDF generation using the export view model (react-pdf or server-side)
- [ ] **Session history** — List view of past advisor sessions for a property
- [ ] **Multi-renovation planning** — Run advisor across multiple renovation types and compare
- [ ] **Cost estimation integration** — Pull from existing CtC provider quote data to pre-fill project cost
- [ ] **Break-even pre-fill** — Auto-populate break-even tool with permit costs + tax increase from advisor
- [ ] **TCO pre-fill** — Auto-populate TCO tool with advisor's tax impact estimate
- [ ] **Permit reminder notifications** — BullMQ job to remind user if permit not confirmed within N days after evaluation

### Intelligence
- [ ] **ML confidence calibration** — Use historical evaluation accuracy data to calibrate confidence scores
- [ ] **Neighborhood comps** — Surface recent permit activity in the user's neighborhood (if data available)
- [ ] **Seasonal permit timing** — Warn about seasonal backlogs in permit offices (summer/fall peak)
- [ ] **Insurance impact** — Estimate homeowner's insurance premium change for structural renovations

### Platform
- [ ] **Admin override panel** — Admin UI to override permit/tax/licensing rules for specific jurisdictions without a code deploy
- [ ] **Rules versioning** — Track which rules version produced each evaluation for audit purposes
- [ ] **Webhook on evaluation complete** — Allow external integrations to subscribe to evaluation completion events
- [ ] **Rate limiting** — Dedicated rate limiter for evaluation endpoint (currently uses general API limiter)
- [ ] **Session expiry** — Honor `sessionExpiresAt` field (currently populated but not enforced)
