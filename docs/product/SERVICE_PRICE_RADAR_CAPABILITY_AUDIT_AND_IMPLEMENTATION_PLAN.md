# Service Price Radar Capability Audit and Implementation Plan

**Capability:** 21.2 Service Price Radar  
**Audit framework:** `CAPABILITY_OUTCOME_AND_EXPERIENCE_AUDIT_FRAMEWORK.md`  
**Audit date:** July 27, 2026  
**Status:** Recommended implementation plan  
**Recommended disposition:** **Merge and reposition**  
**Current safety classification:** Low consequence  
**Recommended safety classification:** Material financial, with category-specific escalation  
**Primary outcome family:** Service Quote Decision

---

## 1. Executive Decision

Service Price Radar addresses a real and recurring homeowner problem: determining whether a service quote is reasonable before committing money. The product already has useful foundations:

- property-aware estimates;
- regional adjustments;
- optional benchmark matching;
- quote history;
- explanations and confidence;
- contextual entry from home systems, incidents, projects, documents, and journeys;
- adjacent compare, negotiation, finalization, and booking tools.

The current experience must not, however, be treated as production-trustworthy price intelligence in its present form.

When no qualified benchmark is available, the engine can still label a quote `FAIR`, `HIGH`, `VERY_HIGH`, or `UNDERPRICED` using broad, hard-coded category ranges and state multipliers. The UI then describes that fallback as “regional pricing data” or “regional averages.” That wording gives heuristic assumptions the appearance of sourced market evidence.

The current feature also has a fragmented completion path. Creating a price check is recorded as completed guidance even though the capability contract requires a recorded decision. The reserved Radar action table has no homeowner action API, while actual comparison, decision, accepted terms, and booking are distributed across Quote Comparison, Negotiation Shield, Price Finalization, and Booking.

The recommendation is therefore:

1. immediately contain unsupported price claims and unsafe actions;
2. establish a qualified, traceable benchmark contract;
3. require enough scope detail for a meaningful comparison;
4. merge the adjacent tools into one coherent Service Quote Decision journey;
5. distinguish an estimate from a quote comparison and a completed decision;
6. expose readiness, sources, missing information, confidence, and homeowner controls in plain language;
7. measure verified decisions and completed service outcomes rather than generated verdicts.

Service Price Radar should remain a recognizable entry point, but its role should be repositioned:

> Help me understand a service quote, compare my options fairly, and decide what to do without being misled by incomplete pricing evidence.

### 1.1 Implementation constraint

There are no real users and no production data migration requirement.

Implementation may change the Prisma schema directly. It must not create:

- database migration scripts;
- historical backfills;
- compatibility layers for obsolete Service Price Radar records;
- dual-write logic;
- legacy route preservation that has no product value.

After schema changes, the user will reconcile the database separately.

This constraint should be used to simplify the model around the target Service Quote Decision outcome instead of retaining duplicate or unused structures.

---

## 2. Scope

### 2.1 In scope

This audit covers:

- Service Price Radar engine logic;
- benchmark selection and provenance;
- confidence and verdict behavior;
- category and regional heuristics;
- API contracts and persistence;
- capability manifest and framework metadata;
- readiness and contextual launch behavior;
- Service Price Radar page hierarchy and content;
- quote history and homeowner controls;
- Quote Comparison;
- Negotiation Shield handoff;
- Price Finalization;
- provider booking handoff;
- Home and contextual placement;
- analytics, testing, accessibility, operations, and documentation.

### 2.2 Out of scope

This document does not:

- select or contract with an external pricing provider;
- define provider marketplace commercial terms;
- approve legal copy for regulated professional services;
- prescribe a database migration;
- implement the recommended slices.

### 2.3 Evidence reviewed

The assessment is based on the repository implementation, including:

- `docs/functional/SERVICE_PRICE_RADAR.md`;
- product framework capability definitions and contextual manifests;
- Service Price Radar engine, service, controller, routes, and validators;
- Prisma models for price checks, benchmarks, actions, quote comparison, and price finalization;
- Service Price Radar frontend, API adapter, UI helpers, and tests;
- Quote Comparison, Negotiation Shield, Price Finalization, and provider-booking handoffs;
- existing product strategy and route-consolidation documentation.

---

## 3. Homeowner Job and Target Outcome

### 3.1 Primary homeowner job

> When I receive an estimate or quote for work on my home, help me understand what I am paying for, whether the proposal is reasonably priced for comparable work, what may be missing or risky, and what I should do next.

### 3.2 Triggering situations

The capability is relevant when:

- a homeowner receives a written quote;
- a contractor gives a verbal estimate;
- a repair or maintenance recommendation creates a service decision;
- an inspection finding requires contractor work;
- the homeowner is budgeting a future project;
- two or more comparable proposals need evaluation;
- the homeowner needs help requesting clarification or negotiating terms;
- the homeowner has agreed on price and needs to preserve final terms;
- the homeowner is ready to select or book a provider.

A finding, system condition, or project alone does not necessarily mean the homeowner is ready for a price check. Contextual recommendation should distinguish:

- “you may need service”;
- “prepare to request quotes”;
- “you have a quote to evaluate”;
- “compare proposals”;
- “record the final decision.”

### 3.3 Current delivered outcome

The current implementation primarily delivers:

> Enter a category and amount, receive a price range, verdict, confidence score, explanation, and next-action suggestion.

This is a generated assessment, not a recorded service decision.

### 3.4 Target best-in-class outcome

The target outcome is:

> The homeowner reaches a documented, evidence-qualified service decision using comparable scope, transparent pricing evidence, clear risks, and preserved final terms, with an optional handoff to provider action.

The journey should leave the homeowner with:

- an understood quote;
- known missing or ambiguous terms;
- a planning estimate or qualified market comparison, clearly distinguished;
- normalized proposals that are actually comparable;
- a safe recommendation;
- a recorded decision and reason;
- accepted scope, price, payment, warranty, and timeline terms;
- a next step such as clarify, requote, negotiate, decline, accept, or book;
- a durable record in the home timeline.

