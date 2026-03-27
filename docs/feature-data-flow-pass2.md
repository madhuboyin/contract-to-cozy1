# PASS 2 — Feature Data Flow Mapping

## Scope and Method
- Grounding source: backend routes, controllers, services, and request validators/DTO schemas under `apps/backend/src`.
- This mapping only includes behavior explicitly present in code paths inspected.
- Feature list includes the user-requested core features plus additional major Home Tools with dedicated endpoints/persistence.

---

## Feature: Risk Assessment
- Inputs (models + fields read)
  - `property`: ownership/primary checks, structural fields (`propertySize`, `yearBuilt`, `state`, `hasDrainageIssues`, `hasSumpPumpBackup`, etc.).
  - `riskAssessmentReport`: `lastCalculatedAt`, existing cached report.
  - `inventoryItem`: appliance fields (`category`, `name`, `installedOn`, `purchasedOn`, `replacementCostCents`, `warrantyId`, `insurancePolicyId`).
  - `warranty`, `insurancePolicy` (included via property relations).
- Outputs (models written)
  - `riskAssessmentReport.upsert`: `riskScore`, `financialExposureTotal`, `details`, `lastCalculatedAt`.
  - Indirect downstream write via risk integration: maintenance tasks for HIGH/CRITICAL risks.
- Derived Data (computed vs stored)
  - Computed: asset-level risk details, appliance-specific risk rows, basement flood risk, aggregate risk score/exposure.
  - Stored: risk report snapshot JSON + scalar score/exposure.
- User Inputs (explicit)
  - Path/query only: `propertyId` (and optional primary summary query propertyId).
  - Explicit trigger endpoint for recalculation.
- Behavioral Signals (implicit)
  - Recalculation marks dependent tools stale (`coverageAnalysis`, `riskPremiumOptimizer`, `doNothing`).
- Persistence pattern (stored vs computed)
  - Snapshot-first persisted report, with async/queued recomputation when stale.
- Code anchors
  - Routes: `apps/backend/src/routes/risk.routes.ts`
  - Controller: `apps/backend/src/controllers/riskAssessment.controller.ts`
  - Service: `apps/backend/src/services/RiskAssessment.service.ts`

---

## Feature: Action Center (Orchestration)
- Inputs (models + fields read)
  - `booking`: active bookings (`status`, `category`, `scheduledDate`).
  - `property`: warranties (`expiryDate`, `category`, `homeAssetId`) and insurance (`expiryDate`).
  - `riskAssessmentReport`: `details`, `lastCalculatedAt`.
  - `checklistItem`: `title`, `description`, `status`, `nextDueDate`, `isRecurring`, `serviceCategory`, `actionKey`.
  - `orchestrationActionSnooze`: active snooze state.
  - Coverage gaps via `detectCoverageGaps(propertyId)` (inventory coverage linkage).
- Outputs (models written)
  - `orchestrationDecisionTrace.upsert` (trace persistence per `propertyId + actionKey`).
  - `orchestrationActionEvent.upsert` / `deleteMany` (mark complete / undo).
  - `orchestrationActionSnooze.create` + `updateMany` (snooze lifecycle).
  - `orchestrationActionCompletion.create/update` + `orchestrationActionCompletionPhoto.updateMany`.
  - Sync side effect: `propertyMaintenanceTask` status updates for linked `actionKey`.
- Derived Data (computed vs stored)
  - Computed: candidate actions, suppression/snooze partitioning, confidence, CTA, priority sort.
  - Stored: decision traces, events, completions, snooze records.
- User Inputs (explicit)
  - Completion payload (`completedAt`, `cost`, `didItMyself`, `serviceProvider*`, `notes`, `photoIds`).
  - Snooze payload (`snoozeUntil`, `snoozeReason`), undo requests, action key references.
- Behavioral Signals (implicit)
  - Completion and undo mutate orchestration state + maintain audit/event trail.
  - Completion can propagate to maintenance task status.
- Persistence pattern (stored vs computed)
  - Hybrid: summary is recomputed on read; interaction state and traces are persisted.
