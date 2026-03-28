# PASS 7 - CtC Unified Data Architecture Design (Grounded)

## 1. Data Layer Model

Grounding from Pass 1-5:
- Pass 1 identified ~215 backend models with overlap in asset, task, event, and intelligence domains.
- Pass 2 showed major feature flows are snapshot-heavy and mostly feature-local.
- Pass 3 and Pass 5 showed progressive capture exists, but reuse is uneven.
- Pass 4 highlighted duplicate concepts and cross-feature fragmentation.

| Layer | Purpose | Existing Models (Primary) | Current Gap | Non-Breaking Evolution |
| --- | --- | --- | --- | --- |
| Foundation Layer | Stable, low-churn facts about the home and coverage context | `Property`, `HomeownerProfile`, `InventoryRoom`, `InventoryItem`, `HomeItem`, `InsurancePolicy`, `Warranty`, `Expense`, `Claim`, `Document` | Same concept represented in multiple places (`InventoryItem` vs `HomeAsset`; mirrored financial rows in `HomeSavingsAccount`) | Keep these as durable record owners; route features to read these first before snapshots |
| Context Layer | User-provided or tool-derived assumptions and enrichments | `PropertyClimateSetting`, `RoomPlantProfile`, `RoomPlantRecommendation`, `ToolOverride`, `HomeCapitalTimelineOverride`, `CoverageScenario`, feature `inputsSnapshot` JSON | No shared preference memory; same assumptions repeatedly captured in tools | Add shared `PreferenceProfile` + `AssumptionSet`; keep existing per-feature snapshots as compatibility storage |
| Behavioral Layer | What users do over time and how they respond to recommendations | `PropertyMaintenanceTask` status/cost, `OrchestrationActionEvent`, `OrchestrationActionSnooze`, `OrchestrationActionCompletion`, `PropertyRadarState`, `PropertyRadarAction`, `HomeSavingsOpportunity.status`, `AuditLog` | Behavioral data is often write-only and not reused by risk/financial/score engines | Normalize reusable behavior into lightweight `Signal` rows while preserving current event/audit writes |

## 2. Canonical Entities

| Concept | Canonical Owner | Models That Should Stop Owning Core Truth | Non-Breaking Consolidation Path |
| --- | --- | --- | --- |
| Property | `Property` (with homeowner linkage in `HomeownerProfile`) | Feature snapshots storing long-lived property facts | Keep feature snapshots for run context only; read current property facts from `Property` at run-time |
| Room | `InventoryRoom` | Room semantics embedded in freeform tool JSON | Use `roomId` as canonical join key in tools; keep tool-local metadata but stop treating it as room truth |
| Asset | `HomeItem` as canonical cross-feature asset identity; `InventoryItem` as canonical detailed facts | `HomeAsset` duplicate identity/detail fields over time | Continue dual support; progressively bind all feature references to `homeItemId` and source facts from `InventoryItem` where present |
| Task | `PropertyMaintenanceTask` for executable homeowner tasks | `ChecklistItem` and `OrchestrationAction*` acting as independent task ledgers | Treat checklist/orchestration as recommendation and state overlays; link action keys to maintenance task IDs for execution truth |
| Event | `HomeEvent` for property timeline facts | Property-impact facts trapped only in `RadarEvent`/`HomeRiskEvent` projections | Keep radar/replay catalogs; persist property-relevant outcomes as `HomeEvent` links while retaining source catalogs |
| Financial | `InsurancePolicy`, `Warranty`, `Expense`, `Claim` | Derived/mirrored finance truth in tool snapshots and savings mirrors | Continue mirrors for UX speed; mark canonical source pointer (policy/warranty/expense IDs) and prefer canonical reads in analytics |
| Recommendation/Action | `GuidanceSignal` as recommendation identity; `PropertyMaintenanceTask` as execution identity | Action state models carrying independent recommendation truth | Keep `OrchestrationAction*` for interaction history only; attach to guidance signal + maintenance task references |

### Asset Identity Model (Critical Clarification)

HomeItem:
- Acts as the canonical identity across features.
- Used as the universal reference (`homeItemId`).
- Minimal, stable, cross-feature anchor.

InventoryItem:
- Stores detailed attributes (model, price, metadata).
- Source of truth for factual data.
- Can change over time.

Rules:
1. All cross-feature joins MUST use `homeItemId`.
2. `InventoryItem` MUST NOT be used as cross-feature identity.
3. `HomeItem` should exist for every tracked asset.

## 3. Shared Signal Layer

Purpose:
- Preserve existing feature models and APIs.
- Add one reusable, typed cross-feature substrate for high-value facts currently trapped in snapshots.

