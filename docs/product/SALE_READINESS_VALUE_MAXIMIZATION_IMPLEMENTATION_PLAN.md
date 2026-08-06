# Sale Readiness Value-Maximization Checklist — Implementation Plan

Status: Draft for engineering sign-off. Not yet implemented.
Owner context: refines Slice 8 ("Sale Readiness case") of `HOME_CONTINUITY_AND_RECORDS_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md` after a scope correction — see §1.

## 1. Why this document exists

Slice 8 of the Home Continuity plan replaced the old per-user `SellerPrepPlan` static checklist with a shared `PropertySaleCase`, and it deliberately merged two things into one journey: (a) sale readiness driven by real property records, and (b) sale-transaction-lifecycle tracking (Preparing → Listed → Under contract → Closed) plus post-close ownership handoff. It also explicitly called for *removing* budget/timeframe-driven ROI task generation, calling the old approach "static tasks and ROI gamification," and replaced it with nothing that fills the same job — helping the homeowner actively increase what the home sells for.

Product review (2026-08-06) corrected this scope:

- **Seller Prep's job is readiness + return-maximization**, not transaction-status tracking. Listing, under-contract, and closing status belong on the platform the home is actually listed on (Zillow/Redfin, etc.), not here.
- The old ROI-task system this app removed was real and did something valuable — it just did it badly (same 4 generic tasks for every home, static ROI ranges, no connection to the actual property). Killing it lost the "help maximize return" capability entirely rather than fixing its actual flaw (genericness).
- This plan restores that capability, built the right way: grounded in real property data where possible, honestly labeled where it isn't, and gated by how much the app actually knows about a given property — not shown uniformly to everyone.

This document is scoped to the **value-maximization checklist** only. It assumes the two bug fixes below (already shipped/in-progress this session) as a starting point and does not re-litigate them.

## 2. Current state (as of 2026-08-06)

**Shipped, on `main` (commit `48b5766`):**
- `apps/backend/src/services/propertySaleCase.service.ts` — fixed `saleIntentConfirmed` to derive from `property.propertyUse === 'FOR_SALE'` instead of "does a `PropertySaleCase` row exist," so the Seller Prep → Sale Case handoff and the "Mark this home for sale" confirm gate both resolve correctly.
- `apps/frontend/.../tools/sale-case/SaleCaseClient.tsx` — "Back to property" now points at `/seller-prep` (its real entry point).

