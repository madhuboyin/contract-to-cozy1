# Capital Decision Planning Capability Audit and Implementation Plan

**Capabilities:** Home Capital Timeline, Reserve Fund Planner, Break-Even,
Do-Nothing Simulator, Repair vs. Replace, and Financing Center  
**Contributing domains:** Home Record, Inventory, Digital Twin, Status Board,
Service Price Radar, Property Tax, Coverage, Ownership Costs, Budget Planner,
Projects, Permits, HOA, Benefits, Guidance, and Home Actions  
**Audit framework:** `CAPABILITY_OUTCOME_AND_EXPERIENCE_AUDIT_FRAMEWORK.md`  
**Audit date:** July 28, 2026  
**Status:** Recommended implementation plan  
**Recommended disposition:** **Consolidate the planning system, turn analytical
tools into decision stages, reposition ownership Break-Even, and contain
unsupported financial and risk claims**  
**Current safety classification:** Material financial  
**Recommended safety classification:** Material financial, with regulated
handoff boundaries for financing, coverage, tax, and permits  
**Primary outcome family:** Capital Decision Planning

---

## 1. Executive Decision

The six named capabilities contain substantial functionality, but they do not
form one capital-decision experience.

Today a homeowner may have to:

1. inspect a system in Inventory or Digital Twin;
2. open Repair vs. Replace;
3. interpret an item-level break-even;
4. open Do-Nothing Simulator for a property-level downside estimate;
5. open Capital Timeline to see a predicted replacement window;
6. interpret a second monthly set-aside calculation;
7. open Reserve Fund for a different monthly target;
8. open Service Price Radar to understand price;
9. remember Property Tax, permit, HOA, warranty, insurance, and incentive
   implications;
10. open Financing Center and re-enter the project cost;
11. compare generic financing benchmarks;
12. find a provider; and
13. create or manage the actual project somewhere else.

That is not one journey. It is a collection of calculators connected by links.

The homeowner job is:

> Help me decide what work this home may need, when to act, whether to maintain,
> repair, replace, upgrade, or wait, what the realistic all-in cost and tradeoffs
> are, how to prepare or pay, and how to carry the decision into execution.

The repository contains strong foundations:

- inventory-backed capital events;
- persisted timeline analyses and line items;
- item-level overrides;
- Digital Twin fact reconciliation and conflict evidence;
- cost ranges, timing windows, confidence labels, and explanations;
- a persisted reserve fund, contribution ledger, and reconciliation workflow;
- saved Repair vs. Replace analyses and decision traces;
- saved Do-Nothing scenarios and runs;
- financing profiles, equity snapshots, rate configuration, and saved project
  financing scenarios;
- Property Context versioning;
- shared financial assumptions;
- contextual Product Framework triggers;
- Guidance journeys;
- Home Action promotion;
- Service Price Radar, Price Finalization, and Project Tracker;
- Property Tax, Coverage, permit, HOA, incentive, and document capabilities;
  and
- completion write-backs from executed projects.

Those foundations do not yet satisfy the Capital Decision Planning outcome.

The most material current problems are:

1. **Capital Timeline and Reserve Fund duplicate the same planning answer.**
   Capital Timeline now presents a “recommended monthly set-aside.” Reserve Fund
   calculates another monthly target from the same timeline and explicitly
   tells the user that its method is different.
2. **The reserve target can ignore money already saved for far-term items.**
   Current balance is proportionally allocated for display and near-term
   shortfall, but the far-term monthly calculation divides the full target—not
   the remaining unfunded amount—by months until due.
3. **Reserve line-item lifecycle is incomplete.** `FUNDED` and `OVERDUE` exist
   in the schema and UI, but the primary recalculation path resets unresolved
   items to `ACTIVE`; no repository path was found that derives those states.
4. **Capital timing, condition, and cost are heavily heuristic.** Static
   lifespan, condition multipliers, state climate factors, category costs, and
   growth assumptions can create a financially prominent date and amount
   without governed source versions or validation evidence.
5. **Capital Timeline confidence measures input completeness more than model
   reliability.** Install date, condition, and a replacement cost can produce
   “high confidence” even when lifespan, climate adjustment, and future price
   model remain broad assumptions.
6. **The timeline covers tracked inventory, not the complete capital needs of
   the property.** Structural, site, envelope, accessibility, compliance,
   planned renovation, and common-area responsibilities may be absent.
7. **Repair vs. Replace uses uncalibrated failure probabilities and verdict
   thresholds.** Category defaults, condition adjustments, repair-count
   increments, property-risk multipliers, and post-replacement risk reduction
   are deterministic but not evidence-governed.
8. **Repair history is semantically noisy.** Inspection and maintenance events
   are counted as repair-like events; the query uses a 30-month lookback while
   variables and copy describe 24 months.
9. **Repair vs. Replace’s break-even is not a complete project payback.** It
   divides incremental upfront cost by modeled annual repair-risk reduction
   without full lifecycle, successful-repair probability, downtime, efficiency,
   residual value, warranty, tax, financing, or replacement timing.
10. **The standalone Break-Even tool solves a different problem.** It asks when
    projected home appreciation plus principal paydown exceeds cumulative
    ownership expenses. It is not project break-even, even though its capability
    definition says “the value of a decision offsets its cost.”
11. **The ownership Break-Even model remains materially incomplete.** It
    consumes the current inconsistent ownership-cost stack, omits capital events,
    accepts a selling-cost assumption it does not apply to the displayed model,
    and can imply a meaningful break-even without acquisition or disposition
    costs.
12. **Do-Nothing is property-wide when the capital decision is item- or
    project-specific.** A homeowner considering one HVAC repair receives a
    simulation influenced by unrelated overdue tasks, claims, coverage gaps,
    property risk, and other aging systems.
13. **Do-Nothing cost ranges are additive heuristics, not expected-loss
    calculations.** Generic maintenance debt, aging impact, claims impact,
    coverage gaps, deductible stress, and a major-event range are combined
    without a calibrated probability and correlation contract.
14. **Do-Nothing may double-count related signals.** Claims, perils, risk
    reports, coverage gaps, maintenance adherence, aging items, and a generated
    major event can describe overlapping exposure.
15. **Unrelated realized-savings signals reduce modeled inaction downside.**
    General savings execution does not change the physical probability or gross
    consequence of a delayed roof, HVAC, plumbing, or safety decision.
16. **“Ignored risks” are narrative only.** A homeowner control can appear to
    change a scenario while the service explicitly keeps the ignored risks in
    the baseline.
17. **Financing Center uses benchmark products as though they are comparable
    options.** HELOC, home-equity loan, personal loan, contractor financing, and
    cash have different term, rate, fee, draw, tax, security, and qualification
    semantics.
18. **HELOC “eligibility” is only an equity screen.** It does not evaluate
    credit, income, debt-to-income, occupancy, property, lender, state, lien,
    documentation, or product requirements.
19. **Financing defaults can appear current when no rate rows exist.** The
    service falls back to hard-coded rates and uses the current timestamp as
    `ratesAsOf`, which can make static defaults look freshly sourced.
20. **Financing calculations omit material terms.** Fees, closing costs,
    variable-rate paths, minimum draws, early closure, interest-only behavior,
    taxes, promotional details, actual offer terms, and household affordability
    are incomplete or absent.
21. **Financing selection is not execution.** A saved option has no
    prequalification, offer, consented handoff, application, approval, funding,
    payment-plan, or adverse-outcome lifecycle.
22. **Cross-tool context is fragile.** Project cost, system, decision, timing,
    source evidence, assumptions, selected option, and outcome are often passed
    in query parameters or re-entered rather than bound to one capital-decision
    record.
23. **Critical adjacent implications are optional detours.** Warranty,
    coverage, permit, HOA, tax reassessment, incentive, energy, resilience,
    safety, and execution dependencies are not consistently evaluated before a
    decision.
24. **Completion semantics conflict.** The portfolio mixes output generation,
    plan creation, scenario saving, and decision recording. Some frontend
    workflows complete on data load even though no choice or plan changed.
25. **Tests emphasize context and route wiring.** There is limited direct golden
    coverage for the core lifecycle, reserve funding math, failure/payback
    calibration, delay attribution, financing comparisons, cross-tool
    continuity, and realized outcome reconciliation.

The recommended product decision is:

1. create one property-scoped **Capital Plan** workspace;
2. make the capital timeline and reserve plan two coordinated views of one
   persisted plan;
3. create one durable **Capital Decision** for every active system, repair,
   replacement, upgrade, or project choice;
4. make **maintain, repair, replace, upgrade, and wait** explicit options;
5. make Repair vs. Replace an option-comparison stage inside the decision;
6. replace property-wide Do-Nothing in this journey with a decision-specific
   **Wait or defer** option using the same evidence and baseline;
7. move the current ownership-tenure Break-Even model into the Ownership
   Strategy/Sell-Hold-Rent family and retire it as a capital-planning peer;
8. create one decision-specific incremental cost/payback engine for capital
   options;
9. make Service Price Radar the owner of market/quote evidence and accepted
   terms;
10. make Property Tax, Coverage, permits, HOA, incentives, and Digital Twin
    governed contributors, not competing decisions;
11. integrate Reserve and Financing as “How to prepare/pay” stages;
12. preserve one source, assumption, price, timing, decision, funding, project,
    and outcome lineage;
13. hand a selected decision into Project Tracker without re-entry;
14. write completion evidence back to Inventory/Home Record, Capital Plan,
    Reserve Fund, Ownership Costs, and Home Timeline; and
15. promote only a material decision or blocked next action through canonical
    Home Actions.

The target promise should be:

> See the major work this home may need, compare realistic options, understand
> the all-in cost and consequence of waiting, choose how to prepare or pay, and
> carry the decision into a completed project.

### 1.1 Implementation constraint

There are no real users and no production data migration requirement.

Implementation may change the Prisma schema directly. It must not create:

- database migration scripts;
- historical backfills;
- compatibility tables for obsolete scenario or completion semantics;
- dual-write behavior;
- synthetic contribution, decision, quote, financing, or project history;
- automatic conversion of generated outputs into homeowner decisions; or
- legacy fields solely to preserve the six current tool contracts.

The user will reconcile the database separately after schema changes.

Use this constraint to establish a clean capital-plan and decision model rather
than preserve contradictory calculators.

---

## 2. Scope and Capability Boundaries

### 2.1 In scope

This audit covers:

- Home Capital Timeline service, analysis, items, overrides, routes, API, UI,
  background refresh, notifications, Home Actions, and Reserve synchronization;
- Reserve Fund fund, line items, contributions, recalculations, reconciliation,
  shortfall guidance, routes, API, UI, and worker behavior;
- Break-Even service, ownership-cost and appreciation dependencies, mortgage
  logic, assumptions, sensitivity, routes, API, UI, discovery, and completion;
