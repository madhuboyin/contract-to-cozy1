# Service Quote Decision and Service Price Radar

**Status:** Implemented
**Last reconciled:** July 29, 2026
**Outcome family:** Service Quote Decision
**Homeowner entry name:** Service Price Radar
**Safety tier:** Material financial
**Canonical contextual route:** `/dashboard/properties/[id]/tools/service-price-radar`
**Canonical decision workspace:** `/dashboard/properties/[id]/tools/quote-comparison`

## 1. Purpose

Service Price Radar is the entry point to one property-scoped Service Quote
Decision journey:

> Help a homeowner understand a service quote, identify missing or risky scope,
> compare like-for-like proposals, decide what to do, preserve accepted terms,
> and optionally book or track the work.

A generated price check is not a completed decision. Completion requires an
explicit decision outcome and, for completed-work measurement, a linked
completion record.

## 2. Product boundaries

The journey combines stages that previously appeared to be independent tools:

| Surface | Role in the outcome |
|---|---|
| Service Price Radar | Planning intake and evidence-qualified price review |
| Quote Comparison | Canonical workspace, normalized proposals, readiness, comparability, and decision controls |
| Negotiation Shield | Clarification or negotiation stage linked to the same workspace |
| Price Finalization | Accepted scope, price, payment, warranty, and timeline terms |
| Provider Booking | Optional execution handoff after an informed decision |
| Project Tracker | Optional work tracking, approved change orders, and completion evidence |

The stage routes remain valid deep links and direct-entry surfaces. They do not
create separate service-quote outcome identities when a
`QuoteComparisonWorkspace` is present.

## 3. Homeowner contract

Every result must distinguish:

- a rough planning range;
- an incomplete or review-ready quote;
- a qualified market comparison;
- comparable versus non-comparable proposals;
- a recorded decision;
- accepted final terms;
- booked or completed work.

The experience must always explain:

- what is known;
- what is missing or ambiguous;
- why the missing fact matters;
- what evidence supports the result;
- what the homeowner can edit, delete, clarify, reject, defer, or close;
- what action is safe to take next.

## 4. Canonical journey

The durable journey uses these stages:

1. `QUOTE_INTAKE`
2. `PRICE_REVIEW`
3. `SCOPE_REVIEW`
4. `COMPARISON`
5. `NEGOTIATION`
6. `FINALIZATION`
7. `BOOKING`
8. `SCHEDULED`
9. `COMPLETED`
10. `CLOSED`

Outcomes are:

- `OPEN`
- `ACCEPTED`
- `DECLINED`
- `DEFERRED`
- `BOOKED`
- `COMPLETED`
- `CANCELLED`

`ServiceQuoteDecisionTransition` is the append-only stage history.
`ServiceQuoteDecisionContextLink` preserves property-scoped links to inventory
items, documents, incidents, Radar checks, guidance journeys, negotiation
cases, finalizations, bookings, and projects.

Terminal transitions write idempotent Home Timeline events. A refresh or
duplicate request must not create another material transition or timeline
event.

## 5. Intake and quote readiness

Supported intake paths are:

- manual proposal entry;
- uploaded quote document using the existing document-analysis pipeline;
- a saved Service Price Radar check;
- contextual entry from a home system, incident, room, document, project, or
  guidance journey.

Normalized proposals store:

- provider and total;
- service category and repair/replacement scope;
- service location and dates;
- line items, quantities, units, unit prices, and totals;
- inclusions, exclusions, allowances, permits, cleanup, warranty, payment,
  schedule, insurance, license, expiration, and change-order terms;
- extraction provenance;
- fact confirmation state;
- missing facts and ambiguities.

Readiness stages are:

| Stage | Meaning |
|---|---|
| `PLANNING_ESTIMATE` | Budget input, not a contractor proposal |
| `INCOMPLETE_QUOTE` | Material scope or term facts are missing |
| `REVIEW_READY` | Proposal can be understood, but comparison requirements are not met |
| `COMPARISON_READY` | Homeowner-confirmed scope is eligible for like-for-like comparison |

Extracted facts begin as `EXTRACTED_UNCONFIRMED`. They must be confirmed or
corrected by the homeowner before they can make a proposal comparison-ready.

Comparability requires at least two eligible proposals with compatible
category, scope kind, location, unit structure, and material terms. Price alone
never makes proposals comparable. The product does not recommend the cheapest
proposal merely because it is cheapest.

## 6. Price-evidence contract

### 6.1 Evidence levels

Radar has two price-evidence modes:

| Evidence level | Allowed behavior |
|---|---|
| `QUALIFIED_BENCHMARK` | Show an evidence-qualified range and categorical verdict |
| `CATEGORY_HEURISTIC_ONLY` | Show rough planning guidance and scope-review prompts only |

