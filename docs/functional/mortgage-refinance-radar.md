# Mortgage Refinance Radar

**Feature area:** Financial Tools → Home Tools
**Status:** Production
**Last updated:** 2026-03-16

---

## Overview

The Mortgage Refinance Radar is a passive, always-on monitoring feature that continuously evaluates whether market mortgage rates have dropped enough to make refinancing a homeowner's existing mortgage financially worthwhile. It runs silently in the background, surfacing a clear signal only when conditions cross a conservative, multi-factor threshold — avoiding noisy low-value alerts.

Key design principles:
- **Conservative thresholds** — avoids false positives; requires a meaningful rate gap, minimum monthly savings, and acceptable break-even period simultaneously
- **Hysteresis** — a separate, lower threshold to *close* an open window prevents the radar from flip-flopping when rates hover near the boundary
- **Multi-factor confidence** — opportunities are classified STRONG / GOOD / WEAK based on both break-even speed and monthly savings, not rate gap alone
- **Missed opportunity insight** — surfaces a suppressed historical context view ("rates were lower 3 months ago") only when the delta is materially meaningful
- **Calm, trustworthy copy** — no financial hype; all text is factual and non-judgmental with a standard legal disclaimer

---

## Database

### Enums

| Enum | Values | Purpose |
|------|--------|---------|
| `RefinanceRadarState` | `CLOSED`, `OPEN` | Whether an actionable window is currently detected |
| `RefinanceConfidenceLevel` | `WEAK`, `GOOD`, `STRONG` | Conviction level of the current opportunity |
| `MortgageRateSource` | `FREDDIE_MAC`, `FRED`, `MANUAL`, `IMPORTED` | Provenance of a market rate snapshot |
| `RefinanceScenarioTerm` | `THIRTY_YEAR`, `TWENTY_YEAR`, `FIFTEEN_YEAR` | Loan term for a user scenario calculation |

### Tables

