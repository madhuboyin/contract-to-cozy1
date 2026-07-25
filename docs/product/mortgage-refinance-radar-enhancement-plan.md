_PRODUCT & ENGINEERING ENHANCEMENT PLAN_

# Mortgage Refinance Radar

*From request-driven calculator to trusted, always-on homeowner intelligence*

**Prepared for:** ContractToCozy Product, Design, Engineering, Data, and Growth

**Date:** July 25, 2026

**Baseline:** main @ c5c9332 — canonical mortgage sync and Gazette correctness fix

**Status:** Recommended roadmap for prioritization

**Implementation status (July 25, 2026):** P0 implementation has started. A
newly persisted mortgage-rate snapshot now triggers a paginated, bounded
evaluation sweep of complete canonical Financing profiles, with per-snapshot
idempotency and run totals. The current radar card is mounted on Home and the
property overview; Home suppresses CLOSED monitoring and requests missing
mortgage facts only after a meaningful rate decline. The radar now requests 52
weekly observations and renders a personalized one-year rate chart with
30-/15-year and 3-month/1-year controls, a current-note-rate benchmark,
freshness/source details, keyboard-accessible data points, and a table
fallback—including beneath an incomplete-mortgage setup state. Outbox-backed
OPEN, material UPDATE, and CLOSED transitions are now written atomically with
the current radar state and opportunity record, using a stable
property/snapshot/transition idempotency key. The shared domain-event worker
acknowledges these events with its existing multi-worker claim, exponential
backoff, and failure isolation behavior; events that fail eight attempts now
move to a terminal dead-letter state with run-level observability. Durable
refinance transitions are now exposed through the property-scoped rate-history
contract and replayed on the chart: OPEN uses a diamond, material UPDATE a
ring, and CLOSED a square, with shaded opportunity windows, keyboard labels,
and equivalent table values. Property/snapshot evaluation work now uses durable
lease-token claims with expiry recovery, bounded attempts, and dead-letter
state; rerunning ingestion for an existing snapshot resumes unfinished
properties instead of waiting for the next weekly observation. Durable
DATA_REQUIRED actions and notification policy remain next steps.

## Executive recommendation

> **Decision:** Fund a three-release evolution that makes the radar genuinely proactive: evaluate every eligible property after each rate update, promote state transitions onto Home, and explain the decision with a one-year rate view and complete cost assumptions.

The feature already has a sound calculation foundation, conservative opportunity thresholds, hysteresis, market-rate ingestion, scenario analysis, and persisted opportunity history. Its primary weakness is orchestration: fresh rates do not automatically reevaluate eligible homes, and Home does not consistently surface current opportunities or intelligently request missing mortgage facts.

- Treat Financing Center as the only owner of mortgage facts; never ask users to duplicate known information.

- Turn each successful rate ingestion into an idempotent evaluation cycle across eligible properties.

- Create explicit OPEN, UPDATE, and CLOSED events that power Home, Gazette, and optional notifications.

- Replace the short rate list with a 52-week visual that overlays the homeowner’s rate and opportunity windows.

- Improve decision quality with APR, points, fees, term reset, LTV, eligibility, PMI, and alternative actions.

- Measure alert usefulness and suppress noisy or low-confidence prompts.

## 1. Current-state assessment

The assessment below combines repository inspection, the reported production behavior, and the fixes delivered in baseline commit c5c9332. “Current state” describes the implementation after that correctness fix; roadmap items remain unimplemented unless explicitly stated.