- Code anchors
  - Routes: `apps/backend/src/routes/orchestration.routes.ts`, `apps/backend/src/routes/orchestrationCompletion.routes.ts`
  - Controllers: `apps/backend/src/controllers/orchestration.controller.ts`, `apps/backend/src/controllers/orchestrationCompletion.controller.ts`
  - Services: `apps/backend/src/services/orchestration.service.ts`, `apps/backend/src/services/orchestrationEvent.service.ts`, `apps/backend/src/services/orchestrationSnooze.service.ts`, `apps/backend/src/services/orchestrationCompletion.service.ts`
  - DTO schema: `apps/backend/src/validators/orchestrationCompletion.validator.ts`

---

## Feature: Maintenance (Tasks, Seasonal, Forecast)
- Inputs (models + fields read)
  - `propertyMaintenanceTask` (task lists/stats/filtering).
  - `maintenanceTaskTemplate`, `seasonalTaskTemplate`, `seasonalChecklist`, `seasonalChecklistItem`.
  - `property`, `propertyClimateSetting`, `inventoryItem`, `homeAsset`, `booking`.
  - `maintenancePrediction` rows for forecast reconciliation.
- Outputs (models written)
  - `propertyMaintenanceTask.create/update/delete` (+ status changes, booking links).
  - `seasonalChecklist` / `seasonalChecklistItem` updates (dismiss/add/remove/sync).
  - `maintenancePrediction.create/update/deleteMany` and status updates.
  - `inventoryItem.update(lastServicedOn)` when prediction marked COMPLETED.
- Derived Data (computed vs stored)
  - Computed: due dates, recurrence windows, seasonal applicability, forecast candidate reasoning/priority.
  - Stored: concrete task rows, seasonal checklist state, prediction rows.
- User Inputs (explicit)
  - Task CRUD payloads, status updates, source-specific create payloads (`from-action-center`, `from-seasonal`, `from-templates`).
  - Forecast status patch (`COMPLETED` / `DISMISSED`).
- Behavioral Signals (implicit)
  - Task mutations mark coverage/do-nothing analyses stale.
  - Completion paths can increment streak and trigger forecast regeneration.
- Persistence pattern (stored vs computed)
  - Stored operational records with periodic/generated forecast snapshots.
- Code anchors
  - Routes: `apps/backend/src/routes/propertyMaintenanceTask.routes.ts`, `apps/backend/src/routes/seasonalChecklist.routes.ts`, `apps/backend/src/routes/maintenancePrediction.routes.ts`
  - Controllers: `apps/backend/src/controllers/propertyMaintenanceTask.controller.ts`, `apps/backend/src/controllers/seasonalChecklist.controller.ts`, `apps/backend/src/controllers/maintenancePrediction.controller.ts`
  - Services: `apps/backend/src/services/PropertyMaintenanceTask.service.ts`, `apps/backend/src/services/seasonalChecklist.service.ts`, `apps/backend/src/services/maintenancePrediction.service.ts`

---

## Feature: Negotiation Shield
- Inputs (models + fields read)
  - `property` (ownership + context), `insurancePolicy`, `propertyMaintenanceTask`, `claim`, `homeEvent`.
  - `document` + linked case documents for parse/analysis source material.
  - Existing `negotiationShieldCase`, `negotiationShieldInput`, `negotiationShieldDocument`, `negotiationShieldAnalysis`, `negotiationShieldDraft`.
- Outputs (models written)
  - Case lifecycle: `negotiationShieldCase.create/update`.
  - Inputs: `negotiationShieldInput.create/update` (manual + parsed/structured).
  - Documents: `document.create` (if needed), `negotiationShieldDocument.create`.
  - Analysis artifacts: `negotiationShieldAnalysis.create`, `negotiationShieldDraft.create/updateMany`.
  - Tracking: `auditLog.create` events.
- Derived Data (computed vs stored)
  - Computed: scenario analysis outputs and draft responses.
  - Stored: case snapshots, parsed data, analyses, drafts, status/version transitions.
- User Inputs (explicit)
  - Case create payload (`scenarioType`, `title`, `description`, `sourceType`, optional `initialInput`).
  - Manual input save payload (`inputType`, `rawText`, `structuredData`).
  - Document attach payload (`documentType`, `documentId` or file metadata).
- Behavioral Signals (implicit)
  - Analyze flow records guidance completion hook; interaction events go to audit log.
- Persistence pattern (stored vs computed)
  - Persisted case workspace with generated analyses/drafts per run.
- Code anchors
  - Routes: `apps/backend/src/routes/negotiationShield.routes.ts`
  - Controller: `apps/backend/src/controllers/negotiationShield.controller.ts`
  - Service: `apps/backend/src/services/negotiationShield.service.ts`
  - DTO schemas: `apps/backend/src/validators/negotiationShield.validators.ts`

