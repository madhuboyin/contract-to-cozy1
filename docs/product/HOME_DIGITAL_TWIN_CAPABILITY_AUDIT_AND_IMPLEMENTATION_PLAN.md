# Home Digital Twin Capability Audit and Implementation Plan

**Capability:** 21.3 Home Digital Twin  
**Audit framework:** `CAPABILITY_OUTCOME_AND_EXPERIENCE_AUDIT_FRAMEWORK.md`  
**Audit date:** July 27, 2026  
**Status:** Implemented (Slices 0–8 complete). See `docs/functional/HOME_DIGITAL_TWIN.md` for the current-state functional description this plan drove.  
**Recommended disposition:** **Merge and reposition**  
**Current safety classification:** Low consequence  
**Recommended safety classification:** Mixed — low consequence for record projection; material financial for upgrade scenarios  
**Primary outcome family:** Living Home Record and Home Upgrade Planning

---

## 1. Executive Decision

Home Digital Twin contains a valuable product foundation, but its current homeowner-facing boundary is not the right one.

The implementation combines two different responsibilities:

1. a computed projection of facts already held in the Home Record, inventory, documents, and risk systems; and
2. a scenario engine that estimates the effects of replacements, upgrades, resilience work, renovations, and feature changes.

The projection is useful platform infrastructure. It can help other capabilities reason consistently about a home. It must not, however, become a competing source of truth beside Home Record, Inventory, Status Board, Home Score, Capital Timeline, and Home Timeline.

The scenario capability has a potentially valuable homeowner outcome, but the current model is not trustworthy enough to support material upgrade decisions. It derives component condition and “failure risk” primarily from linear age assumptions, uses static national cost and return assumptions, can estimate insurance savings from a generic national premium, and can present user-supplied custom impacts as computed results. The UI gives these outputs a confident “bottom line” without exposing a complete assumption, provenance, freshness, or sensitivity model.

The recommended disposition is therefore **merge and reposition**:

- retain the Digital Twin as an internal, versioned projection service;
- keep canonical facts and corrections in Home Record and Inventory;
- surface current system state through the canonical Status Board and Capital Timeline;
- reposition the scenario experience as a focused **Home Upgrade Planner** for active decisions;
- remove permanent Digital Twin promotion from the property overview;
- show contextual upgrade planning only when a relevant system, project, risk, maintenance, or homeowner intent exists;
- replace heuristic point claims with evidence-bounded ranges and sensitivity analysis;
- connect scenario results to a real next step such as update facts, add evidence, compare options, request quotes, start a project, or record completed work.

The homeowner-facing promise should become:

> See what Contract-to-Cozy knows about your home, correct what is uncertain, and compare the likely cost, timing, savings, and risk trade-offs of a specific upgrade.

“Digital Twin” may remain an internal architecture term. If retained in homeowner copy, it must be immediately translated into a benefit:

> Your home model brings together system ages, condition evidence, and planned work so you can make better upgrade decisions.

### 1.1 Implementation constraint

There are no real users and no production data migration requirement.

Implementation may update the Prisma schema directly. It must not create:

- database migration scripts;
- historical backfills;
- compatibility layers for obsolete twin or scenario records;
- dual-write logic;
- route preservation that has no target-product value.

The user will reconcile the database separately after schema changes.

This permits a clean separation between:

- canonical facts;
- derived projection facts;
- scenario assumptions;
- scenario results;
- homeowner decisions and actions.

---

## 2. Scope

### 2.1 In scope

This audit covers:

- twin initialization, refresh, status, and versioning;
- component derivation;
- fact source and homeowner confirmation handling;
- completeness and confidence calculation;
- staleness and Property Context integration;
- scenario suggestions;
- scenario computation and persistence;
- homeowner-facing Home Digital Twin page;
- the property-overview Digital Twin preview;
- capability registration, readiness, completion, safety, and placement;
- overlap with Home Record, Inventory, Status Board, Home Score, Capital Timeline, Risk Replay, Renovation Advisor, Service Price Radar, Project Tracker, and Home Timeline;
- APIs, authorization, testing, analytics, accessibility, operations, and documentation.

### 2.2 Out of scope

This document does not:

- implement a 3D, BIM, CAD, or spatial model;
- select external pricing, utility, insurance, valuation, or equipment-data providers;
- approve engineering, insurance, tax, or financial claims;
- define a database migration;
- implement the recommended slices.

### 2.3 Evidence reviewed

The assessment is based on repository evidence, including:

- `docs/functional/HOME_DIGITAL_TWIN.md`;
- the capability audit framework;
- capability definitions, readiness policies, golden fixtures, and inventory;
- Digital Twin routes, controller, validators, services, and Prisma models;
- frontend API adapters, DTOs, the Digital Twin page, and property preview;
- existing strategic and pre-launch audits;
- Property Context projection policy;
- adjacent capability documentation and integration references;
- available automated tests.

---

## 3. Homeowner Job and Target Outcome

### 3.1 Primary homeowner job

The current name describes technology, not a homeowner job.

The underlying homeowner jobs are:

> Help me understand what Contract-to-Cozy knows about my home’s major systems, identify what is uncertain or outdated, and correct it.

and:

> When I am considering a replacement or upgrade, help me compare realistic options and understand the likely cost, timing, savings, risk, and downstream work before I commit.

### 3.2 Triggering situations

The projection is relevant when:

- Home Record or inventory facts change;
- a document adds or contradicts a system fact;
- work is completed;
- a system is added, replaced, retired, or inspected;
- a risk or condition signal materially changes;
- another capability needs a current property projection.

The homeowner-facing upgrade planner is relevant when:

- a system approaches a replacement planning window;
- evidence indicates a material condition or performance issue;
- the homeowner explicitly considers an upgrade;
- a renovation or resilience project becomes active;
- the homeowner wants to compare “repair, replace, upgrade, or wait”;
- a project has estimated costs, quotes, incentives, utility effects, or risk implications to compare.

### 3.3 Current delivered outcome

The current route primarily delivers:

- a generated list of modeled systems;
- age and lifespan-used estimates;
- a calculated failure-risk percentage;
- static replacement and annual-cost estimates;
- a readiness percentage;
- suggested scenarios;
- computed financial, risk, property-value, insurance, emissions, and comfort impacts;
- scenario pinning and archiving.

This is an informative model view, not a completed homeowner outcome.

### 3.4 Target best-in-class outcome

For property understanding:

> The homeowner can see which system facts are verified, inferred, missing, stale, or conflicting and can correct them at the canonical source.

For upgrade planning:

> The homeowner compares a bounded set of relevant options using transparent assumptions, ranges, uncertainty, and sources, then records a decision or moves into a canonical action workflow.