---

## 4. Outcome-Family Decision

### 4.1 Current fragmentation

The homeowner’s service-quote outcome is currently split across several tools:

| Tool | Current role | Target role |
|---|---|---|
| Service Price Radar | Estimate and price verdict | Intake, scope understanding, planning range, and evidence-qualified price check |
| Quote Comparison | Compare Radar checks and recommend a quote | Normalize comparable proposals and support a shortlist |
| Negotiation Shield | Draft a contractor response | Clarification and negotiation action within the same decision |
| Price Finalization | Record accepted price and terms | Canonical decision and terms-completion stage |
| Provider Booking | Find or engage a provider | Optional action after an informed decision |

Each function is valuable. The problem is that the homeowner must understand the product’s internal tool boundaries in order to finish one real-world job.

### 4.2 Recommended family structure

Create one canonical **Service Quote Decision** journey with progressive stages:

1. **Understand the job**
2. **Review the quote**
3. **Compare options**
4. **Clarify or negotiate**
5. **Decide and preserve terms**
6. **Book or track the work**

Service Price Radar may remain the homeowner-facing name for the entry experience, provided the page explains that it is part of the larger quote-decision journey.

### 4.3 Route and product disposition

- Use one canonical route and workspace for the outcome family.
- Treat Quote Comparison, Negotiation Shield, and Price Finalization routes as stage-specific deep links or aliases rather than independent capability destinations.
- Do not display five separate product tools when one journey can disclose the relevant next stage progressively.
- Preserve contextual deep links from systems, appliances, incidents, rooms, documents, projects, and guidance.
- Record one durable outcome with stage transitions, not unrelated tool completions.

### 4.4 Why “merge and reposition” is preferred

Improving Service Price Radar alone would leave:

- duplicate quote records;
- conflicting completion semantics;
- recommendations detached from accepted terms;
- repeated context entry;
- handoff loss between price checking and negotiation;
- multiple partial histories for one contractor decision;
- homeowner confusion over which tool represents the final answer.

The capability has strong strategic potential, but the product unit should be the homeowner outcome, not the current route.

---

## 5. Current Strengths

### 5.1 Clear homeowner problem

Service quotes are high-anxiety, information-asymmetric decisions. A homeowner-facing explanation and comparison experience can create immediate value and a strong reason to return.

### 5.2 Property and context awareness

The feature can incorporate:

- property state;
- home type;
- property size;
- construction year;
- linked home systems;
- appliances;
- incidents;
- documents;
- rooms;
- projects or journeys.

This is a meaningful differentiator from a generic price-search page when the context is used honestly and explains how it affects the estimate.

### 5.3 Explainable result structure

The current UI includes:

- an estimated range;
- a verdict;
- a confidence indicator;
- explanation text;
- an expandable evidence view;
- a next action;
- recent checks.

These are useful primitives for a redesigned trust experience.

### 5.4 Adjacent closed-loop capabilities

The repository already contains the core stages needed for a closed loop:

- quote comparison;
- contractor-response assistance;
- accepted-term capture;
- booking handoff;
- home timeline integration.

The fastest path to best-in-class is to unify and strengthen these assets rather than build another disconnected flow.

### 5.5 Progressive input

The page allows a homeowner to begin with a category and amount and optionally add context. This lowers initial effort. The target experience should retain progressive disclosure while making the minimum evidence for each type of conclusion explicit.

---

## 6. Audit Scorecard

| Dimension | Weight | Score | Assessment |
|---|---:|---:|---|
| Homeowner value and differentiation | 20 | 15 | High-value problem and meaningful property context, but the current conclusion is not sufficiently trustworthy |
| Functional completeness | 20 | 9 | Generates a check but lacks credible scope normalization, durable action controls, and verified completion |
| Actionability and closed loop | 15 | 8 | Adjacent tools exist, but handoffs are fragmented and some actions are unsafe |
| Data quality, trust, and provenance | 15 | 4 | Optional benchmarks lack a complete provenance contract; heuristic fallback is presented as market data |
| UX, readiness, and accessibility | 15 | 10 | Clear visual primitives, but the page overclaims evidence and does not explain readiness or missing facts well enough |
| Product-framework integration | 10 | 6 | Contextual registration exists, but safety, context, readiness, and completion contracts are inaccurate |
| Reliability and automated evidence | 5 | 2 | Very narrow engine coverage, no complete route acceptance, and one current frontend helper failure |
| **Total** | **100** | **54** | **Strategically promising, but material trust and completion gaps require containment before expansion** |

### 6.1 Disposition override

The numerical score does not authorize incremental polish.

The following launch-blocking defects require a disposition override:

- unsupported categorical price verdicts;
- fallback assumptions presented as regional data;
- low-price booking encouragement without scope or provider verification;
- low-consequence classification for material financial decisions;
- false completion on check creation;
- quote recommendations that can favor the cheapest amount without establishing comparable scope.

The appropriate disposition is **merge and reposition**, with immediate truth and safety containment.

---

## 7. Homeowner Question Contract Assessment

