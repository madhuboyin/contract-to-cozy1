_PRODUCT, ENGINEERING & ROLLOUT STATUS_

# Mortgage Refinance Radar

*From request-driven calculator to trusted, always-on homeowner intelligence*

**Prepared for:** ContractToCozy Product, Design, Engineering, Data, and Growth

**Last updated:** July 26, 2026

**Implementation baseline:** main @ f589baf — isolated Prisma schema-push runtime and successful production schema synchronization

**Status:** Core implementation complete; controlled external-alert rollout remains operationally gated

**Document source of truth:** This Markdown file. The legacy DOCX is not
maintained and should not be used for implementation or rollout status.

### Current implementation status

As of July 26, 2026, Releases 0 through 3 and the advanced decision-intelligence
slices described in this plan are implemented. The radar now:

- Reuses the canonical Financing profile, pre-populates every known mortgage
  fact, requests only missing required fields, and automatically re-evaluates
  after canonical updates.
- Runs paginated, resumable weekly property evaluation with lease-token claims,
  bounded retries, dead-letter handling, run totals, and per-snapshot
  idempotency.
- Persists replay-safe OPEN, material UPDATE, CLOSED, and DATA_REQUIRED
  transitions and promotes the current actionable state to Home and Gazette.
- Shows a personalized, accessible 52-week rate chart with product/range
  controls, current-note-rate and trigger-rate context, opportunity windows,
  source/freshness details, keyboard support, and a table fallback.
- Provides property-scoped alert preferences and guarded email/Web Push
  delivery with explicit consent, cadence, quiet hours, sensitivity, cooldown,
  material-improvement overrides, freshness/confidence checks, and cohort
  enforcement at admission and transport.
- Models detailed costs, APR, payoff-date movement, LTV/CLTV, liens, mortgage
  insurance, objectives, multiple terms, retain/recast/extra-principal/cash-out
  alternatives, and FHA/VA/jumbo/ARM/multiple-mortgage planning context without
  making lender approval claims.
- Exports lender-ready Markdown and provides a homeowner-controlled official
  Loan Estimate comparison workflow with reviewed extraction, OCR, rate-lock,
  points, cash-direction, payment, five-year-cost, save/delete, and manual
  sharing safeguards.
- Aggregates funnel, usefulness, delivery-suppression, duplicate-alert,
  coverage, and freshness guardrails through the authorized refinance-radar
  analytics report.

The production Prisma schema, including `PushSubscription`, has been applied
successfully using the isolated non-root schema-push Job in
`apps/backend/run-schema-push-job.sh`. No Prisma migration script was created,
in accordance with the project constraint.

The remaining work is operational rollout, not missing core implementation:
configure VAPID and outbound-provider secrets, define the internal recipient
allowlist, enable the fail-closed channel flags for that cohort, validate
delivery/duplicate/opt-out/freshness guardrails, and promote
`REFINANCE_ALERT_ROLLOUT_MODE` from `ALLOWLIST` to `GENERAL` only after approval.
Transactional lender delivery remains intentionally out of scope and gated.

### Current completion matrix