| Area | Current state | Gap / risk | Recommended action |
| --- | --- | --- | --- |
| Mortgage context | Financing Center is the canonical owner. Radar reads PropertyFinancingProfile. | Unavailable UI previously opened a blank duplicate form; context policy also required a nonessential as-of date. | Keep one canonical profile; pull known values, request only missing facts, and retry evaluation automatically. |
| Rate ingestion | A scheduled worker ingests 30-year and 15-year benchmark rates. | Ingestion does not trigger evaluation across eligible properties. | Run a property-scoped evaluation fan-out after each successful rate snapshot. |
| Home visibility | Gazette can consume a persisted open opportunity; a dedicated dashboard card exists. | The card is not mounted, and Gazette previously read historical OPEN rows and used a broken link. | Promote current state transitions to Home, Gazette, and optional notifications using one event contract. |
| Rate history | The UI shows 12 snapshots in a list. The endpoint supports up to 52. | Homeowners cannot see a one-year trend, their own rate benchmark, or past opportunity windows. | Add an accessible 52-week chart with current-loan line, open/close markers, and source freshness. |
| Decision quality | The engine considers rate gap, balance, remaining term, savings, lifetime savings, closing cost, and break-even. | APR, points, term reset, eligibility, LTV, PMI, cash-out, and alternatives are not fully modeled. | Expand the decision model and explain both qualifying and non-qualifying factors. |
| Proactive capture | Missing mortgage data is requested inside the radar. | There is no market-triggered Home nudge when rates fall and the profile is incomplete. | Create a low-frequency, consent-aware data-completion action that asks only for missing fields. |

## 2. Product principles

- **One source of truth.** Mortgage balance, interest rate, remaining term, payment, and balance date belong to PropertyFinancingProfile. Every surface reads that profile.

- **Opportunity, not rate theater.** A falling benchmark is not automatically a refinance opportunity. The product must consider costs, remaining term, eligibility, and user objectives.

- **Calm proactivity.** Surface high-signal transitions and purposeful data requests; do not convert every weekly rate move into a notification.

- **Explain before asking.** Show the trigger, assumptions, confidence, and tradeoffs before encouraging a lender conversation.

- **Reversible guidance.** Users can dismiss, snooze, adjust assumptions, or mark that they do not have a mortgage without losing access to the tool.

- **Freshness is visible.** Every rate, balance, and evaluation states its source and as-of date.

## 3. Target homeowner experience

1. **Rate update.** The weekly benchmark snapshot is ingested with source, observation date, and freshness metadata.

2. **Eligibility fan-out.** The system identifies properties with a mortgage profile or a plausible mortgage-data gap and creates bounded evaluation work.

3. **Property evaluation.** Complete profiles run through the opportunity engine; incomplete profiles run through a nudge-eligibility policy.

4. **State transition.** The radar emits OPEN, UPDATE, CLOSED, DATA_REQUIRED, or NO_CHANGE with a deterministic idempotency key.

5. **Home promotion.** The selected property’s most important current state appears on Home; multi-property users see the highest-value actionable item first.

6. **Notification policy.** Only consented, high-confidence OPEN transitions or time-sensitive updates leave the product. DATA_REQUIRED prompts remain low-frequency.

7. **Review and action.** The radar explains the rate comparison, costs, break-even, lifetime effect, alternatives, and a user-controlled next step.

> **Core promise:** “We monitor the market and your mortgage context. When the economics materially change, we explain why—and we never make you enter the same fact twice.”

## 4. Priority roadmap

### P0 — Correctness and always-on foundations

- Keep the canonical Financing profile read and prefill behavior delivered in c5c9332.

- After successful rate ingestion, enqueue evaluation for every property with balance, rate, and remaining term.

- Use batch pagination, per-property leases, retries, dead-letter handling, and a run summary with examined/evaluated/opened/closed/failed counts.

- Emit state transitions only when the effective opportunity changes; preserve existing hysteresis and same-day deduplication.

- Mount the refinance Home card and consume the same current-state contract used by Gazette.

- Generate DATA_REQUIRED only when the rate movement is meaningful and at least one required mortgage fact is absent.

### P1 — Best-in-class homeowner experience

- Add the one-year rate chart specified in Section 5.

- Show a personalized trigger rate: the approximate market rate at which the current mortgage would meet all opportunity gates.

- Explain every closed decision with a concise reason hierarchy, such as insufficient rate gap, long break-even, low balance, or short remaining term.