---

## Feature: Home Score
- Inputs (models + fields read)
  - `property` + ownership and metadata.
  - Quality/source signals from `document`, `inventoryItem`, `warranty`, `insurancePolicy`, `propertyMaintenanceTask` counts.
  - Tool outputs: risk report, financial efficiency summary, property score snapshot summary.
  - Timeline/behavioral context: `homeEvent`, `doNothingSimulationRun`.
  - Existing score snapshots: `homeScoreReport` + sections/artifacts.
- Outputs (models written)
  - Snapshot graph: `homeScoreReport`, `homeScoreReportSection`, `homeScoreIntegrityCheckRun`, `homeScoreFinancialForecast`, `homeScoreFinancialForecastItem`, `homeScoreDataSourceRun`, `homeScoreDataSourceFact`.
  - Corrections/events: `auditLog.create`.
  - Refresh path triggers risk + FES recalculations then persists new Home Score snapshot.
- Derived Data (computed vs stored)
  - Computed: composite score + factors/trend/confidence/integrity checks.
  - Stored: versioned report snapshots and artifacts.
- User Inputs (explicit)
  - Query/body: `weeks`, correction payload (`fieldKey`, `title`, `detail`, `proposedValue`), tracking payload (`event`, `section`, `metadata`), refresh call.
- Behavioral Signals (implicit)
  - User corrections and interactions logged in audit stream.
- Persistence pattern (stored vs computed)
  - Snapshot persistence with supersession (`updateMany` old finals before new report creation).
- Code anchors
  - Routes: `apps/backend/src/routes/homeScoreReport.routes.ts`
  - Controller: `apps/backend/src/controllers/homeScoreReport.controller.ts`
  - Service: `apps/backend/src/services/homeScoreReport.service.ts`

---

## Feature: Timeline (Home Events)
- Inputs (models + fields read)
  - `homeEvent` (+ linked docs and inventory reference).
  - Ownership guards via `inventoryRoom`, `inventoryItem`, `claim`, `expense`.
  - `document` access checks for attachments.
  - Canonical appliance inventory for synthetic purchase events.
- Outputs (models written)
  - `homeEvent.create/update/delete`.
  - `homeEventDocument.upsert/delete`.
- Derived Data (computed vs stored)
  - Computed: purchase deduping/collapse and synthetic canonical appliance purchase events for feed view.
  - Stored: explicit user-entered events + document links.
- User Inputs (explicit)
  - Event payload fields in validator (`type`, `importance`, `occurredAt`, `title`, `amount`, linked entity IDs, `meta`, `groupKey`, `idempotencyKey`).
  - Document attach payload (`documentId`, `kind`, `caption`, `sortOrder`).
- Behavioral Signals (implicit)
  - Event changes mark replace-repair and do-nothing outputs stale.
- Persistence pattern (stored vs computed)
  - Core timeline is persisted; some feed entries are computed/synthetic at read time.
- Code anchors
  - Routes: `apps/backend/src/routes/homeEvents.routes.ts`
  - Controller: `apps/backend/src/controllers/homeEvents.controller.ts`
  - Service: `apps/backend/src/services/homeEvents.service.ts`
  - DTO schemas: `apps/backend/src/validators/homeEvents.validators.ts`

---

## Feature: Home Event Radar (Home Tools)
- Inputs (models + fields read)
  - Canonical radar event store: `radarEvent`.
  - Property feed/match state: `propertyRadarMatch`, `propertyRadarState`.
- Outputs (models written)
  - `radarEvent.create/update` (upsert by `dedupeKey`).
  - Matching side effects (via matcher service) into property match tables.
  - `propertyRadarState.upsert`, `propertyRadarAction.create`.
  - UI analytics: `auditLog.create`.
- Derived Data (computed vs stored)
  - Computed: property feed shape/detail serialization; cursor paging composition.
  - Stored: canonical events, match rows, user state transitions/actions.
- User Inputs (explicit)
  - Internal ingest payload (`eventType`, `severity`, `startAt`, `location*`, `dedupeKey`, etc.).
  - Property state updates (`state`, `stateMetaJson`) and feed query filters.
- Behavioral Signals (implicit)
  - Detail-open auto-transitions `new` → `seen`, writes action log.
