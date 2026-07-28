# Ownership Cost Intelligence Capability Audit and Implementation Plan

**Capabilities:** True Cost, Cost Growth, Cost Volatility, and Cost Explainer  
**Contributing domains:** Property Tax, Coverage and Premium Review, Financing, Expenses, Utilities, Home Record, Capital Timeline, Reserve Fund, Budget Planner, Guidance, and Home Actions  
**Audit framework:** `CAPABILITY_OUTCOME_AND_EXPERIENCE_AUDIT_FRAMEWORK.md`  
**Audit date:** July 28, 2026  
**Status:** Implementation in progress — Slices 0–3 started July 28, 2026
**Recommended disposition:** **Consolidate, rebuild the calculation and evidence contract, and contain unsupported historical and predictive claims immediately**  
**Current safety classification:** Material financial  
**Recommended safety classification:** Material financial  
**Primary outcome family:** Ownership Cost Intelligence

---

## Implementation progress

### July 28, 2026 — Slice 0 containment increment

Implemented:

- converted True Cost and Cost Growth backcasts into explicitly forward
  projections;
- withheld unsupported Cost Explainer tax, maintenance, and total prior-year
  deltas;
- disabled Cost Volatility scores and history until three comparable observed
  annual periods with a stable category definition exist;
- removed ownership-cost workflow completion on data load;
- stopped True Cost GET requests from persisting Guidance completion;
- added bounded, field-level validation for current scenario inputs;
- repaired the Cost Volatility Budget Planner destination;
- replaced generic primary category actions with canonical category owners;
- updated the Break-Even consumer to treat Cost Growth points as forward
  assumptions; and
- added Slice 0 regression tests.

Remaining Slice 0 work includes completing category-level evidence labels across
all current result cards, auditing every secondary CTA and downstream consumer,
and removing the contained legacy volatility calculation code after the
canonical observed-history contract is available.

### July 28, 2026 — Slice 1 canonical contract increment

Implemented:

- established the versioned ownership-cost lens, category, evidence,
  verification, freshness, coverage, temporal, and line contracts;
- registered one `ownership-costs` Product Framework capability with Material
  Financial safety, Contextual recommendation mode, explicit trigger families,
  relationships, Living Home Record effects, and decision-recorded completion;
- created the canonical property route and four-view workspace shell;
- converted the four legacy tool routes into query-preserving view redirects;
- consolidated mobile and discovery surfaces and retained legacy IDs as
  analytics/discovery aliases;
- routed financial-exposure Guidance to the canonical capability;
- added property-aware global resolution and route-disposition coverage; and
- recorded the consolidation and source-ownership ADR.

The canonical shell intentionally consumes the contained current True Cost API
only as a partial transitional adapter. Canonical persisted observations,
snapshots, and read models remain Slice 2 and Slice 3 work.

### July 28, 2026 — Slice 2 canonical observation increment

Implemented:

- added Prisma contracts for definition, adapter run, observation, snapshot,
  snapshot line, scenario, forecast, forecast line, change, and decision
  records without adding a migration script;
- added canonical tax, coverage, financing, expense, utility, HOA,
  maintenance, recurring-service, project, and reserve adapter boundaries;
- loaded current source records by canonical entity reference instead of
  copying their domain truth;
- normalized recurrence, periods, cents, evidence, verification, freshness,
  applicability, and temporal kind;
- made missing dependencies explicit and kept not-applicable distinct from
  missing and zero;
- added source-priority deduplication for linked domain/expense records;
- added method, category, adapter, source, and aggregate fingerprints;
- persisted correction lineage when a referenced canonical source changes;
- made repeated identical calculation reuse the same snapshot; and
- enforced property access before source reads or persistence.

The recurring-service adapter intentionally remains empty when no source record
explicitly establishes recurrence; one-time repair expenses are not relabeled
as recurring services. Mortgage principal, interest, and PMI are likewise
withheld when the financing source cannot support an allocation.

### July 28, 2026 — Slice 3 current-cost increment

Implemented:

- added a canonical `OwnershipCostReadModelService` over persisted snapshots;
- exposed read-only current-cost and explicit contributor-scoped recalculation
  endpoints;
- limited the current experience to operating-expense and cash-outflow lenses;
- kept mortgage principal, interest, PMI, capital spend, and reserve
  contributions as separate categories;
- aggregated confirmed and estimated amounts independently while preserving
  missing and not-applicable states;
- added category-level evidence, source period, verification, freshness, and
  canonical correction destinations;
- ranked the highest-impact missing, stale, or unconfirmed category action;
- returned the latest persisted snapshot when a source refresh fails and
  labeled it as last-known-good;
- replaced the canonical page's transitional True Cost dependency with the
  persisted read model;
- added responsive category composition, an accessible evidence table, lens
  definitions, limitations, readiness telemetry, and correction-funnel
  telemetry; and
- added Slice 3 aggregation, lens, authorization, fallback, endpoint, and UI
  contract tests.

Observed change explanations, forecasts, scenarios, and measured variability
remain intentionally gated for Slices 4–6.

---

## 1. Executive Decision

True Cost, Cost Growth, Cost Volatility, and Cost Explainer are presented as four
standalone tools, but they are four views of one homeowner job:

> Help me understand what it costs to own this home, which costs changed or may
> change, how certain the numbers are, and what I can do about the most
> important cost.

The repository contains useful foundations:

- canonical property, occupancy, dwelling, location, and financial context;
- property tax, insurance, financing, expense, reserve, and capital-planning
  records;
- state and market fallbacks;
- Property Context reconciliation and version disclosure;
- property-scoped routes and calculation APIs;
- scenario inputs for selected calculations;
- category rollups and multi-year visualizations;
- Guidance integration;
- Product Framework capability definitions; and
- contextual discovery for Cost Growth.

Those foundations do not currently create a coherent or trustworthy ownership
cost experience.

The most material current problems are:

1. **The four tools do not share one definition of ownership cost.** True Cost
   includes property tax, insurance, maintenance, and utilities. Cost Growth
   omits utilities. Cost Explainer omits utilities. Cost Volatility includes
   the True Cost total in one window but only tax and insurance in another.
2. **The product does not distinguish operating expense, cash outflow, economic
   cost, reserve contribution, and capital expenditure.** “True Cost” therefore
   promises a completeness that the current calculation cannot deliver.
3. **Several “history” and “trend” series are synthetic backcasts.** The
   services start with current estimates and reverse inflation or other growth
   assumptions to construct prior years. The UI then describes those points as
   history, changes from last year, or a multi-year projection.
4. **Cost Explainer can explain a modeled change as though it occurred.**
   Property tax is often held flat, maintenance is reversed by a fixed
   inflation factor, and insurance consumes modeled history. A “delta vs last
   year” is not necessarily an observed delta.
5. **Cost Volatility can infer unpredictability without observed cost
   volatility.** Its score combines synthetic insurance history, static tax
   cadence, state sensitivity, and an unpopulated climate-event input.
6. **Cost Growth mixes an appreciation model with incomplete cost models.** It
   can imply that appreciation is outpacing ownership costs while excluding
   utilities, financing economics, transaction costs, and capital
   expenditures.
7. **Current cost inputs ignore useful repository-owned evidence.** The
   canonical `Expense` records and the Property Context 365-day ownership
   expense summary are not used by these tools.
8. **Canonical domain data is inconsistently consumed.** Insurance is
   calculated one way in True Cost and another way in Cost Growth. Property tax
   may be a current planning estimate even when richer assessment and bill
   records exist.
9. **Confidence is too coarse.** A single global confidence label can obscure
   that one category is confirmed while another is a generic state estimate.
10. **The category model is materially incomplete.** HOA or condo dues,
    mortgage payment, interest, principal, PMI, recurring home services,
    property-specific utility bills, known repairs, and capital projects are
    missing or inconsistently represented.
11. **Action routing is generic or broken.** Categories commonly route to Home
    Savings rather than their canonical decision owner. Cost Volatility's
    “Build a buffer plan” control is not executable, and one service points to
    a property-scoped Budget Planner route that does not exist.
