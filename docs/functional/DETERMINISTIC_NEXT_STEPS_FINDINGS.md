# Deterministic Next Steps Findings

## Scope
This document captures findings from reviewing the dashboard screenshots and tracing the backend/frontend guidance engine implementation.

## Questions Answered
1. For `Cost Of Inaction Risk - Financial`, which item is this shown for?
2. In `View full journey`, how are steps determined?
3. Are steps hardcoded for all journeys?
4. What are all journey step sequences?
5. What is the deterministic next-step logic across cases?

## Executive Summary
- `Cost Of Inaction Risk - Financial` is a journey title composed from signal family + issue domain, not a direct item label.
- For financial flows (`do-nothing`, `home-savings`, `true-cost`), scope is commonly property-level unless an existing item-scoped journey is explicitly passed.
- `View full journey` step order comes from static journey templates in backend.
- Step labels shown in UI are polished via a copy map (for example, `compare_action_options` -> `Compare Act Now vs Delay`).
- Step state (`Completed`, `Pending`, current step, warnings, blocked state) is dynamic and computed deterministically from status + prerequisites.

## Detailed Findings

### 1) `Cost Of Inaction Risk - Financial` scope and meaning
- The card title is generated as:
  - `signalIntentFamily (formatted)` + ` - ` + `issueDomain (formatted)`
- So `Cost Of Inaction Risk - Financial` means:
  - signal family: `cost_of_inaction_risk`
  - issue domain: `FINANCIAL`
- The title itself does not include inventory item or home asset name.

Code references:
- `buildJourneyTitle(...)`: `/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/features/guidance/utils/guidanceDisplay.ts:114`
- `title` wiring into action model: `/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/features/guidance/utils/guidanceMappers.ts:75`

Scope resolution details:
- Signal dedupe scope uses: `inventoryItemId ?? homeAssetId ?? sourceEntityId ?? PROPERTY`.
- Duplicate-group scope uses: `inventoryItemId ?? homeAssetId ?? PROPERTY`.
- Financial tool completion hooks typically send only `propertyId` and `journeyId?`, not `inventoryItemId`.

Code references:
- Dedupe scope logic: `/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/guidanceEngine/guidanceSignalResolver.service.ts:135`
- Group scope logic: `/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/guidanceEngine/guidanceSignalResolver.service.ts:147`
- Do-nothing completion hook: `/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/controllers/doNothingSimulator.controller.ts:156`
- Home-savings completion hook: `/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/controllers/homeSavings.controller.ts:110`
- True-cost completion hook: `/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/controllers/trueCostOwnership.controller.ts:46`

Conclusion:
- In the shown dashboard context, this financial journey is most likely property-level unless it was opened from an item-specific journey context.

### 2) How `View full journey` steps are determined
- The drawer uses journey detail API and renders the journey's ordered steps.
- Backend ensures template steps exist in deterministic `stepOrder`.
- Frontend displays that order directly.

Code references:
- Open drawer + load journey details: `/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/guidance/GuidanceDrawer.tsx:25`
- Render ordered steps in drawer: `/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/guidance/GuidanceStepList.tsx:20`
- Ensure template steps in DB with `stepOrder`: `/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/guidanceEngine/guidanceStepResolver.service.ts:63`

### 3) Why these exact financial labels appear
The raw financial template step keys are:
- `estimate_out_of_pocket_cost`
- `compare_action_options`
- `evaluate_savings_funding`
- `route_financial_plan`

They are polished for UI copy to:
- `Estimate Out-of-Pocket Cost`
- `Compare Act Now vs Delay`
- `Review Savings and Funding Options`
- `Plan Capital Timeline`

Code references:
- Financial template: `/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/guidanceEngine/guidanceTemplateRegistry.ts:305`
- Step label copy map: `/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/guidanceEngine/guidanceCopy.service.ts:15`
- Step copy applied in journey enrichment: `/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/guidanceEngine/guidanceJourney.service.ts:85`

### 4) Are steps hardcoded for all journeys?
Yes.
- Step sequences are template-defined in `guidanceTemplateRegistry.ts`.
- Signals map to template by `signalIntentFamily`.
- A fallback generic template is used when no family match exists.

Code references:
- Templates registry root: `/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/guidanceEngine/guidanceTemplateRegistry.ts:3`
- Match by family: `/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/guidanceEngine/guidanceTemplateRegistry.ts:410`
- Generic fallback template: `/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/guidanceEngine/guidanceTemplateRegistry.ts:372`

## All Journeys and Ordered Steps

### A) `asset_lifecycle_resolution`
Signal families:
- `lifecycle_end_or_past_life`
- `maintenance_failure_risk`

Ordered steps:
1. `repair_replace_decision` -> Compare Repair vs Replace
2. `check_coverage` -> Check Coverage First
3. `validate_price` -> Validate Price Before Hiring
4. `prepare_negotiation` -> Prepare Negotiation Strategy (optional)
5. `book_service` -> Book Service When Ready

Ref: `/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/guidanceEngine/guidanceTemplateRegistry.ts:5`

### B) `coverage_gap_resolution`
Signal families:
- `coverage_gap`
- `coverage_lapse_detected`

Ordered steps:
1. `check_coverage` -> Check Coverage First
2. `estimate_exposure` -> Estimate Uncovered Exposure
3. `compare_coverage_options` -> Compare Coverage Options
4. `update_policy_or_documents` -> Update Policy or Upload Documents

