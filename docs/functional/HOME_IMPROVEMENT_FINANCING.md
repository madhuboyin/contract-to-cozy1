# Home Improvement Financing Center

## Overview

Home Improvement Financing Center closes the action gap between knowing a repair is needed and funding it. The platform has ten-plus financial tools — Capital Timeline, Break-Even Analysis, Replace or Repair, Do-Nothing Simulator, Digital Twin — that tell homeowners *what* to do and *when*. None of them address *how to pay for it*.

The Financing Center provides:

1. **Equity Position Dashboard** — Live equity calculation using the homeowner's purchase price, remaining mortgage balance, and the existing Appreciation Tracker's value estimate. Produces a usable HELOC capacity estimate.
2. **Project Financing Calculator** — For a given project cost, computes monthly payments across five financing options: HELOC, Home Equity Loan, Personal Loan, Contractor Financing, and Pay Cash with opportunity cost.
3. **Inline Financing CTAs** — A "See financing options" action surfaced directly on every capital decision verdict (Replace/Repair says REPLACE, Capital Timeline flags a near-term event, Budget Forecaster shows a large month) — so the funding conversation happens at the same moment as the spend recommendation.
4. **Saved Scenarios** — Homeowners can save and compare multiple financing scenarios for a pending project.

---

## Feature Goals

- Surface financing options at the moment a spend recommendation is made, not in a separate detour
- Give homeowners a live equity number they can act on, not a static estimate from purchase time
- Make monthly payment comparison across loan types dead simple: one project cost → five breakdowns
- Store enough mortgage context to make the HELOC calculation meaningful without requiring a bank integration
- Keep all calculations educational — no rate lock, no credit pull, no lender relationship in Phase 1

---

## Financing Options Modelled

| Option | Description | Phase |
|---|---|---|
| **HELOC** | Home Equity Line of Credit. Draw period: 10 years, interest-only. Repayment period: 10 years, P+I. Floating rate, benchmarked to current HELOC rate from admin-managed config. | Phase 1 |
| **Home Equity Loan** | Fixed-rate lump sum. 10-year term. Fixed rate from admin config. | Phase 1 |
| **Personal Loan** | Unsecured. 3-year and 5-year terms. Rate range from admin config. | Phase 1 |
| **Contractor Financing** | Deferred-interest 12-month promo (0% if paid in full), then ongoing APR. Rates from admin config. | Phase 1 |
| **Pay Cash** | No financing cost, but models opportunity cost as foregone investment return (admin-configurable default: 6% annual). | Phase 1 |
| **HELOC via lender referral** | Link to partner lender pre-application. No rate lock in platform. | Phase 2 |

---

## Database

### Enums

```prisma
enum FinancingOptionType {
  HELOC
  HOME_EQUITY_LOAN
  PERSONAL_LOAN
  CONTRACTOR_FINANCING
  PAY_CASH
}

enum MortgageType {
  FIXED_30
  FIXED_15
  FIXED_20
  ARM_5
  ARM_7
  OTHER
}

enum FinancingScenarioStatus {
  DRAFT
  SAVED
  ARCHIVED
}

enum FinancingEntryPoint {
  REPLACE_REPAIR       // Launched from Replace or Repair verdict
  CAPITAL_TIMELINE     // Launched from a Capital Timeline event
  BUDGET_FORECASTER    // Launched from a large budget month
  DIGITAL_TWIN         // Launched from a Digital Twin scenario
  DIRECT               // User opened the Financing Center directly
  GUIDANCE_STEP        // Launched from a Guidance Engine step
}

enum RateConfigType {
  HELOC_RATE
  HOME_EQUITY_LOAN_RATE
  PERSONAL_LOAN_RATE_MIN
  PERSONAL_LOAN_RATE_MAX
  CONTRACTOR_PROMO_MONTHS
  CONTRACTOR_ONGOING_APR
  OPPORTUNITY_COST_RATE
}
```

---

### Models

#### `PropertyFinancingProfile` — Mortgage and Purchase Context

One row per property. Created when the homeowner first fills in mortgage details. The equity calculation depends on this record.

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `propertyId` | String (unique) | FK → Property |
| `purchasePriceCents` | Int? | Original purchase price in cents |
| `purchaseDate` | DateTime? | Closing date |
| `mortgageType` | `MortgageType`? | Loan type |
| `originalMortgageBalanceCents` | Int? | Principal at origination |
| `currentMortgageBalanceCents` | Int? | Homeowner-entered remaining balance (updated manually or on request) |
| `mortgageBalanceAsOfDate` | DateTime? | When the current balance was last entered |
| `interestRateBps` | Int? | Current mortgage rate in basis points (e.g. 6.875% → 688) |
| `monthlyPaymentCents` | Int? | Total PITI or P+I monthly payment |
| `hasSecondMortgage` | Boolean | If true, suppresses HELOC capacity estimate pending clarification |
| `secondMortgageBalanceCents` | Int? | Outstanding second mortgage balance (affects CLTV) |
| `hasPMI` | Boolean | Informational; affects lender appetite for HELOC |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

