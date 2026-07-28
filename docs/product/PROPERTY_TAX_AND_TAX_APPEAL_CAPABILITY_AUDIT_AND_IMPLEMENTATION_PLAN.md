# Property Tax and Tax Appeal Capability Audit and Implementation Plan

**Capabilities:** 21.4 Property Tax and Tax Appeal  
**Audit framework:** `CAPABILITY_OUTCOME_AND_EXPERIENCE_AUDIT_FRAMEWORK.md`  
**Audit date:** July 27, 2026  
**Status:** Implementation in progress — Slices 0–1 complete
**Recommended disposition:** **Consolidate and rebuild**  
**Current safety classifications:** Property Tax — material financial; Tax Appeal — low consequence  
**Recommended safety classification:** Material financial and jurisdiction-dependent for the complete outcome family  
**Primary outcome family:** Property Tax Understanding, Savings, and Appeal

---

## 1. Executive Decision

Property Tax and Tax Appeal are not separate homeowner jobs. They are stages of one outcome:

> Help me understand my property-tax assessment and bill, identify a legitimate savings or correction opportunity, and complete the right action before the applicable deadline.

The current implementation divides that outcome between:

- a property-scoped Property Tax estimate route; and
- a global Tax Appeal Assistant route.

The split creates duplicate setup, conflicting framework contracts, broken handoffs, and no durable outcome.

The Property Tax route is not currently a reliable tax-intelligence product. Its default annual tax is derived from state-level rate and price-per-square-foot heuristics. The displayed history is reconstructed backward from the current estimate using a fixed growth rate. City, county, and state “medians” are fixed percentages of that same estimate, so the comparison does not represent observed jurisdiction data. A user-provided value for either the assessment or rate can raise overall confidence to high even when the other input remains heuristic.

The Tax Appeal route creates more consequential trust risk. It:

- derives estimated market value from homeowner-entered values and unverified comparable prices;
- converts those inputs into an “appeal probability” and “confidence” score;
- uses a small static state-deadline table labeled as sample data;
- does not model local assessment ratios, valuation dates, classifications, exemptions, equalization, appeal grounds, forms, or evidentiary standards;
- generates an appeal letter with placeholders;
- labels the letter “Ready to Submit”;
- does not create, submit, track, or complete an appeal case.

The repository does contain a stronger data foundation: a reviewed tax-assessor ingestion pipeline with jurisdiction coverage, address matching, source validation, provenance, source health, and Home Event Radar observations. That pipeline is currently disconnected from both Property Tax and Tax Appeal. Its reviewed production-shaped coverage is deliberately limited to a Bronx Tax Class 1 pilot.

The recommended disposition is **consolidate and rebuild**:

1. create one property-scoped **Property Tax Center**;
2. use official, reviewed jurisdiction data when coverage exists;
3. clearly distinguish a real assessment, a homeowner-confirmed bill, and a rough planning estimate;
4. make exemption, correction, and appeal paths progressive stages;
5. remove fabricated historical and peer-comparison claims;
6. remove appeal probability and unsupported confidence;
7. source deadlines, rules, forms, and official links by jurisdiction and effective date;
8. let AI extract and draft only after homeowner confirmation and reviewed rule grounding;
9. create a durable appeal case, evidence packet, checklist, deadline, and outcome;
10. show Home actions only for material changes, filing windows, missing evidence, or active cases.

The target promise should be:

> Understand what changed, verify that the assessment and exemptions are correct, and prepare the right jurisdiction-specific next step before the deadline.

### 1.1 Implementation constraint

There are no real users and no production data migration requirement.

Implementation may modify the Prisma schema directly. It must not create:

- database migration scripts;
- historical backfills;
- compatibility layers for the old estimate or appeal report shape;
- dual-write behavior;
- persistence solely to preserve current generated reports;
- legacy route behavior that has no target-product value.

The user will reconcile the database separately after schema changes.

This constraint should be used to create a clean canonical tax record and case workflow instead of preserving the two current partial models.

---

## 2. Scope

### 2.1 In scope

This audit covers:

- Property Tax estimate service, route, API adapter, and UI;
- Tax Appeal extraction, analysis, generated letter, route, and UI;
- tax-assessor source configuration, ingestion, normalization, and reviewed pilot;
- Home Event Radar tax observations and handoffs;
- Property Context and Financial Context use;
- capability definitions, safety, readiness, placement, and completion;
- assessment, bill, exemption, correction, appeal, and outcome lifecycle;
- source provenance, jurisdiction rules, deadlines, and failure behavior;
- privacy, AI use, authorization, validation, and operations;
- accessibility, responsive behavior, analytics, testing, and documentation;
- overlap with True Cost, Cost Growth, Cost Volatility, Renovation Advisor, Home Event Radar, documents, and Home Timeline.

### 2.2 Out of scope

This document does not:

- provide legal or tax advice;
- validate a live jurisdiction’s current filing deadline;
- select a nationwide commercial property-data provider;
- authorize automated filing with a government authority;
- define a database migration;
- implement the recommended slices.

### 2.3 Evidence reviewed

The assessment is based on repository evidence, including:

- the capability audit framework;
- current capability inventory and route-merge map;
- strategic and pre-launch audits;
- Property Tax backend service, controller, route, DTO, and frontend;
- Tax Appeal backend service, routes, frontend, and API use;
- tax-assessor adapters, source configuration, ingestion job, and normalizer;
- reviewed Bronx pilot configuration;
- Home Event Radar tax action registry and documentation;
- Property Context and Financial Context artifacts;
- Prisma source configuration;
- available backend and worker tests.

No dedicated domain FRD currently governs the combined Property Tax and Tax Appeal outcome family.

---

## 3. Homeowner Job and Target Outcome

### 3.1 Primary homeowner job

> When I receive an assessment, reassessment notice, or property-tax bill, help me understand what changed, verify the facts and exemptions, determine whether action is warranted, and complete the correct jurisdiction-specific step on time.

### 3.2 Secondary homeowner jobs

- Estimate property taxes while budgeting for ownership.
- Track official assessment and bill changes over time.
- Understand the difference between market value, assessed value, taxable value, and tax due.
- Identify missing exemptions or caps.
- correct parcel, classification, area, improvement, or ownership errors;
- Evaluate whether an informal review or formal appeal is worth pursuing.
- Gather credible comparable and condition evidence.
- Prepare the official forms, attachments, and letter.
- Track filing, hearing, determination, refund, and next-year effects.
- Preserve tax records in the Home Record and timeline.

### 3.3 Triggering situations

The family is contextually relevant when:

- a new assessment or reassessment is detected;
- assessed value changes materially;
- a new tax bill is uploaded;
- a due date or filing deadline is approaching;
- property facts conflict with the assessor record;
- an expected exemption is missing;
- a renovation may trigger reassessment;
- an appeal case is in progress;
- a determination or refund is received;
- the homeowner explicitly wants a purchase-planning estimate.

### 3.4 Current delivered outcomes

Property Tax currently delivers:

- a heuristic annual and monthly estimate;
- synthetic historical trend;
- 5-, 10-, and 20-year projections;
- synthetic local/state comparisons;
- generalized drivers;
- generalized next-step copy.

Tax Appeal currently delivers:

- AI extraction of a bill;
- homeowner-editable bill fields;
- optional homeowner market estimate;
- optional user-entered comparable sales;
- appeal probability and confidence;
- estimated savings;
- generated reasons and recommendations;
- a generated appeal letter;
- a static deadline and process summary.

Neither capability completes the outcome.

### 3.5 Target best-in-class outcome