#### `mortgage_rate_snapshots`
Stores weekly market mortgage rate data. One record per `(source, date)` — deduplication is enforced at the DB level.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `date` | `Date` | Survey date (YYYY-MM-DD) |
| `rate30yr` | `Float` | 30-year fixed rate as a **percentage** (e.g. `6.875`) |
| `rate15yr` | `Float` | 15-year fixed rate as a **percentage** |
| `source` | `MortgageRateSource` | Where the data came from |
| `sourceRef` | `String?` | External ref (e.g. `FRED/MORTGAGE30US+MORTGAGE15US`) |
| `metadataJson` | `Json?` | Arbitrary ingestion metadata |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` | |

**Indexes:** `(source, date)` unique, `date DESC`, `source`, `(source, date DESC)`

#### `refinance_opportunities`
Accumulates every evaluation result per property. Supports history and trend views.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `propertyId` | `uuid` FK → `Property` | Cascade delete |
| `currentRate` | `Float` | Homeowner's mortgage rate at evaluation time (%) |
| `marketRate` | `Float` | Market 30-yr rate used in evaluation (%) |
| `rateGap` | `Float` | `currentRate - marketRate` |
| `loanBalance` | `Decimal(12,2)` | Estimated remaining principal |
| `monthlySavings` | `Decimal(12,2)` | Estimated monthly P&I savings |
| `breakEvenMonths` | `Int` | Months to recoup closing costs |
| `lifetimeSavings` | `Decimal(12,2)` | Net interest savings after closing costs |
| `confidenceLevel` | `RefinanceConfidenceLevel` | |
| `radarState` | `RefinanceRadarState` | State at evaluation time |
| `evaluationDate` | `Date` | Date of this evaluation |
| `triggerDate` | `DateTime?` | When the CLOSED → OPEN transition was first detected |
| `closingCostAssumption` | `Decimal(12,2)?` | Closing cost used in the calculation |
| `remainingTermMonths` | `Int?` | Months remaining on current loan |
| `metadataJson` | `Json?` | Full assumption set used |

**Indexes:** `(propertyId, createdAt DESC)`, `(propertyId, radarState)`, `(propertyId, evaluationDate DESC)`, `confidenceLevel`

#### `property_refinance_radar_states`
One row per property — fast current-state lookup without scanning opportunity history.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `propertyId` | `uuid` unique FK → `Property` | Cascade delete |
| `radarState` | `RefinanceRadarState` | Current state; default `CLOSED` |
| `currentOpportunityId` | `uuid?` unique FK → `RefinanceOpportunity` | The opportunity that opened the current window |
| `lastRateSnapshotId` | `uuid?` FK → `MortgageRateSnapshot` | Most recent snapshot used in evaluation |
| `lastEvaluatedAt` | `DateTime?` | Last time `evaluate` was called |
| `lastOpenedAt` | `DateTime?` | When the window last opened |
| `lastClosedAt` | `DateTime?` | When the window last closed |
| `metadataJson` | `Json?` | |

**Indexes:** `radarState`, `lastEvaluatedAt`

#### `refinance_scenario_snapshots`
Records user-run scenario calculations. `isSaved = true` for explicitly bookmarked scenarios.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `propertyId` | `uuid` FK → `Property` | Cascade delete |
| `targetRate` | `Float` | Hypothetical new rate (%) |
| `targetTerm` | `RefinanceScenarioTerm` | |
| `closingCost` | `Decimal(12,2)` | Closing cost used |
| `monthlySavings` | `Decimal(12,2)?` | |
| `breakEvenMonths` | `Int?` | |
| `lifetimeSavings` | `Decimal(12,2)?` | |
| `isSaved` | `Boolean` | Default `false` |
| `metadataJson` | `Json?` | Full assumption set |

### Property model relations
```
Property {
  refinanceOpportunities    RefinanceOpportunity[]
  refinanceRadarState       PropertyRefinanceRadarState?
  refinanceScenarios        RefinanceScenarioSnapshot[]
}
```

---

## Backend

### File structure
```
apps/backend/src/refinanceRadar/
├── config/
│   └── refinanceRadar.config.ts        # All thresholds and constants
├── engine/
│   ├── refinanceCalculation.engine.ts  # Pure amortization math
│   ├── refinanceRadar.engine.ts        # Opportunity detection + confidence
│   └── mortgageRate.service.ts         # Rate snapshot CRUD + trend
├── mappers/
│   └── refinanceRadar.mapper.ts        # Prisma rows → API DTOs
├── types/
│   └── refinanceRadar.types.ts         # All TypeScript interfaces
├── validators/
│   └── refinanceRadar.validators.ts    # Zod v4 request schemas
├── refinanceRadar.service.ts           # Orchestration + DB writes
├── refinanceRadar.controller.ts        # HTTP handlers
└── refinanceRadar.routes.ts            # Express route definitions
```

### Config (`refinanceRadar.config.ts`)

All thresholds are centralised here — tune without touching business logic.

| Constant | Value | Purpose |
|----------|-------|---------|
| `MIN_RATE_GAP_PCT` | `0.50%` | Rate gap required to open a window |
| `CLOSE_RATE_GAP_PCT` | `0.40%` | Rate gap below which an open window closes (hysteresis buffer) |
| `MAX_BREAK_EVEN_MONTHS_OPPORTUNITY` | `48` | Maximum break-even to qualify at all |
| `MIN_MONTHLY_SAVINGS_USD` | `$100` | Minimum monthly savings to qualify |
| `MIN_LIFETIME_SAVINGS_USD` | `$10,000` | Minimum lifetime savings to qualify |
| `MIN_REMAINING_TERM_MONTHS` | `60` | Must have ≥ 5 years left on current loan |
| `MIN_LOAN_BALANCE_USD` | `$80,000` | Minimum balance to make refinance meaningful |
| `CONFIDENCE_THRESHOLDS.STRONG` | ≤ 24mo + ≥ $200/mo | Criteria for STRONG confidence |
| `CONFIDENCE_THRESHOLDS.GOOD` | ≤ 36mo + ≥ $100/mo | Criteria for GOOD confidence |
| `CONFIDENCE_THRESHOLDS.WEAK` | ≤ 48mo | Fallback when break-even qualifies but savings are modest |
| `MISSED_OPPORTUNITY_THRESHOLDS.MIN_RATE_DELTA_PCT` | `0.20pp` | Minimum historical rate advantage to surface missed-window insight |
| `MISSED_OPPORTUNITY_THRESHOLDS.MIN_LIFETIME_SAVINGS_DELTA_USD` | `$10,000` | Minimum lifetime savings difference |
| `MISSED_OPPORTUNITY_MIN_SAVINGS_DELTA_USD` | `$50/mo` | Secondary monthly savings guard |
| `MISSED_OPPORTUNITY_LOOKBACK_DAYS` | `180` | How far back to look for missed windows |
| `RATE_TREND_LOOKBACK_SNAPSHOTS` | `12` | Number of snapshots for trend display |
| `DEFAULT_CLOSING_COST_PCT` | `2.5%` | Default closing cost assumption |

### Calculation engine (`refinanceCalculation.engine.ts`)

Pure functions, no side effects, fully testable.

**`calcMonthlyPayment(principal, annualRatePct, termMonths)`**
- Standard P&I amortization: `M = P·r(1+r)^n / ((1+r)^n − 1)`
- Zero-rate edge case handled (returns `principal / term`)
- Guards: rejects NaN, Infinity, negative rate, zero/negative principal or term → returns `0`

**`calcRefinanceScenario(input)`**
- Input clamping: rates capped at 30%, closing cost pct capped at 10%, terms rounded to integers
- Returns: `rateGapPct`, `effectiveClosingCostUsd`, `currentMonthlyPayment`, `newMonthlyPayment`, `monthlySavings`, `breakEvenMonths` (null when savings ≤ 0), `totalInterestRemainingCurrent`, `totalInterestNewLoan`, `lifetimeSavings` (net of closing costs), `payoffDeltaMonths`

**Rate convention:**
`PropertyFinanceSnapshot.interestRate` is stored as a **decimal fraction** (0.0625 = 6.25%). The engine works in **percentage form**. Conversion happens in `getMortgageContext()` via `× 100`.

### Radar engine (`refinanceRadar.engine.ts`)

**`classifyConfidence(breakEvenMonths, monthlySavings)`**
Multi-factor classification — both dimensions must meet threshold:
- STRONG: break-even ≤ 24mo **AND** monthly savings ≥ $200
- GOOD: break-even ≤ 36mo **AND** monthly savings ≥ $100
- WEAK: fallback (break-even ≤ 48mo)

**`evaluate(mortgageInput, currentRadarState?)`**
- Fetches latest market snapshot, runs `calcRefinanceScenario`
- Applies hysteresis: if radar is currently OPEN, uses `CLOSE_RATE_GAP_PCT` (0.40%) instead of `MIN_RATE_GAP_PCT` (0.50%) to prevent flip-flopping
- Runs 5 qualification gates: rate gap, remaining term, loan balance, monthly savings, lifetime savings, break-even
- Returns `isOpportunity`, `radarState`, `confidenceLevel`, `notQualifiedReasons[]`, `summary` text, `latestSnapshotId`

**`evaluateMissedOpportunity(mortgageInput)`**
- Looks back `MISSED_OPPORTUNITY_LOOKBACK_DAYS` (180 days) of rate history
- 3 suppression gates: rate delta < 0.20pp → skip; lifetime savings delta < $10k → skip; monthly savings delta < $50 → skip
- Returns calm, non-judgmental prose summary

### Service (`refinanceRadar.service.ts`)

Orchestrates all DB reads/writes. The engine never writes to the DB.

| Method | Description |
|--------|-------------|
| `evaluateProperty(propertyId)` | Pre-reads current radar state, calls engine, persists result, returns status DTO |
| `getCurrentStatus(propertyId)` | Returns persisted state (evaluates if no prior record exists) |
| `getMortgageContext(propertyId)` | Reads `PropertyFinanceSnapshot`, converts rate fraction → percentage |
| `persistEvaluationResult(...)` | Upserts `PropertyRefinanceRadarState`, creates `RefinanceOpportunity` with same-day dedup |
| `getOpportunityHistory(propertyId, limit, offset)` | Paginated history |
| `getMissedOpportunity(propertyId)` | Delegates to engine's `evaluateMissedOpportunity` |
| `getRateHistory(limit)` | Recent snapshots + trend summary |
| `runScenario(propertyId, input)` | Calculates + optionally persists scenario |
| `getSavedScenarios(propertyId)` | Returns `isSaved = true` scenarios |
| `ingestRateSnapshot(input)` | Delegates to `MortgageRateService.ingestSnapshot()` |

**Same-day dedup logic in `persistEvaluationResult`:**
Checks for an existing `RefinanceOpportunity` with `evaluationDate = today`. If found, skips creating a new record. State transitions (`lastOpenedAt`, `lastClosedAt`) are recorded only on actual CLOSED ↔ OPEN changes.

### API Routes

Base path: `/api`
All property-scoped routes require `authenticate` + `propertyAuthMiddleware`.
Admin route requires `authenticate` + `requireRole('ADMIN')`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/properties/:propertyId/refinance-radar` | Current radar status |
| `POST` | `/properties/:propertyId/refinance-radar/evaluate` | Trigger fresh evaluation |
| `GET` | `/properties/:propertyId/refinance-radar/history` | Paginated opportunity history (`?limit&offset`) |
| `GET` | `/properties/:propertyId/refinance-radar/missed-opportunity` | Missed window insight |
| `GET` | `/properties/:propertyId/refinance-radar/rates` | Rate history + trend (`?limit`) |
| `POST` | `/properties/:propertyId/refinance-scenario` | Run scenario calculation |
| `GET` | `/properties/:propertyId/refinance-scenario/saved` | Saved scenario snapshots |
| `POST` | `/admin/refinance-radar/rate-snapshots` | Ingest market rate snapshot |