**Notes on design:**
- This model intentionally stores balances as homeowner-entered snapshots. No bank integration. The "as of date" makes the staleness visible in the UI.
- `purchasePriceCents` anchors the equity calculation when the Appreciation Tracker hasn't been run yet.

---

#### `FinancingRateConfig` — Admin-Managed Rate Benchmarks

One row per `RateConfigType`. Updated by admins when market rates shift (weekly or monthly cadence). These drive all payment calculations.

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `type` | `RateConfigType` (unique) | |
| `valueBps` | Int | Rate in basis points. For `CONTRACTOR_PROMO_MONTHS`, stores months as a whole number (e.g. 12). |
| `label` | String | Human-readable label for admin UI (e.g. "Current average HELOC rate") |
| `sourceNote` | String? | Where this rate comes from (e.g. "Bankrate weekly survey") |
| `effectiveDate` | DateTime | When this rate took effect |
| `updatedAt` | DateTime | |

**Default seed values:**

| Type | Value | Label |
|---|---|---|
| `HELOC_RATE` | 900 bps | 9.00% — avg HELOC rate |
| `HOME_EQUITY_LOAN_RATE` | 875 bps | 8.75% — avg HEL rate |
| `PERSONAL_LOAN_RATE_MIN` | 1100 bps | 11.00% — good credit personal loan |
| `PERSONAL_LOAN_RATE_MAX` | 2000 bps | 20.00% — fair credit personal loan |
| `CONTRACTOR_PROMO_MONTHS` | 12 | 12-month deferred interest |
| `CONTRACTOR_ONGOING_APR` | 2699 bps | 26.99% — typical contractor financing APR |
| `OPPORTUNITY_COST_RATE` | 600 bps | 6.00% — foregone investment return |

---

#### `FinancingScenario` — A Saved Financing Analysis

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `propertyId` | String | FK → Property |
| `userId` | String | FK → User |
| `status` | `FinancingScenarioStatus` | DRAFT / SAVED / ARCHIVED |
| `title` | String | e.g. "HVAC Replacement — July 2026" |
| `projectDescription` | String? | What the money is for |
| `projectCostCents` | Int | Project cost used for calculation |
| `entryPoint` | `FinancingEntryPoint` | What surface launched this scenario |
| `sourceEntityType` | String? | e.g. `ReplaceRepairAnalysis`, `HomeCapitalTimelineItem` |
| `sourceEntityId` | String? | ID of the source entity |
| `equitySnapshotCents` | Int? | Equity at time of scenario creation (from `EquityPosition`) |
| `helocCapacitySnapshotCents` | Int? | Estimated HELOC capacity at time of creation |
| `rateSnapshotJson` | Json | Copy of all `FinancingRateConfig` values at calculation time (preserves reproducibility) |
| `resultsJson` | Json | Full calculation output for all modelled options |
| `selectedOption` | `FinancingOptionType`? | Which option the homeowner marked as their choice |
| `notes` | String? | |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

**Indexes:** `propertyId + createdAt`, `userId`, `status`, `entryPoint`

---

#### `EquityPosition` — Computed Equity Snapshot (Append-Only)

Computed on demand and stored as a historical record. Each time the homeowner requests an equity refresh, a new row is written.

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `propertyId` | String | FK → Property |
| `estimatedValueCents` | Int | Current value used for this snapshot |
| `estimatedValueSource` | String | `APPRECIATION_TRACKER` \| `PURCHASE_PRICE` \| `USER_ENTERED` |
| `mortgageBalanceCents` | Int | From `PropertyFinancingProfile.currentMortgageBalanceCents` |
| `secondMortgageBalanceCents` | Int | 0 if none |
| `equityCents` | Int | `estimatedValue - mortgageBalance - secondMortgageBalance` |
| `equityPercent` | Decimal(5,2) | `equity / estimatedValue × 100` |
| `ltvPercent` | Decimal(5,2) | `(mortgage + second) / estimatedValue × 100` |
| `helocCapacityCents` | Int | `max(0, estimatedValue × 0.85 - mortgageBalance - secondMortgageBalance)` |
| `helocEligible` | Boolean | `ltvPercent ≤ 85` AND `equityPercent ≥ 20` |
| `computedAt` | DateTime | |