The target outcome is:

> The homeowner has a verified view of the relevant assessment and bill, knows which facts or benefits may be wrong or missing, understands the applicable deadline and evidence standard, and either records no action or advances a complete, jurisdiction-qualified correction, exemption, or appeal case.

The journey should leave the homeowner with:

- an official or homeowner-confirmed tax record;
- clear source and match confidence;
- a plain-language change explanation;
- verified parcel and classification facts;
- exemption/cap status;
- official deadline and source;
- appeal or correction grounds separated by type;
- evidence readiness;
- a cost/benefit decision without fake probability;
- official forms and links;
- an editable evidence-grounded letter when relevant;
- a filing checklist and status;
- a recorded outcome and realized savings when known.

---

## 4. Outcome-Family Consolidation

### 4.1 Current fragmentation

| Current surface | Current responsibility | Gap |
|---|---|---|
| Property Tax | Estimate, trend, comparisons, drivers | Primarily heuristic; no official tax record or action lifecycle |
| Tax Appeal | Bill extraction, opportunity score, draft letter | Unverified inputs, static rules, no case or filing lifecycle |
| Home Event Radar | Detect reviewed assessment changes | Stronger source foundation, but disconnected from tax pages |
| Document Vault | Store tax bills and notices | Upload in appeal flow is transient and not connected to a durable tax record |
| True Cost / Cost Growth / Volatility | Reuse tax estimate | Can propagate the heuristic into other financial outputs |
| Renovation Advisor | Estimate reassessment implications | Uses separate national assumptions and does not update the tax record |

### 4.2 Recommended canonical experience

Create one property-scoped route:

`/dashboard/properties/[id]/tools/property-tax`

The route should progressively expose:

1. **Overview**
2. **Assessment and bill**
3. **Changes**
4. **Exemptions and caps**
5. **Review or correct**
6. **Appeal case**
7. **Outcome and history**

The existing global `/dashboard/tax-appeal` route should resolve the selected property and redirect to:

`/dashboard/properties/[id]/tools/property-tax?mode=appeal`

The mode parameter must select a real stage. It must not be a cosmetic or unimplemented query parameter.

### 4.3 Canonical responsibility map

| Responsibility | Canonical owner |
|---|---|
| Parcel, assessment, bill, tax-year history | Property Tax Center |
| Official source match and change signal | Tax-assessor pipeline |
| Uploaded notice and bill | Document Vault linked to tax record |
| Exemption and cap review | Property Tax Center |
| Correction or informal review | Property Tax case stage |
| Formal appeal preparation and tracking | Property Tax case stage |
| Market and comparable evidence | Qualified evidence service / homeowner-confirmed records |
| Renovation reassessment scenario | Renovation Advisor, linked to Property Tax |
| Total ownership-cost consumption | True Cost and financial tools read canonical tax data |
| Timeline | Home Timeline receives material events and outcomes |

### 4.4 Why consolidation is mandatory

Improving both routes independently would preserve:

- duplicate setup;
- incompatible safety classifications;
- duplicate explanations;
- separate source contexts;
- no durable transition from detected change to appeal;
- no single tax-year history;
- no canonical completion;
- navigation and Home clutter.

The framework explicitly selected this pair as a natural outcome-family consolidation pilot. The repository route-merge map already recommends the same direction.

---

## 5. Current Strengths

### 5.1 High-value homeowner outcome

Property tax is a material recurring ownership cost. Detecting an error, preserving an exemption, or completing a valid appeal can create measurable savings and a clear reason to return.

### 5.2 Property-scoped estimate authorization

The Property Tax estimate uses authentication, homeowner restriction, rate limiting, and property authorization.

### 5.3 Homeowner review of extracted bill

The appeal wizard does not silently trust OCR output. It asks the homeowner to review and edit assessed value, rate, year, parcel, size, and property type.

This confirmation pattern should be retained and strengthened with field confidence and source evidence.

### 5.4 Reviewed tax-assessor ingestion foundation

The repository contains a substantially stronger source subsystem than the homeowner tools currently use:

- per-jurisdiction configuration;
- coverage normalization;
- approved field mappings;
- validated identifiers and filters;
- bounded requests and timeout;
- source status and health;
- address and parcel-match controls;
- ambiguous-match suppression;
- dry-run support;
- source provenance;
- assessment date policy;
- official appeal URL and disclaimer controls;
- durable canonical Radar observations;
- worker execution policy and cron controls.

### 5.5 Honest pilot constraint

The reviewed tax source is explicitly constrained to NYC Department of Finance Bronx Tax Class 1. Its configuration states that assessment values are not sale prices and that filing windows must be confirmed officially.

That is the correct trust pattern for jurisdiction expansion.

### 5.6 Useful UX primitives

The current UIs contain reusable pieces:

- property identity;
- editable inputs;
- data and assumptions section;
- Property Context capture;
- document upload;
- step progress;
- comparable entry;
- result cards;
- generated letter;
- error and loading states.

The issue is not absence of UI. It is the truth and completion contract behind it.

### 5.7 Existing source tests

The source adapter and ingestion path have meaningful automated coverage for:

- configuration validation;
- safe query construction;
- ambiguity suppression;
- timeouts;
- routing and caching;
- dry run;
- source health;
- event normalization;
- appeal context.

That quality should be extended into the homeowner outcome.

---

## 6. Audit Scorecard

| Dimension | Weight | Score | Assessment |
|---|---:|---:|---|
| Homeowner value and differentiation | 20 | 14 | High-value recurring cost and measurable savings potential |
| Functional completeness | 20 | 7 | Estimate and draft exist, but no canonical assessment, exemption workflow, case, filing, or outcome |
| Actionability and closed loop | 15 | 4 | Primary contest action is not wired; generated letter is the endpoint |
| Data quality, trust, and provenance | 15 | 3 | Strong isolated source pipeline, but homeowner outputs remain heuristic or user-supplied |
| UX, readiness, and accessibility | 15 | 8 | Multi-step flows and disclosures exist, but claims, hierarchy, mobile density, and controls need redesign |
| Product-framework integration | 10 | 4 | Property Tax safety is closer to correct; Tax Appeal safety, completion, route, and activation are not |
| Reliability and automated evidence | 5 | 3 | Good source tests; nearly no calculator, appeal, API, persistence, or browser outcome tests |
| **Total** | **100** | **43** | **Strong outcome potential and source foundation, but current homeowner conclusions are not decision-grade** |

### 6.1 Disposition override

The following launch-blocking defects require consolidation and rebuild rather than incremental polish:

- synthetic history presented as prior-year trend;
- synthetic city/county/state medians presented as comparison;
- appeal guidance generated from values that may not be legally comparable;
- appeal probability increased by homeowner opinion;
- static sample deadlines presented as important deadlines;
- generic letter labeled ready to submit;
- no source-backed jurisdiction workflow;
- no durable case or completion;
- tax-assessor pipeline disconnected from both tools.

---

## 7. Homeowner Question Contract Assessment