### Validators (`refinanceRadar.validators.ts`)

| Schema | Validates |
|--------|-----------|
| `ingestRateSnapshotSchema` | `date` (YYYY-MM-DD regex), `rate30yr`/`rate15yr` (0–30%), `source` (enum), `sourceRef`, `metadataJson` |
| `runScenarioSchema` | `targetRate` (0–30%), `targetTerm` (enum), `closingCostAmount` (max $500k) or `closingCostPercent` (max 20%) — mutually exclusive, `saveScenario` |
| `historyQuerySchema` | `limit` (1–100, default 20), `offset` (default 0) |
| `rateHistoryQuerySchema` | `limit` (1–52, default 12) |

### Mapper (`refinanceRadar.mapper.ts`)

Converts Prisma rows → API-safe DTOs:
- `mapOpportunityToDTO(row)` — `Decimal → number` via `.toNumber()`, `Date → YYYY-MM-DD string`
- `mapScenarioToDTO(row)` — includes `targetTermMonths` derived from `TERM_TO_MONTHS` lookup

---

## Frontend

### File structure
```
apps/frontend/src/
├── app/(dashboard)/dashboard/properties/[id]/
│   ├── tools/mortgage-refinance-radar/
│   │   ├── page.tsx                         # Next.js route shell (server component)
│   │   ├── MortgageRefinanceRadarClient.tsx  # Full-page tool UI ('use client')
│   │   └── mortgageRefinanceRadarApi.ts      # Typed API client functions + types
│   └── components/
│       └── RefinanceRadarDashboardCard.tsx   # Preview card on property dashboard
└── lib/
    ├── config/featureFlags.ts               # MORTGAGE_REFINANCE_RADAR flag
    └── api/adminWorkerJobs.ts               # JobCategory type (FINANCIAL_MARKET added)
```