Minimal shared model (additive):
- `Signal`
- Core fields: `id`, `propertyId`, `roomId?`, `homeItemId?`, `signalKey`, `valueNumber?`, `valueText?`, `valueJson?`, `unit?`, `confidence`, `sourceModel`, `sourceId`, `capturedAt`, `validUntil?`, `version`, timestamps.
- Scope: property-first, optional room/asset granularity.

Signal catalog (grounded):

| Signal | Source Model(s) | Reuse Targets | Storage Approach |
| --- | --- | --- | --- |
| System age / expected life | `InventoryItem`, `HomeItemStatus`, risk computations | Risk Assessment, Capital Timeline, Status Board, Coverage | New `Signal` row (`signalKey=SYSTEM_AGE`) derived from existing fields |
| Maintenance adherence | `PropertyMaintenanceTask`, `OrchestrationActionCompletion`, snooze state | Risk Assessment, Home Score, Do-Nothing, Risk Premium | New `Signal` row (`MAINT_ADHERENCE`) from existing behavior tables |
| Room context quality (type/light/profile) | `InventoryRoom`, `RoomPlantProfile`, room scans | Risk Premium, Coverage, Do-Nothing, Capital Timeline | Mixed: keep source models, publish selected values into `Signal` |
| Risk/financial posture | New `PreferenceProfile` + latest tool overrides | Coverage, Risk Premium, Do-Nothing, Home Score | Canonical in `PreferenceProfile`, optional reflection to `Signal` |
| Coverage gap severity | `coverageGap` service output + policy/warranty linkage | Risk Premium, Home Score, Guidance | New `Signal` row (`COVERAGE_GAP`) instead of only per-run JSON |
| Negotiation pressure | `NegotiationShieldAnalysis` findings/pricing fields | Financial Efficiency, Home Savings confidence, Home Score | New `Signal` row (`NEGOTIATION_PRESSURE`) sourced from negotiation artifacts |
| Savings realization | `HomeSavingsOpportunity.status` transitions | Home Score, Financial Efficiency, Guidance | New `Signal` row (`SAVINGS_REALIZATION`) from status lifecycle |
| Event risk intensity | `HomeEvent`, `HomeRiskReplayEventMatch`, `PropertyRadarMatch` | Risk Assessment, Do-Nothing, Guidance | New `Signal` rows summarizing recent event pressure |
| Behavioral follow-through | completion/snooze/save/dismiss actions across tools | Personalization and next-best-action ranking | New `Signal` row family (`BEHAVIOR_*`) from existing action logs |

### Signal Creation Rules

A `Signal` MUST only be created if:
1. It is reused by at least 2 independent features.
2. It represents a derived or behavioral fact (not raw data).
3. It has a meaningful lifecycle (freshness or decay).
4. It cannot be reliably recomputed at read time.

Signals MUST NOT:
- duplicate canonical data (`Property`, `InventoryItem`, etc.).
- become a generic JSON dump layer.
- replace feature snapshots.

Examples of valid signals:
- maintenance adherence
- negotiation pressure
- savings realization

Examples of invalid signals:
- property address
- raw inventory attributes

### Signal Ownership Rule

Each `Signal` MUST have a single owning service responsible for:
- creation
- updates
- lifecycle management

Examples:
- `MAINT_ADHERENCE` -> Maintenance / Orchestration service
- `NEGOTIATION_PRESSURE` -> Negotiation service
- `COVERAGE_GAP` -> Coverage Analysis service

Rule:
No `Signal` should be written by multiple services without a defined ownership hierarchy.

## 4. Data Reuse Graph

| Signal | Captured In | Reused In | Current Gap | Proposed Fix |
| --- | --- | --- | --- | --- |
| Room type/profile | `InventoryRoom`, room scan/profile flows | Coverage, Risk Premium, Do-Nothing, Capital Timeline | Captured but mostly room-tool-local | Publish room-context signals and require room-aware scoring inputs in these tools |
| Maintenance adherence | `PropertyMaintenanceTask` + completion/snooze tables | Risk Assessment, Home Score, Risk Premium | Partial reuse; core risk scoring underuses completion quality/deferral | Standardize maintenance adherence signal consumption across risk and score services |
| Negotiation pressure | `NegotiationShieldAnalysis`, case artifacts | Financial Efficiency, Home Savings confidence, Home Score | Negotiation outputs are feature-isolated | Emit negotiation pressure signal from case analyses and include in financial/score inputs |
| Timeline behavior and event intensity | `HomeEvent`, radar/replay property matches | Risk engines, guidance prioritization, personalization | Timeline richness and engagement are not systematically reused | Map event + attention summaries into shared behavior/risk signals |
| Savings follow-through | `HomeSavingsOpportunity.status` (`APPLIED`/`SWITCHED`) | Home Score, Financial Efficiency, Action Center | Realized behavior not broadly reflected | Emit savings realization signals and consume in score/financial narratives |
| Risk tolerance + cash posture | Tool-specific overrides and profile budget data | Coverage, Risk Premium, Do-Nothing, Home Score | Repeated asks and inconsistent defaults | Centralize into `PreferenceProfile` + tool-linked `AssumptionSet` |
| Mitigation evidence quality | `RiskMitigationPlanItem` links + action completion photos/notes | Risk Premium confidence, Home Score evidence, underwriting narratives | Evidence linkage exists but unevenly captured and reused | Normalize evidence-derived confidence signals |
| Coverage memory | `CoverageScenario`, coverage analyses | Risk Premium, Do-Nothing | Scenario memory trapped in coverage feature | Reference scenario assumptions through shared `AssumptionSet` IDs |

