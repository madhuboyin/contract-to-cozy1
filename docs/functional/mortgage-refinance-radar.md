# Mortgage Refinance Radar

**Feature area:** Homeowner Product → Save & Optimize

**Capability ID:** `mortgage-refinance-radar`

**Canonical route:** `/dashboard/properties/[id]/tools/mortgage-refinance-radar`

**Status:** Production in-product experience; external email and Web Push remain controlled-rollout only

**Last updated:** 2026-08-01

## Product contract

Mortgage Refinance Radar is an always-on, property-specific decision capability. It combines the
canonical Financing profile with current national benchmark rates, detects material refinance
windows, explains the modeled tradeoffs, supports reviewed official Loan Estimate comparison, and
lets the homeowner record a durable decision and verified outcome.

It is educational planning support. A national benchmark is not a personalized rate or lender
offer. ContractToCozy does not select, endorse, rank for compensation, contact, or transmit data to
a lender. Official disclosures and lender or professional confirmation remain authoritative.

The capability is catalog-discoverable. Material `OPEN` and `UPDATE` transitions enter the
canonical Home Action feed; passive monitoring and `CLOSED` states stay quiet. The primary
completion is an explicit refinance decision, not a view, scenario run, export, or download.

## Homeowner journey

The page presents one staged journey:

1. conclusion and potential modeled impact;
2. why the conclusion applies and the important caveats;
3. the recommended next step;
4. optional scenario exploration;
5. optional official Loan Estimate comparison;
6. decision and outcome tracking; and
7. expandable monitoring, source, freshness, eligibility, assumptions, and alert settings.

Supported result states are:

- `OPEN`: a material modeled opportunity is worth reviewing;
- material `UPDATE`: an existing opportunity changed enough to merit review;
- `CLOSED`: no modeled opportunity currently meets the conservative gates;
- `DATA_REQUIRED`: missing mortgage facts are worth collecting after a meaningful market change;
- no mortgage, no market data, stale mortgage data, stale market data, unavailable, and retryable
  error states.

No missing, stale, unavailable, or failed state is rendered as a successful zero or all-clear.

## Canonical data ownership

`PropertyFinancingProfile` owns mortgage status, balance, interest rate, remaining term, payment,
loan type, mortgage insurance, second-mortgage context, and the balance as-of date. Radar reads and
updates this profile; it does not maintain a competing mortgage-facts model.

Radar-owned persistence includes:

- `MortgageRateSnapshot`: deduplicated 30-year and 15-year benchmark observations;
- `RefinanceOpportunity`: immutable evaluation results and modeled assumptions;
- `PropertyRefinanceRadarState`: the latest OPEN/CLOSED state and source pointers;
- `RefinanceEvaluationClaim`: durable per-property/per-snapshot work, leases, retries, and dead
  letters;
- `RefinanceScenarioSnapshot`: explicitly saved scenario calculations;
- `RefinanceLoanEstimateComparisonSnapshot`: explicitly saved reviewed comparisons;
- `RefinanceDecision` and `RefinanceDecisionHistory`: the homeowner-controlled lifecycle and
  idempotent transition history; and
- property-scoped alert preferences and push subscriptions.

No migration script or legacy backfill was introduced for the audit implementation. Schema
reconciliation remains a separately controlled database operation.

## Market ingestion and worker evaluation

The registered `mortgage-rate-ingest` job runs Thursdays after the Freddie Mac PMMS release. It
reads the FRED `MORTGAGE30US` and `MORTGAGE15US` series, with a configured manual fallback, and
deduplicates by source and observation date.

After ingestion, the worker resumes both durable sweeps even when the snapshot already exists:

- eligible Financing profiles are evaluated through leased `RefinanceEvaluationClaim` records;
- missing-data eligibility is evaluated separately for a bounded `DATA_REQUIRED` action;
- retries are bounded and exhausted work becomes dead-lettered;
- replay-safe `OPEN`, material `UPDATE`, `CLOSED`, and `DATA_REQUIRED` domain events are emitted;
- `CLOSED` resolves the current refinance Home Action; and
- OPEN/UPDATE external delivery remains subject to every consent, freshness, confidence, cooldown,
  channel, and cohort gate.