### Tool page (`MortgageRefinanceRadarClient.tsx`)

**Pattern:** Follows `CapitalTimelineClient` — `useState` + `useEffect` (not React Query).

**Race condition guard:** `reqRef = useRef(0)` — each load/evaluate increments the ref; stale responses from superseded requests are discarded.

**State cleared on property switch:** `setData(null)` and `setRateData(null)` at the top of `load()` prevents stale data from a previous property rendering during navigation.

**Sections rendered in order:**
1. **`RadarStatusHero`** — state badge (Open/Closed), confidence badge, radar summary text, KPI grid (rate gap, monthly savings, break-even, lifetime savings) when OPEN; "why not yet" reasons when CLOSED; loan context footer
2. **`RateTrendCard`** — current 30yr / 15yr rates, prior period rate, trend icon (↑ rising / ↓ falling / — stable)
3. **`MissedOpportunityCard`** — shown only when `hasMissedOpportunity = true`; calm historical context with peak rate, date, and savings delta
4. **`ScenarioCalculator`** — user inputs: target rate (validated 0.1–30%), loan term (pill selector), optional closing cost; calls `runScenario` API; renders full result KPI grid with disclaimer
5. **`RateHistoryCard`** — table of recent snapshots, expandable from 4 → 12 rows
6. **Disclaimer** — appended at bottom of all available states