The experience should leave the homeowner with:

- a trustworthy system record;
- a clear list of missing or conflicting facts;
- a correction path;
- a planning horizon rather than a fake failure probability;
- explicit assumptions and evidence for each scenario;
- alternative and do-nothing comparisons;
- sensitivity to price, energy use, useful life, incentives, and timing;
- a safe recommendation boundary;
- a decision or next action;
- completed-work write-back to the Home Record and timeline.

---

## 4. Outcome-Family Decision

### 4.1 Current overlap

| Capability | Canonical responsibility | Current Digital Twin overlap |
|---|---|---|
| Home Record | Authoritative property and system facts | Twin displays and derives parallel component facts |
| Inventory | Specific appliances, systems, dates, brands, models, documents | Twin creates component representations from inventory |
| Status Board | Current conditions and priorities | Twin assigns system status, risk, and urgency |
| Home Score | Aggregate home-health view | Twin exposes readiness, condition, and component health |
| Capital Timeline | Replacement windows and long-term capital planning | Twin models lifespan, replacement cost, and scenario timing |
| Risk Replay | Evidence-bounded hazard and incident implications | Twin estimates risk reduction |
| Energy Audit | Energy-efficiency opportunities and savings | Twin suggests insulation, windows, and solar |
| Renovation Advisor | Project feasibility, permits, compliance, and risks | Twin models renovation and upgrade scenarios |
| Service Price Radar | Quote and market-price evaluation | Twin estimates replacement/project costs |
| Project Tracker | Approved work through completion | Twin can represent an upgrade but does not execute it |
| Home Timeline | Durable history of facts, work, and outcomes | Twin scenarios are saved separately without complete outcome write-back |

### 4.2 Recommended product boundary

#### Internal Living Home Model

Retain a derived, versioned projection service that:

- reads canonical facts;
- records field-level lineage;
- expresses uncertainty;
- detects staleness and conflicts;
- supplies normalized component state to authorized capabilities;
- never becomes the source of truth.

#### Home Record and system readiness

Move fact review and correction into Home Record and Inventory:

- known facts;
- inferred facts;
- conflicting facts;
- missing facts;
- source and observation date;
- correction and confirmation.

#### Status and capital planning

Move present-state summaries and lifecycle planning into:

- Status Board for what needs attention now;
- Capital Timeline for likely replacement windows and reserve implications.

#### Home Upgrade Planner

Retain scenario analysis as a focused decision experience:

- repair;
- replace;
- upgrade;
- wait;
- compare alternatives;
- capture assumptions;
- hand off to quotes, renovation planning, incentives, projects, and completion.

### 4.3 Recommended route disposition

- Keep the current route only as a temporary canonical alias during implementation.
- Make Home Record the canonical destination for system facts and corrections.
- Make Capital Timeline or an outcome-based planning workspace the canonical destination for lifecycle scenarios.
- Expose “Plan an upgrade” contextually from system, project, maintenance, incident, energy, risk, and capital surfaces.
- Do not expose an abstract standalone “Digital Twin” as a primary navigation or Home destination.
- Preserve useful entity focus and launch context when redirecting.

### 4.4 Why “merge and reposition” is preferred

Keeping the current route as an independent core tool would:

- create another home-state summary;
- ask homeowners to understand a technical concept before receiving value;
- duplicate canonical system data;
- fragment corrections;
- compete with Status Board and Capital Timeline;
- produce scenario outputs without completing a decision;
- increase dashboard and property-page clutter.

Removing the capability entirely would waste a potentially valuable normalized projection and scenario foundation.

The correct decision is to keep the engine layer, merge record/status functions into their canonical surfaces, and reposition scenarios around an active homeowner decision.

---

## 5. Current Strengths

### 5.1 Projection boundary is documented

The Prisma model and Property Context policy explicitly state that the twin is a projection of canonical records, not a source of truth. The implementation stores a Property Context version and exposes a staleness envelope.

This is an important architectural foundation.

### 5.2 Property-scoped authorization

Twin and scenario routes use property authorization. Mutations require a contributor-level household role. Scenario records preserve the creating user.

### 5.3 Idempotent high-level lifecycle

The service supports:

- initialize;
- refresh;
- retrieve;
- create scenario;
- compute scenario;
- pin;
- archive.

Twin computation runs record success and failure for initial build and refresh.

### 5.4 Existing data reuse

The builder reads property profile, inventory, risk report, financing, appraisal, documents, and energy-related facts. The intended direction—reuse Home Record rather than require duplicate manual setup—is correct.

### 5.5 Data-quality dimensions

The implementation distinguishes several readiness dimensions:

- property profile;
- systems;
- appliances;
- documentation;
- cost basis;
- energy basis;
- risk basis.

This is a useful starting taxonomy, even though the present scoring rules are not outcome-specific enough.

### 5.6 Progressive scenario experience

The frontend offers:

- suggested scenarios;
- a safe “nothing is scheduled or committed” disclosure;
- scenario results;
- individual impact rows;
- pin and archive controls;
- loading, empty, error, and compute-failure states;
- keyboard-addressable cards and accessible sheet descriptions.

### 5.7 Cross-capability potential

The model can become a strong internal consistency layer for:

- capital planning;
- preventive maintenance;
- upgrade decisions;
- risk mitigation;
- quote preparation;
- project completion;
- resale documentation.

That platform value is stronger than the current standalone-route value.

---

## 6. Audit Scorecard

| Dimension | Weight | Score | Assessment |
|---|---:|---:|---|
| Homeowner value and differentiation | 20 | 12 | Strong platform idea and useful upgrade-planning potential, but the current abstract surface provides weak immediate value |
| Functional completeness | 20 | 9 | Projection and scenario primitives exist; correction, comparison, decisions, actions, and completed-work reconciliation do not |
| Actionability and closed loop | 15 | 5 | Scenarios can be created and archived, but there is no canonical decision or execution handoff |
| Data quality, trust, and provenance | 15 | 4 | Field derivations and model caveats exist, but heuristic risk and financial claims exceed their evidence |
| UX, readiness, and accessibility | 15 | 9 | Usable mobile primitives and partial disclosures; technical framing, missing correction paths, weak desktop hierarchy, and misleading status remain |
| Product-framework integration | 10 | 5 | Contextual registration and staleness exist; trigger, completion, safety, placement, and outcome boundary are inaccurate |
| Reliability and automated evidence | 5 | 1 | No dedicated component, scenario, recommendation, API, or browser suite was found |
| **Total** | **100** | **45** | **Useful internal foundation, but the standalone homeowner capability requires substantial repositioning and trust work** |

### 6.1 Disposition override