- Do-Nothing scenarios, runs, risk and cost model, controls, routes, API, UI,
  persistence, Guidance, and actions;
- Repair vs. Replace facts, defaults, failure and cost model, verdict,
  break-even, decision trace, routes, API, UI, Guidance, and financing handoff;
- Financing profile, equity, rates, calculations, scenarios, selected option,
  routes, API, UI, admin configuration, and disclaimers;
- Product Framework definitions, safety, recommendation mode, readiness,
  output entities, route disposition, completion, and relationships;
- Home Record and Inventory inputs;
- decision-specific source, assumption, cost, option, timing, consequence,
  funding, project, and outcome lineage;
- handoffs to Service Price Radar, Quote Comparison, Negotiation Shield, Price
  Finalization, Property Tax, Coverage, permits, HOA, Hidden Savings and
  Benefits, Digital Twin, Budget, Ownership Costs, Project Tracker, Guidance,
  and Home Actions;
- homeowner experience, mobile, accessibility, analytics, operations, and
  tests; and
- consolidation and legacy retirement.

### 2.2 Canonical responsibility map

| Capability or domain | Canonical responsibility | Capital Plan responsibility |
| --- | --- | --- |
| Home Record / Inventory | System identity, specification, installed/purchased date, condition, documents, service and replacement events | Consume facts, expose conflicts, request high-impact correction, write completion references |
| Digital Twin projection service | Versioned projection and system/scenario effects | Supply evidence-bounded condition/lifecycle and upgrade effects; never own the homeowner decision |
| Status Board | Current condition and operational priority | Launch a decision for a specific system or issue |
| Capital Plan | Dated capital needs, selected timing, coordinated plan, reserve implication, and decision state | Canonical owner |
| Reserve planning | Savings target, balance, allocations, contributions, shortfall, and funding progress | A view/stage of Capital Plan, not an independent forecast |
| Repair / replace / upgrade / wait comparison | Incremental option comparison for one decision | A decision stage |
| Service Price Radar and quote workflow | Market benchmark, quote normalization, comparison, negotiation, accepted terms | Provide price evidence and actual selected price |
| Property Tax | Official assessment, bill, jurisdiction rule, exemption, correction, and appeal | Provide qualified tax implication and handoff |
| Coverage / warranty | Policy, warranty, claim, coverage, premium, deductible, and coverage decision | Provide covered-cost and insurance implications |
| Permits / HOA / Renovation Risk | Requirement research, approval, inspection, and compliance records | Provide blockers and required stages |
| Hidden Savings and Benefits | Rebates, credits, incentives, applications, and realized value | Provide qualified incentive net-cost adjustment |
| Financing profile | Canonical mortgage and liability facts | Consume for equity and affordability |
| Project funding | Cash/reserve/loan comparison, offers, selection, application, funding | A decision stage; benchmark calculations remain educational |
| Budget Planner | Household cash-flow affordability | Validate monthly impact and own household plan |
| Project Tracker | Contract, milestones, payments, changes, evidence, completion, warranty | Execute the selected capital decision |
| Ownership Costs | Current operating/cash/economic cost and actual capital spend | Consume planned and actual capital outcomes; do not drive timing |
| Home Actions | Cross-capability priority and lifecycle | Promote material decision/blocker and resolve it from durable state |

### 2.3 Break-Even boundary

“Break-even” has at least four meanings in the current portfolio:

1. homeownership tenure break-even;
2. repair-versus-replacement payback;
3. refinance closing-cost recoupment;
4. upgrade or project incremental payback.

These are not interchangeable.

The current standalone Break-Even tool is an **ownership-tenure** model. It
should move to Sell / Hold / Rent or an Ownership Strategy experience.

Capital Plan needs **decision-specific incremental payback** as one metric
within option comparison. Mortgage Refinance Radar must keep its own
closing-cost recoupment calculation.

Do not preserve one generic `break-even` capability name.

### 2.4 Do-Nothing boundary

Property-wide risk accumulation may remain useful for a separate Home Risk or
maintenance-planning outcome. Within Capital Decision Planning, “do nothing”
must mean:

> Keep the current system or defer this specific action until a defined date,
> under explicit maintenance and monitoring assumptions.

The decision-specific wait option must not import unrelated property risks into
the financial comparison.

### 2.5 Financing boundary

Financing Center currently combines:

- canonical mortgage profile;
- equity estimate;
- benchmark project-payment calculator;
- saved project scenarios; and
- selected financing option.

The target should:

- preserve the canonical mortgage profile as shared financial context;
- make project funding a stage attached to a Capital Decision;
- retain a financing scenario library as a secondary history view;
- distinguish benchmark, prequalified, quoted, approved, and funded states; and
- never describe an equity screen as lender eligibility.

### 2.6 Out of scope

This document does not:

- predict exact failure dates;
- guarantee that work is required;
- provide engineering, inspection, tax, legal, lending, insurance, permit, HOA,
  or investment advice;
- approve credit or determine lender eligibility;
- move money or create a bank account;
- choose a contractor, lender, or product partner;
- automate a permit, HOA, tax, coverage, financing, or rebate application
  without explicit consent;
- replace Project Tracker;
- create a database migration; or
- implement the recommended slices.

### 2.7 Evidence reviewed

Repository evidence includes:

- the Product Framework and capability audit framework;
- capability definitions, modes, triggers, relationships, route mappings,
  mobile catalog, and generated inventory;
- the six backend services, controllers, routes, validators, APIs, and
  homeowner-facing clients;
- Prisma models for timeline, reserve, replace/repair, do-nothing, financing,
  equity, assumptions, inventory, events, expenses, projects, and Guidance;
- Property Context and financial applicability;
- Home Action promotion and tool lifecycle analytics;
- Home Reserve Fund and Home Improvement Financing functional requirements;
- production-readiness findings;
- Digital Twin, Service Price Radar, Property Tax, Coverage, Mortgage
  Refinance, Hidden Savings, and Ownership Costs audit documents;
- Project Tracker write-back requirements; and
- available backend and frontend tests.

No single current artifact governs the complete Capital Decision Planning
outcome or its shared truth, option, funding, execution, and outcome contracts.

---

## 3. Homeowner Job and Question Contract

### 3.1 Primary job

> When a home system or project deserves attention, help me choose the right
> action and timing, understand the real cost and uncertainty, prepare or pay
> for it, and finish the work without losing context.

### 3.2 Secondary jobs

- See major work that may be needed over the next one, five, and ten years.
- Know which dates and costs are confirmed, quoted, or estimated.
- Correct an incorrect system age, condition, cost, or planned date.
- Compare maintain, repair, replace, upgrade, and wait.
- Understand safety, reliability, comfort, energy, resilience, coverage, tax,
  incentive, compliance, and resale tradeoffs.
- Understand the incremental cost, lifecycle cost, and decision-specific
  payback.
- See what a defined delay may change.
- Price-check the scope and compare equivalent quotes.
- Decide whether to use current cash, reserve, financing, or a staged plan.
- Understand monthly affordability and funding gap.
- Save the decision and revisit it when evidence changes.
- Turn the selected option into a governed project.
- Reconcile actual price, completion, and outcome back into the home record.

### 3.3 Homeowner Question Contract

| Question | Target answer |
| --- | --- |
| What is this? | One plan for the major work this home may need and the active decisions that require attention. |
| How will this benefit me? | It helps avoid surprise costs, premature replacement, repeated low-value repairs, unsafe delay, and disconnected financing. |
| What should I do to realize the full benefit? | Confirm only the fact or evidence that materially changes the active decision: system age, condition, quote, warranty, reserve balance, project timing, or financing context. |
| What should I care about? | The highest-confidence near-term decision, its uncertainty, the consequence of acting or waiting, and the next blocker. |
| What can I control? | Decision scope, option, timing, cost evidence, assumptions, reserve posture, funding choice, reminders, and execution handoff. |
| Can I trust it? | Every material input and output shows evidence type, source, date, assumptions, sensitivity, and professional boundary. |
| When am I done? | A decision is recorded, funding and required prerequisites are addressed, the project is created or no-action/revisit is recorded, and eventual completion is reconciled. |
| Why return? | New condition evidence, a quote, warranty, tax/permit rule, funding rate, contribution, project change, or completed work changed the plan. |

### 3.4 Minimum credible capital decision

A result may influence a homeowner only when it contains:

- a specific property and decision subject;
- the current state and source facts;
- explicit options;
- a baseline option;
- per-option cost range and timing;
- evidence status and freshness;
- uncertainty and material assumptions;
- safety and professional boundaries;
- known prerequisite and blocker state;
- reserve/cash/funding implications;
- one executable next action;
- a durable decision state; and
- a versioned calculation snapshot.

If these are not available, show a partial planning result or evidence request.
Do not issue a categorical replace, delay, affordability, eligibility, or
funding conclusion.

---

## 4. Current-State Capability Map

### 4.1 Portfolio map

| Capability | Current question | Primary output | Persistence | Current Product Framework placement |
| --- | --- | --- | --- | --- |
| Capital Timeline | What may need replacement and when? | Analysis, capital items, overrides | Persisted | Plan/Budget, contextual, plan created |
| Reserve Fund | How much should I set aside? | Fund, target, shortfall, line items, ledger | Persisted | Plan/Budget, catalog only, plan created |
| Repair vs. Replace | Repair or replace this item? | Verdict, break-even, trace | Persisted | Decide/Compare, catalog only, decision recorded |
| Do-Nothing Simulator | What happens if I delay? | Property-wide scenario run | Persisted | Decide/Compare, catalog only, decision recorded |
| Break-Even | When does owning pay back? | Appreciation-versus-cost horizon | Calculated on read | Save/Optimize, contextual, output generated |
| Financing Center | How could I pay? | Equity and generic option scenarios | Partly persisted | Save/Optimize, catalog only, output generated |

### 4.2 Current routes

The family mixes:

- property-scoped tool routes;
- global routes;
- an inventory-item route;
- query-based property selection;
- route canonicalization;
- inline panels;
- Guidance-embedded steps; and
- standalone mobile catalog entries.

The route design reflects tool origins rather than one decision context.

### 4.3 Current journey discontinuities

| Transition | Current gap |
| --- | --- |
| System issue → decision | System context may survive, but one durable decision entity does not |
| Decision → wait analysis | Do-Nothing often becomes property-wide and imports unrelated risks |
| Decision → price | Estimated replacement cost is reinterpreted or re-entered; scope comparability is weak |
| Price → reserve | Actual selected quote does not reliably replace the planning benchmark |
| Reserve → financing | Funding gap and project context are not one versioned handoff |
| Financing → selection | Selected generic option does not become an offer/application/funding state |
| Selection → prerequisites | Tax, permit, HOA, coverage, warranty, and incentive checks are not consistently gated |
| Decision → project | Project creation can lose option, cost, source, assumptions, funding, and prerequisite context |
| Project completion → plan | Write-back designs exist, but expected-versus-actual and reserve reconciliation are not one governed loop |