Ref: `/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/guidanceEngine/guidanceTemplateRegistry.ts:83`

### C) `recall_safety_resolution`
Signal family:
- `recall_detected`

Ordered steps:
1. `safety_alert` -> Review Safety Alert
2. `review_remedy_instructions` -> Review Remedy Instructions
3. `recall_resolution` -> Confirm Recall Resolution

Ref: `/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/guidanceEngine/guidanceTemplateRegistry.ts:146`

### D) `weather_risk_resolution`
Signal family:
- `freeze_risk`

Ordered steps:
1. `weather_safety_check` -> Review weather risk details
2. `protect_exposed_systems` -> Protect exposed systems
3. `schedule_weather_followup` -> Schedule urgent weather follow-up (optional)

Ref: `/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/guidanceEngine/guidanceTemplateRegistry.ts:194`

### E) `inspection_followup_resolution`
Signal family:
- `inspection_followup_needed`

Ordered steps:
1. `assess_urgency` -> Assess Urgency First
2. `estimate_repair_cost` -> Estimate Repair Cost
3. `route_specialist` -> Route to the Right Specialist
4. `track_resolution` -> Track resolution completion

Ref: `/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/guidanceEngine/guidanceTemplateRegistry.ts:244`

### F) `financial_exposure_resolution`
Signal families:
- `financial_exposure`
- `cost_of_inaction_risk`

Ordered steps:
1. `estimate_out_of_pocket_cost` -> Estimate Out-of-Pocket Cost
2. `compare_action_options` -> Compare Act Now vs Delay
3. `evaluate_savings_funding` -> Review Savings and Funding Options
4. `route_financial_plan` -> Plan Capital Timeline (optional)

Ref: `/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/guidanceEngine/guidanceTemplateRegistry.ts:305`

### G) `generic_guidance_resolution` (fallback)
Signal family:
- `generic_actionable_signal`

Ordered steps:
1. `review_signal` -> Review Next Step / Review guidance signal

Ref: `/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/guidanceEngine/guidanceTemplateRegistry.ts:372`

## Deterministic Next-Step Logic (All Cases)

### Step lifecycle and transitions
- Allowed transitions are explicit (`PENDING` -> `IN_PROGRESS|COMPLETED|SKIPPED|BLOCKED`, etc.).
- Some required/critical steps cannot be completed without produced data.
- Skip policy is enforced per step (`DISALLOWED`, `DISCOURAGED`, `ALLOWED`).

Refs:
- Transition map: `/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/guidanceEngine/guidanceStepResolver.service.ts:14`
- Critical required steps: `/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/guidanceEngine/guidanceStepResolver.service.ts:22`
- Skip policy lookup: `/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/guidanceEngine/guidanceTemplateRegistry.ts:438`

### Current step and next step selection
- Current step = first step in ordered list with status in `PENDING | IN_PROGRESS | BLOCKED`.
- Next step returned to UI is the same as current actionable step.

Ref:
- Resolver selection: `/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/guidanceEngine/guidanceStepResolver.service.ts:513`

### Readiness determination
Readiness is computed in this order:
1. Any blocked step -> `NOT_READY`
2. No actionable step -> `TRACKING_ONLY`
3. Current step in `EXECUTION`:
   - if any earlier required step incomplete -> `NOT_READY`
   - else -> `READY`
4. Otherwise -> `NEEDS_CONTEXT`
5. If missing context exists and readiness was `READY`, downgrade to `NEEDS_CONTEXT`.

Ref:
- Readiness logic: `/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/guidanceEngine/guidanceStepResolver.service.ts:390`

### Journey completion
Journey status becomes `COMPLETED` only when:
- required steps are terminal,
- no required step is blocked,
- no critical required step remains incomplete.

Ref:
- Completion logic: `/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/guidanceEngine/guidanceStepResolver.service.ts:416`

## Screenshot-Specific UI Observations

### Observed behaviors that match code
- Header `Deterministic Next Steps` comes from dashboard page configuration.
- `View full journey` opens drawer and lists full ordered steps with status badges.
- `Needs Context` appears from execution readiness badge.
- `Severity Unknown` appears when severity is null.

Refs:
- Panel placement/title: `/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/page.tsx:565`
- Drawer behavior: `/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/guidance/GuidanceDrawer.tsx:23`
- Readiness/severity badge labels: `/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/guidance/GuidanceStatusBadge.tsx:52`

### Recommended UX improvements
1. Add scope label on card (`Property`, `Asset`, `Item`) to remove ambiguity for financial journeys.
2. Mark optional steps explicitly in list/strip and consider optional-aware progress percent.
3. For financial flows, consider deriving fallback severity so `Severity Unknown` is less frequent.

## Confirmed Answers to User Questions
- **For which item is `Cost Of Inaction Risk - Financial` shown?**
  - It is shown for the journey scope (item/asset/property). In the current financial tool path, it is commonly property-level unless a journey with item scope is already active.
- **How are `View full journey` steps determined?**
  - From the backend journey template for that signal family, with runtime step statuses.
- **Are steps hardcoded for all journeys?**
  - Yes, template-defined and deterministic; statuses/readiness are dynamic.
- **Review all journeys and provide steps?**
  - Provided above in "All Journeys and Ordered Steps."
- **Provide deterministic next-step logic for all cases?**
  - Provided above in "Deterministic Next-Step Logic (All Cases)."