| Homeowner question | Current answer | Gap | Target answer |
|---|---|---|---|
| What is this? | Tax intelligence or AI appeal assistant | Two tools describe one outcome | “Understand your assessment and bill, check savings opportunities, and complete the right action.” |
| How will this benefit me? | Forecast taxes or reduce taxes | Forecast may be synthetic; savings may be unsupported | Explain bill changes, preserve exemptions, correct errors, and prepare a valid appeal |
| What should I add? | Optional overrides, bill, market estimate, comps, notes | Does not distinguish essential official evidence from opinion | Exact missing record, deadline, exemption, parcel fact, or evidence and why it matters |
| What should I care about? | Estimate, percentile, appeal probability, savings | Several metrics are fabricated or legally incomplete | Official assessment stage, taxable value, exemptions, change, deadline, grounds, and evidence |
| What can I control? | Override inputs, upload, copy letter | Cannot save case, verify sources, mark filed, track response, or record outcome | Confirm, correct, apply, appeal, defer, dismiss, upload, file externally, track, and close |
| Why should I trust this? | Confidence badges and AI extraction | Confidence rewards user input; deadlines and comparisons lack official provenance | Official source, match method, tax year, valuation date, rule version, and evidence readiness |
| What should I do next? | Generalized card copy or “Ready to Submit” letter | Primary contest button is inert; action skips forms and jurisdiction requirements | One safe, official, jurisdiction-specific next step |
| When am I done? | Estimate generated or plan created | No appeal plan/case completion exists | No action recorded, exemption/correction completed, appeal filed, or determination recorded |

---

## 8. Product Framework Conformance

### 8.1 Current contracts

#### Property Tax

- outcome: `SAVE_OPTIMIZE`;
- safety: material financial;
- completion: `OUTPUT_GENERATED`;
- mode: catalog only;
- route: property-scoped.

#### Tax Appeal

- outcome: `PLAN_BUDGET`;
- safety: low consequence;
- completion: `PLAN_CREATED`;
- mode: catalog only;
- route: global.

### 8.2 Contract defects

#### Duplicate capability identity

One homeowner outcome is registered twice, with different:

- outcome categories;
- safety tiers;
- completion kinds;
- route scopes;
- navigation destinations.

#### Safety

Tax Appeal is not low consequence. Incorrect deadlines, grounds, evidence, requested value, or filing instructions can cause financial loss or missed rights.

The combined family should be:

- material financial;
- jurisdiction-dependent;
- sensitive;
- professionally bounded.

#### Completion

An estimate or generated letter is not completion.

Meaningful completion is:

- assessment reviewed and no action recorded;
- exemption application started or completed;
- correction/informal review requested;
- appeal filed;
- hearing or determination recorded;
- case closed with outcome.

#### Activation

Catalog-only placement misses the strongest contextual moments:

- official reassessment detected;
- material value increase;
- filing deadline approaching;
- missing expected exemption;
- renovation reassessment;
- active case deadline or response.

The target capability should be contextual canonical and remain catalog-discoverable.

#### Readiness

Current Property Context treats missing tax facts as nonblocking enhancements, allowing default-backed results. That is acceptable only for an explicitly labeled purchase-planning range.

Assessment review and appeal require:

- parcel match;
- jurisdiction coverage;
- assessment stage;
- tax year and valuation date;
- assessed and taxable values;
- classification;
- applicable ratio/equalization;
- exemption state;
- official deadline;
- evidence appropriate to the permitted appeal grounds.

#### Commercial and professional boundary

If future appeal services, appraisers, attorneys, agents, or filing partners are introduced, the capability will require explicit commercial disclosure and provider-selection governance.

### 8.3 Recommended single capability contract

| Field | Recommended value |
|---|---|
| Capability | Property Tax Center |
| Outcome | Save / optimize with action workflow |
| Safety | Material financial + jurisdiction-dependent |
| Privacy | Sensitive |
| Activation | Contextual canonical, catalog discoverable |
| Trigger | Assessment change, bill/notice, exemption signal, filing window, renovation impact, or explicit homeowner intent |
| Safe partial value | Terminology, document organization, and official links; no appeal-strength conclusion |
| Completion | Review decision, application/correction/appeal filed, or case outcome recorded |
| Route | `/dashboard/properties/[id]/tools/property-tax` |
| Accepted context | Property, parcel, document, tax event, project, renovation, home action, journey |
| Output entity | Tax record and tax action case |

### 8.4 Home placement

Do not show a permanent Property Tax or Tax Appeal card merely because the capability exists.

Show a Home action when:

- a new assessment was matched;
- a material change needs review;
- an expected exemption is missing;
- a filing deadline is approaching;
- an appeal case needs evidence, filing, hearing, or response;
- a determination or refund needs recording.

Home copy should be specific:

- “Your 2027 assessed value increased 14.2%”
- “Confirm whether your primary-residence exemption is applied”
- “Appeal filing window closes in 12 days”
- “Add two missing documents before filing”
- “Record the assessor’s determination”

Do not show:

- heuristic percentile alerts;
- general “taxes may increase” urgency;
- a card based solely on synthetic growth.

---

## 9. Data, Jurisdiction, and Trust Assessment

### 9.1 Property Tax estimate defects

The default estimate:

- infers assessed value from state-level price per square foot;
- infers rate from a state-level effective rate;
- uses a generic fallback for unsupported states;
- generates historical years by reversing a fixed growth rate;
- generates future years from that same fixed growth rate;
- derives state median as 85% of the current estimate;
- derives county median as 95%;
- derives city median as 90%;
- derives percentile from the resulting fixed ratio;
- uses hard-coded ZIP-prefix growth messages.

These outputs should not be described as:

- historical taxes;
- city/county comparisons;
- observed percentile;
- current local tax intelligence.

### 9.2 Confidence defect

If the homeowner supplies either assessed value or tax rate, the service can mark the full result high confidence while the other component remains estimated.

Confidence must be dimensioned:

- parcel match;
- assessment value;
- taxable value;
- rate/millage;
- bill amount;
- exemption status;
- tax year;
- source freshness.

User input may be confirmed, unverified, or document-supported. It is not automatically high-confidence official evidence.

### 9.3 Assessment versus market value

The appeal engine subtracts an estimated market value directly from assessed value.

That comparison is not universally valid. Jurisdictions may use:

- assessment ratios;
- equalization ratios;
- taxable-value formulas;
- acquisition-value systems;
- classification;
- caps;
- exemptions;
- valuation dates;
- different appeal standards.

The engine must not determine overassessment until the jurisdiction’s valuation model and allowed grounds are known.

### 9.4 Comparable evidence defects

Current comparable analysis:

- accepts user-entered address, price, and date;
- does not verify the sale;
- does not validate arms-length status;
- does not normalize to the statutory valuation date;
- does not adjust for size, lot, type, condition, location, quality, or improvements;
- averages prices directly;
- increases confidence by count;
- treats a homeowner market estimate as positive evidence.

The target should classify each comparable:

- official verified sale;
- reviewed external record;
- homeowner-provided lead;
- disqualified;
- needs adjustment.

### 9.5 Appeal probability is unsupported

The current score is a deterministic rubric, not a calibrated probability of appeal success.

It should be removed.

Replace it with:

- jurisdiction coverage;
- deadline status;
- permitted grounds;
- evidence readiness;
- factual conflicts;
- estimated tax-at-stake range;
- explicit unknowns;
- cost/effort considerations.

### 9.6 Savings estimate defects

Savings are calculated as:

> alleged overassessment × tax rate × three years

This assumes:

- the requested value is valid;
- the appeal succeeds fully;
- the rate remains stable;
- the result applies for three years;
- no caps, ratios, exemptions, or annual reassessment alter the result;
- there are no fees or costs.

The target should show a bounded tax-at-stake scenario, not promised savings.

### 9.7 Deadline and process defects

The code labels its state map as sample data. It includes only six states and a generic fallback, while many deadlines vary by:

- county;
- municipality;
- assessment notice date;
- mailing date;
- annual calendar;
- property class;
- informal versus formal stage;
- exemption or correction type.

No deadline should be shown as authoritative without:

- official source URL;
- jurisdiction identifier;
- rule effective date;
- reviewed timestamp;
- calculation inputs;
- timezone;
- qualification;
- operator-controlled disable.

### 9.8 Generated letter defects

The letter can contain:

- placeholder identity;
- placeholder county and address;
- unverified requested value;
- unverified comparables;
- unsupported reasons;
- no official form references;
- no required declaration, signature, attachment, or service instructions.

It must not be labeled “Ready to Submit.”

AI may draft an editable narrative only after:

- evidence is confirmed;
- jurisdiction rules are loaded;
- the official filing vehicle is identified;
- unsupported claims are excluded;
- the homeowner reviews the final packet.

### 9.9 AI extraction and privacy

The upload flow:

- sends tax-bill content to an external AI provider;
- parses free-form JSON without a schema contract;
- does not expose field-level extraction confidence;
- does not clearly explain provider processing or consent;
- does not connect the document to the Vault or a durable tax record;
- does not preserve extraction provenance;
- can return server errors for AI configuration or malformed output.

The target requires:

- reviewed consent and privacy copy;
- secure document persistence or explicit transient mode;
- structured extraction schema;
- field confidence and bounding boxes where available;
- homeowner confirmation;
- model/version provenance;
- safe degraded manual entry.

### 9.10 Source-pipeline disconnect

The reviewed source pipeline already carries:

- assessed values;
- prior assessed value;
- tax year;
- assessment stage;
- match confidence and method;
- provider URL;
- official appeal URL;
- disclaimer.

Property Tax and Tax Appeal do not consume it.

This is the most important near-term integration opportunity.

### 9.11 Coverage limits

The currently reviewed pilot covers:

- New York City;
- Bronx;
- Tax Class 1;
- a specific Department of Finance assessment dataset and filter.

Outside reviewed coverage:

- no official assessment conclusion should be implied;
- no official deadline should be generated;
- no appeal-strength result should be produced;
- the experience should offer bill upload, manual confirmation, terminology, and official assessor discovery.

---

## 10. Prioritized Gap Register

### PTA-001 — Synthetic history is presented as historical trend

**Priority:** P0  
**Type:** Product truth  

**Recommendation**

- Remove generated prior-year history from the homeowner UI.
- Show only official or homeowner-confirmed historical records.
- Label planning projections separately.

**Acceptance**

- No derived reverse-growth series is labeled past taxes.

### PTA-002 — Synthetic medians and percentile drive action copy

**Priority:** P0  
**Type:** Product truth / decision quality  

**Recommendation**

- Remove current city, county, state median, and percentile outputs.
- Restore comparisons only from qualified cohort data with scope and source.

**Acceptance**

- No appeal or review action is triggered by a self-derived comparison.

### PTA-003 — Appeal probability and confidence are unsupported

**Priority:** P0  
**Type:** Material financial trust  

**Recommendation**

- Remove probability terminology and current scoring.
- Do not reward homeowner opinion or unverified comp count as confidence.
- Replace with evidence readiness and jurisdiction qualification.

**Acceptance**

- The UI cannot state a probability of success without an independently validated model and governance approval.

### PTA-004 — Assessed value is compared directly with market value without jurisdiction rules

**Priority:** P0  
**Type:** Jurisdiction correctness  

**Recommendation**

- Require jurisdiction valuation model, assessment stage, ratio/equalization, classification, and valuation date.
- Fail closed when these are unknown.

**Acceptance**

- Overassessment cannot be calculated unless values are legally comparable for the relevant jurisdiction and year.

### PTA-005 — Deadlines and processes are static sample content

**Priority:** P0  
**Type:** Legal/timing safety  

**Recommendation**

- Replace static state strings with reviewed jurisdiction rule records.
- Source every deadline and official filing instruction.
- Add disable, expiry, review, and escalation controls.

**Acceptance**

- Every displayed deadline has an official source, effective rule, calculated basis, and review status.

### PTA-006 — “Ready to Submit” letter is not submission-ready

**Priority:** P0  
**Type:** Trust / actionability  

**Recommendation**

- Relabel current output as an unverified draft or disable it.
- Generate narratives only from confirmed evidence and reviewed rules.
- Identify official forms and unresolved placeholders.

**Acceptance**

- A packet cannot be called ready while required identities, forms, evidence, signatures, or instructions are missing.

### PTA-007 — Tax-assessor data is disconnected from homeowner tools

**Priority:** P0  
**Type:** Data architecture  

**Recommendation**

- Create a canonical assessment record from reviewed source observations.
- Link Radar events, tax overview, and appeal readiness to the same record.

**Acceptance**

- A reviewed official assessment appears with source, tax year, stage, match confidence, and official link in the Property Tax Center.

### PTA-008 — Property Tax and Tax Appeal are duplicate capabilities

**Priority:** P0  
**Type:** Product architecture  

**Recommendation**

- Register one Property Tax Center.
- Redirect the global appeal route to its appeal stage.
- Remove duplicate catalog entries and completion semantics.

**Acceptance**

- One capability owns the tax outcome and one route preserves all context.

### PTA-009 — No durable tax record or case lifecycle

**Priority:** P0  
**Type:** Functional completeness  

**Recommendation**

- Add canonical parcel, assessment, bill, exemption, action case, evidence, deadline, filing, and outcome records.

**Acceptance**

- A homeowner can resume a tax action and record its result across sessions.

### PTA-010 — Override confidence is incorrect

**Priority:** P0  
**Type:** Trust  

**Recommendation**

- Track confidence and source per field.
- Treat manual input as homeowner-reported until confirmed by document or official source.

**Acceptance**

- One override cannot make an otherwise heuristic result high confidence.

### PTA-011 — Input and extraction validation are incomplete

**Priority:** P1  
**Type:** Reliability / security  

**Recommendation**

- Add strict route schemas, bounds, dates, percentage units, address/parcel checks, and structured extraction validation.
- Add rate limiting and normalized error responses to Tax Appeal routes.

**Acceptance**

- Malformed, missing, impossible, or non-finite values cannot reach analysis.

### PTA-012 — AI document processing lacks a complete trust contract

**Priority:** P1  
**Type:** Privacy / AI governance  

**Recommendation**

- Add provider disclosure, consent, provenance, field confidence, confirmation, retention choice, and manual fallback.

**Acceptance**

- No extracted field becomes evidence without homeowner confirmation or qualified official match.

### PTA-013 — Comparable evidence is not qualified

**Priority:** P1  
**Type:** Evidence quality  

**Recommendation**

- Add verified sale sources, valuation-date normalization, comparability fields, adjustments, exclusions, and review status.

**Acceptance**

- Unverified homeowner comps are leads, not appeal evidence or confidence inputs.

### PTA-014 — Exemption and cap opportunities are only generalized copy

**Priority:** P1  
**Type:** Best-in-class functionality  

**Recommendation**

- Add jurisdiction-specific exemption catalog, eligibility questions, application links, deadlines, evidence checklist, and status.

**Acceptance**

- The product can distinguish potentially eligible, applied, approved, denied, missing, and unknown.

### PTA-015 — Appeal grounds are too narrow

**Priority:** P1  
**Type:** Functional completeness  

**Recommendation**

- Support reviewed jurisdiction-appropriate grounds such as factual error, classification, exemption, unequal assessment, and market-value challenge.
- Do not expose unavailable grounds.

**Acceptance**

- The case identifies the exact ground and evidence standard rather than a generic overassessment claim.

### PTA-016 — Primary actions do not complete a workflow

**Priority:** P1  
**Type:** UX / actionability  

**Recommendation**