12. **Generated output is treated as completion.** Frontend workflows complete
    when data loads, and True Cost can persist a completed Guidance result
    during a read. The homeowner has not necessarily reviewed, decided, acted,
    or resolved anything.
13. **Four peer catalog entries expose internal analytical mechanics.** A
    homeowner must choose among “True Cost,” “Growth,” “Volatility,” and
    “Explainer” before the product has answered the basic question.
14. **There is no durable ownership-cost ledger or reproducible calculation
    run.** The platform cannot reliably show what was observed, estimated,
    overridden, forecast, changed, or used in a prior decision.
15. **Tests verify wiring rather than financial truth.** Current structural
    tests verify context scopes and disclosure hooks, but not category
    consistency, formulas, temporal semantics, provenance, scenario bounds, or
    decision completion.

The recommended product decision is:

1. replace the four peer experiences with one property-scoped **Ownership
   Costs** workspace;
2. make **Current cost**, **What changed**, **What may change**, and **Plan a
   buffer** progressive views of that workspace;
3. define and label distinct operating-expense, cash-outflow, economic-cost,
   reserve, and capital-spend lenses;
4. use canonical domain facts by reference instead of recreating tax,
   insurance, financing, utility, or capital-plan truth;
5. create a category-level evidence, period, freshness, verification, and
   confidence contract;
6. show actual history only when observed period records exist;
7. represent future calculations as versioned forecasts or scenarios, never as
   reconstructed history;
8. withhold volatility conclusions until sufficient comparable observations
   exist;
9. route each category to its canonical action owner;
10. promote only a material change, missing high-impact fact, upcoming expense,
    or unresolved action to Home;
11. record a homeowner decision or action—not a GET request or page render—as
    completion; and
12. cut downstream decision tools over to the canonical ownership-cost read
    model.

The target promise should be:

> See what this home costs today, where each number came from, what changed,
> what may change next, and the action that could improve your plan.

### 1.1 Implementation constraint

There are no real users and no production data migration requirement.

Implementation may change the Prisma schema directly. It must not create:

- database migration scripts;
- historical backfills;
- compatibility tables for obsolete cost semantics;
- dual-write behavior;
- synthetic observed-history rows;
- legacy fields solely to preserve the current four-tool contracts; or
- automatic conversion of current generated results into confirmed facts.

The user will reconcile the database separately after schema changes.

This constraint should be used to create a clean canonical model and remove
ambiguous contracts rather than preserving them.

---

## 2. Scope and Capability Boundaries

### 2.1 In scope

This audit covers:

- True Cost service, controller, routes, API, UI, Guidance integration, and
  completion behavior;
- Cost Growth service, controller, routes, API, UI, scenarios, discovery
  trigger, and analytics;
- Cost Volatility service, controller, routes, API, UI, score, events,
  thresholds, actions, and claims;
- Cost Explainer service, controller, routes, API, UI, category changes,
  narratives, and actions;
- Product Framework definitions, route disposition, recommendation mode,
  readiness, safety, relationships, and completion;
- property and financial context requirements;
- expense, tax, insurance, financing, utility, reserve, and capital-plan inputs;
- temporal semantics, formulas, source provenance, confidence, freshness,
  assumptions, overrides, persistence, and reproducibility;
- current cost, observed history, change explanations, forecasts, scenarios,
  volatility, buffer guidance, and category actions;
- global, mobile, property-scoped, Home, Guidance, and downstream-consumer
  surfaces;
- accessibility, responsive behavior, telemetry, operations, and tests; and
- consolidation and retirement of duplicate routes.

### 2.2 Adjacent but not absorbed

| Capability or domain | Canonical responsibility | Ownership Costs responsibility |
| --- | --- | --- |
| Property Tax and Tax Appeal | Assessment, bill, rate, exemption, appeal, deadline, and tax decision truth | Consume the current and historical tax facts; summarize a material change; hand off tax action |
| Coverage and Premium Review | Policy terms, premium, renewal, quote, adequacy, carrier, and coverage decision truth | Consume premium facts; explain cost contribution; hand off premium or coverage action |
| Financing and Mortgage Refinance Radar | Loan terms, payment, principal, interest, PMI, refinance offers, and refinance decision | Separate payment, principal, interest, and PMI correctly; hand off financing action |
| Expenses and documents | Observed bills, payments, invoices, and source evidence | Normalize eligible observations into comparable periods without replacing source records |
| Capital Timeline and projects | Planned replacements, projects, lifecycle events, and capital schedule | Show upcoming capital spend separately from recurring cost and expose its planning impact |
| Reserve Fund | Reserve goal, contribution plan, funding progress, and capital readiness | Consume the planned reserve contribution as a cash-planning lens, not as money already spent |
| Budget Planner | Household cash-flow plan and affordability | Receive a confirmed or estimated ownership cash-outflow view and own the budget decision |
| Hidden Savings and Benefits | Qualified savings, benefits, applications, quotes, and realized savings | Hand off an actionable cost category; do not invent generic savings |
| Break-Even | Time-to-recoup for a defined decision | Consume a versioned cost snapshot or scenario |
| Sell / Hold / Rent | Property strategy comparison | Consume versioned ownership-cost assumptions; retain transaction and strategy logic |
| Home Actions | Cross-capability priority and lifecycle | Rank material cost changes and unresolved cost actions |

### 2.3 Explicitly out of scope

This document does not:

- provide tax, legal, accounting, mortgage, utility, or investment advice;
- determine whether homeownership is financially optimal;
- calculate tax deductions or tax-equivalent cost;
- define a household-wide budgeting product;
- source utility tariffs or competitive offers;
- select financial, insurance, utility, or data partners;
- replace canonical domain records;
- invent past bills from current values;
- create a database migration; or
- implement the recommended slices.

### 2.4 Evidence reviewed

Repository evidence includes:

- the Product Framework and capability audit framework;
- capability definitions, relationships, discovery modes, readiness, safety,
  route mappings, mobile catalog, and generated inventory;
- the four backend services, controllers, routes, DTOs, and frontend clients;
- Property Context, financial applicability, financing, tax, coverage,
  expense, reserve, and capital-plan models;
- Guidance mappings and completion behavior;
- Home Tools and production-readiness documentation;
- Property Tax, Coverage, Refinance, Reserve Fund, Hidden Savings, and Digital
  Twin audits;
- analytics events and outcome signals; and
- current ownership-cost unit tests.

No single governing document currently defines one Ownership Cost Intelligence
calculation, evidence, experience, or lifecycle contract.

---

## 3. Homeowner Job and Question Contract

### 3.1 Primary job

> Show me the cost of owning this home in a way I can trust, help me understand
> the biggest changes and upcoming pressure, and help me take the right action.

### 3.2 Secondary jobs

- Know the current monthly and annual cost.
- See which categories are included and missing.
- Distinguish confirmed bills from estimates.
- Understand why a category increased or decreased.
- See upcoming renewals, reassessments, rate changes, and planned replacements.
- Explore a reasonable future range without confusing a scenario with a
  prediction.
- Decide how much cash buffer or reserve contribution is appropriate.
- Correct a wrong input or add a missing high-impact record.
- Navigate directly to the capability that can resolve a material category.
- Revisit when a meaningful fact or plan changes.

### 3.3 Homeowner Question Contract

| Question | Target answer |
| --- | --- |
| What is this? | A property-specific view of what owning this home costs now and what may change. |
| How will this benefit me? | It reveals the largest cost drivers, missing evidence, meaningful changes, and planning actions. |
| What should I do to realize the full benefit? | Add or confirm only the high-impact bill, policy, loan, HOA, utility, or project fact identified by the product. |
| What should I care about? | The largest verified change, the next known cost event, and any gap large enough to alter the plan. |
| What can I control? | Category-specific actions, scenario assumptions, included cost lens, corrections, reminders, and planning handoffs. |
| Can I trust this? | Every category shows amount, period, source, status, freshness, and whether it is observed, estimated, or forecast. |
| Why return? | A bill, renewal, assessment, financing term, utility cost, project, or scenario changed and the product explains the impact. |

### 3.4 Minimum credible result

A credible result must contain:

- a named cost lens;
- a monthly and annual amount or an honest incomplete state;
- category coverage and missing high-impact categories;
- per-category amount and period;
- observed, confirmed, homeowner-reported, extracted, benchmark, estimated, or
  forecast status;