### 4.4 Current source hierarchy conflict

The same project cost can come from:

- static Capital Timeline category defaults;
- inventory replacement cost;
- homeowner timeline override;
- Repair vs. Replace category defaults;
- Repair vs. Replace override;
- Digital Twin scenario assumptions;
- Service Price Radar fallback or benchmark;
- contractor quote;
- Price Finalization accepted terms;
- Financing Scenario project cost; and
- Project Tracker contract/change orders/actual payment.

There is no universal precedence or supersession contract.

### 4.5 Current plan duplication

Capital Timeline and Reserve Fund both show:

- future items;
- cost ranges;
- due timing;
- recommended monthly set-aside;
- near-term urgency;
- explanations; and
- next actions.

They should not remain separate peer destinations.

---

## 5. Capability-by-Capability Findings

### 5.1 Home Capital Timeline

#### Strengths

- Property and inventory scoped.
- Persisted versioned analyses.
- Per-item windows, cost ranges, confidence, priority, and explanation.
- User overrides for date, window, cost, remaining life, disablement, and note.
- Digital Twin evidence can fill selected facts and preserve conflicts.
- Home Event and document links.
- Capital cost growth support.
- Bundle grouping.
- Home Action promotion.
- Reserve recalculation synchronization.
- Context versioning and stale protection.

#### Gaps

1. Category defaults are hard-coded and unversioned in the service.
2. Lifespan is a point value, then widened to a roughly two-year window; it is
   not a calibrated survival range.
3. Condition multipliers are static.
4. State climate factors are static, sparse, and not evidence-attributed.
5. Safety and smart-home items map to electrical; roof/exterior maps to
   exterior, which can produce semantically poor estimates.
6. Missing installation date uses a fallback age that can still create a
   concrete window.
7. Category cost defaults are not localized by scope, quantity, size, material,
   access, permit, disposal, or code requirements.
8. An inventory replacement-cost value becomes a midpoint with a fixed ±20%
   range regardless of source or age.
9. Future cost escalation can stack on a user-entered future quote unless source
   period semantics are explicit.
10. “High confidence” reflects three populated fields, not model calibration.
11. Priority is driven mainly by years until modeled date, not safety,
    consequence, condition evidence, warranty, active failure, or homeowner
    intent.
12. Bundle grouping by dates alone can suggest 10–15% savings without scope,
    trade, quote, mobilization, or market evidence.
13. The source population is tracked inventory, not a property-complete capital
    inventory.
14. Structural, site, envelope, common responsibility, and planned improvement
    needs can be absent.
15. A notification can promote a model-derived replacement without a validated
    materiality and evidence threshold.
16. The UI duplicates reserve planning with its own set-aside calculation.

#### Recommended role

Retain the timeline engine as the canonical capital-needs schedule inside the
Capital Plan, but rebuild its evidence, model-version, coverage, and decision
contracts. Remove the independent reserve recommendation from the timeline.

### 5.2 Reserve Fund Planner

#### Strengths

- Durable per-property fund.
- Source analysis reference.
- Item-level targets and allocations.
- Self-reported contribution ledger.
- Near-term shortfall.
- Posture control.
- Recalculation audit.
- Expense and Home Event reconciliation.
- Guidance shortfall signal.
- Context provenance.
- Explicit statement that no real money is moved.

#### Gaps

1. It inherits all timeline model error.
2. Far-term monthly contributions use full targets rather than target minus
   allocated balance.
3. Current balance is proportionally distributed by target size, not due date,
   priority, restricted use, or homeowner allocation.
4. The contribution algorithm does not create a cash-flow schedule that
   reallocates contributions as items become funded.
5. `FUNDED` and `OVERDUE` are not derived in the primary recalculation path.
6. Near-term classification uses six months while Guidance promotion uses
   ninety days.
7. The plan does not evaluate Budget affordability.
8. The plan does not show contribution adherence or forecasted balance.
9. The plan does not model interest, yield, inflation custody, or account
   liquidity; this is acceptable only with clear disclosure.
10. Contributions are self-reported but can appear transaction-like.
11. Manual retirement can remove a target without a structured completion
    reason or canonical project/event update.
12. Expense reconciliation is fuzzy and needs strong confirmation and
    double-count protection.
13. “Aggressive” means using the low cost estimate, which may be misread as a
    higher-saving posture.
14. Pausing `isActive` does not define what happens to actions, projections, or
    revisit timing.
15. Fund creation on read can create durable plan state before explicit
    homeowner intent.
16. The same set-aside concept is presented in Capital Timeline.

#### Recommended role

Merge into Capital Plan as **Prepare and fund**. Preserve its ledger and
reconciliation strengths, replace the allocation math, and connect the target
to Budget and the selected capital decisions.

### 5.3 Repair vs. Replace

#### Strengths

- Item-scoped canonical route.
- Uses inventory facts and recent Home Events.
- Accepts controlled homeowner overrides.
- Persists current and stale analyses.
- Produces explicit options, summary, confidence, trace, and next steps.
- Uses a deterministic model.
- Exposes a professional/educational disclaimer.
- Integrates with Guidance and provider search.
- Has a financing linkage field.

#### Gaps

1. Category defaults lack governed sources and versions.
2. Failure probabilities are rule-based, not calibrated.
3. A general property risk score modifies an item failure probability without a
   documented causal mapping.
4. Inspections and maintenance count as repair-like events.
5. The lookback is thirty months while variables and output describe twenty-four.
6. Repair count and spend can double-count one incident represented by several
   events.
7. Event amount provenance and currency/period semantics are weak.
8. The cost estimate does not consume canonical Service Price Radar or quote
   evidence.
9. Warranty and coverage are not part of the option economics.
10. Energy, resilience, comfort, downtime, safety, code, incentive, tax, and
    resale effects are incomplete.
11. Successful repair probability and repair warranty are absent.
12. Replacement quality tiers and useful-life alternatives are absent.
13. Replacement is assumed to reduce annual repair risk by a fixed percentage.
14. Break-even does not model full lifecycle cash flows.
15. Verdict thresholds can turn weak inputs into categorical `REPLACE_NOW`.
16. The homeowner can run a result but there is no explicit persisted decision
    status and reason separate from the generated analysis.
17. “Find Pros” can jump to execution before price, funding, coverage, permit,
    HOA, or safety prerequisites are resolved.
18. Single-item optimization cannot coordinate related systems or bundles.

#### Recommended role

Retain the item-level analytical components, but place them inside a Capital
Decision option comparison. Rename the result from a verdict to a
recommendation with explicit evidence eligibility, alternatives, and decision
capture.

### 5.4 Do-Nothing Simulator

#### Strengths

- Saved scenarios and runs.
- Multiple horizons.
- Context snapshots and assumption sets.
- Property facts, maintenance, inventory, claims, coverage, risk, and signals.
- Decision trace and next steps.
- Stale-state support.
- Low-data disclosure in the UI.
- Structured output persistence.

#### Gaps

1. The capital-decision subject is not required.
2. A single decision is polluted by property-wide unrelated conditions.
3. Cost components are generic additive weights rather than sourced
   decision-specific cash flows.
4. A major event cost is added without a clear probability-weighted expected
   loss contract.
5. Incident likelihood is a coarse label derived separately from cost range.
6. Claims, peril, coverage, risk, and generated-event terms may overlap.
7. Savings realization offsets physical downside.
8. Warranty toggles are generic and not tied to an actual contract.
9. Deductible effects are generic and not tied to coverage/exclusion.
10. Ignored-risk controls do not change the baseline.
11. Maintenance debt and aging-item costs use static per-count amounts.
12. A neutral missing risk report can still yield a precise cost range.
13. Confidence counts available signals rather than calibration quality.
14. No actual-outcome loop validates predicted delay consequences.
15. The tool can intensify loss aversion and pressure the homeowner toward work.
16. The result can create a decision narrative without an executable,
    subject-specific action.

#### Recommended role

Retire the standalone capital-planning use. Replace it with a **Wait/defer**
option bound to the same Capital Decision and evidence used by the action
options. Keep any broader property-risk simulation in the appropriate risk
family with separate governance.

### 5.5 Break-Even

#### Strengths

- FHFA appreciation input when available.
- Canonical mortgage adapter.
- Debt amortization.
- Principal and interest separation.
- Reusable assumption sets.
- Conservative/base/optimistic sensitivity.
- Clear status and next action.
- Context disclosure.

#### Gaps

1. It answers homeownership tenure, not capital-project payback.
2. Its label and capability description are overly generic.
3. It consumes the current ownership-cost stack that has a separate audit and
   major category/evidence inconsistencies.
4. Capital expenditures are omitted from the cost series.
5. Purchase closing costs are omitted.
6. Disposition and transaction costs are omitted from the displayed
   break-even calculation.
7. `sellingCostPercent` is accepted and stored in assumptions but is not applied
   to the break-even series.
8. Maintenance, insurance, and tax growth assumptions collapse into one derived
   expense rate.
9. An appreciation sensitivity shift automatically changes expense growth in
   the opposite direction without a clear causal basis.
10. Appreciation is unrealized, but the UI can read like a recovered cash cost.
11. Tax, sale, opportunity-cost, and market-risk boundaries are incomplete.
12. Output generation triggers workflow completion.
13. No durable decision is recorded.
14. “Plan capital events after break-even” creates an arbitrary journey order;
    capital needs do not wait for ownership break-even.

#### Recommended role

Move ownership-tenure analysis to Sell / Hold / Rent or Ownership Strategy and
consume the canonical Ownership Costs model. Retire the standalone generic
Break-Even capability. Implement decision-specific payback inside Capital
Decision Planning using a separate, typed calculation.

### 5.6 Financing Center

#### Strengths

- Canonical property financing profile.
- Explicit mortgage-free state.
- Equity snapshots.
- Benchmark rate configuration with source note and effective date.
- Project-cost calculations.
- Saved versioned rate and result snapshots.
- Option selection.
- Source entity fields and entry point.
- Educational disclaimer.
- Admin operations.

#### Gaps

1. Mortgage profile and project funding are mixed into one capability.
2. Equity value source can be purchase price and still appear current.
3. Equity snapshots can accumulate without source supersession semantics.
4. HELOC capacity uses a generic 85% CLTV rule.
5. `helocEligible` overstates an equity-only screen.
6. Second mortgage handling does not capture lien position or product rules.
7. Credit, income, debt-to-income, employment, occupancy, property, and lender
   criteria are absent.
8. Static fallback rates can receive a current `ratesAsOf` timestamp.
9. Rate configuration uses one field for both basis points and promotional
   months.