- Wire “Contest your assessment” to the correct appeal-readiness stage.
- Add review, no-action, exemption, correction, informal review, appeal, file externally, hearing, and outcome actions.

**Acceptance**

- Every primary action has a destination, persistence effect, and completion evidence.

### PTA-017 — Source coverage and degradation are not visible

**Priority:** P1  
**Type:** UX / operations  

**Recommendation**

- Show official coverage, last checked, match confidence, source health, and manual fallback.
- Do not turn source absence into an estimate that appears equally authoritative.

**Acceptance**

- Homeowners can tell whether the result is official, document-confirmed, manually reported, or rough planning guidance.

### PTA-018 — Active tax changes are not canonically prioritized

**Priority:** P1  
**Type:** Product Framework / Home  

**Recommendation**

- Use Radar assessment events, deadlines, exemptions, and case states as reviewed contextual triggers.
- Suppress generic tax cards.

**Acceptance**

- Home shows a tax action only when a material reviewed state requires attention.

### PTA-019 — Analytics stop at generated output

**Priority:** P2  
**Type:** Measurement  

**Recommendation**

- Track review decision, evidence readiness, filing, determination, assessment reduction, exemption approval, refund, and realized savings.

**Acceptance**

- Product reporting distinguishes an estimate view from a completed tax outcome.

### PTA-020 — End-to-end automated evidence is absent

**Priority:** P1  
**Type:** Quality  

**Recommendation**

- Add calculator truth tests, jurisdiction gates, extraction tests, API/persistence tests, case lifecycle tests, browser acceptance, and accessibility acceptance.

**Acceptance**

- The complete acceptance matrix runs in CI.

### PTA-021 — Domain documentation is fragmented

**Priority:** P1  
**Type:** Documentation  

**Recommendation**

- Create one combined domain FRD after the disposition is approved.
- Reconcile framework, Radar, route, source, AI, privacy, operational, and UX documentation.

**Acceptance**

- One documented contract governs the complete tax outcome.

---

## 11. Target Experience

### 11.1 Entry hierarchy

The first screen should answer:

**What is this?**

> Review your latest assessment and property-tax bill, check for errors or missing benefits, and prepare the right next step.

**How can it help?**

> Understand changes, preserve exemptions, correct records, and organize an appeal when the evidence and deadline support it.

### 11.2 Overview states

#### Official source matched

> We matched your property to the Bronx 2027 current assessment roll.

Show:

- assessed value;
- prior value;
- change;
- tax year and stage;
- parcel;
- match method;
- source;
- observed date;
- official link.

#### Tax bill confirmed

> These values came from the bill you reviewed on July 27.

#### Planning estimate only

> We do not have a current official record for this jurisdiction. This rough estimate is for budgeting, not appeal analysis.

#### No data

> Add a bill or open the official assessor site. We will not guess whether you should appeal.

### 11.3 Explain the bill

Separate:

- market value;
- assessed value;
- equalized/ratio-adjusted value;
- taxable value;
- exemptions;
- rate or millage;
- line-item levies;
- annual bill;
- installments and due dates.

Only display fields relevant to the jurisdiction.

### 11.4 Explain what changed

Show observed changes, not synthesized trends:

- assessed value;
- taxable value;
- exemption;
- classification;
- rate;
- levy;
- bill;
- parcel facts.

Example:

> Your assessed value increased 14.2%, but the primary-residence exemption is still present. The official record does not yet include a final tax bill.

### 11.5 Savings and correction check

Rank safe opportunities:

1. assessor-record factual error;
2. missing exemption or cap;
3. classification error;
4. duplicate or parcel mismatch;
5. informal correction/review;
6. formal appeal ground;
7. no action.

### 11.6 Appeal readiness

Show:

**Jurisdiction coverage**

- official rules loaded;
- filing stage;
- deadline and source;
- available grounds.

**Evidence**

- confirmed notice;
- parcel and classification;
- valuation date;
- qualified comparables;
- condition evidence;
- factual discrepancies;
- required forms and attachments.

**Tax at stake**

Use a range based on jurisdiction rules and explicitly state that it is not guaranteed savings.

**Effort and uncertainty**

- filing fee if officially sourced;
- hearing expectation;
- missing evidence;
- professional-help boundary.

### 11.7 Decision

Allow:

- no action;
- monitor;
- correct assessor record;
- apply for exemption;
- request informal review;
- prepare appeal;
- get professional help;
- defer with reason.

### 11.8 Evidence packet

The packet should contain:

- official form or filing link;
- confirmed owner and parcel details;
- current notice;
- selected ground;
- evidence index;
- qualified comparable table;
- condition documents;
- requested correction/value;
- editable narrative;
- unresolved checklist;
- source and date.

It should be labeled:

- Draft;
- Needs review;
- Ready for homeowner review;
- Ready to file externally;
- Filed;
- Awaiting response;
- Hearing scheduled;
- Determined;
- Closed.

### 11.9 Outcome

Record:

- submitted date;
- filing method;
- confirmation number;
- hearing;
- determination;
- original and final assessment;
- refund/credit;
- annual recurring savings;
- next review year;
- attached determination;
- Home Timeline event.

---

## 12. Recommended Implementation Sequence

### Slice 0 — Truth, safety, and route containment

**Goal:** Stop unsupported homeowner conclusions and unify entry.

**Implementation status (July 27, 2026): Complete**

- Removed synthetic property-tax history, peer medians, percentile claims, and conclusions derived from them.
- Replaced the legacy appeal analysis with a rules-not-verified readiness response that cannot claim probability, savings, deadlines, or a submission-ready packet.
- Removed the legacy Tax Appeal Assistant UI.
- Corrected mixed manual/heuristic input confidence and stopped estimate loading from emitting workflow completion.
- Consolidated capability registration, catalog placement, legacy routing, and Radar handoffs into the property-scoped Property Tax Center and its `mode=appeal` stage.
- Updated downstream cost tools so they hold the current planning estimate constant instead of consuming fabricated tax history.

**Work**

- Remove synthetic history, medians, percentile, and action copy.
- Remove appeal probability and current confidence score.
- Remove “Ready to Submit.”
- Replace static deadlines with “confirm with official assessor” until qualified rules exist.
- Correct manual-override confidence.
- Wire the contest action to a safe readiness stage or remove it.
- Reclassify Tax Appeal as material financial and jurisdiction-dependent.
- stop completion on estimate/report generation;
- register one canonical Property Tax Center.
- redirect the global appeal route with property and mode context.

**Dependencies:** None  
**Exit criterion:** No unsupported comparison, probability, deadline, savings promise, or submission claim remains.

### Slice 1 — Canonical parcel, assessment, and bill record

**Goal:** Establish one durable source of tax truth per property and tax year.

**Implementation status (July 27, 2026): Complete**

- Added canonical jurisdiction, parcel match, assessment, bill, field-evidence, supersession, and document-link models directly to `schema.prisma`.
- Added homeowner-reported record intake with property authorization, bounded validation, tax-year identity, and durable field provenance.
- Added reconciliation that returns unknown, known, or conflicted per field; differing active observations remain visible and no winner is selected automatically.
- Added the Property Tax Center record API and canonical UI states for official, document-confirmed, document-unconfirmed, homeowner-reported, conflicted, and unknown records.
- Kept planning estimates separate from persisted canonical records.
- Validated and regenerated Prisma artifacts without adding a migration; the user must reconcile the database separately.

**Work**