Evaluation uses OPEN/CLOSED hysteresis plus minimum rate-gap, balance, remaining-term, monthly
savings, lifetime-savings, and break-even gates. Stale mortgage or market inputs reduce readiness
and suppress external alerts.

## Home and multi-property behavior

Radar does not own a parallel Unified Home priority card. `OPEN`, material `UPDATE`, and eligible
`DATA_REQUIRED` events adapt into stable, deduplicated canonical Home Actions. The shared Home
Action ranker decides whether a refinance action appears as `NOW`, `SOON`, `PLAN`, or `CONSIDER`
relative to safety, maintenance, coverage, and other financial work.

For households with multiple properties, each property is evaluated independently and its action
retains property context. Cross-property priority is determined by the shared action ranking and
portfolio selection behavior, not a refinance-only ordering system. Dismiss, defer, not-relevant,
correct-fact, and no-mortgage feedback use the shared Home Action lifecycle.

The property detail page may show a local radar preview. That preview is not a second Unified Home
priority mechanism.

## Scenario planning

The scenario engine models payment, APR estimate, closing-cost breakdown, break-even, lifetime
savings, total remaining interest, cash to close, and payoff-date movement. It supports 15-, 20-,
and 30-year terms and balanced, lower-payment, faster-payoff, and lower-total-cost objectives.

The homeowner can compare the modeled refinance with applicable alternatives:

- retain the current mortgage;
- make additional principal payments;
- request a recast where the servicer permits it;
- choose a shorter, preserved, or extended term; and
- explore cash-out only as a conditional planning path.

FHA, VA, jumbo/high-balance, ARM-to-fixed, mortgage-insurance, second-lien, occupancy, property-type,
and multiple-mortgage context is explanatory rather than an eligibility or approval determination.
Scenarios are transient unless the homeowner explicitly saves them. Markdown exports are generated
for homeowner-controlled review and are never transmitted automatically.

## Official Loan Estimate comparison

The comparison accepts two to four manually entered or reviewed extracted Loan Estimates. PDF and
image intake is memory-only, magic-byte validated, capped at three pages, locally OCR processed,
and not retained. OCR-derived fields are editable, provenance-marked, confidence-capped, and require
explicit review.

The comparison preserves disclosed loan amount, product and term, note rate, APR, principal and
interest, estimated total payment, mortgage insurance, lender costs and credits, discount points,
cash-to-close direction, issue and rate-lock dates, and page-3 five-year totals. Unlike loan amounts,
terms, products, dates, locks, incomplete projected payments, mixed cash directions, and inconsistent
points produce visible comparability warnings instead of misleading winners.

Saved comparisons are opt-in and property-scoped. Lock warnings are recomputed when loaded.
Permanent deletion requires explicit confirmation. A selected-lender discussion brief omits
competitor identities and is downloaded for manual homeowner sharing only.

## Decision and verified outcome

Supported decision states are `EXPLORING`, `DEFERRED`, `KEEP_CURRENT_LOAN`, `PROCEEDING`,
`OFFER_SELECTED`, `APPLICATION_IN_PROGRESS`, `CLOSED`, `DECLINED`, `ABANDONED`, and `SUPERSEDED`.
Transitions are validated, versioned, idempotent, property-authorized, and recorded in durable
history. A decision may link to a saved scenario or reviewed comparison and selected offer.

A verified `CLOSED` transition requires homeowner-confirmed new balance, rate, and term, with
optional payment and recorded closing cost. The transaction writes the new canonical Financing
facts and preserves purpose-limited prior/new closing evidence for aggregate outcome measurement.
Closing, application, or selection is never inferred from a page view, export, or lender brief.

## Alerts and fail-closed rollout

Home monitoring remains available without external delivery. Email and Web Push are explicit opt-in
channels with cadence, sensitivity, quiet hours, cooldown, freshness, confidence, and material-change
checks. Push additionally requires an active subscription and complete VAPID configuration.