**Index:** `propertyId + computedAt`

---

## Financing Calculations

All calculations are performed server-side in `FinancingCalculatorService`. Rates are loaded from `FinancingRateConfig` at calculation time and snapshotted into `FinancingScenario.rateSnapshotJson`.

### HELOC

```
Draw period (interest-only, 10 years):
  monthly_payment = projectCost × (helocRateBps / 100 / 100 / 12)

Repayment period (P+I, 10 years, same rate):
  monthly_payment = projectCost × [r(1+r)^n] / [(1+r)^n - 1]
  where r = helocRateBps/100/100/12, n = 120

Total cost = (draw_monthly × 120) + (repayment_monthly × 120)
Interest paid = total_cost - projectCost
```

### Home Equity Loan

```
Fixed rate, 10-year term:
  monthly_payment = projectCost × [r(1+r)^n] / [(1+r)^n - 1]
  where r = helRateBps/100/100/12, n = 120

Total interest = (monthly × 120) - projectCost
```

### Personal Loan

Two scenarios presented (min rate / max rate):
```
3-year term and 5-year term computed for each rate:
  monthly_payment = projectCost × [r(1+r)^n] / [(1+r)^n - 1]
  where r = rate/12, n = 36 or 60
```

### Contractor Financing

```
Promo period (0%, promoMonths):
  monthly_if_paid_in_full = projectCost / promoMonths
  
If NOT paid in full by end of promo:
  deferred_interest = projectCost × (ongoingAPR/12) × promoMonths  [back-charged]
  remaining_balance = projectCost + deferred_interest
  monthly_after_promo = remaining_balance × [r(1+r)^n] / [(1+r)^n - 1]
  where r = ongoingAPR/12, n = 60

WARNING shown: "If not paid in full within [promoMonths] months, back-interest of ~$[deferred_interest] is added"
```

### Pay Cash (Opportunity Cost)

```
No monthly payment.
opportunity_cost_5yr = projectCost × ((1 + opportunityCostRate)^5 - 1)
opportunity_cost_10yr = projectCost × ((1 + opportunityCostRate)^10 - 1)

Display: "Paying cash frees you from monthly payments but foregoes ~$X in potential investment returns over 5 years at [rate]%"
```

---

## Backend

### Files

| File | Purpose |
|---|---|
| `backend/src/routes/financing.routes.ts` | Express route definitions |
| `backend/src/controllers/financing.controller.ts` | Request/response handling |
| `backend/src/services/financing.service.ts` | Profile CRUD, equity computation, scenario management |
| `backend/src/services/financingCalculator.service.ts` | All payment and cost calculations |
| `backend/src/validators/financing.validators.ts` | Zod v4 input schemas |
| `backend/src/index.ts` | Route mounting |

---

### API Endpoints

All endpoints require `Authorization: Bearer <token>`. Property-scoped endpoints apply `propertyAuth.middleware`.

#### Financing Profile

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/properties/:propertyId/financing/profile` | Get financing profile (mortgage details) |
| `PUT` | `/api/properties/:propertyId/financing/profile` | Create or update financing profile |

#### Equity Position

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/properties/:propertyId/financing/equity` | Get latest equity snapshot (computes fresh if > 7 days old) |
| `POST` | `/api/properties/:propertyId/financing/equity/refresh` | Force-recompute equity snapshot now |
| `GET` | `/api/properties/:propertyId/financing/equity/history` | List all historical equity snapshots |

#### Calculator (Stateless)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/properties/:propertyId/financing/calculate` | Compute financing options for a project cost; does not persist |

#### Scenarios

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/properties/:propertyId/financing/scenarios` | List saved and draft scenarios |
| `POST` | `/api/properties/:propertyId/financing/scenarios` | Create a scenario (auto-runs calculation) |
| `GET` | `/api/properties/:propertyId/financing/scenarios/:scenarioId` | Get full scenario with results |
| `PATCH` | `/api/properties/:propertyId/financing/scenarios/:scenarioId` | Update title, notes, selectedOption, status |
| `DELETE` | `/api/properties/:propertyId/financing/scenarios/:scenarioId` | Archive (soft-delete) |

#### Rate Config (Admin)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/financing/rates` | List current rate configs |
| `PATCH` | `/api/admin/financing/rates/:type` | Update a rate config value |

---

### Service Layer

#### `FinancingService` (`financing.service.ts`)

