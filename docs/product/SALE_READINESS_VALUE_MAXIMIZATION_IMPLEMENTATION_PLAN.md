# Sale Readiness Value-Maximization Checklist — Implementation Plan

Status: Design fully resolved 2026-08-06 (all 10 open questions in §8 closed). Ready for implementation per §10's phasing. Not yet implemented.
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
- Still present but feature-flag-gated off and disconnected from any task generation (`FEATURE_FLAGS.VALUE_ESTIMATOR` / `BUDGET_TRACKER`, default false): `apps/backend/src/sellerPrep/engines/valueCalculator.engine.ts`, `apps/frontend/src/components/seller-prep/BudgetTrackerCard.tsx`, `ValueEstimatorCard.tsx`. **Resolved 2026-08-06, see §8.9: remove outright** as part of this work, same treatment as the rest of this list — they're built against the old static-checklist item shape, which no longer exists once Tier 1/Tier 2 (§4.2/§4.3) ship.

## 3. Confirmed product decisions

1. Sale Case's transaction-lifecycle tracker (Preparing/Listed/Under contract/Closed) and its post-close "ownership transition" section (retention decisions, buyer package sharing, access revocation) are **kept but demoted** — not the page's primary focus, since the actual transaction is tracked elsewhere (Zillow/Redfin). Demotion treatment resolved 2026-08-06, see §4.9a: moved to the bottom of the page, visually muted, not collapsed/hidden.
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

**ROI%/cost-bucket reference content: resolved 2026-08-06 — write fresh, properly sourced content for all 6 categories, do not reuse `roiRules.engine.ts`'s numbers.** That retired file (recovered via `git show 6e529a9^:apps/backend/src/sellerPrep/engines/roiRules.engine.ts`) only had 4 items: `INTERIOR_PAINT` (70–110% ROI), `MINOR_FIXES` (80–120%), `CURB_APPEAL` (60–90%), `ROOF_REPLACEMENT` (40–70%) — none cited a source. Rejected for three reasons:
- `ROOF_REPLACEMENT` is a `SAFETY_STRUCTURAL` item shown generically with zero evidence — exactly the anti-pattern §4.1 rules out ("your roof might need replacing" with nothing backing it). Roof condition must only ever surface through real evidence (§4.4a), never a generic Tier 2 fallback.
- `MINOR_FIXES` doesn't map to any category in the new catalog (§4.5) — too vague, same ambiguity problem.
- Only paint and curb appeal overlap with the new 6-category catalog at all; flooring/kitchen/bathrooms/staging have no prior art regardless, and none of the 4 old numbers had a cited source to justify carrying forward even where categories matched.

New content must cite a real source (e.g. a remodeling cost-vs-value report), matching the "View data sources" disclaimer convention already present on the page.

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

### 4.4a No-data handling for unsafe-to-generalize categories (resolved — was open question #1)

For `SAFETY_STRUCTURAL`, `FINANCIAL_DECISION`, and `PERMITS_DISCLOSURE` categories (e.g. roof condition), before concluding "no data," broaden the evidence search beyond the canonical `InspectionFinding` path to check for a completed, **sufficiently detailed** record across:

- `InspectionFinding` (already covered by existing projectors)
- `PropertyMaintenanceTask` (e.g. a completed "Roof inspection" task)
- `ProjectRecord` (e.g. a completed roof-related project)
- `PropertyRecord` documents (an uploaded inspection report/warranty)
- `HomeEvent` timeline

