# Mortgage Refinance Radar Capability Audit and Implementation Plan

| Field | Value |
| --- | --- |
| Status | Recommended for implementation |
| Date | July 27, 2026 |
| Accountable product area | Homeowner Product |
| Capability ID | `mortgage-refinance-radar` |
| Canonical route | `/dashboard/properties/[id]/tools/mortgage-refinance-radar` |
| Governing framework | [Capability Outcome and Experience Audit Framework](./CAPABILITY_OUTCOME_AND_EXPERIENCE_AUDIT_FRAMEWORK.md) |
| Existing feature baseline | [Mortgage Refinance Radar Enhancement Plan](./mortgage-refinance-radar-enhancement-plan.md) |
| Product framework | [ContractToCozy Product Framework](./ContractToCozy_Product_Framework.md) |
| Recommended disposition | Double down with bounded gap closure |
| Provisional audit score | 81 / 100 |

---

## 1. Executive Decision

Mortgage Refinance Radar should remain a first-class ContractToCozy capability. Its always-on
monitoring, property-specific financial analysis, scenario modeling, alert safeguards, and official
Loan Estimate comparison deliver a differentiated homeowner outcome that is not adequately served
by a generic mortgage calculator.

The previous enhancement program produced a strong financial and operational foundation. The
capability is not missing another large calculation phase. The remaining gaps are primarily:

1. Product Framework contract accuracy;
2. canonical Unified Home placement;
3. an observable homeowner decision and completion loop;
4. clearer readiness and progressive-disclosure UX;
5. safer, source-backed material-financial guidance;
6. end-to-end experience acceptance; and
7. measurement of decisions and realized outcomes.

The recommended decision is:

> Preserve and deepen Mortgage Refinance Radar, remove its parallel Home priority path, connect it
> to canonical Home Actions, and extend it from “opportunity analysis” to a homeowner-controlled
> decision and completion journey.

### 1.1 Implementation constraint

There are no real users and no production user data requiring preservation.

Therefore:

- no database migration scripts shall be created;
- no data backfill is required;
- no dual-write or legacy compatibility period is required;
- no historical user-state conversion is required;
- Prisma schema changes may be made directly when needed;
- seed or fixture data may be recreated rather than migrated; and
- the user will perform database schema reconciliation separately.

This constraint simplifies the completion-model work, but it does not remove the need for schema
validation, deterministic seed data, authorization, deletion behavior, or automated tests.

---

## 2. Scope

### 2.1 In scope

- Capability definition and Product Framework conformance.
- Unified Home and Home Action integration.
- Mortgage readiness and shared Financing-profile behavior.
- OPEN, UPDATE, CLOSED, DATA_REQUIRED, decision, and completion lifecycle.
- Radar page information architecture and homeowner-facing language.
- Scenario, Loan Estimate, lender-brief, and decision continuity.
- Trust, financial-boundary, source, freshness, and commercial-integrity behavior.
- Persistence and Living Home Record read/write contracts.
- Analytics and outcome measurement.
- Desktop, mobile, accessibility, error, and state acceptance.
- Documentation and operational rollout alignment.

### 2.2 Out of scope

- ContractToCozy selecting, endorsing, ranking, or contacting a lender.
- Automated transmission of homeowner data or Loan Estimates to lenders.
- Loan approval, underwriting, appraisal, eligibility, or rate guarantees.
- Personalized lender pricing presented as a confirmed offer without an official disclosure.
- General email or Web Push activation before the existing controlled-rollout gates pass.
- A new standalone route for scenarios, Loan Estimates, or refinance decisions.
- Database migration scripts or legacy-data preservation.

---

## 3. Homeowner Job and Target Outcome

### 3.1 Primary homeowner job

**Decide with confidence:** determine whether refinancing this mortgage is worth investigating now
and, when it is, compare realistic choices without losing control of sensitive information.

### 3.2 Triggering situations

- A meaningful market-rate change creates a property-specific savings opportunity.
- A homeowner intentionally checks whether refinancing may help.
- A homeowner wants to test another rate, term, cost, payoff, recast, or cash-out scenario.
- A homeowner receives official Loan Estimates and needs an apples-to-apples comparison.
- Previously trusted mortgage facts are missing, stale, or contradicted.

### 3.3 Current delivered outcome

The capability:

- monitors rate changes;
- evaluates the current mortgage;
- explains OPEN and CLOSED states;
- models costs, monthly savings, break-even, lifetime impact, and payoff movement;
- compares terms, objectives, and refinance alternatives;
- records explicitly saved scenarios;
- compares reviewed Loan Estimate disclosures;
- exports homeowner-controlled review artifacts; and
- supports guarded alert preferences.