- **`getProfile(propertyId)`** — Returns `PropertyFinancingProfile` or null.
- **`upsertProfile(propertyId, payload)`** — Creates or updates the financing profile.
- **`getLatestEquity(propertyId)`** — Returns the most recent `EquityPosition`. If newest row is > 7 days old or none exists, calls `computeEquity()` first.
- **`refreshEquity(propertyId)`** — Forces a fresh `EquityPosition` computation regardless of staleness.
- **`computeEquity(propertyId)`** — Internal:
  1. Load `PropertyFinancingProfile`
  2. Attempt to get current value estimate from Appreciation Tracker (`PropertyAppreciationIndex` table if available, else `purchasePriceCents`)
  3. Compute equity fields
  4. Write and return new `EquityPosition` row
- **`getEquityHistory(propertyId)`** — Returns all `EquityPosition` rows ordered by `computedAt` desc.
- **`calculate(propertyId, projectCostCents)`** — Stateless. Loads current `FinancingRateConfig` values; calls `FinancingCalculatorService.computeAll(projectCostCents, rates, equity)`; returns results without persisting.
- **`createScenario(propertyId, userId, payload)`** — Creates a `FinancingScenario`: runs calculation, snapshots rates and equity, persists `resultsJson`.
- **`listScenarios(propertyId, params)`** — Returns SAVED and DRAFT scenarios ordered by `createdAt` desc.
- **`getScenario(scenarioId, propertyId)`** — Returns full scenario.
- **`updateScenario(scenarioId, propertyId, patch)`** — Updates title, notes, `selectedOption`, or status.

#### `FinancingCalculatorService` (`financingCalculator.service.ts`)

- **`computeAll(projectCostCents, rates, equity)`** — Computes all financing options and returns a `FinancingResultSet`.
- **`computeHELOC(projectCostCents, rateBps)`** — Returns draw-period monthly, repayment monthly, total cost, total interest.
- **`computeHomeEquityLoan(projectCostCents, rateBps)`** — Returns monthly payment, total interest for 10-year fixed.
- **`computePersonalLoan(projectCostCents, minRateBps, maxRateBps)`** — Returns results for 4 combinations: min/max rate × 3-year/5-year.
- **`computeContractorFinancing(projectCostCents, promoMonths, ongoingAprBps)`** — Returns promo monthly, ongoing monthly (if not paid in full), deferred interest risk amount.
- **`computePayCash(projectCostCents, opportunityCostRateBps)`** — Returns opportunity cost at 5 and 10 years.
- **`isHELOCEligible(equity)`** — Returns bool based on equity's `helocEligible` field.

---

### Validators (`financing.validators.ts`)

| Schema | Used By |
|---|---|
| `UpsertFinancingProfileSchema` | `PUT .../financing/profile` |
| `CalculateSchema` | `POST .../financing/calculate` |
| `CreateScenarioSchema` | `POST .../financing/scenarios` |
| `UpdateScenarioSchema` | `PATCH .../financing/scenarios/:id` |
| `UpdateRateConfigSchema` | `PATCH /admin/financing/rates/:type` |

---

## Frontend

### Files

| File | Purpose |
|---|---|
| `frontend/src/app/(dashboard)/dashboard/financing/page.tsx` | Financing Center hub |
| `frontend/src/app/(dashboard)/dashboard/financing/profile/page.tsx` | Mortgage details entry form |
| `frontend/src/app/(dashboard)/dashboard/financing/scenarios/[id]/page.tsx` | Full scenario detail |
| `frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/financing/page.tsx` | Property-scoped entry |
| `frontend/src/components/features/financing/EquityCard.tsx` | Live equity display with HELOC capacity |
| `frontend/src/components/features/financing/FinancingCalculatorSheet.tsx` | Inline bottom sheet calculator (used for quick-check CTAs) |
| `frontend/src/components/features/financing/OptionComparisonTable.tsx` | Side-by-side financing option breakdown |
| `frontend/src/components/features/financing/ScenarioCard.tsx` | Saved scenario summary card |
| `frontend/src/components/features/financing/MortgageProfileForm.tsx` | Mortgage details entry form component |
| `frontend/src/components/features/financing/FinancingCta.tsx` | Inline CTA component (embedded in other features) |
| `frontend/src/components/features/financing/FinancingUtils.ts` | Rate formatting, payment formatting, option labels |
| `frontend/src/lib/api/client.ts` | API client method additions |
| `frontend/src/types/index.ts` | TypeScript interface additions |

---

### Financing Center Hub (`financing/page.tsx`)

**Route:** `/dashboard/financing?propertyId=<id>`

**Layout (mobile-first, top to bottom):**

