# Coverage and Premium Optimization Capability Audit and Implementation Plan

**Capabilities:** Coverage Intelligence, Coverage Options, Insurance Trend, and Risk-to-Premium Optimizer
**Audit framework:** `CAPABILITY_OUTCOME_AND_EXPERIENCE_AUDIT_FRAMEWORK.md`
**Audit date:** July 27, 2026
**Status:** Implementation complete; real-user launch remains gated
**Implemented disposition:** **Consolidated, rebuilt, and fail-closed for unsupported claims**
**Current safety classification:** Regulated coverage
**Recommended safety classification:** Regulated coverage for the complete outcome family
**Primary outcome family:** Coverage and Premium Review

---

## 0. Implementation Closure — July 28, 2026

All repository implementation slices in this plan are complete:

- one canonical, property-scoped Coverage and Premium Review capability and
  four-stage workspace replace the separate homeowner tools;
- verified policy terms, field-level evidence, deterministic review questions,
  equivalent-choice comparison, durable decisions, renewal history,
  loss-prevention plans, and governed professional handoffs are implemented;
- legacy property-insurance verdicts, generated strategic advice, heuristic
  add-on recommendations, fixed/additive savings, synthetic premium history,
  and generated-review completion have been removed from homeowner output;
- downstream cost tools use only confirmed observed policy-term premiums and
  explicitly exclude insurance history when it is unavailable;
- mitigation-plan guidance is required at the schema and reader boundary; and
- retired routes are redirects or explicit `410 Gone` boundaries, while
  analytics aliases converge on the canonical capability.

The capability intentionally remains `BETA`, `REGULATED_COVERAGE`, and
`CATALOG_ONLY`. Licensing, legal/compliance approval, commercial recipient
approval, production source-rights approval, and real-user launch authorization
are external release gates, not pending repository implementation. The launch
gate remains fail-closed until those approvals and their current evidence are
recorded.

The remaining `CoverageAnalysis` API supports neutral property/item cost
scenarios only. It does not produce policy verdicts, coverage-gap signals,
policy add-on suggestions, or homeowner recommendations. Canonical policy
questions and decisions are owned by Coverage Review.

## 1. Executive Decision

Coverage Intelligence, Coverage Options, Insurance Trend, and Risk-to-Premium
Optimizer are not four independent homeowner jobs. They are incomplete stages of
one regulated coverage outcome:

> Help me understand what my home policy does and does not protect, prepare for
> renewal, compare safe choices, and complete the right coverage or
> risk-reduction action without trading away protection unknowingly.

The repository contains valuable foundations:

- property-scoped policy and warranty records;
- insurance-document OCR and document-intelligence extraction;
- homeowner confirmation and correction paths;
- inventory value and coverage-state records;
- property, claims, maintenance, risk, and responsibility context;
- saved coverage analyses and what-if scenarios;
- a mitigation plan with planned, completed, and skipped states;
- evidence links for completed mitigation;
- post-mitigation premium comparison;
- canonical Home Action promotion;
- contextual guidance and property-context capture;
- a quote-request record; and
- regulated-coverage capability classification.

Those foundations do not currently produce a trustworthy end-to-end coverage
decision.

The most material current problems are:

1. **Coverage Intelligence does not analyze controlling policy language.** Its
   insurance verdict is derived from policy presence, premium, inferred
   deductible, cash buffer, broad state lists, claims count, inventory linkage,
   maintenance tasks, and a property risk score.
2. **Inventory “coverage gaps” are not policy coverage determinations.** An
   inventory item linked to any active insurance policy is treated as insured,
   without evaluating covered peril, exclusion, sublimit, valuation basis,
   endorsement, deductible, or claim condition.
3. **Insurance Trend fabricates a personal history.** It estimates a present
   premium from hard-coded state baselines and home-value heuristics, then
   reconstructs prior years by reversing a fixed growth rate. The UI labels the
   series “Your premium” and calculates “Total paid,” even though no historical
   premium payments were observed.
4. **Insurance Trend presents unsupported savings claims.** The UI displays
   “Potential savings: 10–15%,” says the homeowner “may be paying more,” and
   recommends switching or adjusting the deductible without a quote, carrier,
   coverage-equivalence, renewal, or filed-rate basis.
5. **Insurance Trend has dead actions.** Multiple “Compare Quotes” and “Compare
   coverage options” links point to `#`.
6. **Risk Optimizer attaches dollar savings to hard-coded recommendations.**
   Individual mitigation actions contain fixed savings ranges. These ranges are
   summed, boosted by an assumed bundle factor, and presented as an annual
   premium-pressure reduction even though discounts are carrier-, state-,
   policy-, eligibility-, and evidence-dependent and are not generally
   additive.
7. **Coverage Options does not compare policy options.** It lists item coverage
   gaps and routes the homeowner to an item warranty analysis or inventory
   workflow. Its completion can be recorded merely because the gaps were
   reviewed.
8. **The quote path is only lead capture.** The current request form does not
   return quotes, compare equivalent coverage, identify the recipient, disclose
   commercial relationships, capture communication consent, or track
   fulfillment and binding.
9. **The capability contract is fragmented.** The generated inventory treats
   all four as separate `SAVE_OPTIMIZE` tools with `OUTPUT_GENERATED`
   completion, even though the family must support understanding, decision,
   action, and verified outcome.
10. **The UI exposes tool mechanics rather than one coverage decision.** The
    homeowner must understand terms such as “coverage intelligence,” “premium
    pressure,” “deterministic,” “scenario input,” “coverage graph,” “risk
    tolerance,” and “mitigation verification” before receiving a defensible
    answer.

The recommended product decision is:

1. create one property-scoped **Coverage and Premium Review** workspace;
2. make the policy and declarations record the canonical source of truth;
3. distinguish confirmed policy facts, document-extracted facts, homeowner
   statements, public benchmarks, and scenarios;
4. replace policy-presence gap detection with qualified protection questions;
5. treat inventory warranties, property insurance, flood, specialty policies,
   and self-insurance as different protection mechanisms;
6. remove fabricated historical premium and “total paid” claims;
7. remove fixed and additive premium-savings claims until a reviewed,
   carrier-qualified basis exists;
8. support renewal change detection from actual policy records and notices;
9. compare choices only when coverage equivalence and material tradeoffs can be
   shown;
10. integrate mitigation planning as an optional action stage, not a separate
    optimizer destination;
11. activate quote or partner handoffs only after consent, licensing,
    disclosure, fulfillment, and outcome controls are complete;
12. record the homeowner decision and resulting policy or mitigation outcome in
    the Living Home Record; and
13. surface the family on Home only when a canonical action exists, such as a
    material verified gap, renewal change, missing required evidence, expiring
    policy, or active coverage decision.

The target promise should be:

> See what your current policy says, identify questions worth resolving before
> renewal, compare safer choices, and keep the final decision with your home
> record.

### 1.1 Implementation constraint

There are no real users and no production data migration requirement.

Implementation may modify the Prisma schema directly. It must not create:

- database migration scripts;
- historical backfills;
- compatibility models for obsolete generated analyses;
- dual-write behavior;
- persistence solely to preserve current heuristic histories or savings
  ranges; or
- legacy capability definitions that have no target-product purpose.

The user will reconcile the database separately after schema changes.

This constraint should be used to create one clean, canonical coverage decision
model instead of preserving four partial product contracts.

---

## 2. Scope

### 2.1 In scope

This audit covers:

- Coverage Intelligence service, controller, routes, API, page, and panel;
- Coverage Options gap listing, item handoffs, guidance completion, and route;
- Insurance Trend service, API, chart, copy, actions, and trust presentation;
- Risk-to-Premium Optimizer calculation, plan, evidence, verification, API, and
  UI;
- insurance policy, warranty, coverage analysis, scenario, quote request, and
  mitigation persistence;
- insurance OCR and document-intelligence paths;
- inventory coverage state and coverage-gap detection;
- policy management and Property Context capture;
- Home Action promotion, discovery, launch context, and guidance integration;
- source, freshness, confidence, assumptions, correction, and lifecycle;
- regulated advice and commercial-integrity boundaries;
- completion, analytics, accessibility, performance, operations, and tests;
- overlap with Protect, Document Vault, Claims, Home Event Radar, Home
  Timeline, Guidance, provider discovery, and Negotiation Shield.

### 2.2 Out of scope

This document does not:

- interpret a specific insurance policy;
- provide legal, actuarial, underwriting, or licensed insurance advice;
- validate current state insurance law or carrier rules;
- choose an insurance-data, quoting, or licensed-agency partner;
- authorize automatic policy changes or binding;
- define partner compensation;
- create a database migration; or
- implement the recommended slices.

### 2.3 Evidence reviewed

Repository evidence reviewed includes:

- the Product Framework and capability audit framework;
- the generated capability inventory;
- strategic, pre-launch, and route-consolidation audits;
- the four frontend routes and their global redirect routes;
- Coverage Intelligence and Risk Optimizer frontend panels;
- Coverage Options and Insurance Trend clients;
- backend services, controllers, routes, and DTOs;
- the Prisma models for policies, analyses, scenarios, quote requests, and
  mitigation plans;
- insurance OCR and document-intelligence services;
- policy and inventory capture definitions;
- coverage applicability and gap services;
- coverage guidance reconciliation;
- Home Action source promotion;
- capability discovery and lifecycle analytics;
- available focused and governance tests.

No single governing domain FRD currently defines the combined Coverage and
Premium Review outcome.

---

## 3. Homeowner Job and Target Outcome

### 3.1 Primary homeowner job

> Before renewal, after a change, or when I am worried about a loss, help me
> understand my current protection, identify material questions, compare safe
> choices, and complete the right next step.

### 3.2 Secondary homeowner jobs

- Store and verify current policy information.
- Understand a renewal notice or premium change.
- Check whether dwelling, personal property, liability, loss-of-use, flood,
  water backup, equipment breakdown, and other relevant protections warrant
  review.
- Understand deductibles, sublimits, exclusions, valuation method, and
  endorsements in plain language.