- source and freshness;
- no reconstructed past represented as observed history;
- assumptions and uncertainty for estimates;
- one relevant next action or a clear no-action state; and
- a timestamped calculation version.

If these conditions cannot be met, the product must show a partial result or
readiness state. It must not display a “true” total, change, volatility score,
or reassuring conclusion.

---

## 4. Current-State Capability Map

### 4.1 Current portfolio

| Capability | Current promise | Current output | Product Framework mode | Current issue |
| --- | --- | --- | --- | --- |
| True Cost | Full cost of owning this home | Current categories plus 5/10-year series | Catalog only | Incomplete definition and synthetic backcast described as projection/history |
| Cost Growth | Long-term ownership-cost trend | Appreciation and selected expenses | Contextual | Mixes market appreciation with incomplete modeled costs |
| Cost Explainer | Explain why home cost increased | Category delta and narrative | Catalog only | Can explain assumed inflation as an observed prior-year change |
| Cost Volatility | Explain unpredictability | 0–100 score, events, and buffer language | Catalog only | Can score synthetic history and unsupported risk proxies |

### 4.2 Current source and definition inconsistency

| Category | True Cost | Cost Growth | Cost Explainer | Cost Volatility |
| --- | --- | --- | --- | --- |
| Property tax | Property Tax planning estimate | Property Tax planning estimate | Property Tax planning estimate, often flat prior year | Current tax repeated or cadence-derived |
| Insurance | Insurance trend service | Separate home-value percentage heuristic | Insurance trend service | Insurance trend service |
| Maintenance | Home-value percentage heuristic | Home-value percentage heuristic | Current heuristic with reversed inflation | Included through True Cost only in part of the calculation |
| Utilities | State annual heuristic | Omitted | Omitted | Included only when using True Cost totals |
| HOA | Omitted | Omitted | Omitted | Omitted |
| Mortgage payment | Omitted | Omitted | Omitted | Omitted |
| Principal/interest split | Omitted | Omitted | Omitted | Omitted |
| PMI | Omitted | Omitted | Omitted | Omitted |
| Recurring services | Omitted | Omitted | Omitted | Omitted |
| Observed expenses | Not consumed | Not consumed | Not consumed | Not consumed |
| Capital spend | Omitted | Omitted | Omitted | Omitted |
| Reserve contribution | Omitted | Omitted | Omitted | Mentioned as action, not integrated |

### 4.3 Temporal inconsistency

| Current behavior | Homeowner interpretation risk |
| --- | --- |
| Current estimate is reversed by an inflation assumption to create earlier years | Modeled backcast appears to be observed history |
| Backward series is summed and described as a five-year projected cost | Past-shaped data appears to be a forward forecast |
| Modeled prior year is subtracted from current year | Assumed inflation appears to be a real bill change |
| Tax reassessment years are inferred from static state cadence | A possible cadence appears to be an observed event |
| Five-year and ten-year volatility inputs contain different categories | Window comparison appears valid when the metric changed definition |
| Current appreciation and annual expense are combined | Home-value gain appears directly comparable to incomplete cash or economic cost |

### 4.4 Current route and discovery fragmentation

The four capabilities have:

- four property-scoped routes;
- four global or mobile navigation entries;
- four icons and page contexts;
- four related-tool relationship sets;
- four analytics identities;
- independent fetch and loading states; and
- overlapping related-tool directions back to one another.

This exposes implementation decomposition rather than a homeowner outcome.

### 4.5 Current persistence

The four services primarily calculate on read. There is no canonical persisted:

- cost definition version;
- period-normalized observation ledger;
- calculation snapshot;
- calculation line provenance;
- change event;
- forecast;
- scenario;
- volatility evidence window;
- homeowner cost decision; or
- realized action outcome.

The existing `Expense` model and Property Context ownership-expense summary are
valuable but insufficiently expressive and currently unused by the four tools.

### 4.6 Current completion

The frontend clients emit `workflow_completed` when output loads. True Cost also
creates a completed Guidance result while generating a response.

Output generation is not completion. A meaningful completion is one of:

- homeowner confirms the cost snapshot;
- homeowner corrects or adds a material fact;
- homeowner saves a scenario;
- homeowner creates or updates a buffer/reserve plan;
- homeowner accepts or dismisses a category action with a reason;
- homeowner completes a canonical downstream decision; or
- homeowner explicitly records that no action is needed until a named date or
  event.

---

## 5. Functional Gap Assessment

### 5.1 Critical calculation gaps

#### 5.1.1 No canonical cost definition

The product must not use one unlabeled “total cost” number for materially
different questions.

The target model must support at least:

| Lens | Included | Treatment |
| --- | --- | --- |
| Operating expense | Tax, insurance, HOA, utilities, recurring services, routine maintenance | Recurring cost of operating and protecting the home |
| Ownership cash outflow | Operating expense plus mortgage principal and interest, PMI, and optional planned reserve contribution | Monthly or annual cash leaving the household; principal is marked as equity transfer |
| Economic ownership cost | Operating expense plus mortgage interest and decision-specific costs | Excludes principal as cost; optional and used only for suitable decisions |
| Capital expenditure | Completed or planned projects, replacements, and major repairs | Separate lumpy spend; never silently averaged into routine maintenance |
| Reserve plan | Planned contribution and funded/unfunded capital needs | Planning amount, not an incurred expense |

The default homeowner view should be **Operating expense** unless enough
financing and recurring-payment facts exist to show **Cash outflow** reliably.

#### 5.1.2 Incomplete category coverage

The current “True Cost” cannot credibly claim completeness while excluding
common and material categories. Required category support:

- property tax;
- homeowners, condo, landlord, flood, wind, earthquake, and other relevant
  property insurance premiums;
- HOA or condo dues and special assessments;
- electricity, gas, heating fuel, water, sewer, trash, and relevant utility
  charges;
- mortgage principal, interest, PMI, and other recurring loan charges;
- recurring home services when included by the homeowner;
- routine maintenance based on observed spend when available;
- known repairs;
- capital projects and replacements as a separate lens; and
- reserve contribution as a separate planning lens.

The product must show **coverage completeness**, not silently treat absence as
zero.

#### 5.1.3 Estimated maintenance is not observed maintenance

A percentage of home value can be a planning benchmark, but:

- it must be labeled a benchmark;
- its method, reference date, and range must be disclosed;
- property age, type, condition, systems, climate, and planned work should
  refine it;
- observed expenses must not be double-counted with the benchmark; and
- it must not generate a claimed historical change.

#### 5.1.4 Utilities require property-specific evidence

A state annual heuristic is suitable only as a low-confidence placeholder. The
target hierarchy should prefer:

1. normalized observed bills;
2. homeowner-confirmed recurring amount;
3. document-extracted amount pending confirmation;
4. provider or tariff estimate with usage and assumptions;
5. local benchmark;
6. broad state benchmark.

The result must identify the level used.

#### 5.1.5 Financing semantics are missing

For cash planning, mortgage payment matters. For economic cost, principal is
not equivalent to interest. The product must:

- show P&I cash outflow;
- split principal and interest when amortization inputs exist;
- label principal as equity transfer;
- include PMI and recurring loan charges;
- avoid tax-deduction claims; and
- defer refinance decisions to Mortgage Refinance Radar.

### 5.2 Evidence and provenance gaps

Every cost line needs:

- canonical category and subcategory;
- amount and currency;
- normalized annual and monthly amount;
- period start and end;
- recurrence;
- source type;
- source entity and document references where applicable;
- observed, homeowner-reported, extracted, confirmed, benchmark, estimated, or
  forecast status;
- verification state;
- source date and freshness;
- confidence appropriate to that line;
- normalization and calculation method;
- assumptions;
- missing dependencies; and
- inclusion in each cost lens.

A single result-level confidence label is not sufficient.

### 5.3 Historical truth gaps

Observed history requires comparable period records. The product must:

- preserve source periods;
- normalize partial periods explicitly;
- identify gaps and category changes;
- avoid interpreting missing data as zero;
- distinguish corrected records from newly observed records;
- compare like-for-like categories;
- show nominal dollars by default and optional inflation-adjusted dollars only
  with a disclosed method; and