The categorical verdicts `UNDERPRICED`, `FAIR`, `HIGH`, and `VERY_HIGH` are
permitted only for `QUALIFIED_BENCHMARK`.

If no benchmark qualifies, the API returns `INSUFFICIENT_DATA`. The entered
quote remains usable in the decision workspace, but the interface must describe
the range as planning guidance rather than regional market evidence.

### 6.2 Qualified benchmark requirements

A benchmark fails closed unless all requirements in
`servicePriceBenchmarkQualification.ts` pass:

- source is active;
- source rights and source review are `APPROVED`;
- source health is `HEALTHY` and no more than 48 hours old;
- import is `VALIDATED` and has a checksum;
- release is reviewed, active, quality-passed, effective, and unexpired;
- observation, retrieval, review, and activation dates are valid;
- source URL, license, version, method, geography, cohort, percentile,
  normalized scope, unit, and distribution data are complete;
- currency is USD;
- sample size is at least five;
- low, median, and high values form a valid distribution.

When multiple equally qualified candidates match, selection fails closed with
`AMBIGUOUS_BENCHMARK_MATCH`.

### 6.3 Visible provenance

Qualified evidence snapshots include:

- source name and URL;
- release version;
- observation and retrieval dates;
- effective and expiry dates;
- geography and cohort definition;
- normalized scope and unit;
- sample size and percentiles;
- methodology summary;
- benchmark and release identifiers.

Stored snapshots explain what supported the result at creation time. They do
not make a currently unhealthy or expired source eligible for new checks.

### 6.4 Prohibited claims

The product must not:

- call heuristic ranges market, regional, local, average, or comparable data;
- emit a categorical price verdict without qualified evidence;
- imply that low price establishes provider quality or completeness;
- create urgency to book because a quote is unusually low;
- recommend a proposal whose scope is not comparison-ready;
- treat generated guidance as a recorded decision;
- use stale, unhealthy, unreviewed, unlicensed, ambiguous, or expired evidence;
- promote unverified homeowner input into a benchmark.

## 7. Supported and routed categories

`SERVICE_RADAR_CATEGORY_VALUES` contains the normalized category vocabulary
used by integrations. Radar intake supports its home-service subset, subject to
property-compliance applicability and evidence availability.

`INSURANCE`, `ATTORNEY`, and `FINANCE` are rejected by the Radar intake
validator. They are regulated professional-service categories and must be
routed to their reviewed domain workflows rather than priced by this generic
engine.

`WARRANTY`, `ADMIN`, and `OTHER` can be recorded as planning inputs. They do not
gain a categorical verdict without a separately qualified matching benchmark.

Safety, licensing, permits, insurance, and professional qualifications remain
separate from price evidence. A benchmark verdict is never provider
verification.

## 8. Persistence

The canonical persistence graph is:

- `QuoteComparisonWorkspace`
- `QuoteComparisonQuote`
- `QuoteComparisonLineItem`
- `QuoteComparisonTerm`
- `QuoteComparisonExtraction`
- `QuoteComparisonFactConfirmation`
- `QuoteComparisonClarification`
- `ServiceQuoteDecisionTransition`
- `ServiceQuoteDecisionContextLink`
- linked `NegotiationShieldCase`
- linked `PriceFinalization`
- linked `Booking`
- optional linked `ProjectRecord`

Service Radar checks remain immutable price-evidence snapshots and intake
references. They are not a second decision record.

Benchmark evidence uses:

- `ServicePriceBenchmarkSource`
- `ServicePriceBenchmarkImportRun`
- `ServicePriceBenchmarkRelease`
- `ServicePriceBenchmarkSourceHealth`
- `ServicePriceBenchmark`

No migration, historical backfill, dual-write, or compatibility layer is
provided for this capability. See section 13 for reconciliation.

## 9. API contract

### Radar

- `POST /api/properties/:propertyId/service-price-radar/checks`
- `GET /api/properties/:propertyId/service-price-radar/checks`
- `GET /api/properties/:propertyId/service-price-radar/checks/:checkId`
- `POST /api/properties/:propertyId/service-price-radar/events`

### Decision workspace

- create or reuse a workspace;
- get the workspace and linked stages;
- add, edit, delete, confirm, reject, or restore proposals;
- extract a proposal from a document;
- evaluate comparability;
- select an eligible proposal;
- create and resolve clarifications;
- close as declined or deferred;
- add bounded context links;
- grant or revoke outcome-measurement consent.

The concrete route definitions and validation schemas are the source of truth:

- `apps/backend/src/routes/quoteComparison.routes.ts`
- `apps/backend/src/validators/quoteComparison.validators.ts`

All routes require authentication and property authorization. Linked entity
IDs are checked against the property boundary.

## 10. Homeowner controls and privacy

Before final terms lock a proposal, homeowners can edit, delete, reject,
restore, clarify, defer, and close it. Material linked records advance
finalization, booking, and completion stages; clients cannot claim those stages
without the corresponding record.

Outcome learning is opt-in:

- consent is stored on the decision workspace;
- final price and change-order capture are independently scoped;
- revocation stops future analytics capture;
- quote text, contractor notes, estimates, and extracted document content are
  not copied into outcome analytics;
- operational booking and project records remain governed by their normal
  retention rules.

## 11. Analytics and governed learning

The metric version is `service-quote-decision-v1`. Instrumented events cover:

- intake;
- evidence assessment;
- readiness;
- missing-scope changes;
- clarification request and resolution;
- comparison;
- decision;
- finalization;
- booking;
- completed work;
- consented approved change orders;
- linked disputes.

The admin endpoint
`GET /api/admin/analytics/service-quote-decisions` reports the journey funnel,
decision quality, evidence coverage, source health, consent coverage, and
governed-learning readiness.

The current comparison engine does not issue a winner recommendation, so a
recommendation-override signal has no valid current denominator. If a future
release introduces a recommendation, it must emit an explicit recommendation
and override event rather than infer override from selection price.

Internal benchmark derivation remains suppressed until there are at least:

- 20 consented, verified final-price observations; and
- 10 distinct properties.

Even after those minimums pass, data requires outlier handling, cohort review,
rights review, and manual source activation. Derived data cannot activate
itself or bypass the qualified benchmark contract.

## 12. Testing and release gates

Required checks:

```bash
cd apps/backend
npm run prisma:generate
npm run build
npm run test:service-price-radar:acceptance

cd ../frontend
npx tsc --noEmit
npm run build
npm run test:service-quote-decision:e2e
```

Acceptance covers:

- verdict boundaries and fail-closed evidence;
- stale, unavailable, ambiguous, and unqualified sources;
- unsupported categories and amount bounds;
- scope readiness and comparability;
- authorization, idempotency, persistence, and delete controls;
- bounded stage transitions;
- consent and learning thresholds;
- desktop and mobile browser journeys;
- keyboard semantics and visible trust language.

## 13. Schema reconciliation

There are no production users or data-migration requirements for this
capability. Schema changes are intentionally direct and do not include Prisma
migration scripts.

After pulling schema changes, the database owner must reconcile the target
database separately, including the Service Quote Decision, benchmark, and
outcome-consent fields. Then run:

```bash
cd apps/backend
npm run prisma:generate
npx prisma validate --schema=./prisma/schema.prisma
npm run build
```

Do not add backfills, dual writes, obsolete Radar compatibility tables, or
legacy completion events.

## 14. Operations and incident response

Benchmark ingestion, review, activation, health, degradation, rollback, and
incident response are governed by:

`docs/operations/SERVICE_PRICE_BENCHMARK_SOURCE_OPERATIONS_RUNBOOK.md`

Operational guardrails:

- degrade first when source trust is uncertain;
- confirm new checks fail closed;
- preserve immutable historical evidence snapshots;
- never extend expiry to conceal an incident;
- require separate review before restoration;
- monitor the admin outcome dashboard without exposing raw homeowner values.

## 15. Source-of-truth map

| Concern | Source |
|---|---|
| Capability contract | `apps/backend/src/productFramework/capabilities/definitions/decideCompare.ts` |
| Radar evaluation | `apps/backend/src/services/servicePriceRadar.engine.ts` |
| Benchmark qualification | `apps/backend/src/services/servicePriceBenchmarkQualification.ts` |
| Benchmark lifecycle | `apps/backend/src/services/servicePriceBenchmarkGovernance.service.ts` |
| Quote readiness | `apps/backend/src/services/quoteComparability.service.ts` |
| Journey transitions | `apps/backend/src/services/serviceQuoteDecisionJourney.service.ts` |
| Journey transition policy | `apps/backend/src/services/serviceQuoteDecisionTransitions.ts` |
| Outcome analytics | `apps/backend/src/services/serviceQuoteDecisionAnalytics.service.ts` |
| Operator metrics | `apps/backend/src/services/adminAnalytics/serviceQuoteDecisionMetricsService.ts` |
| Canonical homeowner UI | `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/quote-comparison/QuoteComparisonWorkspaceClient.tsx` |
| Acceptance suite | `apps/backend/tests/unit/servicePriceRadarDecisionQualityAcceptance.test.js` |