## 5. Progressive Capture Strategy

Principles used:
- No extra onboarding burden.
- Capture only when user sees immediate value.
- Ask once, reuse many times.

| Data Point | Best Capture Moment | Owning Feature | Reuse Targets |
| --- | --- | --- | --- |
| Risk tolerance | First time user runs a risk-financial tool and value preview is shown | Coverage Analysis (initial owner) | Risk Premium, Do-Nothing, Home Score, Guidance |
| Deductible posture / premium assumptions | At simulation start when scenario delta is visible | Coverage Analysis | Risk Premium, Do-Nothing, Financial views |
| Cash buffer posture | First tool run needing affordability sensitivity | Risk Premium Optimizer (or Coverage if first touched) | Coverage, Do-Nothing, Home Score |
| Room light/room profile | During room setup or Plant Advisor interaction for that room | Rooms / Plant Advisor | Risk weighting, maintenance recommendations, capital planning |
| Maintenance proof quality (photos/notes/provider) | At completion action submission | Action Center / Maintenance | Risk confidence, Home Score evidence, negotiation support |
| Negotiation outcome severity | When negotiation analysis is finalized or case state changes | Negotiation Shield | Financial Efficiency, Home Savings confidence, Home Score |
| Savings realized status | On user marking APPLIED/SWITCHED | Home Savings | Home Score, financial confidence, action prioritization |
| Replay/radar relevance behavior | At save/dismiss/acted transitions | Radar / Replay | Guidance ranking, personalization, risk salience |
| Timeline incident significance | At event creation/edit or ingestion match | Timeline | Risk baseline tuning, do-nothing simulation sensitivity |
| Tool-specific temporary what-if knobs | At run/simulate time only | Each tool | Persist to shared `AssumptionSet`; avoid re-asking in sibling tools |

## 6. Schema Evolution Plan

### 6.1 New minimal shared models (additive)

1. `PreferenceProfile`
- Scope: `propertyId` + optional `homeownerProfileId`.
- Stores durable cross-tool posture: risk tolerance, deductible preference style, cash-buffer posture, bundling preference, confidence metadata.

2. `AssumptionSet`
- Scope: `propertyId`, `toolKey`, optional `scenarioKey`, optional `preferenceProfileId`.
- Stores normalized override bundles used by runs.
- Existing run tables keep `inputsSnapshot`; add optional `assumptionSetId` FK.

3. `Signal`
- Lightweight typed fact table described above.
- Used for high-leverage cross-feature reuse only.

### AssumptionSet Lifecycle

- Each run MAY reference an existing `AssumptionSet` or create a new one.
- `AssumptionSet` records are immutable once used in a run (versioned behavior).
- Multiple tools can reference the same `AssumptionSet`.
- New overrides create new `AssumptionSet` records (not overwrite).

Goal:
Ensure reproducibility of past runs and consistency across tools.

### 6.2 Extensions to existing models (no replacements)

- Add nullable FKs (no API break):
  - `CoverageAnalysis.assumptionSetId?`
  - `RiskPremiumOptimizationAnalysis.assumptionSetId?`
  - `DoNothingSimulationRun.assumptionSetId?`
  - `HomeScoreReport.preferenceProfileId?` (optional reference)
- Add optional provenance refs where missing:
  - Keep existing `evidenceDocumentId` / `linkedHomeEventId` patterns and expand to other models incrementally.

### 6.3 Deprecation and transition (gradual)

1. Phase A: Introduce new tables and dual-write from current feature services.
2. Phase B: Read path prefers shared records, falls back to legacy snapshots.
3. Phase C: Mark legacy snapshot fields as compatibility-only in code comments/docs.
4. Phase D: Stop adding new feature-specific duplicate fields; require shared model references for new work.

## 7. Feature Realignment

### Feature Data Contracts (Enforced)