The following defects prevent a simple “improve the current page” recommendation:

- system-derived installation years can produce a `KNOWN` status;
- age-ratio depletion is presented as failure probability;
- the property preview maps incompatible status enums and renders non-empty groups as healthy;
- a broad overall risk score can inflate roof failure risk;
- static cost, savings, resale, and insurance assumptions produce a confident bottom line;
- custom caller-provided impacts can appear as computed scenario results;
- confirmed components are excluded from recommendation selection;
- there is no correction API despite homeowner-confirmation fields;
- completion is `OUTPUT_VIEWED`, which measures exposure rather than homeowner value;
- the permanent property preview duplicates more actionable surfaces.

These are product-boundary and trust defects, not visual-polish issues.

---

## 7. Homeowner Question Contract Assessment

| Homeowner question | Current answer | Gap | Target answer |
|---|---|---|---|
| What is this? | “A living view” and “Digital Twin” | Technology term still leads; desktop loses much of the explanation | “A home model that shows what we know and helps you compare a specific upgrade.” |
| How will this benefit me? | Systems, age, risk, and what-if scenarios | Benefit is broad and abstract | Correct system facts, plan upcoming replacements, and compare upgrade options |
| What should I add? | “Add more home details” | No direct field-level CTA or reason | Exact missing fact, source destination, and effect on the decision |
| What should I care about? | Lifespan used, risk percentage, replacement cost, suggestions | Some metrics are misleading; no ranked decision context | Verified condition, planning window, evidence gaps, cost range, and relevant next decision |
| What can I control? | Refresh, run, pin, archive | Cannot correct a component, edit assumptions, compare alternatives, decide, or act | Confirm/correct facts, change assumptions, compare, save, delete, decide, and start next workflow |
| Why should I trust this? | Confidence percentage and generic source note | No complete field lineage, model version, range, freshness, or sensitivity | Fact-by-fact sources, dates, assumptions, ranges, sensitivity, and limitations |
| What happens if I do nothing? | Not systematically modeled | Missing baseline option | Include maintain/repair/wait and timing alternatives |
| When am I done? | Viewing output satisfies framework completion | No outcome | Done means facts corrected or a scenario decision/next action recorded |

---

## 8. Product Framework Conformance

### 8.1 Current contract

The capability is currently registered as:

- outcome category: `PROTECT_MONITOR`;
- release stage: active;
- safety tier: low consequence;
- activation mode: contextual;
- completion kind: `OUTPUT_VIEWED`;
- trigger: `PROPERTY_CONTEXT_INCOMPLETE`;
- readiness: at least one known Home Record fact;
- safe partial value: true;
- privacy: sensitive.

### 8.2 Contract defects

#### Outcome

The current route mixes:

- record completeness;
- system monitoring;
- lifecycle planning;
- upgrade decision support.

No single completion contract can accurately describe all four.

The projection should not be a homeowner capability outcome. The retained upgrade-planning experience belongs in `DECIDE_COMPARE` or an equivalent planning outcome family.

#### Trigger

`PROPERTY_CONTEXT_INCOMPLETE` is appropriate for Home Record correction, not for an upgrade scenario engine.

The framework currently recommends Digital Twin for a sparse new home after one verified fact. That can create a low-value model filled primarily with inferred systems and defaults.

Target triggers should be separated:

- missing or conflicting facts → Home Record;
- tracked systems and lifecycle need → Capital Timeline;
- active replacement/upgrade decision → Home Upgrade Planner.

#### Readiness

One known fact is insufficient for scenario conclusions.

Readiness must be specific to the proposed decision:

- relevant component identity;
- verified or bounded age;
- type/capacity/material where applicable;
- observed condition or explicit “unknown”;
- energy or maintenance baseline for savings;
- location and quote/cost evidence for financial comparison;
- homeowner objective and timing.

#### Safety

Viewing an inferred record is usually low consequence. Recommendations and scenarios involving:

- structural systems;
- electrical systems;
- roof work;
- resilience;
- insurance savings;
- property-value impact;
- large renovation costs;
- replacement urgency

are material financial and sometimes safety-related.

The capability needs stage- and impact-specific safety rather than one low-consequence label.

#### Completion

`OUTPUT_VIEWED` is not a meaningful value signal.

Target completion should be one of:

- canonical fact confirmed or corrected;
- planning option compared;
- homeowner decision recorded;
- action handed off and accepted;
- completed work reconciled.

#### Context

The capability accepts entity focus in the frontend, but the manifest does not declare a complete accepted-context contract. The target planner should accept:

- property;
- component/system;
- appliance;
- project;
- maintenance item;
- issue/incident;
- document;
- risk;
- quote;
- journey.

### 8.3 Recommended framework contracts

#### Projection service

The projection service should be internal infrastructure, not a catalog capability.

#### Home Record correction

| Field | Recommended value |
|---|---|
| Outcome | Record / organize |
| Safety | Low consequence, with sensitive-data controls |
| Trigger | Missing, stale, or conflicting relevant property facts |
| Completion | Fact confirmed, corrected, or explicitly left unknown |
| Destination | Home Record or entity detail |

#### Home Upgrade Planner

| Field | Recommended value |
|---|---|
| Outcome | Decide / compare |
| Safety | Material financial; category-specific safety escalation |
| Trigger | Explicit upgrade intent or active component/project decision |
| Readiness | Relevant system evidence and scenario-specific baseline |
| Safe partial value | Assumption checklist and planning range, not a recommendation |
| Completion | Option selected, deferred, rejected, or handed off with reason |
| Destination | Canonical planning workspace |

### 8.4 Home and property placement

The current property overview permanently gives Digital Twin a large, second-position preview.

That placement is not justified by an active homeowner outcome and should be removed.

Replace it with one of:

- a Home Record completeness prompt when material facts are missing;
- a system-needs-attention summary when verified evidence supports it;
- a capital-planning action when a replacement window is relevant;
- an active upgrade-decision card when a scenario needs input or a choice.

Do not show:

- “Initialize Model” as a prominent property action;
- technical node counts;
- a completeness score without a meaningful next action;
- a permanent Digital Twin card on Home.

---

## 9. Functional and Trust Assessment

### 9.1 Canonical versus derived facts

The schema correctly describes twin records as projections, but the model lacks field-level lineage and correction semantics.

`sourceType` and a single optional `sourceReferenceId` are not sufficient when a derived component combines:

- property fields;
- inventory facts;
- broad defaults;
- risk output;
- formula logic;
- homeowner confirmation.

The target projection needs, per derived fact:

- canonical source record and field;
- source observation/effective date;
- source confidence or verification state;
- derivation rule and version;
- derived-at timestamp;
- conflict state;
- supersession state;
- homeowner correction destination.