10. HELOC assumes the full project amount remains drawn for ten years and then
    amortizes over ten more at the same rate.
11. No variable-rate scenario exists.
12. Fees, closing costs, annual fees, draw fees, early closure, and minimum
    payments are absent.
13. Home-equity and personal-loan comparisons use different terms without a
    normalized decision horizon.
14. Personal-loan “min/max” benchmark is not homeowner-specific.
15. Contractor deferred interest uses a generic simplified calculation.
16. Cash opportunity cost assumes a positive configurable investment return
    and omits liquidity value and risk.
17. Monthly affordability and household cash flow are not evaluated.
18. Tax implications are not determined and must remain professional-boundary
    guidance.
19. No actual offer intake or Loan Estimate comparison.
20. No prequalification/application/approval/funding lifecycle.
21. `selectedOption` can look like a completed financing decision without
    consent, offer terms, or funding.
22. Saved scenario output is JSON without a typed versioned results contract.
23. Direct Financing Center entry asks the homeowner to invent a project before
    the capital decision is established.

#### Recommended role

Keep canonical mortgage/equity facts as shared financial context. Turn project
funding into a Capital Decision stage with benchmark, prequalification, quote,
selection, application, approval, and funding states. Retain a secondary
scenario/history view, not a peer tool competing with the active decision.

---

## 6. Cross-Tool Calculation and Truth Contract

### 6.1 One decision subject

Every analysis must bind to:

- `propertyId`;
- `capitalDecisionId`;
- optional `inventoryItemId`, issue, project, document, recommendation, or
  timeline item;
- decision type;
- current state;
- source facts;
- source versions; and
- homeowner intent.

No query-parameter-only handoff is sufficient for a Material Financial
decision.

### 6.2 One option taxonomy

The canonical option set is:

- `MAINTAIN`;
- `REPAIR`;
- `REPLACE_LIKE_FOR_LIKE`;
- `UPGRADE`;
- `WAIT`;
- `INSPECT_OR_DIAGNOSE`;
- `NO_ACTION`;
- and `CUSTOM`.

Unavailable or unsafe options must remain visible with a reason when that helps
the decision. A generated model must not silently remove the baseline.

### 6.3 One cost taxonomy

Each option can contain:

- diagnosis/inspection;
- materials;
- labor;
- equipment;
- removal/disposal;
- access/restoration;
- permit;
- HOA/application;
- tax;
- insurance/coverage;
- warranty/service plan;
- energy/operating cost;
- maintenance;
- downtime/disruption;
- temporary accommodation;
- financing fees and interest;
- rebates, credits, incentives, and discounts;
- contingency;
- residual/salvage;
- future replacement; and
- actual project changes.

Every line identifies:

- observed, quoted, accepted, contracted, paid, extracted, benchmark,
  homeowner-estimated, or modeled status;
- source;
- date;
- quantity and scope;
- period;
- confidence;
- inclusion;
- and uncertainty.

### 6.4 Source precedence

Recommended precedence:

1. accepted final terms or executed contract;
2. normalized current quote;
3. verified local benchmark;
4. homeowner-confirmed estimate with source;
5. inventory or project documented value adjusted for scope/date;
6. model estimate;
7. category fallback.

Higher-precedence evidence supersedes but does not delete lower-precedence
history. Scope mismatch can prevent automatic supersession.

### 6.5 Timing truth

Distinguish:

- observed failure or active issue;
- professional recommended date;
- homeowner planned date;
- warranty or compliance deadline;
- modeled service-life range;
- scenario date;
- project scheduled date;
- and actual completion date.

A modeled lifecycle window must not overwrite a professional or homeowner plan.

### 6.6 Decision-specific payback

Payback is permitted only when:

- the baseline and alternative are explicit;
- incremental upfront costs are complete enough;
- recurring cash-flow differences are identified;
- repair success and repeat-repair assumptions are disclosed;
- lifecycle and replacement timing are included;
- financing is included consistently or excluded from all options;
- incentives and tax effects are evidence-qualified;
- residual value is handled consistently;
- the horizon is appropriate;
- sensitivity is shown; and
- “not reached” is a valid result.

Required outputs:

- incremental upfront amount;
- monthly/annual cash-flow difference;
- simple payback where meaningful;
- lifecycle cost range;
- probability or evidence limitations;
- sensitivity drivers; and
- nonfinancial tradeoffs.

Do not use one payback method for refinance, ownership tenure, and capital
projects.

### 6.7 Wait/defer truth

The wait option must define:

- wait-until date or horizon;
- monitoring/maintenance action;
- current operability;
- safety eligibility;
- warranty and coverage implications;
- expected deterioration evidence;
- repair/replacement price escalation;
- probability-weighted consequence only when calibrated;
- disruption and emergency premium assumptions;
- trigger to reconsider; and
- what cannot be quantified.

Safety-critical, active leak, electrical, structural, gas, fire, health, recall,
or code conditions must not be reduced to financial optimization.

### 6.8 Funding truth

Funding options must distinguish:

- available cash;
- reserve allocation;
- household affordability;
- benchmark loan scenario;
- equity screen;
- prequalification;
- quote/offer;
- selected offer;
- application;
- approval;
- funded amount;
- and repayment.

“Capacity,” “screen,” “benchmark,” “prequalified,” “approved,” and “funded”
must never be interchangeable.

---

## 7. Experience Audit

### 7.1 Current experience problems

The current experience exposes tool mechanics before the homeowner outcome:

- “Capital Timeline”;
- “Reserve Fund Planner”;
- “Do-Nothing Simulator”;
- “Break-Even Ownership Year”;
- “Financing Center”;
- “confidence” badges with different meanings;
- assumption-set controls;
- posture terminology;
- several set-aside figures;
- risk points;
- incident likelihood;
- appreciation-versus-cost charts; and
- generic financing product tables.

The homeowner must infer:

- which problem is active;
- whether a system actually needs work;
- whether the cost is a fallback or a quote;
- which set-aside figure is authoritative;
- why one tool’s break-even differs from another;
- whether “eligible” means lender-qualified;
- whether “replace now” is safe to rely on;
- which prerequisites block execution;
- what decision was recorded;
- and how to continue without re-entry.

### 7.2 Target information architecture

Canonical route:

`/dashboard/properties/[id]/capital-plan`

Recommended workspace:

1. **Plan summary**
   - next known capital decision;
   - near-term estimated exposure;
   - reserve coverage;
   - open blocker;
   - last update and coverage state.
2. **Timeline**
   - observed, professional, planned, and modeled events;
   - confidence/evidence;
   - conflicts and missing systems;
   - one authoritative reserve effect.
3. **Active decisions**
   - system/project;
   - status;
   - current recommendation;
   - selected option;
   - blocker;
   - next action.
4. **Decision workspace**
   - understand;
   - compare options;
   - validate price and implications;
   - prepare/pay;
   - decide;
   - execute;
   - reconcile.
5. **Reserve**
   - target;
   - current balance;
   - funded/unfunded amount;
   - contribution schedule;
   - affordability;
   - item allocations;
   - ledger and reconciliation.
6. **Completed decisions**
   - expected versus actual;
   - warranty;
   - next lifecycle date;
   - plan and Home Record write-backs.

### 7.3 Decision workspace stages

#### Stage 1 — Understand

- What is the system, issue, or project?
- What evidence exists?
- What is uncertain or conflicting?
- Is inspection or diagnosis required?
- Is there a safety or compliance boundary?

#### Stage 2 — Compare

- Maintain, repair, replace, upgrade, wait, or no action.
- Cost range and source.
- Timing.
- reliability, safety, comfort, energy, resilience, coverage, warranty, tax,
  incentive, and disruption tradeoffs.
- Decision-specific lifecycle cost and payback when eligible.

#### Stage 3 — Validate

- Price and scope through Service Price Radar/quote workflow.
- Warranty and coverage.
- Permit, HOA, and code research.
- Property Tax implication.
- Benefits/incentives.
- Professional assessment when needed.

#### Stage 4 — Prepare and pay

- Reserve available and resulting plan impact.
- Cash-flow affordability through Budget.
- Benchmark financing options.
- Prequalification or actual offer when available.
- Funding gap and staged alternatives.

#### Stage 5 — Decide

- Selected option.
- Timing.
- reason.
- acknowledged uncertainty.
- no-action, defer, or revisit trigger.
- funding and prerequisite state.

#### Stage 6 — Execute

- Create Project Tracker record.
- Preserve scope, accepted price, selected provider, funding, permit/HOA,
  milestones, and return context.

#### Stage 7 — Reconcile

- Actual cost and funding.
- completion evidence.
- changed scope.
- warranty.
- new system facts.
- reserve release/use.
- timeline reset.
- tax/coverage/ownership-cost effect.
- expected-versus-actual learning.

### 7.4 Target state model

| State | Homeowner message | Primary action |
| --- | --- | --- |
| No tracked systems | “Add the major systems you want included in this home’s capital plan.” | Add specific system |
| Partial plan | “We can plan around these systems; two common categories are not yet confirmed.” | Review coverage |
| Model-only event | “This is a planning window based on typical service life, not a failure prediction.” | Confirm age/condition or keep as estimate |
| Conflicting facts | “Two dates could materially change this plan.” | Resolve source conflict |
| Diagnosis needed | “The available evidence cannot support repair-versus-replacement yet.” | Schedule/record inspection |
| Active comparison | “Compare the realistic options for this system.” | Review options |
| Wait eligible | “Waiting until [date] may be reasonable if you complete [monitoring action].” | Save wait plan |
| Safety boundary | “Do not use a financial comparison to delay this condition.” | Safety/professional action |
| Price evidence missing | “The decision is directionally useful; a comparable quote may change the cost.” | Price-check scope |
| Prerequisite blocked | “Permit, HOA, coverage, or tax review is needed before commitment.” | Complete blocker |
| Funding gap | “The selected option exceeds current reserve by …” | Adjust timing, reserve, budget, or funding |
| Benchmark financing only | “These are illustrative payment scenarios, not offers or approvals.” | Compare or seek qualification |
| Decision recorded | “You chose … because …” | Create project or schedule revisit |
| In execution | “This decision is now tracked as a project.” | Continue project |
| Completed | “The work is complete. Actual cost and the next lifecycle window are updated.” | Review write-backs |
| No action due | “No capital decision needs action now. We’ll revisit after …” | Manage notifications |

### 7.5 Copy principles

Use:

- “planning window”;
- “model estimate”;
- “quote”;
- “accepted price”;
- “equity screen”;
- “benchmark payment”;
- “not enough evidence”;
- “wait with monitoring”;
- “selected option”;
- “funding gap”;
- “professional review needed”; and
- “no action until [event/date].”

Avoid:

- “will fail”;
- “replace now” from sparse evidence;
- “doing nothing costs” without a decision-specific evidence model;
- “high confidence” based only on fields being populated;
- “eligible” for financing based only on LTV/equity;
- “rates updated today” when hard-coded defaults were used;
- “true cost” for partial project scope;
- “recommended monthly set-aside” in two places;
- “break-even” without naming its definition; and
- “completed” for generated output.

### 7.6 Home and discovery placement

Capital Plan may appear on Home only when:

- a high-evidence near-term decision is material;
- a safety/professional blocker requires action;
- a saved decision needs review because evidence changed;
- a quote, funding, permit, HOA, tax, coverage, or incentive deadline exists;
- reserve funding is materially off plan for a known decision;
- an active project needs action; or
- completion requires reconciliation.

A passive ten-year forecast does not deserve a permanent high-priority card.

The consolidated capability should be contextual. Passive access belongs in
Explore Tools and the property plan/financial areas.

### 7.7 Controls

The homeowner should control:

- included systems and responsibilities;
- event correction;
- planned timing;
- option inclusion;
- decision horizon;
- quote and cost evidence;
- bounded assumptions;
- reserve balance and allocation;
- funding source;
- revisit date and trigger;
- notification types;
- decision, reason, dismissal, and no-action state; and
- project creation.

The homeowner must not be able to:

- overwrite observed or professional evidence through a scenario;
- dismiss a safety state as a financial preference;
- make a benchmark rate appear quoted;
- convert a model recommendation into a completed decision automatically; or
- delete outcome evidence required for audit without an explicit correction
  trail.

### 7.8 Accessibility and mobile

The target must:

- preserve decision summary and next action above the fold;
- present option comparisons as accessible tables/cards;
- offer text alternatives for timeline and cash-flow charts;
- avoid status-by-color alone;
- support keyboard access and screen readers;
- announce recalculation and stale changes;
- preserve focus after option and funding updates;
- support reduced motion;
- explain money, date, probability, and range units;
- prevent horizontal overflow;
- provide at least 44px touch targets; and
- preserve decision context across mobile stage transitions.

---

## 8. Best-in-Class Target Capability

### 8.1 Target capability contract

| Contract field | Target |
| --- | --- |
| Capability ID | `capital-plan` |
| Name | Capital Plan |
| Homeowner promise | Plan major work, compare choices, prepare funding, and carry the decision into execution |
| Canonical route | `/dashboard/properties/[id]/capital-plan` |
| Recommendation mode | Contextual |
| Safety tier | Material financial |
| Accepted context | Property, system, inventory item, issue, project, document, Home Action, Guidance journey |
| Safe partial value | Yes |
| Completion | Decision, plan, funding, project, or no-action/revisit state recorded |
| Revisit trigger | Material fact, condition, quote, rule, rate, reserve, project, or outcome change |
| Canonical outputs | Capital plan, need, decision, option analysis, reserve plan, funding plan, prerequisite, execution link, outcome |

### 8.2 Target capability disposition

| Current capability | Disposition | Target role |
| --- | --- | --- |
| Capital Timeline | Merge and strengthen | Timeline view and capital-need engine |
| Reserve Fund | Merge and strengthen | Prepare/fund view with durable ledger |
| Repair vs. Replace | Embed and broaden | Option comparison for an active decision |
| Do-Nothing Simulator | Reposition | Decision-specific wait/defer option; broader simulation moves to risk family |
| Break-Even | Reposition and retire generic route | Ownership-tenure logic moves to Ownership Strategy; project payback becomes typed decision metric |
| Financing Center | Split shared facts from workflow | Mortgage/equity context remains shared; project funding becomes decision stage |

### 8.3 Capital coverage model

Coverage should identify:

- tracked system categories;
- property systems for which the homeowner is responsible;
- structural/site/common-area exclusions;
- missing high-impact categories;
- source recency;
- active issues;
- planned improvements;
- professional findings;
- and systems intentionally excluded.

The product must not call a timeline comprehensive when its inventory coverage
is partial.

### 8.4 Evidence hierarchy

For timing:

1. active failure or professional finding;
2. committed project date;
3. homeowner planned date;
4. warranty/compliance deadline;
5. documented installation and governed lifecycle range;
6. extracted but unconfirmed date;
7. category fallback.

For condition:

1. recent professional inspection/diagnosis;
2. verified sensor/service evidence;
3. homeowner-confirmed condition;
4. extracted evidence;
5. model estimate from age;
6. unknown.

For cost:

1. final accepted terms/contract;
2. current normalized quote;
3. verified local benchmark;
4. homeowner-confirmed scoped estimate;
5. documented prior cost normalized for scope/date;
6. governed model;
7. fallback.

### 8.5 Readiness model

Readiness is stage-specific:

- plan coverage readiness;
- timing readiness;
- option-comparison readiness;
- wait/defer readiness;
- price readiness;
- prerequisite readiness;
- reserve readiness;
- affordability readiness;
- financing-benchmark readiness;
- offer/application readiness;
- project readiness; and
- completion-reconciliation readiness.

Missing financing must not block cash/reserve planning. Missing history must not
block a model-only planning window. Missing diagnosis must block a categorical
replacement recommendation when the condition is material.

### 8.6 Decision lifecycle

Recommended lifecycle:

- `IDENTIFIED`;
- `NEEDS_EVIDENCE`;
- `READY_TO_COMPARE`;
- `COMPARING`;
- `BLOCKED`;
- `DECIDED_MAINTAIN`;
- `DECIDED_REPAIR`;
- `DECIDED_REPLACE`;
- `DECIDED_UPGRADE`;
- `DECIDED_WAIT`;
- `DECIDED_NO_ACTION`;
- `FUNDING`;
- `READY_TO_EXECUTE`;
- `IN_PROJECT`;
- `COMPLETED`;
- `CANCELED`;
- `SUPERSEDED`;
- and `REOPENED`.

A new analysis updates evidence and recommendations. It does not overwrite the
homeowner decision silently.

### 8.7 Revisit value

Recalculate or reopen when:

- new condition or diagnostic evidence arrives;
- install date or system identity changes;
- a maintenance or repair event occurs;
- warranty or coverage changes;
- a quote or accepted price arrives;
- a price benchmark changes materially;
- a tax, permit, HOA, or incentive rule changes;
- a funding rate or offer changes materially;
- reserve balance or affordability changes;
- the planned date enters a threshold;
- a project changes scope/cost/schedule;
- the homeowner defers past the saved trigger; or
- project completion resets the asset lifecycle.

---

## 9. Target Data and Service Architecture

### 9.1 Architecture principles

1. One capital plan per property.
2. One durable decision per real decision subject.
3. Canonical domains own their facts.
4. Models store typed references and versioned derived outputs.
5. Observed, professional, quoted, accepted, contracted, paid, estimated, and
   scenario values remain distinct.
6. Options share one baseline and cost taxonomy.
7. Reserve, funding, prerequisites, project, and outcome attach to the decision.
8. No generated output is a homeowner decision.
9. Completion closes the loop and improves future planning.

### 9.2 Recommended schema

Names are illustrative and should be finalized in Slice 1.

#### `CapitalPlan`

- `id`
- `propertyId`
- `ownerProfileId`
- `status`
- `horizonYears`
- `coverageStatus`
- `coverageJson`
- `defaultReservePosture`
- `propertyContextVersion`
- `definitionVersion`
- `lastCalculatedAt`
- `createdAt`
- `updatedAt`

#### `CapitalNeed`

- `id`
- `capitalPlanId`
- `propertyId`
- `subjectType`
- `subjectId`
- `category`
- `needType`
- `status`
- `sourceRefsJson`
- `timingType`
- `windowStart`
- `windowEnd`
- `timingConfidence`
- `timingMethodVersion`
- `costMinCents`
- `costMaxCents`
- `costEvidenceStatus`
- `costSourceRefsJson`
- `costMethodVersion`
- `priority`
- `priorityReasonsJson`
- `safetyBoundary`
- `supersededById`
- `createdAt`
- `updatedAt`

#### `CapitalDecision`

- `id`
- `capitalPlanId`
- `propertyId`
- `capitalNeedId`
- `userId`
- `status`
- `intent`
- `currentRecommendation`
- `recommendationEligibility`
- `selectedOptionId`
- `decisionReasonCode`
- `decisionReasonText`
- `decisionAt`
- `revisitAt`
- `revisitTriggerJson`
- `contextVersion`
- `inputFingerprint`
- `createdAt`
- `updatedAt`

#### `CapitalDecisionOption`

- `id`
- `capitalDecisionId`
- `optionType`
- `label`
- `status`
- `scopeJson`
- `timingJson`
- `costSnapshotId`
- `tradeoffsJson`
- `eligibilityJson`
- `professionalBoundaryJson`
- `createdAt`
- `updatedAt`

#### `CapitalCostSnapshot`

- `id`
- `capitalDecisionId`
- `optionId`
- `currency`
- `baseDate`
- `horizonMonths`
- `upfrontMinCents`
- `upfrontMaxCents`
- `lifecycleMinCents`
- `lifecycleMaxCents`
- `monthlyImpactMinCents`
- `monthlyImpactMaxCents`
- `paybackMonths`
- `paybackEligibility`
- `sourceCoverage`
- `methodVersion`
- `assumptionsJson`
- `sourceRefsJson`
- `inputFingerprint`
- `calculatedAt`
- `staleAt`

#### `CapitalCostLine`

- `id`
- `snapshotId`
- `category`
- `amountMinCents`
- `amountMaxCents`
- `periodStart`
- `periodEnd`
- `evidenceStatus`
- `sourceType`
- `sourceEntityType`
- `sourceEntityId`
- `sourceDocumentId`
- `scopeJson`
- `confidence`
- `included`
- `exclusionReason`

#### `CapitalPrerequisite`

- `id`
- `capitalDecisionId`
- `type`
- `ownerCapabilityId`
- `status`
- `required`
- `reason`
- `sourceRefsJson`
- `destination`
- `resolvedAt`
- `resolutionRef`

#### `CapitalReservePlan`

- `id`
- `capitalPlanId`
- `propertyId`
- `status`
- `currentBalanceCents`
- `availableBalanceCents`
- `recommendedMonthlyCents`
- `nearTermShortfallCents`
- `posture`
- `allocationMethodVersion`
- `lastRecalculatedAt`
- `createdAt`
- `updatedAt`

Existing contribution and recalculation ledger concepts may be retained with
renamed, corrected relations.

#### `CapitalReserveAllocation`

- `id`
- `reservePlanId`
- `capitalNeedId`
- `capitalDecisionId`
- `targetCents`
- `allocatedBalanceCents`
- `remainingTargetCents`
- `recommendedMonthlyCents`
- `dueDate`
- `priority`
- `status`
- `methodVersion`