- Add parcel identity and match state.
- Add assessment stage, valuation date, tax year, assessed/taxable values, land/improvement values, classification, ratios, exemptions, rates, bill, and due dates.
- Add field-level source and confidence.
- Link documents and official source observations.
- Reconcile source, document, and homeowner-confirmed values.
- Preserve conflicts instead of silently selecting a winner.

**Dependencies:** Slice 0  
**Exit criterion:** Property Tax Center can display an official, document-confirmed, homeowner-reported, or unknown record without conflating them.

### Slice 2 — Connect reviewed tax-assessor ingestion

**Goal:** Turn the existing source foundation into homeowner value.

**Implementation status (July 27, 2026): Complete**

- Persisted accepted official-source matches as idempotent jurisdiction, parcel, assessment, and field-evidence records before Radar enqueue.
- Added a durable Radar provider-event link on each canonical assessment and included the canonical assessment ID in Radar revision evidence.
- Preserved adapter-level ambiguous-row suppression and added a second write-boundary confidence guard.
- Added property-scoped coverage and source-health output with source identity, official URL, tax year, assessment stage, match method, match confidence, last checked time, and freshness.
- Preserved the last-good official assessment when a later source check degrades or fails.
- Exposed the Bronx borough, record-type, and Tax Class 1 constraints in the API and Property Tax Center.
- Kept schema changes direct and did not add a migration; the user must reconcile the database separately.

**Work**

- Persist normalized assessment records, not only Radar events.
- Link Radar observations to canonical assessment changes.
- expose source name, tax year, stage, match method, official URL, and freshness;
- preserve ambiguous-match suppression;
- add coverage and source-health API.
- implement last-good and degradation behavior;
- keep Bronx pilot explicitly constrained.

**Dependencies:** Slice 1  
**Exit criterion:** A covered property receives one source-backed assessment record and one contextual review action.

### Slice 3 — Jurisdiction rule and deadline foundation

**Goal:** Make every tax action jurisdiction-correct.

**Implementation status (July 27, 2026): Complete**

- Added immutable, versioned jurisdiction rule profiles with property-class qualification, effective windows, review metadata, expiry, structured assessment/cap/exemption/correction/appeal/form/fee rules, and official citations.
- Added fixed and notice-relative deadline rules with explicit IANA timezone and local cutoff handling; relative exceptions fail closed until the notice date and homeowner qualification are supplied.
- Added a reviewed FY2027 Bronx Tax Class 1 release sourced from current NYC Department of Finance and Tax Commission guidance.
- Required a source-backed official assessment match before homeowner rule or deadline output is available.
- Added homeowner rule coverage output for reviewed, unavailable, disabled, and expired states.
- Added Admin + MFA + `INTEGRATION_MANAGE` activation, emergency-disable, and rollback controls with durable operator audit events.
- Added reviewed rule provenance and deadline status to the Property Tax Center without predicting appeal success.
- Kept schema changes direct and did not add a migration; the user must reconcile the database separately.

**Work**

- Add reviewed jurisdiction profiles.
- Model assessment ratios, valuation dates, classifications, caps, exemptions, correction and appeal grounds, stages, forms, deadlines, fees, and official links.
- Add effective dates, source citations, reviewer, review time, status, and expiry.
- Add deadline calculation and timezone handling.
- Add operator activation, rollback, and emergency disable.

**Dependencies:** Slice 1; can proceed alongside Slice 2  
**Exit criterion:** No jurisdiction-specific action or deadline appears without an active reviewed rule profile.

### Slice 4 — Bill/notice intake and exemption workflow

**Goal:** Deliver useful savings and correction value before formal appeal.

**Implementation status (July 27, 2026): Complete**

- Added consent-gated PDF/image tax document intake using the existing encrypted property Vault and magic-byte validation.
- Added structured staged fields with extraction method/provider/model, schema version, per-field confidence, page/bounding-box/source-text provenance, and explicit proposed/confirmed/corrected/rejected states.
- Shipped the initial intake in privacy-preserving manual-review mode; no tax document is sent to an AI provider, and the provider-ready schema retains a degraded manual fallback.
- Added homeowner confirmation that atomically creates document-backed canonical parcel, assessment, bill, document-link, and field-evidence records.
- Added parcel, classification, value, taxable-value, exemption, and bill conflict detection through the canonical reconciliation layer.
- Added reviewed exemption, factual-correction, and informal-review checklists only when an active reviewed jurisdiction profile covers an official matched assessment.
- Added durable action decisions for eligibility review, readiness, not-applicable outcomes, and externally confirmed completion.
- Added Property Tax Center upload, manual verification, Vault history, conflict, and non-appeal workflow UI.
- Kept schema changes direct and did not add a migration; the user must reconcile the database separately.

**Work**

- Store uploaded tax documents in the Vault or explicit transient mode.
- Add structured extraction with field confidence and provenance.
- Add homeowner confirmation and correction.
- Detect parcel/classification/value/exemption conflicts.
- Add reviewed exemption eligibility and application checklists.
- Add official correction and informal-review actions.
- Add privacy consent and manual fallback.

**Dependencies:** Slices 1 and 3  
**Exit criterion:** A homeowner can verify a bill and complete an exemption or factual-correction workflow without entering the appeal path.

### Slice 5 — Evidence-qualified appeal readiness

**Goal:** Decide whether preparing an appeal is supported.

**Implementation status (July 27, 2026): Complete**

- Added reviewed, coded assessed-value, tax-class, and exemption grounds with ground-specific forms, canonical fact requirements, evidence requirements, and official-source provenance.
- Added durable homeowner-confirmed factual-error, condition, exemption-decision, and supporting-document evidence linked to the active reviewed rule release.
- Added durable sourced comparable-sale records with valuation date, property class, size and condition context, explicit time/condition/size/other adjustments, and mandatory adjustment rationale.
- Added deterministic comparable qualification against the canonical valuation date, canonical property class, reviewed time window, and source requirements.
- Added fail-closed readiness outcomes for ready, not ready, not covered, and no supported ground with exact missing facts or evidence.
- Added assessment-ratio normalization and a bounded tax-at-stake range derived from qualified adjusted sale prices and sourced tax facts; no probability or guaranteed-savings output is produced.
- Added effort guidance and an explicit professional boundary for material, complex, or conflicting claims.
- Added Property Tax Center ground selection, evidence capture, comparable qualification, gap display, tax-at-stake disclosure, and professional-boundary UI.
- Kept schema changes direct and did not add a migration; the user must reconcile the database separately.

**Work**

- Add jurisdiction-permitted grounds.
- Add evidence requirements per ground.
- Add qualified comparable records and adjustment fields.
- Normalize to valuation date and assessment ratio where applicable.
- Add condition and factual-error evidence.
- Calculate tax-at-stake ranges without probability or guaranteed savings.
- Add readiness, gaps, effort, and professional boundary.

**Dependencies:** Slices 1–4  
**Exit criterion:** The system can say “ready,” “not ready,” “not covered,” or “no supported ground” with evidence.

### Slice 6 — Appeal case, packet, and tracking

**Goal:** Complete the homeowner workflow.

**Implementation status (July 27, 2026): Complete**

- Added readiness-gated, durable property tax appeal cases keyed to the active reviewed rule release, selected ground, and tax year.
- Added resumable packet state with jurisdiction-specific checklist, official form link, evidence/comparable citations, editable narrative, homeowner review, and unresolved placeholder tracking.
- Shipped the initial narrative path as deterministic and manual; no tax evidence is sent to an AI provider, while provider/model/evidence fields preserve a future evidence-grounded AI path.
- Added explicit external filing confirmation with receipt/reference and optional property Vault confirmation document; a prepared packet is never represented as filed.
- Added durable response and hearing tracking, case reminders, and case history.
- Added determination outcomes, final assessed value, refund, credit, decision reference, and explicit case closure.
- Added idempotent Home Timeline milestones for case creation, packet readiness, filing, responses, hearings, determinations, and closure.
- Added Property Tax Center case selection, packet editing, checklist and placeholder completion, filing confirmation, tracking, reminders, outcome recording, and history UI.
- Kept schema changes direct and did not add a migration; the user must reconcile the database separately.