- never reverse a current estimate to create an observed prior year.

When history is insufficient, say:

> We do not have enough past bills to show what changed yet.

Then offer the smallest useful setup action and still show the current partial
snapshot.

### 5.4 Change explanation gaps

A best-in-class explanation connects a real change to evidence:

- a new policy premium or renewal;
- a tax bill, assessment, exemption, rate, or reassessment;
- a utility bill or rate/usage change;
- a new HOA amount or special assessment;
- a financing payment or PMI change;
- a repair or recurring-service change; or
- a project or asset lifecycle event.

The explanation should state:

1. what changed;
2. by how much;
3. for which period;
4. whether price, usage, coverage, assessment, financing, or scope changed;
5. what evidence supports the reason;
6. whether the change is recurring or one-time; and
7. what the homeowner can do.

Generic inflation is a forecast assumption, not a historical explanation.

### 5.5 Forecast and scenario gaps

Forward forecasts must start after the latest observed or confirmed period.
They require:

- a definition version;
- a base period;
- category-specific assumptions;
- local or source-backed rates where available;
- known renewal, reassessment, payment, and capital-plan events;
- low/base/high ranges;
- nominal-versus-real-dollar disclosure;
- override bounds and validation;
- scenario persistence;
- side-by-side differences;
- stale-input detection; and
- a statement that the output is planning support, not a guarantee.

Forecasts must not be labeled history. Scenarios must not overwrite canonical
facts.

### 5.6 Volatility and buffer gaps

Volatility must measure comparable observed data. A credible release requires:

- a stable category definition across the window;
- at least three comparable observed annual periods for annual volatility, or
  a statistically appropriate set of monthly observations;
- explicit missing-period handling;
- transparent formula and thresholds;
- no unsupported national benchmark;
- no climate component until a validated event-to-cost relationship exists;
- separation of recurring variability from known one-time capital spend;
- explanation in dollars, not only an index; and
- an executable Budget or Reserve Fund handoff.

Until the evidence threshold is met, show:

> Not enough cost history to measure variability.

The product may still show known upcoming expenses and a scenario-based buffer,
but it must label that as planning rather than measured volatility.

### 5.7 Appreciation and ownership-return gap

Cost Growth currently places appreciation and selected ownership costs in one
comparison. A robust investment-return or hold decision requires additional
logic such as:

- financing and equity;
- transaction costs;
- capital expenditure;
- rental or opportunity-cost assumptions where relevant;
- taxes and professional boundaries; and
- scenario-specific cash flows.

That logic belongs in Sell / Hold / Rent or another explicit strategy
capability. Ownership Costs may show home-value context, but must not conclude
that appreciation “outpaces costs” as though it establishes return or
affordability.

### 5.8 Action and execution gaps

Each material category should route to its canonical owner:

| Cost driver | Primary action owner |
| --- | --- |
| Property tax | Property Tax and Tax Appeal |
| Insurance premium or coverage | Coverage and Premium Review |
| Mortgage, PMI, or rate | Financing / Mortgage Refinance Radar |
| Utility spend | Energy or qualified Savings and Benefits opportunity |
| HOA dues or assessment | HOA record/workflow |
| Routine maintenance | Status Board, maintenance, or Project Tracker |
| Capital replacement | Capital Timeline and Reserve Fund |
| Household affordability | Budget Planner |
| General missing or wrong fact | Canonical Home Record or source entity editor |

The result must not send all categories to a generic savings page.

### 5.9 Control gaps

Homeowners should be able to:

- choose the cost lens;
- include or exclude optional recurring services;
- add or correct a source record;
- confirm an extracted amount;
- inspect every assumption;
- choose a forecast horizon;
- adjust bounded scenario assumptions;
- save, compare, rename, or delete a scenario;
- mark a category as not applicable;
- create a reminder or action;
- choose notification types;
- dismiss a recommendation with a reason; and
- export a snapshot with provenance.

They should not be able to overwrite an observed fact by moving a scenario
slider.

---

## 6. Experience Audit

### 6.1 Current experience problems

The current experience asks the homeowner to understand analytical jargon:

- “true cost”;
- “growth analyzer”;
- “volatility index”;
- “standard deviation”;
- “appreciation outpacing costs”;
- “source context”;
- “calculation mode”; and
- separate five-year and ten-year mechanics.

It also makes the chart the outcome. The homeowner is not consistently told:

- whether the amount is complete;
- whether it is a bill or benchmark;
- whether a prior-year point was observed;
- what changed in their real records;
- what action is controllable;
- where to correct an input;
- why the page should be revisited; or
- what constitutes success.

### 6.2 Target information architecture

Use one route:

`/dashboard/properties/[id]/ownership-costs`

Recommended page sequence:

1. **Outcome header**
   - “Cost of owning this home”
   - current property;
   - one-sentence benefit;
   - last calculated time;
   - coverage/readiness state.
2. **Current cost**
   - monthly and annual total for the selected lens;
   - category composition;
   - confirmed versus estimated amount;
   - material missing category.
3. **What needs attention**
   - one ranked cost change, upcoming event, missing fact, or planning action;
   - reason, financial impact, and executable CTA.
4. **Where the numbers come from**
   - category-level source, period, status, freshness, and edit path;
   - no internal architecture language.
5. **What changed**
   - observed comparable-period changes only;
   - evidence-backed reasons;
   - one-time versus recurring.
6. **What may change**
   - base, low, and high forward scenarios;
   - known events and adjustable assumptions.
7. **Plan for variability**
   - measured variability when eligible;
   - otherwise known upcoming costs and an explicitly scenario-based buffer;
   - Budget and Reserve Fund actions.
8. **Actions and decisions**
   - open, saved, dismissed, completed, and revisit states.

### 6.3 Target state model

| State | Homeowner message | Primary action |
| --- | --- | --- |
| No property context | “Add this home’s basic details to estimate ownership costs.” | Add specific missing property facts |
| Partial current cost | “We can estimate part of your cost. Add one high-impact bill to improve it.” | Add named bill or record |
| Current estimate only | “Here is a planning estimate. We do not have enough past bills to show changes.” | Confirm categories or add history |
| Current observed snapshot | “Here is what the latest comparable period cost.” | Review largest category |
| Material verified change | “Your annual cost increased by …, led by …” | Resolve category-specific action |
| Upcoming known event | “A renewal, reassessment, payment, or project may change this cost by …” | Review or plan |
| Forecast available | “Under the base assumptions, annual cost may reach …” | Compare scenario |
| Volatility eligible | “Observed costs varied by …; a buffer of … covers the modeled range.” | Update Budget or Reserve |
| No action required | “No material cost action is due. We’ll revisit after …” | Manage notifications or inspect details |
| Stale source | “This total uses a source that may be out of date.” | Refresh named source |
| Error or unavailable source | “We could not refresh one category. Your last confirmed result is still shown.” | Retry category or use last result |

### 6.4 Copy principles

Use:

- “confirmed bill,” “homeowner-reported,” “estimate,” and “forecast”;
- “we do not have enough history”;
- “this category changed”;
- “this may affect your plan”;
- “add your latest premium to improve this estimate”;
- “principal builds equity and is shown separately”; and
- “no action is due until the next known event.”

Avoid:

- “true” when the total is partial;
- “history” for modeled points;
- “last-year change” without prior-period evidence;
- “stable and predictable” without sufficient observed history;
- “spikes detected” from static cadence;
- “typical US home ≈30” without governed evidence;
- “appreciation outpaces cost” as a decision conclusion;
- “high confidence” as one aggregate; and
- “complete” when output merely loaded.

### 6.5 Progressive disclosure

The first screen should answer:

1. What is my current cost?
2. How complete is it?
3. What is the one thing I should care about?
4. What can I do?

Formula details, evidence tables, methodology, and all scenarios belong behind
clear disclosures. Trust detail remains accessible without leading with
technical mechanics.

### 6.6 Home and discovery placement

Ownership Costs must not be a permanent first card on Home.

Home placement is permitted only for:

- a verified material cost increase;
- an upcoming known renewal, reassessment, payment, or project;
- a high-impact missing fact that blocks a timely decision;
- an unresolved cost action;
- a saved scenario needing review because inputs changed; or
- a budget or reserve gap tied to a known cost.

Passive access belongs in:

- Explore Tools;
- the property financial overview;
- relevant Home Record/domain entities;
- Budget and planning handoffs; and
- contextual recommendations.

### 6.7 Mobile and accessibility

The consolidated experience must:

- preserve the summary, coverage state, and primary action above the fold;
- use tables or accessible lists as chart alternatives;
- never encode observed versus estimated status only by color;
- provide keyboard and screen-reader access to all chart points and controls;
- announce recalculation and validation errors;
- preserve focus after scenario updates;
- support reduced motion;
- use plain-language labels for index or range values;
- meet contrast and touch-target requirements; and
- avoid horizontal category and filter overflow.

---

## 7. Best-in-Class Target Capability

### 7.1 Target capability contract

| Contract field | Target |
| --- | --- |
| Capability ID | `ownership-costs` |
| Name | Ownership Costs |
| Homeowner promise | Understand what this home costs, what changed, what may change, and what to do next |
| Canonical route | `/dashboard/properties/[id]/ownership-costs` |
| Recommendation mode | Contextual |
| Safety tier | Material financial |
| Readiness | Partial value allowed; category-specific blockers |
| Completion | Decision or action recorded |
| Revisit trigger | Material source, bill, renewal, assessment, financing, utility, project, scenario, or plan change |
| Canonical outputs | Versioned cost snapshot, category lines, changes, forecasts, scenarios, and decisions |

### 7.2 Calculation invariants

1. Every total names its cost lens.
2. Every included line has a period and evidence status.
3. Missing is not zero.
4. Observed and estimated amounts remain distinguishable after aggregation.
5. Past periods are not generated from present estimates.
6. Forecast periods begin after the base period.
7. Scenario overrides never mutate canonical facts.
8. Principal is not labeled an economic expense.
9. Capital spend and reserve contribution are not silently mixed with recurring
   operating cost.
10. Category definitions remain stable across compared windows.
11. Every material explanation traces to evidence or is labeled a hypothesis.
12. Every recommendation identifies the controllable action and canonical
   owner.

### 7.3 Category-level confidence

Confidence should be calculated per line from:

- source authority;
- verification status;
- period coverage;
- freshness;
- geographic specificity;
- property specificity;
- extraction confirmation;
- assumption count;
- model validation; and
- comparable-history availability.

The UI should summarize:

- confirmed amount;
- estimated amount;
- missing material categories; and
- lowest-confidence material category.

Do not collapse these into one unexplained label.

### 7.4 Coverage completeness

Completeness should be computed against category applicability:

- property use;
- ownership/occupancy;
- dwelling type;
- HOA/condo status;
- financing status;
- utility types;
- insurance requirements;
- recurring service preferences; and
- current capital-plan scope.

Example:

> $14,800 of the $19,300 annual estimate is supported by confirmed bills. HOA
> is not applicable. Water and routine maintenance are estimated.

### 7.5 Change intelligence

The target change engine should:

- compare normalized source periods;
- separate price, usage, scope, coverage, assessment, rate, and one-time-event
  effects when evidence permits;
- attribute the residual as unexplained rather than invent a reason;
- rank by annual impact, urgency, confidence, and actionability;
- create a Home Action only above configured materiality; and
- clear or update the action when a newer fact resolves the change.

### 7.6 Forecast intelligence

The target forecast should combine:

- canonical latest values;
- known renewal or reset dates;
- tax assessment and bill schedule;
- financing amortization and PMI rules where known;
- utility rate and usage assumptions when available;
- planned capital events;
- category-specific inflation or escalation sources;
- scenario overrides; and
- source-specific uncertainty.

It should return a range and driver sensitivity, not false precision.

### 7.7 Planning intelligence

Planning should answer:

- What is the expected monthly and annual cash need?
- Which costs are recurring?
- Which costs are lumpy but known?
- What reasonable range should the homeowner prepare for?
- Which amount belongs in Budget Planner?
- Which amount belongs in Reserve Fund?
- Which category has an executable cost-reduction or dispute action?

### 7.8 Revisit value

The capability becomes worth revisiting when it is event-driven:

- policy renewal or premium change;
- tax assessment, bill, exemption, or appeal result;
- financing payment, rate, balance, or PMI change;
- new utility bill or rate;
- new HOA dues or assessment;
- completed repair or project;
- changed Capital Timeline;
- saved scenario invalidated by newer facts;
- budget or reserve plan falls below the updated requirement; or
- a material category becomes stale.

---

## 8. Target Data and Service Architecture

### 8.1 Ownership principles

1. Canonical domain entities continue to own their facts.
2. Ownership Costs stores typed references, normalization, calculations, and
   decisions—not duplicate source truth.
3. Observations, estimates, forecasts, and scenarios are separate concepts.
4. Calculation versions are reproducible.
5. History is created only from dated evidence.
6. Downstream tools consume the canonical read model.

### 8.2 Recommended schema

Names are illustrative and should be finalized during Slice 1.

#### `OwnershipCostDefinitionVersion`

- `id`
- `version`
- `effectiveFrom`
- `effectiveTo`
- `categoryContractJson`
- `lensContractJson`
- `methodologyJson`
- `status`
- `createdAt`

#### `OwnershipCostObservation`

- `id`
- `propertyId`
- `category`
- `subcategory`
- `amountCents`
- `currency`
- `periodStart`
- `periodEnd`
- `recurrence`
- `sourceType`
- `sourceEntityType`
- `sourceEntityId`
- `sourceDocumentId`
- `evidenceStatus`
- `verificationStatus`
- `freshnessStatus`
- `observedAt`
- `confirmedAt`
- `normalizationMethod`
- `metadataJson`
- `createdAt`
- `updatedAt`

This may be implemented as an adapter/read projection over canonical entities
where persistence would duplicate facts. Persist only when normalization,
homeowner confirmation, or source evidence requires a durable record.

#### `OwnershipCostSnapshot`

- `id`
- `propertyId`
- `definitionVersionId`
- `contextVersion`
- `basePeriodStart`
- `basePeriodEnd`
- `selectedLens`
- `annualAmountCents`
- `monthlyAmountCents`
- `confirmedAmountCents`
- `estimatedAmountCents`
- `coverageStatus`
- `calculationStatus`
- `calculationVersion`
- `inputFingerprint`
- `calculatedAt`
- `supersededAt`

#### `OwnershipCostSnapshotLine`

- `id`
- `snapshotId`
- `category`
- `subcategory`
- `annualAmountCents`
- `monthlyAmountCents`
- `inclusionByLensJson`
- `evidenceStatus`
- `confidence`
- `sourceRefsJson`
- `assumptionsJson`
- `missingDependenciesJson`
- `methodVersion`

#### `OwnershipCostChange`

- `id`
- `propertyId`
- `category`
- `priorObservationRefsJson`
- `currentObservationRefsJson`
- `periodComparison`
- `deltaCents`
- `deltaPercent`
- `changeType`
- `reasonCode`
- `reasonEvidenceRefsJson`
- `recurrenceImpact`
- `confidence`
- `materiality`
- `detectedAt`
- `resolvedAt`

#### `OwnershipCostForecast`

- `id`
- `propertyId`
- `snapshotId`
- `scenarioId`
- `definitionVersionId`
- `horizonStart`
- `horizonEnd`
- `currency`
- `methodVersion`
- `assumptionsJson`
- `rangeMethod`
- `inputFingerprint`
- `calculatedAt`
- `staleAt`

#### `OwnershipCostForecastLine`

- `id`
- `forecastId`
- `periodStart`
- `periodEnd`
- `category`
- `baseAmountCents`
- `lowAmountCents`
- `highAmountCents`
- `knownEventRefsJson`
- `assumptionsJson`
- `confidence`

#### `OwnershipCostScenario`

- `id`
- `propertyId`
- `userId`
- `name`
- `baseSnapshotId`
- `overridesJson`
- `createdAt`
- `updatedAt`
- `archivedAt`

#### `OwnershipCostDecision`