| Capability | Status | Current implementation or remaining gate |
| --- | --- | --- |
| Canonical Financing reuse and known-field prefill | Complete | Radar and Financing use the same property financing profile. |
| Weekly ingestion and property evaluation | Complete | Paginated durable claims, retries, dead-letter handling, resumability, and run totals are implemented. |
| OPEN, material UPDATE, CLOSED, and DATA_REQUIRED transitions | Complete | Durable outbox events and replay-safe chart history are implemented. |
| Home opportunity and missing-data promotion | Complete | Home shows actionable states, honors feedback controls, and ranks the highest-value OPEN opportunity across properties. |
| One-year rate graph and personalized trigger rate | Complete | Accessible chart, table fallback, transition markers, source/freshness, and trigger-rate explanation are implemented. |
| Alert preferences and guarded email delivery | Implemented; cohort rollout gated | Consent, confidence, freshness, cadence, quiet hours, sensitivity, cooldown, material-improvement override, recipient-cohort enforcement at admission and transport, and preference deep link are implemented. Production flags and an explicit ALLOWLIST-to-GENERAL promotion remain operational gates. |
| Cost, payoff, APR, escrow, and prepayment modeling | Complete for planning | Detailed educational estimates are implemented; official lender disclosures remain authoritative. |
| LTV, liens, PMI, occupancy, property type, loan type, and conforming context | Complete for broad context | The configured conforming baseline must be supplied operationally; program and high-cost-area limits require lender confirmation. |
| Term and objective comparison | Complete | Balanced, lower-payment, faster-payoff, and lower-total-cost modes compare 15-, 20-, and 30-year terms. |
| Retain, extra-principal, recast, and cash-out alternatives | Complete for planning | Recast and cash-out results remain conditional on servicer/lender eligibility. |
| Lender-ready Markdown export | Complete | Recomputes against canonical context and exports assumptions, costs, alternatives, questions, and disclaimers as Markdown only. |
| Funnel and trust instrumentation and reporting | Complete | Opportunity views, Home conversion, scenario runs/saves, projected savings, exports, feedback, durable alert-suppression outcomes, evaluation coverage, duplicate alerts, and freshness guardrails are aggregated through the authorized `/api/admin/analytics/refinance-radar` report. |
| FHA, VA, jumbo, ARM, and multiple-mortgage program rules | Complete for planning | Explicit Financing loan types drive FHA streamline, VA IRRRL, jumbo/high-balance, ARM-to-fixed, mortgage-insurance, and second-lien coordination pathways. Every pathway lists facts to confirm and avoids approval claims or hard-coded county limits. |
| Push notifications | Implemented; cohort rollout gated | Explicit browser consent, persisted per-device subscriptions, property-scoped PUSH preferences, VAPID delivery, minimal payloads, stale-subscription cleanup, recipient-cohort enforcement, and fail-closed rollout controls are implemented. The production Prisma schema has been applied; VAPID keys, an internal allowlist, rollout flags, and controlled delivery validation remain operational gates. |
| Lender-offer and Loan Estimate comparison | Reviewed comparison and homeowner-controlled handoff complete | Homeowners can compare two to four official Loan Estimates using loan amount, disclosed APR, principal-and-interest payment, estimated total payment, monthly mortgage insurance, lender costs/credits, cash to close, and page-3 five-year totals. Cash to close is recorded as from or to the borrower and is ranked only when every offer is cash-from-borrower with the same amount, product, and term; unknown, mixed, or cash-to-borrower disclosures remain visible but cannot earn a misleading lowest-cash badge. Readable direction text is extracted from page 2, and all exports preserve the direction. Total-payment rankings appear only when every offer supplies that field, and the interface separates mortgage insurance plus lender-estimated tax, insurance, and escrow assumptions from P&I. Page-1 extraction prefills readable Projected Payments values and warns about mortgage insurance or incomplete all-in payment context. Section A discount points are captured as both percentage and dollars, checked against the loan amount, and shown separately from net loan costs so a bought-down rate is not mistaken for a free advantage. Page-2 extraction prefills readable points, while incomplete or inconsistent point disclosures require review. For offers with the same amount, product, and term, the comparison quantifies how long a lower monthly principal-and-interest payment takes to recover additional net loan costs; it also warns when a higher-cost offer does not lower payment. The tradeoff is explicitly limited to disclosed net loan costs and P&I and excludes taxes, insurance, escrow, future refinancing, and time value of money. The comparison records each disclosure's issue date, rate-lock status, and lock expiration; it warns on older disclosures, expired or incomplete locks, different issue dates, and mixed locked/floating offers. Saved comparisons are re-evaluated when read so time-sensitive lock warnings do not freeze at save time. A text-layer or scanned PDF, or up to three image pages, can prefill an editable offer through a non-retained, magic-byte-validated upload, including the standardized page-1 issue date when readable. Scanned PDFs are safely capped at three pages; PDF and image pages use sequential local OCR, expose field provenance, and cap every OCR-derived field at medium confidence. Standard page sections are detected automatically, with visible completeness, duplicate-page, and ordering checks before comparison. Every extracted field requires explicit review before comparison or saving. Different loan amounts and unlike terms fail visibly as comparison warnings. Homeowners can export a Markdown-only review package with lender questions and an apples-to-apples verification checklist. After selecting one offer and completing explicit figure, comparability, and manual-sharing acknowledgements, the homeowner can also download a selected-lender discussion brief. That brief intentionally omits competitor identities and is never transmitted by ContractToCozy. Comparisons remain transient by default, persist only after an explicit Save action, and can be permanently deleted through a two-step property-scoped control. Any future transactional lender delivery remains gated. |

## Executive recommendation

> **Current decision:** Treat the planned product implementation as complete
> and proceed only with controlled external-alert activation and evidence-based
> rollout.