#### `CapitalFundingPlan`

- `id`
- `capitalDecisionId`
- `selectedOptionId`
- `projectCostSnapshotId`
- `cashContributionCents`
- `reserveContributionCents`
- `financedAmountCents`
- `monthlyBudgetImpactCents`
- `status`
- `affordabilityStatus`
- `createdAt`
- `updatedAt`

#### `CapitalFundingOption`

- `id`
- `fundingPlanId`
- `type`
- `evidenceStatus`
- `providerName`
- `productName`
- `principalCents`
- `rateType`
- `rateBps`
- `feesCents`
- `termMonths`
- `monthlyPaymentCents`
- `totalRepaymentCents`
- `benchmarkAsOf`
- `offerExpiresAt`
- `qualificationState`
- `applicationState`
- `sourceRefsJson`
- `selectedAt`

#### `CapitalOutcome`

- `id`
- `capitalDecisionId`
- `projectId`
- `completedAt`
- `actualCostCents`
- `fundingOutcomeJson`
- `actualScopeJson`
- `completionEvidenceRefsJson`
- `warrantyRefsJson`
- `expectedVsActualJson`
- `writeBackStatusJson`
- `createdAt`

### 9.3 Service boundaries

Recommended services:

- `CapitalPlanCoverageService`;
- `CapitalNeedProjectionService`;
- `CapitalDecisionService`;
- `CapitalOptionComparisonService`;
- `CapitalWaitScenarioService`;
- `CapitalCostEvidenceService`;
- `CapitalPrerequisiteResolver`;
- `CapitalReserveAllocationService`;
- `CapitalFundingService`;
- `CapitalProjectHandoffService`;
- `CapitalOutcomeReconciliationService`; and
- adapter services for each canonical domain.

### 9.4 Reserve allocation correction

The target reserve algorithm should:

1. use remaining unfunded target, not full target;
2. respect selected decisions, priorities, and due windows;
3. exclude completed, superseded, covered, or no-action needs;
4. preserve restricted homeowner allocations;
5. distinguish reserve balance from general cash;
6. forecast contributions and balance over time;
7. reallocate after a need becomes funded or completed;
8. show affordability conflict;
9. use the same calculation everywhere; and
10. retain method, assumptions, and calculation history.

At minimum:

`remainingTarget = max(0, selectedTarget - allocatedBalance - confirmedExternalFunding)`

`monthlyContribution = schedule(remainingTarget, dueDate, priority, otherNeeds)`

The exact scheduling algorithm requires product approval and golden fixtures.

### 9.5 Financing correction

Benchmark calculations require:

- source status and freshness;
- no current timestamp when fallback defaults are used;
- product-specific term/fee assumptions;
- variable-rate scenarios where applicable;
- normalized comparison horizon;
- cash-flow affordability;
- equity **screen**, not eligibility;
- benchmark versus offer distinction;
- typed result schema version;
- actual offer intake;
- application and funding lifecycle; and
- regulated disclosures and consent.

### 9.6 API contract

Recommended endpoints:

- `GET /api/properties/:propertyId/capital-plan`
- `POST /api/properties/:propertyId/capital-plan/recalculate`
- `GET /api/properties/:propertyId/capital-plan/needs`
- `PATCH /api/properties/:propertyId/capital-plan/needs/:needId`
- `POST /api/properties/:propertyId/capital-decisions`
- `GET /api/properties/:propertyId/capital-decisions/:decisionId`
- `POST /api/properties/:propertyId/capital-decisions/:decisionId/compare`
- `POST /api/properties/:propertyId/capital-decisions/:decisionId/wait-scenarios`
- `POST /api/properties/:propertyId/capital-decisions/:decisionId/decide`
- `POST /api/properties/:propertyId/capital-decisions/:decisionId/no-action`
- `GET /api/properties/:propertyId/capital-decisions/:decisionId/prerequisites`
- `GET /api/properties/:propertyId/capital-reserve`
- `PATCH /api/properties/:propertyId/capital-reserve`
- `POST /api/properties/:propertyId/capital-reserve/contributions`
- `POST /api/properties/:propertyId/capital-decisions/:decisionId/funding-plans`
- `POST /api/properties/:propertyId/capital-decisions/:decisionId/projects`
- `POST /api/properties/:propertyId/capital-decisions/:decisionId/reconcile`

### 9.7 Validation and authorization

Require:

- property and household authorization;
- contributor-level mutation permission;
- entity/property consistency;
- finite bounded numbers;
- cost range ordering;
- valid periods and horizons;
- source/evidence compatibility;
- safe timing ranges;
- rate and term validation;
- typed option, funding, prerequisite, and outcome states;
- stale context protection;
- idempotency;
- explicit decision confirmation; and
- audit logs for Material Financial changes.

---

## 10. Product Framework Conformance

### 10.1 Canonical capability

Register `capital-plan` under Plan/Budget with:

- contextual mode;
- Material Financial safety;
- safe partial value;
- accepted entity context;
- a durable plan/decision/project output contract;
- explicit readiness;
- material triggers;
- lifecycle;
- suppression and cooldown; and
- no output-generated completion.

### 10.2 Contextual trigger families

Recommended triggers:

- `CAPITAL_NEED_NEAR_TERM`;
- `CAPITAL_DECISION_EVIDENCE_CHANGED`;
- `CAPITAL_DECISION_READY`;
- `CAPITAL_DECISION_BLOCKED`;
- `CAPITAL_QUOTE_OR_RULE_DEADLINE`;
- `CAPITAL_RESERVE_GAP`;
- `CAPITAL_FUNDING_PLAN_STALE`;
- `CAPITAL_PROJECT_ACTION_DUE`; and
- `CAPITAL_OUTCOME_RECONCILIATION_DUE`.

Each trigger must identify:

- decision or need;
- evidence;
- materiality;
- urgency;
- controllable action;
- owner;
- suppression;
- revisit; and
- resolution.

### 10.3 Completion

Valid completion signals:

- `capital_plan_reviewed`;
- `capital_decision_recorded`;
- `capital_wait_plan_recorded`;
- `capital_no_action_recorded`;
- `capital_reserve_plan_updated`;
- `capital_funding_plan_selected`;
- `capital_project_created`;
- `capital_prerequisite_resolved`; and
- `capital_outcome_reconciled`.

Invalid completion signals:

- page load;
- GET request;
- model output generated;
- result refreshed;
- benchmark table displayed;
- fund row automatically created; or
- generic financing option clicked.

### 10.4 Home Record writes

Use real canonical destinations and entities:

- Inventory item editor;
- inspection/diagnostic finding;
- policy/warranty record;
- tax record;
- permit/HOA record;
- quote/accepted terms;
- reserve contribution;
- financing offer/application;
- Project Tracker;
- Home Event;
- actual expense/payment;
- warranty;
- and Home Timeline.

Do not create an undefined generic “Home Record” correction route.

### 10.5 Safety

Required safety gates:

- emergency/safety conditions bypass financial optimization;
- model-only evidence cannot create an urgent categorical replacement action;
- wait/defer requires safety eligibility;
- financing is educational until an actual offer exists;
- equity screen is not qualification;
- tax, legal, permit, HOA, coverage, engineering, and lending boundaries are
  explicit;
- sponsored providers or lenders do not influence recommendation rank;
- partner compensation is disclosed;
- homeowner consent precedes external handoff;
- affordability concerns do not hide safer low-cost alternatives;
- and all material decisions remain auditable.

---

## 11. Recommended Implementation Sequence

### Slice 0 — Truth containment and broken-semantics repair

**Objective:** Prevent the current portfolio from overstating certainty,
financial loss, plan readiness, or financing availability.

Work:

- remove the duplicate recommended monthly set-aside from Capital Timeline;
- make Reserve Fund the temporary single owner of set-aside;
- correct far-term reserve math to subtract allocated balance;
- derive or remove unused `FUNDED` and `OVERDUE` states;
- align near-term and Guidance thresholds;
- label timeline windows as modeled planning ranges;
- disclose static lifecycle, climate, cost, and growth assumptions;
- prevent “high confidence” from implying model validation;
- downgrade or gate `REPLACE_NOW` on sparse/model-only evidence;
- correct repair lookback naming and event classification;
- label Repair vs. Replace payback as simplified/educational or suppress it;
- make Do-Nothing controls behaviorally truthful;
- remove unrelated savings offsets from physical downside;
- suppress unsupported property-wide dollar-loss claims for a specific capital
  decision;
- rename `helocEligible` in UI/API semantics to an equity screen;
- prevent hard-coded rate fallbacks from appearing freshly sourced;
- label all financing results as benchmarks;
- stop workflow completion on data load/output generation;
- fix dead or context-losing CTAs; and
- add regression tests.

Acceptance:

- one set-aside figure is visible;
- saved balance reduces the far-term target;
- model-only timing and cost are labeled;
- ignored scenario controls actually change the output or are removed;
- no equity-only result says lender-eligible;
- fallback rates show unknown/fallback freshness;
- no generated result records decision completion; and
- every primary CTA preserves the subject context.

### Slice 1 — Capital Plan contract and portfolio disposition

**Objective:** Establish one outcome, route, vocabulary, and lifecycle.

Work:

- approve canonical job and scope;
- finalize need, decision, option, cost, timing, prerequisite, reserve, funding,
  project, and outcome taxonomies;
- register `capital-plan`;
- define readiness, triggers, completion, revisit, safety, and relationships;
- create canonical route shell;
- approve current capability dispositions;
- define ownership-tenure Break-Even move;
- define property-risk Do-Nothing move;
- define Financing profile versus project-funding boundary;
- define legacy redirect/retirement plan;
- update navigation, mobile catalog, discovery, Guidance, Home Actions,
  analytics, and inventory generation; and
- record ADRs.

Acceptance:

- one capability owns capital decision planning;
- every old capability has a target role or retirement path;
- four meanings of break-even are explicitly separated;
- one decision lifecycle is approved;
- no tool catalog presents the old stages as peer outcomes; and
- Product Framework validation passes.

### Slice 2 — Clean schema and durable decision lineage

**Objective:** Create the canonical plan and decision records.

Work:

- update Prisma directly without a migration script;
- add clean Capital Plan, Need, Decision, Option, Cost Snapshot/Line,
  Prerequisite, Reserve Plan/Allocation, Funding Plan/Option, and Outcome
  records;
- remove or replace obsolete schema where appropriate;
- add typed source references;
- add method and definition versions;
- add input fingerprints;
- add staleness and supersession;
- add explicit homeowner decision fields;
- add project and outcome linkage;
- preserve audit provenance;
- enforce authorization and idempotency; and
- avoid dual writes.

Acceptance:

- one record carries a decision from identification through outcome;
- generated recommendation and homeowner decision are separate;
- all material amounts and dates retain source and method;
- stale evidence does not overwrite prior decisions;
- schema validates; and
- no migration script exists.

### Slice 3 — Capital coverage and evidence-backed timeline

**Objective:** Make the timeline a trustworthy plan, not a failure forecast.

Work:

- build capital coverage by property responsibilities and system categories;
- create adapters for Inventory, Home Record, Digital Twin projections,
  inspections, maintenance, projects, documents, Home Events, and professional
  findings;
- implement timing precedence;
- version lifecycle and climate methods;
- replace point-life logic with ranges where evidence supports it;
- localize costs through governed benchmarks;
- implement cost precedence;
- show source status and conflicts;
- distinguish active issue, professional date, planned date, and modeled window;
- support partial coverage;
- implement correction deep links;
- recalculate with last-known-good behavior; and
- create accessible timeline/list views.

Acceptance:

- no modeled date is called a failure date;
- every event shows its timing and cost evidence class;
- missing capital categories are visible;
- professional/homeowner dates outrank model dates;
- quotes supersede model cost when scope matches;
- conflicts remain visible; and
- sparse inventory cannot imply a complete plan.

### Slice 4 — Unified reserve plan

**Objective:** Turn capital needs into one mathematically coherent funding
target.

Work:

- move reserve UI into Capital Plan;
- implement remaining-unfunded scheduling;
- support due date, priority, selected decision, coverage, and external funding;
- derive active, funded, overdue, retired, and superseded states;
- forecast balance and contributions;
- show item allocations;
- preserve contribution ledger and reconciliation;
- distinguish self-reported ledger from bank transactions;
- integrate Budget affordability;
- align action thresholds;
- implement pause/revisit semantics;
- create expected-versus-actual reserve use; and
- add golden fixtures.

Acceptance:

- the same reserve calculation appears everywhere;
- current balance reduces the recommended contribution;
- completed and covered needs do not remain funded targets;
- funded and overdue states are real;
- unaffordable contribution has a safe next step;
- calculations are reproducible; and
- no money movement is implied.

### Slice 5 — Decision workspace and option comparison

**Objective:** Compare maintain, repair, replace, upgrade, and wait in one
context.

Work:

- create or open Capital Decision from need, issue, system, project, Guidance,
  or Home Action;
- implement stage readiness;
- reuse Repair vs. Replace logic only after model governance;
- correct event deduplication and repair classification;
- support inspection/diagnosis gate;
- add warranty, coverage, safety, comfort, energy, resilience, disruption,
  incentive, tax, and lifecycle tradeoffs;
- add quality tiers and scoped options;
- implement recommendation eligibility;
- create explicit homeowner decision and reason;
- support no-action and revisit;
- show sensitivity and limitations; and
- preserve entity context.

Acceptance:

- options share one baseline and scope;
- sparse evidence produces “needs evidence,” not categorical replacement;
- the homeowner can choose a different option than the recommendation;
- the choice and reason persist;
- safety conditions cannot be deferred through financial preference; and
- generated analysis does not equal a decision.

### Slice 6 — Decision-specific wait and payback

**Objective:** Replace generic Do-Nothing and ambiguous Break-Even with
decision-specific comparisons.

Work:

- create typed wait/defer scenarios;
- require subject, horizon, monitoring, and reconsideration trigger;
- separate gross consequence, expected loss, and unquantified risk;
- remove unrelated property risks;
- implement calibrated probability only when evidence supports it;
- add emergency premium and deterioration assumptions transparently;
- implement decision-specific incremental cost and lifecycle payback;
- include financing consistently;
- support “not eligible” and “not reached”;
- preserve nonfinancial tradeoffs;
- compare delay dates;
- add actual-outcome calibration hooks; and
- retire the capital use of standalone Do-Nothing and generic Break-Even.

Acceptance:

- wait analysis concerns the active decision only;
- cost and likelihood use one documented method;
- controls change the calculation;
- overlap/double counting tests pass;
- payback names its baseline and scope;
- no ownership-tenure result appears in a project decision; and
- safety gating passes.

### Slice 7 — Price, prerequisite, and net-cost integration

**Objective:** Validate the decision before commitment.

Work:

- integrate Service Price Radar and quote workflow by reference;
- normalize scope, quantity, quality, inclusions, exclusions, and fees;
- consume accepted Price Finalization terms;
- resolve warranty and coverage;
- resolve permit, HOA, and renovation-risk prerequisites;
- resolve Property Tax implication with jurisdiction-qualified language;
- resolve incentives through Savings and Benefits;
- calculate gross, covered, incentivized, tax-qualified, and net homeowner cost
  separately;
- track deadlines and blockers;
- update decision when evidence changes;
- prevent double counting; and
- preserve source snapshots.

Acceptance:

- a quote does not silently replace a differently scoped option;
- accepted price flows into reserve/funding;
- prerequisites have status and canonical owner;
- unknown tax/coverage/incentive effect remains unknown;
- blocked decisions cannot appear execution-ready; and
- net cost traces to source lines.

### Slice 8 — Funding and affordability

**Objective:** Help the homeowner prepare or pay without implying approval.

Work:

- split mortgage/equity context from project funding;
- preserve and harden canonical financing profile;
- replace HELOC eligibility with equity-screen semantics;
- create typed rate source/fallback status;
- add fees, terms, variable-rate scenarios, and normalized comparison horizon;
- integrate reserve and cash contribution;
- integrate Budget affordability;
- create benchmark, prequalification, offer, application, approval, funded,
  declined, expired, and withdrawn states;
- support actual offer document intake;
- compare offer terms;
- implement consented partner handoff and disclosures;
- bind funding plan to decision and selected cost snapshot;
- persist selected funding plan separately from a benchmark click; and
- add regulated review.

Acceptance:

- benchmark, screen, offer, approval, and funding are distinct;
- stale or fallback rates are obvious;
- fees and term differences are visible;
- affordability is not inferred from equity;
- selected funding traces to a decision and price;
- no partner compensation changes ranking; and
- application requires explicit consent.

### Slice 9 — Project execution and outcome reconciliation

**Objective:** Carry the decision into completion and improve the home record.

Work:

- create Project Tracker record from an execution-ready decision;
- preserve selected option, scope, accepted price, provider, funding,
  prerequisites, evidence, and return context;
- synchronize project changes and payments;
- reconcile actual cost and funding;
- record completion evidence and warranty;
- retire/reset capital need;
- update Inventory/Home Record and Digital Twin projection;
- update Capital Timeline and Reserve;
- update Ownership Costs and Home Timeline;
- preserve expected-versus-actual;
- create follow-up inspection or maintenance;
- resolve Home Action/Guidance; and
- handle cancellation, partial completion, and supersession.

Acceptance:

- project creation requires no material re-entry;
- scope and cost changes remain auditable;
- completion updates the system lifecycle;
- reserve target is released or reconciled;
- actual cost is preserved;
- open actions resolve correctly; and
- expected-versus-actual data is available for model validation.

### Slice 10 — Downstream cutover, legacy retirement, and operations

**Objective:** Remove duplicated logic and operate the outcome safely.

Work:

- inventory all current consumers;
- cut Home, Guidance, mobile, related tools, Ownership Costs, Budget,
  Sell/Hold/Rent, Digital Twin, Service Price, Property Tax, Coverage, and
  Projects over to the canonical records;
- move ownership-tenure Break-Even;
- remove old independent set-aside, do-nothing, payback, and funding paths;
- redirect or retire legacy routes;
- remove duplicate catalog and analytics identities;
- delete unused services, DTOs, schema, and tests;
- regenerate capability inventories;
- add calculation replay and evidence/source dashboards;
- add anomaly, staleness, and failed-write-back alerts;
- complete accessibility, performance, security, content, financial-safety,
  and operations review; and
- approve launch gates.

Acceptance:

- one capital-plan calculation path remains;
- no legacy route presents a contradictory answer;
- every material result is reproducible;
- operations can explain decision lineage;
- source and failure dashboards are live;
- all launch gates pass; and
- the working product measures decisions and outcomes, not tool opens.

---

## 12. Priority, Dependencies, and Release Gates

### 12.1 Priority

| Priority | Work |
| --- | --- |
| P0 | Slice 0 truth containment |
| P0 | Slice 1 canonical contract and disposition |
| P0 | Slice 2 clean schema and lineage |
| P1 | Slice 3 evidence-backed timeline |
| P1 | Slice 4 unified reserve |
| P1 | Slice 5 option comparison |
| P1 | Slice 6 wait and payback |
| P1 | Slice 7 price/prerequisites/net cost |
| P1 | Slice 8 funding and affordability |
| P1 | Slice 9 execution and reconciliation |
| P2 | Slice 10 full cutover, deletion, and advanced operations |

### 12.2 Critical dependencies

- Digital Twin projection-service boundary;
- Inventory and Home Record fact reconciliation;
- Service Price Radar evidence and quote workflow;
- Property Tax canonical records and qualified project implications;
- Coverage and warranty facts;
- Permit, HOA, and Renovation Risk workflows;
- Hidden Savings and Benefits source/eligibility contract;
- Ownership Costs canonical read model;
- Budget Planner affordability contract;
- Project Tracker creation and write-backs;
- Home Actions and Guidance lifecycle;
- canonical financing profile;
- provider/lender consent and commercial-integrity policy; and
- method/source version governance.

### 12.3 Launch gates

The consolidated capability must not launch generally until:

1. plan, need, decision, option, cost, reserve, funding, and outcome contracts
   are approved;
2. duplicate set-aside calculations are removed;
3. current balance reduces the remaining reserve target;
4. model-only dates and costs are visibly estimated;
5. high confidence no longer means only input completeness;
6. categorical recommendations are evidence-gated;
7. wait/defer is decision-specific and safety-gated;
8. break-even semantics are typed and separated;
9. quotes and actual terms supersede models only when scope matches;
10. financing screen, benchmark, offer, approval, and funding are distinct;
11. every promoted action is executable;
12. output generation does not complete a decision;
13. project creation preserves lineage;
14. completion write-backs are idempotent;
15. Material Financial and regulated-boundary review passes;
16. authorization, accessibility, responsive, and performance gates pass; and
17. operations can reproduce the result.

---

## 13. Testing Strategy

### 13.1 Unit tests

Test:

- capital coverage;
- source precedence;
- timing precedence;
- cost scope matching;
- evidence freshness;
- lifecycle range;
- model confidence versus input completeness;
- need materiality;
- decision readiness;
- option eligibility;
- repair-event deduplication;
- failure-model bounds;
- wait/defer safety eligibility;
- probability and consequence separation;
- payback eligibility;
- cost-line inclusion;
- reserve remaining target;
- allocation sequencing;
- funded/overdue/retired states;
- affordability;
- financing screen;
- rate fallback freshness;
- product fee/term math;
- funding lifecycle;
- prerequisite resolution;
- project handoff;
- outcome reconciliation;
- completion; and
- staleness/supersession.