- `id`
- `propertyId`
- `userId`
- `snapshotId`
- `forecastId`
- `scenarioId`
- `category`
- `decisionType`
- `status`
- `reasonCode`
- `homeActionId`
- `canonicalDestination`
- `revisitAt`
- `createdAt`
- `updatedAt`

### 8.3 Existing `Expense` model

The existing model is useful for transaction-like observations, but the target
adapter must address:

- source period versus transaction date;
- recurring versus one-time;
- coverage of tax, insurance, HOA, utility, maintenance, capital, financing,
  and service subcategories;
- annual normalization;
- source evidence;
- duplicate detection;
- extraction and confirmation status;
- refunds and credits;
- property allocation; and
- applicability.

Do not turn one generic expense table into a second canonical insurance, tax,
or financing domain. Use typed references and adapters.

### 8.4 Read-model service

Create one `OwnershipCostReadModelService` with:

- category adapters;
- applicability;
- period normalization;
- evidence precedence;
- deduplication;
- category coverage;
- lens aggregation;
- field-level confidence;
- snapshot versioning;
- observed-period comparison;
- forecast and scenario calculation;
- materiality;
- stale-input detection; and
- action routing.

The existing four services should become temporary compatibility adapters and
then be removed.

### 8.5 API contract

Recommended endpoints:

- `GET /api/properties/:propertyId/ownership-costs`
- `GET /api/properties/:propertyId/ownership-costs/evidence`
- `GET /api/properties/:propertyId/ownership-costs/changes`
- `POST /api/properties/:propertyId/ownership-costs/recalculate`
- `POST /api/properties/:propertyId/ownership-costs/scenarios`
- `PATCH /api/properties/:propertyId/ownership-costs/scenarios/:scenarioId`
- `DELETE /api/properties/:propertyId/ownership-costs/scenarios/:scenarioId`
- `POST /api/properties/:propertyId/ownership-costs/decisions`
- `POST /api/properties/:propertyId/ownership-costs/categories/:category/confirm`

The main read response should contain:

- definition and calculation version;
- selected lens;
- current snapshot;
- coverage;
- category lines;
- evidence summary;
- observed changes;
- forecast availability;
- volatility eligibility;
- ranked action;
- stale state; and
- explicit limitations.

### 8.6 Validation

All query and body inputs require shared schemas:

- finite numeric values;
- safe category-specific ranges;
- bounded forecast horizons;
- bounded appreciation, inflation, escalation, and utilization assumptions;
- non-negative cost inputs except explicit credits/refunds;
- consistent dates and periods;
- permitted cost lenses;
- authorized source corrections;
- scenario override audit; and
- user- and property-scoped access.

Invalid input should return field-level errors, not silently disappear.

### 8.7 Calculation determinism

Given the same:

- input fingerprint;
- context version;
- definition version;
- method version;
- source records;
- scenario overrides; and
- calculation date rules,

the service must produce the same result.

Every downstream decision must retain the snapshot or forecast version it used.

---

## 9. Product Framework Conformance

### 9.1 Recommended capability disposition

| Current capability | Disposition | Target role |
| --- | --- | --- |
| True Cost | Merge and rename | Default current-cost view and canonical read model |
| Cost Explainer | Merge | “What changed” view |
| Cost Growth | Merge and narrow | “What may change” forecast view; remove ownership-return conclusion |
| Cost Volatility | Merge and gate | “Plan for variability” view only with sufficient evidence |

### 9.2 Recommendation mode

The combined capability should be **Contextual**, not permanently promoted.

Recommended trigger families:

- `OWNERSHIP_COST_MATERIAL_CHANGE`;
- `OWNERSHIP_COST_UPCOMING_EVENT`;
- `OWNERSHIP_COST_HIGH_IMPACT_FACT_MISSING`;
- `OWNERSHIP_COST_SCENARIO_STALE`;
- `OWNERSHIP_COST_BUFFER_GAP`; and
- `OWNERSHIP_COST_REVIEW_DUE`.

Each trigger needs:

- evidence;
- materiality;
- homeowner benefit;
- a specific action;
- suppression;
- cooldown;
- lifecycle;
- and a canonical owner.

### 9.3 Readiness

Readiness must be category-specific:

- basic property applicability;
- current operating-cost readiness;
- cash-outflow readiness;
- observed-history readiness;
- forecast readiness;
- volatility readiness; and
- action readiness.

The product must deliver partial value. Missing history must not block the
current-cost view, and missing financing must not block operating expense.

### 9.4 Completion

Replace `OUTPUT_GENERATED` with a decision/action completion contract.

Recommended completion events:

- `ownership_cost_snapshot_confirmed`;
- `ownership_cost_fact_corrected`;
- `ownership_cost_scenario_saved`;
- `ownership_cost_action_created`;
- `ownership_cost_action_resolved`;
- `ownership_cost_buffer_plan_updated`; and
- `ownership_cost_no_action_recorded`.

Page load and GET calculation are engagement events, not outcome completion.

### 9.5 Living Home Record

The consolidated capability reads canonical domain records and writes:

- homeowner confirmations;
- scenario decisions;
- action status;
- revisit timing;
- category applicability;
- evidence corrections through the canonical domain editor; and
- durable outcome references.

It must not create an ambiguous new “Home Record” destination. Corrections
should deep-link to the actual canonical entity or existing editor. A future
consolidated Home Record can index those entities without becoming a
prerequisite for this plan.

### 9.6 Safety and commercial integrity

Required protections:

- no guarantee of future cost, savings, appreciation, or affordability;
- no investment recommendation from appreciation-versus-cost output;
- no professional tax, insurance, mortgage, or utility advice;
- no sponsored action without disclosure and ranking separation;
- no affiliate routing before homeowner-value ranking;
- no dark pattern that marks estimated inputs confirmed;
- source, freshness, method, and limitation disclosure;
- explicit consent for partner handoff; and
- auditability of material calculations and decisions.

---

## 10. Recommended Implementation Sequence

### Slice 0 — Truth containment and broken-action repair

**Objective:** Stop materially misleading claims before building the canonical
model.

Work:

- label every current category as observed, extracted, homeowner-reported,
  benchmark, or estimated;
- remove or rename “history” where points are generated from current values;
- stop describing backward series as a forward projection;
- remove unsupported “delta vs last year” when no prior observation exists;
- remove “stable and predictable,” “spikes detected,” and national-index
  benchmark copy when evidence is insufficient;
- remove appreciation-versus-cost decision conclusions;
- make five- and ten-year category scope consistent or suppress the comparison;
- disable the Cost Volatility score without sufficient observed history;
- fix or remove dead controls;
- route Budget Planner to its real route;
- route category actions to canonical owners;
- validate and bound all overrides;
- stop emitting workflow completion on load;
- stop persisting Guidance completion on GET;
- add limitations directly beside the affected result; and
- add regression tests for the containment rules.

Acceptance:

- no synthetic point is labeled observed history;
- no material conclusion is based on a category definition that changes by
  window;
- every visible CTA works;
- invalid assumptions return field errors;
- data load does not complete a workflow; and
- the four current tools make their partial, estimated status clear.

### Slice 1 — Canonical definition, capability, and route contract

**Objective:** Establish one outcome and one vocabulary.

Work:

- finalize cost lenses and category taxonomy;
- define evidence, period, confidence, coverage, and temporal contracts;
- register `ownership-costs`;
- set Material Financial safety and Contextual recommendation mode;
- define readiness, triggers, completion, revisit, and relationships;
- create the canonical route shell;
- define legacy redirect and retirement behavior;
- update mobile, global navigation, discovery, related tools, icons, page
  contexts, Guidance mappings, and generated inventory;
- document canonical domain boundaries; and
- record an ADR for consolidation and source ownership.

Acceptance:

- one capability owns the outcome;
- the four legacy routes have an approved retirement path;
- no navigation surface presents the four mechanics as peer outcomes;
- terminology is consistent; and
- Product Framework validation passes.

### Slice 2 — Canonical observation adapters and schema

**Objective:** Build trustworthy current-period inputs.

Work:

- update Prisma directly without a migration script;
- implement the necessary definition, observation/adapter, snapshot, line,
  scenario, forecast, change, and decision records;