### 9.2 Incorrect known-versus-estimated status

For HVAC and water heater components, an installation year inferred from the property’s construction year can make `installYear` non-null and therefore set status to `KNOWN`.

An inferred date is not a known date.

Status must be determined from provenance, not from whether a computed field is populated.

### 9.3 Failure risk is not a probability

The builder calculates:

> failure risk = 1 − condition score

Condition is itself derived from age divided by a fixed useful-life assumption.

The frontend then describes this as:

> Estimated probability of a failure event requiring significant repair or replacement.

That claim is unsupported. Age consumption is not an annual or cumulative probability of failure.

The target should use:

- “estimated planning window”;
- “age relative to a typical service-life range”;
- “condition evidence”;
- “inspection recommended”;
- a validated failure model only if calibrated data becomes available.

### 9.4 Static defaults and missing provenance

Component costs, operating costs, maintenance costs, useful lives, returns, insurance discounts, and several savings assumptions are hard-coded.

They do not carry:

- source;
- geography;
- effective date;
- price index;
- equipment capacity or quality tier;
- climate zone;
- utility tariff;
- insurer eligibility;
- sample or method;
- uncertainty range.

These defaults may support rough placeholder planning, but not a confident financial “bottom line.”

### 9.5 Quality score does not measure decision readiness

Current readiness can increase because:

- any three property documents exist, even if unrelated;
- any risk assessment exists, even if unrelated to the component;
- purchase price or appraisal exists;
- default cost values populate most components;
- any three appliance/HVAC inventory items exist.

These signals do not necessarily improve the target scenario.

The target should calculate readiness against the specific question:

- Is the HVAC replacement analysis ready?
- Is the roof planning window ready?
- Is a solar savings estimate ready?
- Is an insulation option ready?

### 9.6 Component lifecycle defects

The builder:

- selects only the first matching HVAC or water-heater inventory item;
- can create a derived component alongside a homeowner-confirmed component;
- has no uniqueness constraint for the intended component identity;
- does not reconcile stale components removed from source data;
- leaves confirmed components untouched even when their source conflicts;
- has no public component correction or confirmation API.

The model must support multiple real systems and explicit reconciliation.

### 9.7 Recommendation defects

Recommendations:

- exclude homeowner-confirmed components;
- convert age-ratio thresholds into urgency;
- rank higher-cost suggestions more highly;
- treat a high overall risk report as evidence for roof risk;
- recommend insulation with fixed costs and savings;
- recommend solar without roof, orientation, shading, tariff, usage, incentive, or interconnection evidence;
- use broad benefit copy such as energy savings, resale value, and avoided failure without qualified evidence.

High cost should not increase recommendation priority by itself.

### 9.8 Scenario computation defects

The scenario engine can generate:

- upfront cost;
- annual savings;
- payback;
- property-value change;
- maintenance savings;
- energy savings;
- risk reduction;
- insurance impact;
- emissions impact;
- comfort impact;
- a ten-year bottom line.

Several outputs are derived from fixed fractions or user-entered assumptions. The UI does not clearly separate:

- observed fact;
- homeowner assumption;
- system default;
- externally sourced estimate;
- calculated result.

The `CUSTOM` scenario accepts caller-provided impact rows and stores them as results. These can appear indistinguishable from system-computed impacts.

### 9.9 Scenario reproducibility

The baseline snapshot stores only aggregate completeness, confidence, status, and twin version. It does not preserve:

- component fact snapshot;
- source versions;
- cost source;
- utility assumptions;
- formulas and model version;
- selected range values;
- recommendation rule version.

Recomputation reads the current component state. A saved scenario can therefore change without a clear before/after explanation.

### 9.10 Computation observability

The schema includes a `SCENARIO_COMPUTE` run type, but scenario computation does not create a run. On failure, the scenario is not reliably updated to `FAILED` with a useful error record.

The target requires:

- queued/running/succeeded/failed state;
- immutable assumption snapshot;
- calculation version;
- warnings;
- error classification;
- retry safety;
- duration and trace metadata.

### 9.11 Property preview status defect

The property preview expects status values such as:

- `GOOD`;
- `FAIR`;
- `POOR`;
- `MONITOR`;
- `REPLACE_SOON`.

The actual component enum is:

- `KNOWN`;
- `ESTIMATED`;
- `NEEDS_REVIEW`;
- `RETIRED`.

For any non-empty group, the preview falls through to “GOOD” and renders a green indicator. A component that needs review or is retired can therefore make a group appear healthy.

This preview must be removed or corrected immediately.

### 9.12 Staleness and refresh

The read API can identify projection staleness through Property Context, but:

- refresh is manual;
- upstream fact changes do not clearly schedule targeted recomputation;
- no dependency-level invalidation is visible;
- stale scenario impacts are not automatically qualified;
- initialization and refresh run synchronously;
- concurrent refreshes can race;
- the property preview still requests a not-yet-created twin.

The target should be event-driven and dependency-aware.

---

## 10. Prioritized Gap Register

### HDT-001 — Derived facts can be labeled as known

**Priority:** P0  
**Type:** Product truth  

**Recommendation**

- Determine fact state from provenance.
- Separate `VERIFIED`, `REPORTED`, `DOCUMENT_DERIVED`, `INFERRED`, `DEFAULT`, `CONFLICTED`, and `UNKNOWN`.
- Never use field population as proof of knowledge.

**Acceptance**

- A construction-year-derived install date cannot render as known or homeowner-confirmed.

### HDT-002 — Lifespan depletion is mislabeled as failure probability

**Priority:** P0  
**Type:** Safety / trust  

**Recommendation**

- Remove probability language from age heuristics.
- Replace it with service-life range and planning-window language.
- Require a calibrated model and validation evidence before presenting probability.

**Acceptance**

- No UI or API describes `1 − condition` as probability of failure.

### HDT-003 — Property preview displays incompatible status semantics

**Priority:** P0  
**Type:** UI correctness  

**Recommendation**

- Remove the permanent preview in the target architecture.
- Until removed, map actual statuses correctly and do not infer health from record state.

**Acceptance**

- `NEEDS_REVIEW`, `RETIRED`, `ESTIMATED`, and empty states cannot appear as healthy.

### HDT-004 — Scenario claims exceed their evidence

**Priority:** P0  
**Type:** Material financial trust  

**Recommendation**

- Suppress point claims for resale value, insurance discounts, savings, payback, and risk reduction unless the evidence contract is met.
- Present ranges and assumptions.
- Remove “bottom line” treatment for heuristic-only scenarios.

**Acceptance**