### 3.4 Target best-in-class outcome

The homeowner can move through one coherent loop:

```text
Opportunity recognized
  → reason and uncertainty explained
  → missing facts corrected
  → alternatives modeled
  → official offers compared
  → decision recorded
  → next step tracked
  → completed refinance verified
  → canonical mortgage record updated
  → future monitoring improves
```

The capability must remain valuable when no opportunity is open by monitoring quietly and
explaining the next property-specific threshold without competing with current Home Actions.

---

## 4. Current Strengths

The following foundations are implemented and should be preserved.

### 4.1 Financial intelligence

- Deterministic payment, interest, savings, break-even, lifetime-cost, payoff, and APR modeling.
- Rate-gap hysteresis and conservative OPEN/CLOSED thresholds.
- Multiple-term and homeowner-objective comparisons.
- Retain-current-loan, extra-principal, recast, and cash-out alternatives.
- Equity, first-lien, combined-lien, property-value, mortgage-insurance, occupancy, property-type,
  loan-type, and program context.
- Explicit educational-planning boundaries instead of approval claims.

### 4.2 Monitoring lifecycle

- Weekly rate snapshots.
- Resumable, paginated evaluation claims.
- Lease tokens, bounded retries, dead-letter handling, and idempotency.
- Durable OPEN, material UPDATE, CLOSED, and DATA_REQUIRED transitions.
- Freshness and confidence suppression for external alerts.

### 4.3 Homeowner controls

- Canonical Financing-profile reuse.
- Missing mortgage data capture.
- Scenario assumptions and explicit save choice.
- Home, email, and push preference controls.
- Cadence, sensitivity, quiet hours, consent, cooldown, and suppression rules.
- Feedback controls.
- Transient-by-default Loan Estimate comparison.
- Explicit comparison save and permanent delete.
- Homeowner-controlled Markdown and selected-lender brief export.

### 4.4 Trust and safety

- Mortgage and market source dates.
- Market-source and national-benchmark labeling.
- Input freshness.
- Confidence and decision factors.
- Visible assumptions and limitations.
- Loan Estimate comparability checks.
- OCR provenance and homeowner review.
- Rate-lock, points, APR, payment, cost, cash-direction, and five-year disclosure warnings.
- Fail-closed outbound-alert rollout.

### 4.5 Existing automated evidence

The audit verification on July 27, 2026 produced:

- 127 passing targeted backend refinance tests; and
- 7 passing frontend rate-chart tests.

The covered backend areas include calculations, thresholds, freshness, eligibility context, alert
preferences, rollout behavior, transitions, DATA_REQUIRED policy, scenario alternatives, program
guidance, Loan Estimate extraction and comparison, handoff safeguards, persistence, Markdown
exports, and analytics.

---

## 5. Audit Scorecard

| Dimension | Score | Maximum | Assessment |
| --- | ---: | ---: | --- |
| Homeowner value and differentiation | 18 | 20 | Strong always-on decision value and unusually deep offer comparison. |
| Functional completeness | 19 | 20 | Core monitoring, analysis, control, and operational lifecycle are mature. |
| Actionability and closed-loop completion | 10 | 15 | Strong preparation and comparison, but no durable final decision or verified refinance outcome. |
| Data quality, freshness, and trust | 13 | 15 | Strong technical safeguards; some unsourced generic homeowner guidance remains. |
| UX clarity and readiness | 12 | 15 | First result is clearer than before, but advanced controls and operational language appear too early. |
| Product Framework integration | 6 | 10 | Manifest and Home behavior do not match; OPEN uses a parallel card rather than canonical action ranking. |
| Accessibility, performance, and reliability | 3 | 5 | Chart evidence is strong; complete route-level responsive and accessibility acceptance is absent. |
| **Total** | **81** | **100** | **Double down with bounded gap closure.** |

The score is provisional until the required multi-state browser acceptance is captured.

---

## 6. Homeowner Question Contract Assessment