The feature now has the calculation, orchestration, Home promotion, proactive
data capture, explainability, Markdown export, feedback, and official
Loan Estimate comparison foundations required for an always-on product.
The `PushSubscription` schema is deployed. Remaining work is operational:
provision VAPID and outbound-provider configuration, define the internal
recipient allowlist, enable email and/or push for that cohort, and promote the
mode to `GENERAL` only after delivery, duplicate, opt-out, and freshness
guardrails pass. Any future
transactional lender delivery remains deliberately gated. Exports remain
Markdown-only and keep the homeowner in control of external sharing.

- Preserve Financing Center as the only owner of mortgage facts.

- Monitor weekly evaluation coverage, retries, dead letters, and transition lag.

- Keep external alerts in `ALLOWLIST` until the trust guardrails have sufficient evidence.

- Validate email and push independently; do not infer one channel is ready from the other.

- Preserve homeowner-controlled Markdown sharing and the transactional-lender gate.

- Continue measuring alert usefulness and suppress noisy, stale, duplicate, or low-confidence prompts.

## 1. Current-state assessment

This assessment reflects the implementation and production schema state as of
July 26, 2026.

| Area | Current state | Remaining risk / gate | Current action |
| --- | --- | --- | --- |
| Mortgage context | Complete. Financing is canonical; Radar reuses known values and requests only missing required facts. | Mortgage balance freshness can materially change external-alert confidence. | Keep in-product estimates available, show freshness, and request canonical confirmation only when material. |
| Rate ingestion and evaluation | Complete. Weekly ingestion triggers resumable, paginated evaluation and DATA_REQUIRED sweeps with run observability. | Provider freshness, worker lag, retries, and dead letters require operations monitoring. | Monitor coverage and transition lag; investigate failed or stale runs before enabling outbound alerts. |
| Home and Gazette visibility | Complete. Current OPEN opportunities and eligible DATA_REQUIRED actions use stable keys, valid deep links, and feedback controls. | Duplicate or stale actions would erode trust. | Continue duplicate, dismissal, snooze, no-mortgage, and CLOSED-state guardrail reporting. |
| Rate history and explainability | Complete. The accessible 52-week chart includes homeowner/trigger context, transitions, opportunity windows, and freshness. | National benchmarks must not be presented as consumer quotes. | Preserve market-context language, source dates, non-color markers, and table equivalence. |
| Decision quality | Complete for educational planning, including costs, APR, payoff, eligibility context, terms, alternatives, programs, and Loan Estimate review. | Official lender disclosures, appraisal, credit, income, and program eligibility remain authoritative. | Preserve assumptions, uncertainty, comparability gates, disclaimers, and homeowner-controlled sharing. |
| Proactive capture and alerts | Home capture is complete; guarded email and push are implemented. | External delivery is not generally released and requires provider configuration, consent, cohort, freshness, confidence, and cooldown evidence. | Configure and validate an internal allowlist before any explicit `GENERAL` promotion. |

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

## 4. Delivered roadmap

### P0 — Correctness and always-on foundations — Complete

- Canonical Financing profile read, known-field prefill, and missing-field-only behavior are delivered.

- Successful rate ingestion enqueues evaluation for every eligible complete property.

- Batch pagination, per-property leases, retries, dead-letter handling, resumability, and run summaries are delivered.

- State transitions emit only for effective opportunity changes and preserve hysteresis and deduplication.

- Home and Gazette consume current property-scoped radar state through stable actions and links.

- DATA_REQUIRED is generated only after meaningful rate movement, for incomplete profiles, with cooldown and feedback controls.

### P1 — Best-in-class homeowner experience — Complete

- The one-year rate chart specified in Section 5 is delivered.

- Personalized trigger-rate and ordered decision-factor explanations are delivered.

- Closed decisions expose a concise reason hierarchy and “what would need to change” context.

- Home, email, and push preferences, quiet hours, cadence, snooze, and sensitivity are delivered.

- Multi-property prioritization and property-identifying alert context are delivered.

- Calm next steps include assumption adjustment, scenario save/delete, Markdown export, Loan Estimate review, and continued monitoring.

### P2 — Advanced decision intelligence — Complete for educational planning

- APR, points, lender credits, fees, taxes, escrow context, and cash-to-close are modeled.

- LTV/equity, liens, occupancy, property type, loan type, mortgage insurance, and conforming context are incorporated with confidence and confirmation boundaries.

- Term-preserving, term-extending, and term-shortening scenarios expose payment, payoff-date, and lifetime-cost tradeoffs.