- Every impact identifies its source class, range, freshness, and assumptions.
- Unsupported impacts are omitted or explicitly homeowner-entered.

### HDT-005 — Caller-provided impacts can look system-computed

**Priority:** P0  
**Type:** Integrity  

**Recommendation**

- Remove arbitrary `CUSTOM.expectedImpacts` from the homeowner API, or store them strictly as user assumptions.
- Never promote user-supplied impact values to computed evidence.

**Acceptance**

- Results distinguish system calculations from homeowner-entered expectations in persistence, API, and UI.

### HDT-006 — The standalone capability duplicates canonical surfaces

**Priority:** P0  
**Type:** Product architecture  

**Recommendation**

- Make the projection internal.
- Move fact correction to Home Record.
- Move current state to Status Board.
- Move lifecycle planning to Capital Timeline.
- Reposition scenarios as Home Upgrade Planner.

**Acceptance**

- The homeowner does not need to choose between multiple home-state summaries.

### HDT-007 — No canonical correction and confirmation path

**Priority:** P0  
**Type:** Functional completeness  

**Recommendation**

- Add field-level correction actions that write to canonical source models.
- Recompute the projection after confirmed changes.
- Preserve conflict and audit history.

**Acceptance**

- Every inferred or conflicting fact has a specific, authorized correction destination.

### HDT-008 — Readiness and confidence are not decision-specific

**Priority:** P1  
**Type:** Trust / UX  

**Recommendation**

- Replace global completeness as the primary signal with question-specific readiness.
- Show what is known, missing, stale, conflicting, and why it matters.

**Acceptance**

- Scenario readiness changes only when evidence relevant to that scenario changes.

### HDT-009 — Component identity and reconciliation are incomplete

**Priority:** P1  
**Type:** Data architecture  

**Recommendation**

- Define stable component identities and source links.
- Support multiple HVAC zones, water heaters, panels, roofs, and other real systems.
- Reconcile additions, deletions, replacements, conflicts, and supersession.

**Acceptance**

- Refresh cannot create duplicate logical components or retain unsupported active components.

### HDT-010 — Recommendations can be irrelevant or unsafe

**Priority:** P1  
**Type:** Decision quality  

**Recommendation**

- Require explicit homeowner intent or material evidence.
- Remove cost-size ranking bias.
- Use confirmed facts.
- Apply component-specific eligibility and safety rules.
- Prefer “verify” or “inspect” when evidence is uncertain.

**Acceptance**

- Sparse data cannot create urgent replacement guidance.
- High-cost work does not rank higher merely because it is expensive.

### HDT-011 — Scenarios lack alternative, wait, and sensitivity comparison

**Priority:** P1  
**Type:** Best-in-class functionality  

**Recommendation**

- Compare maintain, repair, replace, upgrade, and wait.
- Show ranges and break-even sensitivity.
- Allow timing, cost, lifespan, energy-price, incentive, and financing adjustments.

**Acceptance**

- A homeowner can understand which assumptions change the decision.

### HDT-012 — Scenario lifecycle does not reach a decision or action

**Priority:** P1  
**Type:** Closed loop  

**Recommendation**

- Add select, reject, defer, revise, and close decisions.
- Hand off to Service Price Radar, Renovation Advisor, incentives, projects, reserve planning, or professional inspection.
- Write completed work back to canonical facts and timeline.

**Acceptance**

- A scenario can produce a recorded decision and accepted downstream action without re-entry.

### HDT-013 — Scenario provenance and reproducibility are incomplete

**Priority:** P1  
**Type:** Reliability / trust  

**Recommendation**

- Persist immutable input, component, source, model, and assumption snapshots for each run.
- Show changes when recomputing against newer facts.

**Acceptance**

- A historical result is reproducible and its evidence can be inspected.

### HDT-014 — Projection refresh is manual and coarse

**Priority:** P1  
**Type:** Operations  

**Recommendation**

- Add dependency events and targeted invalidation.
- Queue recomputation.
- deduplicate concurrent runs;
- preserve last good projection on failure;
- expose source-specific staleness.

**Acceptance**

- Relevant canonical updates produce one safe projection refresh without user intervention.

### HDT-015 — Home and property placement is prominence without value

**Priority:** P1  
**Type:** Product experience  

**Recommendation**

- Remove the permanent property preview.
- Show only contextual record, status, capital, or active-decision actions.

**Acceptance**

- Digital Twin does not occupy primary Home or property real estate unless it represents a material unresolved outcome.

### HDT-016 — Desktop and returning experience are incomplete

**Priority:** P1  
**Type:** UX / accessibility  

**Recommendation**

- Provide a consistent outcome-first header at all breakpoints.
- Replace technical labels such as nodes, model initialization, and compute engine.
- Show active decision, last change, unresolved evidence, and next action.

**Acceptance**

- Desktop and mobile answer the Homeowner Question Contract without relying on hidden or mobile-only copy.

### HDT-017 — Automated evidence is insufficient

**Priority:** P1  
**Type:** Quality  

**Recommendation**

- Add component-derivation truth tables.
- Add status/provenance tests.
- Add quality/readiness tests.
- Add scenario calculation, staleness, failure, and authorization tests.
- Add browser and accessibility acceptance.

**Acceptance**

- All state and trust contracts are enforced in CI.

### HDT-018 — Analytics measure exposure, not value

**Priority:** P2  
**Type:** Measurement  

**Recommendation**

- Replace view-based completion with fact correction, comparison, decision, handoff, and completed-work outcomes.
- Separate projection health from homeowner engagement.

**Acceptance**

- Product reporting can show whether the model improved a decision or the Home Record.

### HDT-019 — Documentation describes an aspirational system as current behavior

**Priority:** P1  
**Type:** Documentation  

**Recommendation**

- Reconcile functional documentation with actual APIs and components.
- Mark evidence levels and unsupported claims.
- Document the target product boundary and operational model.

**Acceptance**

- Documentation no longer describes missing services, hooks, coverage, or guarantees as implemented.

---

## 11. Target Experience

### 11.1 Home Record: what we know

For each system, show:

- system identity;
- verified facts;
- inferred facts;
- source and date;
- conflicts;
- missing facts;
- last work;
- correction action.

Example:

> **Roof replacement year: estimated as 2004**  
> We used the home’s construction year because no roof record was found. Confirm the year, upload an invoice, or leave it unknown.

### 11.2 Status Board: what needs attention

Do not show a generic failure percentage.

Show:

- verified issue;
- observed condition;
- age relative to a typical range;
- why it matters;
- evidence quality;
- appropriate next step.

Example:

> **Water heater planning window may be approaching**  
> The recorded installation year is 2015. Similar units often last within a range, but age alone does not predict failure. Check for corrosion or leaks and confirm the model before planning replacement.