| Question | Current answer | Residual gap | Target answer |
| --- | --- | --- | --- |
| What is this? | “Monitor rates and know when refinancing is likely worth the effort.” | The feature name still carries more prominence than the homeowner job in several secondary surfaces. | “We watch for a refinance opportunity for this mortgage and help you compare the real tradeoffs.” |
| How will this benefit me? | OPEN states quantify monthly and lifetime savings and break-even. | CLOSED and setup states emphasize system state more than continuing benefit. | Explain whether action is worthwhile now, what could change that conclusion, and that monitoring continues quietly. |
| What should I do for full benefit? | Inline mortgage form reuses saved Financing values. | Known, missing, stale, required, and optional facts are not clearly separated; all fields render together. | Show known facts with source/date, highlight exact missing or stale facts, explain why each matters, and provide one direct action. |
| What should I care about? | Decision hero, savings, confidence, reasons, and trigger rate are available. | Data, settings, comparison, feedback, and evidence compete with the recommended next move. | Lead with conclusion, estimated benefit, caveats, and one next step; disclose advanced evidence afterward. |
| What can I control? | Assumptions, saved scenarios, alerts, feedback, comparisons, exports, and deletion. | Controls are distributed across a long page and do not include a durable final decision or completion state. | Group controls by Monitor, Explore, Compare, Decide, and Track; make every durable effect visible. |
| Why should I trust this? | Strong source, freshness, confidence, assumption, and disclaimer behavior. | Some generic action guidance uses exact claims or third-party references without visible source/boundary context. | Preserve technical trust evidence and qualify or source all material-financial guidance. |

---

## 7. Product Framework Conformance

| Contract | Current state | Target | Required change |
| --- | --- | --- | --- |
| Primary job | Generic `SAVE_OPTIMIZE` mapping to Decide | Decide with confidence about a refinance opportunity | Add reviewed capability-specific metadata. |
| Outcome | Generic quantified savings result | Opportunity conclusion, reviewed alternatives, recorded decision, and verified outcome | Replace generic outcome text. |
| Expected time to value | Generic 2–5 minutes | Passive monitoring; under one minute to understand an alert; variable comparison time | Record state-specific time to value. |
| Destination | Home | Tool detail plus canonical Home Action when material | Preserve route; correct promotion mechanism. |
| Recommendation mode | `CATALOG_ONLY` | Catalog-discoverable; material domain events become Home Actions | Do not use capability recommendation as a substitute for Home Actions. |
| Triggers | None in capability definition | OPEN and material UPDATE domain transitions; reviewed DATA_REQUIRED trigger | Record trigger and event ownership explicitly. |
| Readiness | Property only | Mortgage status, balance, interest rate, remaining term; freshness treated separately | Add exact readiness contract and safe partial value. |
| Safety | Material financial | Material financial with educational fallback and homeowner-controlled sharing | Preserve and specialize governance wording. |
| Completion kind | `OUTPUT_GENERATED` | `DECISION_RECORDED` for the primary journey, with artifacts as intermediate outputs | Add decision lifecycle and reliable completion event. |
| Completion signal | Generic generated signal | Explicit refinance decision recorded; later refinance outcome verified | Implement domain events and analytics. |
| Home Record reads | `property-context` only | Property context, Financing profile, valuation, liens, documents, saved decisions | Correct manifest reads. |
| Home Record writes | None | Corrected Financing facts, saved scenario/comparison artifacts, decision and verified outcome | Correct manifest writes and add missing persistence. |
| Accepted context | Property | Property, Home Action, financing context, approved document context | Add reviewed deep-link context. |
| Lifecycle | Generic | OPEN → UPDATE → CLOSED plus decision, defer, application, and completion behavior | Extend lifecycle contract. |

### 7.1 Canonical placement decision

Mortgage Refinance Radar may remain available in Explore Tools and the property finance area.

Unified Home behavior shall be:

- DATA_REQUIRED appears only when a reviewed material rate trigger makes the missing facts useful;
- OPEN and material UPDATE appear as canonical Home Actions;
- canonical Home Action ranking determines NOW, SOON, CONSIDER, or PLAN placement;
- CLOSED monitoring does not create a standalone Home card;
- passive monitoring does not display a zero-state card;
- a dismissed or deferred action honors the shared Home Action lifecycle; and
- multi-property prioritization occurs in the canonical action feed rather than a dedicated
  refinance portfolio component.

---

## 8. Prioritized Gap Register

### MRR-001 — Capability contract does not match behavior

- **Priority:** P0
- **Evidence:** The registry uses generic catalog-only `SAVE_OPTIMIZE` defaults even though the
  capability reads and writes financing data, reacts to domain transitions, creates artifacts,
  supports notifications, and appears on Home.
- **Homeowner impact:** Framework discovery, governance, readiness, analytics, and placement can
  make inconsistent decisions.
- **Required outcome:** A reviewed capability definition accurately describes the real journey.

### MRR-002 — OPEN opportunities bypass canonical Home Action ranking

- **Priority:** P0
- **Evidence:** A dedicated refinance portfolio card ranks OPEN properties separately from the
  canonical attention feed; only DATA_REQUIRED is adapted into a Home Action.
- **Homeowner impact:** Competing priority systems can duplicate, over-promote, or incorrectly order
  financial actions.