1. **Equity Card** (`EquityCard`) — Shows:
   - Current estimated property value (source badge: "from Appreciation Tracker" or "from purchase price")
   - Remaining mortgage balance (with "Last updated X days ago" freshness notice and "Update" link)
   - **Equity: $X (Y%)** — large primary number
   - **Est. HELOC capacity: ~$Z** — highlighted if `helocEligible = true`, suppressed with a note if not
   - "Refresh" button (triggers `/equity/refresh`)

2. **"Calculate Financing"** input — Large project cost input with a dollar amount field and "Calculate" button. Returns `FinancingCalculatorSheet` inline on the same page (not a separate route). No save required.

3. **Saved Scenarios** — List of `ScenarioCard` components. "No saved scenarios yet" empty state.

4. **Quick links** — "How to enter mortgage details", "What is a HELOC?" (links to Knowledge Hub article).

---

### `FinancingCalculatorSheet.tsx`

The core calculation UI. Used both:
- Inline on the hub page (after entering a project cost)
- As a bottom sheet from inline CTAs in other features

**Sections:**

1. **Project** — Shows project description (e.g. "HVAC Replacement — estimated cost $8,500") and cost (editable inline).

2. **Equity context** — If HELOC eligible: "You have ~$X in usable equity". If not eligible or no profile: "Add your mortgage details for HELOC options →".

3. **Option Comparison** (`OptionComparisonTable`):

   | Option | Monthly Payment | Total Cost | Notes |
   |---|---|---|---|
   | HELOC | $89 (draw) / $114 (repay) | $24,300 | Based on 9.00% rate |
   | Home Equity Loan | $105 | $12,600 | 8.75% fixed, 10 yr |
   | Personal Loan (good credit) | $277 / $191 | $9,969 / $11,456 | 3yr / 5yr at 11.00% |
   | Contractor Financing | $0 (0% for 12mo) | Free if paid in full | $X back-interest if not |
   | Pay Cash | No payment | $0 in interest | Opportunity cost: ~$X over 5yr |

4. **"Save this scenario"** button — names it, saves via `POST /scenarios`.

5. **Disclaimer** — "Rates shown are national averages as of [date]. Actual rates depend on your credit score, lender, and market conditions. This is not a credit offer or rate commitment."

---

### `FinancingCta.tsx` — Inline CTA (Embedded Everywhere)

A compact, embeddable component used in:
- Replace/Repair verdict: "See how to finance this replacement →"
- Capital Timeline events: "Finance options →"
- Budget Forecaster large-month callout: "Can't absorb this month? See financing →"
- Digital Twin scenario results: "Finance this upgrade →"
- Guidance Engine steps involving capital expenditure

When tapped:
1. Opens `FinancingCalculatorSheet` as a bottom sheet
2. Pre-fills `projectCostCents` from the calling feature's data
3. `entryPoint` and `sourceEntityId` are passed for scenario creation

**Props:**

```typescript
interface FinancingCtaProps {
  propertyId: string
  projectCostCents: number
  projectDescription: string
  entryPoint: FinancingEntryPoint
  sourceEntityType?: string
  sourceEntityId?: string
  ctaLabel?: string  // defaults to "See financing options"
  variant?: 'inline' | 'card' | 'chip'
}
```

---

### `EquityCard.tsx`

Displays the equity position prominently:
- Donut chart showing mortgage balance vs equity vs any second mortgage (uses existing Radix chart or a simple SVG)
- Three numbers: Estimated Value, Mortgage Balance, **Equity**
- HELOC capacity line (green if eligible, grey with explanation if not)
- Staleness warning if `mortgageBalanceAsOfDate` > 90 days old: "Your mortgage balance was last updated X days ago — [Update]"

---

### Mortgage Profile Form (`financing/profile/page.tsx`)

A structured form capturing:
- Purchase price + purchase date
- Mortgage type (selector)
- Original balance + current balance + "as of" date
- Interest rate
- Monthly payment
- Second mortgage toggle (expands to balance field)
- PMI toggle

Validation: current balance must be ≤ original balance. Purchase date must be in the past.

---

### API Client Methods