### 11.3 Capital Timeline: what to plan

Show:

- broad earliest/likely/latest planning windows;
- current reserve impact;
- evidence quality;
- dependencies;
- timing alternatives.

The projection should feed the timeline rather than duplicate it.

### 11.4 Upgrade Planner entry

Start with the homeowner decision:

> What are you considering?

- Repair the current system
- Replace it with a similar system
- Upgrade efficiency or resilience
- Wait and monitor
- Compare options I already have

Then explain:

> We will use your confirmed home facts and clearly label assumptions. Nothing is scheduled or purchased.

### 11.5 Readiness

Present:

**What we know**

- verified system type;
- capacity/material/model;
- age;
- current condition evidence;
- usage or cost baseline;
- relevant quotes.

**What is missing**

- exact model;
- recent inspection;
- utility use;
- local cost;
- incentive eligibility.

**Why it matters**

> Your current energy use is missing, so we can compare upfront costs but cannot estimate annual savings reliably.

### 11.6 Scenario comparison

Compare options in one table or progressive summary:

- upfront cost range;
- annual cost range;
- expected planning life;
- risk/condition effect;
- comfort or resilience effect;
- incentives;
- implementation complexity;
- permits and professional requirements;
- evidence quality;
- assumptions.

Always include:

- current baseline;
- do nothing or wait;
- relevant alternative;
- uncertainty range.

### 11.7 Recommendation boundary

The product may say:

> Replacing now may be worth evaluating if the inspection confirms the condition and the installed quote stays within this range.

It must not say:

- the system has a precise failure probability based only on age;
- an upgrade will increase property value by a fixed amount;
- an insurer will provide a discount without insurer evidence;
- solar will pay back within a fixed period without usage, tariff, roof, and incentive inputs;
- a homeowner should undertake safety-sensitive work without professional review.

### 11.8 Decision and action

Allow the homeowner to:

- correct inputs;
- save assumptions;
- compare scenarios;
- choose an option;
- defer;
- reject;
- request inspection;
- research incentives;
- evaluate quotes;
- start renovation-risk review;
- create or connect a project;
- update the reserve plan.

### 11.9 Completed work

When work is completed:

- confirm completion;
- capture actual system and install facts;
- attach invoice, warranty, permits, and photos;
- retire superseded components;
- reset the relevant planning window;
- update Capital Timeline;
- write a Home Timeline event;
- preserve expected-versus-actual comparison.

---

## 12. Recommended Implementation Sequence

### Slice 0 — Product truth and immediate containment

**Goal:** Remove misleading system-health and scenario claims before expanding functionality.

**Work**

- Remove or correct the property preview’s incompatible status mapping.
- Stop labeling inferred components as known.
- Remove failure-probability language from age-derived risk.
- Disable or relabel unsupported property-value, insurance, savings, and risk impacts.
- Remove user-supplied custom impacts from computed-result semantics.
- Remove “bottom line” presentation for heuristic-only scenarios.
- Stop treating initialization as a meaningful product activation.
- Change framework safety and completion contracts.
- Remove permanent Home/property prominence.

**Dependencies:** None  
**Exit criterion:** No current route presents inferred facts as verified, age depletion as failure probability, or unsupported assumptions as decision-grade results.

### Slice 1 — Canonical projection and lineage contract

**Goal:** Create one trustworthy derived model over canonical Home Record facts.

**Work**

- Define stable component identity.
- Add field-level source, source-field, observation date, verification, derivation method, model version, and conflict state.
- Separate verified, reported, document-derived, inferred, default, conflicted, and unknown states.
- Support multiple components of the same type.
- Define supersession and retirement.
- Add projection version and dependency graph.
- Preserve the last good projection.
- Define privacy and authorization for projection consumers.

**Dependencies:** Slice 0  
**Exit criterion:** Every derived fact is traceable, correctly classified, and safely consumable without becoming canonical truth.

### Slice 2 — Home Record correction and reconciliation

**Goal:** Give homeowners control over the facts that drive the projection, without creating a new universal record surface.

**Scope clarification:** "Home Record" is the existing property overview hub (`/dashboard/properties/[id]`, reached via `recordHref` from Unified Home and the Home Record job navigation entry), not a page that needs to be built. This slice adds a property-scoped fact-readiness and reconciliation *summary* to that existing hub. Corrections themselves remain owned by their existing canonical surfaces — property profile/edit, inventory, rooms, documents, policy, warranty, and project detail. A new universal Home Record CRUD page is explicitly out of scope.

**Work**

- Add a fact-readiness and reconciliation summary to the existing property overview hub: known, inferred, missing, and conflicting facts relevant to the projection.
- Link each summary row to its existing owning surface (property edit, inventory, rooms, documents, policy, warranty, project detail) rather than building new correction UI.
- Add confirmation, leave-unknown, and conflict-resolution actions at the point where each fact is already editable today.
- Write corrections to canonical models via the existing surfaces.
- Add document/inventory source linking.
- Reconcile additions, deletions, replacement, retirement, and duplicate components.
- Recompute affected projection fields after canonical changes.
- Preserve entity focus and return context when linking out from the summary.

**Dependencies:** Slice 1  
**Exit criterion:** Every material inferred or conflicting fact is visible from the Home Record hub summary, links to its correct existing owning surface, and has an audit trail — without a new standalone correction page.

### Slice 3 — Status and lifecycle consolidation

**Goal:** Remove duplicate home-state surfaces.

**Work**

- Feed evidence-bounded current state to Status Board.
- Feed service-life ranges and replacement windows to Capital Timeline.
- Remove the standalone system-map summary and property preview.
- Redirect current summary deep links to the appropriate canonical entity or planning surface.
- Preserve entity focus and launch context.
- Add contextual Home Actions for missing facts and material planning windows.

**Dependencies:** Slices 1–2  
**Exit criterion:** Home Record, Status Board, and Capital Timeline each own one clear homeowner question with no competing Digital Twin summary.

### Slice 4 — Evidence-qualified Home Upgrade Planner

**Goal:** Rebuild scenarioing around a specific homeowner decision.

**Work**

- Create repair, replace, upgrade, and wait options.
- Add scenario-specific readiness.
- Add immutable assumptions and evidence snapshots.
- Use ranges rather than unsupported point values.
- Integrate reviewed cost, utility, incentive, risk, and equipment sources where available.
- Add sensitivity analysis.
- Compare options with clear trade-offs.
- Add category-specific professional and safety boundaries.
- Queue scenario computation and record computation runs.

**Dependencies:** Slices 1–3  
**Exit criterion:** A scenario can produce a transparent comparison whose confidence is bounded by relevant evidence.