- **Required outcome:** OPEN and UPDATE transitions become canonical, deduplicated Home Actions and
  the dedicated portfolio card is removed.

### MRR-003 — No durable decision and verified completion

- **Priority:** P1
- **Evidence:** The system records scenarios, comparisons, exports, and feedback but does not record
  the homeowner's refinance decision or actual refinance outcome.
- **Homeowner impact:** The experience ends at analysis; ContractToCozy cannot track the next move,
  update the mortgage record, or measure realized benefit.
- **Required outcome:** The homeowner can record proceed, retain, or defer; optionally track quote,
  selection, application, and closing; and update canonical Financing after verified completion.

### MRR-004 — Page hierarchy is not progressive enough

- **Priority:** P1
- **Evidence:** Freshness, eligibility, alert controls, the full scenario planner, the full Loan
  Estimate workflow, and feedback appear before the “steps to act” section.
- **Homeowner impact:** A strong conclusion is diluted by a long expert interface, increasing
  abandonment.
- **Required outcome:** Organize the journey around Understand → Explore → Compare → Decide → Track,
  with settings and evidence progressively disclosed.

### MRR-005 — Readiness does not identify known and missing facts clearly enough

- **Priority:** P1
- **Evidence:** The setup form pre-populates known values but renders all fields and does not clearly
  label known, missing, stale, required, or optional facts.
- **Homeowner impact:** The homeowner cannot quickly tell what is needed or why.
- **Required outcome:** Show exact missing/stale facts, why each improves the result, known source
  and date, and automatic re-evaluation after save.

### MRR-006 — Some material-financial guidance lacks visible qualification

- **Priority:** P1
- **Evidence:** The action checklist contains exact credit-shopping timing, a named consumer score
  service, generic document requirements, and lender-count guidance without an attached source or
  user-specific qualification.
- **Homeowner impact:** Generic guidance may be mistaken for universally applicable mortgage advice.
- **Required outcome:** Use neutral, qualified, source-backed guidance and tell homeowners what an
  actual lender must confirm.

### MRR-007 — Complete route acceptance is absent

- **Priority:** P1
- **Evidence:** Financial unit tests and chart tests are extensive, but no dedicated browser suite
  proves the complete OPEN, CLOSED, partial, stale, failure, responsive, keyboard, and screen-reader
  experience.
- **Homeowner impact:** Integration regressions may ship despite correct calculations.
- **Required outcome:** Fixture-based desktop/mobile route acceptance with accessibility assertions.

### MRR-008 — Analytics stop before homeowner value is realized

- **Priority:** P2
- **Evidence:** Existing reporting measures views, Home opens, scenarios, comparisons, exports,
  feedback, delivery, duplicates, freshness, and suppression, but not decisions or completed
  refinances.
- **Homeowner impact:** Product success may be inferred from engagement rather than outcomes.
- **Required outcome:** Measure decision, next-step, completion, actual-versus-projected result, and
  time-to-value funnels.

### MRR-009 — Outcome-family boundary has not been formally audited

- **Priority:** P2
- **Evidence:** The enhancement plan establishes Financing as the mortgage-fact owner but does not
  formally score overlap with Financing Center, Break-Even, True Cost, or related scenario routes.
- **Homeowner impact:** Future investment could recreate duplicate calculators or fragmented
  decisions.
- **Required outcome:** Preserve one refinance journey, one Financing fact owner, and subordinate
  scenario/comparison stages rather than new standalone tools.

### MRR-010 — Documentation contains conflicting status

- **Priority:** P2
- **Evidence:** The enhancement plan says only operational work remains, while the functional
  document still lists already-delivered alerts, multi-property ranking, alternatives, and worker
  evaluation as future work.
- **Homeowner impact:** Indirect, but engineering and operations may make decisions from obsolete
  requirements.
- **Required outcome:** Establish this audit as the residual-work plan and synchronize the functional
  and enhancement documents after each slice.

---

## 9. Target Experience

### 9.1 OPEN opportunity

The first screen should answer:

1. **Conclusion:** “Refinancing may be worth comparing now.”
2. **Potential benefit:** bounded monthly savings, break-even, and payoff/lifetime tradeoff.
3. **Why:** the top property-specific drivers and important missing evidence.
4. **Trust:** benchmark source/date, mortgage-data date, confidence, and “not a lender quote.”
5. **Next move:** one primary action such as “Explore my options” or “Compare official offers.”

Secondary choices:

- Not now.
- Keep my current loan.
- Correct mortgage details.
- Change alert preferences.
- View assumptions and market history.

### 9.2 CLOSED monitoring

The tool should say:

- no compelling refinance opportunity is detected under current facts;
- the approximate condition that could change the conclusion;
- when mortgage and market data were last checked;
- monitoring continues;
- no action is required; and
- the homeowner may explore a scenario or correct facts.

CLOSED monitoring should not appear as a Home card.

### 9.3 Missing or stale mortgage facts

The experience should show:

- facts already known and their source;
- exact missing or stale facts;
- why the facts matter;
- whether a result can still be estimated;
- one direct correction action; and
- confirmation that analysis refreshes automatically afterward.

### 9.4 Comparison and decision

The homeowner should be able to:

- test scenarios without saving;
- explicitly save useful scenarios;
- upload or enter official Loan Estimate figures;
- review every extracted value;
- compare only appropriately comparable offers;
- choose an offer, keep the current loan, or defer;
- record questions or next steps;
- export a homeowner-controlled brief; and
- mark the later result without ContractToCozy contacting a lender.

### 9.5 Completion

Completion is not a page view or calculation.

Primary completion occurs when the homeowner explicitly records a decision:

- proceed with a selected/refined option;
- keep the current mortgage; or
- defer until a chosen date or condition.

Verified outcome completion occurs later when the homeowner records that the refinance:

- closed;
- did not close;
- was declined;
- was abandoned; or
- was superseded by another decision.

When closed, the capability should prompt the homeowner to verify the new loan terms and then update
the canonical Financing profile.

---

## 10. Recommended Implementation Sequence

Each slice should be independently releasable and should deliver:

```text
real input → canonical logic → homeowner output → action → durable signal → analytics
```

### Slice 0 — Product truth and canonical placement

**Goal:** Correct the launch-contract defects before adding more UI or functionality.

#### Work

- Replace generic capability metadata with a reviewed Mortgage Refinance Radar definition.
- Record accurate homeowner outcome, time to value, readiness, Home Record reads/writes, accepted
  context, safety boundary, outputs, and lifecycle.
- Define OPEN and material UPDATE Home Action adapters.
- Preserve DATA_REQUIRED Home Action behavior.
- Use stable action IDs and source lineage for deduplication.
- Close or remove the OPEN action automatically when the latest radar state becomes CLOSED.
- Honor shared snooze, defer, dismiss, not-relevant, correct-fact, and no-mortgage behavior.
- Remove `RefinanceRadarPortfolioCard` from Unified Home.
- Keep CLOSED and passive monitoring out of Unified Home.
- Add manifest, source-promotion, lifecycle, ranking, and duplication tests.

#### Acceptance evidence

- Capability registry and current inventory contain the reviewed contract.
- An OPEN transition produces exactly one canonical Home Action.
- A material UPDATE updates that action rather than duplicating it.
- CLOSED removes the action from the current feed.
- A multi-property account is ordered through the shared action ranker.
- No dedicated refinance card renders outside the canonical attention feed.
- Existing product-framework test suites pass.

### Slice 1 — Decision and completion loop

**Goal:** Extend the capability from analysis to an observable homeowner outcome.

#### Work

- Add a property-scoped refinance decision entity or an approved shared decision/journey record.
- Support decision states such as:
  - `EXPLORING`;
  - `DEFERRED`;
  - `KEEP_CURRENT_LOAN`;
  - `PROCEEDING`;
  - `OFFER_SELECTED`;
  - `APPLICATION_IN_PROGRESS`;
  - `CLOSED`;
  - `DECLINED`;
  - `ABANDONED`; and
  - `SUPERSEDED`.
- Link an explicit decision to a saved scenario or reviewed Loan Estimate comparison when relevant.
- Store user-owned rationale, next review date, selected offer reference, and status history.
- Add explicit “Keep current loan,” “Decide later,” and “Proceed with this option” controls.
- Create domain events for decision recorded, decision changed, next step started, and outcome
  completed.
- On verified closing, collect the new canonical mortgage facts and update Financing.
- Preserve the prior mortgage terms as historical decision evidence where the selected domain model
  supports it.
- Add authorization, deletion, state-transition, idempotency, and analytics tests.

#### Schema policy

If new persistence is required:

- update `apps/backend/prisma/schema.prisma` directly;
- do not create a Prisma migration;
- do not create a backfill;
- do not add legacy compatibility fields;
- update seed and test fixtures as needed; and
- allow the user to reconcile the database schema separately.

#### Acceptance evidence

- A homeowner can record each supported primary decision.
- The latest decision and history survive refresh.
- Invalid state transitions fail safely.
- Another property or household cannot read or modify the decision.
- Deferring creates a future review signal without duplicate Home actions.
- Completing a refinance offers a reviewed canonical Financing update.
- The primary capability completion signal is emitted once per decision version.