| Homeowner question | Current answer | Gap | Target answer |
|---|---|---|---|
| What is this? | A price-check tool for a service quote | Does not explain estimate versus market comparison versus decision | “Review a home-service quote, understand what is included, compare it with relevant evidence, and decide what to do.” |
| How will this benefit me? | Shows a price range and verdict | Benefit is framed around a verdict rather than avoiding overpayment, omissions, and surprises | State the concrete benefits: understand scope, detect missing terms, compare like-for-like, avoid unsafe low bids, preserve agreed terms |
| What should I add? | Category and price required; other context optional | Critical quote facts are treated as optional even when they determine comparability | Show a readiness checklist and why each missing fact matters |
| What should I care about? | Fairness label, range, and confidence | Omits scope gaps, exclusions, permit, licensing, warranty, payment, timing, and unusually low-bid risk | Rank price, scope, omissions, provider verification, and contract terms separately |
| What can I control? | Enter another check or follow a handoff | No durable accept, reject, clarify, delete, or notification controls in Radar | Clarify, upload, edit, compare, negotiate, decline, accept, delete, and record outcome |
| Why should I trust this? | “Regional pricing data,” context, and confidence | No qualified source, date, methodology, or sample; fallback is mislabeled | Identify source, geography, date, sample/method, known limitations, and exact facts used |
| What should I do next? | Compare, accept, book, negotiate, or complete property context | Some suggestions exceed the evidence and skip safety checks | Recommend only the next safe action supported by readiness and evidence |
| When am I done? | Check creation can be recorded as completion | Generating a verdict is not a decision | Done means a decision and reason are recorded, accepted terms are preserved, or the homeowner explicitly exits |

---

## 8. Product Framework Conformance

### 8.1 Current contract

The capability is currently represented as:

- outcome: `DECIDE_COMPARE`;
- safety tier: `LOW_CONSEQUENCE`;
- activation: `CONTEXTUAL`;
- completion kind: `DECISION_RECORDED`;
- trigger: `SERVICE_DECISION_ACTIVE`;
- source kinds: maintenance, project, and guidance.

### 8.2 Contract defects

#### Safety tier

The current tier is too low. The tool accepts quote amounts up to $250,000 and includes categories such as:

- roofing;
- foundation;
- electrical;
- mold;
- solar;
- security or safety work;
- insurance;
- attorney;
- finance.

These are not uniformly low-consequence decisions. The primary family should be classified as **material financial**. Regulated or specialized categories need separate boundaries and content review.

#### Completion

`DECISION_RECORDED` is the correct target outcome, but creating a price check is currently reported as a completed guidance step. A generated assessment should be an intermediate event, such as:

- check generated;
- quote reviewed;
- comparison started.

Only an explicit homeowner decision should satisfy capability completion.

#### Context

The implementation supports more context types than the capability manifest communicates, including system, appliance, document, incident, room, project, service, and journey context.

The manifest should enumerate accepted context and required fields so contextual recommendations and deep links are predictable.

#### Readiness

Property context alone is not enough for a quote decision. Readiness should distinguish:

- planning estimate readiness;
- quote-review readiness;
- comparative-pricing readiness;
- decision readiness.

A contextual trigger should require a quote or explicit quote intent before recommending the price-check stage. A maintenance finding by itself should normally recommend preparing or requesting quotes.

#### Commercial boundary

The current family can hand off to provider booking, yet the generic capability contract does not express a commercial action or disclosure requirement.

The target contract must either:

- keep provider ranking outside the price verdict and disclose the commercial boundary; or
- explicitly classify the provider handoff as commercial and require reviewed disclosure.

### 8.3 Recommended capability contract

| Field | Recommended value |
|---|---|
| Outcome family | Service Quote Decision |
| Outcome | Decide / compare |
| Safety | Material financial |
| Activation | Contextual canonical |
| Completion | Explicit decision recorded; accepted terms recorded when applicable |
| Readiness | Quote or estimate context plus minimum scope and amount for review; comparable scope for recommendation |
| Partial value | Planning range only, clearly labeled, when qualified comparison evidence is absent |
| Accepted context | Property, system, appliance, room, incident, project, document, service, guidance, journey |
| Commercial action | Explicit provider-booking boundary and disclosure |
| Persistence | One canonical decision workspace and outcome record |

### 8.4 Home placement

Service Price Radar should not be an always-visible primary Home card merely because it exists.

It should appear on Home when one of the following is true:

- the homeowner has an active quote decision;
- a quote document or estimate has been added;
- a project or finding has reached a “request/review quotes” stage;
- clarification, comparison, negotiation, or acceptance is pending;
- an accepted quote has an unresolved next step.

Otherwise:

- expose the capability through contextual tool discovery;
- offer it at relevant project, maintenance, incident, document, and home-system surfaces;
- do not displace more immediate Home actions.

The Home card should communicate the homeowner outcome, not an engine status:

- “Review the $4,800 HVAC quote”
- “Two roofing proposals need an apples-to-apples comparison”
- “The lowest bid may exclude permits and disposal”
- “Record the warranty and payment schedule before accepting”

---

## 9. Data and Trust Assessment

### 9.1 Current estimate path

The engine uses:

- hard-coded price ranges by service category;
- hard-coded state cost multipliers;
- property and linked-context adjustments;
- keyword inference;
- an optional matched `ServicePriceBenchmark`;
- static currency conversion rates;
- a confidence formula.

If benchmark retrieval fails or no benchmark matches, the engine fails open to the heuristic path.

### 9.2 Unsupported evidence claim

The backend explanation identifies the no-benchmark path as fallback assumptions. The frontend replaces that wording with “regional pricing data” and labels the evidence “Regional averages used.”

That is not a copy preference. It is a product-truth defect.

A static category prior and state multiplier may support a rough planning estimate. It must not be presented as:

- current regional market data;
- a verified local average;
- proof that a quote is fair;
- evidence that a low quote should be booked.

### 9.3 Benchmark provenance gaps

The benchmark model includes useful matching fields and an optional source label, but it lacks a complete trust contract:

- source identifier;
- source reference or URL;
- observation or data-through date;
- import run and version;
- geography definition;
- methodology;
- sample size;
- percentile definition;
- data quality status;
- review status;
- licensing or usage constraints;
- freshness policy;
- anomaly and outlier handling.

No production benchmark ingestion, review, or seed pipeline was found in the current implementation.

### 9.4 Price comparability gaps

A quote amount cannot be responsibly compared without enough scope information. Important missing structured fields include:

- service location and quantity;
- unit of measure;
- labor and material breakdown;
- equipment make, model, efficiency, or grade;
- replacement versus repair;
- demolition, disposal, and cleanup;
- taxes;
- permits and inspections;
- emergency or after-hours service;
- access and complexity;
- included and excluded work;
- warranty;
- payment schedule and deposit;
- start and completion dates;
- quote date and expiration;
- contractor license and insurance;
- change-order terms.

The current quote description is helpful but insufficient as the sole normalization mechanism.

### 9.5 Confidence gaps

The confidence calculation can produce a usable-looking score without a qualified benchmark. Vendor name does not materially improve the evidence, even though the UI suggests that adding it can increase confidence.

Confidence should be decomposed into homeowner-understandable dimensions:

- scope completeness;
- benchmark quality;
- geographic relevance;
- benchmark freshness;
- quote comparability;
- property-context quality.

A single numeric confidence score should not conceal the absence of a real market source.

### 9.6 Required evidence levels

| Evidence level | Allowed output | Prohibited output |
|---|---|---|
| Category heuristic only | Rough planning range, questions to ask, missing facts | Fair/high/underpriced verdict; regional-average claim; booking recommendation |
| Reviewed non-production fixture | QA/demo result with visible fixture label | Production homeowner verdict |
| Qualified current benchmark | Directional comparison with source, date, geography, sample/method, and limitations | Absolute guarantee or provider-quality claim |
| Two or more normalized proposals | Apples-to-apples scope and term comparison | Cheapest-is-best recommendation when scope differs |
| Verified completed-job cohort | Privacy-protected outcome benchmark with cohort and freshness controls | Use of raw or unverified checks as market truth |

### 9.7 Failure behavior

Benchmark lookup must not silently downgrade to a categorical verdict.

If benchmark service is unavailable, stale, unsupported, or insufficient:

- preserve the entered quote;
- explain that a qualified comparison is temporarily unavailable;
- provide scope-review value;
- show any rough estimate as planning guidance only;
- allow the homeowner to continue to comparison or clarification;
- never imply that the quote was market-validated.

---

## 10. Prioritized Gap Register

### SPR-001 — Heuristic fallback is presented as market evidence

**Priority:** P0  
**Type:** Trust / product truth  

**Evidence**

- Broad hard-coded category ranges and state multipliers can produce categorical verdicts.
- The UI replaces truthful fallback language with “regional pricing data.”

**Recommendation**

- Suppress categorical price verdicts without a qualified benchmark.
- Label heuristic output “rough planning range.”
- Display what the range is based on and what it is not based on.
- Remove any sanitization that upgrades assumptions into data.

**Acceptance**

- A no-benchmark result cannot contain “fair,” “high,” “underpriced,” “regional average,” or equivalent validation.
- Source, geography, date, and evidence level are visible for every qualified verdict.

### SPR-002 — Unsafe low-price and booking guidance

**Priority:** P0  
**Type:** Safety / actionability  

**Evidence**

- `UNDERPRICED` can lead to “Book this service” and “book while price is right.”
- An unusually low quote may indicate missing scope, low-quality materials, unlicensed work, or hidden change orders.

**Recommendation**

- Replace favorable-low-price guidance with a verification workflow.
- Require scope, exclusions, license/insurance, warranty, permits, and payment checks before acceptance or booking.
- Separate price reasonableness from provider trust.

**Acceptance**

- No low quote directly triggers urgency or booking.
- The first action for an unusually low quote is review and clarification.

### SPR-003 — Safety and category scope are inaccurate

**Priority:** P0  
**Type:** Governance  

**Evidence**

- The feature is classified low consequence while supporting material quote amounts and high-risk categories.
- Insurance, attorney, and finance pricing are handled by generic home-service heuristics.

**Recommendation**

- Classify the family as material financial.
- Remove regulated professional categories from the generic engine or route them to separately governed capabilities.
- Add category-specific safety rules for structural, electrical, mold, security, and similar work.

**Acceptance**

- Capability metadata, UI qualification, and action gates reflect material financial risk.
- Unsupported regulated categories cannot receive a generic fairness verdict.

### SPR-004 — Benchmark contract and ingestion are incomplete

**Priority:** P0  
**Type:** Data / operations  

**Evidence**

- Benchmark provenance and quality fields are incomplete.
- No reviewed production ingestion or seed pipeline was found.
- Benchmark lookup can fail open.

**Recommendation**

- Add benchmark source, release/import, quality, methodology, and freshness models.
- Build reviewed ingestion and activation controls.
- Fail closed for qualified verdicts.
- Add source-health monitoring and an operator runbook.

**Acceptance**

- Every active benchmark can be traced to an approved source release and review decision.
- Stale or unhealthy sources cannot produce a qualified verdict.

### SPR-005 — Quote scope is too thin for apples-to-apples conclusions

**Priority:** P0  
**Type:** Functional completeness  

**Evidence**

- Category and amount are sufficient to generate a verdict.
- Critical scope, inclusion, warranty, payment, and provider fields are unstructured or absent.

**Recommendation**

- Add structured scope and term capture.
- Reuse document extraction infrastructure to parse quote documents.
- Normalize line items, units, inclusions, exclusions, and allowances.
- Show missing facts before comparative conclusions.

**Acceptance**

- The system distinguishes a planning estimate from a review-ready quote.
- A comparison recommendation requires materially comparable scope.

### SPR-006 — Outcome family is fragmented

**Priority:** P0  
**Type:** Product architecture / UX  

**Evidence**

- Price checking, comparison, negotiation, finalization, and booking are separate tool experiences.
- Context and progress can fragment across records and routes.

**Recommendation**

- Establish one Service Quote Decision workspace and journey.
- Reuse current tool capabilities as progressive stages.
- Define canonical route, state transitions, and durable outcome.

**Acceptance**

- A homeowner can move from quote intake to recorded decision without re-entering context or choosing among internal tools.
- All stages appear in one progress and history model.