**Action safety:**
- Re-evaluate button: `disabled={evaluating || loading}` prevents double-submit
- Scenario run button: `disabled={running}` with spinner feedback
- Client-side validation on rate input before API call

### Dashboard preview card (`RefinanceRadarDashboardCard.tsx`)

**Pattern:** Follows `NeighborhoodRadarDashboardCard`.

Uses React Query: `useQuery(['refinance-radar-status', propertyId], staleTime: 10 * 60 * 1000)`.

**Three render states:**
1. **Unavailable** — mortgage data not set up; prompt to add financial details
2. **Monitoring (CLOSED)** — "Radar monitoring. No opportunity detected." with last-evaluated date
3. **Opportunity (OPEN)** — confidence badge, rate gap, monthly savings, link to full tool

Feature-gated: `enabled: Boolean(propertyId) && FEATURE_FLAGS.MORTGAGE_REFINANCE_RADAR`

### API client (`mortgageRefinanceRadarApi.ts`)

| Function | HTTP | Description |
|----------|------|-------------|
| `getRadarStatus(propertyId)` | GET | Current status (available or unavailable) |
| `evaluateRadar(propertyId)` | POST | Trigger fresh evaluation |
| `getOpportunityHistory(propertyId, limit, offset)` | GET | Paginated history |
| `getMissedOpportunity(propertyId)` | GET | Missed window insight |
| `getRateHistory(propertyId, limit)` | GET | Rate snapshots + trend |
| `runScenario(propertyId, input)` | POST | Scenario calculation |
| `getSavedScenarios(propertyId)` | GET | Saved scenarios |

**Response discrimination:** `RadarStatusDTO` is a union type:
```typescript
type RadarStatusDTO = RadarStatusAvailable | RadarStatusUnavailable
// discriminated by: data.available === true | false
```

**Unavailable reasons:** `MISSING_MORTGAGE_DATA` | `NO_RATE_DATA` | `PROPERTY_NOT_FOUND`

### Mobile Navigation

| Location | Detail |
|----------|--------|
| **Tool catalog** | `mobileToolCatalog.ts` → `MOBILE_HOME_TOOL_LINKS` — entry with `id: 'mortgage-refinance-radar'`, label, icon, group |
| **Home Tools page** | `home-tools/page.tsx` → `HOME_TOOL_GROUPS['ownership']` array — appears in the Ownership group alongside Break-Even, Capital Timeline, True Cost |
| **Tool rail** | `HomeToolsRail` renders with `context="mortgage-refinance-radar"` showing related tools |
| **Icon** | `HOME_TOOL_ICON_OVERRIDES: { MORTGAGE_REFINANCE_RADAR: 'BarChart2' }` in `iconMapping.ts` |
| **Context tools** | `contextToolMappings.ts` → `'mortgage-refinance-radar': ['break-even', 'capital-timeline', 'true-cost']` |
| **Page context** | `resolvePageContext.ts` → route pattern registered for `mortgage-refinance-radar` |
| **Feature flag** | `featureFlags.ts` → `MORTGAGE_REFINANCE_RADAR: process.env.NEXT_PUBLIC_FEATURE_MORTGAGE_REFINANCE_RADAR !== 'false'` (opt-out pattern — on by default) |
| **Tool registry** | `toolRegistry.ts` → `TOOL_IDS` includes `'mortgage-refinance-radar'`; `HOME_TOOL_REGISTRY` auto-built from catalog |