- Add alert preferences: Home only, email, push when available, quiet hours, snooze, and opportunity threshold sensitivity.

- Support multi-property prioritization and display the property address on every alert.

- Provide calm next steps: adjust assumptions, save scenario, export a lender-ready summary, or continue monitoring.

### P2 — Advanced decision intelligence

- Model APR, points, lender credits, title and appraisal fees, taxes, escrow impact, and cash-to-close.

- Incorporate LTV/equity, occupancy, property type, loan type, conforming limits, and broad credit bands as eligibility inputs.

- Compare term-preserving, term-extending, and term-shortening scenarios; make the cost of restarting a 30-year amortization explicit.

- Compare refinance against recast, extra principal, retain-current-loan, and cash-out alternatives where applicable.

- Support FHA, VA, jumbo, ARM, second-lien, and multiple-mortgage contexts without presenting modeled spreads as live quotes.

- Create lender-offer comparison only after the monitoring and explanation layers demonstrate strong trust metrics.

## 5. One-year interest-rate graph

The backend rate endpoint already allows 52 observations. The initial chart can therefore use existing weekly snapshots, while later versions may add richer product feeds.

### Visual specification

- X-axis: 52 weekly observation dates; Y-axis: mortgage rate percentage with a padded, non-misleading scale.

- Primary line: 30-year fixed benchmark. Secondary toggle: 15-year fixed. Additional products appear only when backed by reliable data.

- Personal benchmark: a labeled horizontal line for the homeowner’s current note rate.

- Opportunity band: subtle shading only where all decision gates—not rate gap alone—were satisfied.

- Markers: OPEN and CLOSED transitions, with tooltip values for rate gap, monthly savings, closing cost, and break-even.

- Freshness: source, latest observation date, ingestion time, and stale-data warning.

- Accessibility: keyboard-accessible points, text summary, high-contrast palette, non-color markers, and a table fallback.

### Interaction and empty states

- Default to one year, with three-month and all-history views where enough data exists.

- Hover or focus reveals exact benchmark, homeowner rate, gap, and radar state for that date.

- If the mortgage is incomplete, render the market trend and overlay a single invitation to add only missing facts.

- If fewer than eight snapshots exist, show a compact trend card and explain that a longer history is still being collected.

- Never infer a consumer quote from a national benchmark; label the chart as market context, not an offer.

## 6. Home, alerts, and proactive data capture

### Home-state hierarchy

- Opportunity OPEN: show estimated monthly savings, break-even, confidence, and “Review opportunity.”

- Opportunity UPDATE: show only when savings or break-even changed materially; avoid a new-card experience for minor weekly movement.

- Monitoring CLOSED: show a compact status only in the property finance area, not as a global urgent action.

- Data required during meaningful decline: show a low-urgency setup action with known facts prefilled.

- Data stale: request confirmation of balance or payment only when freshness materially affects the result.

### Notification policy

> **Guardrail:** A benchmark moving lower is not sufficient to notify. External notifications require a current OPEN transition, adequate confidence, fresh inputs, user consent, and a cooldown check.

- Use a stable event key such as propertyId + snapshotId + transition type.

- Default cooldown: one external OPEN alert per property per 30 days unless estimated savings improves materially.

- CLOSED events update Home silently; do not send alarming “opportunity lost” language.

- DATA_REQUIRED prompts should default to Home-only and stop after snooze, dismissal, or “no mortgage.”

- Record delivery, view, dismiss, scenario-run, saved-scenario, and next-step events without storing sensitive financial values in analytics payloads.

### Example copy

> **OPEN:** A refinance window may be worth reviewing. Based on your saved mortgage details, the current benchmark could reduce principal-and-interest payments by about $240 per month, with an estimated 22-month break-even.

> **DATA REQUIRED:** Mortgage rates have moved lower recently. Add your remaining balance, current rate, and term to see whether the change could matter for 94 Ashford Dr. We’ll reuse anything already saved in Financing.