- Persistence pattern (stored vs computed)
  - Stored event+state records with computed feed projections.
- Code anchors
  - Routes: `apps/backend/src/routes/homeEventRadar.routes.ts`
  - Controller: `apps/backend/src/controllers/homeEventRadar.controller.ts`
  - Service: `apps/backend/src/services/homeEventRadar.service.ts`
  - DTO schemas: `apps/backend/src/validators/homeEventRadar.validators.ts`

---

## Feature: Home Risk Replay (Home Tools)
- Inputs (models + fields read)
  - Property context (`property` structural/system fields, `homeAssets`, `inventoryItems`).
  - Risk event corpus: `homeRiskEvent` scoped by window and location type.
- Outputs (models written)
  - `homeRiskReplayRun.create/update` (pending/completed/failed lifecycle).
  - `homeRiskReplayEventMatch.createMany` for matched events.
  - `auditLog.create` for interaction tracking.
- Derived Data (computed vs stored)
  - Computed: replay window resolution, event matching scores, impact summaries, recommended actions/systems.
  - Stored: replay run snapshots and matched-event rows.
- User Inputs (explicit)
  - Generate payload (`windowType`, optional custom `windowStart/windowEnd`, `forceRegenerate`).
  - List query (`limit`) and analytics tracking payload.
- Behavioral Signals (implicit)
  - Reuse of completed identical window run unless forced regeneration.
- Persistence pattern (stored vs computed)
  - Run snapshots persisted per window, with computed detail projection on read.
- Code anchors
  - Routes: `apps/backend/src/routes/homeRiskReplay.routes.ts`
  - Controller: `apps/backend/src/controllers/homeRiskReplay.controller.ts`
  - Service: `apps/backend/src/services/homeRiskReplay.service.ts`
  - DTO schemas: `apps/backend/src/validators/homeRiskReplay.validators.ts`

---

## Feature: Coverage Analysis / Coverage Options (Home Tools)
- Inputs (models + fields read)
  - Property + profile budget/spend context.
  - `inventoryItem` (cost, age proxies, condition, warranty/insurance linkage).
  - `propertyMaintenanceTask`, `claim`, `insurancePolicy`, `warranty`.
  - Coverage gap signals from `detectCoverageGaps` (inventory + linked coverage expiry).
- Outputs (models written)
  - `coverageAnalysis.create` (property-level and item-level runs).
  - `coverageScenario.create` for simulations when `saveScenario` is true.
  - Staleness updates via `coverageAnalysis.updateMany` helper functions.
  - Guidance hook on qualifying results.
- Derived Data (computed vs stored)
  - Computed: verdicts, confidence, flags, recommendations, decision trace, expected net impact.
  - Stored: analysis snapshots (`insuranceResult`, `warrantyResult`, `inputsSnapshot`, `nextSteps`, etc.).
- User Inputs (explicit)
  - Property run/simulate overrides (premium, deductible, warranty costs, cash buffer, risk tolerance).
  - Item run overrides (coverage type, annual cost/service fee, replacement cost, remaining years).
- Behavioral Signals (implicit)
  - Emits guidance completion signal when verdict thresholds are met.
- Persistence pattern (stored vs computed)
  - Analysis snapshots persisted per run; simulations optionally ephemeral unless scenario saved.
- Code anchors
  - Routes: `apps/backend/src/routes/coverageAnalysis.routes.ts`, `apps/backend/src/routes/inventory.routes.ts` (item coverage endpoints)
  - Controller: `apps/backend/src/controllers/coverageAnalysis.controller.ts`
  - Services: `apps/backend/src/services/coverageAnalysis.service.ts`, `apps/backend/src/services/coverageGap.service.ts`

---

## Feature: Risk Premium Optimizer (Home Tools)
- Inputs (models + fields read)
  - `property` risk/system fields + `riskReport`.
  - `insurancePolicy` (premium/deductible/coverage window), `claim` history, `inventoryItem` profile.
  - `document` signals (inspection/mitigation evidence), `homeEvent` for linked proof validation.
- Outputs (models written)
  - `riskPremiumOptimizationAnalysis.create`.
  - `riskMitigationPlanItem.createMany` for recommended mitigations.
  - `riskMitigationPlanItem.update` for status/evidence/home event linkage.
  - Staleness via `riskPremiumOptimizationAnalysis.update` (latest READY → STALE).