- Identify where the Home Record lacks evidence rather than assuming no
  coverage.
- Compare the cost and protection tradeoff of policy scenarios.
- Decide whether to keep, modify, shop, or seek licensed advice.
- Identify property work that may reduce loss exposure.
- Prepare evidence that a carrier or licensed professional can review.
- Record a decision, new policy, completed mitigation, and observed outcome.

### 3.3 Triggering situations

The family is contextually relevant when:

- a policy or renewal document is added;
- a policy expires soon;
- a premium, deductible, limit, endorsement, or carrier changes;
- a renewal or non-renewal notice is detected;
- a material home addition, renovation, purchase, or occupancy change may
  affect coverage;
- inventory value materially exceeds a confirmed relevant limit;
- a claim exposes a documentation or protection question;
- a new hazard or Home Event Radar signal warrants policy review;
- the homeowner completes loss-prevention work;
- a quote or coverage alternative is available for comparison;
- the homeowner explicitly starts a renewal review.

The capability should not be promoted merely because:

- no analysis has been run;
- a generated analysis is stale;
- a policy field is unknown but no decision is active;
- a generic state-risk list contains the property state;
- a heuristic estimates possible savings; or
- the family has no result to show.

### 3.4 Current delivered outcomes

#### Coverage Intelligence

Currently delivers:

- insurance and warranty verdicts;
- insurance flags;
- generic add-on suggestions;
- estimated warranty economics;
- decision trace;
- optional AI strategic advice;
- next steps;
- scenarios.

The verdict names `WORTH_IT`, `SITUATIONAL`, and `NOT_WORTH_IT` are especially
problematic for property insurance. Insurance is not one homogeneous purchase,
and a high premium relative to a modeled annual repair risk does not establish
that insurance is “not worth it.”

#### Coverage Options

Currently delivers:

- an inventory coverage-gap count;
- gap-type breakdown;
- item-level links;
- a “not needed” control;
- a quote-request modal in the related inventory coverage experience;
- guidance review completion.

It does not deliver comparable policy or warranty options.

#### Insurance Trend

Currently delivers:

- estimated present annual premium;
- estimated state baseline;
- synthetic historical series;
- synthetic total paid and comparison rollups;
- heuristic local drivers;
- an unsupported 10–15% savings message;
- dead quote CTAs;
- an educational-estimate disclaimer.

The disclaimer does not cure contradictory primary claims.

#### Risk-to-Premium Optimizer

Currently delivers:

- property and premium drivers;
- a fixed-dollar recommendation list;
- a summed savings range;
- mitigation plan items;
- plan status changes;
- evidence document and Home Event links in the backend;
- post-mitigation premium delta across runs.

The plan lifecycle is useful. The claimed premium savings basis is not
sufficiently qualified.

### 3.5 Target best-in-class outcome

The target outcome is:

> The homeowner has a verified or explicitly qualified policy view, understands
> the few material questions that apply to this home, compares choices without
> hidden loss of protection, completes a policy-review or mitigation action, and
> preserves the decision and outcome.

The journey should leave the homeowner with:

- a current policy record and source document;
- verification state for every material fact;
- effective dates and renewal date;
- a plain-language current-protection summary;
- an exact list of unknowns and why each matters;
- a short, ranked review list;
- policy-language citations or an explicit “not determined” state;
- an actual premium change history when records exist;
- a renewal readiness state;
- equivalent-coverage comparison requirements;
- scenario tradeoffs, not a single savings promise;
- an optional loss-prevention plan;
- a safe licensed-professional or carrier handoff;
- communication and data-sharing controls;
- a recorded decision and rationale;
- a linked final policy or completed mitigation;
- an observed outcome when available.

---

## 4. Outcome-Family Consolidation

### 4.1 Current fragmentation

| Current surface | Current responsibility | Primary gap |
|---|---|---|
| Insurance management | Store policy records | Separate from the decision journey; coarse coverage model |
| Coverage Intelligence | Generate insurance and warranty verdicts | Heuristic logic overstates policy understanding |
| Coverage Options | List inventory gaps | Does not compare options |
| Insurance Trend | Show premium trend | Synthetic history and unsupported savings |
| Risk Optimizer | Recommend mitigations and policy levers | Fixed, additive savings assumptions |
| Protect | Summarize protection posture | Overlaps with Coverage Intelligence and inventory coverage |
| Inventory Coverage | Track item warranty/policy linkage | Linkage is confused with actual scope |
| Document Vault | Store declarations and notices | Extraction/confirmation does not produce one canonical review |
| Insurance Quote Request | Capture lead | No comparison, consent, disclosure, fulfillment, or outcome |
| Guidance | Track coverage steps | Review or generated output can count as completion |

### 4.2 Recommended canonical product

Create one property-scoped **Coverage and Premium Review** workspace.

The existing route can be retained as the canonical technical destination:

`/dashboard/properties/[id]/tools/coverage-intelligence`

The homeowner-facing page name should change. The route should progressively
expose stages rather than separate tools:

1. **Current protection**
2. **Questions to review**
3. **Renewal and premium changes**
4. **Compare choices**
5. **Reduce loss risk**
6. **Decision and outcome**

The product may later adopt a cleaner route, but route renaming is not required
to deliver the outcome.

### 4.3 Capability disposition

| Current capability | Decision | Target role |
|---|---|---|
| Coverage Intelligence | Retain core records; rebuild product contract | Canonical Coverage and Premium Review workspace |
| Coverage Options | Merge | “Compare choices” stage; never a standalone catalog tool |
| Insurance Trend | Hide current output; rebuild | Actual policy and renewal history stage; public market context only when sourced |
| Risk Optimizer | Merge and rename | “Reduce loss risk” stage with qualified carrier-review language |

### 4.4 Route disposition

- Keep the current global Coverage Intelligence resolver only as a
  property-selection alias.
- Keep the current global Risk Optimizer resolver temporarily, then redirect it
  to the canonical workspace’s loss-risk stage.
- Keep the existing Coverage Options redirect, but target the real comparison
  stage.
- Redirect Insurance Trend to the renewal-history stage only after that stage
  stops generating synthetic history.
- Update all internal links, Home Actions, Radar handoffs, Guidance steps, and
  discovery manifests to the canonical capability.
- Remove the four independent catalog cards.

### 4.5 Canonical responsibility map

| Responsibility | Canonical owner |
|---|---|
| Policy identity, dates, limits, deductibles, endorsements, documents | Insurance policy record |
| Document extraction and source evidence | Document Vault / document intelligence |
| Home-specific protection questions | Coverage and Premium Review |
| Inventory values and item lifecycle | Living Home Record inventory |
| Warranty economics | Item coverage or repair/replace journey |
| Actual renewal and premium history | Policy-term history |
| Public premium context | Reviewed benchmark source |
| Risk and mitigation relevance | Property Context and risk engines |
| Mitigation plan and evidence | Coverage and Premium Review |
| Quote comparison | Coverage comparison stage |
| Licensed help or partner handoff | Governed provider/insurance workflow |
| Decision and outcome | Coverage decision record and Home Timeline |
| Home priority | Canonical Home Action |

### 4.6 Why consolidation is mandatory

Improving each page independently would preserve:

- four capability names for one decision;
- repeated policy and premium inputs;
- contradictory results;
- several competing confidence models;
- separate analytics completions;
- dead handoffs;
- duplicated protection summaries;
- independent scenario records;
- unclear responsibility for the final decision;
- excessive Home and catalog prominence.

Consolidation is the product improvement.

---

## 5. Current Strengths to Preserve

### 5.1 Property-scoped authorization

The principal APIs use authentication and property authorization. Insurance
Trend also restricts access to homeowners. This is an appropriate baseline for
financial and policy records, though role behavior should be standardized
across the family.

### 5.2 Canonical policy and warranty records

The repository already stores:

- carrier;
- policy number;
- coverage type;
- annual premium;
- deductible;
- personal-property limit;
- effective dates;
- verification state;
- linked documents;
- inventory links;
- claims.

These records are a better foundation than isolated tool inputs.

### 5.3 Document ingestion and confirmation

The product can:

- OCR personal-property limits and deductibles;
- use broader document intelligence for policy fields;
- link documents to policies;
- expose verification nudges;
- let the homeowner confirm or correct extracted values.

The target architecture should extend this path, not build a parallel upload
flow inside the coverage tool.

### 5.4 Property Context capture

Coverage Intelligence can request the exact policy or inventory detail it
needs. The capture registry explains that an empty record does not mean the
homeowner lacks coverage. This is the correct readiness pattern.

### 5.5 Coverage applicability

The coverage context policy distinguishes:

- active;
- future;
- expired;
- invalid or unknown date windows;
- property ownership of the record.

Unknown applicability is not automatically treated as uncovered. That
fail-closed principle should be applied to all protection claims.

### 5.6 Scenario persistence

Coverage scenarios and shared assumption sets provide a useful foundation for
comparison. Scenarios should be rebuilt around material policy choices and
equivalent-coverage safeguards.

### 5.7 Staleness behavior

Coverage analyses are marked stale when:

- inventory changes;
- claims change;
- maintenance changes;
- policy or warranty changes;
- risk context changes.

This is valuable lifecycle behavior.

### 5.8 Mitigation plan lifecycle

Risk Optimizer plan items support:

- recommended;
- planned;
- completed;
- skipped;
- priority;
- peril;
- estimated cost;
- evidence document;
- linked Home Event;
- completion time.

The lifecycle can support a strong loss-prevention experience once premium
claims are qualified.

### 5.9 Outcome observation foundation

The optimizer compares the prior premium input with a later premium input after
mitigation. Although this does not establish causality, it is a useful
observational record when labeled correctly.

### 5.10 Home Action and Guidance integration

Coverage outputs can create canonical actions and guidance steps. The current
implementation already provides:

- evidence;
- assumptions;
- choices;
- tradeoffs;
- confidence;
- professional boundary;
- correction CTA.

These should be driven by verified findings and decision stages rather than the
current broad verdict.

---

## 6. Current-State Functional Review

### 6.1 Coverage Intelligence logic

The current property-level analysis reads:

- inventory items and replacement-cost estimates;
- item condition and age;
- maintenance tasks;
- claims from the last 24 months;
- active property-linked insurance policies;
- active warranties;
- coverage-gap records;
- property risk score;
- state;
- drainage issues;
- cash-buffer or budget signals;
- homeowner overrides and preferences.

It then:

- estimates annual repair risk;
- adds fixed maintenance and claim boosts;
- compares warranty cost with modeled repair risk;
- creates insurance flags;
- recommends add-ons using claims, property fields, equipment, and state lists;
- assigns insurance and warranty verdicts;
- combines them into one overall verdict;
- counts available signals to determine confidence;
- generates AI strategic advice.

This is a property-protection heuristic, not a policy coverage audit.

### 6.2 Coverage gap logic

The gap service:

- evaluates visible, actionable inventory items;
- ignores items below fixed value thresholds;
- recognizes homeowner waivers;
- evaluates active dates;
- checks whether an item has a linked warranty or insurance policy;
- classifies no coverage, warranty only, insurance only, or expired linkage.

It does not inspect:

- what peril caused the loss;
- whether the item is part of Coverage A, B, C, or another section;
- scheduled-property status;
- category or per-item sublimits;
- actual cash value versus replacement-cost treatment;
- wear-and-tear or mechanical breakdown exclusions;
- cause-of-loss exclusions;
- endorsement applicability;
- deductible type;
- claim conditions;
- limits exhausted by other losses.

Therefore “covered,” “uncovered,” and “all tracked items currently have
coverage” are stronger than the underlying evidence.

### 6.3 Warranty logic

Coverage Intelligence estimates annual repair risk using:

- default category replacement costs;
- condition weights;
- item age;
- category multipliers;
- maintenance and claim boosts;
- risk tolerance.

It compares that modeled value with warranty annual cost and one default service
fee.

This can be useful as an educational item scenario, but it cannot establish:

- claim approval probability;
- covered components;
- pre-existing-condition exclusions;
- payout caps;
- service quality;
- waiting periods;
- cancellation terms;
- actual repair frequency;
- value of overlapping manufacturer or credit-card protection.

The UI must not call the result a definitive buy or do-not-buy decision.

### 6.4 Insurance Trend logic

When the homeowner does not supply overrides, the service:

- estimates home value from size and a small hard-coded state price-per-square-
  foot map or a generic $350,000 fallback;
- estimates current premium from 0.48% of that value;
- applies state climate and ZIP-prefix heuristics;
- anchors the result toward a small hard-coded state baseline table;
- assumes 7% or 9% annual personal premium growth;
- assumes 6% or 8% state-average growth;
- reverses those growth rates to create prior-year values;
- sums the generated series as total premium paid.

The service does correctly declare:

- `EDUCATIONAL_ESTIMATE`;
- `financialPlanningSafe: false`;
- that it does not use live DOI filings, FEMA/NOAA actuarial data, or actual
  policy records;
- usage restrictions.

The UI nevertheless says:

- “Your premium”;
- “You may be paying more”;
- “Total paid”;
- “Extra paid”;
- “local average”;
- “Potential savings: 10–15%”;
- “switching carriers or adjusting your deductible can often close the gap.”

Primary claims contradict the disclosed evidence and classification.

### 6.5 Risk Optimizer logic

The optimizer reads:

- active policy premium, deductible, and untyped `coverageJson`;
- property risk score;
- claims by peril;
- inventory age and condition;
- inspection and mitigation evidence;
- coverage-gap, maintenance-adherence, and savings signals;
- cash buffer and risk preference;
- property-context applicability;
- state risk lists;
- homeowner scenario overrides.

It then:

- generates drivers;
- creates hard-coded mitigation and policy-lever recommendations;
- assigns fixed cost and savings ranges;
- removes contextually inapplicable actions;
- sums savings across recommendations;
- applies a 15% bundle multiplier;
- adds a cross-feature savings boost;
- persists the analysis and checklist.

The persistence and checklist are useful. The savings model must not be
presented as carrier-supported or independently additive.

### 6.6 Quote request

The quote request accepts:

- item;
- gap;
- exposure;
- preferred contact channel;
- email or phone;
- ZIP;
- notes.

It writes a `NEW` request. It does not currently:

- validate the recipient or fulfillment operator;
- disclose whether ContractToCozy is acting as a lead generator;
- identify licensed entities;
- explain compensation or ranking;
- collect affirmative communication and data-sharing consent;
- store consent text/version/time;
- enforce channel-specific consent;
- capture requested coverage;
- normalize coverage equivalence;
- ingest returned quotes;
- compare exclusions, limits, deductibles, forms, or premium;
- track contact attempts, quote receipt, selection, binding, or withdrawal;
- let the homeowner cancel or delete a pending request.

This workflow must remain disabled from general use until its commercial and
operational contract is approved.

### 6.7 Completion and analytics

Current completion behavior is inconsistent:

- Coverage Intelligence records guidance completion when analysis is generated.
- Coverage Options can record completion after review or automatically when no
  gaps exist.
- Insurance Trend records `workflow_completed` as soon as data loads.
- Risk Optimizer records a backend action-completed event when analysis is run,
  but the frontend does not record the canonical workflow outcome.
- Capability metadata declares `OUTPUT_GENERATED` for all four.

None of these reliably means that the homeowner made or completed a coverage
decision.

---

## 7. Homeowner Question Contract

| Question | Current answer | Gap | Target answer |
|---|---|---|---|
| What is this? | Four product names and technical subtitles | Homeowner must infer the job | “Review your current protection and prepare for renewal or a coverage decision.” |
| How will this benefit me? | Gaps, trends, premium pressure, possible savings | Several benefits are unsupported or abstract | “Find important questions before a loss or renewal, avoid accidental loss of protection, and keep the final decision documented.” |
| What should I do for full benefit? | Enter premium, deductible, cash buffer, risk tolerance; upload policy elsewhere | Repeats known data; does not rank missing facts by benefit | Show known facts, exact unknown material fields, why each matters, and one confirm/upload/correct action |
| What should I care about? | Verdicts, scores, synthetic trends, broad drivers | Primary conclusion is not grounded in controlling policy | Lead with verified changes, material unknowns, upcoming renewal, and the next safe action |
| What can I control? | Scenario fields, waivers, checklist state | No policy decision, quote consent, comparison, or outcome control | Correct facts, choose review questions, compare equivalent options, plan/skip mitigation, control sharing, record decision |
| Why should I trust this? | Trust strips and buried disclaimers | Primary claims contradict the evidence; no clause citations; no commercial disclosure | Fact-level provenance, effective date, source page, confidence, assumptions, professional boundary, commercial disclosure, correction path |

### 7.1 Recommended first-screen hierarchy

The default page should show:

1. **Purpose and benefit**
   - “Review your home protection before renewal or after a change.”
2. **Current status**
   - policy on file;
   - renewal date;
   - verification state;
   - last reviewed date.
3. **What deserves attention**
   - no more than three material verified questions;
   - exact reason;
   - timing;
   - evidence state.
4. **Primary next action**
   - confirm a fact;
   - upload a declarations page;
   - review a renewal change;
   - compare equivalent options;
   - prepare questions for a licensed professional.
5. **What is already known and missing**
   - progressive disclosure.
6. **Controls**
   - correct;
   - defer;
   - not relevant;
   - record decision;
   - data-sharing preferences.
7. **Evidence and methodology**
   - source pages;
   - assumptions;
   - limitations;
   - professional and commercial boundaries.

Do not lead with:

- a generated verdict;
- a synthetic trend chart;
- a scenario form;
- technical trust labels;
- a grid of counts;
- the mitigation checklist;
- a savings range.

---

## 8. Product-Framework Conformance

### 8.1 Current manifest assessment

| Capability | Current category | Stage | Safety | Completion | Mode |
|---|---|---|---|---|---|
| Coverage Intelligence | SAVE_OPTIMIZE | ACTIVE | REGULATED_COVERAGE | OUTPUT_GENERATED | Catalog only |
| Coverage Options | SAVE_OPTIMIZE | ACTIVE | REGULATED_COVERAGE | OUTPUT_GENERATED | Contextual |
| Insurance Trend | SAVE_OPTIMIZE | BETA | REGULATED_COVERAGE | OUTPUT_GENERATED | Contextual |
| Risk Optimizer | SAVE_OPTIMIZE | ACTIVE | REGULATED_COVERAGE | OUTPUT_GENERATED | Catalog only |

Problems:

- “save/optimize” overemphasizes premium reduction and understates protection;
- Insurance Trend and Coverage Options are contextually promoted despite
  incomplete outputs;
- the active label overstates Coverage Intelligence and Risk Optimizer
  readiness;
- generated output is not the meaningful completion;
- four manifests duplicate one family;
- Coverage Intelligence is catalog-canonical at a global route even though the
  real workspace is property-scoped;
- Coverage Options remains an independent discovery object after its route was
  retired into a tab.

### 8.2 Target framework contract

| Contract | Target |
|---|---|
| Capability ID | One canonical ID, recommended `coverage-review` |
| Homeowner-facing name | Coverage and Premium Review |
| Primary homeowner job | Decide With Confidence |
| Secondary job | Stay Ahead |
| Outcome category | DECIDE_COMPARE |
| Primary destination | Property-scoped coverage workspace under the home’s protection context |
| Recommendation mode | Contextual canonical; catalog discoverable |
| Safety tier | REGULATED_COVERAGE |
| Minimum readiness | Property plus a policy/renewal document or explicit scenario intent |
| Expected output | Verified review questions and a coverage decision plan |
| Completion kind | DECISION_RECORDED or ACTION_INITIATED |
| Completion signal | Durable coverage decision or governed handoff |
| Home Record reads | Policy, documents, inventory, claims, projects, risk, maintenance, responsibility, preferences |
| Home Record writes | Confirmed policy facts, review, decision, mitigation plan, evidence, resulting policy, outcome |
| Accepted context | Home Action, policy, document, renewal, claim, inventory item, Radar event, journey |
| Release stage | BETA until trust, source, action, and acceptance gates pass |