### Slice 5 — Decision and execution loop

**Goal:** Convert scenario exploration into homeowner value.

**Work**

- Add select, reject, defer, revise, and close outcomes.
- Record decision reason.
- Connect professional inspection where needed.
- Connect Service Price Radar for quote review.
- Connect Renovation Advisor for project risk.
- Connect incentive discovery.
- Connect reserve and capital planning.
- Create or connect a project.
- Reconcile completed work to canonical facts and Home Timeline.

**Dependencies:** Slice 4  
**Exit criterion:** A homeowner can move from question to decision to accepted next action without duplicate entry.

### Slice 6 — Outcome-first experience and accessibility

**Goal:** Make the capability understandable without knowing what a digital twin is.

**Work**

- Replace technology-first copy with homeowner jobs.
- Provide consistent desktop and mobile hierarchy.
- Show known, missing, conflicting, and stale facts.
- Explain why each missing fact matters.
- Add source, date, range, assumption, and sensitivity disclosures.
- Add edit, compare, delete, defer, and decision controls.
- Implement responsive, keyboard, focus, screen-reader, contrast, and reduced-motion acceptance.
- Add useful empty, partial, degraded, stale, and returning states.

**Dependencies:** Slices 2–5  
**Exit criterion:** Every screen answers what this is, why it helps, what matters, what is missing, and what the homeowner controls.

### Slice 7 — Reliability, operational controls, and acceptance

**Goal:** Make projection and scenario behavior safe and observable.

**Work**

- Add dependency-driven recomputation.
- Deduplicate concurrent runs.
- Add retry and last-good behavior.
- Add source-health and model-version controls.
- Add projection, scenario, API, browser, and accessibility suites.
- Add category disable and model rollback switches.
- Add operator diagnostics without exposing technical noise to homeowners.

**Dependencies:** Slices 1–6  
**Exit criterion:** Complete acceptance and operational matrices pass, and stale or failed computations cannot appear current.

### Slice 8 — Measurement and documentation alignment

**Goal:** Measure realized outcomes and establish one source of product truth.

**Work**

- Instrument fact corrections, planning comparisons, decisions, handoffs, and completed work.
- Measure projection freshness and conflict resolution separately from engagement.
- Measure expected-versus-actual cost and outcome only with homeowner control.
- Rewrite functional and framework documentation.
- Document source governance, model boundaries, degradation, rollback, and schema reconciliation.
- Remove obsolete standalone-route, hook, service, and QA claims.

**Dependencies:** Each earlier slice updates affected documentation; this slice performs final reconciliation  
**Exit criterion:** Analytics measure homeowner value and all documentation describes the same target architecture.

---

## 13. Proposed Persistence Model

### 13.1 Canonical fact rule

The projection must never own facts that belong to:

- property profile;
- system or appliance inventory;
- rooms;
- documents;
- projects;
- inspections;
- maintenance;
- completed work.

Homeowner corrections update those canonical records.

### 13.2 Projection entities

The target projection should include:

#### Home model version

- property;
- generation context version;
- model version;
- dependency fingerprint;
- status;
- generated time;
- last good time;
- stale reason;
- run reference.

#### Projected component

- stable canonical component identity;
- component type and subtype;
- active/retired/superseded state;
- projection status;
- relevant source links.

#### Projected fact

- field name;
- value and unit;
- fact state;
- canonical source record and field;
- observed/effective date;
- source verification;
- derivation method and version;
- confidence or uncertainty;
- conflict group;
- correction destination.

### 13.3 Scenario entities

#### Upgrade decision workspace

- property and component/project context;
- homeowner objective;
- decision status;
- options;
- selected option;
- decision reason;
- handoff and completion references.

#### Scenario option

- option type;
- timing;
- user assumptions;
- source assumptions;
- baseline version;
- calculation version;
- readiness;
- warnings;
- result status.

#### Scenario run

- immutable baseline facts;
- immutable input assumptions;
- source releases;
- model version;
- queued/started/completed timestamps;
- status and error;
- output ranges;
- sensitivity results;
- quality flags.

#### Scenario impact

- impact type;
- low/base/high values;
- unit and time horizon;
- source class;
- confidence;
- assumption dependencies;
- qualification text.

### 13.4 Existing model disposition

Consider:

- replacing the aggregate `confidenceScore` as the primary contract;
- replacing ambiguous `conditionScore` and `failureRiskScore` with evidence-specific planning fields;
- removing unused `READY` states if the target lifecycle does not require them;
- removing arbitrary custom computed impacts;
- replacing the current shallow `baselineSnapshot`;
- adding computation-run ownership for scenario runs;
- removing duplicate component confirmation storage if canonical entities own confirmation;
- removing current scenario records rather than maintaining compatibility.

### 13.5 Schema implementation rule

Because there are no real users:

- edit `schema.prisma` directly;
- do not create a migration directory;
- do not backfill current twins or scenarios;
- do not maintain obsolete enums or JSON shapes;
- do not dual-write old and new models;
- regenerate and validate Prisma artifacts;
- document that the user must reconcile the database.

---

## 14. Acceptance Matrix

| Scenario | Expected result | Canonical next action |
|---|---|---|
| Fresh property with one fact | No inferred full-home model promoted | Continue Home Record setup |
| Construction year only | Component dates remain inferred or unknown | Confirm or add evidence |
| Multiple HVAC systems | Separate stable components | Review each system |
| Conflicting install dates | Conflict shown; no silent winner | Resolve in Home Record |
| Missing condition evidence | No failure probability | Inspect, confirm, or use broad planning window |
| Stale projection | Last good data qualified as stale | Recompute affected projection |
| Projection refresh fails | Last good projection retained with warning | Retry/operator diagnosis |
| Component retired after replacement | Old component superseded; new component active | Review completion record |
| Scenario without relevant baseline | Assumption checklist; no recommendation | Add evidence or continue as rough planning |
| Heuristic-only cost | Broad planning range | Get a quote or use Price Radar |
| Energy scenario without usage/tariff | No annual-savings or payback conclusion | Add utility baseline |
| Solar without roof/site evidence | No suitability recommendation | Complete site/roof assessment |
| Insurance impact without carrier evidence | No discount claim | Verify with insurer |
| User-entered expected impact | Clearly labeled assumption | Include only in sensitivity view |
| Computed scenario | Immutable assumptions and ranges visible | Compare options |
| Recompute after source change | New run; explicit changes shown | Accept new result or retain prior decision |
| Wait/do-nothing option | Timing and uncertainty shown | Monitor or set review date |
| Safety-sensitive component | Professional boundary visible | Inspection/licensed professional |
| Option selected | Decision and reason recorded | Start canonical handoff |
| Work completed | Canonical facts and timeline updated | Track warranty/maintenance |
| No active decision | No primary Home/Digital Twin card | Contextual discovery only |
| Active decision | Outcome-specific Home Action | Resume exact planning stage |