### Slice 2 — Outcome-first page redesign and readiness

**Goal:** Make the capability understandable and actionable before exposing expert controls.

#### Work

- Reorganize the page into:
  1. conclusion and potential impact;
  2. why this applies and important caveats;
  3. recommended next step;
  4. Explore scenarios;
  5. Compare official offers;
  6. Decide and track;
  7. expandable monitoring, source, assumptions, eligibility, and alert settings.
- Replace “Re-evaluate radar” with homeowner language such as “Refresh estimate.”
- Replace rollout and delivery implementation terminology with truthful homeowner language.
- Add known/missing/stale/optional states to the mortgage-readiness presentation.
- Explain why balance, rate, term, and optional payment/date facts improve the result.
- Change the setup CTA from mechanism language to outcome language.
- Automatically refresh the analysis after a canonical fact update.
- Collapse or defer the Loan Estimate workflow until the homeowner chooses to compare offers.
- Move feedback after a meaningful output or decision rather than before the action plan.
- Preserve chart table equivalence, keyboard navigation, reduced motion, and responsive behavior.

#### Acceptance evidence

- The first viewport answers all applicable Homeowner Question Contract questions.
- OPEN, CLOSED, missing, stale, unavailable, and error states are visually and semantically distinct.
- Known facts are not presented as missing.
- Required and optional facts are distinguishable.
- A homeowner can reach the primary next step without passing alert settings or technical evidence.
- Mobile layouts do not require horizontal page scrolling.
- Keyboard order follows the visible decision hierarchy.

### Slice 3 — Material-financial trust and content review

**Goal:** Ensure every action statement is appropriately bounded, sourceable, and non-commercial.

#### Work

- Review all claims about credit scores, credit inquiries, document preparation, quote counts, rate
  locks, program rules, and lender behavior.
- Remove unnecessary third-party brand recommendations.
- Add a maintained source or neutral qualification for material claims.
- Explain that consumer scores may not be the score or model a mortgage lender uses.
- Avoid implying universal lender documentation or underwriting rules.
- Preserve benchmark-versus-offer distinction on every relevant state and export.
- Preserve “official Loan Estimate controls” and lender/professional confirmation boundaries.
- Verify that no lender is endorsed, ranked for compensation, or contacted.
- Add copy review and governance tests for prohibited approval, guarantee, urgency, and commercial
  language.

#### Acceptance evidence

- Every material claim is sourced, qualified, or removed.
- No consumer benchmark is described as a personalized offer.
- No score source is presented as equivalent to lender underwriting without qualification.
- No commercial relationship is implied.
- Scenario and comparison exports retain the same boundaries as the page.

### Slice 4 — Full experience acceptance

**Goal:** Prove the complete homeowner journey, not only its calculations.

#### Work

- Add a deterministic Mortgage Refinance Radar acceptance fixture.
- Add Playwright coverage for:
  - no mortgage;
  - partial mortgage;
  - complete and current mortgage;
  - stale mortgage;
  - no rate data;
  - stale rate data;
  - OPEN;
  - material UPDATE;
  - CLOSED;
  - load failure and retry;
  - scenario run and save;
  - Loan Estimate review, save, load, and delete;
  - decision and completion;
  - alert preference success and unavailable channels;
  - canonical Home Action entry and dismissal;
  - multi-property ranking; and
  - canonical Financing writeback.
- Cover desktop and supported mobile widths.
- Add keyboard, focus, accessible-name, status-announcement, table-equivalence, and reduced-motion
  assertions.
- Add critical visual-contract snapshots for the primary states.

#### Acceptance evidence

- The dedicated browser suite passes locally and in CI.
- No state renders a failure as a successful zero or all-clear.
- Every primary CTA reaches a working destination with property context preserved.
- Destructive comparison deletion requires explicit confirmation.
- The core journey is usable without a pointing device or chart color.

### Slice 5 — Outcome measurement and controlled optimization

**Goal:** Measure homeowner value and prepare safe optimization.

#### Work

- Extend analytics with:
  - opportunity-to-decision rate;
  - median time from OPEN to decision;
  - decision distribution;
  - defer-to-return rate;
  - quote-comparison-to-selection rate;
  - selection-to-application rate;
  - application-to-close rate;
  - projected-versus-recorded payment change;
  - projected-versus-recorded closing cost;
  - realized monthly savings where homeowner-confirmed;
  - canonical mortgage writeback completion; and
  - stale or reopened decision rate.
- Preserve existing coverage, freshness, duplicate, feedback, suppression, opt-out, and complaint
  guardrails.