### 8.3 Trigger families

Reviewed contextual triggers should include:

- policy renewal within a configured window;
- material confirmed premium or deductible change;
- policy expiration or non-renewal notice;
- newly confirmed material coverage question;
- new high-value asset or renovation affecting declared values;
- claim or event that creates a specific review question;
- completed mitigation ready for carrier review;
- quote received for equivalent-coverage comparison;
- active incomplete coverage decision.

Do not use:

- no analysis exists;
- low record completeness;
- arbitrary quarterly refresh;
- state alone;
- an estimated premium above a synthetic average;
- generic savings opportunity.

### 8.4 Home placement

The family should not have a permanent standalone card above ranked actions.

Correct placement:

- a canonical Home Action for a material, timely coverage issue;
- an active journey in Plan & Projects for a renewal or mitigation plan;
- a contextual tool suggestion when eligibility and readiness are met;
- Explore Tools for general discovery;
- quiet policy status in the property protection summary;
- Home Timeline for recorded renewal, decision, or mitigation outcomes.

### 8.5 Home Action governance defect

Coverage Home Actions currently mark the jurisdiction check `VERIFIED` using the
property state and the analysis date, with “Coverage analysis property
jurisdiction” as the source. Knowing the state is not a jurisdictional review of
insurance rules, policy requirements, licensing, or recommendation content.

Target behavior:

- `NOT_REQUIRED` for purely factual record display;
- `UNKNOWN` when a jurisdiction-dependent claim has not been reviewed;
- `VERIFIED` only with a named reviewed rule source, jurisdiction, effective
  date, and review version.

---

## 9. Trust, Safety, Data, and Commercial Review

### 9.1 Trust classification

Every prominent statement should be classified as one of:

| Class | Example | Required presentation |
|---|---|---|
| Confirmed policy fact | Annual premium on confirmed declarations page | Source document, page, effective date, confirmed by |
| Extracted fact | OCR-detected deductible | Extraction confidence and confirm/correct action |
| Home Record fact | Roof age entered by homeowner | Source, date, correction action |
| Derived observation | Inventory total exceeds confirmed Coverage C limit | Inputs, rule, known exclusions from the comparison |
| Reviewed public benchmark | State filing trend | Named source, period, geography, limitations |
| Scenario assumption | Higher deductible entered for comparison | Clearly marked editable assumption |
| Professional question | “Ask whether water backup is included” | Not a determination; licensed-professional boundary |
| Unknown | Ordinance-or-law coverage not parsed | Explicitly unknown; never inferred as absent |

### 9.2 Fail-closed rules

The family must not:

- say a loss is covered without controlling policy evidence;
- say a loss is excluded without controlling policy evidence;
- treat missing records as absence of coverage;
- recommend reducing limits solely to lower premium;
- recommend raising a deductible without showing household loss-bearing
  exposure and an explicit scenario choice;
- rank partner quotes by compensation;
- claim savings before a qualified quote or observed result;
- infer historical premium payments;
- infer rate increases as personal history;
- call a policy comparison equivalent when material fields are unknown;
- claim mitigation caused a premium change;
- mark regulated completion because a page was viewed.

### 9.3 Policy-language model

The target should capture, when relevant and available:

- policy form and policy type;
- term start and end;
- carrier and named insured;
- insured property;
- dwelling and other-structures limits;
- personal-property limit;
- loss-of-use/additional-living-expense limit;
- personal liability and medical payments;
- deductible type and amount by peril;
- replacement-cost or actual-cash-value basis;
- scheduled property and category sublimits;
- major endorsements;
- flood, earthquake, wind, water backup, equipment breakdown, ordinance or law,
  service line, and other separately relevant protections;
- exclusions and conditions only when extracted from controlling evidence;
- source document, page, extraction method, confirmation state, and confidence.

The product should not attempt to model every policy form initially. The first
slice should support a reviewed field set and show unknown for unsupported
language.

### 9.4 AI boundary

AI may:

- classify documents;
- extract candidate policy facts;
- cite likely source pages;
- translate confirmed terms into plain language;
- draft questions for a carrier or licensed professional;
- summarize scenario tradeoffs from deterministic outputs.

AI must not:

- decide coverage for a claim;
- invent missing policy language;
- assign a probability that a claim will be paid;
- recommend a specific policy or carrier without governed comparison;
- generate unsupported savings;
- silently create verified policy records;
- replace deterministic expiry, arithmetic, equivalence, or consent checks.

Document intelligence currently auto-creates a policy when carrier and policy
number are found and fills absent premium or dates with zero/current/default
values. Target behavior must stage extracted records for confirmation and
preserve unknowns rather than creating plausible defaults.

### 9.5 Commercial integrity

Before any quote or partner action is enabled, the interface must state:

- what action ContractToCozy performs;
- who receives the homeowner’s information;
- whether the recipient is licensed for the relevant jurisdiction;
- whether ContractToCozy or another party may receive compensation;
- whether all available market options are represented;
- how options are ranked;
- what data will be shared;
- which contact channels are authorized;
- how consent can be withdrawn;
- that no coverage is bound or changed until expressly confirmed.

Commercial availability or compensation must not increase the underlying
coverage recommendation score.

### 9.6 Privacy and security

Policy numbers, contact information, documents, household financial posture,
claims, and policy details require:

- property authorization;
- least-privilege field access;
- sensitive-value redaction from URLs, logs, analytics, and errors;
- explicit data-sharing scope;
- retention and deletion controls;
- audited confirmation and correction;
- controlled document download;
- partner payload minimization;
- no raw policy text in analytics.

### 9.7 Professional boundary

Prominent coverage guidance should say, in plain language:

> This review helps you organize policy facts and questions. Your policy
> language and applicable law control. Confirm material coverage or policy
> changes with your carrier or a licensed insurance professional.

The boundary must appear near consequential decisions, not only in a collapsed
methodology panel.

---

## 10. Functional Gap Register

| ID | Gap | Homeowner impact | Severity | Recommended change |
|---|---|---|---|---|
| COV-001 | Four tools split one coverage decision | Confusion and abandonment | Critical | Consolidate into one workspace and capability contract |
| COV-002 | Property insurance verdict uses broad heuristic | False confidence about protection value | Critical | Remove `WORTH_IT/NOT_WORTH_IT` insurance verdict |
| COV-003 | Item-policy linkage is treated as coverage | False covered/uncovered claims | Critical | Replace with evidence-qualified protection questions |
| COV-004 | Missing Home Record can imply no policy | Unnecessary alarm | Critical | Use unknown/missing-record state consistently |
| COV-005 | Add-ons inferred from state lists | Generic regulated advice appears specific | High | Convert to reviewed questions with source and jurisdiction |
| COV-006 | Untyped `coverageJson` | Cannot validate or compare policy facts | High | Create typed policy-term and fact records |
| COV-007 | OCR extracts few fields without field confidence | Weak policy understanding | High | Add field provenance, confidence, page citation, confirmation |
| COV-008 | Document intelligence supplies default dates/premium | Invented facts can become policy record | Critical | Preserve unknowns; require confirmation before activation |
| COV-009 | Insurance Trend generates synthetic history | Fabricated personal history | Critical | Remove history unless actual term records exist |
| COV-010 | “Local average” is hard-coded state heuristic | Misleading comparison | Critical | Hide until reviewed sourced benchmark is integrated |
| COV-011 | 10–15% savings claim is hard-coded UI copy | Unsupported financial inducement | Critical | Remove immediately |
| COV-012 | Quote CTAs point to `#` | Dead-end primary action | Critical | Remove or route to a governed workflow |
| COV-013 | Risk savings ranges are fixed and additive | Overstated savings and unsafe prioritization | Critical | Replace with eligibility questions or sourced carrier rules |
| COV-014 | Bundle assumption applies 15% to all actions | Misleading scenario | High | Remove until a qualified quote or rule supports it |
| COV-015 | Cross-feature savings boosts insurance savings | No causal or domain basis | High | Remove from premium calculation |
| COV-016 | Mitigation outcome comparison implies attribution | Homeowner may assume work caused change | High | Label as observed change with confounders |
| COV-017 | Coverage Options does not compare options | Capability promise is not delivered | Critical | Build normalized equivalent-coverage comparison |
| COV-018 | Warranty and insurance are blended | Different risks and contracts are confused | High | Separate protection mechanisms and jobs |
| COV-019 | Quote request is unfulfilled lead capture | No homeowner outcome after sharing data | Critical | Disable until fulfillment and consent are complete |
| COV-020 | Quote form lacks consent/disclosures | Privacy and commercial risk | Critical | Versioned affirmative consent and disclosure |
| COV-021 | Quote data lacks coverage equivalence | Cheapest option may reduce protection | Critical | Require material comparison fields and unknown handling |
| COV-022 | No durable coverage decision | Insight does not become a Home Record outcome | Critical | Add decision, rationale, effective date, and result |
| COV-023 | Generated analysis counts as completion | Metrics overstate value | High | Complete only on decision/action milestone |
| COV-024 | Insurance Trend data load counts as workflow completed | Page rendering is treated as outcome | High | Record output separately; require meaningful completion |
| COV-025 | Coverage Options review can complete guidance | Review does not resolve gap | High | Use decision or corrected-record proof |
| COV-026 | Risk Optimizer lacks canonical lifecycle telemetry | Cannot measure value | Medium | Use shared discovery lifecycle and domain completion |
| COV-027 | Policy changes are not first-class history | Cannot explain real premium movement | High | Add policy terms, renewal comparisons, and change events |
| COV-028 | No renewal-notice workflow | Misses primary revisit trigger | High | Ingest, compare, explain, decide, and track |
| COV-029 | No policy equivalence guard | Savings can hide loss of protection | Critical | Block recommendation when material fields differ/unknown |
| COV-030 | No licensed-professional handoff record | Advice cannot be safely completed | High | Add governed handoff and response tracking |
| COV-031 | Jurisdiction marked verified from state alone | False governance evidence | Critical | Require reviewed jurisdiction source or unknown |
| COV-032 | AI strategic advice lacks fact-level citation | Generated copy can overstate the analysis | High | Ground only in qualified findings or remove |
| COV-033 | Global routes remain canonical in inventory | Product context and route identity conflict | Medium | Make property workspace canonical; retain resolver aliases |
| COV-034 | Four catalog cards remain discoverable | Portfolio clutter and duplicate starts | Medium | One catalog entry and stage-specific contextual links |
| COV-035 | Missing data is not benefit-ranked | Setup burden before value | Medium | Show only material missing facts and why they matter |
| COV-036 | No explicit unsupported-policy state | Unknown forms may look analyzed | Critical | Add supported/partial/unsupported scope |
| COV-037 | No source-health model for benchmarks/partners | Silent stale or unavailable data | High | Add source coverage, freshness, outage, and admin controls |
| COV-038 | Sparse domain tests | Regressions can alter regulated outputs | Critical | Golden fixtures, authorization, trust, and UI acceptance |
| COV-039 | Evidence links exist in API but not full UI | Completed mitigation cannot be substantiated | Medium | Upload/link/remove evidence in the plan |
| COV-040 | No decision feedback or correction outcome | Future recommendations do not improve | Medium | Record not relevant, incorrect fact, decision, and outcome |