### SPR-007 — Completion is falsely recorded

**Priority:** P0  
**Type:** Product framework / analytics  

**Evidence**

- Creating a price check records completed guidance.
- The manifest requires `DECISION_RECORDED`.
- Radar’s action model has no homeowner API.

**Recommendation**

- Stop completion on check generation.
- Record intermediate events separately.
- Complete only on accept, reject, defer, choose another quote, or explicit close-with-reason.
- Use Price Finalization for accepted terms rather than a duplicate action table.

**Acceptance**

- Completion analytics cannot increment from a generated verdict.
- Every completed outcome has an explicit homeowner action and timestamp.

### SPR-008 — Quote recommendation can reward the cheapest incomplete proposal

**Priority:** P0  
**Type:** Decision quality  

**Evidence**

- Quote Comparison can recommend the lowest amount among favorable verdicts without normalizing complete scope, provider qualifications, warranty, or terms.

**Recommendation**

- Do not name a recommended quote until comparable scope thresholds are met.
- Rank gaps and trade-offs before ranking providers.
- Allow “none are ready to choose” as a valid result.

**Acceptance**

- Recommendation logic explains comparability and material trade-offs.
- Cheapest price alone cannot determine the recommended proposal.

### SPR-009 — Readiness and missing facts are not explicit

**Priority:** P1  
**Type:** UX / activation  

**Evidence**

- Optional context is encouraged, but the page does not explain which missing facts limit the conclusion or why.
- Contextual launch can occur before a quote exists.

**Recommendation**

- Introduce stage-specific readiness.
- Show “What we know,” “What is missing,” “Why it matters,” and the fastest way to complete it.
- Recommend quote preparation rather than price checking when no quote exists.

**Acceptance**

- Homeowners can identify the exact missing inputs before submitting.
- The result states which conclusion the evidence supports.

### SPR-010 — Source, freshness, and methodology are not visible enough

**Priority:** P1  
**Type:** Trust / explainability  

**Evidence**

- Matched benchmark details do not visibly provide a complete source/date/methodology explanation.
- Engine version is more visible than homeowner-relevant evidence quality.

**Recommendation**

- Replace technical engine emphasis with an evidence card.
- Show source, geographic match, data period, sample/method, scope match, and limitations.
- Keep internal versioning in diagnostics, not the primary homeowner experience.

**Acceptance**

- The homeowner can answer “Why did Radar reach this conclusion?” without reading technical internals.

### SPR-011 — Homeowner controls and record lifecycle are incomplete

**Priority:** P1  
**Type:** Control / privacy  

**Evidence**

- Checks are persisted automatically.
- Radar lacks clear delete, accept, reject, clarify, defer, or correct controls.
- Quote and vendor data can be sensitive.

**Recommendation**

- Explain automatic saving or make saving explicit.
- Add edit, delete, clarify, compare, defer, and decide actions.
- Provide retention and privacy controls.
- Remove unused duplicate action persistence if the unified outcome model replaces it.

**Acceptance**

- A homeowner can inspect, correct, and remove quote data.
- Every state transition is user-visible and reversible where appropriate.

### SPR-012 — Automated evidence is insufficient

**Priority:** P1  
**Type:** Quality  

**Evidence**

- Existing backend benchmark tests cover only a narrow match-scoring path.
- The frontend helper suite currently has a wording-related failure.
- No complete route, mobile, keyboard, screen-reader, or family handoff acceptance was found.

**Recommendation**

- Add engine truth-table tests.
- Add benchmark failure and freshness tests.
- Add API authorization and persistence tests.
- Add route-level browser acceptance for every evidence and outcome state.
- Add cross-stage Service Quote Decision tests.

**Acceptance**

- The defined acceptance matrix runs in CI.
- No unsupported verdict or false completion path is possible without a failing test.

### SPR-013 — Outcome analytics stop before value is realized

**Priority:** P2  
**Type:** Measurement  

**Evidence**

- Generic tool events exist, but there is no reliable funnel through decision, final terms, booking, completed work, actual price, or homeowner-reported outcome.

**Recommendation**

- Instrument the outcome family end to end.
- Measure evidence quality and homeowner action, not just result views.
- Capture actual final cost and material change orders only with explicit homeowner control.

**Acceptance**

- Product reporting can distinguish generated checks, qualified comparisons, explicit decisions, and verified completed outcomes.

### SPR-014 — Documentation promises exceed the production evidence

**Priority:** P1  
**Type:** Documentation / operations  

**Evidence**

- Existing documentation treats fallback estimation as a normal operating path and describes behavior that can appear more authoritative than the underlying evidence.

**Recommendation**

- Align functional, framework, API, operational, and UX documentation with the evidence-level contract.
- Document unsupported states, degraded behavior, category exclusions, source activation, and completion semantics.

**Acceptance**

- Documentation does not describe heuristic estimates as qualified market verdicts.
- Operators have one source-health and rollback runbook.

---

## 11. Target Experience

### 11.1 Entry state: explain the benefit

The first screen should answer:

**What is this?**

> Review a home-service quote before you agree to it.

**How does it help?**

> Understand what is included, spot missing terms, compare the price with relevant evidence when available, and choose a safe next step.

**What should I provide?**

- upload a quote or enter the amount;
- identify the work and where it will happen;
- confirm important inclusions and exclusions;
- optionally connect the relevant home system, project, or incident.

### 11.2 Intake paths

Offer three clear starting paths:

1. **Upload a quote**
2. **Enter a quote manually**
3. **Plan a budget before requesting quotes**

The third path must be labeled as planning guidance and must not produce a market-validity verdict.

### 11.3 Quote understanding

After intake, present:

- proposed work;
- line items and quantities;
- labor and materials;
- inclusions and exclusions;
- allowances;
- permits;
- disposal and cleanup;
- equipment details;
- warranty;
- payment schedule;
- timing;
- provider qualifications;
- uncertain or missing terms.