- Define approved thresholds for Home Action usefulness and duplicate rates.
- Add an authorized admin report without exposing sensitive mortgage values unnecessarily.
- Update operational ownership and service-level objectives.

#### Acceptance evidence

- A synthetic journey appears correctly in the full decision funnel.
- Analytics are property-authorized and purpose-minimized.
- Completion is not inferred from a page view, export, or lender-brief download.
- Projected and actual values remain distinguishable.
- Metrics suppress or aggregate sensitive low-volume segments appropriately.

### Slice 6 — Documentation and operational rollout alignment

**Goal:** Establish one current source of truth and retain the existing fail-closed rollout.

#### Work

- Update the functional document to reflect implemented alerts, worker evaluation, multi-property
  behavior, scenario alternatives, and Loan Estimate comparison.
- Update the enhancement plan so it no longer says only operational work remains.
- Record this audit's disposition, score, and slice status.
- Regenerate the current capability inventory after contract changes.
- Update alert configuration and incident runbooks when needed.
- Keep email and Web Push in the explicit internal allowlist until the previously defined delivery,
  duplicate, opt-out, complaint, usefulness, and freshness gates pass.
- Require a separate authorization before any automated lender transmission or commercial action.

#### Acceptance evidence

- Functional, product, capability-inventory, configuration, and runbook documents agree.
- Every slice has repository evidence and a recorded status.
- No stale “future enhancement” describes already-implemented behavior.
- External delivery remains fail-closed without approved configuration and cohort membership.

---

## 11. Proposed Persistence Model

The exact entity should reuse an approved shared decision or journey model if one cleanly satisfies
the requirements. If it does not, a focused property-scoped refinance decision model is preferred
over storing the lifecycle in unstructured analytics metadata.

Minimum conceptual fields:

| Field | Purpose |
| --- | --- |
| `id` | Stable decision identity |
| `propertyId` | Property authorization and ownership |
| `userId` or actor reference | Auditable homeowner action |
| `status` | Current decision or completion state |
| `radarOpportunityId` | Optional originating opportunity |
| `scenarioSnapshotId` | Optional reviewed scenario |
| `loanEstimateComparisonId` | Optional reviewed official comparison |
| `selectedOfferId` | Optional homeowner-selected offer reference |
| `rationale` | Optional homeowner-owned note |
| `nextReviewAt` | Durable defer/review time |
| `decidedAt` | Initial decision time |
| `completedAt` | Verified outcome time |
| `metadataJson` | Bounded versioned details that do not warrant first-class columns |
| timestamps | Lifecycle and audit ordering |

A history table or append-only domain events should preserve state changes. Sensitive values should
not be copied into the decision record when a canonical scenario, comparison, or Financing record
already owns them.

### 11.1 Schema implementation rule

Because there are no real users:

- prefer a clean final schema over transitional compatibility;
- remove abandoned experimental fields if they are no longer required;
- update test factories and seed data to the final shape;
- validate Prisma schema and client generation;
- do not create migration SQL or Prisma migration directories; and
- document the schema-push requirement for the user.

---

## 12. Acceptance Matrix

| State or journey | Required result |
| --- | --- |
| No mortgage | Calm explanation, monitoring paused, direct Financing action, no Home promotion |
| Partial mortgage | Exact missing facts, known values retained, meaningful-trigger policy honored |
| Complete mortgage, no prior evaluation | Automatic evaluation or truthful bounded loading state |
| CLOSED | No-action conclusion, approximate change condition, freshness, quiet monitoring |
| OPEN | Quantified bounded benefit, why it applies, confidence, caveats, one primary action |
| Material UPDATE | Existing canonical action updates without duplication |
| CLOSED after OPEN | Current Home action resolves; historical transition remains |
| Stale mortgage facts | Estimate may remain visible; confidence/alerts fail appropriately closed |
| Stale market data | No false urgency; outbound alerts suppressed |
| No market data | Distinct unavailable state; no successful-zero presentation |
| Scenario | Assumptions visible, deterministic result, explicit save, no implied quote |
| Loan Estimate extraction | Non-retained file, provenance, capped confidence, explicit review |
| Unlike offers | Visible comparability warnings; no misleading universal winner |
| Decision | Durable proceed, retain, or defer choice with visible confirmation |
| Completion | Verified outcome recorded; canonical Financing update offered |
| Home | Canonical action only; no dedicated refinance priority card |
| Alert controls | Consent, cadence, quiet hours, sensitivity, and unavailable channels truthful |
| Error | Bounded failure, affected output identified, safe retry |
| Mobile/accessibility | Same conclusion, action, trust, and completion without lost content |

---

## 13. Testing Strategy

### 13.1 Unit