---

## Worker

### File structure
```
apps/workers/src/jobs/
└── ingestMortgageRates.job.ts    # Weekly FRED rate fetch + ingestion
```

### Job: `ingestMortgageRates.job.ts`

**Schedule:** Every Thursday at 17:00 EST (`0 17 * * 4`) — aligned with Freddie Mac's weekly PMMS release day.

**Registry key:** `mortgage-rate-ingest` | **Category:** `FINANCIAL_MARKET`

**Data source precedence:**

| Priority | Source | Env vars required | Stored as |
|----------|--------|-------------------|-----------|
| 1 | FRED API (St. Louis Fed) | `FRED_API_KEY` | `source: FRED` |
| 2 | Manual env var fallback | `MORTGAGE_RATE_30YR_FALLBACK` + `MORTGAGE_RATE_15YR_FALLBACK` | `source: MANUAL` |
| 3 | Skip | — | Nothing written; logs warning |

**FRED API series:**
- `MORTGAGE30US` — Freddie Mac 30-Year Fixed-Rate Mortgage Average
- `MORTGAGE15US` — Freddie Mac 15-Year Fixed-Rate Mortgage Average

**Behaviour:**
- 15-second HTTP timeout with `AbortController`
- Handles FRED's `"."` sentinel (missing/preliminary data) gracefully
- Idempotent — calls `MortgageRateService.ingestSnapshot()` which deduplicates on `(source, date)`
- Never crashes the worker on failure — skips and logs

**Return type:** `MortgageRateIngestResult`
```typescript
{
  success: boolean;
  source: 'FRED' | 'MANUAL' | 'NONE';
  date: string | null;
  rate30yr: number | null;
  rate15yr: number | null;
  created: boolean;   // false if snapshot already existed for this date
  skipped: boolean;
  reason?: string;
}
```

### Docker (`infrastructure/docker/workers/Dockerfile`)

The worker Dockerfile uses a two-stage build. The refinanceRadar files are copied into a `src/shared/backend/` layer during the builder stage and their import paths are rewritten via `sed` before TypeScript compilation.

**Files copied into shared layer:**

| Backend source | Shared destination |
|---|---|
| `refinanceRadar/engine/mortgageRate.service.ts` | `src/shared/backend/refinanceRadar/engine/` |
| `refinanceRadar/config/refinanceRadar.config.ts` | `src/shared/backend/refinanceRadar/config/` |
| `refinanceRadar/types/refinanceRadar.types.ts` | `src/shared/backend/refinanceRadar/types/` |

**Import path rewrite (sed):**
```
../../../backend/src/refinanceRadar/engine/mortgageRate.service
  → ../shared/backend/refinanceRadar/engine/mortgageRate.service
```

**Runtime stage:** Only `dist/` and `node_modules` are copied — the shared source files are compiled away and not present at runtime.

### Kubernetes deployment (`infrastructure/kubernetes/apps/workers/deployment.yaml`)

`FRED_API_KEY` is injected as a Kubernetes secret reference:
```yaml
- name: FRED_API_KEY
  valueFrom:
    secretKeyRef:
      name: app-secrets
      key: FRED_API_KEY
```

The secret value must be set manually in the `app-secrets` Kubernetes Secret (not committed to Git).

---

## Integration Points