Each missing item should explain its relevance:

> Disposal is not mentioned. Ask whether removal of the old unit is included so the final cost does not increase later.

### 11.4 Evidence-qualified price result

The result hierarchy should be:

1. **What the evidence supports**
2. **What may change the price**
3. **What is missing or risky**
4. **Recommended next step**
5. **Source and confidence details**

Example with qualified evidence:

> This quote is within the observed range for comparable 3-ton heat-pump replacements in your region. The evidence is directionally useful, but the quote does not state whether electrical upgrades or permit fees are included.

Example without qualified evidence:

> We do not have a current, qualified local benchmark for this exact work. The amount is within a broad planning range, but that is not enough to say whether the quote is fair. Review the missing scope below or add another proposal for comparison.

### 11.5 Comparison

The comparison stage should prioritize:

- scope equivalence;
- exclusions;
- equipment or material differences;
- warranty;
- payment risk;
- schedule;
- license and insurance verification;
- qualified price evidence;
- total price.

It should support:

- “best fit” only when evidence supports a recommendation;
- “lowest price” as a factual label, not a recommendation;
- “not comparable yet”;
- “none are ready to select”;
- a generated clarification request for each material gap.

### 11.6 Clarification and negotiation

Negotiation Shield should appear as an action inside the journey:

- ask what is included;
- request an itemized quote;
- request proof of insurance or license;
- clarify warranty;
- negotiate price or payment terms;
- decline respectfully;
- request a revised proposal.

Generated communication must remain editable and must distinguish factual questions from negotiation suggestions.

### 11.7 Decision and completion

The homeowner should be able to:

- accept a proposal;
- reject a proposal;
- select another proposal;
- defer the decision;
- decide not to proceed;
- record why;
- preserve final scope, price, payment, warranty, and timeline terms.

Completion should create a home-timeline event and provide the next appropriate action:

- book or contact the selected provider;
- create the project;
- set payment or milestone reminders;
- store the signed agreement;
- track completion and final cost.

### 11.8 Returning experience

The page should give a reason to return:

- quote awaiting clarification;
- revised proposal received;
- comparison incomplete;
- decision due before quote expiration;
- deposit or milestone due;
- work scheduled;
- final terms not recorded;
- completed job awaiting actual-cost or warranty capture.

---

## 12. Recommended Implementation Sequence

### Slice 0 — Truth, safety, and completion containment

**Goal:** Stop unsupported and unsafe behavior before expanding the capability.

**Work**

- Remove fallback-to-market wording.
- Suppress `FAIR`, `HIGH`, `VERY_HIGH`, and `UNDERPRICED` without a qualified benchmark.
- Replace no-benchmark output with a rough planning range and scope-review guidance.
- Remove “book while price is right” and all low-price urgency.
- Stop guidance completion on check creation.
- Reclassify the capability as material financial.
- block or reroute insurance, attorney, finance, and other unsupported regulated categories;
- remove cheapest-quote recommendation when comparability is unproven.
- Correct capability context and completion metadata.
- Fix the currently failing frontend helper test and add regression cases for truthful fallback language.

**Dependencies:** None  
**Exit criterion:** No current path can convert an unsupported estimate into a market verdict, unsafe booking action, or completed decision.

### Slice 1 — Qualified benchmark foundation

**Goal:** Establish evidence that can support a homeowner-facing comparison.

**Work**

- Define approved benchmark providers and licensing constraints.
- Add benchmark source and release/import models.
- Add provenance, observation period, method, cohort, quality, review, and freshness fields.
- Add ingestion validation, review, activation, deactivation, and rollback.
- Enforce source health and stale-data gates.
- Add geography and scope normalization rules.
- Display qualified source details in the API and UI.
- Add an operator source-health report and runbook.

**Dependencies:** Slice 0  
**Exit criterion:** A qualified verdict is impossible unless an active, current, traceable benchmark matches the quote at an approved evidence level.

### Slice 2 — Quote intake, extraction, and comparability

**Goal:** Understand what the homeowner is actually being quoted.

**Work**

- Add quote document upload and reuse existing document extraction infrastructure.
- Add normalized quote, line-item, scope, inclusion, exclusion, allowance, warranty, payment, schedule, and provider fields.
- Add repair-versus-replacement and quantity/unit normalization.
- Create stage-specific readiness scores.
- Show homeowner confirmation for extracted facts.
- Detect material ambiguities and mismatched units.
- Define comparison eligibility rules.

**Dependencies:** Slice 0; benchmark matching can proceed in parallel after the data contract is stable  
**Exit criterion:** The system can distinguish a planning estimate, an incomplete quote, a review-ready quote, and comparable proposals.

### Slice 3 — Unified Service Quote Decision journey

**Goal:** Merge the outcome family into one coherent experience and durable state model.

**Work**

- Define the canonical workspace and route.
- Connect price review, quote comparison, negotiation, finalization, and booking as stages.
- Remove redundant persistence and completion paths.
- Use a single decision identity across stages.
- Preserve contextual entity links.
- Define explicit state transitions and terminal outcomes.
- Record timeline events from meaningful stage changes.
- Add deep-link compatibility only where it supports the target product.

**Dependencies:** Slices 0 and 2  
**Exit criterion:** A homeowner can complete the service-quote outcome without navigating separate conceptual tools or re-entering data.

### Slice 4 — Outcome-first UX and homeowner controls

**Goal:** Make the experience clear, compelling, trustworthy, and controllable.

**Work**

- Redesign entry around upload, manual quote, and planning-budget paths.
- Add “What we know / What is missing / Why it matters.”
- Replace technical confidence with evidence dimensions.
- Add source/freshness/method details.
- Add edit, delete, clarify, compare, defer, accept, reject, and close controls.
- Explain persistence and privacy.
- Add useful empty, degraded, stale, unsupported, and returning states.
- Redesign contextual and Home cards around the homeowner’s active decision.
- Complete keyboard, focus, screen-reader, reduced-motion, responsive, and contrast review.