- Capability-definition contract.
- Trigger and readiness rules.
- OPEN/UPDATE/CLOSED Home Action adaptation.
- Action lifecycle and deduplication.
- Decision state machine.
- Completion and Financing writeback.
- Financial guidance copy/governance rules.
- Outcome analytics.

### 13.2 Integration

- Rate snapshot → evaluation claim → transition → canonical Home Action.
- DATA_REQUIRED → correction → evaluation → action resolution.
- Scenario/comparison → decision → completion.
- CLOSED transition resolving an OPEN Home Action.
- Decision authorization and cross-property isolation.
- Schema persistence, deletion, and cascade behavior.

### 13.3 Browser acceptance

- Full state matrix on desktop and mobile.
- Home entry and return navigation.
- Form validation and automatic refresh.
- Progressive-disclosure order.
- Loan Estimate workflow.
- Decision and completion.
- Keyboard, focus, live-region, contrast, reduced-motion, and chart-table equivalence.

### 13.4 Operational

- Evaluation coverage and lag.
- Retry and dead-letter behavior.
- Duplicate actions and notifications.
- Freshness suppression.
- Email and push cohort enforcement.
- Preference and opt-out behavior.
- No lender transmission.

---

## 14. Success Measures

### 14.1 Primary outcome measures

- Percentage of OPEN opportunities with an explicit homeowner decision.
- Median time from OPEN review to decision.
- Percentage of proceeding decisions with an official comparison.
- Percentage of deferred decisions revisited at the intended time.
- Percentage of completed refinances with canonical Financing updated.
- Homeowner-confirmed realized savings compared with the prior mortgage.

### 14.2 Quality measures

- OPEN usefulness rate.
- Not-relevant and keep-current decision rate.
- Projection-versus-recorded outcome error.
- Stale-input OPEN rate.
- Duplicate Home Action rate.
- Home Action dismissal and snooze rate.
- Comparison correction rate after OCR.
- Incomplete or unlike-offer warning rate.

### 14.3 Guardrails

- No OPEN action from stale or materially incomplete inputs.
- No general external delivery without explicit rollout approval.
- No external contact without homeowner action and separate authorization.
- No personalized-rate, approval, eligibility, or realized-savings guarantee.
- No sensitive financial values in unnecessary analytics or notification previews.
- No outcome completion inferred from a view, scenario run, or export.

---

## 15. Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Refinance action competes with more urgent home work | Use canonical Home Action ranking and remove the dedicated card. |
| National benchmark appears to be a personalized quote | Preserve benchmark labels, source/date, assumptions, and lender-confirmation boundary. |
| Complex page overwhelms homeowners | Use progressive disclosure and a staged decision journey. |
| User records an unverified completion | Require explicit homeowner confirmation and show source/status of new mortgage facts. |
| Refinance decision duplicates Financing scenarios | Financing owns facts; Radar owns the refinance opportunity and decision journey; link rather than copy. |
| OCR creates false confidence | Preserve non-retention, provenance, confidence caps, editability, and explicit review. |
| Alerts become noisy | Preserve transition, materiality, freshness, sensitivity, cooldown, consent, and cohort gates. |
| Outcome analytics expose sensitive data | Use purpose-minimized events, authorization, aggregation, and bounded metadata. |
| Documentation diverges again | Make slice completion include documentation and inventory synchronization. |

---

## 16. Definition of Done

Mortgage Refinance Radar satisfies this audit when:

- its capability manifest accurately describes the implemented homeowner journey;
- OPEN and material UPDATE states use canonical Home Actions;
- the dedicated Unified Home refinance portfolio card is removed;
- CLOSED and passive monitoring remain quiet;
- exact known, missing, stale, required, and optional facts are understandable and actionable;
- the first screen explains the conclusion, benefit, reason, trust boundary, and next move;
- advanced evidence and settings use progressive disclosure;
- a homeowner can record proceed, retain, or defer;
- the later refinance outcome can be recorded and verified;
- a completed refinance can update canonical Financing facts;
- completion is represented by a durable domain event rather than a page view;
- material-financial guidance is qualified or source-backed;
- the complete desktop/mobile/accessibility acceptance suite passes;
- outcome analytics measure decisions and verified results;
- functional, product, capability, and operational documentation agree;
- external alerts remain fail-closed until the controlled rollout passes; and
- no migration scripts or legacy-data backfills have been created.

---

## 17. Recommended Immediate Next Step

Begin with **Slice 0 — Product truth and canonical placement**.

It is the smallest high-value correction, removes a framework launch defect, prevents further
investment in a parallel Home priority system, and creates the correct foundation for the decision
and completion work in Slice 1.