## 7. Opportunity-engine enhancements

### Retain the current conservative gates

Continue requiring a meaningful rate gap, minimum remaining balance and term, adequate monthly and lifetime savings, and an acceptable break-even period. Preserve OPEN/CLOSED hysteresis so the radar does not oscillate near a threshold.

### Add decision inputs in layers

- Cost layer: APR, points, lender credits, fixed fees, percentage fees, taxes, appraisal, title, and cash-to-close.

- Loan layer: original term, remaining term, payment composition, loan type, prepayment constraints, PMI/MIP, second liens, and cash-out amount.

- Property layer: current value range, LTV, occupancy, property type, state, and conforming-limit context.

- Borrower layer: optional broad credit and eligibility bands; never imply approval.

- Objective layer: lower payment, faster payoff, cash out, remove mortgage insurance, or reduce rate risk.

### Explainability requirements

- Show the top three factors that opened or closed the window.

- Display the assumed new term and explicitly quantify payoff-date movement.

- Separate guaranteed facts, user-reported facts, modeled assumptions, and market benchmarks.

- Provide “what would need to change?” guidance, including trigger rate and cost threshold.

- Attach the existing financial-information disclaimer to every scenario and exported summary.

## 8. Engineering design

### Scheduled orchestration

1. **Ingest.** Persist a deduplicated market snapshot. Exit without fan-out if the observation is unchanged.

2. **Select.** Page through properties with complete profiles; separately identify incomplete profiles eligible for a market-triggered setup nudge.

3. **Evaluate.** Run bounded parallel jobs with per-property idempotency and the same engine used by the API.

4. **Transition.** Persist opportunity and radar state atomically, then write an outbox event for OPEN, UPDATE, CLOSED, or DATA_REQUIRED.

5. **Promote.** Materialize Home action, Gazette candidate, and allowed notification from the outbox event.

6. **Observe.** Record run totals, lag, failure rate, stale-rate conditions, transition counts, and notification suppression reasons.

### Data-contract additions

- Radar status: missingFields[], mortgageDataAsOf, mortgageDataFreshness, marketDataAsOf, marketDataSource, triggerRatePct.

- Transition event: eventId, propertyId, previousState, nextState, snapshotId, opportunityId, materialChangeReason, occurredAt.

- Home action: priority, confidence, estimatedMonthlySavings, breakEvenMonths, deepLink, expiresAt, dismissal policy.

- Notification decision: channel, consent basis, cooldown result, freshness result, confidence result, suppression reason.

## 9. Acceptance criteria

### Mortgage-context behavior

- A complete Financing profile opens Radar without a setup form.

- A partial profile pre-populates every known value and asks only for missing required fields.

- Saving in Financing or Radar produces the same canonical record and a consistent property-context decision.

- A nonessential missing as-of date does not block evaluation; stale-data policy remains separate and visible.

### Proactive monitoring

- Every successful new weekly rate snapshot evaluates all eligible properties within the agreed service-level objective.

- A property is evaluated at most once per snapshot unless explicitly retried after failure.

- OPEN and CLOSED transitions are deterministic, persisted, auditable, and safe to replay.

- No historical OPEN opportunity can surface after the current state is CLOSED.

### Home and notification quality

- The selected property’s current OPEN opportunity appears on Home with a valid deep link.

- Minor weekly changes do not create duplicate Home actions or external notifications.

- Missing-data nudges honor snooze, dismissal, no-mortgage state, cooldown, and known-field prefill.

- All external messages identify the property, use estimate language, and include a direct preference path.

### Chart quality

- The graph renders up to 52 weekly observations without clipping at supported breakpoints.

- Current rate, source, freshness, and opportunity transitions remain understandable without color.

- The chart has keyboard support and an equivalent textual/table representation.

## 10. Success metrics and guardrails

### Outcome metrics

- Eligible-profile activation: percentage of mortgaged properties with the three required facts.

- Monitoring coverage: percentage of eligible properties evaluated within 24 hours of a new snapshot.

