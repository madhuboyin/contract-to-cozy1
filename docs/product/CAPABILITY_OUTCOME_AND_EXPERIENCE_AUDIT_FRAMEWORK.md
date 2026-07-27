# Capability Outcome and Experience Audit Framework

| Field | Value |
| --- | --- |
| Status | Recommended operating framework |
| Version | 1.0 |
| Date | July 27, 2026 |
| Accountable product area | Homeowner Product |
| Governing strategy | [ContractToCozy Product Framework](./ContractToCozy_Product_Framework.md) |
| Capability governance | [Capability Discovery and Recommendation Platform FRD](./CAPABILITY_DISCOVERY_AND_RECOMMENDATION_PLATFORM_FRD.md) |
| Current inventory | [Current Capability Inventory](./capability-discovery/current-capability-inventory.md) |
| Strategic baseline | [ContractToCozy Strategic Product Audit v2](../audit/contracttocozy-strategic-audit-v2-2026-04-18.md) |
| Reference implementation lesson | [Home Event Radar](../functional/HOME_EVENT_RADAR.md) |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Decision and Relationship to the Product Framework](#2-decision-and-relationship-to-the-product-framework)
3. [Current Portfolio Baseline](#3-current-portfolio-baseline)
4. [Problem Statement and Home Event Radar Lessons](#4-problem-statement-and-home-event-radar-lessons)
5. [Goals and Non-Goals](#5-goals-and-non-goals)
6. [Audit Principles](#6-audit-principles)
7. [Homeowner Question Contract](#7-homeowner-question-contract)
8. [Functional Completeness Model](#8-functional-completeness-model)
9. [Best-in-Class Capability Standard](#9-best-in-class-capability-standard)
10. [Product-Framework Conformance](#10-product-framework-conformance)
11. [Surface Placement Rules](#11-surface-placement-rules)
12. [Scoring and Portfolio Disposition](#12-scoring-and-portfolio-disposition)
13. [Recommended Review Waves](#13-recommended-review-waves)
14. [Audit and Delivery Method](#14-audit-and-delivery-method)
15. [Required Deliverables](#15-required-deliverables)
16. [Reusable Capability Audit Template](#16-reusable-capability-audit-template)
17. [Acceptance and Quality Gates](#17-acceptance-and-quality-gates)
18. [Measurement](#18-measurement)
19. [Governance](#19-governance)
20. [Risks and Mitigations](#20-risks-and-mitigations)
21. [Recommended Pilot](#21-recommended-pilot)
22. [Definition of Done](#22-definition-of-done)

---

## 1. Executive Summary

ContractToCozy has substantial functional depth, but capability breadth does not automatically
produce homeowner value. A tool can contain strong domain logic and still become a dead feature
when it does not make its purpose, benefit, readiness, result, next action, controls, or trust
boundary clear.

The Home Event Radar review demonstrated the recurring failure modes:

- the product exposed internal monitoring state instead of homeowner value;
- initialization appeared as a prominent problem even though the homeowner could not act;
- passive status displaced ranked, tangible home actions;
- unsupported sources and empty results required more truthful language;
- strong backend capabilities were hidden behind technical terminology and duplicate panels; and
- a tool-specific dashboard card created a priority system parallel to Unified Home.

This framework defines a repeatable review for every remaining homeowner capability. It combines:

1. a functionality-gap assessment;
2. a best-in-class outcome assessment;
3. a homeowner experience and content assessment;
4. Product Framework and capability-contract conformance;
5. a portfolio decision to double down, improve, merge, reposition, or retire; and
6. a bounded roadmap and implementation plan only after that portfolio decision.

The objective is not to make every tool larger or more prominent. The objective is to make the
overall product more coherent, trustworthy, actionable, and valuable.

---

## 2. Decision and Relationship to the Product Framework

### 2.1 Governing decision

> Home Actions determine what matters. Capabilities help the homeowner understand or resolve those
> actions. Tools do not create a parallel priority system.

This audit framework is an operational companion to the Product Framework. It does not replace:

- the three homeowner jobs;
- the Living Home Record;
- canonical Home Actions;
- recommendation governance;
- capability discovery and readiness;
- safety and commercial-integrity requirements; or
- existing domain FRDs.

It determines whether each capability fulfills those contracts in product behavior and experience.

### 2.2 Unit of review

The default unit is an **outcome family**, not an individual route. Closely related capabilities
shall be reviewed together when they:

- solve overlapping homeowner jobs;
- reuse the same data and calculations;
- hand off to one another;
- appear as global and property-scoped variants;
- compete for the same dashboard placement; or
- differ mainly in presentation rather than outcome.

This is necessary to identify consolidation opportunities before investing in isolated redesigns.

### 2.3 Decision order

Every review shall follow this order:

1. Confirm the homeowner job and intended outcome.
2. Decide whether the capability should exist independently.
3. Confirm its Product Framework contract and placement.
4. Identify missing functionality and trust requirements.
5. Design the homeowner experience.
6. Produce a roadmap and implementation plan.

UI redesign before the first three decisions is prohibited because it can make portfolio
fragmentation more attractive without making the product more coherent.

---

## 3. Current Portfolio Baseline

The generated capability inventory currently records:

| Measure | Count |
| --- | ---: |
| Distinct capabilities | 52 |
| Verified canonical routes | 52 |
| Contextual capabilities | 24 |
| Catalog-only capabilities | 27 |
| Workflow-only capabilities | 1 |
| Capabilities with explicit relationships | 32 |

The strategic product audit also identifies:

- approximately 40 homeowner-facing decision routes;
- approximately 14 duplicate route pairs;
- uneven trust and completion UX;
- overlapping intelligence, cost, coverage, and planning surfaces; and
- strong backend depth with inconsistent end-to-end resolution.

Home Event Radar is the reference review. This leaves approximately 51 registered capabilities
requiring portfolio disposition or evidence that an equivalent review is already complete.

Inventory inclusion and route verification do not prove that a capability:

- works with production-grade data;
- delivers its declared homeowner outcome;
- deserves contextual promotion;
- has complete actions and lifecycle handling;
- meets its safety tier;
- communicates clearly; or
- should remain a standalone tool.

---

## 4. Problem Statement and Home Event Radar Lessons

### 4.1 Homeowner problem

Homeowners arrive with situations, not tool names:

- “What needs my attention?”
- “What is likely to cost me money?”
- “What should I do before this gets worse?”
- “What information is missing?”
- “Can I trust this result?”
- “What can I change or control?”

A capability fails when the homeowner must understand ContractToCozy’s internal architecture before
they can understand the value.

### 4.2 Product problem

The current portfolio risks:

- presenting tools as destinations rather than outcome engines;
- duplicating the same job across several routes;
- promoting passive or incomplete states above actionable work;
- exposing technical states, filters, and diagnostics too early;
- ending at insight without supporting action and completion;
- asking for information without explaining its benefit;
- claiming coverage or confidence unsupported by real data;
- failing to write decisions and outcomes back to the Living Home Record; and
- measuring page views instead of homeowner value.

### 4.3 Home Event Radar lessons to generalize

1. **Do not confuse operational state with homeowner value.**
2. **Do not show setup language unless the homeowner can perform a specific setup action.**
3. **Do not render passive capabilities as permanent high-priority dashboard cards.**
4. **Do not treat a zero result as proof of safety, savings, or completion.**
5. **Do not expose raw source mechanics before explaining the homeowner outcome.**
6. **Do not create tool-specific priority systems outside canonical Home Actions.**
7. **Do show exactly what information is missing, why it helps, and where to add it.**
8. **Do preserve source, freshness, confidence, assumptions, and limitations.**
9. **Do connect insight to an executable next step and a durable completion signal.**
10. **Do let framework-owned contextual discovery handle passive tool visibility.**

---

## 5. Goals and Non-Goals

### 5.1 Goals

For every capability or outcome family:

- identify current functional gaps;
- define the minimum credible and best-in-class outcome;
- make homeowner value and time to value explicit;
- make readiness and missing context actionable;
- ensure the output produces a safe next step;
- align placement with recommendation mode and canonical priority;
- reuse the Living Home Record and shared workflows;
- eliminate duplicate experiences and parallel systems;
- define meaningful completion and lifecycle behavior;
- define acceptance criteria and value measurement; and
- recommend double down, improve, merge, reposition, or retire.

### 5.2 Non-goals

The audit shall not:

- guarantee that every capability remains standalone;
- add features merely to match a competitor checklist;
- make every tool eligible for Unified Home promotion;
- replace canonical actions, incidents, guidance, projects, or records;
- create new navigation destinations without a product-framework decision;
- invent production data, confidence, savings, or source coverage;
- convert professional guidance into unqualified advice; or
- create a comprehensive FRD before the portfolio disposition is approved.

---

## 6. Audit Principles

### 6.1 Outcome before interface

The review begins with the homeowner outcome, not the current screen.

### 6.2 One job, one coherent journey

Several internal services may contribute to an outcome, but the homeowner should not have to move
among loosely connected tools to complete one job.

### 6.3 Context before questions

Capabilities shall reuse known property, household, document, system, project, and journey context.
They shall not ask the homeowner to re-enter data already present in the Living Home Record.

### 6.4 Progressive value

Partial context should produce safe partial value when possible. Missing optional context shall
improve specificity rather than block the entire experience.

### 6.5 Action before exploration

When a real action exists, it outranks capability promotion. Explore Tools remains available but
does not compete with the attention feed.

### 6.6 Truth before reassurance

Unavailable, delayed, incomplete, stale, low-confidence, unsupported, and error states must remain
distinct. None may be translated into a false all-clear or guaranteed benefit.

### 6.7 Closed-loop value

The target loop is:

```text
Recognize → Explain → Prepare → Decide → Act → Verify → Remember → Improve
```

### 6.8 Control without configuration burden

Expose homeowner controls when they change a meaningful outcome. Do not lead with settings,
filters, or preferences before the homeowner understands the value.

### 6.9 Consolidation is a successful outcome

Removing a duplicate route or merging overlapping tools can create more product value than adding
features to both.

---

## 7. Homeowner Question Contract

Every applicable capability shall answer the following questions in the primary experience.

### 7.1 “What is this?”

State the homeowner job in one sentence. Avoid internal mechanisms, model names, source-family
language, and product architecture.

Required test:

> A homeowner unfamiliar with the feature name can explain its purpose after reading the first
> screen.

### 7.2 “How will this benefit me?”

Name the outcome:

- save money;
- prevent damage;
- reduce uncertainty;
- avoid a mistake;
- prepare for an expense;
- make a decision;
- complete a project; or
- create a durable home record.

Where evidence permits, state expected time to value or a bounded quantified result. Do not invent
financial savings or risk reduction.

### 7.3 “What should I do to realize the full benefit?”

Show:

- what information is already available;
- what required or optional information is missing;
- why each missing fact improves the result;
- one direct route to provide or correct it; and
- whether the page updates automatically afterward.

“Setup needed” without the exact missing requirement and a working action fails the audit.

### 7.4 “What should I care about?”

Lead with a prioritized conclusion:

- what changed or was discovered;
- why it matters to this home;
- urgency and timing;
- confidence, freshness, and assumptions; and
- the recommended next move.

Do not lead with filters, implementation state, source diagnostics, or grids of zeros.

### 7.5 “What can I control?”

Expose relevant controls such as:

- correct known facts;
- adjust scenario assumptions;
- save, dismiss, defer, restore, or complete;
- select notification preferences;
- choose a decision or plan;
- control data sharing and commercial contact;
- acknowledge a limitation; or
- request professional help.

Controls must have durable effects and visible feedback.

### 7.6 “Why should I trust this?”

Mandatory for financial, coverage, safety, tax, legal, provider, and risk capabilities:

- source and observation date;
- freshness;
- confidence;
- known facts and assumptions;
- missing evidence;
- limitations;
- professional boundary;
- commercial relationship; and
- correction or feedback path.

---

## 8. Functional Completeness Model

Each capability shall be reviewed across the complete outcome lifecycle.

| Stage | Required questions | Common gap |
| --- | --- | --- |
| Trigger | What makes this capability relevant now? | Permanent promotion without a trigger |
| Context | What does ContractToCozy already know? | Repeated homeowner data entry |
| Readiness | What is required, optional, missing, or stale? | Generic “setup needed” |
| Data | Is the source real, current, permitted, and appropriately scoped? | Demo or unsupported data presented as live |
| Logic | Is the result deterministic, bounded, tested, and explainable? | Opaque score or heuristic |
| Output | What homeowner result is produced? | Raw metrics without a conclusion |
| Explanation | Why does the result apply to this home? | Generic educational copy |
| Decision | What choices are available and what are the tradeoffs? | Single recommendation without alternatives |
| Action | Can the homeowner safely take the next step? | Dead-end output |
| Completion | How is value completion observed? | Page view treated as completion |
| Persistence | What is written to the Living Home Record? | Decision or artifact disappears |
| Lifecycle | How does the output update, expire, resolve, or reopen? | Permanently stale result |
| Control | What can be corrected, configured, or dismissed? | Cosmetic controls |
| Failure | Are error, unavailable, delayed, and empty distinct? | Failure rendered as a successful zero |
| Integration | Does it reuse actions, guidance, incidents, projects, providers, and documents? | Parallel workflow |
| Operations | Can source health, failures, and usage be monitored safely? | Silent degradation |

### 8.1 Minimum credible capability

A capability is not launch-credible unless it has:

- a defensible data or homeowner-input path;
- an explainable result;
- one safe next step;
- a meaningful completion definition;
- truthful empty and error states;
- appropriate persistence or explicit ephemerality;
- a canonical route and placement;
- safety-tier conformance; and
- focused automated acceptance.

### 8.2 Best-in-class capability

A best-in-class capability additionally:

- anticipates the homeowner’s situation from known context;
- produces useful partial value before perfect setup;
- explains property-specific drivers and uncertainty;
- supports comparison or scenario exploration where appropriate;
- connects to execution without re-entry;
- observes completion and downstream outcome;
- improves the Living Home Record;
- becomes more useful as the home record grows;
- triggers only when relevant; and
- disappears or becomes quiet when it has nothing useful to say.

---

## 9. Best-in-Class Capability Standard

“Best in class” is assessed against the homeowner job, not feature count.

### 9.1 Value

- The result changes a homeowner decision or action.
- The benefit is understandable without domain expertise.
- Time to first value is appropriate to the job.
- Revisit value is based on a real lifecycle, not artificial engagement.

### 9.2 Intelligence

- Known home facts materially improve the result.
- Unknown facts do not increase confidence or risk.
- Recommendations cite the facts and rules that drove them.
- Scenario tools expose assumptions and tradeoffs.

### 9.3 Actionability

- The primary action is safe and specific.
- Destinations preserve property, item, issue, project, and journey context.
- The user does not repeat setup already known by the platform.
- Completion is observed through a durable domain event where feasible.

### 9.4 Trust

- Source, freshness, confidence, and limitations are visible at the right level.
- Regulated or professional boundaries are clear.
- Commercial incentives are disclosed.
- User corrections are auditable and reusable.

### 9.5 Experience

- The first screen answers the Homeowner Question Contract.
- The primary result is visually dominant.
- Advanced evidence and controls use progressive disclosure.
- Empty states explain continuing value or the next useful action.
- Mobile, keyboard, screen-reader, reduced-motion, and responsive behavior are verified.

### 9.6 Product coherence

- The capability uses canonical Home Actions and shared workflows.
- It does not duplicate another tool’s outcome.
- It follows its recommendation mode.
- It writes useful decisions, artifacts, or corrections back to the Living Home Record.

---

## 10. Product-Framework Conformance

Every audit shall record and verify:

| Contract field | Audit question |
| --- | --- |
| Primary homeowner job | Is this Stay Ahead, Decide With Confidence, or Navigate Major Moments? |
| Outcome category | Does the registered category match the actual experience? |
| Homeowner outcome | Is the promised result concrete and delivered? |
| Expected time to value | Is it credible and reflected in the UX? |
| Primary destination | Does the capability live in the correct product area? |
| Recommendation mode | Contextual, catalog-only, or workflow-only? |
| Trigger families | Are contextual triggers reviewed and real? |
| Readiness requirements | Are missing requirements exact and actionable? |
| Safety tier | Are governance, fallback, and escalation appropriate? |
| Completion kind | Is completion a view, output, artifact, decision, action, or plan? |
| Completion signal | Can the platform observe it reliably? |
| Home Record reads | Does the tool reuse relevant known context? |
| Home Record writes | Does the result make future experiences better? |
| Accepted context | Are deep links and handoffs scoped correctly? |
| Lifecycle | Does rollout, disablement, and analytics use the canonical registry? |

Any mismatch between manifest and product behavior is a launch defect.

---

## 11. Surface Placement Rules

| Capability state | Correct surface |
| --- | --- |
| Canonical NOW/SOON action | Ranked Unified Home attention |
| Active project or journey | Plan & Projects or active major moment |
| Contextually useful capability | Framework-owned contextual suggestion |
| General capability with no reviewed trigger | Explore Tools catalog |
| Workflow dependency | Workflow-only placement |
| Passive healthy monitoring | Tool detail or quiet secondary status |
| Initialization with no homeowner action | Tool detail; no alert treatment |
| Missing shared home facts | Shared Home Record setup |
| Material error affecting trust | Bounded error or degraded state near the affected output |
| Awareness-only output | Tool feed, digest, timeline, or record according to lifecycle |

### 11.1 Prohibited placement

- permanent standalone cards above ranked actions;
- capability-specific priority scores on Unified Home;
- duplicate presentation of an event already promoted to Incident or Guidance;
- catalog promotion represented as a homeowner action;
- passive zero-state metrics given alert styling; and
- workflow-only capabilities promoted through general discovery.

---

## 12. Scoring and Portfolio Disposition

### 12.1 Scorecard

Score each dimension from 0 to its maximum.

| Dimension | Weight |
| --- | ---: |
| Homeowner value and differentiation | 20 |
| Functional completeness | 20 |
| Actionability and closed-loop completion | 15 |
| Data quality, freshness, and trust | 15 |
| UX clarity and readiness | 15 |
| Product-framework integration | 10 |
| Accessibility, performance, and reliability | 5 |
| **Total** | **100** |

Scores require written evidence. Route existence, code volume, or a polished screenshot is not
evidence of homeowner value.

### 12.2 Portfolio disposition

| Decision | Meaning |
| --- | --- |
| Double down | Strong differentiated value; close gaps, improve execution, and scale |
| Improve | Valid independent job but incomplete functionality or experience |
| Merge | Useful components belong in one coherent outcome family |
| Reposition | Valuable only contextually, in a workflow, or in the catalog |
| Retire or hide | No credible current outcome, data path, or strategic value |

### 12.3 Suggested score interpretation

| Score | Default recommendation |
| --- | --- |
| 80–100 | Double down or polish |
| 60–79 | Improve with bounded gaps |
| 40–59 | Merge or reposition |
| Below 40 | Hide or retire until a credible outcome exists |

Safety, legal, data-rights, or trust failures override the numerical score.

---

## 13. Recommended Review Waves

Review outcome families rather than isolated tools. Final membership shall be verified against the
generated inventory before each wave.

### Wave 1 — High-value decisions and savings

- Mortgage Refinance Radar
- Service Price Radar
- Hidden Asset Finder
- Coverage Intelligence
- Coverage Options
- Risk Optimizer
- Financing Center

Primary focus: measurable value, assumptions, regulated boundaries, execution, and completion.

### Wave 2 — Maintenance and home operations

- Status Board
- Maintenance and Seasonal Tasks
- Home Habit Coach
- Project Tracker
- Appliance Oracle
- Inspection Hub

Primary focus: one operational model, task lifecycle, reminders, evidence, and elimination of
duplicate work surfaces.

### Wave 3 — Property intelligence and monitoring

- Home Score
- Home Digital Twin
- Home Risk Replay
- Climate Risk
- Neighborhood Change Radar
- Home Gazette
- Home Timeline

Primary focus: differentiation, explainability, revisit value, event-driven placement, and
consolidation of overlapping “home intelligence” concepts.

### Wave 4 — Cost, tax, and ownership economics

- True Cost
- Cost Growth
- Cost Volatility
- Cost Explainer
- Property Tax
- Tax Appeal
- Break-Even
- Reserve Fund Planner

Primary focus: consolidation into fewer homeowner journeys, source quality, scenario assumptions,
and decision/action continuity.

### Wave 5 — Specialized and lower-frequency capabilities

- Plant Advisor
- HOA Compliance
- Permit Tracker
- Renovation Risk Advisor
- Seller Prep
- Home Digital Will
- Material Specs

Primary focus: contextual invocation, workflow integration, durable artifacts, and whether each
capability warrants a standalone route.

### Cross-cutting safety track

Review in parallel regardless of wave:

- Emergency Help;
- insurance and coverage capabilities;
- provider recommendation and booking;
- financing and mortgage capabilities;
- tax and appeal guidance; and
- any capability using sensitive or highly sensitive data.

---

## 14. Audit and Delivery Method

### Phase A — Evidence collection

For each family:

1. Resolve canonical capability manifests and routes.
2. Trace APIs, jobs, data sources, persistence, and feature flags.
3. Exercise happy, empty, partial, delayed, error, and unsupported states.
4. Capture desktop and mobile experiences.
5. Review analytics and completion signals.
6. Review related strategic audits, FRDs, ADRs, and runbooks.
7. Identify duplicates and shared domain entities.

### Phase B — Portfolio decision

1. Define the homeowner job and outcome.
2. Score the current capability.
3. Compare overlapping tools.
4. Select double down, improve, merge, reposition, or retire.
5. Approve the target capability boundary before design.

### Phase C — Target experience

1. Define the minimum credible result.
2. Define best-in-class additions.
3. Apply the Homeowner Question Contract.
4. Define readiness and partial-value behavior.
5. Define actions, completion, persistence, and lifecycle.
6. Define framework placement and discovery.
7. Define trust, safety, accessibility, and measurement.

### Phase D — Delivery planning

1. Update or create the governing FRD only for retained target capabilities.
2. Produce a roadmap ordered by homeowner value and dependency.
3. Break work into independently releasable vertical slices.
4. Define acceptance evidence for each slice.
5. Identify schema changes without creating migration scripts unless separately authorized.
6. Define rollout, activation, rollback, and operational evidence.

### Phase E — Implementation and verification

Each slice should preferably deliver:

```text
real input → canonical logic → homeowner output → action → completion → analytics
```

Avoid horizontal phases that build large amounts of infrastructure without a testable homeowner
outcome.

---

## 15. Required Deliverables

### 15.1 Portfolio-level deliverables

- capability disposition register;
- outcome-family map;
- duplicate-route and merge register;
- weighted prioritization backlog;
- cross-cutting safety review;
- dependency and source-readiness map;
- dashboard and navigation placement policy;
- portfolio measurement dashboard; and
- quarterly re-audit cadence.

### 15.2 Capability-family deliverables

1. Current-state review.
2. Functional gap inventory.
3. Best-in-class target definition.
4. Homeowner Question Contract assessment.
5. Product-framework conformance assessment.
6. Trust, safety, and data assessment.
7. Portfolio disposition.
8. Recommended roadmap.
9. Implementation plan.
10. Acceptance matrix.
11. Documentation change list.

### 15.3 Evidence requirements

Recommendations shall cite:

- relevant source code;
- API and persistence contracts;
- real provider or homeowner-input paths;
- screenshots or rendered states;
- automated tests;
- capability manifest metadata;
- strategic or domain documentation; and
- known operational or production behavior.

---

## 16. Reusable Capability Audit Template

Copy this section into a capability-family audit.

### 16.1 Identity

| Field | Answer |
| --- | --- |
| Capability or family | |
| Canonical IDs | |
| Canonical routes | |
| Owner | |
| Release stage | |
| Primary homeowner job | |
| Outcome category | |
| Safety tier | |
| Completion kind | |
| Recommendation mode | |

### 16.2 Homeowner outcome

- Situation that triggers use:
- Current promised outcome:
- Actual delivered outcome:
- Expected time to value:
- Evidence the homeowner values this outcome:

### 16.3 Current functionality

- Inputs and known context:
- Data sources:
- Core rules or calculations:
- Current output:
- Current actions:
- Completion signal:
- Persistence and Home Record writes:
- Lifecycle:
- Failure and empty states:
- Operational controls:

### 16.4 Homeowner Question Contract

| Question | Current answer | Gap | Target answer |
| --- | --- | --- | --- |
| What is this? | | | |
| How will this benefit me? | | | |
| What should I do for full benefit? | | | |
| What should I care about? | | | |
| What can I control? | | | |
| Why should I trust this? | | | |

### 16.5 Functional gaps

| ID | Gap | Homeowner impact | Severity | Evidence | Recommended change |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

### 16.6 Best-in-class additions

For each proposed addition record:

- homeowner problem;
- expected outcome;
- required data;
- action and completion;
- safety boundary;
- reuse of shared platform capabilities;
- cost and operational dependency; and
- evidence that it differentiates the product.

### 16.7 Framework conformance

| Contract | Current | Target | Change required |
| --- | --- | --- | --- |
| Homeowner job | | | |
| Outcome category | | | |
| Destination | | | |
| Recommendation mode | | | |
| Triggers | | | |
| Readiness | | | |
| Safety | | | |
| Completion | | | |
| Home Record reads/writes | | | |
| Analytics | | | |

### 16.8 Portfolio decision

- Score:
- Disposition:
- Rationale:
- Capabilities to merge:
- Routes to redirect or remove:
- Prominence to add or remove:
- Approval owner:

### 16.9 Roadmap

| Slice | Homeowner outcome | Dependencies | Acceptance evidence |
| --- | --- | --- | --- |
| 0 | Truth, safety, and placement corrections | | |
| 1 | Minimum credible end-to-end outcome | | |
| 2 | Readiness and partial value | | |
| 3 | Action and completion | | |
| 4 | Best-in-class differentiation | | |
| 5 | Rollout, observability, and optimization | | |

---

## 17. Acceptance and Quality Gates

### 17.1 Functionality gate

- real input or clearly disclosed homeowner scenario;
- deterministic and tested core logic;
- safe and working primary action;
- meaningful completion;
- lifecycle behavior;
- durable state where required; and
- no unsupported claims.

### 17.2 Experience gate

- first screen answers the applicable homeowner questions;
- missing information is exact and actionable;
- primary result precedes secondary controls;
- technical detail uses progressive disclosure;
- no misleading zero, setup, or all-clear;
- responsive layout;
- keyboard and screen-reader semantics;
- loading stability and error recovery; and
- event/action placement follows canonical ranking.

### 17.3 Framework gate

- manifest matches behavior;
- canonical route and launch context;
- correct recommendation mode;
- reviewed triggers;
- readiness explanations;
- safety fallback;
- Home Record reuse;
- completion telemetry; and
- no parallel priority system.

### 17.4 Trust gate

- source and freshness;
- confidence and assumptions;
- missing evidence;
- correction path;
- professional boundary;
- commercial disclosure;
- privacy classification; and
- fail-closed behavior for material uncertainty.

---

## 18. Measurement

### 18.1 Portfolio measures

- capabilities by disposition;
- standalone routes removed or merged;
- percentage with reviewed framework contracts;
- percentage with meaningful completion signals;
- percentage with production-grade data;
- contextual suggestion precision;
- duplicate action or output rate;
- time to first homeowner value; and
- capability-to-outcome completion rate.

### 18.2 Capability funnel

```text
Eligible → Shown → Opened → Ready → Result produced → Action started
→ Action completed → Outcome verified → Revisited when relevant
```

### 18.3 Guardrail measures

- false or irrelevant recommendation rate;
- unsupported claim incidents;
- setup abandonment;
- error-to-empty conversion;
- stale-result exposure;
- duplicate surface impressions;
- dismissal and “not relevant” rate;
- accessibility regressions;
- latency and failure rate; and
- safety or commercial-governance exceptions.

Page views alone shall not be used to justify capability retention.

---

## 19. Governance

### 19.1 Review team

Each family review should include:

- accountable product owner;
- domain owner;
- design/content owner;
- frontend and backend engineering;
- data/source owner;
- trust, safety, legal, or compliance owner where applicable; and
- analytics owner.

### 19.2 Decision authority

The portfolio disposition must be approved before substantial implementation planning.

Material financial, regulated coverage, safety emergency, sensitive-data, commercial, and
jurisdiction-dependent capabilities require the existing governance approvals in addition to the
product review.

### 19.3 Documentation ownership

- capability inventory remains generated;
- the Product Framework remains the governing strategy;
- the capability platform FRD governs registration and recommendation;
- domain FRDs govern retained functionality;
- ADRs govern irreversible or source-specific decisions; and
- this document governs the audit method and portfolio disposition.

### 19.4 Re-audit triggers

Re-audit when:

- a capability changes outcome or safety tier;
- a new data source changes credibility;
- a route or capability is duplicated;
- completion or retention remains low;
- “not relevant” or dismissal rises materially;
- a new commercial relationship is introduced;
- a tool is proposed for dashboard prominence; or
- a capability has not produced measurable value within its review window.

---

## 20. Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Redesigning every tool independently | More fragmentation | Review outcome families and decide disposition first |
| Treating “best in class” as maximum features | Scope growth without value | Tie additions to homeowner outcomes and completion |
| Polishing unsupported functionality | Trust damage | Audit data and source credibility before UI |
| Promoting every improved tool | Dashboard clutter | Enforce recommendation mode and placement rules |
| Creating new parallel workflows | Duplicate state and actions | Reuse canonical Home Actions and shared destinations |
| Writing FRDs for tools that should merge | Wasted planning | Approve portfolio disposition before full FRD |
| Removing a route without preserving context | Broken journeys | Map aliases, deep links, entities, and completion lineage |
| Overweighting current code investment | Sunk-cost bias | Score homeowner value and differentiation independently |
| Under-testing partial and failure states | Misleading UX | Require state matrices and browser acceptance |
| Improving engagement through artificial alerts | Notification fatigue | Trigger only from material reviewed state |

---

## 21. Recommended Pilot

Validate the framework with four contrasting cases:

### 21.1 Mortgage Refinance Radar

Why:

- Tier 1 homeowner value;
- material financial safety;
- measurable savings outcome;
- external data and alert lifecycle;
- potential dashboard-prominence risk.

### 21.2 Service Price Radar

Why:

- immediate decision value;
- quote and provider workflow integration;
- comparison, confidence, and completion requirements;
- strong opportunity for closed-loop execution.

### 21.3 Home Digital Twin

Why:

- abstract concept requiring a clear homeowner outcome;
- substantial Living Home Record reuse;
- possible overlap with Home Score, Status Board, and Home Record;
- useful test of improve versus merge/reposition.

### 21.4 Property Tax and Tax Appeal

Why:

- natural outcome-family consolidation;
- jurisdiction and source requirements;
- material financial implications;
- clear path from detected change to decision and action.

### 21.5 Pilot success criteria

The pilot succeeds when it:

- produces consistent evidence and scores;
- results in at least one credible consolidation or reposition decision;
- identifies framework metadata corrections;
- produces implementable vertical slices;
- reduces, rather than increases, dashboard and navigation complexity; and
- establishes a review throughput sustainable for the remaining inventory.

---

## 22. Definition of Done

The portfolio exercise is complete when:

1. Every registered homeowner capability has an approved disposition.
2. Related capabilities have been reviewed as outcome families.
3. Duplicate routes and parallel priority systems have approved resolutions.
4. Retained capabilities have verified Product Framework contracts.
5. Every retained capability answers the applicable Homeowner Question Contract.
6. Every retained capability has a minimum credible end-to-end outcome.
7. Material capabilities pass trust, safety, privacy, and commercial gates.
8. Dashboard placement is action-first and contextually governed.
9. Every retained capability has meaningful completion and value measurement.
10. Domain documentation reflects the approved target boundary.
11. Implementation roadmaps are ordered by homeowner outcome, not code layer.
12. Retired or merged capabilities have safe route, data, and workflow disposition plans.