- Derived Data (computed vs stored)
  - Computed: premium drivers, recommendation stack, savings range, confidence, summary.
  - Stored: analysis snapshot + concrete plan-item rows.
- User Inputs (explicit)
  - Run overrides (`annualPremium`, `deductibleAmount`, `cashBuffer`, `riskTolerance`, `assumeBundled`, `assumeNewMitigations`).
  - Plan item patch (`status`, `completedAt`, `evidenceDocumentId`, `linkedHomeEventId`).
- Behavioral Signals (implicit)
  - Completing/skipping plan item triggers stale marker for recomputation.
- Persistence pattern (stored vs computed)
  - Persisted analyses with mutable plan item execution state.
- Code anchors
  - Routes: `apps/backend/src/routes/riskPremiumOptimizer.routes.ts`
  - Controller: `apps/backend/src/controllers/riskPremiumOptimizer.controller.ts`
  - Service: `apps/backend/src/services/riskPremiumOptimizer.service.ts`

---

## Feature: Do Nothing Simulator (Home Tools)
- Inputs (models + fields read)
  - `property` + baseline risk attributes.
  - `doNothingScenario` (optional scenario template overrides).
  - `inventoryItem`, `propertyMaintenanceTask`, `claim`, `homeEvent`, `insurancePolicy`.
- Outputs (models written)
  - Scenario CRUD: `doNothingScenario.create/update/delete`.
  - Run persistence: `doNothingSimulationRun.create` (summary, inputsSnapshot, outputsSnapshot, traces).
  - Stale markers: `doNothingSimulationRun.updateMany` helpers.
  - Guidance completion hook after run.
- Derived Data (computed vs stored)
  - Computed: risk score delta, cost delta range, incident likelihood, top drivers, avoidable losses, next steps.
  - Stored: simulation run snapshot with decision trace and derived outputs.
- User Inputs (explicit)
  - Scenario and run payloads (`horizonMonths`, optional `scenarioId`, overrides like `skipMaintenance`, `skipWarranty`, deductible strategy, cash buffer, ignored risks, risk tolerance).
- Behavioral Signals (implicit)
  - Guidance signal emitted after run completion.
- Persistence pattern (stored vs computed)
  - Scenario templates persisted separately from run snapshots.
- Code anchors
  - Routes: `apps/backend/src/routes/doNothingSimulator.routes.ts`
  - Controller: `apps/backend/src/controllers/doNothingSimulator.controller.ts`
  - Service: `apps/backend/src/services/doNothingSimulator.service.ts`

---

## Feature: Home Status Board (Home Tools)
- Inputs (models + fields read)
  - `riskAssessmentReport.details` for home-asset backfill.
  - `inventoryItem`, `homeAsset`, `homeItem`, `homeItemStatus` + maintenance/warranty relations.
- Outputs (models written)
  - Backfill/registry sync: `homeAsset.createMany`, `homeItem.create/update`.
  - Computation output: `homeItemStatus.update` and `homeItemStatusEvent.create`.
  - User overrides: `homeItemStatus.update`, `homeItemStatusEvent.create`.
- Derived Data (computed vs stored)
  - Computed: condition/recommendation, warranty state, EOL ratio, overdue maintenance signals, summary/groupings.
  - Stored: computed fields and user override fields in `homeItemStatus`.
- User Inputs (explicit)
  - Query filters/grouping (`q`, `groupBy`, `condition`, `categoryKey`, pinned/hidden toggles, paging).
  - Patch payload (`overrideCondition`, `overrideRecommendation`, override dates/notes, pin/hide).
- Behavioral Signals (implicit)
  - Recompute triggered when stale/uncomputed status rows detected.
- Persistence pattern (stored vs computed)
  - Persistent board registry/status rows with periodic recomputation.
- Code anchors
  - Routes: `apps/backend/src/routes/homeStatusBoard.routes.ts`
  - Controller: `apps/backend/src/controllers/homeStatusBoard.controller.ts`
  - Service: `apps/backend/src/services/homeStatusBoard.service.ts`
  - DTO schemas: `apps/backend/src/validators/homeStatusBoard.validators.ts`

---

## Feature: Home Savings (Home Tools)
- Inputs (models + fields read)
  - `property` ownership/location.
  - `homeSavingsCategory` seeds/enabled categories.
  - `homeSavingsAccount` latest account per category.
  - `homeSavingsOpportunity` active/new/viewed/saved opportunities.
