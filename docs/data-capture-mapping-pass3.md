# PASS 3 - Data Capture Mapping

## Scope and Method
- Grounded in inspected frontend UI flows, shared API client methods, backend routes/controllers/validators, and Prisma models.
- Captured In values name the actual UI surface (or API-only capture path where no current UI was found).
- Type classification used exactly as requested: `PRIMARY` (onboarding), `SECONDARY` (progressive explicit capture), `BEHAVIORAL` (implicit/interaction signals).

## Data Point Table

| Data | Type | Captured In | Stored In | Reused? | Notes |
| --- | --- | --- | --- | --- | --- |
| User account identity (`email`, `password`, `firstName`, `lastName`) | PRIMARY | Signup page (`apps/frontend/src/app/(auth)/signup/page.tsx`) | `User` | Yes (High) | Explicit onboarding capture used for auth and account profile. |
| Homeowner segment (`HOME_BUYER` or `EXISTING_OWNER`) | PRIMARY | Signup segment radios | `HomeownerProfile.segment` | Yes (High) | Explicit onboarding capture used to branch product flows. |
| Property core profile (`address`, `city`, `state`, `zipCode`, `propertyType`, `yearBuilt`, `propertySize`) | PRIMARY | New property flow (`apps/frontend/src/app/(dashboard)/dashboard/properties/new/page.tsx`) | `Property` | Yes (High) | Explicit onboarding capture reused across risk, score, maintenance, replay, and radar matching. |
| Property systems and safety booleans (heating/cooling/water heater/roof, detectors, drainage, etc.) | PRIMARY | New property flow | `Property` | Yes (High) | Explicit onboarding capture reused in risk and downstream tools. |
| Initial major home assets (`homeAssets[]` type + install year) | PRIMARY | New property flow -> payload `homeAssets` | `HomeAsset` | Yes (High) | Explicit onboarding capture reused by risk/maintenance/timeline logic. |
| Property cover photo reference (`coverPhotoDocumentId`) | PRIMARY | New property flow upload step | `Document`, `Property.coverPhotoDocumentId` | Yes (Low) | Explicit onboarding capture mainly reused for property presentation context. |
| Onboarding progression (`currentStep`, complete/skip/finish) | PRIMARY | Onboarding status endpoints (`/properties/:id/onboarding/*`) | `PropertyOnboarding` | Yes (Medium) | Behavioral onboarding state for progression and setup completion. |
| User contact/profile edits (`phone`, address fields) | SECONDARY | Profile update flow (`/api/users/profile`) | `User`, `Address` | Yes (Medium) | Explicit progressive profile capture reused for account context and provider interactions. |
| Seasonal preferences (`climateRegion`, `notificationEnabled`, `autoGenerateChecklists`, timing) | SECONDARY | Seasonal settings page (`apps/frontend/src/app/(dashboard)/dashboard/seasonal/settings/page.tsx`) | `PropertyClimateSetting` | Yes (High) | Explicit settings reused in seasonal checklist generation/notification behavior. |
| Maintenance task details (`title`, `description`, `priority`, `serviceCategory`, recurrence, due date, costs) | SECONDARY | Create/Edit Maintenance modals | `PropertyMaintenanceTask` | Yes (High) | Explicit progressive capture reused in Action Center and maintenance views. |
| Maintenance status and actual cost updates | SECONDARY | Maintenance status actions (`updateMaintenanceTaskStatus`) | `PropertyMaintenanceTask.status`, `actualCost` | Yes (High) | Explicit progressive updates reused for task stats and completion views. |
| Action Center state toggle (`actionKey`, mark complete or undo) | SECONDARY | Action Center action controls (`markOrchestrationActionCompleted`, `undoOrchestrationActionCompleted`) | `OrchestrationActionEvent` | Yes (High) | Explicit progressive action-state capture reused in orchestration suppression/completion logic. |
| Action completion details (`completedAt`, `cost`, `didItMyself`, provider info, notes, `photoIds`) | SECONDARY | Action Center completion modal (`CompletionModal.tsx`) | `OrchestrationActionCompletion`, `OrchestrationActionCompletionPhoto` | Yes (Medium) | Explicit progressive capture reused in orchestration completion history. |
| Action snooze details (`snoozeUntil`, `snoozeReason`) | SECONDARY | Action Center snooze modal (`SnoozeModal.tsx`) | `OrchestrationActionSnooze` | Yes (High) | Explicit progressive capture reused to suppress/resurface actions. |
| Timeline view preferences (`mode`, `type` filter, `limit`, replay controls) | SECONDARY | Timeline page (`apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/timeline/page.tsx`) | React state; `localStorage` (`ctc.timeline.mode`) | Yes (Low) | Explicit UI state capture; not persisted server-side. |
| Timeline event payload (`type`, `importance`, `occurredAt`, `title`, `amount`, links) | SECONDARY | API contract (`/api/properties/:id/home-events`) | `HomeEvent` | Yes (High) | Explicit data shape exists in backend validators; current timeline page is mostly read/filter UI. |
| Timeline event document metadata (`documentId`, `kind`, `caption`, `sortOrder`) | SECONDARY | API contract (`/api/properties/:id/home-events/:eventId/documents`) | `HomeEventDocument` | Yes (Medium) | Explicit attachment capture in backend contract. |
| Risk Assessment recalculation trigger (`propertyId`, refresh/read request) | SECONDARY | Risk report read/refresh endpoints (`/api/risk/*`, Home Score refresh flow) | `RiskAssessmentReport` (new/upserted run) | Yes (High) | Explicit trigger capture initiates recalculation lifecycle for the property risk report. |
| Risk Assessment computed outputs (`riskScore`, `financialExposureTotal`, risk details) | SECONDARY | Computed during assessment run | `RiskAssessmentReport` (`riskScore`, `financialExposureTotal`, `details`, `lastCalculatedAt`) | Yes (High) | Inferred/computed from property and asset context, then persisted for reuse by downstream features. |
| Coverage analysis overrides (`annualPremiumUsd`, `deductibleUsd`, warranty costs, `cashBufferUsd`, `riskTolerance`) | SECONDARY | Coverage Intelligence panel (`CoverageIntelligencePanel.tsx`) | `CoverageAnalysis.inputsSnapshot` | Yes (High) | Explicit financial assumption capture used in analysis and reruns. |
| Coverage what-if scenario save (`saveScenario`, optional `name`) | SECONDARY | Coverage simulate flow | `CoverageScenario` | Yes (Medium) | Explicit optional save path for scenario compare/history. |
| Coverage verdict and trace outputs | SECONDARY | Computed during run/simulate | `CoverageAnalysis` (`summary`, verdicts, decision trace/results JSON) | Yes (High) | Inferred/computed from existing property/inventory/coverage context, then stored. |
| Risk Premium Optimizer overrides (`annualPremium`, `deductibleAmount`, `cashBuffer`, `riskTolerance`, `assumeBundled`) | SECONDARY | Risk Premium Optimizer panel | `RiskPremiumOptimizationAnalysis.inputsSnapshot` | Yes (High) | Explicit assumptions captured for optimization run. |
| Mitigation plan progress (`status`, `completedAt`) | SECONDARY | Plan item status controls in optimizer panel | `RiskMitigationPlanItem` | Yes (High) | Explicit progressive task-state capture reused in mitigation plan UI. |
| Mitigation evidence linkage (`evidenceDocumentId`, `linkedHomeEventId`) | SECONDARY | API contract (`PATCH /risk-premium-optimizer/plan-items/:id`) | `RiskMitigationPlanItem` | Yes (Potential) | Capture path exists in backend and client API; not surfaced in current optimizer UI controls. |
| Do-Nothing scenario definition (`name`, `horizonMonths`, overrides incl. skip flags, deductible strategy, cash buffer, risk tolerance) | SECONDARY | Do-Nothing Simulator panel | `DoNothingScenario` | Yes (High) | Explicit progressive capture reused across saved scenarios and reruns. |
| Do-Nothing run request (`scenarioId`, `horizonMonths`, optional overrides) | SECONDARY | Do-Nothing run action | `DoNothingSimulationRun.inputsSnapshot` | Yes (High) | Explicit run configuration capture for each simulation. |
| Do-Nothing risk/cost outputs (`riskScoreDelta`, cost deltas, incident likelihood, drivers) | SECONDARY | Computed on run | `DoNothingSimulationRun` | Yes (High) | Inferred/computed and persisted as run snapshot/output. |
| Home Savings account basics (`providerName`, `planName`, `billingCadence`, `amount`, renewal/contract dates) | SECONDARY | Home Savings panel | `HomeSavingsAccount` | Yes (High) | Explicit progressive capture reused by savings comparison runs. |
| Home Savings usage attributes (`speedTier`, `rateType`, `kwhMonthly`) | SECONDARY | Home Savings panel category-specific fields | `HomeSavingsAccount.usageJson`, `planDetailsJson` | Yes (High) | Explicit progressive capture reused to generate opportunity recommendations. |
| Home Savings opportunity action status (`APPLIED`, `SAVED`, `DISMISSED`, etc.) | SECONDARY | Opportunity action buttons in Home Savings panel | `HomeSavingsOpportunity.status` | Yes (Medium) | Explicit progressive capture of user follow-through state. |
| Home Savings comparison run trigger (`categoryKey` optional) | SECONDARY | Run action in Home Savings panel | `HomeSavingsRun` (`trigger`, `inputsJson`, `summaryJson`) | Yes (Medium) | Explicit run request capture with persisted run summary. |
| Capital Timeline horizon (`horizonYears`) | SECONDARY | Capital Timeline tool (`CapitalTimelineClient.tsx`) | `HomeCapitalTimelineAnalysis.horizonYears` and `inputsSnapshot` | Yes (High) | Explicit progressive capture reused for timeline generation. |
| Capital Timeline overrides (`inventoryItemId`, `type`, `payload`, `note`) | SECONDARY | API contract (`/capital-timeline/overrides`) | `HomeCapitalTimelineOverride` | Yes (High) | Explicit override capture path exists; current UI does not expose these controls. |
| Capital Timeline projected items (window, costs, priority, why) | SECONDARY | Computed during timeline run | `HomeCapitalTimelineItem`, `HomeCapitalTimelineAnalysis.timelineJson` | Yes (High) | Inferred/computed and persisted for read/reuse. |
| Negotiation case setup (`scenarioType`, `title`, `description`, `sourceType`) | SECONDARY | Negotiation Shield create-case flow | `NegotiationShieldCase` | Yes (High) | Explicit progressive workspace setup data. |
| Negotiation manual input (`inputType`, scenario-specific `structuredData`, optional `rawText`) | SECONDARY | Negotiation Shield case workspace forms | `NegotiationShieldInput` | Yes (High) | Explicit progressive capture reused by analysis and draft generation. |
| Negotiation document attachment metadata (`documentType`, `documentId` or upload metadata) | SECONDARY | Negotiation Shield documents section | `Document`, `NegotiationShieldDocument` | Yes (High) | Explicit document capture reused for parse and analysis context. |
| Negotiation parse/analyze outputs (findings, leverage, actions, pricing assessment, draft text) | SECONDARY | Parse + Analyze actions | `NegotiationShieldAnalysis`, `NegotiationShieldDraft` | Yes (High) | Inferred/computed outputs persisted as case artifacts. |
| Home Event Radar feed filter + dismissed visibility toggles | SECONDARY | Radar page filters/toggles | React local state only | Yes (Low) | Explicit UI preferences, not server-persisted. |
| Home Event Radar per-event user state (`new/seen/saved/dismissed/acted_on`) | SECONDARY | Radar detail sheet state actions | `PropertyRadarState`, `PropertyRadarAction` | Yes (High) | Explicit progressive capture reused in radar feed/detail ordering and UX state. |
| Home Risk Replay generation inputs (`windowType`, `windowStart`, `windowEnd`, `forceRegenerate`) | SECONDARY | Home Risk Replay controls | `HomeRiskReplayRun` | Yes (High) | Explicit progressive capture reused in replay history/details. |
| Home Risk Replay matched-event timeline and summaries | SECONDARY | Computed on replay generation | `HomeRiskReplayEventMatch`, `HomeRiskReplayRun.summaryJson` | Yes (High) | Inferred/computed from property + historical event corpus and persisted. |
| Home Score refresh intent (manual rerun for selected `weeks`) | SECONDARY | Home Score page refresh action | New `HomeScoreReport` snapshot graph | Yes (High) | Explicit run trigger causes recomputation + snapshot persistence. |
| Home Score correction payload (`fieldKey`, `title`, `detail`, `proposedValue`) | SECONDARY | API contract (`/home-score/corrections`) | `AuditLog` (correction action payload), reflected in report correction history | Yes (Potential) | Capture path exists in backend and API client; no active correction form found on current Home Score page. |
| Home Event Radar analytics events (`OPENED`, `FILTER_APPLIED`, `STATE_CHANGED`, etc.) | BEHAVIORAL | Radar page/detail tracking calls | `AuditLog` | Yes (Low) | Implicit behavioral signal capture for analytics/telemetry. |
| Home Risk Replay analytics events (`OPENED`, `GENERATION_STARTED`, `EVENT_OPENED`, errors) | BEHAVIORAL | Replay page tracking calls | `AuditLog` | Yes (Low) | Implicit behavioral signal capture for replay interaction analytics. |
| Negotiation Shield analytics events (`CASE_CREATED`, parse/analyze lifecycle, copy actions) | BEHAVIORAL | Negotiation Shield tracking calls | `AuditLog` | Yes (Low) | Implicit behavioral signal capture for tool usage quality and funnel analysis. |
| Home Score interaction analytics (`REPORT_VIEWED`, `SECTION_EXPANDED`, `PDF_EXPORT_CLICKED`, etc.) | BEHAVIORAL | Home Score page tracking calls | `AuditLog` | Yes (Low) | Implicit behavioral signal capture; inspected code shows write path, not downstream in-product reads. |