---

## 11. Best-in-Class Target Experience

### 11.1 Stage 1 — Current protection

Show:

- carrier and policy type;
- effective and renewal dates;
- premium and material deductible facts;
- verification status;
- source document;
- what was confirmed versus extracted;
- unsupported or missing areas.

Primary actions:

- review extracted facts;
- add or link a policy;
- upload declarations or renewal notice;
- correct a fact.

Partial value:

- with no policy, explain what information would enable a review;
- with only dates and premium, provide renewal readiness without coverage claims;
- with partial declarations, show confirmed facts and unknowns separately.

### 11.2 Stage 2 — Questions to review

Rank no more than three questions by:

- potential loss significance;
- evidence quality;
- timing;
- relevance to confirmed home facts;
- homeowner responsibility;
- ability to act safely.

Examples:

- “Your confirmed personal-property limit is below your confirmed inventory
  value. Check sublimits and valuation basis before deciding whether the limit
  is sufficient.”
- “The renewal notice increases the all-peril deductible from X to Y.”
- “We could not confirm whether water backup is included. Your Home Record has
  a prior water claim; ask this question before renewal.”

Do not say:

- “you are covered”;
- “you need this endorsement”;
- “this claim will not be covered”;
- “this policy is not worth it.”

### 11.3 Stage 3 — Renewal and premium changes

Use actual policy-term or renewal records to show:

- old and new premium;
- absolute and percentage change;
- old and new deductible;
- changed limits and endorsements;
- carrier or policy-form change;
- effective date;
- confirmed versus unknown change;
- source pages.

If only one term exists:

- show the current premium;
- do not render history;
- invite the homeowner to add the prior term if comparison is useful.

Public market context may be added only when:

- the source is named and licensed/permitted;
- geography and coverage basis are relevant;
- observation period is disclosed;
- it is not described as a quote;
- it does not imply overpayment without equivalent coverage.

### 11.4 Stage 4 — Compare choices

Supported choices:

- keep current policy;
- modify current policy;
- request clarification;
- compare qualified quotes;
- defer until missing evidence is obtained;
- seek licensed help.

Material comparison dimensions:

- premium;
- deductible by peril;
- dwelling and personal-property limits;
- valuation basis;
- liability;
- loss of use;
- material sublimits;
- endorsements;
- exclusions or unknowns;
- carrier and policy term;
- fees;
- effective date.

The product should:

- require comparable fields;
- visibly mark non-equivalent options;
- refuse a “cheapest” recommendation when material protection is unknown;
- explain cost versus retained exposure;
- let the homeowner select and record a reason;
- preserve the compared artifacts.

### 11.5 Stage 5 — Reduce loss risk

Show mitigation as:

- a loss-prevention action;
- evidence the homeowner can preserve;
- a question to ask the carrier;
- a possible eligibility path, not promised savings.

Each action should include:

- relevant peril;
- why it applies;
- evidence used;
- estimated implementation cost with source;
- safety/professional requirements;
- whether a carrier rule is known;
- discount eligibility source, if any;
- verification required;
- next action;
- plan status.

Where no carrier-qualified discount exists, say:

> This may reduce loss risk. Ask your carrier whether it changes eligibility or
> premium before treating it as a savings action.

### 11.6 Stage 6 — Decision and outcome

Supported decisions:

- keep current policy;
- request policy change;
- request quotes;
- choose an option;
- seek professional review;
- plan mitigation;
- take no action;
- not relevant.

Record:

- decision;
- reason;
- facts and comparison version;
- selected option;
- acknowledged unknowns;
- actor and time;
- expected next milestone;
- final policy or action evidence;
- observed premium or protection change;
- realized savings only when confirmed.

### 11.7 Revisit value

The homeowner should revisit because:

- renewal is approaching;
- a real policy term changed;
- a new document resolved an unknown;
- the home changed materially;
- a claim or hazard created a new question;
- a mitigation action was completed;
- a quote or carrier response arrived;
- the decision needs completion.

The product should be quiet otherwise.

---

## 12. Target Data and Domain Model

### 12.1 Design principles

- Keep `InsurancePolicy` as the policy identity.
- Model each policy term separately.
- Store material policy facts in typed records, not only untyped JSON.
- Preserve document, page, extraction, confirmation, and effective-date
  provenance.
- Separate policy facts from derived questions and scenario assumptions.
- Keep warranty decisions outside the property-policy verdict.
- Use one coverage review and decision lifecycle.
- Treat benchmark and carrier rules as versioned sources.
- Do not retain legacy generated histories.

### 12.2 Recommended entities

#### `InsurancePolicyTerm`

- `id`
- `insurancePolicyId`
- `propertyId`
- `termStart`
- `termEnd`
- `annualPremium`
- `status`
- `sourceDocumentId`
- `verificationStatus`
- `verifiedAt`
- `createdAt`
- `updatedAt`

#### `InsurancePolicyFact`

- `id`
- `policyTermId`
- `factKey`
- typed amount, text, boolean, or JSON value
- `currency`
- `sourceDocumentId`
- `sourcePage`
- `sourceExcerptHash`
- `extractionMethod`
- `confidence`
- `confirmationStatus`
- `confirmedByUserId`
- `confirmedAt`
- `effectiveFrom`
- `effectiveTo`

#### `CoverageReview`

- `id`
- `propertyId`
- `policyTermId`
- `triggerType`
- `triggerEntityType`
- `triggerEntityId`
- `status`
- `scopeStatus`
- `reviewVersion`
- `generatedAt`
- `expiresAt`

#### `CoverageReviewQuestion`

- `id`
- `coverageReviewId`
- `questionKey`
- `category`
- `priority`
- `status`
- `plainLanguageQuestion`
- `whyItMatters`
- `evidenceJson`
- `missingEvidenceJson`
- `jurisdictionReviewJson`
- `professionalBoundary`
- `resolvedAt`

#### `CoverageComparison`

- `id`
- `propertyId`
- `coverageReviewId`
- `status`
- `equivalenceStatus`
- `materialUnknownsJson`
- `createdByUserId`
- `createdAt`
- `decidedAt`

#### `CoverageComparisonOption`

- `id`
- `coverageComparisonId`
- `policyTermId`
- `quoteDocumentId`
- normalized premium and material facts
- `commercialSourceJson`
- `equivalenceFindingsJson`
- `tradeoffsJson`

#### `CoverageDecision`

- `id`
- `propertyId`
- `coverageReviewId`
- `coverageComparisonId`
- `decisionType`
- `selectedOptionId`
- `reasonCode`
- `reasonText`
- `acknowledgedUnknownsJson`
- `status`
- `decidedByUserId`
- `decidedAt`
- `completedAt`
- `resultingPolicyTermId`
- `outcomeJson`

#### `InsuranceMarketBenchmark`

- geography;
- coverage basis;
- observed period;
- source;
- source version;
- rights;
- published and retrieved dates;
- confidence;
- value and unit;
- active/reviewed status.

#### `InsuranceMitigationRule`

- jurisdiction;
- carrier or program scope;
- peril;
- action;
- eligibility;
- evidence requirement;
- possible benefit type;
- source;
- effective dates;
- reviewed status.

#### `InsuranceContactConsent`

- request;
- recipient;
- shared fields;
- contact channels;
- disclosure version;
- consent text hash;
- accepted time;
- withdrawn time.

### 12.3 Existing models to retire or reshape

- Replace broad property-level `CoverageAnalysis` verdicts with `CoverageReview`
  and questions.
- Keep item warranty analysis only in the item coverage/repair decision
  workflow.
- Retire generated `InsuranceCostTrendDTO.history` as personal history.
- Reshape `CoverageScenario` into comparison or reviewed policy scenarios.
- Keep `RiskMitigationPlanItem`, but attach it to the canonical review/decision
  and remove unsupported savings fields unless sourced.
- Reshape `InsuranceQuoteRequest` into a governed request, consent, fulfillment,
  quote, comparison, and decision workflow.

### 12.4 No migration requirement

Because there are no real users:

- update the Prisma schema directly;
- remove obsolete tables or fields if the implementation no longer needs them;
- regenerate Prisma client;
- update seeds and fixtures to the target model;
- do not create migration files;
- do not backfill old analysis rows;
- do not maintain old DTOs solely for stored data.

---

## 13. API and Service Design

### 13.1 Canonical read

`GET /api/properties/:propertyId/coverage-review`

Returns:

- readiness;
- current policy term;
- verification summary;
- renewal timing;
- material questions;
- comparison status;
- mitigation summary;
- decision status;
- trust contract;
- accepted launch context;
- available safe actions.

### 13.2 Document and policy confirmation

- create or link source document;
- extract candidate facts;
- return field-level provenance;
- confirm/correct/reject fields atomically;
- activate a policy term only when minimum identity and dates are confirmed;
- never replace unknowns with defaults.

### 13.3 Review generation