**Dependencies:** Slices 1–3  
**Exit criterion:** Every screen answers what this is, why it helps, what is missing, what matters, and what the homeowner can control.

### Slice 5 — Decision-quality and safety acceptance

**Goal:** Prove that the capability behaves safely across its complete state space.

**Work**

- Add engine truth-table and boundary tests.
- Add evidence-level and provenance tests.
- Add benchmark unavailable, stale, unsupported, and ambiguous-match tests.
- Add structured-scope and comparability tests.
- Add authorization, idempotency, persistence, and delete tests.
- Add cross-stage outcome tests.
- Add browser acceptance on desktop and mobile.
- Add keyboard and screen-reader acceptance.
- Add category-specific safety and commercial-boundary tests.
- Add golden fixtures for contextual recommendation readiness.

**Dependencies:** Slices 0–4  
**Exit criterion:** The full acceptance matrix passes in CI and no fallback or handoff can overstate the evidence.

### Slice 6 — Outcome measurement and controlled learning

**Goal:** Measure homeowner value and create a governed data flywheel.

**Work**

- Instrument quote intake, readiness, evidence level, clarification, comparison, decision, finalization, booking, and completed work.
- Measure how often missing-scope detection changes the quote.
- Capture final price and material change orders only with clear consent.
- Measure recommendation override and dispute signals.
- Establish minimum-cohort, privacy, outlier, and verification rules before deriving internal benchmarks.
- Add an operator dashboard for evidence coverage and decision outcomes.

**Dependencies:** Slices 1–5  
**Exit criterion:** The team can measure verified decisions and evidence quality without treating unverified homeowner inputs as market truth.

### Slice 7 — Documentation and operational alignment

**Goal:** Make the implemented behavior the single documented truth.

**Work**

- Rewrite the functional document around the Service Quote Decision family.
- Update capability manifest documentation.
- Document evidence levels and prohibited claims.
- Document supported and routed categories.
- Document schema reconciliation requirements.
- Document source activation, degradation, rollback, and incident response.
- Remove obsolete route, persistence, and fallback descriptions.

**Dependencies:** Each earlier slice updates its affected documentation; this slice performs final reconciliation  
**Exit criterion:** Product, engineering, QA, support, and operations documents describe the same capability and constraints.

---

## 13. Proposed Persistence Model

### 13.1 Design principle

Model the durable homeowner outcome, not each screen.

The recommended core is a canonical Service Quote Decision workspace with:

- property and contextual entity links;
- service need and category;
- decision stage and status;
- normalized quote proposals;
- quote documents and extraction provenance;
- scope line items;
- inclusions, exclusions, and allowances;
- provider facts and verification state;
- benchmark assessment and evidence snapshot;
- clarification and negotiation history;
- selected proposal and decision reason;
- finalized terms;
- provider action;
- completion outcome and timeline references.

### 13.2 Benchmark models

The benchmark structure should support:

- source;
- source release/import run;
- licensing status;
- method;
- observation period;
- geographic coverage;
- category and normalized scope;
- unit and quantity;
- sample size;
- distribution or percentiles;
- quality status;
- reviewer and review timestamp;
- effective and expiry dates;
- source-health state.

Every generated assessment should preserve an immutable evidence snapshot so later source updates do not silently rewrite the homeowner’s historical decision.

### 13.3 Existing model reuse

Prefer to reuse and consolidate:

- Quote Comparison decision concepts;
- Price Finalization accepted-term concepts;
- existing document extraction and storage;
- property/entity context links;
- home timeline events;
- booking handoff.

Avoid:

- a second accept/reject model within `ServiceRadarUserAction`;
- duplicate quote records per route;
- duplicate completion records;
- decision state inferred only from analytics events.

If the reserved action table has no distinct target purpose, remove it during the direct schema refactor.

### 13.4 Schema implementation rule

Because there are no real users:

- edit `schema.prisma` directly;
- do not create a Prisma migration directory;
- do not backfill current Radar checks;
- do not maintain old enum values solely for compatibility;
- do not add transitional dual-write behavior;
- regenerate and validate Prisma artifacts;
- document that the user must run schema reconciliation.

---

## 14. Acceptance Matrix

| Scenario | Expected result | Required action |
|---|---|---|
| Category and amount only; no qualified benchmark | Rough planning range; no fairness verdict | Add scope, upload quote, or use as budget guidance |
| Qualified, current benchmark and complete comparable scope | Directional price assessment with visible evidence | Review material gaps or proceed to comparison |
| Benchmark unavailable | Saved quote and scope review; qualified comparison unavailable | Retry later or continue with another quote |
| Benchmark stale | No qualified verdict | Explain freshness and degraded state |
| Benchmark source unhealthy | Fail closed for verdict | Preserve input and show non-market guidance |
| Unsupported regulated category | No generic price verdict | Route to an appropriate capability or professional-resource flow |
| Unusually low quote | Risk and omission review | Verify scope, license, insurance, warranty, and change-order terms |
| High quote with incomplete scope | No negotiation conclusion yet | Clarify scope before price negotiation |
| Two quotes with different scope | “Not comparable yet” | Normalize or request revised proposals |
| Two comparable quotes | Trade-off comparison | Shortlist, clarify, or select |
| No proposal is ready | No recommendation | Request revisions or decline |
| Homeowner accepts | Decision and terms recorded | Book/contact provider or create project |
| Homeowner rejects | Decision and reason recorded | Archive or seek another quote |
| Homeowner defers | Pending state with optional reminder | Resume later |
| Quote deleted | Quote and dependent draft state removed safely | Confirm deletion |
| Contextual launch without a quote | Quote-preparation experience | Request/upload a quote; do not run a verdict |
| Home with no active service decision | No permanent primary Radar card | Discover contextually |
| Active quote decision on Home | Outcome-specific action card | Resume exact pending stage |