1. Features MUST NOT store long-lived assumptions locally if a shared model exists.
2. Features MUST read canonical entities before reading snapshots.
3. Snapshots are historical artifacts only, NOT primary data sources.
4. All new features MUST integrate with:
- `PreferenceProfile`
- `AssumptionSet`
- `Signal` (if applicable)

Violation of these rules leads to:
- data duplication
- inconsistent insights
- broken cross-feature intelligence

| Feature | Should Read (Shared) | Should Stop Owning | Should Contribute Back |
| --- | --- | --- | --- |
| Risk Assessment | `Signal` (maintenance adherence, event intensity, room context), `PreferenceProfile` | Tool-local risk posture defaults | Updated risk signals and confidence signals |
| Coverage Analysis | `PreferenceProfile`, prior `AssumptionSet`, canonical policy/warranty links | Long-lived user posture in `inputsSnapshot` only | `AssumptionSet`, coverage-gap signals, scenario references |
| Risk Premium Optimizer | `PreferenceProfile`, maintenance/adherence signals, coverage-gap signals | Standalone duplicate assumptions | Mitigation impact signals and evidence-quality signals |
| Do-Nothing | `PreferenceProfile`, maintenance/event signals, coverage-gap signals | Isolated override memory | Scenario stress signals and cost-volatility signals |
| Maintenance | Canonical asset/room (`HomeItem`/`InventoryItem`/`InventoryRoom`) + recommendation refs | Independent recommendation truth | Adherence, completion quality, deferral signals |
| Negotiation Shield | Canonical financial and claim facts + maintenance/timeline evidence links | Financial pressure trapped only in negotiation artifacts | Negotiation pressure signals and outcome signals |
| Home Savings | Canonical policy/warranty/expense facts + `PreferenceProfile` | Mirrored canonical finance truth as primary source | Savings realization and provider-switch signals |
| Timeline / Radar / Replay | Canonical property/asset/room references + existing catalogs | Feature-local event impact semantics only | Event intensity, relevance, and behavioral attention signals |

## 8. Intelligence Enablement

Direct improvements from this design:

1. Risk accuracy
- Maintenance adherence and deferral behavior become first-class cross-feature inputs.
- Room context and event intensity enrich risk scoring beyond static property facts.

2. Financial modeling
- Negotiation pressure and savings realization become reusable financial signals.
- Shared assumptions reduce inconsistent premium/deductible/cash-buffer inputs.

3. Personalization
- Behavioral signals (complete/snooze/save/dismiss) become reusable across guidance and ranking.
- Preference profile stabilizes user posture without repeated prompts.

4. Explainability
- Signal provenance (`sourceModel`, `sourceId`) creates traceable reasons across tools.
- Evidence links (documents/events) can back score/risk/financial claims consistently.

5. Cross-feature consistency
- Same assumptions and shared signals feed Coverage, Risk Premium, Do-Nothing, and Home Score.
- Snapshot models remain useful history, but shared layers become the reusable intelligence backbone.

## 9. Guardrails

1. One source of truth per concept (`Property`, `InventoryRoom`, `HomeItem`/`InventoryItem`, financial core records).
2. No feature-owned core data for reusable concepts.
3. Reuse over recompute when equivalent signal already exists and is fresh.
4. Property scoping required for cross-feature entities; room/asset scoping optional but explicit.
5. Snapshot tables are run-history artifacts, not canonical storage.
6. New feature work must reference shared `PreferenceProfile` and/or `AssumptionSet` before introducing new override fields.
7. Behavioral logs must map to reusable signals when they impact recommendations or scoring.
8. Progressive capture only: collect inputs when immediate user value is visible.
9. No onboarding expansion for advanced assumptions; collect lazily at first relevant decision point.
10. Non-breaking evolution only: additive schema, dual-write, fallback reads, gradual legacy phase-down.

### Data Read Priority Order

When resolving any value:
1. Canonical entity (`Property`, `InventoryItem`, etc.)
2. Shared models (`PreferenceProfile`, `AssumptionSet`, `Signal`)
3. Feature snapshot (`inputsSnapshot`, `outputSnapshot`)

Rule:
Snapshots are fallback only, never primary source.

## 10. Data Freshness & Recompute Strategy

Derived data (signals, snapshots) must remain accurate over time.

### Trigger-based updates
- Maintenance completion -> update maintenance signals.
- Policy update -> update coverage signals.
- Event creation -> update event signals.

### Scheduled updates
- Risk signals -> periodic recomputation.
- Financial signals -> periodic recomputation.

### On-read fallback
- If signal is missing or stale -> compute on demand.

### Required fields for all signals
- `capturedAt`
- `validUntil`
- `version`

Rule:
No stale signal should silently drive decisions.