`POST /api/properties/:propertyId/coverage-reviews`

Requirements:

- idempotency key;
- reviewed rule version;
- bounded input snapshot;
- supported/partial/unsupported scope;
- deterministic material-question generation;
- AI summary only after deterministic findings;
- no policy verdict.

### 13.4 Renewal comparison

`GET /api/properties/:propertyId/coverage-reviews/:reviewId/renewal-change`

Returns only observed or confirmed changes. Missing prior term returns:

- `historyAvailable: false`;
- current facts;
- an optional add-prior-policy action.

### 13.5 Option comparison

- create comparison;
- attach current policy or quote document;
- extract and confirm option facts;
- evaluate material equivalence;
- show tradeoffs;
- record decision.

The service must not choose solely by premium.

### 13.6 Mitigation planning

- add recommended plan item from a reviewed rule or pure loss-prevention rule;
- plan, skip, complete, restore;
- link cost evidence;
- link completion evidence;
- request carrier review;
- record carrier response;
- record observed premium change without causal attribution.

### 13.7 Quote and professional handoff

The handoff must:

- check partner and jurisdiction eligibility;
- show disclosure;
- collect versioned consent;
- minimize shared data;
- create an auditable request;
- expose status;
- accept returned quotes/documents;
- support withdrawal;
- avoid representing request submission as quote receipt or binding.

### 13.8 Errors and state model

Distinct states:

- no policy record;
- policy identity only;
- extraction awaiting confirmation;
- partial supported review;
- unsupported policy form;
- review ready;
- review stale;
- source unavailable;
- benchmark unavailable;
- partner unavailable;
- comparison incomplete;
- decision pending;
- action in progress;
- completed;
- error.

No error, absence, unsupported source, or unknown policy fact may become a
successful zero or “all clear.”

---

## 14. UX and Content Requirements

### 14.1 Plain-language naming

Recommended:

- Coverage and Premium Review
- Current protection
- Questions to review
- Renewal changes
- Compare choices
- Reduce loss risk
- Your decision

Avoid as primary labels:

- Coverage Intelligence
- Risk-to-Premium Optimizer
- premium pressure
- deterministic
- coverage graph
- source family
- input snapshot
- mitigation verification
- verdict

Technical terms can appear in methodology or developer/admin surfaces.

### 14.2 Readiness copy examples

No policy:

> Add your current declarations page to see renewal dates, key limits, and
> questions worth reviewing. Until then, we will not guess whether you are
> covered.

Partial extraction:

> We found your carrier, premium, and renewal date. Confirm three highlighted
> fields before we compare protection choices.

Unsupported form:

> We saved this policy, but we cannot reliably interpret this form yet. You can
> still track renewal and prepare questions for your carrier.

No prior term:

> Your current premium is on file. Add last year’s declarations page if you
> want to see the actual renewal change.

### 14.3 Finding copy

Use:

> Your renewal notice shows a higher wind deductible than the current term.
> Confirm the source pages, then decide whether to ask for alternatives before
> the renewal date.

Avoid:

> Wind risk is driving premium pressure. You can save $120–$360.

### 14.4 Healthy state

Do not say “fully covered.”

Use:

> No material review questions were found in the confirmed fields we support.
> Some policy language remains outside this review. Recheck at renewal or after
> a major home change.

### 14.5 Scenario controls

Controls should use homeowner language:

- annual premium;
- deductible;
- emergency funds available for a loss;
- keep protection the same;
- show what changes;
- include/exclude an option.

Do not ask for abstract risk tolerance if a concrete retained-loss scenario can
communicate the tradeoff.

### 14.6 Accessibility

Required:

- semantic headings and regions;
- accessible tab/stage navigation;
- keyboard-complete comparison and plan controls;
- no color-only severity or equivalence indication;
- table alternatives for charts;
- source citations accessible from findings;
- focus management for dialogs and redirects;
- errors associated with fields;
- live regions for extraction and save status;
- 44px interactive targets;
- reduced-motion support;
- responsive comparison that does not require horizontal scrolling for the
  primary conclusion.

### 14.7 Performance

- Render saved policy status before optional analysis.
- Do not block current-protection facts on AI.
- Load source pages and detailed methodology on demand.
- Cache reviewed benchmark data by source/version/geography.
- bound document extraction time and provide resumable status;
- avoid generating a new analysis on every page view.

---

## 15. Portfolio Score and Disposition

### 15.1 Current scorecard

| Dimension | Weight | Coverage Intelligence | Coverage Options | Insurance Trend | Risk Optimizer | Family assessment |
|---|---:|---:|---:|---:|---:|---:|
| Homeowner value and differentiation | 20 | 12 | 6 | 5 | 11 | 11 |
| Functional completeness | 20 | 10 | 5 | 4 | 9 | 9 |
| Actionability and closed-loop completion | 15 | 6 | 5 | 1 | 8 | 6 |
| Data quality, freshness, and trust | 15 | 5 | 4 | 2 | 4 | 4 |
| UX clarity and readiness | 15 | 6 | 6 | 5 | 5 | 6 |
| Product-framework integration | 10 | 5 | 7 | 4 | 5 | 5 |
| Accessibility, performance, reliability | 5 | 2 | 2 | 2 | 2 | 2 |
| **Total** | **100** | **46** | **35** | **23** | **44** | **43** |

Safety and unsupported-claim failures override the numerical score.

### 15.2 Disposition

**Family:** Consolidate and rebuild.

**Coverage Intelligence:** Merge the useful data and scenario foundation into
the canonical workspace; remove broad policy verdicts.

**Coverage Options:** Retire as an independent capability. Rebuild as a real
comparison stage.

**Insurance Trend:** Hide or replace the current generated output immediately.
Restore only with actual policy history and qualified public context.

**Risk Optimizer:** Merge the plan lifecycle into the canonical workspace.
Remove unsourced savings and preserve loss-prevention planning.

### 15.3 Why not retire the family

The homeowner job is high-value and strategically aligned:

- policy and renewal documents deepen the Living Home Record;
- coverage decisions are recurring and consequential;
- property context can meaningfully reduce review effort;
- loss-prevention work can link home maintenance with protection;
- decisions and outcomes create longitudinal value.

The current product contract, not the underlying job, is the problem.

---

## 16. Recommended Implementation Sequence

### Slice 0 — Immediate truth and safety containment

**Outcome:** No homeowner sees fabricated history, dead actions, or unsupported
savings.

Changes:

- remove the 10–15% savings UI;
- remove “you may be overpaying,” “total paid,” and “extra paid” when values are
  modeled;
- remove or disable all `href="#"` quote actions;
- prevent synthetic trend data from being labeled as personal history;
- remove fixed Risk Optimizer savings totals from primary UI;
- replace insurance `WORTH_IT/NOT_WORTH_IT` presentation with neutral review
  states;
- change “covered/no gaps” copy to qualified record-state copy;
- disable quote lead capture from general use;
- correct Home Action jurisdiction status;
- downgrade all four manifests to BETA or disable contextual promotion until
  the relevant stage passes gates.

Acceptance:

- no unsupported savings percentage or range is visible;
- no dead primary CTA remains;
- no synthetic series is called personal history;
- no missing record is shown as proof of no coverage;
- regulated advice boundary appears near consequential output;
- focused content regression tests pass.

### Slice 1 — Canonical capability and workspace

**Outcome:** The homeowner encounters one coherent coverage journey.

Changes:

- create one canonical capability definition;
- change the homeowner-facing name;
- merge stage navigation;
- redirect Coverage Options, Insurance Trend, and Risk Optimizer routes to real
  stages;
- update catalog, Home Action, Guidance, Radar, sidebar, and related-tool links;
- remove duplicate discovery entries;
- consume shared launch context;
- preserve exact return path and source action.

Acceptance:

- one catalog entry exists;
- every legacy internal link resolves to the correct stage;
- contextual item, policy, renewal, claim, and Radar context is preserved;
- no stage repeats known property setup;
- route and capability inventory tests pass.

### Slice 2 — Canonical policy term and fact provenance

**Outcome:** The homeowner can see and confirm what the policy record actually
knows.

Changes:

- update Prisma schema directly;
- add policy terms and typed facts;
- add source document/page, extraction confidence, confirmation, and effective
  dates;
- stage extracted facts for confirmation;
- remove invented default premium/dates;
- support explicit unknown;
- show current protection and readiness;
- add authorization and audit events.

Acceptance:

- extraction never creates a verified fact automatically;
- unknown values remain unknown;
- field source/page and confirmation state are visible;
- correction updates the canonical policy record;
- one policy can have multiple actual terms;
- property authorization and sensitive-log tests pass.

### Slice 3 — Minimum credible coverage review

**Outcome:** The homeowner receives a short, evidence-qualified review rather
than a policy verdict.

Changes:

- create Coverage Review and Review Question models;
- define a small reviewed rule set;
- support supported/partial/unsupported scope;
- generate deterministic questions;
- link every question to evidence and missing evidence;
- remove broad state add-on rules;
- add neutral healthy and unsupported states;
- promote only material, timely verified findings to Home Actions.

Acceptance:

- every question cites confirmed facts or is explicitly a general question;
- unsupported policy language cannot produce a determination;
- no more than three primary questions are shown;
- healthy state is scoped to supported fields;
- stale review updates after policy/home changes;
- golden fixtures cover positive, negative, unknown, partial, and unsupported
  cases.

### Slice 4 — Actual renewal and premium history

**Outcome:** The homeowner understands real changes between policy terms.

Changes:

- compare confirmed policy terms;
- show premium, deductible, limit, endorsement, and form changes;
- store change events;
- add renewal timeline and reminders;
- show one-term state without a chart;
- remove the heuristic Insurance Trend service from homeowner output;
- optionally retain a clearly labeled planning calculator outside personal
  history.

Acceptance:

- history contains only observed/confirmed terms;
- every change links to source evidence;
- missing prior term produces a truthful partial state;
- actual and estimated values cannot share the same series styling or label;
- renewal action is timing-aware.

### Slice 5 — Coverage-equivalent comparison and decision