| System | Integration |
|--------|-------------|
| **PropertyFinanceSnapshot** | Source of `interestRate` (fraction), `loanBalance`, `mortgageTermYears`, `monthlyPayment`. Rate converted fraction → percentage at extraction boundary in `getMortgageContext()` |
| **Property model** | Three new relations: `refinanceOpportunities[]`, `refinanceRadarState?`, `refinanceScenarios[]` — all cascade-delete |
| **Worker job registry** | `workerJobRegistry.ts` is the single source of truth; new `FINANCIAL_MARKET` category added |
| **Admin worker-jobs UI** | `FINANCIAL_MARKET` category added to `adminWorkerJobs.ts` type and `worker-jobs/page.tsx` display |
| **FRED API** | External: `api.stlouisfed.org/fred/series/observations` — free, no auth beyond API key; publishes weekly mortgage rate data |
| **Feature flags** | `NEXT_PUBLIC_FEATURE_MORTGAGE_REFINANCE_RADAR` — opt-out pattern (on by default) |

---

## Assumptions

| Assumption | Value | Where configured |
|------------|-------|-----------------|
| Default closing cost | 2.5% of loan balance | `DEFAULT_CLOSING_COST_PCT` in config |
| Radar benchmark term | 30-year fixed | Hard-coded in `evaluate()` — `targetTermMonths: 360` |
| Rate convention in DB | `PropertyFinanceSnapshot.interestRate` is a **decimal fraction** | `getMortgageContext()` conversion |
| Rate convention in engine | Rates are **percentage form** (e.g. `6.25`) | All engine functions and `MortgageRateSnapshot` columns |
| Monthly payment | Computed from amortization if `currentMonthlyPayment` not in `PropertyFinanceSnapshot` | `calcRefinanceScenario` |
| Market rate for evaluation | Most recent snapshot across all sources | `MortgageRateService.getLatestSnapshot()` |
| Closing cost cap | Cannot exceed loan balance | Guardrail in `calcRefinanceScenario` |
| Maximum realistic rate | 30% | Clamped in `calcRefinanceScenario`; enforced in Zod validators |
| Rate data freshness | No staleness check — evaluates against whatever snapshot is newest in DB | Addressed by weekly worker job |
| Same-day dedup | One `RefinanceOpportunity` record per property per calendar day | `persistEvaluationResult()` |

---

## Unit Tests

Located in `apps/backend/tests/unit/` — run with `node --test`.

| File | Coverage |
|------|----------|
| `refinanceCalculation.test.js` | 24 tests: `calcMonthlyPayment` (zero rate, zero principal, NaN, Infinity, negative inputs), `calcTotalInterest`, `calcRefinanceScenario` (beneficial scenario, break-even math, lifetime savings net of closing costs, term shortening, closing cost overrides, clamping) |
| `refinanceRadarEngine.test.js` | 22 tests: `classifyConfidence` (STRONG/GOOD/WEAK at boundaries), config invariants (hysteresis buffer ≥ 0.05pp, STRONG < GOOD < WEAK thresholds), missed-opportunity suppression constants |

---

## Future Enhancements

| Enhancement | Description | Effort |
|------------|-------------|--------|
| **Refinance alerts** | Push/email notification when radar flips from CLOSED → OPEN | Medium |
| **15-year benchmark** | Add a 15-year radar evaluation alongside the 30-year default | Small |
| **Lender rate integration** | Pull personalized rates from a lender API (e.g. Optimal Blue) factoring in credit score and LTV | Large |
| **Rate lock advisor** | Given a rate trend direction, recommend whether to lock now or wait | Medium |
| **Amortization chart** | Visual comparison of current vs. refinanced payment schedules | Small |
| **Credit score input** | Allow homeowners to input their credit range to adjust the market rate assumption | Small |
| **Multi-property comparison** | Dashboard view ranking all properties by refinance opportunity strength | Medium |
| **Equity-out scenario** | Cash-out refinance calculator alongside the standard rate-reduction scenario | Medium |
| **Freddie Mac direct feed** | Replace FRED (weekly lag) with a Freddie Mac direct API or same-day data vendor for real-time rates | Large |
| **Admin bulk re-evaluate** | Worker job that re-runs `evaluateProperty` for all properties after each rate ingest | Small |
| **Opportunity history chart** | Graph of rate gap and confidence level over time for a property | Small |
| **Closing cost input** | Let homeowners enter their actual lender quote to replace the 2.5% default | Small |