## Observed Patterns

### Data Captured But Not Reused (or not visibly reused in inspected product paths)
- Home Score interaction telemetry is captured to `AuditLog`; no direct in-product read path was found in inspected frontend/backend surfaces.
- Home Event Radar and Home Risk Replay telemetry are captured to `AuditLog`; primary reuse appears analytics-oriented, not user-facing.
- Timeline view/replay preferences are captured in local state and mostly session/local UX reuse only.

### Data Repeatedly Asked
- Financial assumptions are asked in multiple tools with overlapping semantics:
  - Coverage Intelligence (`annualPremiumUsd`, `deductibleUsd`, `cashBufferUsd`, `riskTolerance`)
  - Risk Premium Optimizer (`annualPremium`, `deductibleAmount`, `cashBuffer`, `riskTolerance`)
  - Do-Nothing Simulator (`cashBufferCents`, `riskTolerance`, deductible strategy)
- Negotiation Shield scenarios collect similar identity/cost/date fields across multiple scenario-specific forms (contractor/insurer amounts and dates).

### Inferred But Not Stored
- Timeline page replay controls and filter UI state are inferred from interaction and held client-side; only `mode` is persisted locally, not server-side.
- Radar filter selection and dismissed-toggle visibility are client-only state and not persisted to backend models.
- Timeline feed includes synthetic/canonical purchase-style entries at read time (service-side composition), not as persisted `HomeEvent` rows.

## API Capture Paths Present But Not Currently Surfaced in Main UI
- Risk mitigation evidence linkage fields (`evidenceDocumentId`, `linkedHomeEventId`) exist in API/backend but are not exposed in current optimizer panel controls.
- Capital Timeline override CRUD exists in API/backend; current timeline client only captures horizon and rerun.
- Home Score correction submission endpoints exist in API/backend and API client, but no active correction input form was found on the current Home Score page.
- Home Timeline create/update event APIs exist, but the current timeline page is read/filter/replay oriented.