**Outcome:** The homeowner can compare choices without hiding a protection
tradeoff.

Changes:

- create comparison and option models;
- ingest current policy and quote documents;
- normalize material fields;
- calculate equivalence status;
- block cheapest/recommended ranking when material facts are unknown;
- show tradeoffs;
- record keep/change/shop/defer/professional-review decision;
- write the decision to the Home Record and timeline.

Acceptance:

- non-equivalent options are unmistakable;
- premium is never the only ranking input;
- unknown material facts block a “best” recommendation;
- homeowner can record a decision and rationale;
- completion uses the durable decision, not output view;
- source action and journey advance from the decision event.

### Slice 6 — Loss-prevention plan without savings promises

**Outcome:** The homeowner can plan relevant work and preserve evidence.

Changes:

- attach mitigation plan to canonical review;
- remove unsourced premium savings fields;
- distinguish loss reduction from discount eligibility;
- add evidence upload/link UI;
- add provider/DIY/safety handoffs where appropriate;
- support planned, completed, skipped, restored;
- show carrier-review question;
- record observed premium changes without causality.

Acceptance:

- each plan item states whether a carrier benefit is known or unknown;
- evidence can be added and removed;
- safety-critical work routes to qualified professional help;
- completing work does not claim a premium reduction;
- later premium change is labeled observational.

### Slice 7 — Governed quote or licensed-help handoff

**Outcome:** The homeowner can safely request help and track what happened.

Dependencies:

- approved partner and operating model;
- licensing/compliance review;
- commercial disclosure;
- privacy and consent review;
- fulfillment SLA;
- quote ingestion contract.

Changes:

- versioned disclosures and consent;
- eligible recipient resolution;
- minimal payload;
- request status and withdrawal;
- returned quote ingestion;
- equivalent-coverage comparison;
- contact and fulfillment audit;
- outcome tracking.

Acceptance:

- homeowner knows recipient, purpose, compensation, market scope, and shared
  data before consent;
- channel consent is explicit;
- unsupported jurisdiction fails closed;
- submitting a request is not called receiving a quote;
- returned quotes flow into comparison;
- no commercial factor affects protection ranking.

### Slice 8 — Contextual actions, lifecycle, and measurement

**Outcome:** Coverage review appears only when it can help and becomes quiet
after resolution.

Changes:

- reviewed trigger rules;
- deduplicated canonical Home Actions;
- stage-specific launch context;
- active decision journey;
- resolution, expiry, reopen, and suppression logic;
- lifecycle analytics;
- admin source and partner health;
- rollout controls and kill switches.

Acceptance:

- no permanent Home card;
- no duplicate action and tool suggestion;
- completed decisions resolve the action;
- policy/home changes can safely reopen a review;
- disabled benchmark/partner does not become a zero or healthy state;
- analytics connect eligibility to verified outcome.

### Slice 9 — Qualified market context

**Outcome:** The homeowner can understand broader premium conditions without
mistaking them for a quote.

Dependencies:

- approved source rights;
- geographic and policy-basis mapping;
- source operations;
- domain review.

Changes:

- versioned benchmark ingestion;
- source coverage and freshness;
- observed market-period comparisons;
- clear comparability limitations;
- benchmark outage and unsupported geography states.

Acceptance:

- every benchmark names source, geography, period, coverage basis, and
  retrieved date;
- market context cannot declare personal overpayment;
- stale/unavailable sources are visible;
- source failures do not affect current policy facts.

### Slice 10 — Validation and launch gate

**Outcome:** The consolidated family is safe to activate.

Changes:

- end-to-end acceptance;
- mobile and desktop visual QA;
- accessibility audit;
- domain and legal/compliance review;
- commercial review where applicable;
- security/privacy review;
- source runbooks;
- load and failure tests;
- capability inventory regeneration;
- documentation reconciliation.

Acceptance:

- all launch gates in this document pass;
- no critical/high gap remains without an approved containment;
- one canonical completion funnel exists;
- rollback and kill switches are tested;
- release-stage promotion is explicitly approved.

---

## 17. Acceptance Matrix

| State | Expected homeowner experience | Must not happen |
|---|---|---|
| No policy | Explain benefit and offer add/link/upload | Say uninsured |
| Policy identity only | Track dates and show exact missing fields | Generate coverage verdict |
| Extraction pending | Show progress and resumable return | Blank page or duplicate upload |
| Extraction ready | Confirm/correct fact candidates | Auto-verify |
| Unsupported form | Preserve record and prepare questions | Infer absent coverage |
| One confirmed term | Show current facts and renewal date | Generate historical chart |
| Two confirmed terms | Show actual change with citations | Blend estimates into history |
| Material unknown | Explain why it blocks comparison | Recommend cheapest option |
| No material supported findings | Scoped healthy state | Say fully covered |
| Renewal change | Lead with change, timing, options | Claim overpayment |
| Non-equivalent quote | Show differences and block best ranking | Rank by premium only |
| Mitigation suggested | Explain loss benefit and eligibility uncertainty | Promise savings |
| Mitigation completed | Record evidence and carrier-review step | Claim causal premium reduction |
| Partner unavailable | Preserve self-service review | Silent empty result |
| Source stale | Label stale and isolate affected output | Reassure or use as current |
| Decision recorded | Update action, timeline, and journey | Leave duplicate open actions |
| Error | Bounded retry and unaffected saved facts | Convert to no gaps |

---

## 18. Test Strategy

### 18.1 Unit tests

- policy-term date and active-state rules;
- fact confirmation and provenance;
- supported/partial/unsupported scope;
- every review question rule;
- unknown versus absent behavior;
- renewal diff arithmetic;
- equivalence evaluation;
- material-unknown blocking;
- mitigation applicability;
- source freshness;
- jurisdiction review state;
- consent eligibility;
- outcome observation language;
- completion state machine.

### 18.2 Golden domain fixtures

At minimum:

- complete supported homeowners policy term;
- incomplete declarations;
- unsupported policy form;
- extracted but unconfirmed deductible;
- one policy term only;
- real premium increase with deductible increase;
- premium increase with improved protection;
- lower quote with materially lower protection;
- two equivalent quotes;
- inventory value above a confirmed relevant limit;
- unknown valuation basis;
- flood/wind/specialty policy separation;
- landlord versus owner responsibility;
- completed mitigation with no premium change;
- completed mitigation with premium change and multiple confounders.

Expected outputs must be reviewed by product, domain, and trust owners.

### 18.3 API tests

- authentication and property authorization;
- role-specific read/write behavior;
- validation and idempotency;
- extraction confirmation transactionality;
- sensitive-field redaction;
- stale version conflict;
- decision state transition;
- evidence ownership;
- consent creation and withdrawal;
- partner/source unavailable;
- disabled capability and rollout.

### 18.4 UI tests

- homeowner question contract;
- no policy;
- partial policy;
- unsupported form;
- confirmed current protection;
- renewal changes;
- equivalent and non-equivalent comparison;
- mitigation planning;
- decision completion;
- errors and retries;
- deep-link context;
- source action return;
- mobile layout;
- keyboard and screen-reader semantics.

### 18.5 Regression assertions

- no `href="#"` action;
- no “10–15%” hard-coded savings;
- no synthetic “Your premium” history;
- no “total paid” from modeled series;
- no “fully covered” from record linkage;
- no `WORTH_IT/NOT_WORTH_IT` property-insurance verdict;
- no fixed additive premium savings;
- no auto-verified extraction;
- no state-only `VERIFIED` jurisdiction check;
- no page-load completion.

### 18.6 Operational tests

- document processor timeout and retry;
- source outage;
- stale benchmark;
- partner disablement;
- duplicate request prevention;
- quote fulfillment timeout;
- kill-switch behavior;
- analytics redaction;
- source and consent audit retrieval.

---

## 19. Measurement

### 19.1 Primary funnel

```text
Eligible → Shown → Opened → Policy facts ready → Review produced
→ Question resolved → Choice compared → Decision recorded
→ Action completed → Outcome observed
```

### 19.2 Value metrics

- percent of reviews with at least one confirmed material fact;
- time from upload to confirmed policy view;
- material question resolution rate;
- renewal review completed before effective date;
- equivalent-coverage comparisons completed;
- decisions recorded;
- selected-policy record attached;
- mitigation actions completed with evidence;
- observed premium or protection outcome recorded;
- repeated setup avoided through Home Record reuse.

### 19.3 Trust metrics

- extraction correction rate by field;
- unsupported-scope rate;
- unknown-to-confirmed conversion;
- source citation open rate;
- homeowner comprehension of estimate versus policy fact;
- comparison-equivalence comprehension;
- professional-boundary comprehension;
- commercial-disclosure comprehension;
- incorrect covered/uncovered complaint rate;
- recommendation reversal rate;
- consent withdrawal rate.

### 19.4 Guardrails

- unsupported savings claim incidents;
- policy determination incidents;
- stale source exposure;
- dead CTA rate;
- missing-record-as-absence incidents;
- partner contact without valid consent;
- non-equivalent option selected after “best” recommendation;
- duplicate Home Action rate;
- error-to-healthy conversion;
- sensitive-data telemetry leak;
- accessibility regression;
- page and extraction failure rate.

Page views, analyses generated, and lead submissions are not north-star outcomes.

---

## 20. Operations and Governance

### 20.1 Required owners

- Product owner for the homeowner outcome;
- insurance domain reviewer;
- trust/safety owner;
- legal/compliance reviewer;
- commercial-integrity owner;
- data/source owner;
- privacy/security owner;
- engineering owner;
- design/content owner;
- operations owner for any partner handoff.

### 20.2 Admin controls

- capability stage enablement;
- rule version activation;
- supported policy form;
- benchmark source activation;
- source coverage and freshness;
- partner and jurisdiction eligibility;
- commercial disclosure version;
- consent version;
- quote SLA;
- content version;
- kill switch;
- incident log.

### 20.3 Runbooks

- document extraction degraded;
- source stale or unavailable;
- policy parsing error;
- incorrect coverage statement;
- partner unavailable;
- unauthorized contact complaint;
- consent dispute;
- quote fulfillment timeout;
- sensitive-data exposure;
- rollback and generated-output suppression.