- Outputs (models written)
  - Category seed upserts: `homeSavingsCategory.upsert`.
  - Account upsert path: `homeSavingsAccount.create/update`.
  - Run generation: expire old opportunities (`updateMany`), create new opportunities (`create`), `homeSavingsRun.create` summary record.
  - Opportunity status changes: `homeSavingsOpportunity.update`.
  - Guidance completion hook after comparison run.
- Derived Data (computed vs stored)
  - Computed: category status (`NOT_SET_UP`/`CONNECTED`/`FOUND_SAVINGS`), total potential monthly/annual savings.
  - Stored: opportunities and run summaries.
- User Inputs (explicit)
  - Account payload (`providerName`, `planName`, `billingCadence`, `amount`, dates, usage/plan JSON, status).
  - Run payload (`categoryKey` optional), status patch payload.
- Behavioral Signals (implicit)
  - Comparison run emits guidance signal for financial exposure workflow.
- Persistence pattern (stored vs computed)
  - Stored account/opportunity/run records with computed summary rollups.
- Code anchors
  - Routes: `apps/backend/src/routes/homeSavings.routes.ts`
  - Controller: `apps/backend/src/controllers/homeSavings.controller.ts`
  - Service: `apps/backend/src/services/homeSavings.service.ts`
  - DTO types: `apps/backend/src/services/homeSavings/types.ts`

---

## Feature: Home Capital Timeline (Home Tools)
- Inputs (models + fields read)
  - `inventoryItem` lifecycle/cost fields.
  - `homeEvent` repair/maintenance/inspection history.
  - `homeCapitalTimelineOverride` records.
- Outputs (models written)
  - Full run persistence: old `homeCapitalTimelineItem` + `homeCapitalTimelineAnalysis` deleted, new analysis + item rows created.
  - Override CRUD: `homeCapitalTimelineOverride.create/update/delete`.
  - Staleness marker: latest READY analysis set to STALE on override changes.
- Derived Data (computed vs stored)
  - Computed: replacement/major-repair windows, cost ranges, confidence, priority, explanatory “why”.
  - Stored: timeline analysis snapshot + generated item rows.
- User Inputs (explicit)
  - Run payload (`horizonYears`).
  - Override payload (`inventoryItemId`, `type`, `payload`, optional `note`).
- Behavioral Signals (implicit)
  - Any override change invalidates latest ready timeline snapshot.
- Persistence pattern (stored vs computed)
  - Snapshot regeneration model (delete/recreate per run), plus independent override state.
- Code anchors
  - Routes: `apps/backend/src/routes/homeCapitalTimeline.routes.ts`
  - Controller: `apps/backend/src/controllers/homeCapitalTimeline.controller.ts`
  - Service: `apps/backend/src/services/homeCapitalTimeline.service.ts`
  - DTO schemas: `apps/backend/src/validators/homeCapitalTimeline.validators.ts`

---

## Feature: Guidance Overview / Journey Engine
- Inputs (models + fields read)
  - Journey state: `guidanceJourney`, `guidanceJourneyStep`, `guidanceSignal`.
  - Tool completion payloads from feature controllers (coverage, do-nothing, home-savings, negotiation-shield, etc.).
- Outputs (models written)
  - `guidanceJourney.create/update`, `guidanceJourneyEvent.create`.
  - `guidanceJourneyStep.create/update`.
  - Signal lifecycle writes in resolver services.
  - Merged derived step outputs via guidance derived-data service.
- Derived Data (computed vs stored)
  - Computed: next-step resolution, suppression/blocking decisions, signal confidence/priority.
  - Stored: journey/step/signal state and event history.
- User Inputs (explicit)
  - Route-validated journey actions (step complete/skip/block, signal resolve, tool-completion body + params).
- Behavioral Signals (implicit)
  - Cross-feature hooks feed guidance completion events without additional user interaction.
- Persistence pattern (stored vs computed)
  - Persisted workflow state with rule-driven recomputation of active step/signal handling.
- Code anchors
  - Routes: `apps/backend/src/routes/guidance.routes.ts`
  - Controller: `apps/backend/src/controllers/guidance.controller.ts`
  - Services: `apps/backend/src/services/guidanceEngine/guidanceJourney.service.ts`, `guidanceSignalResolver.service.ts`, `guidanceStepResolver.service.ts`, `guidanceBookingGuard.service.ts`