Production defaults remain fail-closed:

| Configuration | Required production baseline |
| --- | --- |
| `REFINANCE_EXTERNAL_ALERTS_ENABLED` | `false` until controlled email activation |
| `REFINANCE_PUSH_ALERTS_ENABLED` | `false` until controlled push activation |
| `WEB_PUSH_DELIVERY_ENABLED` | `false` until transport approval |
| `REFINANCE_ALERT_ROLLOUT_MODE` | `ALLOWLIST` |
| `REFINANCE_ALERT_RECIPIENT_EMAIL_ALLOWLIST` | secret-backed explicit internal recipients only |

Admission is enforced when the alert is created and again by email and push transport. Missing,
invalid, or non-member rollout configuration suppresses delivery. `GENERAL` requires a recorded
approval after delivery, duplicate, opt-out, complaint, usefulness, and freshness evidence passes.

These flags do not authorize automated lender transmission, lead sale, referral routing, or any
commercial action. Such behavior requires a separate product, privacy, compliance, security, and
operational authorization plus a new reviewed implementation. No such implementation currently
exists.

See [Mortgage Refinance Radar alert rollout and incident runbook](../operations/MORTGAGE_REFINANCE_RADAR_ALERT_ROLLOUT_AND_INCIDENT_RUNBOOK.md).

## Analytics and privacy

`GET /api/admin/analytics/refinance-radar` requires an authenticated administrator, MFA, and
`ANALYTICS_VIEW`. The report covers evaluation coverage, transitions, decision distribution,
OPEN-to-decision time, defer/return, comparison/selection, selection/application,
application/close, stale/reopened decisions, verified Financing writeback, and projected-versus-
recorded outcome medians.

The report returns aggregates only. It does not return property IDs, homeowner IDs, balances,
rates, payments, costs, or offer identifiers. Sensitive projected or verified value aggregates are
suppressed below five observations from five distinct properties. Controlled optimization also
requires at least 20 usefulness responses with a 60% helpful rate and at least 20 notification
records with no more than a 5% duplicate rate.

See [Mortgage Refinance Radar measurement and optimization](../operations/MORTGAGE_REFINANCE_RADAR_MEASUREMENT_AND_OPTIMIZATION.md).

## API surface

All property routes require authentication and `propertyAuthMiddleware`. The surface includes:

- status, explicit evaluation, history, missed-opportunity, rate history, and telemetry;
- scenario run, save, list, and Markdown export;
- alert preference and push-subscription management;
- Loan Estimate compare, reviewed extraction, save, list, delete, comparison export, and manual
  handoff export;
- decision read, record, and delete; and
- feedback recording.

Rate ingestion is admin-only. Analytics is admin/MFA/capability-authorized.

## Acceptance and operational evidence

The dedicated deterministic browser suite covers desktop Chromium plus mobile Chromium and WebKit.
It exercises no-mortgage, partial, current, stale, unavailable, OPEN, UPDATE, CLOSED, retry,
scenario, comparison, alerts, Home Action lifecycle, decision, closing, canonical writeback,
keyboard, reduced-motion, table-equivalence, and WCAG A/AA behavior.

Relevant commands:

```bash
cd apps/backend
npm run build
node --test tests/unit/refinanceRadarMetricsService.test.js tests/unit/refinanceDecisionLifecycle.test.js

cd ../frontend
npm run test:mortgage-refinance:e2e
node scripts/product-framework/inventory-tool-capabilities.mjs
```

## Current boundaries

- No lender selection, endorsement, compensation ranking, automated contact, application, or data
  transmission.
- No personalized approval, underwriting, appraisal, credit, income, program, or rate guarantee.
- No general external-alert delivery before the controlled gates and human approval pass.
- No automatic optimization of homeowner-facing thresholds from analytics.
- Additional benchmark products may be added only with reviewed source, product, and freshness
  metadata.

The current product and rollout baseline is maintained in the
[Mortgage Refinance Radar enhancement plan](../product/mortgage-refinance-radar-enhancement-plan.md).