### 20.4 Review cadence

- policy rule changes: before activation;
- benchmark source: per source refresh schedule;
- partner/license eligibility: before each request or per approved cache;
- disclosures: on commercial or legal change;
- golden fixtures: on every rule/content version;
- quarterly capability re-audit before real-user launch.

---

## 21. Documentation Change List

Implementation should update:

- current capability inventory;
- capability discovery and recommendation FRD;
- Product Framework capability contract;
- route merge map;
- insurance/policy management documentation;
- Property Context capture documentation;
- Guidance Engine coverage journey;
- Home Action source promotion documentation;
- Document Vault and insurance extraction documentation;
- Home Event Radar coverage handoffs;
- analytics event contract;
- privacy and commercial disclosure documentation;
- source operations runbook;
- deployment/configuration reference.

Documentation should retire or clearly supersede claims that:

- Coverage Options compares policies today;
- Insurance Trend uses real local premium data today;
- Risk Optimizer predicts premium savings today;
- Coverage Intelligence performs a policy-language coverage audit today.

---

## 22. Definition of Done

The outcome family is complete when:

1. one canonical capability and workspace represent the homeowner job;
2. the first screen answers all applicable Homeowner Question Contract
   questions;
3. policy facts preserve source, page, effective date, extraction confidence,
   and confirmation;
4. missing data remains unknown rather than absent;
5. the product does not determine claim coverage;
6. synthetic history and unsupported savings have been removed;
7. renewal history uses actual confirmed policy terms;
8. review questions are deterministic, reviewed, and evidence-qualified;
9. policy choices cannot be ranked as best when material protection differs or
   is unknown;
10. mitigation actions distinguish loss reduction from carrier discount
    eligibility;
11. quote or professional handoffs have licensing, consent, disclosure,
    fulfillment, withdrawal, and outcome controls;
12. a homeowner can record a decision and resulting policy or action;
13. completion updates the Living Home Record, Home Timeline, Guidance, and
    canonical Home Action;
14. Home promotion is contextual and deduplicated;
15. all empty, partial, unsupported, stale, unavailable, and error states are
    distinct;
16. regulated recommendation and commercial review gates pass;
17. authorization, privacy, accessibility, performance, and operational gates
    pass;
18. golden fixtures and end-to-end acceptance are green;
19. old capability manifests and obsolete routes are removed or safely
    redirected;
20. no migration scripts, backfills, or legacy compatibility layers were
    created.

---

## 23. Immediate Recommendation

Start with **Slice 0 — Immediate truth and safety containment** before adding
new functionality.

It is the highest-value first slice because it removes current misleading
claims and dead actions without waiting for a data provider, schema redesign, or
commercial partner.

Then implement:

1. canonical capability and workspace;
2. verified policy term and fact provenance;
3. minimum credible coverage review;
4. actual renewal history;
5. equivalent-coverage comparison and decision;
6. loss-prevention planning;
7. governed quote or licensed-help handoff;
8. contextual lifecycle and measurement;
9. qualified market context;
10. final validation and launch gate.

The defining product choice is not whether these four tools can be polished.
It is whether ContractToCozy will present uncertain insurance heuristics as
answers or use its Living Home Record to help homeowners ask, compare, and
complete the right coverage decision with appropriate restraint.

---

## Appendix A — Repository Evidence Map

| Area | Repository evidence | Audit relevance |
|---|---|---|
| Audit contract | `docs/product/CAPABILITY_OUTCOME_AND_EXPERIENCE_AUDIT_FRAMEWORK.md` | Homeowner questions, completeness, disposition, trust, and acceptance standard |
| Product contract | `docs/product/ContractToCozy_Product_Framework.md` | Home Actions, Living Home Record, regulated safety, discovery, completion, and commercial integrity |
| Capability inventory | `docs/product/capability-discovery/current-capability-inventory.md` | Current IDs, routes, release stages, safety tiers, completion kinds, and recommendation modes |
| Strategic disposition | `docs/audit/contracttocozy-strategic-audit-v2-2026-04-18.md` | Existing merge/rework findings |
| Route consolidation | `docs/audit/contracttocozy-route-merge-map-2026-04-18.md` | Existing global/property and options/trend merge intent |
| Neutral scenario engine | `apps/backend/src/services/coverageAnalysis.service.ts` | Property/item cost scenarios without policy verdicts, add-ons, gap signals, or generated advice |
| Retired coverage advice | `apps/backend/src/services/coverageAdvisor.service.ts` (removed) | Generated strategic advice was removed |
| Gap detector | `apps/backend/src/services/coverageGap.service.ts` | Item thresholds and warranty/policy linkage classification |
| Coverage applicability | `apps/backend/src/services/coverage/contextPolicy.ts` | Active/future/expired/unknown coverage-record behavior |
| Coverage API | `apps/backend/src/controllers/coverageAnalysis.controller.ts` and `apps/backend/src/routes/coverageAnalysis.routes.ts` | Authorization, validation, generated-output completion, and scenario APIs |
| Coverage page | `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/coverage-intelligence/CoverageIntelligenceToolClient.tsx` | Current tabs, trust contract, item redirect, trend handoff, and capture panel |
| Retired coverage panel | `apps/frontend/src/components/ai/CoverageIntelligencePanel.tsx` (removed) | Legacy verdict/scenario panel was removed from homeowner output |
| Options page | `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/coverage-options/page.tsx` | Standalone route already redirects into Coverage Intelligence |
| Options experience | `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/coverage-options/CoverageOptionsClient.tsx` | Gap listing, item actions, review completion, and no actual option comparison |
| Item coverage experience | `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/inventory/items/[itemId]/coverage/ItemGetCoverageClient.tsx` | Warranty scenarios, item context, and current buy/do-not-buy language |
| Inventory coverage | `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/inventory/coverage/CoverageClient.tsx` | Gap list, waiver, quote modal, and related actions |
| Retired trend engine | `apps/backend/src/services/insuranceCostTrend.service.ts` (removed) | Synthetic history was removed; consumers use confirmed policy-term premiums |
| Trend page | `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/insurance-trend/InsuranceTrendClient.tsx` | Personal-history labels, hard-coded savings copy, dead CTAs, and buried methodology |
| Risk engine | `apps/backend/src/services/riskPremiumOptimizer.service.ts` | Drivers, fixed recommendation ranges, additive savings, bundle boost, plan persistence, and observed delta |
| Risk API | `apps/backend/src/controllers/riskPremiumOptimizer.controller.ts` and `apps/backend/src/routes/riskPremiumOptimizer.routes.ts` | Authorization, validation, run event, and plan mutation |
| Risk panel | `apps/frontend/src/components/ai/RiskPremiumOptimizerPanel.tsx` | Scenario input, savings hero, checklist, and evidence-control gap |
| Policy persistence | `apps/backend/prisma/schema.prisma` (`InsurancePolicy`) | Current policy fields and untyped coverage JSON |
| Analysis persistence | `apps/backend/prisma/schema.prisma` (`CoverageAnalysis`, `CoverageScenario`, `RiskPremiumOptimizationAnalysis`, `RiskMitigationPlanItem`) | Current generated outputs, scenarios, and mitigation lifecycle |
| Lead persistence | `apps/backend/prisma/schema.prisma` (`InsuranceQuoteRequest`) | Current request fields and status limitations |
| Lead API | `apps/backend/src/routes/insuranceQuote.routes.ts` | DB-only lead creation and missing governed fulfillment |
| Lead UI | `apps/frontend/src/app/(dashboard)/dashboard/components/coverage/InsuranceQuoteModal.tsx` | Contact collection without versioned consent or commercial disclosure |
| OCR | `apps/backend/src/services/insuranceOcr.service.ts` | Limited amount extraction and missing field-level confidence model |
| Document intelligence | `apps/backend/src/services/documentIntelligence.service.ts` | Automatic policy creation and default-value risk |
| Policy capture | `apps/backend/src/modules/propertyContext/catalog/captureRegistry.ts` | Exact just-in-time policy and item coverage capture |
| Home Actions | `apps/backend/src/services/homeActionSourcePromotion.service.ts` | Coverage action evidence, regulated boundary, correction CTA, and jurisdiction-status defect |
| Discovery registry | `apps/frontend/src/features/tools/toolDiscoveryRegistry.ts` | Four separate regulated capabilities and current policy defaults |
| Catalog definitions | `apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts` | Four homeowner-facing product entries and promises |
| Explainer copy | `apps/frontend/src/content/toolExplainers.ts` | Claims about policy analysis, gaps, premium drivers, and scenario outcomes |
| Existing tests | `apps/backend/tests/unit/coverageContextPolicy.test.js`, `apps/backend/tests/unit/phase3ProtectionContextPolicy.test.js`, `apps/backend/tests/unit/capabilityGovernanceDefinition.test.js`, and `apps/backend/tests/unit/phase8CleanupGuard.test.js` | Applicability and governance foundations; insufficient direct domain-output coverage |

---

## Appendix B — Review Verification Baseline

Review-time verification on July 27, 2026:

| Check | Result |
|---|---|
| Capability governance definitions | Passed |
| Coverage effective-window and unknown-date policy | Passed |
| Shared protection Property Context policy | Passed |
| Phase 8 cleanup guard | 6 assertions passed; 1 unrelated repository-wide alias assertion failed |
| Markdown whitespace validation | Passed |

The cleanup-guard failure reports existing `homeAsset` alias matches in product
framework and shared home-action/status services. This document does not change
those files. The failure should not be treated as coverage-domain acceptance,
and it should be resolved independently before using the complete cleanup guard
as a launch gate.

The implemented golden-output and launch-gate suites now validate:

- property coverage review questions;
- synthetic versus actual insurance history;
- equivalent-coverage comparison;
- fixed mitigation savings;
- quote consent and disclosure;
- coverage decision completion.

These repository tests establish implementation containment and contract
correctness. They do not substitute for the external regulated-coverage,
commercial, operational, or real-user launch approvals described above.