- Refinance is compared with recast, extra principal, retain-current-loan, and cash-out alternatives where applicable.

- FHA, VA, jumbo, ARM, second-lien, and multiple-mortgage contexts are supported without quote or approval claims.

- The official Loan Estimate comparison is delivered with reviewed extraction, comparability gates, and homeowner-controlled sharing; transactional lender delivery remains gated.

## 5. One-year interest-rate graph

The implemented chart requests up to 52 existing weekly observations. Future
product feeds may be added only when they provide reliable source, product, and
freshness metadata.

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

### Implemented data-contract additions

- Radar status: missingFields[], mortgageDataAsOf, mortgageDataFreshness, marketDataAsOf, marketDataSource, triggerRatePct.

- Transition event: eventId, propertyId, previousState, nextState, snapshotId, opportunityId, materialChangeReason, occurredAt.

- Home action: priority, confidence, estimatedMonthlySavings, breakEvenMonths, deepLink, expiresAt, dismissal policy.

- Notification decision: channel, consent basis, cooldown result, freshness result, confidence result, suppression reason.

## 9. Acceptance criteria

The core in-product acceptance criteria below are implemented and covered by
the completion matrix. External email/push activation remains subject to the
controlled rollout and operational evidence in Section 11.

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

## 11. Rollout status

| Release | Focus | Implementation status | Remaining exit evidence |
| --- | --- | --- | --- |
| Release 0 — Correctness | Canonical profile sync, missing-field behavior, Gazette correctness | Complete | Continue regression monitoring; no known profile should be re-requested and stale opportunities must not surface. |
| Release 1 — Always-on | Post-ingestion evaluation, state-transition events, Home card | Complete | Monitor weekly evaluation coverage, retry/dead-letter volume, transition lag, and duplicate current-state actions. |
| Release 2 — Explainability | 52-week chart, trigger rate, expanded assumptions and alternatives | Complete | Continue accessibility, freshness, benchmark-versus-quote, and modeled-assumption guardrails. |
| Release 3 — Personalization | Eligibility context, alert preferences, multi-property prioritization | In-product complete; external rollout gated | Configure providers and VAPID, validate an explicit internal allowlist, and demonstrate acceptable delivery, duplicate, opt-out, complaint, and freshness metrics before `GENERAL`. |
| Advanced comparison | Official Loan Estimate intake, reviewed comparison, persistence, export, and manual lender brief | Complete for homeowner-controlled use | Keep automated/transactional lender delivery disabled unless separately authorized and governed. |

The production schema is synchronized. Keep Home monitoring active while
external channels remain fail-closed. Activate email and push independently for
an explicit internal allowlist, observe the trust metrics in Section 10, and
promote to `GENERAL` only through an approved operational change. A benchmark
decline, an OPEN transition, or successful internal delivery alone is not
sufficient evidence for general release.

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

- Alert preferences and rollout admission: apps/backend/src/refinanceRadar/refinanceAlertPreference.service.ts

- External transition delivery: apps/workers/src/jobs/refinanceTransitionAlert.job.ts

- Web Push transport: apps/workers/src/jobs/sendPushNotification.job.ts

- Loan Estimate comparison and extraction: apps/backend/src/refinanceRadar/refinanceLoanEstimateComparison.ts and apps/backend/src/refinanceRadar/refinanceLoanEstimateExtraction.service.ts

- Refinance funnel and trust reporting: apps/backend/src/services/adminAnalytics/refinanceRadarMetricsService.ts

- Isolated production schema synchronization: apps/backend/run-schema-push-job.sh

### Remaining operational decisions

- Assign the product, engineering, data, design, compliance, and operations owners for rollout evidence and incident response.

- Confirm the production service-level objective for weekly evaluation coverage and transition lag.

- Define and approve the initial email and push recipient allowlists.

- Approve provider/VAPID configuration and channel-specific enablement only after startup validation passes.

- Keep `REFINANCE_ALERT_ROLLOUT_MODE=ALLOWLIST` until delivery, duplicate, opt-out, complaint, usefulness, and freshness evidence supports an explicit `GENERAL` decision.

- Keep transactional lender delivery disabled unless a separate product,
  privacy, compliance, security, and operational review authorizes it.

> **Bottom line:** The best-in-class version is not merely a richer calculator. It is a quiet monitoring system that notices material change, reuses trusted home facts, explains the economics, and surfaces a controlled action at the right moment.