- Signal usefulness: OPEN alerts viewed, scenarios run, scenarios saved, and user-reported usefulness.

- Decision quality: percentage of alerts later dismissed as not relevant; median projected savings and break-even at OPEN.

- Home conversion: transition from Home card to radar review and intentional next step.

### Trust guardrails

- External-notification opt-out and complaint rate.

- Duplicate action or notification rate.

- Stale market or mortgage data used in an OPEN decision.

- False urgency: alerts suppressed because confidence, consent, freshness, or cooldown failed.

- Model drift between stored opportunities and rerun calculations under the same assumptions.

## 11. Rollout plan

| Release | Focus | Exit gate |
| --- | --- | --- |
| Release 0 — Correctness | Canonical profile sync, missing-field behavior, Gazette correctness | No known profile is re-requested; stale opportunities cannot surface |
| Release 1 — Always-on | Post-ingestion evaluation, state-transition events, Home card | Eligible properties evaluate weekly; OPEN/CLOSED events are idempotent |
| Release 2 — Explainability | 52-week chart, trigger rate, expanded assumptions and alternatives | Users can understand why, when, and under what assumptions refinancing helps |
| Release 3 — Personalization | Eligibility bands, alert preferences, multi-property prioritization | Alerts respect consent, cooldowns, confidence, and property selection |

Recommended sequencing: ship Release 0 immediately, design the event and Home contracts before building the chart, then launch always-on evaluation to an internal cohort with notifications disabled. Enable Home promotion next, followed by opt-in external alerts after duplicate, freshness, and usefulness guardrails are proven.

## 12. Risks and governance

- **Benchmark-versus-offer risk.** National benchmark rates are not consumer quotes. Label modeled products and avoid lender-like approval language.

- **Financial-advice risk.** Keep the experience educational, expose assumptions, preserve disclaimers, and encourage users to compare official loan estimates.

- **Privacy risk.** Mortgage facts are sensitive. Minimize analytics payloads, preserve property authorization, and do not expose values in notification previews where inappropriate.

- **Alert fatigue.** Use transition-based alerts, material-change thresholds, preference controls, and cooldowns.

- **Stale inputs.** Show freshness, request periodic confirmation, and suppress high-confidence language when balance or market data is stale.

- **Eligibility uncertainty.** Treat credit, income, appraisal, occupancy, and program eligibility as ranges or user-confirmed facts—not inferred approval.

## Appendix A — Repository evidence and decisions

### Repository evidence

- Radar orchestration and persisted state: apps/backend/src/refinanceRadar/refinanceRadar.service.ts

- Opportunity thresholds and hysteresis: apps/backend/src/refinanceRadar/config/refinanceRadar.config.ts

- Market-rate ingestion: apps/workers/src/jobs/ingestMortgageRates.job.ts

- Radar client and current rate-history presentation: apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/mortgage-refinance-radar/

- Home-card implementation: apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/components/RefinanceRadarDashboardCard.tsx

- Gazette refinance signal: apps/backend/src/modules/gazette/services/gazetteSignalCollector.service.ts

- Canonical financing profile: apps/backend/src/services/financing.service.ts

- Financial context policy: apps/backend/src/services/financialContext/applicabilityPolicy.ts

### Decisions to authorize next

- Approve Release 1 architecture: post-ingestion evaluation, transition outbox, and Home promotion.

- Choose the service-level objective for weekly property evaluation and the initial internal cohort.

- Approve Home-only DATA_REQUIRED nudges with snooze, dismissal, and no-mortgage controls.

- Confirm that external alerts remain disabled until freshness, duplicate, and usefulness guardrails pass.

- Assign product, engineering, data, design, and compliance owners for the acceptance criteria in Section 9.

> **Bottom line:** The best-in-class version is not merely a richer calculator. It is a quiet monitoring system that notices material change, reuses trusted home facts, explains the economics, and surfaces a controlled action at the right moment.