---

## 15. Testing Strategy

### 15.1 Unit

Cover:

- fact-state classification;
- source precedence and conflicts;
- component identity;
- multiple-component support;
- supersession and retirement;
- age and service-life range calculations;
- readiness by scenario;
- recommendation eligibility;
- output evidence gates;
- ranges and sensitivity;
- stale detection;
- completion semantics.

### 15.2 Integration

Cover:

- projection generation from canonical sources;
- correction and recomputation;
- document/inventory source linking;
- concurrent run deduplication;
- last-good behavior;
- scenario run snapshots;
- source/model versioning;
- failure states;
- property and household authorization;
- decision and handoff persistence;
- completed-work reconciliation.

### 15.3 Browser acceptance

Cover:

- fresh property;
- partial facts;
- known/inferred/conflicted facts;
- multiple systems;
- stale and failed projection;
- active scenario;
- comparison;
- safety boundary;
- decision and handoff;
- completed work;
- Home Record correction;
- Status Board and Capital Timeline integration;
- Home placement;
- desktop, tablet, and mobile;
- keyboard-only, screen reader, zoom, contrast, and reduced motion.

### 15.4 Operational

Cover:

- projection queue outage;
- bad source release;
- model rollback;
- dependency-event replay;
- source record deletion;
- stale threshold;
- scenario provider outage;
- category disable;
- schema reconciliation;
- privacy and audit-log inspection.

### 15.5 Current verification baseline

At audit time:

- no dedicated Digital Twin builder, quality, recommendation, scenario-calculation, route-integration, or frontend browser tests were found;
- available Phase 6 tests verify projection policy, mutation role floors, and staleness-envelope wiring;
- a focused run of three Phase 6 suites produced 37 passes and one unrelated failure in a worker Dockerfile assertion;
- existing source-inspection tests do not validate the homeowner-facing calculations or status semantics.

This is not sufficient evidence for an active, material-decision capability.

---

## 16. Success Measures

### 16.1 Projection quality

- percentage of material projected facts with field-level lineage;
- percentage verified, inferred, conflicted, stale, and unknown;
- median time from canonical update to projection refresh;
- duplicate-component rate;
- conflict-resolution rate;
- stale-projection exposure;
- failed-run recovery time.

### 16.2 Homeowner outcomes

- material facts corrected or confirmed;
- upgrade workspaces reaching an explicit decision;
- time from active question to decision;
- percentage of comparisons including a wait/do-nothing option;
- accepted handoff rate;
- completed-work reconciliation rate;
- percentage of decisions with final actual cost and system record updated voluntarily.

### 16.3 Trust measures

- percentage of impacts with complete source and assumption disclosure;
- unsupported-claim incidents;
- homeowner result override rate;
- scenario result variance after adding evidence;
- expected-versus-actual cost and savings where voluntarily available;
- safety-escalation compliance.

### 16.4 Experience measures

- homeowner can explain the purpose without defining “digital twin”;
- homeowner can distinguish known from inferred;
- homeowner can correct a material fact;
- homeowner can identify which assumption drives the result;
- homeowner can compare at least two options and wait;
- reduced abandonment from setup or technical terminology.

### 16.5 Guardrails

- zero inferred facts labeled verified or known;
- zero age-only failure probabilities;
- zero unsupported insurer discount claims;
- zero custom assumptions displayed as system evidence;
- zero green health indicators from incompatible statuses;
- zero view-only completions;
- zero permanent Home promotion without an active outcome;
- zero stale scenario results shown without qualification.

---

## 17. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Removing the branded route appears to reduce functionality | Stakeholder concern | Preserve and improve the underlying projection and planner outcomes |
| More explicit unknowns make the model look less complete | Short-term perception | Prefer credible partial value over false completeness |
| Field-level lineage increases schema complexity | Engineering effort | Use a normalized projection-fact contract and clear canonical ownership |
| Scenario data sources remain sparse | Limited conclusions | Provide readiness, assumptions, ranges, and next-evidence actions |
| Corrections create conflicts across records | Data inconsistency | Canonical conflict resolution and audit history |
| Upgrade planning overlaps adjacent tools | Continued fragmentation | Define canonical stage ownership and handoffs before UI build |
| Event-driven recomputation creates load | Reliability/cost | Targeted invalidation, deduplication, queues, and dependency fingerprints |
| Homeowners interpret planning ranges as quotes | Financial mistake | Clear labels and Service Price Radar handoff |
| Safety-sensitive scenarios encourage action | Homeowner harm | Professional boundaries and category-specific gates |
| Actual outcomes are incomplete or self-reported | Weak model learning | Keep self-reported outcomes separate and never auto-promote to evidence |

---

## 18. Definition of Done

The Home Digital Twin exercise is complete when:

- the Digital Twin is an internal projection, not a competing source of truth;
- Home Record owns fact review and correction;
- Status Board owns current attention;
- Capital Timeline owns lifecycle planning;
- Home Upgrade Planner owns active scenario decisions;
- permanent Digital Twin Home/property prominence is removed;
- every projected fact has correct provenance and fact state;
- inferred dates cannot appear known;
- age does not appear as failure probability;
- component identity supports multiple systems and reconciliation;
- scenario readiness is specific to the question;
- heuristic impacts are ranges with explicit assumptions;
- unsupported financial, insurance, risk, and value claims are suppressed;
- custom assumptions cannot masquerade as computed evidence;
- scenarios include alternatives, wait, and sensitivity;
- scenario runs are reproducible and observable;
- a homeowner can correct, compare, decide, and hand off;
- completed work updates canonical facts and timeline;
- completion measures homeowner value rather than output viewing;
- contextual placement follows the framework;
- accessibility and responsive acceptance pass;
- full unit, integration, browser, and operational suites pass;
- schema changes are direct, with no migration scripts;
- functional, framework, support, and operational documentation agree.

---

## 19. Recommended Immediate Next Step

Begin with **Slice 0 — Product truth and immediate containment**.

The first change should not be a larger scenario engine or a visual redesign. It should:

- correct the property preview;
- stop inferred facts from appearing known;
- remove failure-probability wording;
- contain unsupported financial and risk impacts;
- correct framework safety and completion;
- remove permanent Digital Twin prominence.

Then implement the projection lineage and Home Record correction contract before rebuilding scenario planning.

This sequence prevents a polished experience from amplifying unreliable conclusions and ensures later planning features are built on a trustworthy Living Home Record.

