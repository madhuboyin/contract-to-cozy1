# Home Reserve / Sinking Fund Planner — Functional Requirements Document

## Table of Contents

1. [Overview](#1-overview)
2. [Relationship to Existing Systems](#2-relationship-to-existing-systems)
3. [Architecture](#3-architecture)
4. [Database Schema](#4-database-schema)
5. [Fund Target Computation](#5-fund-target-computation)
6. [Reconciliation with Actuals](#6-reconciliation-with-actuals)
7. [Contribution Tracking](#7-contribution-tracking)
8. [API Reference](#8-api-reference)
9. [Frontend](#9-frontend)
10. [Workers / Background Jobs](#10-workers--background-jobs)
11. [Integration Points](#11-integration-points)
12. [Security & Multi-Tenancy](#12-security--multi-tenancy)
13. [Rollout Phases](#13-rollout-phases)
14. [Open Questions / Risks](#14-open-questions--risks)
15. [File Index](#15-file-index)

---

## 1. Overview

The platform already predicts, in detail, what a homeowner's home is going to cost them: the
**Home Capital Timeline** forecasts dated, cost-ranged capital events for the next 5–10 years
(new roof in 2031, water heater in 2028, HVAC in 2033), **True Cost of Ownership** projects
ongoing annual run-rate costs, and **Maintenance Prediction** / **Appliance Oracle** each add
their own asset-failure estimates. None of these turn a forecast into an answer to the question a
homeowner actually has: *"how much should I be setting aside per month, starting now, so that
when the water heater dies I'm not either draining my checking account or putting it on a credit
card?"*

The Home Reserve / Sinking Fund Planner is a new, persisted savings-target model —
`HomeReserveFund` — that:

1. Converts the **Home Capital Timeline**'s dated cost-ranged items into a smoothed monthly
   contribution target (classic sinking-fund math), plus a separate near-term shortfall figure
   for items due soon.
2. Lets the homeowner track progress against that target with a simple self-reported
   balance/ledger (the platform has no bank-linking infrastructure anywhere today — this follows
   the same self-reported pattern already used by `HomeSavingsAccount`, not a new one).
3. Automatically retires a line item's contribution requirement when the platform sees evidence
   the work actually happened (a linked `HomeEvent`, a matching `Expense`), so the fund doesn't
   keep asking the homeowner to save for a roof they already replaced.
4. Surfaces the shortfall as a Guidance Engine signal when it crosses a threshold, using the
   **existing** `financial_exposure_resolution` journey template rather than inventing a new one —
   this is squarely a financial-exposure condition, not a new issue domain.

This is not "tool #9" in the already-fragmented financial cluster. It's the thing that makes the
other eight tools' forecasts actionable instead of merely informative.

### 1.1 Design Principles

- **One authoritative dollar source.** Fund targets are computed **only** from
  `HomeCapitalTimelineItem` rows. See [Section 2](#2-relationship-to-existing-systems) for why the
  other two forecasting engines are excluded rather than blended in.
- **No invented money movement.** Nothing in this platform moves real money between accounts.
  Balance tracking is self-reported, exactly like `HomeSavingsAccount` already is. Real bank
  integration is explicitly Phase 2+ (see [Section 13](#13-rollout-phases)).
- **Transparent math.** Every dollar of the recommended monthly contribution is traceable to a
  specific timeline item and its `why` field — never a single opaque number.
- **Recompute, don't drift.** The fund target is regenerated whenever the underlying
  `HomeCapitalTimelineAnalysis` is regenerated, not on an independent schedule that could silently
  disagree with what the Capital Timeline page itself shows.

### 1.2 Scope

**In scope (Phase 1):** per-property fund target computation from Home Capital Timeline,
self-reported balance/contribution ledger, automatic line-item retirement on evidence of
completion, Guidance Engine signal on shortfall, dashboard surfacing on `/dashboard/save`.

**Out of scope (Phase 1):** real bank-account linking or automatic transfers, portfolio-level
(multi-property) fund rollup, blending Appliance Oracle or Maintenance Prediction data into the
dollar target (see Section 2), any change to the underlying Home Capital Timeline forecasting
logic itself.

---

## 2. Relationship to Existing Systems

Three separate services in this codebase independently forecast future home costs, and they do
not talk to each other today:

| Engine | Model | Has a dollar figure? | Financial-planning safe? |
|---|---|---|---|
| **Home Capital Timeline** (`homeCapitalTimeline.service.ts`) | `HomeCapitalTimelineItem` — persisted, versioned, overridable | Yes — `estimatedCostMinCents`/`MaxCents`, dated `windowStart`/`windowEnd` | Yes — has a `confidence` enum, an override system (`HomeCapitalTimelineOverride`), and no disclaimer against relying on it |
| **Appliance Oracle** (`applianceOracle.service.ts`) | Computed on demand, not persisted | Yes — `replacementCost` per appliance | **No.** The service's own output object sets `meta: { classification: 'EDUCATIONAL_ESTIMATE', financialPlanningSafe: false }` verbatim |
| **Maintenance Prediction** (`MaintenancePrediction` model) | Persisted, task-level | **No.** The model has `taskName`, `predictedDate`, `priority`, `confidenceScore` — no cost field at all | N/A — structurally can't feed a dollar target |

This settles the sourcing question by construction, not just preference: Appliance Oracle
explicitly disclaims itself for this exact use case, and Maintenance Prediction has nowhere to put
a dollar amount even if it wanted to. **Home Capital Timeline is the only one of the three built
to be relied on financially**, so it is the sole input to the fund target. This is called out
explicitly (rather than silently picking one) because a future contributor might reasonably assume
"more data sources = better estimate" and wire in Appliance Oracle numbers without noticing the
disclaimer — see [Section 14](#14-open-questions--risks) for the standing recommendation to
eventually reconcile all three engines' lifespan assumptions, which is a separate project from this
one.

**Home Savings is not a savings-goal tool.** Despite the name, `HomeSavingsAccount` /
`HomeSavingsOpportunity` model recurring-bill overpayment detection (internet, electricity,
insurance — "switch to Provider X and save $20/month"), not a funded target/goal concept. There is
no existing model anywhere in the schema for "I am saving toward a target amount." This FRD
introduces that concept for the first time as `HomeReserveFund`.

**True Cost of Ownership** (`trueCostOwnership.service.ts`) is a computed run-rate rollup (annual
tax + insurance + maintenance + utilities), not itemized dated events. It's a good place to
*display* the reserve fund's monthly contribution as an added line item for full-cost transparency
(see [Section 11](#11-integration-points)), but it is not a computation input.

---

## 3. Architecture

```
HomeCapitalTimelineAnalysis (existing, regenerated periodically)
        │  (on new analysis READY)
        ▼
HomeReserveFundService.recalculate(propertyId)
  ├─ Load latest HomeCapitalTimelineAnalysis + active HomeCapitalTimelineItem rows
  │    (excluding items disabled via HomeCapitalTimelineOverride[DISABLE_ITEM])
  ├─ Apply the property's HomeReserveFund.posture (CONSERVATIVE / MODERATE / AGGRESSIVE)
  │    to pick a point estimate from each item's cost range
  ├─ Run sinking-fund math (Section 5) → recommendedMonthlyContributionCents, currentShortfallCents
  ├─ Upsert HomeReserveFundLineItem rows (one per timeline item, with its allocated monthly cents)
  └─ Write HomeReserveFundRecalculation audit row
        │
        ▼
Homeowner logs a contribution/withdrawal (manual, self-reported)
  → HomeReserveFundContribution row → HomeReserveFund.currentBalanceCents updated
        │
        ▼
Evidence of completion appears (HomeEvent linked, or Expense matched — Section 6)
  → HomeCapitalTimelineItem effectively resolved
  → next recalculate() drops that item's line, releases its allocated monthly amount
        │
        ▼
If currentShortfallCents crosses threshold for near-term items
  → guidanceSignalResolverService.resolveAndPersistSignal({ signalIntentFamily: 'financial_exposure', ... })
     (existing financial_exposure_resolution journey template — no new template needed)
```

### 3.1 Service Responsibilities

| Service | Responsibility |
|---|---|
| `homeReserveFund.service.ts` **(new)** | Fund CRUD, posture management, contribution ledger |
| `homeReserveFundCalculation.service.ts` **(new)** | Reads Home Capital Timeline, runs sinking-fund math, writes line items |
| `homeReserveFundReconciliation.service.ts` **(new)** | Matches `Expense` / `HomeEvent` evidence against open line items |
| `homeCapitalTimeline.service.ts` (existing, unmodified) | Source of truth for dated, cost-ranged capital events |
| `guidanceSignalResolverService` (existing, unmodified) | Receives the shortfall signal |

---

## 4. Database Schema

### 4.1 Enums

```prisma
enum HomeReserveFundPosture {
  CONSERVATIVE  // use estimatedCostMaxCents, shorter smoothing window (safer, higher monthly target)
  MODERATE      // use the midpoint of the cost range (default)
  AGGRESSIVE    // use estimatedCostMinCents, longer smoothing window (lower monthly target)
}

enum HomeReserveFundLineItemStatus {
  ACTIVE        // still contributing toward this item
  FUNDED        // balance allocated to this item has reached its target
  RETIRED       // evidence of completion seen; no longer contributing
  OVERDUE       // windowEnd has passed with no evidence and item still ACTIVE
}

enum HomeReserveFundContributionType {
  DEPOSIT
  WITHDRAWAL
  BALANCE_CORRECTION   // user reconciling a self-reported balance, not a real transaction
}

enum HomeReserveFundRecalculationTrigger {
  TIMELINE_REFRESH      // fired because HomeCapitalTimelineAnalysis was regenerated
  MANUAL
  SCHEDULED             // monthly safety-net recompute even if timeline didn't change
  RECONCILIATION        // fired because a line item was retired/marked funded
}
```

### 4.2 Models

#### `HomeReserveFund` — one per property

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `propertyId` | String | FK → Property, unique |
| `homeownerProfileId` | String | FK → HomeownerProfile |
| `posture` | `HomeReserveFundPosture` | Default `MODERATE` |
| `horizonYears` | Int | Default matches the source `HomeCapitalTimelineAnalysis.horizonYears` |
| `currentBalanceCents` | Int | Self-reported running balance, default 0 |
| `recommendedMonthlyContributionCents` | Int | Computed, see Section 5 |
| `currentShortfallCents` | Int | Computed, see Section 5 |
| `lastRecalculatedAt` | DateTime? | |
| `sourceAnalysisId` | String? | FK → HomeCapitalTimelineAnalysis (which run this target is based on) |
| `isActive` | Boolean | Homeowner can pause the fund without deleting history |
| `createdAt` / `updatedAt` | DateTime | |

**Unique:** `propertyId`. **Indexes:** `homeownerProfileId`, `sourceAnalysisId`.

#### `HomeReserveFundLineItem` — per-timeline-item allocation

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `fundId` | String | FK → HomeReserveFund |
| `timelineItemId` | String | FK → HomeCapitalTimelineItem |
| `status` | `HomeReserveFundLineItemStatus` | |
| `targetCostCents` | Int | The posture-adjusted point estimate used for this item |
| `allocatedMonthlyCents` | Int | This item's share of the recommended monthly contribution |
| `allocatedBalanceCents` | Int | Portion of `currentBalanceCents` attributed to this item (proportional, for display only — the balance itself is not physically partitioned) |
| `retiredAt` | DateTime? | |
| `retiredReason` | String? | `"linked_home_event"` \| `"matched_expense"` \| `"manual"` |
| `retiredEvidenceRef` | String? | HomeEvent ID or Expense ID |
| `createdAt` / `updatedAt` | DateTime | |

**Unique:** `fundId + timelineItemId`. **Indexes:** `fundId`, `timelineItemId`, `status`.

> Deliberately **not** a denormalized copy of the timeline item's cost/date/category — those are
> read live from `HomeCapitalTimelineItem` via `timelineItemId` on every fetch, so a
> `HomeCapitalTimelineOverride` (e.g. the homeowner adjusts the roof's remaining life) is reflected
> immediately without a separate sync step.

#### `HomeReserveFundContribution` — append-only ledger

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `fundId` | String | FK → HomeReserveFund |
| `type` | `HomeReserveFundContributionType` | |
| `amountCents` | Int | Positive for DEPOSIT/BALANCE_CORRECTION-up, negative for WITHDRAWAL |
| `occurredAt` | DateTime | User-specified date (defaults to now) |
| `note` | String? | |
| `linkedExpenseId` | String? | FK → Expense, set when a withdrawal corresponds to an actual logged expense |
| `linkedLineItemId` | String? | FK → HomeReserveFundLineItem, optional — "this withdrawal was for the water heater" |
| `createdAt` | DateTime | |

**Indexes:** `fundId + occurredAt`, `linkedExpenseId`.

#### `HomeReserveFundRecalculation` — audit trail

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `fundId` | String | FK → HomeReserveFund |
| `trigger` | `HomeReserveFundRecalculationTrigger` | |
| `previousMonthlyContributionCents` / `newMonthlyContributionCents` | Int | For "your target changed" notifications |
| `previousShortfallCents` / `newShortfallCents` | Int | |
| `itemsAdded` / `itemsRetired` | Int | |
| `computedAt` | DateTime | |

**Indexes:** `fundId + computedAt`.

---

## 5. Fund Target Computation

`HomeReserveFundCalculationService.recalculate(propertyId)`:

1. Load the property's `HomeReserveFund` (create with defaults on first access).
2. Load the latest `HomeCapitalTimelineAnalysis` where `status = READY`, and its
   `HomeCapitalTimelineItem` rows, excluding any with an active
   `HomeCapitalTimelineOverride[type=DISABLE_ITEM]`.
3. For each item, pick a point estimate per `fund.posture`:
   - `CONSERVATIVE` → `estimatedCostMaxCents`
   - `MODERATE` → `(estimatedCostMinCents + estimatedCostMaxCents) / 2`
   - `AGGRESSIVE` → `estimatedCostMinCents`
4. Split items into two buckets by `windowStart`:
   - **Near-term** (`windowStart` within 6 months): contributes to `currentShortfallCents` —
     `targetCostCents` minus this item's `allocatedBalanceCents`, floored at 0. This is money
     needed essentially now, not smoothable.
   - **Smoothable** (`windowStart` beyond 6 months): `allocatedMonthlyCents = targetCostCents /
     monthsUntil(windowStart)`, capped so no single item's window is smoothed over more than the
     fund's `horizonYears × 12` months even if `windowStart` is further out than the horizon.
5. `recommendedMonthlyContributionCents = sum(allocatedMonthlyCents across smoothable items)`.
   `currentShortfallCents = sum(near-term shortfalls)`.
6. Upsert `HomeReserveFundLineItem` rows; items no longer present in the timeline (or newly
   `DISABLE_ITEM`-overridden) transition existing line items to `RETIRED` with
   `retiredReason: 'manual'` (the homeowner or the timeline itself removed the need).
7. Write `HomeReserveFundRecalculation`.

This is standard sinking-fund math (target ÷ months-remaining = required monthly rate) with one
deliberate simplification flagged for review: it does not currently account for balance already
accruing interest, or for a minimum viable monthly-payment floor when many items cluster in the
same near-term window. See [Section 14](#14-open-questions--risks).

---

## 6. Reconciliation with Actuals

The reserve fund should stop asking a homeowner to save for something they already paid for. Two
signals retire a line item automatically, both using fields that already exist on
`HomeCapitalTimelineItem` rather than inventing new tracking:

1. **`linkedHomeEventId` gets set.** If a `HomeEvent` (type `REPAIR`, `PURCHASE`, or
   `VERIFIED_RESOLUTION`) is linked to the timeline item — which can already happen today via the
   existing Capital Timeline UI or via a completed Guidance journey — the corresponding
   `HomeReserveFundLineItem` transitions to `RETIRED`, `retiredReason: 'linked_home_event'`.
2. **A matching `Expense` appears.** `HomeReserveFundReconciliationService` runs on a schedule
   (see [Section 10](#10-workers--background-jobs)) and looks for `Expense` rows on the same
   property whose `category` maps to the line item's `HomeCapitalTimelineCategory` (e.g.
   `ExpenseCategory` → `WATER_HEATER`) and whose `amount` falls within ±25% of the line item's
   `targetCostCents`, dated within the item's `windowStart`–`windowEnd` range (± 3 months). A
   match is surfaced to the homeowner as a suggestion — *"Looks like your $1,180 water heater
   expense on March 3 might cover this line item — mark it retired?"* — rather than auto-retiring
   silently, since category/amount matching is inherently fuzzy and a false-positive retirement
   would quietly understate what the homeowner still needs to save.

Retiring a line item releases its `allocatedMonthlyCents` back into the pool at the next
recalculation, lowering `recommendedMonthlyContributionCents`.

---

## 7. Contribution Tracking

Fully self-reported, matching the existing `HomeSavingsAccount` pattern — no bank linking exists
anywhere in this platform today (confirmed: no Plaid or equivalent integration in the codebase).

- Homeowner logs a `DEPOSIT` or `WITHDRAWAL` via the Reserve Fund page. Each entry updates
  `HomeReserveFund.currentBalanceCents`.
- Optionally tags a contribution to a specific `HomeReserveFundLineItem` (e.g. "this $500 is
  earmarked for the roof") — purely a display allocation, not a real sub-account; the underlying
  balance is one number.
- A `BALANCE_CORRECTION` entry type exists for the honest case where a homeowner's actual savings
  account balance has drifted from what they've logged (interest accrued, a manual transfer they
  forgot to log) — avoids the ledger and the "real" balance silently diverging without a
  reconciliation path.
- Monthly reminder notification (see [Section 10](#10-workers--background-jobs)) nudges the
  homeowner to confirm their balance is still accurate, since nothing here is verified against a
  real account.

---

## 8. API Reference

All endpoints require `Authorization: Bearer <token>` and `propertyAuth.middleware`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/properties/:propertyId/reserve-fund` | Get (or lazily create) the fund summary: balance, target, shortfall, posture |
| `PATCH` | `/api/properties/:propertyId/reserve-fund` | Update `posture` or `isActive` |
| `POST` | `/api/properties/:propertyId/reserve-fund/recalculate` | Manual recalculation trigger |
| `GET` | `/api/properties/:propertyId/reserve-fund/line-items` | List line items with status, target, monthly allocation, linked timeline item |
| `GET` | `/api/properties/:propertyId/reserve-fund/contributions` | Paginated contribution ledger |
| `POST` | `/api/properties/:propertyId/reserve-fund/contributions` | Log a deposit/withdrawal/correction |
| `DELETE` | `/api/properties/:propertyId/reserve-fund/contributions/:id` | Remove a logged entry (correcting a mistake) |
| `POST` | `/api/properties/:propertyId/reserve-fund/line-items/:id/retire` | Manually retire a line item (with optional evidence ref) |
| `GET` | `/api/properties/:propertyId/reserve-fund/reconciliation-suggestions` | Pending fuzzy-matched expense suggestions from Section 6 |
| `POST` | `/api/properties/:propertyId/reserve-fund/reconciliation-suggestions/:id/accept` | Confirm a suggested retirement |
| `POST` | `/api/properties/:propertyId/reserve-fund/reconciliation-suggestions/:id/dismiss` | Reject it |

---

## 9. Frontend

| File | Purpose |
|---|---|
| `app/(dashboard)/dashboard/properties/[id]/tools/reserve-fund/page.tsx` | Main tool page |
| `components/features/reserveFund/ReserveFundSummaryCard.tsx` | Balance vs. target progress bar, monthly contribution figure, shortfall callout |
| `components/features/reserveFund/LineItemBreakdown.tsx` | Per-item list — category icon, target cost, monthly allocation, "why" (pulled from the linked `HomeCapitalTimelineItem.why`), status badge |
| `components/features/reserveFund/ContributionLedger.tsx` | Deposit/withdrawal history with add/remove actions |
| `components/features/reserveFund/PostureSelector.tsx` | Conservative/Moderate/Aggressive toggle with plain-language explanation of what changes |
| `components/features/reserveFund/ReconciliationSuggestionBanner.tsx` | "Looks like this expense covers a line item" prompts from Section 6 |

**Dashboard surfacing:** a new card on `/dashboard/save` (`FinancialEfficiencyClient.tsx`) —
`/dashboard/save` today aggregates home savings, hidden assets, refinance status, and home equity
but not budget or capital-cost tools. This adds a "Reserve Fund" card: current balance, target
monthly contribution, and a link to the full page — directly closing one of the aggregation gaps
identified in the earlier feature review.

---

## 10. Workers / Background Jobs

| File | Purpose | Trigger |
|---|---|---|
| `workers/src/jobs/recalculateReserveFunds.job.ts` | Calls `HomeReserveFundCalculationService.recalculate()` for any property whose `HomeCapitalTimelineAnalysis` was regenerated since the fund's `sourceAnalysisId` | Event-driven off Capital Timeline regeneration, **plus** a monthly safety-net sweep (`RESERVE_FUND_SWEEP_CRON`, default `0 4 1 * *`) in case the event-driven path is ever missed |
| `workers/src/jobs/reserveFundReconciliation.job.ts` | Runs the fuzzy expense-matching pass from Section 6, writes reconciliation suggestions | Daily (`RESERVE_FUND_RECONCILIATION_CRON`, default `0 5 * * *`) |
| `workers/src/jobs/reserveFundBalanceReminder.job.ts` | Monthly in-app/push nudge to confirm balance is current, only for `isActive` funds with a contribution older than 45 days | Monthly |

---

## 11. Integration Points

### Guidance Engine
When `currentShortfallCents > 0` for items with `windowStart` inside 90 days, emit:

```typescript
await guidanceSignalResolverService.resolveAndPersistSignal({
  propertyId,
  signalIntentFamily: 'financial_exposure',   // existing family, ISSUE_DOMAIN_BY_FAMILY → FINANCIAL
  sourceEntityType: 'RESERVE_FUND_LINE_ITEM',
  sourceEntityId: lineItem.id,
  sourceToolKey: 'reserve-fund',
  payloadJson: { shortfallCents, dueWindow: item.windowStart },
});
```

This rides the **existing** `financial_exposure_resolution` journey template — no new template
needed, unlike the Smart Home FRD's `sensor_incident_resolution`, because this condition is
already exactly what that template was built for.

### True Cost of Ownership
`trueCostOwnershipService` can optionally add `recommendedMonthlyContributionCents × 12` as a
labeled "reserve fund contribution" line in its `rollup.breakdown`, so a homeowner sees the full,
honest annual cost of ownership including money they should be setting aside — not a hard
dependency, additive display only.

### Home Events
Reaching `FUNDED` status on a line item, or fully retiring one, can optionally create a `HomeEvent`
(`type: MILESTONE`) so the win shows up in the property timeline the same way other progress
already does.

### Budget Forecaster
Not directly integrated in Phase 1 — `budgetForecaster.service.ts` projects from historical
`Expense` trends and has no target/goal concept to plug into. Flagged as a natural Phase 2
extension (the recommended monthly contribution could appear as a fixed line in the budget
projection) rather than scoped here.

---

## 12. Security & Multi-Tenancy

- All endpoints behind `propertyAuth.middleware` — a homeowner can only see/modify the reserve
  fund for properties they own.
- No financial-account credentials are ever collected — this is explicitly a self-reported ledger,
  never a bank integration, which sidesteps PCI/bank-credential handling entirely in Phase 1.
- `HomeReserveFundContribution` amounts are numeric only (cents), never free-text account numbers.

---

## 13. Rollout Phases

| Phase | Scope |
|---|---|
| **1 (this FRD)** | Per-property fund, self-reported ledger, Home Capital Timeline sourcing, expense reconciliation suggestions, Guidance Engine shortfall signal. |
| **2** | Portfolio-level rollup for homeowners with multiple properties. Budget Forecaster integration (contribution as a fixed budget line). Reconcile Appliance Oracle / Maintenance Prediction lifespan assumptions with Home Capital Timeline so all three engines agree (a prerequisite improvement to the *source* data this feature already depends on, not a feature of this tool itself). |
| **3** | Real bank-account linking (Plaid or equivalent) for verified balances and optional automatic transfers — requires its own security/compliance review; not assumed anywhere in Phase 1 or 2. |

---

## 14. Open Questions / Risks

1. **Smoothing math needs a finance-literate review.** The "target ÷ months-remaining" formula in
   Section 5 is standard sinking-fund logic but doesn't model compounding balance growth or a
   minimum-payment floor when multiple large items cluster in the same window (e.g. roof and HVAC
   both due within the same 18 months could produce an unrealistically high combined monthly
   figure). Recommend a review pass before this ships with real dollar amounts, similar to how the
   Risk Premium Optimizer's severity-weighting math would warrant review.
2. **Fuzzy expense matching (Section 6) will have false negatives more often than false
   positives**, by design — the ±25% amount / ±3 month window tolerance is deliberately loose to
   surface *suggestions*, not auto-retire. Worth watching real match-rate data after launch to tune
   the tolerance.
3. **Three-way forecast fragmentation** (Section 2) is a pre-existing condition, not something this
   feature introduces, but this feature is the first thing that turns one of those three forecasts
   into a dollar commitment a homeowner might actually act on — which raises the cost of Home
   Capital Timeline being wrong. Worth prioritizing the Phase 2 reconciliation item accordingly.
4. **No verification that a self-reported balance is real.** Same limitation `HomeSavingsAccount`
   already has; not new here, but worth being explicit that this tool cannot detect a homeowner
   who logs deposits they never actually made.
5. **Posture naming collision risk.** `HomeReserveFundPosture` (CONSERVATIVE/MODERATE/AGGRESSIVE)
   is a different enum from the `cashBufferPosture` concept already used in
   `riskPremiumOptimizer.service.ts`'s `PreferencePostureDefaults`. They're conceptually related
   (risk appetite) but not the same value — worth deciding during implementation whether these
   should eventually be a single shared homeowner-level "risk posture" preference rather than two
   independent per-feature settings.

---

## 15. File Index

### Backend

| Path | Role |
|---|---|
| `apps/backend/src/routes/homeReserveFund.routes.ts` | Routes + middleware |
| `apps/backend/src/controllers/homeReserveFund.controller.ts` | Request handlers |
| `apps/backend/src/services/homeReserveFund.service.ts` | Fund CRUD, posture, contribution ledger |
| `apps/backend/src/services/homeReserveFundCalculation.service.ts` | Sinking-fund math against Home Capital Timeline |
| `apps/backend/src/services/homeReserveFundReconciliation.service.ts` | Expense/HomeEvent matching |
| `apps/backend/src/validators/homeReserveFund.validators.ts` | Zod v4 schemas |
| `apps/backend/prisma/schema.prisma` | New models/enums (Section 4) |
| `apps/backend/src/services/guidanceEngine/guidanceSignalResolver.service.ts` | No changes — existing `financial_exposure` family reused |
| `apps/backend/src/services/homeCapitalTimeline.service.ts` | Read-only dependency, unmodified |
| `apps/backend/src/services/trueCostOwnership.service.ts` | Optional additive display line, unmodified core logic |

### Frontend

| Path | Role |
|---|---|
| `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/reserve-fund/page.tsx` | Main tool page |
| `apps/frontend/src/components/features/reserveFund/*` | Components (Section 9) |
| `apps/frontend/src/app/(dashboard)/dashboard/save/FinancialEfficiencyClient.tsx` | New Reserve Fund card added to existing Save hub |
| `apps/frontend/src/lib/api/client.ts` | Typed API client methods |
| `apps/frontend/src/types/index.ts` | TypeScript interfaces |

### Workers

| Path | Role |
|---|---|
| `apps/workers/src/jobs/recalculateReserveFunds.job.ts` | Event-driven + monthly-sweep recalculation |
| `apps/workers/src/jobs/reserveFundReconciliation.job.ts` | Daily expense-matching suggestions |
| `apps/workers/src/jobs/reserveFundBalanceReminder.job.ts` | Monthly balance-confirmation nudge |
| `apps/workers/prisma/schema.prisma` | Synced mirror of backend schema |