```typescript
// Profile
getFinancingProfile(propertyId: string): Promise<PropertyFinancingProfile | null>
upsertFinancingProfile(propertyId: string, payload: FinancingProfilePayload): Promise<PropertyFinancingProfile>

// Equity
getEquityPosition(propertyId: string): Promise<EquityPosition>
refreshEquityPosition(propertyId: string): Promise<EquityPosition>
getEquityHistory(propertyId: string): Promise<EquityPosition[]>

// Calculator
calculateFinancing(propertyId: string, projectCostCents: number): Promise<FinancingResultSet>

// Scenarios
listFinancingScenarios(propertyId: string): Promise<FinancingScenarioSummary[]>
createFinancingScenario(propertyId: string, payload: CreateScenarioPayload): Promise<FinancingScenario>
getFinancingScenario(propertyId: string, scenarioId: string): Promise<FinancingScenario>
updateFinancingScenario(propertyId: string, scenarioId: string, patch: UpdateScenarioPayload): Promise<FinancingScenario>
archiveFinancingScenario(propertyId: string, scenarioId: string): Promise<void>
```

---

### TypeScript Interfaces

```typescript
type FinancingOptionType = 'HELOC' | 'HOME_EQUITY_LOAN' | 'PERSONAL_LOAN' | 'CONTRACTOR_FINANCING' | 'PAY_CASH'
type MortgageType = 'FIXED_30' | 'FIXED_15' | 'FIXED_20' | 'ARM_5' | 'ARM_7' | 'OTHER'
type FinancingScenarioStatus = 'DRAFT' | 'SAVED' | 'ARCHIVED'
type FinancingEntryPoint = 'REPLACE_REPAIR' | 'CAPITAL_TIMELINE' | 'BUDGET_FORECASTER' | 'DIGITAL_TWIN' | 'DIRECT' | 'GUIDANCE_STEP'

interface PropertyFinancingProfile {
  id: string
  propertyId: string
  purchasePriceCents?: number
  purchaseDate?: string
  mortgageType?: MortgageType
  originalMortgageBalanceCents?: number
  currentMortgageBalanceCents?: number
  mortgageBalanceAsOfDate?: string
  interestRateBps?: number
  monthlyPaymentCents?: number
  hasSecondMortgage: boolean
  secondMortgageBalanceCents?: number
  hasPMI: boolean
  createdAt: string
  updatedAt: string
}

interface EquityPosition {
  id: string
  propertyId: string
  estimatedValueCents: number
  estimatedValueSource: 'APPRECIATION_TRACKER' | 'PURCHASE_PRICE' | 'USER_ENTERED'
  mortgageBalanceCents: number
  secondMortgageBalanceCents: number
  equityCents: number
  equityPercent: number
  ltvPercent: number
  helocCapacityCents: number
  helocEligible: boolean
  computedAt: string
}

interface HELOCResult {
  drawMonthlyPaymentCents: number
  repaymentMonthlyPaymentCents: number
  totalCostCents: number
  totalInterestCents: number
  rateBps: number
}

interface HomeEquityLoanResult {
  monthlyPaymentCents: number
  totalInterestCents: number
  termYears: number
  rateBps: number
}

interface PersonalLoanScenario {
  termYears: number
  rateBps: number
  monthlyPaymentCents: number
  totalInterestCents: number
}

interface PersonalLoanResult {
  scenarios: PersonalLoanScenario[]  // 4 items: min/max rate × 3yr/5yr
}

interface ContractorFinancingResult {
  promoMonths: number
  promoMonthlyIfPaidInFullCents: number
  deferredInterestRiskCents: number
  ongoingMonthlyIfNotPaidCents: number
  ongoingAprBps: number
  warningText: string
}

interface PayCashResult {
  opportunityCostFiveYearCents: number
  opportunityCostTenYearCents: number
  opportunityCostRateBps: number
}

interface FinancingResultSet {
  projectCostCents: number
  helocEligible: boolean
  helocCapacityCents: number
  heloc: HELOCResult
  homeEquityLoan: HomeEquityLoanResult
  personalLoan: PersonalLoanResult
  contractorFinancing: ContractorFinancingResult
  payCash: PayCashResult
  ratesAsOf: string
  disclaimer: string
}

interface FinancingScenarioSummary {
  id: string
  title: string
  projectCostCents: number
  status: FinancingScenarioStatus
  entryPoint: FinancingEntryPoint
  selectedOption?: FinancingOptionType
  createdAt: string
}

interface FinancingScenario extends FinancingScenarioSummary {
  projectDescription?: string
  sourceEntityType?: string
  sourceEntityId?: string
  equitySnapshotCents?: number
  helocCapacitySnapshotCents?: number
  resultsJson: FinancingResultSet
  notes?: string
}

interface CreateScenarioPayload {
  title: string
  projectDescription?: string
  projectCostCents: number
  entryPoint: FinancingEntryPoint
  sourceEntityType?: string
  sourceEntityId?: string
  notes?: string
}

interface UpdateScenarioPayload {
  title?: string
  notes?: string
  selectedOption?: FinancingOptionType
  status?: FinancingScenarioStatus
}
```