**Work**

- Create durable tax action cases.
- Generate jurisdiction-specific checklist and official form links.
- Use AI only for evidence-grounded editable narrative.
- add packet status and unresolved placeholders;
- add external filing confirmation;
- add hearing and response tracking;
- add reminders;
- record determination, refund/credit, and final assessment;
- write meaningful Home Timeline events.

**Dependencies:** Slice 5  
**Exit criterion:** A homeowner can resume, file externally, track, and close an appeal case.

### Slice 7 — Outcome-first UX, placement, and accessibility

**Goal:** Make the combined experience clear, useful, and controllable.

**Implementation status (July 28, 2026): Complete**

- Added overview, bill, changes, exemptions, review, appeal, and history stages with progressive disclosure instead of rendering every workflow at once.
- Added an outcome-first “What matters now” summary that prioritizes source conflicts, active appeal cases, reviewed deadlines, exact missing facts, or bill review and links to the relevant stage.
- Added explicit Official, Confirmed, and Estimated trust labels and retained source health, last-checked, observation, match, reviewed-rule, expiry, deadline, and official-instruction disclosures.
- Added a conflict and observed-change view that exposes dated source observations without manufacturing history from estimates or unmatched records.
- Added an audit-history view for Vault documents, exemption/correction decisions, appeal events, determinations, refunds, and credits while intentionally excluding planning estimates.
- Added event- and case-state-specific Home actions for active appeal cases and made Radar assessment and appeal actions stage-specific.
- Preserved property, Radar event, match, action, and appeal case query context across stage navigation and canonicalized legacy appeal entry points to the appeal stage.
- Added horizontally scrollable mobile stage navigation, 44-pixel targets, skip navigation, visible keyboard focus, focused stage headings, live status, semantic labels, dark-mode contrast, and reduced-motion-safe scrolling.
- Kept schema changes direct and did not add a migration; the user must reconcile the database separately.

**Work**

- Implement overview, bill, changes, exemptions, review, appeal, and history stages.
- Explain official versus confirmed versus estimated data.
- Show exact missing facts and why they matter.
- Add source, freshness, match, deadline, and rule disclosures.
- Make Home actions event- and deadline-specific.
- Preserve property and Radar launch context.
- Complete mobile, desktop, keyboard, screen-reader, zoom, contrast, and reduced-motion acceptance.

**Dependencies:** Slices 1–6  
**Exit criterion:** Every state answers what changed, what matters, what the homeowner can do, and why the guidance is trustworthy.

### Slice 8 — Acceptance, operations, and outcome measurement

**Goal:** Prove correctness and measure realized value.

**Work**

- Add unit, integration, browser, accessibility, and operational suites.
- Add source coverage and rule freshness dashboards.
- Add source/rule/AI disable controls.
- Measure review, exemption, correction, filing, determination, and realized outcome.
- Add false-match, missed-deadline, unsupported-claim, and stale-rule guardrails.

**Dependencies:** Slices 1–7  
**Exit criterion:** Complete acceptance passes and operations can detect and contain source or jurisdiction failures.

### Slice 9 — Documentation reconciliation

**Goal:** Establish one source of product and operational truth.

**Work**

- Create a combined Property Tax Center FRD.
- Update Product Framework registration and route inventory.
- update Home Event Radar handoff documentation;
- document tax-source and jurisdiction-rule governance;
- document AI and privacy boundaries;
- document schema reconciliation;
- remove stale sample deadline, route, estimate, and submission descriptions.

**Dependencies:** Each earlier slice updates affected docs; this slice performs final reconciliation  
**Exit criterion:** Product, engineering, QA, support, data, and operations documents agree.

---

## 13. Proposed Persistence Model

### 13.1 Tax jurisdiction

Store:

- country, state, county, municipality, district, and normalized key;
- timezone;
- official assessor and collector identities;
- coverage and status;
- reviewed source profile.

### 13.2 Jurisdiction rule release

Store:

- tax year/effective period;
- assessment model;
- ratio/equalization;
- valuation date;
- classes;
- caps;
- exemptions;
- correction and appeal grounds;
- stages;
- forms;
- deadlines and calculation rules;
- fees;
- official source URLs;
- reviewer, review timestamp, expiry, and status.

### 13.3 Property parcel match

Store:

- property;
- jurisdiction;
- parcel ID;
- situs address;
- match method;
- confidence;
- evidence;
- status;
- homeowner confirmation;
- conflict or ambiguity.

### 13.4 Assessment and bill

Store per tax year/stage:

- land, improvement, total assessed, equalized, and taxable values;
- classification;
- exemptions and caps;
- rate/millage components;
- bill amount and installments;
- due dates;
- source release;
- observed and effective dates;
- field-level provenance;
- linked documents;
- supersession.

### 13.5 Tax action case

Store:

- type: exemption, correction, informal review, formal appeal;
- jurisdiction and tax year;
- ground;
- status;
- deadline;
- target value or correction;
- tax-at-stake range;
- decision and reason;
- assigned checklist;
- filing method, date, and confirmation;
- hearing;
- determination;
- final assessment;
- refund/credit and recurring impact;
- completion and timeline references.

### 13.6 Evidence item

Store:

- case;
- evidence type;
- source and verification;
- document or sale record;
- valuation date;
- comparability fields and adjustments;
- inclusion/exclusion;
- reviewer;
- notes.

### 13.7 AI extraction and draft

Store separately:

- provider/model/version;
- document;
- structured output;
- field confidence;
- homeowner confirmation;
- prompt/template version;
- generated draft;
- unresolved placeholders;
- review status.

AI output must not overwrite canonical assessment or rule facts.

### 13.8 Existing source model

`TaxAssessorDataSource` can remain as adapter configuration or be linked to a broader reviewed source definition. It needs a durable relationship to canonical assessment records and source releases.

### 13.9 Schema implementation rule

Because there are no real users:

- modify `schema.prisma` directly;
- do not create migration scripts;
- do not backfill generated estimates or appeal reports;
- do not preserve old JSON payloads or enums for compatibility;
- remove obsolete duplicate structures;
- regenerate and validate Prisma artifacts;
- document that the user must reconcile the database.

---

## 14. Acceptance Matrix

| Scenario | Expected result | Next action |
|---|---|---|
| Covered property, confident official match | Official assessment with source and stage | Review change |
| Ambiguous parcel match | No official value attached | Confirm parcel/address |
| Uncovered jurisdiction | No official assessment or deadline claim | Upload bill or open official site |
| Bill uploaded, extraction uncertain | Field-level review required | Confirm/correct |
| Bill uploaded, official record conflicts | Conflict visible | Resolve source or contact assessor |
| Planning estimate only | Rough budgeting range | Add bill; no appeal conclusion |
| Historical records absent | No synthetic chart | Add records or wait for official history |
| Qualified history exists | Observed change chart | Explain material change |
| Expected exemption absent | Eligibility and evidence checklist | Apply or confirm inapplicable |
| Assessment ratio unknown | No market-value overassessment calculation | Load reviewed jurisdiction rule |
| Static deadline unavailable | No countdown | Use official link and confirm manually |
| Deadline rule active | Sourced calculated deadline | Record decision/reminder |
| User-entered comparable | Unverified lead | Verify and qualify |
| Comparable outside valuation window | Excluded with reason | Add relevant evidence |
| No supported appeal ground | Honest no-ground result | No action or professional review |
| Evidence incomplete | Not ready | Add exact missing items |
| Tax-at-stake range low | Cost/effort explanation | No action or informal review |
| Packet has placeholders | Draft only | Complete and review |
| Packet complete | Ready for homeowner review/file externally | File |
| Filed externally | Case status and confirmation saved | Track response |
| Determination received | Final values and outcome recorded | Close case |
| Active material reassessment | Contextual Home Action | Resume review |
| No active tax action | No permanent Home card | Catalog/context discovery |