**Implemented, uncommitted (working tree as of this doc):**
- `apps/backend/src/modules/homeOperations/infrastructure/workItemRepository.ts` — `listWorkItemsForProperty` now includes `sources`.
- `apps/backend/src/modules/homeOperations/application/listWorkItems.usecase.ts` — exposes `hasExecutionBackedSource` per work item (true iff an active `EXECUTION`-role `OperationalWorkSource` exists, i.e. a real domain record like a `PropertyMaintenanceTask` backs the item, not just a proposed candidate).
- `apps/backend/src/services/propertySaleCase.service.ts` — `projectHomeActions` now excludes items where `obligationType === 'MAINTENANCE_TASK' && safetyTier === 'LOW_CONSEQUENCE' && !hasExecutionBackedSource` (forecast-driven weather advisories like "Multi-day heat risk ahead," which today are the only producer of that combination — see `homeActionSourcePromotion.service.ts`'s `adaptEnvironmentInsightsToHomeActions`).
- These three files should be committed before or alongside this work, since the new Tier 1 projectors below (§4.2) build on the same `projectHomeActions`/`listWorkItems` path.

**What `SaleReadinessItem` currently covers** (`propertySaleCase.service.ts`, `syncReadinessItems`): open inspection findings (non-informational only), open projects, unverified permits/unpermitted-work flags, open Home Actions, sale-relevant property records needing review, unfinalized/unverified/discontinued material specs, unverified significant timeline events. All are pure derivations — no static catalog, item title/detail text comes straight from the source record.

**What's retired and why** (commit `6e529a9`, "Retire the old Seller Prep static ROI checklist now that Sale Case is real"):
- `apps/backend/src/sellerPrep/engines/roiRules.engine.ts` (deleted) — `generateRoiChecklist()` returned 4 hardcoded tasks (interior paint, minor fixes, curb appeal, roof replacement) each with a static ROI range and cost bucket, identical for every property.
- `apps/backend/src/sellerPrep/engines/personalization.engine.ts` (deleted) — took a 5-question intake (`timeline`, `budget`, `propertyType`, `priority`, `condition`) and re-ranked the same static 4 tasks.
- `apps/frontend/src/components/seller-prep/SellerPrepIntakeForm.tsx`, `ProgressTimeline.tsx`, `useMilestones.ts` (deleted) — the intake wizard and self-reported completion-% tracker.
- Still present but feature-flag-gated off and disconnected from any task generation (`FEATURE_FLAGS.VALUE_ESTIMATOR` / `BUDGET_TRACKER`, default false): `apps/backend/src/sellerPrep/engines/valueCalculator.engine.ts`, `apps/frontend/src/components/seller-prep/BudgetTrackerCard.tsx`, `ValueEstimatorCard.tsx`. Disposition for these is an open question (§8).

## 3. Confirmed product decisions

1. Sale Case's transaction-lifecycle tracker (Preparing/Listed/Under contract/Closed) and its post-close "ownership transition" section (retention decisions, buyer package sharing, access revocation) are **kept but demoted** — not the page's primary focus, since the actual transaction is tracked elsewhere (Zillow/Redfin). Exact demotion treatment is UI work, not yet specified (§8).
2. The new checklist must be **derived/added to from data-driven insights**, not a static list — but "data-driven" explicitly includes homeowner self-report where no structured signal can ever exist (e.g. paint condition), as long as the self-report is real, durable, and drives actual task content — not just re-ranking a fixed list.
3. Task generation must **degrade gracefully for low-data properties** rather than going empty (the failure mode already observed live: a property with no findings/projects/permits showed only 2 weather-advisory cards before the fix in §2). The mix of data-derived vs. generic-fallback content should visibly vary with how much the app actually knows about the property.
4. Any question asked of the homeowner is **contextual/inline by default, not an upfront app-wide gate** — except scoped specifically to Seller Prep: if the curated question set is still unanswered when the homeowner opens Seller Prep, ask it there, upfront, before/alongside the checklist (a tool-scoped intake, not a global one).
5. The question set is a **small, fixed, curated catalog** (same shape as the seasonal checklist's fixed template catalog — see §4.3), not ad hoc or open-ended. Each question maps to exactly one task/category so every answer has a traceable payoff (unlike the old wizard's vague `condition` catch-all).
6. **"Confirm what we know" is reserved for genuine direct evidence of the actual fact being asked** (a prior saved answer, a real inspection assessment of that exact area, or — for the upgrades question — a completed project/material/event record that *is itself* the fact). A weak or indirect proxy (e.g. a material's install date, used to imply current condition) must **not** drive a confirm-style prompt — ask fresh via a dedicated new field instead of inferring from adjacent data. Do not avoid adding new fields to prevent this.
7. Answers are stored as **durable property facts**, reusable elsewhere in the app, not a one-off wizard payload read by only this feature.

## 4. Detailed design

### 4.1 Category taxonomy and the "safe to generalize" boundary

Reuse the existing `SaleReadinessCategory` enum (`schema.prisma`): `SAFETY_STRUCTURAL`, `SYSTEMS_MAINTENANCE`, `PERMITS_DISCLOSURE`, `FINANCIAL_DECISION`, `DOCUMENTATION_RECORDS`, `PRESENTATION`.

**Only `PRESENTATION` is safe to generalize.** There is and never will be a structured field for "wall paint condition" in this schema, and a wrong generic guess here is low-stakes (worst case: a suggestion that doesn't apply). `SAFETY_STRUCTURAL`, `FINANCIAL_DECISION`, and `PERMITS_DISCLOSURE` must never get a generic/guessed item — asserting "your roof might need replacing" with zero evidence is actively misleading. For those categories, absence of data means either silence or a data-collection prompt (open question, §8), never a generic claim.

### 4.2 Tier 1 — extend the existing pure-derivation projectors

Add new projector functions to `propertySaleCase.service.ts` alongside the existing seven (`projectInspectionFindings`, `projectProjects`, `projectPermits`, `projectHomeActions`, `projectRecords`, `projectMaterialSpecs`, `projectTimelineEvents`), following the same `ProjectedItem` contract (title/detail text generated directly from the source record, no template text):

- **Aging/near-end-of-life systems** — from `InventoryItem` age vs. expected lifespan (data source TBD — check whether an existing lifespan reference table already exists, e.g. via `maintenancePrediction.service.ts`, which does inventory-age-driven prediction but is currently unwired from anything; may be reusable here).
- **Low-severity inspection findings** — today `projectInspectionFindings` explicitly excludes `severity: 'INFORMATIONAL'`. Add a second projector (or parameterize the existing one) to surface `INFORMATIONAL`/minor findings under `PRESENTATION`/`OPTIONAL_IMPROVEMENT` rather than dropping them, since a minor cosmetic finding is exactly the kind of thing relevant to maximizing sale price even though it's not a "blocker."
- **Lapsed routine maintenance relevant to marketability** — e.g. overdue HVAC servicing, via `PropertyMaintenanceTask`.
- **Expiring/transferable warranties worth highlighting** — a positive-signal item, not a gap (see §4.5's "notable upgrades" question, which should pull from the same underlying records).

All Tier 1 items should apply the same weather-advisory exclusion logic already added in §2 where relevant (i.e. any new Home-Action-sourced projector should also filter `isWeatherAdvisoryOnly`).

### 4.3 Tier 2 — curated cosmetic catalog, coverage-gated per category

A small, fixed catalog (mirrors the seasonal checklist's `SeasonalTaskTemplate` structure — see `apps/backend/src/data/seasonalTaskTemplates.json` and `apps/backend/prisma/seasonalTasks.seed.ts` for the precedent pattern) covering only `PRESENTATION`-safe categories: interior paint, curb appeal/landscaping, flooring, kitchen, bathrooms, decluttering/staging.

**Per-category selection logic** (evaluated once per property, at checklist generation/refresh time):

```
for each PRESENTATION category C:
  if a Tier 1 item already exists for C:
    show the Tier 1 item; do not also show a generic C item (no duplicate/conflicting advice)
  else if direct evidence exists for C (prior saved fact, or a real inspection
      assessment of that exact area):
    show a personalized item using that evidence, framed as "confirm current state,"
    not as a claim the system already knows the current condition
  else if the homeowner has answered the corresponding curated question (§4.5):
    show a personalized item using that self-reported answer
  else:
    show the generic, clearly-labeled fallback item for C
    ("general guidance — not verified against your records")
```

This is the concrete mechanism behind "the mix should vary with data quality": a property with rich inspection/project history will surface almost entirely Tier 1 + confirmed-self-report items; a brand-new/inactive property will surface mostly labeled generic fallbacks, never silently pretending to be personalized.

ROI% range and cost-bucket reference numbers for the generic fallback content: reuse the retired `roiRules.engine.ts` benchmark data (recoverable via `git show 6e529a9^:apps/backend/src/sellerPrep/engines/roiRules.engine.ts`) as static reference content only — not its generation/ranking logic, which is what got retired for being generic. **Open question, §8**: confirm reuse vs. fresh content.

### 4.4 Category decision logic — summary table

| Category | Tier 1 (data-derived) source | Confirm-eligible signal | Fallback if none of the above |
|---|---|---|---|
| Kitchen condition | Completed kitchen `ProjectRecord` | Real `InspectionFinding` on kitchen, or prior answer | Ask fresh (curated question) |
| Bathroom condition | Completed bath `ProjectRecord` | Real `InspectionFinding` on bathroom, or prior answer | Ask fresh |
| Flooring condition | Flooring `ProjectRecord`/`MaterialSpec` | Real `InspectionFinding`, or prior answer | Ask fresh |
| Paint condition | Rare `HomeEvent` ("painted...") if logged | Prior answer only (inspections rarely grade cosmetics) | Ask fresh |
| Curb appeal/landscaping | Rarely tracked | Prior answer only | Ask fresh |
| Decluttering/staging readiness | Never tracked (pure intent) | Prior answer only | Ask fresh |
| Notable upgrades to highlight | `ProjectRecord` + `MaterialSpec` + `HomeEvent` history | **This is direct evidence itself** — pre-populate candidates, ask user to confirm/select | N/A (always at least confirm-eligible if any history exists) |
| Budget for prep work | Never derivable from property data | Prior answer only | Ask fresh |
| Timeline | `PropertySaleCase.targetListDate` (already exists) | N/A — already a real field | N/A |

### 4.5 Curated question catalog (draft — pending final content sign-off, §8)

1. Interior paint/wall condition — *Fresh / Some wear / Needs a refresh*
2. Exterior curb appeal & landscaping — *Fresh / Some wear / Needs a refresh*
3. Flooring condition — *Fresh / Some wear / Needs a refresh*
4. Kitchen — *Recently updated / Dated but functional / Needs work*
5. Bathrooms — *Recently updated / Dated but functional / Needs work*
6. Decluttering & staging readiness — *Ready to show / Needs some work / Needs significant work*
7. Budget available for pre-sale prep work — feeds ranking (§4.7)
8. Notable recent upgrades worth highlighting — pre-populated pick-list from `ProjectRecord`/`MaterialSpec`/`HomeEvent`, not free text (see §4.4)

Presentation rule: each question is short, single-select (except #8), and asked only if unanswered — see §4.6 for where the answer lives once given.

### 4.6 Fact storage

Answers persist as **durable property facts**, not a Sale-Case-local payload, so they're reusable by any other feature and don't need re-asking once given (only re-surfaced for confirmation if something changes, e.g. a new project gets logged after the last confirmed state).

**Open technical question, not yet resolved (§8):** the existing property-context fact system (`apps/backend/src/modules/propertyContext/` — `catalog/factCatalog.ts`, `application/getPropertyContext.ts`, `infrastructure/prismaAssemblers.ts`) assembles facts under fixed scopes (`LOCATION, STRUCTURE, EXTERIOR, RESPONSIBILITY, SYSTEMS, SAFETY, MAINTENANCE`). It's unconfirmed whether these are backed by a generic key-value fact table (cheap to extend with new keys like `paintCondition`) or by dedicated typed Prisma columns per fact (each new fact = a schema change). This needs a short investigation spike before implementation — it changes both the schema-change surface area and whether a new scope (e.g. `PRESENTATION` or `SALE_PREP`) needs to be added to the catalog.

### 4.7 Budget and timeline handling

- **Timeline**: reuse `PropertySaleCase.targetListDate` (already exists — no new field). Used to deprioritize/hide tasks whose typical lead time won't fit before the target date.
- **Budget**: no field exists today. Add one to `PropertySaleCase` (exact shape — cents integer vs. bucketed enum — TBD, lean toward a bucketed enum matching `valueCalculator.engine.ts`'s existing bucket convention `0-5k/5-15k/...` for consistency with the flag-gated remnant, if that engine is kept). Used to rank tasks by ROI-per-dollar within budget, and to deprioritize/flag over-budget tasks rather than hide them outright.

### 4.8 Status tracking

**Recommended**: route generated tasks through the existing Home Actions / `OperationalWorkItem` lifecycle (`apps/backend/src/modules/homeOperations/`), the same system every other actionable item in the app uses — real state machine (`CANDIDATE → ... → CLOSED/VERIFIED`), `acceptanceState` (`PROPOSED/ACCEPTED/DECLINED`), not a self-reported completion percentage (explicitly the anti-pattern the old system used and Slice 8's own docstring calls out: *"reflects real property work and records, not generic tasks or self-reported completion percentages"*). This means these items also surface in the general Home Operations feed, not just Sale Case — flagged as an open question (§8) since that widens visibility scope beyond originally discussed.

**Alternative**: a lightweight status field scoped only to `SaleReadinessItem`/`PropertySaleCase`, not integrated with Home Operations. Simpler, more isolated, but reintroduces a second, parallel completion-tracking concept alongside the one that already exists.

### 4.9 UI placement

New "Maximize your return" section, visually distinct from the existing compliance-oriented requirement-class groupings (Material blocker / Verification needed / Professional decision / Optional improvement / Presentation) on the Sale Case page (`SaleCaseClient.tsx`), or on the Seller Prep overview page (`SellerPrepOverview.tsx`) — **exact placement not yet decided, §8**, since these are two distinct pages today (Seller Prep is the entry point with Finance/Market/Agents tabs; Sale Case is where readiness items currently render).

Given decision §3.1 (demote the transaction tracker), the Sale Case page's visual hierarchy needs rework regardless: transaction status chip + advance-stage button move down/secondary, and either the readiness items or the new value-maximization section becomes the primary above-the-fold content.

## 5. Technical architecture — file-level plan

### Backend
- `apps/backend/src/services/propertySaleCase.service.ts` — add new Tier 1 projectors (§4.2); add Tier 2 catalog evaluation + per-category gating logic (§4.3/§4.4); extend `syncReadinessItems` to call both.
- `apps/backend/src/data/` — new static catalog file for the Tier 2 cosmetic categories (mirrors `seasonalTaskTemplates.json`'s pattern), including reference ROI%/cost-bucket content (pending §8 sign-off on source).
- `apps/backend/src/modules/propertyContext/` — extend fact catalog with new fact keys once §4.6's storage-mechanism question is resolved.
- `apps/backend/prisma/schema.prisma` — add budget field to `PropertySaleCase` (§4.7); add any new fact-storage schema needed (§4.6); no migration scripts — edit schema directly, `npx prisma db push` run manually by the user per project convention.
- If Home Actions integration is chosen (§4.8): new source adapter(s) in `apps/backend/src/services/homeActionSourcePromotion.service.ts` / `apps/backend/src/productFramework/homeActionSourceAdapters.ts`, following the existing adapter pattern (`adaptHomeActionSource`).

### Frontend
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/sale-case/SaleCaseClient.tsx` (and/or `SellerPrepOverview.tsx`, pending §4.9) — new "Maximize your return" section; transaction-tracker demotion.
- New inline question components for the curated catalog (§4.5), including the pre-populated pick-list variant for "notable upgrades."
- `saleCaseApi.ts` / `types.ts` — extend for new item categories, budget field, and question-answer endpoints.

## 6. Dependencies

- Weather-advisory exclusion fix (§2) should be committed first — new Home-Action-sourced projectors build on the same filtered path.
- §4.6's fact-storage investigation must resolve before any new fact keys are added — determines schema-change surface area.
- If Tier 1's "aging systems" projector uses `maintenancePrediction.service.ts`, that service needs review — it's currently unwired from any live feature; confirm it's fit for reuse rather than dead/stale logic.
- Recovering `roiRules.engine.ts` reference data (if reused, §8) requires pulling from git history (`git show 6e529a9^:...`), not the live tree.
- Home Operations integration (if chosen, §4.8) has a wider blast radius than Sale Case alone — new item types will appear in the general Home Operations feed and should be reviewed against that feed's existing UX assumptions.

## 7. Assumptions

- The existing `SaleReadinessCategory`/`SaleReadinessRequirementClass`/`SaleReadinessItem` model is extended, not replaced — no new parallel readiness-item system.
- "Confirm-eligible" evidence is limited to what's listed in §4.4's table; no other proxy signals are used to fake confirmation, per §3.6.
- The flag-gated `BudgetTrackerCard.tsx`/`ValueEstimatorCard.tsx`/`valueCalculator.engine.ts` remnants are out of scope to activate or delete in this pass unless §8 decides otherwise — they stay flagged-off as-is.
- No changes to the sale-transaction lifecycle mechanics themselves (Preparing/Listed/Under contract/Closed transitions, ownership-transition flow) beyond visual demotion — the underlying logic fixed in §2 stays as-is.

## 8. Open questions requiring sign-off

1. **No-data handling for unsafe-to-generalize categories** (`SAFETY_STRUCTURAL`/`FINANCIAL_DECISION`/`PERMITS_DISCLOSURE`) — stay fully silent when no data exists, or show a soft prompt to add data (e.g. "Log a roof inspection to check this")?
2. **Tier 2 reference content source** — reuse the retired `roiRules.engine.ts` ROI%/cost-bucket numbers, or write fresh content?
3. **Status tracking mechanism** — Home Actions/`OperationalWorkItem` integration (visible in Home Operations feed too) vs. a lightweight tracker scoped only to Sale Case (§4.8)?
4. **Question catalog final content** — sign off on the 8 questions in §4.5 (wording, scale options, any to add/drop)?
5. **Exact UI copy** for "confirm known signal" vs. "ask fresh" vs. "generic labeled fallback" cards — needs a content pass distinguishing these three states clearly to the homeowner.
6. **Page placement** (§4.9) — does the new section live on Sale Case, Seller Prep overview, or split across both?
7. **Transaction-tracker demotion** — what does "demote" mean concretely in UI terms (moved lower, smaller visual treatment, collapsed behind a toggle)?
8. **Budget field shape** — bucketed enum (matching `valueCalculator.engine.ts`'s existing buckets) vs. a raw cents integer?
9. **Disposition of the flag-gated remnants** (`BudgetTrackerCard.tsx`, `ValueEstimatorCard.tsx`, `valueCalculator.engine.ts`) — leave as dead-flagged code, repurpose into this feature, or remove?

## 9. Out of scope (this pass)

- Any change to the sale-transaction lifecycle state machine itself.
- Real (non-benchmark) ROI prediction tied to actual local comps/market data.
- Full re-onboarding of basic property details (beds/baths/sqft/systems) — this feature only asks its own net-new curated questions, never re-collects what onboarding already captured.
- Activating or removing the flag-gated Budget/Value cards (pending §8.9).

## 10. Suggested phasing

1. Commit the uncommitted weather-advisory fix (§2).
2. Resolve open questions §8.1–§8.9 (or explicitly time-box/default them).
3. Fact-storage spike (§4.6) — required before any question/answer UI can be built.
4. Backend: Tier 1 new projectors (§4.2) — lowest risk, extends an existing, proven pattern.
5. Backend: Tier 2 catalog + gating logic (§4.3/§4.4), budget field, question/answer storage and endpoints.
6. Frontend: curated question components, "Maximize your return" section, transaction-tracker demotion.
7. End-to-end verification across three data-richness scenarios: a rich property (many findings/projects/records), a sparse/new property (little to no data), and a partially-answered property (some questions answered, some not) — confirm the mix of Tier 1 / confirmed / generic-fallback content behaves as designed in each.