---

## Integration Points with Existing Features

### Replace or Repair Analysis

`ReplaceRepairAnalysis` verdict page is updated to render `<FinancingCta>` when `verdict = REPLACE` and `estimatedCostCents > 0`. The CTA is positioned directly beneath the verdict card so the funding path is immediately visible alongside the spend recommendation.

`ReplaceRepairAnalysis` schema gets an optional `linkedFinancingScenarioId` for bidirectional reference.

### Home Capital Timeline

Each `HomeCapitalTimelineItem` card renders a `<FinancingCta variant="chip">` when the event is within 18 months and has an estimated cost. Tapping opens `FinancingCalculatorSheet` pre-filled with the event's cost estimate.

### Budget Forecaster

Months where the forecasted total exceeds the homeowner's stated monthly budget show a "Consider financing" callout with a `<FinancingCta>` pre-filled with that month's largest single expense.

### Home Digital Twin

Each upgrade scenario (HVAC, roof, water heater, insulation, solar) on the Digital Twin results page shows a `<FinancingCta>` pre-filled with the scenario's estimated upfront cost.

### Guidance Engine

Guidance steps that involve a capital expenditure (HVAC replacement, roof repair booking) surface `<FinancingCta>` as a secondary action below the primary "Book a pro" CTA.

### Property Finance Snapshot

The existing Property Finance Snapshot widget is updated to pull from `EquityPosition` rather than deriving a rough estimate from purchase price alone. The equity figure in the snapshot now matches the Financing Center's equity card.

### Appreciation Tracker

`FinancingService.computeEquity()` reads from `PropertyAppreciationIndex` (the Appreciation Tracker model) when available. This creates a live link: when the homeowner refreshes their appreciation estimate, the equity calculation updates automatically on the next `getLatestEquity()` call.

---

## Mobile Navigation

The Financing Center is registered in the mobile tool catalog under **Home Tools**:

```typescript
{
  key: 'financing',
  name: 'Financing Center',
  description: 'Equity position and payment options for home projects',
  hrefSuffix: 'tools/financing',
  navTarget: 'tool:financing',
  icon: resolveToolIcon('home', 'financing'),
  isActive: (pathname) =>
    /^\/dashboard\/(properties\/[^/]+\/tools\/financing|financing)(\/|$)/.test(pathname),
}
```

**Source file:** `frontend/src/components/mobile/dashboard/mobileToolCatalog.ts`

**Dashboard widget:** Properties where `currentMortgageBalanceCents` is set show an equity strip on `MobileDashboardHome.tsx` with the current equity figure and "See financing options →".

---

## Data Flow

```
User reads Replace or Repair verdict: REPLACE — $8,500 estimated
        │
        ▼
FinancingCta component renders beneath verdict card
"See how to finance this replacement →"
        │
        ▼
User taps CTA → FinancingCalculatorSheet opens (bottom sheet)
  └─ projectCostCents = 850000 pre-filled
  └─ GET /financing/equity → EquityPosition loaded
        │
        ▼
EquityPosition computed (if stale or first time):
  ├─ Pull latest value estimate from AppreciationTracker
  ├─ Load PropertyFinancingProfile.currentMortgageBalanceCents
  └─ Compute equity, LTV, HELOC capacity → write EquityPosition row
        │
        ▼
POST /financing/calculate { projectCostCents: 850000 }
  └─ FinancingCalculatorService.computeAll()
  └─ Returns FinancingResultSet with all 5 options
        │
        ▼
OptionComparisonTable renders:
  HELOC: $76/mo draw → $110/mo repay | Total $23,200
  HEL:   $105/mo (10yr) | Total $12,600
  Personal: $186/mo (3yr, 11%) | Total $9,969
  Contractor: $0 for 12mo (0%) → back-interest risk $2,380 if not paid
  Cash: $0/mo | Opportunity cost: ~$2,274 over 5yr
        │
        ▼
User picks "HELOC" → taps "Save this scenario"
  └─ POST /financing/scenarios
     { title: "HVAC Replacement", projectCostCents: 850000,
       entryPoint: "REPLACE_REPAIR", sourceEntityId: "...", selectedOption: "HELOC" }
  └─ FinancingScenario created with resultsJson + rateSnapshot
        │
        ▼
Scenario visible on /financing hub under "Saved Scenarios"
  └─ User can return, compare, or archive

---

First-time equity setup:
User opens /financing hub → no PropertyFinancingProfile yet
        │
        ▼
"Add mortgage details to see your equity" CTA
        └─ Opens /financing/profile form
        └─ User enters: purchase price, current balance, as-of date
        └─ PUT /financing/profile → profile created
        └─ GET /financing/equity → first EquityPosition computed
        └─ EquityCard renders with live numbers
```