---

## 15. Testing Strategy

### 15.1 Unit

Cover:

- evidence-level rules;
- verdict eligibility;
- benchmark selection;
- freshness and source health;
- currency conversion dates and support;
- category safety gates;
- scope completeness;
- quote comparability;
- low-quote risk behavior;
- action eligibility;
- completion semantics.

### 15.2 Integration

Cover:

- benchmark ingestion and review;
- source activation and rollback;
- quote extraction and homeowner confirmation;
- workspace state transitions;
- authorization and property ownership;
- idempotent creation and submission;
- edit and delete behavior;
- evidence snapshot immutability;
- timeline and booking handoffs;
- framework completion.

### 15.3 Browser acceptance

Cover:

- upload and manual entry;
- planning estimate;
- incomplete quote;
- qualified comparison;
- degraded and stale sources;
- unsupported category;
- one and multiple quotes;
- clarification and negotiation;
- decision and finalized terms;
- returning states;
- contextual launch;
- Home placement;
- desktop, tablet, and mobile;
- keyboard-only and screen-reader flows.

### 15.4 Operational

Cover:

- source outage;
- late or malformed import;
- stale-data cutoff;
- erroneous benchmark rollback;
- category disable switch;
- provider handoff disable switch;
- alerting and audit trail;
- schema reconciliation validation.

### 15.5 Current verification baseline

At audit time:

- the backend phase-four benchmark test passes two narrow benchmark-matching tests;
- the focused frontend UI helper suite has five passing tests and one failing test;
- the failure reflects a real contract conflict: the test expects truthful fallback-assumption wording while the current UI emits “regional pricing data”;
- no complete Service Quote Decision browser acceptance suite was found.

This baseline is not sufficient for launch confidence.

---

## 16. Success Measures

### 16.1 Primary outcome measures

- percentage of active quote decisions reaching an explicit outcome;
- percentage of accepted decisions with final scope and terms recorded;
- median time from quote intake to informed decision;
- percentage of incomplete proposals that receive clarification;
- percentage of multi-quote decisions with confirmed comparable scope;
- percentage of completed work with actual final cost recorded voluntarily.

### 16.2 Quality measures

- qualified benchmark coverage by category and geography;
- benchmark freshness compliance;
- percentage of verdicts with complete provenance;
- scope extraction confirmation rate;
- comparison eligibility rate;
- homeowner override rate;
- recommendation regret or dispute signal;
- final-price variance from accepted quote;
- change-order frequency after missing-scope warnings.

### 16.3 Guardrails

- zero qualified verdicts from heuristic-only evidence;
- zero completion events from check generation;
- zero direct booking urgency from unusually low price;
- zero unsupported regulated-category verdicts;
- zero “recommended” quotes without comparison eligibility;
- zero stale or unhealthy source use;
- no derived internal benchmark below privacy and minimum-cohort thresholds.

### 16.4 Experience measures

- homeowner can identify the feature purpose in usability testing;
- homeowner can explain why the conclusion was reached;
- homeowner can identify the most important missing term;
- homeowner can find edit, delete, clarify, compare, and decide controls;
- Home card engagement is measured only when an active service-decision trigger exists;
- reduction in abandoned quote-decision journeys.

---

## 17. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| External benchmark data is sparse | Low coverage | Provide honest planning value and scope review without a verdict |
| Benchmarks compare unlike work | Misleading price conclusion | Normalize scope and require eligibility gates |
| Low quote is interpreted as a bargain | Unsafe provider decision | Treat unusually low price as a verification signal |
| Tool implies provider quality | Commercial and trust risk | Separate price evidence from provider verification and disclose provider handoffs |
| Regulated categories receive generic advice | Legal and homeowner harm | Remove or route categories and apply reviewed boundaries |
| Fragmented tools persist | Low completion and duplicate data | Enforce one canonical journey and workspace |
| More required detail increases friction | Abandonment | Use document extraction, progressive disclosure, and explain why each fact matters |
| Derived internal data becomes self-referential | Biased benchmarks | Use only verified completed outcomes with governance and minimum cohorts |
| Historical heuristic records conflict with target schema | Implementation complexity | No-user constraint permits clean replacement without migration |
| Home promotion becomes noise | Feature fatigue | Show only for active, relevant decisions |

---

## 18. Definition of Done

Service Price Radar and its outcome family are complete when:

- the canonical homeowner outcome is Service Quote Decision;
- heuristic-only estimates cannot produce market-validity verdicts;
- every qualified verdict has current, reviewed, visible provenance;
- quote scope and material terms are structured and homeowner-confirmed;
- comparison recommendations require comparable proposals;
- unusually low quotes trigger verification, not urgency;
- regulated and high-risk categories follow explicit safety boundaries;
- the feature is classified material financial;
- a check is not counted as a completed decision;
- comparison, clarification, negotiation, finalization, and booking work as one journey;
- homeowners can edit, delete, clarify, defer, accept, reject, and close;
- accepted terms and decision reason are preserved;
- Home placement is contextual and outcome-specific;
- degraded, unsupported, stale, and empty states are honest and useful;
- accessibility and responsive acceptance passes;
- end-to-end outcome and evidence-quality analytics exist;
- the schema is reconciled directly without migration scripts;
- functional, framework, QA, and operational documentation agree.

---

## 19. Recommended Immediate Next Step

Begin with **Slice 0 — Truth, safety, and completion containment**.

This slice should be implemented before benchmark expansion or visual redesign because it:

- removes the most consequential misleading claims;
- prevents unsafe low-price actions;
- aligns completion with the actual homeowner outcome;
- corrects the framework contract;
- establishes the language and behavior that every later slice must preserve.

After Slice 0, implement the qualified benchmark and quote-scope foundations before presenting a redesigned “best-in-class” result. A more polished verdict without better evidence would increase, rather than reduce, product risk.