"Sufficiently detailed" needs a concrete bar, not just `status === COMPLETED` — e.g. a non-trivial notes/description field, an actual outcome/condition mentioned, or an attached document. A task titled "Roof inspection, completed" with no notes is the same weak-proxy problem §3.6 already ruled out (an activity happened, but that's not the same as knowing the outcome) — not usable as evidence.

Resulting logic:

```
for a SAFETY_STRUCTURAL / FINANCIAL_DECISION / PERMITS_DISCLOSURE category C:
  search InspectionFinding, PropertyMaintenanceTask, ProjectRecord, PropertyRecord,
    HomeEvent for a completed record relevant to C
  if a match is found AND it has sufficient real detail (see bar above):
    show it as a real Tier 1 item — same trust model as existing inspection-finding
    items (direct display, sourced/linked back to the record, no confirm step needed,
    since it's already a real assessment, not a self-report)
  else (nothing found, or what's found lacks real detail):
    show a soft prompt to add data (e.g. "Log a roof inspection to check this") —
    never a generic guess for these categories
```

Exact "sufficient detail" heuristic (e.g. minimum notes length, required fields) is an implementation detail to nail down per source type during build, not specified further here.

### 4.4b Mandatory baseline facts and the Seller Prep entry flow (resolved 2026-08-06)

A small, fixed set of foundational facts materially improves checklist accuracy across *multiple* categories at once — higher leverage than the narrower per-category evidence search in §4.4a, so it gets a dedicated upfront moment rather than scattered inline prompts. **Schema check confirms none of these need new fields** — all already exist on `Property`/`InventoryItem`/`Warranty`; the gap is population, not schema:

| Mandatory fact | Existing field | Completeness bar |
|---|---|---|
| Roof age | `Property.roofReplacementYear` (+ `roofType`) | Non-null |
| HVAC age | `Property.hvacInstallYear` (+ `heatingType`/`coolingType`) | Non-null |
| Water heater age | `Property.waterHeaterInstallYear` (+ `waterHeaterType`) | Non-null |
| Electrical panel age | `Property.electricalPanelAge` | Non-null |
| Key appliance details | `InventoryItem.installedOn`/`purchasedOn`/`condition` | At least one relevant item logged with these populated — not full inventory completeness |
| Warranty info | `Warranty` (via `Property.warranties` / `InventoryItem.warrantyId`) | At least one relevant record present |

**Entry flow**, triggered when the homeowner opens Seller Prep (the landing page, not Sale Case — see §4.9 for the page-placement decision this depends on):

1. Show a "Collecting details, preparing your checklist…" loading state, on Seller Prep, while the backend evaluates Tier 1 derivation (§4.2), per-category evidence search (§4.4a), and mandatory-fact coverage (above).
2. **All mandatory facts present** → forward straight to Sale Case, where the generated checklist renders, no interruption. The common case once a property has been through this once, since facts persist durably (§3.7) — this flow only fires again if something is genuinely still missing.
3. **Split by data shape, not a count threshold (resolved 2026-08-06, replaces the earlier ≤3/>3 assumption):** the 6 mandatory facts aren't uniform in collection cost, so gate on what each one actually is, not how many are missing —
   - **Roof age, HVAC age, water heater age, electrical panel age** are each a single scalar `Property` field (a year/dropdown value) — trivially light to collect, however many of the 4 are missing. Always collected **inline, right on Seller Prep**, one quick form, before forwarding to Sale Case.
   - **Key appliance details** and **warranty info** are full record creations (`InventoryItem`/`Warranty`, each with several fields), not single values — cramming that inline would be worse than the app's existing purpose-built flows. Any gap here is **always routed to the existing Inventory/Warranty add-flow**, deep-linked, reusing the property-edit-flow consistency work (commit `10e561e`, "wire blind edit links to real anchors") — never a generic edit page.
   - If both kinds are missing at once, the inline scalar form and the Inventory/Warranty routing card both appear together, not as sequential steps.
4. Return the user to Seller Prep automatically once any redirected flow is saved, which then re-runs this evaluation and forwards to Sale Case once everything's satisfied.

This entry flow only concerns the mandatory set above. Narrower, per-category gaps (§4.4a), the cosmetic self-report question card (§4.5), and the new "Maximize your return" section itself all render on Sale Case (§4.9), not Seller Prep — Seller Prep's role is strictly the landing page and this gate.

### 4.5 Curated question catalog (content confirmed 2026-08-06 — exact wording/copy still pending, §8.5)

Structural content locked as-is, 8 questions, no additions/splits (exterior-paint-vs-landscaping split and a general cleanliness/odor question were both considered and deliberately left out — the former for conciseness, the latter for tone risk). Note #7 (budget) is structurally different from the other seven: it doesn't personalize/replace one specific fallback item the way 1-6 and 8 do (§3.5's "one question, one task" rule) — it instead feeds ranking/filtering across the whole list (§4.7). Still presented in the same grouped card, just behaves differently once answered.

1. Interior paint/wall condition — *Fresh / Some wear / Needs a refresh*
2. Exterior curb appeal & landscaping — *Fresh / Some wear / Needs a refresh*
3. Flooring condition — *Fresh / Some wear / Needs a refresh*
4. Kitchen — *Recently updated / Dated but functional / Needs work*
5. Bathrooms — *Recently updated / Dated but functional / Needs work*
6. Decluttering & staging readiness — *Ready to show / Needs some work / Needs significant work*
7. Budget available for pre-sale prep work — feeds ranking (§4.7)
8. Notable recent upgrades worth highlighting — pre-populated pick-list from `ProjectRecord`/`MaterialSpec`/`HomeEvent`, not free text (see §4.4)

Each question is short, single-select (except #8, multi-select pick-list), and asked only if unanswered — see §4.6 for where the answer lives once given.

**Presentation mechanism (resolved 2026-08-06):** deliberately distinct from §4.4b's entry flow — these are self-reported opinions, not required setup data, so they never gate or redirect. One compact, grouped card, **"A few quick questions to personalize your checklist,"** placed at the top of the "Maximize your return" section, on the same page the checklist itself renders on (exact page TBD, §8.6) — not a separate step, not scattered as individual per-item prompts across the checklist.

- Shows only currently-unanswered questions from the catalog above; each drops out of the card permanently once answered (persists as a durable fact, §4.6).
- Answering a question **immediately swaps** the corresponding generic fallback item elsewhere in the checklist for the personalized version, client-side, no reload — the visible, traceable payoff is what makes answering worth it (same "one question maps to one task" principle as §3.5).
- Fully skippable, never blocks checklist rendering. If skipped, the card collapses to a smaller nudge (e.g. "3 quick questions could sharpen your checklist") rather than disappearing entirely or re-interrupting on every visit.

### 4.6 Fact storage

Answers persist as **durable property facts**, not a Sale-Case-local payload, so they're reusable by any other feature and don't need re-asking once given (only re-surfaced for confirmation if something changes, e.g. a new project gets logged after the last confirmed state).

**Open technical question, not yet resolved (§8):** the existing property-context fact system (`apps/backend/src/modules/propertyContext/` — `catalog/factCatalog.ts`, `application/getPropertyContext.ts`, `infrastructure/prismaAssemblers.ts`) assembles facts under fixed scopes (`LOCATION, STRUCTURE, EXTERIOR, RESPONSIBILITY, SYSTEMS, SAFETY, MAINTENANCE`). It's unconfirmed whether these are backed by a generic key-value fact table (cheap to extend with new keys like `paintCondition`) or by dedicated typed Prisma columns per fact (each new fact = a schema change). This needs a short investigation spike before implementation — it changes both the schema-change surface area and whether a new scope (e.g. `PRESENTATION` or `SALE_PREP`) needs to be added to the catalog.

### 4.7 Budget and timeline handling

- **Timeline**: reuse `PropertySaleCase.targetListDate` (already exists — no new field). Used to deprioritize/hide tasks whose typical lead time won't fit before the target date.
- **Budget: resolved 2026-08-06.** No field exists today. Add `PropertySaleCase.budgetRange: SalePrepBudgetRange?`, a proper Prisma enum — not a raw cents integer, not a loose string:

```prisma
enum SalePrepBudgetRange {
  UNDER_5K
  FIVE_TO_15K
  FIFTEEN_TO_30K
  OVER_30K
}
```

  Matches the four buckets already defined (dormant) in `valueCalculator.engine.ts`'s `calculateBudgetAndValue` (`0-5k`/`5-15k`/`15-30k`/`30k+` → `totalBudget` 5000/15000/30000/50000), but typed as a real enum instead of that file's unvalidated string — consistent with how the rest of this schema is typed. Chosen over a raw integer for two reasons: keeps the budget question a single-select pill, matching all 7 other questions in the grouped card (§4.5), rather than the one lone numeric-entry field breaking that pattern; and avoids false precision — a pre-sale prep budget is a rough, forward-looking commitment, not a hard financial fact worth typing as an exact dollar figure. Used to rank tasks by ROI-per-dollar within budget, and to deprioritize/flag over-budget tasks rather than hide them outright.

### 4.8 Status tracking

**Resolved 2026-08-06: Option A — integrate with Home Actions / `OperationalWorkItem`.** Route generated tasks through the existing lifecycle (`apps/backend/src/modules/homeOperations/`), the same system every other actionable item in the app uses — real state machine (`CANDIDATE → ... → CLOSED/VERIFIED`), `acceptanceState` (`PROPOSED/ACCEPTED/DECLINED`), not a self-reported completion percentage. A standalone tracker would quietly reintroduce the exact anti-pattern Slice 8's own docstring rejects (*"reflects real property work and records, not generic tasks or self-reported completion percentages"*) in miniature, as a second parallel completion concept next to the one that already exists.

**Tagging mitigation (required, not optional):** these items also surface in the general Home Operations feed, not just Sale Case — which can genuinely help (a sale-prep task sitting alongside routine maintenance in the one place a homeowner already manages "everything to do on the house" is more likely to get done than a task siloed in a separate checklist), but only if it's clearly labeled. Add a **new Home Action source kind** (alongside the existing `MAINTENANCE`/`GUIDANCE`/`PROJECT`/`INCIDENT`/`RECALL`/`COVERAGE` in `WORK_ITEM_ELIGIBLE_SOURCE_KINDS`, `homeActionWorkItem.adapter.ts`) rather than overloading an existing one, so these items carry a distinguishable "Sale prep" badge/label wherever they render — never an unexplained task appearing out of context in the general feed.

### 4.9 UI placement (resolved 2026-08-06)

**Everything lives on Sale Case (`SaleCaseClient.tsx`) — one unified checklist, not split across pages.** The new "Maximize your return" section (visually distinct from the existing compliance-oriented requirement-class groupings — Material blocker / Verification needed / Professional decision / Optional improvement / Presentation) and the grouped question card (§4.5) both render there, alongside the existing readiness items. Rationale: Sale Case is already established as "the page where the actionable checklist renders" — splitting new content onto a different page than the existing readiness items would mean a homeowner has to check two places to see everything they should do before selling, working against the point of this feature. It also avoids compounding the double-page-hop friction that was the very first bug this session addressed (Seller Prep → "Open Sale Readiness" → a separate Sale Case page).

**Seller Prep overview (`SellerPrepOverview.tsx`) stays what it already is** — a landing/hub page (Finance/Market/Agents tabs, comps, agent comparisons; genuinely distinct tools, not checklist content) — plus it now also hosts the §4.4b mandatory-fact entry-flow gate before forwarding into Sale Case.

Given decision §3.1 (demote the transaction tracker), the Sale Case page's visual hierarchy needs rework regardless: transaction status chip + advance-stage button move down/secondary, and the readiness items + new value-maximization section become the primary above-the-fold content.

### 4.9a Transaction-tracker demotion (resolved 2026-08-06)

Moved to the bottom of the page, visually muted — **not** collapsed/hidden behind a toggle. Rationale: this session's consistent "never fully hide, never block" pattern (graceful degradation in §3.3, non-blocking gates in §4.4b, skippable-not-hidden questions in §4.5) argues against collapsing this away by default too — the tracker still does something genuinely useful (recording when the home actually goes live/under contract/closes, and the post-close ownership-transition flow), just not the page's primary job anymore.

Reordered `SaleCaseClient.tsx` layout, top to bottom:

1. Page intro
2. **Primary content** (above the fold): "Maximize your return" section + question card (§4.5), then the existing readiness items (Material blocker → Presentation groups)
3. "Compose agent package" stays with this primary content — it's a real readiness action, not transaction-status tracking
4. **Demoted, at the bottom**: a slim "Sale status" row — status chip + stage-advance button (e.g. "Mark as listed"), muted styling (smaller card, secondary text color, reusing the existing `mobile-text-secondary` token already used elsewhere on this page), with a short explanatory line — *"Track when this home goes live, under contract, and closes"* — so it reads as intentional, not orphaned
5. Post-close "Ownership transition" section stays attached to that same demoted area (only shown once status = Closed, as today)

### 4.10 UI copy (confirmed 2026-08-06)

Tone throughout is deliberately flat/factual — no exclamation points, no "hot tip" framing — matching this app's existing disclaimer style (e.g. the "ROI estimates are based on national averages... View data sources" copy already on the Seller Prep page) and avoiding the "ROI gamification" tone Slice 8 explicitly rejected in the old system.

**The 8 curated questions (§4.5), full phrasing:**

1. Paint — *"How does your interior paint and wall condition look right now?"* → Fresh / Some wear / Needs a refresh
2. Curb appeal — *"How would you describe your curb appeal and landscaping today?"* → Fresh / Some wear / Needs a refresh
3. Flooring — *"What's the current condition of your flooring?"* → Fresh / Some wear / Needs a refresh
4. Kitchen — *"How would you describe your kitchen?"* → Recently updated / Dated but functional / Needs work
5. Bathrooms — *"How would you describe your bathrooms?"* → Recently updated / Dated but functional / Needs work
6. Staging — *"How ready is your home to show to buyers today?"* → Ready to show / Needs some work / Needs significant work
7. Budget — *"What's your budget for pre-sale prep work?"* → Under $5k / $5k–15k / $15k–30k / $30k+ (maps to `SalePrepBudgetRange`, §4.7)
8. Upgrades — *"Any recent upgrades worth highlighting to buyers?"* → pre-populated checklist of detected upgrades + "add another"

**"Confirm known signal" card** (§4.4/§4.4a, real evidence found): phrased as "here's the last thing we know, what's true now," never implying the system already knows current condition (§3.6). Example: *"Your kitchen counters were installed in 2015, per your records. Still holding up well, or worth a touch-up before listing?"*

**"Generic labeled fallback" card** (§4.3, nothing known yet):
- Badge: *"General guidance — not verified against your records"*
- Body example: *"A fresh coat of neutral paint is one of the highest-return, lowest-cost improvements before listing. Estimated ROI: [range]% • Typical cost: [bucket]"*
- CTA: *"Tell us your paint condition →"* (jumps to that question in the grouped card, §4.5)

**Grouped question card** (§4.5):
- Expanded header: *"A few quick questions to personalize your checklist"*
- Subtext: *"Answering these swaps out general suggestions for advice based on your actual home."*
- Collapsed/skipped state: *"3 quick questions could sharpen your checklist"* with an "Answer now" link.

**§4.4a soft prompt** (unsafe-to-generalize category, no usable evidence): deliberately factual, no implied verdict. Example: *"We don't have enough information about your roof to check this — log an inspection to see if it affects your sale readiness."*

**§4.4b entry flow:**
- Loading state: *"Collecting your home's details and preparing your checklist…"*
- Redirect-to-Property-Edit: *"A few more details about your home will help us build an accurate, personalized checklist."*
- Inline-collect intro (≤3 missing): *"Just a couple more details before we build your checklist:"*

## 5. Technical architecture — file-level plan

### Backend
- `apps/backend/src/services/propertySaleCase.service.ts` — add new Tier 1 projectors (§4.2); add Tier 2 catalog evaluation + per-category gating logic (§4.3/§4.4); extend `syncReadinessItems` to call both.
- `apps/backend/src/data/` — new static catalog file for the Tier 2 cosmetic categories (mirrors `seasonalTaskTemplates.json`'s pattern), including fresh, sourced reference ROI%/cost-bucket content (§4.3).
- `apps/backend/src/modules/propertyContext/` — extend fact catalog with new fact keys once §4.6's storage-mechanism question is resolved.
- `apps/backend/prisma/schema.prisma` — add `enum SalePrepBudgetRange` + `PropertySaleCase.budgetRange` (§4.7); add any new fact-storage schema needed (§4.6); no migration scripts — edit schema directly, `npx prisma db push` run manually by the user per project convention.
- Home Actions integration (§4.8): new "Sale prep" source kind + adapter in `apps/backend/src/services/homeActionSourcePromotion.service.ts` / `apps/backend/src/productFramework/homeActionSourceAdapters.ts`, following the existing adapter pattern (`adaptHomeActionSource`); update `WORK_ITEM_ELIGIBLE_SOURCE_KINDS`/`resolveObligation`/`resolveSubject` in `homeActionWorkItem.adapter.ts`.
- Delete `apps/backend/src/sellerPrep/engines/valueCalculator.engine.ts` (§8.9).

### Frontend
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/sale-case/SaleCaseClient.tsx` — new "Maximize your return" section + question card (§4.5); transaction-tracker demotion/reorder (§4.9a). `SellerPrepOverview.tsx` gets only the §4.4b mandatory-fact entry-flow gate, not checklist content (§4.9).
- New inline question components for the curated catalog (§4.5), including the pre-populated pick-list variant for "notable upgrades."
- `saleCaseApi.ts` / `types.ts` — extend for new item categories, budget field, and question-answer endpoints.
- Delete `apps/frontend/src/components/seller-prep/BudgetTrackerCard.tsx`, `ValueEstimatorCard.tsx`, and their `FEATURE_FLAGS.VALUE_ESTIMATOR`/`BUDGET_TRACKER` references (§8.9).

## 6. Dependencies

- Weather-advisory exclusion fix (§2) should be committed first — new Home-Action-sourced projectors build on the same filtered path.
- §4.6's fact-storage investigation must resolve before any new fact keys are added — determines schema-change surface area.
- If Tier 1's "aging systems" projector uses `maintenancePrediction.service.ts`, that service needs review — it's currently unwired from any live feature; confirm it's fit for reuse rather than dead/stale logic.
- Tier 2 reference content (§4.3) needs fresh sourcing (a real remodeling cost-vs-value report or similar) before it can ship — not pulled from any existing code.
- Home Operations integration (§4.8, resolved) has a wider blast radius than Sale Case alone — new item types will appear in the general Home Operations feed and must carry the new "Sale prep" source-kind tag so they're reviewed against that feed's existing UX assumptions and don't appear unexplained.
- §4.8's new Home Action source kind requires updates to `WORK_ITEM_ELIGIBLE_SOURCE_KINDS`, `resolveObligation`/`resolveSubject` (`homeActionWorkItem.adapter.ts`), and the `HomeActionSourceKind` taxonomy (`productFramework/homeActionSourceAdapters.ts`) — same pattern as existing source kinds, but touches shared Home Actions infrastructure, not just Sale Case code.

## 7. Assumptions

- The existing `SaleReadinessCategory`/`SaleReadinessRequirementClass`/`SaleReadinessItem` model is extended, not replaced — no new parallel readiness-item system.
- "Confirm-eligible" evidence is limited to what's listed in §4.4's table; no other proxy signals are used to fake confirmation, per §3.6.
- The flag-gated `BudgetTrackerCard.tsx`/`ValueEstimatorCard.tsx`/`valueCalculator.engine.ts` remnants are removed as part of this work (§8.9, resolved) — not left dormant, not repurposed. Their aggregate cost/ROI-summation logic is deliberately not carried forward: summing several individual industry-average estimates into one aggregate "adds $X-$Y to your sale price" claim is a stronger, riskier, unreviewed claim than any single item's estimate, and isn't part of this design.
- No changes to the sale-transaction lifecycle mechanics themselves (Preparing/Listed/Under contract/Closed transitions, ownership-transition flow) beyond visual demotion — the underlying logic fixed in §2 stays as-is.

## 8. Open questions requiring sign-off

1. ~~No-data handling for unsafe-to-generalize categories~~ — **Resolved 2026-08-06, see §4.4a.** Broaden the evidence search across `InspectionFinding`/`PropertyMaintenanceTask`/`ProjectRecord`/`PropertyRecord`/`HomeEvent` before concluding "no data"; show a real Tier 1 item if a sufficiently detailed record is found, otherwise show a soft prompt to add data (never a generic guess for these categories).
2. ~~Tier 2 reference content source~~ — **Resolved 2026-08-06, see §4.3.** Write fresh, properly sourced content for all 6 categories; do not reuse `roiRules.engine.ts`'s numbers (unsourced, and one item — `ROOF_REPLACEMENT` — was the exact generic-safety-claim anti-pattern §4.1 rules out).
3. ~~Status tracking mechanism~~ — **Resolved 2026-08-06, see §4.8.** Home Actions/`OperationalWorkItem` integration, with a new dedicated Home Action source kind so these items carry a distinguishable "Sale prep" badge wherever they surface (including the general Home Operations feed).
4. ~~Question catalog final content~~ — **Resolved 2026-08-06, see §4.5.** Structural content (8 questions, categories, scale options) confirmed as-is; exact wording/copy still pending under #5 below.
5. ~~Exact UI copy~~ — **Resolved 2026-08-06, see §4.10.** Question wording, confirm/fallback/prompt card copy, entry-flow copy, and budget question's option labels all drafted and signed off.
6. ~~Page placement~~ — **Resolved 2026-08-06, see §4.9.** Everything (readiness items, new "Maximize your return" section, question card) renders on Sale Case; Seller Prep stays a landing page plus the §4.4b mandatory-fact gate.
7. ~~Transaction-tracker demotion~~ — **Resolved 2026-08-06, see §4.9a.** Moved to the bottom of the page, visually muted, not collapsed/hidden — consistent with the "never fully hide" pattern used elsewhere in this design.
8. ~~Budget field shape~~ — **Resolved 2026-08-06, see §4.7.** New `SalePrepBudgetRange` Prisma enum (`UNDER_5K`/`FIVE_TO_15K`/`FIFTEEN_TO_30K`/`OVER_30K`) on `PropertySaleCase.budgetRange` — typed, matching `valueCalculator.engine.ts`'s existing bucket convention rather than a raw cents integer.
9. ~~Disposition of the flag-gated remnants~~ — **Resolved 2026-08-06, see §2.** Remove `BudgetTrackerCard.tsx`, `ValueEstimatorCard.tsx`, `valueCalculator.engine.ts` outright — same treatment as the rest of the retired static-checklist code, not left dormant or repurposed (their aggregate-value-summation logic specifically excluded, §9/out-of-scope).
10. ~~§4.4b mandatory-fact threshold~~ — **Resolved 2026-08-06, see §4.4b.** Replaced the count-based ≤3/>3 assumption with a data-shape split: the 4 scalar `Property` fields (roof/HVAC/water heater/electrical age) always collected inline regardless of count; appliance-details/warranty gaps always routed to their existing Inventory/Warranty add-flows, never crammed inline.

**All 10 open questions resolved as of 2026-08-06.** This plan is ready to move into implementation per §10's phasing.

## 9. Out of scope (this pass)

- Any change to the sale-transaction lifecycle state machine itself.
- Real (non-benchmark) ROI prediction tied to actual local comps/market data.
- Full re-onboarding of basic property details (beds/baths/sqft/systems) — this feature only asks its own net-new curated questions, never re-collects what onboarding already captured.
- An aggregate "this checklist could add $X-$Y to your sale price" summary feature — deliberately not built as part of removing the flag-gated remnants (§8.9); would need its own dedicated design/sourcing pass if wanted later.

## 10. Implementation plan

All 10 design decisions in §8 are resolved. This is the concrete build sequence — phases are ordered by dependency (each phase assumes prior phases are done), not by priority; nothing here is speculative, every task cites the doc section that already specifies its behavior.

### Phase 0 — Prerequisites (do first, blocks everything else)

1. Commit the uncommitted weather-advisory fix (§2) — three files already modified (`workItemRepository.ts`, `listWorkItems.usecase.ts`, `propertySaleCase.service.ts`). New Tier 1 Home-Action projectors in Phase 2 build on this same filtered path.
2. **Fact-storage spike (§4.6)** — determine whether the property-context fact system (`apps/backend/src/modules/propertyContext/`) is backed by a generic key-value table (cheap to extend) or per-fact typed Prisma columns (each new fact = a schema change), and whether a new catalog scope is needed. This gates every self-reported fact in §4.5/§4.10 — cannot build the question/answer UI or storage until this is answered. Output: a confirmed storage shape for `paintCondition`, `curbAppealCondition`, `flooringCondition`, `kitchenCondition`, `bathroomCondition`, `stagingReadiness`.
3. Confirm `maintenancePrediction.service.ts`'s fitness for reuse in Phase 2's "aging systems" projector (§6) — it's currently unwired from any live feature; verify its logic isn't stale before building on it. If unfit, drop that specific projector from Phase 2's scope rather than block on it.
4. Source real citable content for Tier 2's 6 categories (§4.3, §8.2) — a remodeling cost-vs-value report or equivalent, matching the "View data sources" convention already on the page. Needed before Phase 3 can ship real (non-placeholder) reference content.

### Phase 1 — Schema (apps/backend/prisma/schema.prisma, edit directly, no migration scripts — user runs `npx prisma db push`)

1. `enum SalePrepBudgetRange { UNDER_5K, FIVE_TO_15K, FIFTEEN_TO_30K, OVER_30K }` + `PropertySaleCase.budgetRange SalePrepBudgetRange?` (§4.7, §8.8).
2. New Home Action source kind for Sale Prep tagging (§4.8, §8.3) — whatever schema-level enum/type change that requires in the Home Actions source-kind taxonomy.
3. Whatever Phase 0.2's fact-storage spike determined is needed for the 6 self-reported facts (§4.6).
4. Notify the user to run `npx prisma generate` + `npx prisma db push`, and `npx prisma generate` in `apps/workers/` — done manually per project convention, not by this plan.

### Phase 2 — Backend: Tier 1 projectors (`propertySaleCase.service.ts`, §4.2)

Lowest risk — extends the existing, proven pure-derivation projector pattern (`projectInspectionFindings`, `projectProjects`, etc.), no new UI dependency.

1. Broaden `projectInspectionFindings` (or add a parallel projector) to surface `INFORMATIONAL`/minor findings under `PRESENTATION`/`OPTIONAL_IMPROVEMENT` instead of dropping them.
2. New "aging/near-end-of-life systems" projector (from `InventoryItem`, if Phase 0.3 confirms `maintenancePrediction.service.ts` is fit for reuse).
3. New "lapsed routine maintenance" projector (`PropertyMaintenanceTask`).
4. New "expiring/transferable warranties" projector (positive-signal framing, not a gap).
5. §4.4a's broadened evidence search for `SAFETY_STRUCTURAL`/`FINANCIAL_DECISION`/`PERMITS_DISCLOSURE` categories — check `InspectionFinding`/`PropertyMaintenanceTask`/`ProjectRecord`/`PropertyRecord`/`HomeEvent` for a sufficiently detailed record before falling back to the soft "log an inspection" prompt (§4.10's copy).
6. All new Home-Action-sourced projectors apply the existing `isWeatherAdvisoryOnly` filter (§2).

### Phase 3 — Backend: Tier 2 catalog, gating, mandatory-fact evaluation, entry flow

1. New static catalog file (`apps/backend/src/data/`, mirrors `seasonalTaskTemplates.json`'s pattern) for the 6 `PRESENTATION` categories, with Phase 0.4's sourced reference content.
2. Per-category gating logic (§4.3/§4.4's decision table) in `propertySaleCase.service.ts`: Tier 1 item exists → show it; else genuine evidence (prior fact, real inspection assessment, or upgrade-history record) → confirm-style item; else self-reported answer exists → personalized item; else → generic labeled fallback.
3. Mandatory-fact coverage check (§4.4b) against the 6 fields confirmed in the schema check: `roofReplacementYear`, `hvacInstallYear`, `waterHeaterInstallYear`, `electricalPanelAge`, `InventoryItem` completeness, `Warranty` presence.
4. New endpoint(s) for the Seller Prep entry flow (§4.4b): evaluate coverage, return the scalar-fields-missing list (inline-collectible) separately from appliance/warranty gaps (routed to Inventory/Warranty).
5. New endpoint(s) for the grouped question card (§4.5): list unanswered questions, submit an answer (writes to the Phase 0.2 fact store), return the resulting swapped-in personalized item.
6. Notable-upgrades endpoint: pre-populate candidates from `ProjectRecord`/`MaterialSpec`/`HomeEvent`, accept a confirmed selection.
7. `syncReadinessItems` calls all of the above alongside the existing seven projectors.

### Phase 4 — Backend: Home Actions integration (§4.8)

1. New "Sale prep" source kind in `homeActionSourcePromotion.service.ts` / `productFramework/homeActionSourceAdapters.ts`, following the existing `adaptHomeActionSource` pattern.
2. Update `WORK_ITEM_ELIGIBLE_SOURCE_KINDS`, `resolveObligation`/`resolveSubject` in `homeActionWorkItem.adapter.ts` to route Tier 1/Tier 2 checklist tasks through the real `OperationalWorkItem` lifecycle, tagged so they're distinguishable in the general Home Operations feed.

### Phase 5 — Backend: cleanup (§8.9)

1. Delete `apps/backend/src/sellerPrep/engines/valueCalculator.engine.ts`.
2. Delete `apps/frontend/src/components/seller-prep/BudgetTrackerCard.tsx`, `ValueEstimatorCard.tsx`, and remove their `FEATURE_FLAGS.VALUE_ESTIMATOR`/`BUDGET_TRACKER` references.

### Phase 6 — Frontend: Seller Prep entry flow (§4.4b, on `SellerPrepOverview.tsx`/its page)

1. "Collecting your home's details and preparing your checklist…" loading state (§4.10) on open.
2. All-present case: forward straight to Sale Case, no interruption.
3. Scalar-fields-missing case: inline quick form (roof/HVAC/water heater/electrical age), then forward.
4. Appliance/warranty-missing case: routing card(s) deep-linking to Inventory/Warranty add-flows (reusing commit `10e561e`'s deep-link/return pattern), auto-return and re-evaluate on save.

### Phase 7 — Frontend: Sale Case page (`SaleCaseClient.tsx`, §4.9/§4.9a)

1. Reorder layout: page intro → "Maximize your return" section + grouped question card (§4.5) → existing readiness items (Material blocker → Presentation) → "Compose agent package" → demoted "Sale status" row (muted styling, `mobile-text-secondary` token, §4.10 copy) → post-close Ownership transition (unchanged, only if Closed).
2. Grouped question card (§4.10 copy): shows only unanswered questions, single-select pills (multi-select pick-list for upgrades), answering one immediately swaps the corresponding fallback item client-side, collapses to a nudge if skipped.
3. Three card variants per §4.10: confirm-known-signal, generic-labeled-fallback (with its "General guidance — not verified against your records" badge), and §4.4a's soft data-collection prompt.
4. `saleCaseApi.ts`/`types.ts`: extend for the new item categories, `budgetRange`, and question/answer + notable-upgrades endpoints from Phase 3.

### Phase 8 — Verification

End-to-end across three data-richness scenarios, confirming the mix of Tier 1 / confirmed / self-reported / generic-fallback content behaves as designed (§3.3) in each:
1. **Rich property** — many findings/projects/records/inventory: checklist should surface almost entirely Tier 1 + confirmed-evidence items, few or no generic fallbacks, mandatory-fact gate should pass straight through.
2. **Sparse/new property** — little to no data: mandatory-fact gate should trigger (both inline and routed cases), checklist should show generic labeled fallbacks for unanswered `PRESENTATION` categories and soft prompts (never guesses) for unsafe-to-generalize categories with no data.
3. **Partially-answered property** — some curated questions answered, some mandatory facts still missing: confirm the grouped question card only shows the remaining unanswered ones, and answering one swaps its fallback item live without a page reload.