---

## Admin Rate Management

The `FinancingRateConfig` table is managed by admins and updated when benchmark rates change materially. The admin panel at `/api/admin/financing/rates` shows all rate configs in a table with current value, label, source note, and effective date. An admin taps "Edit" on any row and enters the new rate in basis points.

Rate updates take effect for new calculations immediately. Existing saved `FinancingScenario` rows retain their `rateSnapshotJson` at the time of creation — historical scenarios are not retroactively recalculated.

A banner on the `FinancingCalculatorSheet` shows "Rates updated [N days ago] — actual rates vary by lender and credit profile."

---

## Current Limitations

- No live rate API. All rates come from admin-managed `FinancingRateConfig`. Admins should update weekly using published Bankrate or Freddie Mac surveys. The "rates as of" date is shown to users.
- No credit score integration. Personal loan and HELOC rate estimates use national averages. A homeowner with excellent credit will see better actual rates; one with fair credit may see worse.
- HELOC capacity uses a standard 85% CLTV limit. Actual lender requirements vary (some go to 90%, some limit at 80% LTV). The disclaimer communicates this.
- Mortgage balance is homeowner-entered and manually refreshed. There is no bank API integration or Plaid-style read access to the actual loan balance. The staleness warning (> 90 days) prompts users to update.
- The Contractor Financing option models a generic deferred-interest structure. Actual contractor financing terms vary by contractor, GreenSky, and similar partners. The calculations are illustrative.
- No lender referral or application in Phase 1. "How to apply" links go to the Knowledge Hub, not a lender.

---

## Phase 2 Roadmap

| Item | Description |
|---|---|
| Plaid / mortgage servicer read | Pull current mortgage balance automatically from the servicer (read-only, no write access) |
| Live rate feeds | Integrate Bankrate or Freddie Mac API for daily rate updates without admin intervention |
| Lender referral network | Partner with 2-3 HELOC lenders for pre-qualification flow without a hard credit pull |
| Credit range input | Allow homeowners to self-report a credit range (Excellent / Good / Fair) to adjust personal loan rate estimates |
| Amortization schedule | Downloadable amortization table for HEL and personal loan scenarios |
| Tax deductibility note | Flag that HELOC and HEL interest *may* be deductible when used for home improvement (with caveat to consult a tax advisor) |
| Scenario comparison view | Side-by-side comparison of two saved scenarios on the hub page |

---

## File Index

### Backend

| Path | Role |
|---|---|
| `apps/backend/src/routes/financing.routes.ts` | Route definitions |
| `apps/backend/src/controllers/financing.controller.ts` | Request handlers |
| `apps/backend/src/services/financing.service.ts` | Profile, equity, scenario logic |
| `apps/backend/src/services/financingCalculator.service.ts` | All payment calculations |
| `apps/backend/src/validators/financing.validators.ts` | Zod v4 schemas |
| `apps/backend/prisma/schema.prisma` | New models and enums |

### Frontend

| Path | Role |
|---|---|
| `apps/frontend/src/app/(dashboard)/dashboard/financing/page.tsx` | Financing Center hub |
| `apps/frontend/src/app/(dashboard)/dashboard/financing/profile/page.tsx` | Mortgage profile entry |
| `apps/frontend/src/app/(dashboard)/dashboard/financing/scenarios/[id]/page.tsx` | Scenario detail |
| `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/financing/page.tsx` | Property-scoped entry |
| `apps/frontend/src/components/features/financing/EquityCard.tsx` | Live equity display |
| `apps/frontend/src/components/features/financing/FinancingCalculatorSheet.tsx` | Calculator bottom sheet |
| `apps/frontend/src/components/features/financing/OptionComparisonTable.tsx` | Option breakdown table |
| `apps/frontend/src/components/features/financing/ScenarioCard.tsx` | Saved scenario card |
| `apps/frontend/src/components/features/financing/MortgageProfileForm.tsx` | Profile form component |
| `apps/frontend/src/components/features/financing/FinancingCta.tsx` | Inline CTA (used across features) |
| `apps/frontend/src/components/features/financing/FinancingUtils.ts` | Rate formatting, helpers |
| `apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts` | Mobile nav registration |
| `apps/frontend/src/lib/api/client.ts` | API client methods |
| `apps/frontend/src/types/index.ts` | TypeScript interfaces |