---

## 15. Testing Strategy

### 15.1 Unit

Cover:

- official versus confirmed versus reported versus estimated fact states;
- assessment/taxable/market value rules;
- ratio and equalization;
- deadline calculations and timezone;
- exemption eligibility;
- permitted grounds;
- tax-at-stake ranges;
- comparable qualification and adjustments;
- evidence readiness;
- completion semantics;
- source and rule freshness.

### 15.2 Integration

Cover:

- source ingestion to assessment record;
- parcel match and ambiguity;
- Radar observation to tax action;
- document extraction and confirmation;
- conflict resolution;
- jurisdiction rule activation and rollback;
- case lifecycle;
- filing confirmation;
- determination and timeline write-back;
- property/household authorization;
- privacy and retention;
- idempotency and concurrency.

### 15.3 Browser acceptance

Cover:

- covered/uncovered jurisdiction;
- official/document/manual/planning states;
- change explanation;
- exemption review;
- factual correction;
- appeal readiness;
- no supported ground;
- incomplete evidence;
- draft and ready packet;
- filed/hearing/determined states;
- Radar deep link;
- Home placement;
- multiple properties;
- desktop, tablet, and mobile;
- keyboard-only, screen reader, zoom, contrast, and reduced motion.

### 15.4 Operational

Cover:

- source outage;
- stale assessment;
- ambiguous match spike;
- bad jurisdiction rule;
- deadline-rule rollback;
- AI outage;
- malformed extraction;
- source/rule/category disable;
- worker dry run;
- alerting and audit;
- schema reconciliation.

### 15.5 Current verification baseline

At audit time:

- 15 focused backend tax-source and Property Context tests pass;
- 8 focused worker ingestion and normalization tests pass;
- source tests cover validation, safe queries, address ambiguity, timeout, coverage routing, source health, dry run, and event normalization;
- no dedicated Property Tax calculator truth-table tests were found;
- no dedicated Tax Appeal analysis, deadline, savings, AI-extraction, or case tests were found;
- no complete browser or accessibility acceptance suite was found;
- no durable appeal-case model currently exists.

The source foundation has evidence. The homeowner outcome does not.

---

## 16. Success Measures

### 16.1 Primary outcomes

- assessments reviewed after a material change;
- exemptions applied for and approved;
- factual corrections requested and completed;
- appeals filed;
- determinations recorded;
- assessed-value reduction;
- refund or credit;
- verified recurring annual savings;
- cases completed before deadline.

### 16.2 Quality measures

- official jurisdiction coverage;
- confident parcel-match rate;
- ambiguity and false-match rate;
- source freshness;
- rule freshness;
- field-confirmation rate;
- evidence-readiness rate;
- deadline accuracy incidents;
- unsupported-ground suppression;
- packet completion rate;
- determination capture rate.

### 16.3 Experience measures

- homeowner can distinguish assessment, taxable value, market value, and bill;
- homeowner can identify the reason for a change;
- homeowner can identify official versus estimated data;
- homeowner can find the exact deadline source;
- homeowner can identify missing evidence;
- homeowner can resume an active case;
- reduced abandonment between detected change and decision.

### 16.4 Guardrails

- zero synthetic history labeled actual;
- zero synthetic median or percentile claims;
- zero unvalidated appeal probabilities;
- zero unsourced deadlines;
- zero unsupported “ready to submit” packets;
- zero appeal conclusions without jurisdiction coverage;
- zero unverified comparables treated as qualified evidence;
- zero generated-output completions;
- zero ambiguous parcel matches attached to a property;
- zero stale rule use after expiry/disable.

---

## 17. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Jurisdiction fragmentation is expensive | Slow coverage expansion | Pilot reviewed jurisdictions and expose coverage honestly |
| Official datasets contain address ambiguity | Wrong homeowner action | Preserve strict match thresholds and manual confirmation |
| Assessment values are mistaken for market values | False appeal conclusion | Jurisdiction valuation model gate |
| Deadline source becomes stale | Missed filing right | Effective dates, review cadence, expiry, disable, official-link fallback |
| AI extracts bill fields incorrectly | Wrong calculation | Field confidence, homeowner confirmation, schema validation |
| AI draft invents facts | Invalid filing | Grounded templates, evidence allowlist, unresolved-placeholder checks |
| Homeowner comps are biased | Weak evidence | Qualify sources and show exclusions/adjustments |
| Consolidation becomes an oversized wizard | Abandonment | Progressive stages based on current need |
| Home alerts create unnecessary appeal anxiety | Trust loss | Trigger only from reviewed changes/deadlines and show no-action outcome |
| Automated filing creates legal/operational risk | Material harm | External filing handoff until jurisdiction-specific approval |
| Tax data is sensitive | Privacy harm | Minimize, encrypt, authorize, disclose AI processing, and provide deletion |
| Other finance tools keep using heuristics | Inconsistent totals | Make them consume canonical tax record with explicit fallback state |

---

## 18. Definition of Done

The Property Tax and Tax Appeal exercise is complete when:

- one Property Tax Center owns the outcome;
- the global Tax Appeal route resolves and redirects to the property-scoped appeal stage;
- duplicate framework registration is removed;
- the family is material financial and jurisdiction-dependent;
- synthetic history, medians, percentile, probability, and sample-deadline claims are removed;
- every assessment and bill field has source and confidence;
- reviewed tax-assessor data populates canonical records;
- coverage and ambiguity are visible;
- official, document-confirmed, homeowner-reported, and estimated states are distinct;
- jurisdiction rules govern values, grounds, exemptions, deadlines, forms, and actions;
- AI extraction requires confirmation;
- AI drafts cannot masquerade as completed filings;
- exemption, correction, informal review, and appeal paths are supported;
- appeal evidence is qualified;
- a durable case tracks decision, filing, hearing, determination, and outcome;
- Home actions are contextual and material;
- completion reflects a decision or external action, not generated output;
- all acceptance and accessibility tests pass;
- operations can monitor and disable sources and rules;
- schema changes are direct, with no migration scripts;
- product, source, framework, AI, privacy, QA, and operational documentation agree.

---

## 19. Recommended Immediate Next Step

Begin with **Slice 0 — Truth, safety, and route containment**.

Before building new jurisdiction workflows:

- remove the fabricated historical and comparison outputs;
- remove appeal probability and unsupported confidence;
- remove static deadline authority;
- remove “Ready to Submit” language;
- correct completion and safety metadata;
- establish the single property-scoped route.

Then implement the canonical assessment record and connect the reviewed Bronx source pipeline.

That produces one narrow but trustworthy vertical slice:

> An officially matched assessment change appears in the Property Tax Center, explains its source and limitations, and gives the homeowner the correct reviewed next step.

This is a stronger foundation than expanding the current nationwide heuristic calculator or AI-generated appeal letter.