### 13.2 Golden fixtures

Required fixtures:

- new home with sparse inventory;
- older home with confirmed roof installation date;
- condo with HOA responsibility;
- rental property;
- active leak/safety issue;
- HVAC with professional diagnosis;
- appliance with warranty coverage;
- repair with one clean historical invoice;
- multiple event rows for one repair;
- high repair count but incomplete source amounts;
- quote that matches scope;
- quote that does not match scope;
- permit-required project;
- HOA-required project;
- tax-impact unknown;
- qualified rebate;
- modeled cost only;
- accepted contract price;
- reserve with no balance;
- reserve with partial balance;
- restricted allocation;
- near-term shortfall;
- fully funded need;
- overdue need;
- completed/superseded need;
- affordable cash plan;
- unaffordable plan;
- equity screen passed but no qualification;
- hard-coded fallback financing rates;
- actual loan offer with fees;
- wait option eligible;
- wait option unsafe;
- payback reached;
- payback not reached;
- project completed below estimate;
- project completed above estimate; and
- canceled or partially completed project.

Assert exact:

- need coverage;
- timing and source;
- cost source and range;
- recommendation eligibility;
- selected option state;
- payback eligibility/result;
- reserve target and monthly schedule;
- funding classification;
- prerequisite status;
- Home Action;
- project handoff;
- write-backs; and
- completion.

### 13.3 Contract and integration tests

Verify:

- Digital Twin contributes projection without becoming source truth;
- Inventory corrections update need evidence;
- Service Price Radar quote flows by reference;
- accepted terms update cost snapshot;
- Property Tax/Coverage/permit/HOA/incentive results remain canonical;
- Budget receives monthly impact;
- reserve and financing do not double-fund;
- decision context survives every route;
- project creation preserves source lineage;
- completion resets timeline and reserve exactly once;
- Ownership Costs receives planned/actual capital data correctly;
- Guidance and Home Actions share lifecycle;
- legacy routes redirect;
- capability discovery resolves the new capability; and
- authorization is enforced.

### 13.4 UI and end-to-end tests

Cover:

- no systems;
- partial plan;
- model-only event;
- conflicting facts;
- needs diagnosis;
- safety block;
- option comparison;
- wait scenario;
- payback unavailable;
- price missing;
- quote comparison;
- prerequisite blocked;
- reserve shortfall;
- unaffordable plan;
- benchmark financing;
- actual offer;
- decision capture;
- no-action/revisit;
- project creation;
- project change;
- completion reconciliation;
- stale evidence;
- partial source outage;
- last-known-good;
- mobile;
- keyboard;
- screen reader;
- chart alternatives;
- reduced motion; and
- deep-link return continuity.

### 13.5 Nonfunctional tests

- tenant isolation;
- role authorization;
- idempotency;
- concurrent recalculation;
- numeric precision;
- date/time-zone boundaries;
- partial failure;
- source timeout;
- stale cache;
- deterministic replay;
- schema version compatibility for retained records;
- calculation performance;
- notification deduplication;
- audit integrity;
- accessibility;
- responsive layout;
- content safety;
- financial disclosure; and
- commercial-integrity separation.

---

## 14. Measurement

### 14.1 Primary outcome metrics

- properties with a reviewed capital plan;
- capital-plan coverage by applicable category;
- material needs with evidence-qualified timing and cost;
- decisions recorded;
- decisions reaching execution readiness;
- reserve plans updated;
- funding gaps resolved;
- prerequisites resolved;
- projects created from decisions;
- projects completed;
- completion write-back success;
- expected-versus-actual cost variance;
- surprise capital expenses;
- repeated-repair spend avoided where causally supportable; and
- time from material need to resolved decision.

### 14.2 Trust and quality metrics

- model timing calibration;
- cost estimate versus quote variance;
- quote versus actual variance;
- recommendation override rate;
- sparse-evidence categorical recommendation rate;
- wait-scenario calibration;
- payback eligibility rate;
- reserve under/over-target error;
- funding benchmark versus offer variance;
- stale source rate;
- unresolved conflict rate;
- duplicate event/cost suppression;
- failed prerequisite handoff;
- failed write-back;
- calculation replay success; and
- support contacts about unclear recommendations or money.

### 14.3 Experience metrics

- time to understand the active decision;
- high-impact fact correction;
- stage progression;
- option comparison completion;
- price-validation completion;
- reserve/funding-plan completion;
- decision reason capture;
- project handoff completion;
- return after meaningful trigger;
- abandonment by stage;
- mobile completion; and
- accessibility defects.

### 14.4 Anti-metrics

Do not optimize for:

- number of tools opened;
- number of simulations run;
- number of generated replacement recommendations;
- larger modeled downside;
- more financing clicks;
- equity-screen pass rate;
- higher reserve target;
- higher confidence labels;
- permanent Home cards;
- page-load completion; or
- partner conversion ahead of homeowner outcome.

---

## 15. Risks and Mitigations

| Risk | Consequence | Mitigation |
| --- | --- | --- |
| One workspace becomes too broad | Overwhelming experience | Stage-based progressive disclosure and one next action |
| Model date appears certain | Premature spend | Planning-window language, source status, and evidence gate |
| Sparse evidence produces replacement pressure | Financial harm and trust loss | Diagnosis/readiness gate and noncategorical result |
| Reserve overstates need | Unaffordable savings target | Remaining-unfunded math and Budget integration |
| Reserve underfunds urgent item | Surprise expense | Priority/date scheduling and near-term shortfall |
| Quote/model scope mismatch | Wrong funding plan | Scope normalization and explicit supersession |
| Do-Nothing double counts risk | Exaggerated loss aversion | Decision-specific model and correlation tests |
| Break-even definitions remain ambiguous | Wrong decision | Typed calculation names and portfolio repositioning |
| Equity screen implies approval | Lending harm | Rename, disclose, and model qualification lifecycle |
| Static rate appears current | Misleading financing decision | Source/fallback state and true as-of semantics |
| Financing options omit fees/variability | Bad comparison | Typed terms, fee model, rate scenarios, actual offer intake |
| Tax/coverage/incentive effect treated as guaranteed | Incorrect net cost | Canonical qualified handoff and unknown state |
| Project handoff loses decision context | Re-entry and drift | Durable decision ID and source snapshots |
| Completion writes conflict | Corrupted home record | Idempotent typed write-backs and audit |
| Consolidation breaks existing Guidance | Dead journeys | Consumer inventory and staged cutover |
| No migration preserves bad semantics | Clean-start opportunity lost | Direct schema redesign and deletion of obsolete contracts |

---

## 16. Open Product and Technical Decisions

Decide during Slice 1:

1. Final name: “Capital Plan,” “Major Home Projects,” or “Home Investment
   Plan.”
2. Applicable capital categories by property use, type, responsibility, and
   ownership.
3. Whether one capital need can have multiple simultaneous decisions.
4. Required evidence for categorical repair/replacement recommendation.
5. Governed lifecycle and climate source strategy.
6. Cost benchmark source strategy.
7. Materiality and notification thresholds.
8. Reserve allocation algorithm and posture names.
9. Treatment of emergency cash versus capital reserve.
10. Budget affordability thresholds and homeowner controls.
11. Wait/defer eligibility and professional gates.
12. Decision-specific payback methods by option type.
13. Whether broader Do-Nothing remains a separate Risk capability.
14. Final homeownership-tenure Break-Even destination.
15. Financing product scope and offer partners.
16. Benchmark rate source and freshness SLA.
17. Prequalification/application consent and retention.
18. Required prerequisites by project category and jurisdiction.
19. Project creation readiness threshold.
20. Outcome retention and model-learning governance.
21. Legacy route retirement timing.

None requires a database migration script or historical backfill.

---

## 17. Definition of Done

Capital Decision Planning is complete when:

- one Capital Plan owns the property-level outcome;
- Capital Timeline and Reserve use one plan and one set-aside method;
- saved balance reduces remaining reserve needs;
- funded, overdue, retired, and completed states are real;
- every capital need shows coverage, source, timing type, cost evidence, and
  uncertainty;
- model dates are planning windows, not failure predictions;
- generated recommendations and homeowner decisions are separate;
- maintain, repair, replace, upgrade, wait, inspect, and no-action are explicit;
- wait/defer is subject-specific and safety-gated;
- project payback is typed and scope-complete enough to be eligible;
- ownership-tenure and refinance break-even are not confused with project
  payback;
- Service Price Radar and accepted terms own price evidence;
- Property Tax, Coverage, warranty, permits, HOA, incentives, and Digital Twin
  contribute through governed boundaries;
- reserve, cash, affordability, benchmark funding, offer, approval, and funding
  states are distinct;
- equity screen is not called lender eligibility;
- project creation preserves decision lineage without re-entry;
- completion updates Inventory/Home Record, Capital Plan, Reserve, Ownership
  Costs, Home Timeline, Guidance, and Home Actions exactly once;
- expected-versus-actual results are available for validation;
- old peer tools and contradictory routes are retired or repositioned;
- Material Financial, regulated-boundary, authorization, accessibility,
  responsive, and operations gates pass;
- every material calculation is reproducible; and
- success is measured by resolved decisions and completed outcomes.

---

## 18. Final Recommendation

Do not redesign the six tools as six better standalone pages.

The repository already has many of the parts required for a differentiated
capital-planning product. The failure is that each part asks the homeowner to
start over with a new calculator and a new meaning of cost, risk, confidence,
break-even, or completion.

First contain the unsupported or conflicting claims:

- duplicate set-aside figures;
- reserve math that ignores far-term allocated balance;
- categorical replacement from weak evidence;
- generic property-wide “do nothing” dollars;
- ambiguous break-even;
- equity-only financing eligibility; and
- output-generated completion.

Then build one Capital Plan and one durable Capital Decision journey:

> identify → understand → compare → validate → prepare/pay → decide → execute
> → reconcile

The best-in-class differentiator is not a more dramatic risk score or another
financing table. It is preserved decision continuity:

- this is the actual system;
- this is the evidence;
- this is the uncertainty;
- these are the realistic options;
- this is the comparable all-in cost;
- this is what waiting means;
- these prerequisites apply;
- this is the reserve and funding plan;
- this is the homeowner’s decision and reason;
- this is the project created from it; and
- this is what actually happened.

That coherent journey turns Digital Twin projections, Inventory, Capital
Timeline, Reserve Fund, Repair vs. Replace, Service Price Radar, Property Tax,
Coverage, Financing, Budget, Project Tracker, Guidance, and Home Actions into
one homeowner outcome rather than a portfolio of disconnected tools.