- build tax, insurance, financing, expense, utility, HOA, maintenance,
  recurring-service, project, and reserve adapters;
- reference canonical source records;
- normalize periods and recurrence;
- deduplicate document, expense, and domain records;
- model applicability and missing categories;
- version methods and input fingerprints;
- preserve source and correction provenance; and
- add service-level authorization.

Acceptance:

- every category line traces to evidence or an explicitly versioned estimate;
- missing and not-applicable are distinct from zero;
- no canonical tax, policy, financing, or project fact is duplicated as
  conflicting truth;
- repeated calculation is deterministic; and
- schema validation passes.

### Slice 3 — Current cost and completeness experience

**Objective:** Deliver a credible answer even with partial data.

Work:

- implement `OwnershipCostReadModelService`;
- calculate operating-expense and cash-outflow lenses;
- separate principal, interest, PMI, capital spend, and reserve contribution;
- calculate confirmed, estimated, and missing amounts;
- build the outcome header, current summary, category composition, and evidence
  panel;
- implement category-specific setup and correction paths;
- deep-link to actual canonical editors;
- provide last-known-good behavior;
- add accessible table alternatives; and
- instrument readiness and correction funnels.

Acceptance:

- the user can answer what the home costs and how complete the result is;
- category amounts use consistent definitions;
- estimates never appear confirmed;
- one missing category does not suppress valid partial value;
- corrections have an executable destination; and
- desktop and mobile accessibility pass.

### Slice 4 — Observed history and change explanation

**Objective:** Explain real changes, not modeled backcasts.

Work:

- build comparable-period observation logic;
- add change records and materiality;
- distinguish price, usage, scope, assessment, rate, coverage, financing, and
  one-time events;
- support unexplained residuals;
- create “What changed” UI and source evidence;
- rank changes by impact, confidence, urgency, and actionability;
- generate or update canonical Home Actions;
- add refresh, correction, dismissal, and resolution lifecycle; and
- add observed-history fixtures.

Acceptance:

- no change exists without comparable evidence;
- one-time and recurring impacts are distinct;
- explanations cite their source;
- unknown reason remains unknown;
- actions update when new evidence resolves a change; and
- period comparison tests cover partial, missing, and corrected data.

### Slice 5 — Forward forecast and scenarios

**Objective:** Provide transparent planning ranges.

Work:

- implement forecast and forecast-line persistence;
- start after the latest base period;
- add known renewal, reassessment, financing, utility, and capital events;
- implement low/base/high ranges;
- validate category-specific assumptions;
- implement create, compare, rename, archive, and delete scenario flows;
- keep overrides separate from canonical facts;
- detect stale scenarios when inputs change;
- show driver sensitivity and limitations; and
- add deterministic golden fixtures.

Acceptance:

- forward periods are never called history;
- scenarios retain base snapshot and method versions;
- the user can see which assumptions drive the range;
- stale scenarios are visible;
- extreme and invalid values are rejected; and
- repeated fixture calculations are stable.

### Slice 6 — Variability and buffer planning

**Objective:** Turn uncertainty into a safe planning action.

Work:

- define observed-history eligibility;
- implement transparent variability metrics;
- measure recurring categories separately from one-time capital events;
- express variability in dollars and range before any index;
- remove unsupported benchmark comparisons;
- show an insufficient-history state;
- build a scenario-based buffer only when labeled as such;
- integrate known capital needs from Capital Timeline;
- hand off monthly cash buffer to Budget Planner;
- hand off capital reserve to Reserve Fund; and
- persist the selected planning decision.

Acceptance:

- measured volatility is never produced from synthetic history;
- the category definition is stable across the window;
- the user understands the likely dollar range;
- the buffer CTA completes a real workflow; and
- Budget and Reserve receive the correct, non-duplicated amount.

### Slice 7 — Action, decision, and lifecycle integration

**Objective:** Convert insight into homeowner progress.

Work:

- implement category action resolver;
- connect Property Tax, Coverage, Financing, Energy, HOA, Maintenance, Capital
  Timeline, Reserve Fund, Budget, and Savings destinations;
- support accept, save, dismiss, snooze, no-action, resolve, and reopen;
- preserve source snapshot and explanation;
- implement notification controls;
- create revisit events;
- replace output-generated completion;
- update Guidance journeys;
- remove wrong-tool mappings; and
- instrument decision and resolution outcomes.

Acceptance:

- every promoted action has an executable destination;
- every action has owner, state, reason, and revisit behavior;
- completion occurs only from a homeowner decision or resolution;
- no category defaults to generic savings; and
- Guidance and Home Actions agree on lifecycle.

### Slice 8 — Downstream consumer cutover and legacy retirement

**Objective:** Remove duplicated ownership-cost calculations.

Work:

- inventory every consumer of current True Cost, Growth, Explainer, and
  Volatility contracts;
- cut Break-Even, Sell / Hold / Rent, Budget Planner, Guidance, Reserve Fund,
  Capital Timeline, and relevant cards over to versioned snapshots or
  forecasts;
- prevent downstream tools from silently changing cost lens;
- remove temporary compatibility adapters;
- redirect or retire legacy routes;
- remove duplicate catalog, related-tool, mobile, icon, and analytics entries;
- delete unused services, APIs, DTOs, and tests; and
- regenerate capability inventories.

Acceptance:

- one calculation path supplies ownership-cost truth;
- downstream decisions retain calculation versions;
- legacy routes do not expose contradictory totals;
- no dead navigation remains; and
- repository searches show no unintended old consumer.

### Slice 9 — Operations, validation, and launch

**Objective:** Make the capability governable.

Work:

- build source coverage, staleness, calculation failure, and action funnel
  dashboards;
- add replay tooling by input fingerprint and method version;
- add anomaly alerts for category jumps, missing canonical adapters, and
  definition mismatch;
- add representative property fixtures;
- run financial correctness, authorization, accessibility, responsive,
  performance, and failure-state tests;
- conduct content and safety review;
- document support and incident runbooks;
- validate analytics and commercial-integrity controls; and
- approve launch gates.

Acceptance:

- material calculations are reproducible;
- operations can explain a result without database archaeology;
- failure preserves last-known-good truth;
- accessibility and responsive gates pass;
- safety and content owners approve claims; and
- value metrics can distinguish engagement from resolved outcomes.

---

## 11. Priority, Dependencies, and Release Gates

### 11.1 Priority

| Priority | Work |
| --- | --- |
| P0 | Slice 0 truth containment, broken CTA repair, completion correction |
| P0 | Slice 1 canonical definitions and portfolio consolidation contract |
| P0 | Slice 2 evidence adapters and canonical snapshot model |
| P1 | Slice 3 current cost and completeness experience |
| P1 | Slice 4 observed change intelligence |
| P1 | Slice 5 forecast and scenarios |
| P1 | Slice 6 variability and buffer |
| P1 | Slice 7 action/lifecycle integration |
| P2 | Slice 8 full downstream cutover and legacy deletion |
| P2 | Slice 9 advanced operations and launch optimization |

### 11.2 Critical dependencies

- Property Tax canonical bill and assessment facts;
- Coverage and Premium Review canonical premium and renewal facts;
- Financing profile and amortization inputs;
- utility and recurring expense evidence strategy;
- Home Record entity correction routes;
- Capital Timeline and Reserve Fund contracts;
- Budget Planner route and input contract;
- Home Actions lifecycle;
- Product Framework capability consolidation; and
- method/version governance.

### 11.3 Launch gates

The consolidated capability must not launch as generally available until:

1. category and lens definitions are approved;
2. synthetic history is removed from observed claims;
3. current totals trace to evidence or labeled estimates;
4. missing is not treated as zero;
5. principal, interest, capital, and reserve semantics are correct;
6. volatility is evidence-gated;
7. every primary CTA works;
8. generated output does not complete the workflow;
9. downstream consumers use versioned inputs or remain clearly isolated;
10. Material Financial safety review passes;
11. accessibility and responsive tests pass; and
12. operations can reproduce a result.

---

## 12. Testing Strategy

### 12.1 Unit tests

Test:

- category applicability;
- evidence precedence;
- normalization;
- period completeness;
- missing versus zero;
- deduplication;
- lens inclusion;
- principal/interest treatment;
- capital and reserve separation;
- field-level confidence;
- observed-period comparability;
- change attribution;
- forecast boundary;
- scenario validation;
- input fingerprints;
- volatility eligibility;
- materiality;
- action routing; and
- completion transitions.

### 12.2 Golden calculation fixtures

Required fixtures:

- owner-occupied financed single-family home;
- mortgage-free home;
- condo with HOA and special assessment;
- rental property with landlord insurance;
- home with confirmed tax and insurance but estimated utilities;
- home with extracted, unconfirmed bills;
- home with partial-period utility history;
- home with one-time repair;
- home with planned capital replacement;
- home with policy renewal increase;
- home with tax reassessment and appeal result;
- home with PMI removal;
- home with no comparable history;
- home with three comparable years;
- scenario with valid bounds;
- scenario with stale base inputs; and
- property with no applicable cost categories beyond tax.

For each fixture, assert exact:

- included categories;
- evidence status;
- monthly and annual normalization;
- selected lens total;
- confirmed and estimated subtotals;
- missing categories;
- period changes;
- forecast range;
- volatility eligibility;
- action owner; and
- completion state.

### 12.3 Contract and integration tests

Verify:

- tax adapter uses canonical tax facts;
- coverage adapter uses canonical premium facts;
- financing adapter separates principal, interest, and PMI;
- Expense references do not double-count domain records;
- Capital Timeline and Reserve Fund amounts remain separate;
- Budget receives the cash-planning amount;
- downstream tools retain snapshot versions;
- legacy routes redirect correctly;
- Product Framework discovery resolves the new capability;
- Guidance does not complete on GET;
- Home Actions update and resolve; and
- property/user authorization is enforced.

### 12.4 UI and end-to-end tests

Cover:

- no context;
- partial snapshot;
- current estimate only;
- observed snapshot;
- material change;
- upcoming event;
- stale source;
- insufficient history;
- forecast;
- saved scenario;
- scenario stale state;
- measured variability;
- action accept/dismiss/snooze/resolve;
- correction deep-link;
- mobile;
- keyboard and screen reader;
- chart alternatives;
- reduced motion;
- loading, partial error, and last-known-good states; and
- deep-linked return from a canonical action.

### 12.5 Nonfunctional tests

- authorization and tenant isolation;
- calculation performance;
- idempotency;
- concurrent recalculation;
- stale cache;
- partial source outage;
- replay determinism;
- numeric precision and rounding;
- time-zone and period boundaries;
- currency handling;
- audit log integrity;
- accessibility; and
- content safety.

---

## 13. Measurement

### 13.1 Primary outcome metrics

- percentage of properties with a credible current-cost snapshot;
- percentage of annual amount supported by confirmed or observed evidence;
- percentage of material categories with current source data;
- material changes reviewed;
- category actions accepted and resolved;
- budget or reserve plans updated from a cost event;
- corrections completed;
- scenarios saved and later revisited;
- decision resolution rate; and
- time from material change detection to homeowner action.

### 13.2 Trust and quality metrics

- estimate-to-observed variance by category and method version;
- forecast calibration by category and horizon;
- unexplained-change rate;
- source freshness;
- duplicate-source suppression;
- calculation replay success;
- false material-change rate;
- volatility eligibility and calibration;
- stale scenario rate;
- correction rate after display;
- last-known-good use; and
- support contacts about unclear amounts.

### 13.3 Experience metrics

- first-result success;
- time to understand current cost;
- category evidence expansion;
- high-impact setup completion;
- action click-through;
- action completion;
- return after a meaningful trigger;
- empty or insufficient-history abandonment;
- mobile task completion; and
- accessibility defects.

### 13.4 Anti-metrics

Do not optimize for:

- number of cost tools opened;
- number of charts viewed;
- workflow completion on page load;
- inflated “savings” generated;
- more prominent permanent dashboard cards;
- volatility score production;
- higher estimate confidence labels; or
- scenario recalculations without a decision.

---

## 14. Risks and Mitigations

| Risk | Consequence | Mitigation |
| --- | --- | --- |
| “Ownership cost” remains ambiguous | Contradictory totals and bad downstream decisions | Approve lenses and category contract before implementation |
| Canonical domain records are duplicated | Drift and double-counting | Typed references, adapters, precedence, and deduplication |
| Partial data appears complete | False confidence | Coverage completeness and missing-category states |
| Estimate appears observed | Material trust failure | Evidence status on every line and aggregation |
| Forecast appears guaranteed | Unsafe financial interpretation | Ranges, assumptions, limitations, and scenario semantics |
| Principal counted as economic expense | Incorrect decision analysis | Explicit principal/interest treatment |
| Capital and maintenance double-count | Inflated ownership cost | Separate lenses and source/category deduplication |
| Volatility inferred from synthetic data | False alarm or reassurance | Strict observed-history eligibility |
| Appreciation implies investment return | Misleading material recommendation | Remove conclusion; hand off strategy analysis |
| Consolidation breaks Guidance consumers | Dead journeys | Consumer inventory and versioned cutover |
| One large workspace becomes overwhelming | Poor comprehension | Outcome-first summary and progressive disclosure |
| Home becomes another tool dashboard | Priority fragmentation | Promote only canonical material Home Actions |
| No migration preserves bad contracts | Clean-start opportunity lost | Direct schema redesign, no legacy compatibility |

---

## 15. Open Product and Technical Decisions

Decide during Slice 1:

1. Final homeowner name: “Ownership Costs” or “Cost of Owning This Home.”
2. Default cost lens and whether the user can set a preferred lens.
3. Minimum applicable category set by property type and use.
4. Whether recurring optional home services are included by default.
5. Exact maintenance benchmark methodology and validation owner.
6. Utility evidence acquisition strategy.
7. Whether normalized observations are persisted or materialized on read by
   category.
8. Comparable-period rules for tax, insurance, utility, HOA, and repairs.
9. Minimum history required for each variability metric.
10. Materiality thresholds by category and homeowner context.
11. Forecast horizons and category-specific assumption sources.
12. Snapshot and forecast retention.
13. Export requirements.
14. Notification defaults and quiet periods.
15. Retirement timing for the four old capability IDs.

None of these decisions requires a database migration script or historical
backfill.

---

## 16. Definition of Done

Ownership Cost Intelligence is complete when:

- one capability owns the outcome;
- the four current peer tools are merged or retired;
- every total identifies its lens;
- every category identifies source, period, evidence status, freshness, and
  assumptions;
- missing and not-applicable are distinct from zero;
- operating cost, cash outflow, economic cost, capital spend, and reserve plan
  are not conflated;
- current cost uses canonical domain facts and actual expenses where available;
- synthetic backcasts are never represented as observed history;
- change explanations are evidence-backed;
- forecasts are forward, ranged, versioned, and reproducible;
- volatility requires sufficient comparable observations;
- category actions route to canonical owners;
- the homeowner can correct important inputs through real destinations;
- the capability produces partial value without misleading completeness;
- Home promotes only material cost actions;
- page load does not equal completion;
- downstream financial decisions retain the snapshot or forecast version used;
- all Material Financial safety, authorization, accessibility, and responsive
  gates pass;
- operations can reproduce and explain every material result; and
- documentation, inventories, runbooks, analytics, and tests reflect the
  consolidated design.

---

## 17. Final Recommendation

Do not improve True Cost, Cost Growth, Cost Explainer, and Cost Volatility as
four separate products.

First contain the unsupported historical, change, volatility, appreciation,
and completion claims. Then consolidate the four routes into one
evidence-first Ownership Costs capability.

The durable differentiator is not another chart or index. It is a
property-specific financial record that can say:

- this amount came from a confirmed bill;
- this amount is still an estimate;
- this category changed for a known reason;
- this event may affect the next period;
- this range is a scenario, not a guarantee;
- this is the one action under the homeowner's control; and
- this is the result of that action.

That turns a fragmented set of estimators into reusable financial intelligence
for Home Actions, Budget Planner, Reserve Fund, Break-Even, Sell / Hold / Rent,
Guidance, and the broader ContractToCozy product.
