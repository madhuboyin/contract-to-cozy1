# Hidden Savings and Benefits Capability Audit and Implementation Plan

**Capabilities:** Hidden Asset Finder and Home Savings Check  
**Contributing surfaces:** Save / Financial Efficiency, Guidance, Property Context, Home Actions, Coverage, Property Tax, Energy, Refinance, and Reserve Fund  
**Audit framework:** `CAPABILITY_OUTCOME_AND_EXPERIENCE_AUDIT_FRAMEWORK.md`  
**Audit date:** July 28, 2026  
**Status:** Recommended implementation plan  
**Recommended disposition:** **Consolidate, rebuild the truth contract, and temporarily contain unsupported value claims**  
**Current safety classification:** Low consequence  
**Recommended safety classification:** Material financial for eligibility, value, application, and realized-savings claims  
**Primary outcome family:** Savings and Benefits

---

## 1. Executive Decision

Hidden Asset Finder and Home Savings Check are presented as separate tools, but
they are two incomplete parts of one homeowner outcome:

> Help me find credible ways to lower the cost of owning this home, understand
> what I may qualify for, take the right action before a deadline, and confirm
> what I actually received or saved.

The repository contains valuable foundations:

- a normalized benefit-program registry;
- property- and geography-based eligibility rules;
- explainable match reasons;
- program source, verification, expiration, and lifecycle fields;
- property-scoped scan history and background refresh;
- recurring-cost account records;
- modular insurance, warranty, internet, and utility checks;
- saved opportunities and action statuses;
- Property Context capture;
- financial-context versioning;
- Home Savings guidance completion;
- a Save / Financial Efficiency aggregation surface; and
- contextual Product Framework registration for Hidden Asset Finder.

Those foundations do not yet deliver a trustworthy Savings and Benefits
experience.

The most material current problems are:

1. **The benefit scanner has no repository-owned program population path.**
   There is no reviewed program seed, ingestion connector, or admin management
   surface in the repository. The scanner only evaluates rows already present
   in `hidden_asset_programs`. An empty registry produces a successful scan
   with zero results while the product implies broad program coverage.
2. **Supported geography is narrower than the schema and UI imply.** Candidate
   lookup derives only country, state, city, and ZIP keys. County, utility,
   hazard-zone, and historic-district region types exist in the schema but
   cannot currently be resolved into candidate programs.
3. **Many advertised eligibility facts are permanently unknown.** County,
   utility provider, solar, EV charger, leak sensors, storm features, upgrades,
   hazard zones, and historic status are explicitly set to `null` by the
   attribute builder. Income, age, disability, veteran status, household size,
   installation date, contractor qualification, product certification,
   purchase timing, and tax liability are not modeled.
4. **Unknown source freshness is treated as fresh.** A program with
   `lastVerifiedAt = null` receives no freshness penalty even though its review
   state is unknown.
5. **Rule-match confidence is mislabeled as eligibility confidence.** “Likely
   eligible” can mean only that stored property fields match stored rules. It
   is not calibrated against program approval, complete statutory criteria,
   funding availability, tax circumstances, or application outcome.
6. **The status `CLAIMED` means “pursuing.”** The UI sends `CLAIMED` when the
   homeowner clicks “Mark as Pursuing.” The backend then stores `claimedAt`.
   This conflates intent, application, award, redemption, and receipt.
7. **Home Savings compares bills to hard-coded state baselines.** Its
   opportunities are not based on live tariffs, address-qualified providers,
   equivalent plan terms, actual offers, or normalized usage.
8. **Home Savings creates recommendations even when no market alternative
   exists.** Several categories estimate a percentage of the current bill or
   the difference from a generic baseline and present the amount as potential
   savings without an actionable offer.
9. **Insurance and warranty facts are duplicated.** Home Savings creates
   parallel `HomeSavingsAccount` rows from canonical policy and warranty
   records, creating drift risk.
10. **Generated output is treated as completion.** Running a comparison
    completes a guidance step even when it only asks for missing inputs or says
    the current spend looks reasonable.
11. **Applied is treated as verified savings.** The frontend emits
    `savings_verified` when a homeowner marks an opportunity `APPLIED`, and the
    backend publishes a savings-realization signal for `APPLIED` or `SWITCHED`
    using the original estimate.
12. **The Save surface materially overstates evidence.** It uses language such
    as “verified upside,” “you've protected $544,” “Claim This Benefit,”
    “fintech-grade,” and “AI scans for ... better rates” without the supporting
    verification, observed outcome, quoting, or application capability.
13. **The Save surface consumes the Home Savings DTO incorrectly.** It reads
    category and opportunity fields such as `category.name`, `title`, and
    `potentialSavingsUsd`, while the actual contract exposes `label`,
    `headline`, and monthly/annual savings. This can suppress or mis-rank
    recurring opportunities.
14. **The family has no application or switching workflow.** An external source
    link and self-reported statuses are not an application assistant,
    address-qualified comparison, consented handoff, or fulfillment loop.
15. **There is no realized-value ledger.** The platform cannot distinguish
    estimated, quoted, applied-for, approved, received, switched, observed, and
    verified value.

The recommended product decision is:

1. create one property-scoped **Savings and Benefits** workspace;
2. treat benefits and recurring-cost opportunities as two sections of one
   family, not two competing tool journeys;
3. keep specialized tax, coverage, refinance, energy, and reserve decisions in
   their canonical capabilities and summarize only qualified handoffs;
4. make the reviewed source registry, jurisdiction coverage, eligibility
   criteria, and freshness state visible and operationally governed;
5. distinguish “program may apply,” “likely worth checking,” “application in
   progress,” “approved,” “received,” “estimated recurring savings,” “quoted
   savings,” and “observed savings”;
6. remove eligibility labels that imply approval likelihood until calibration
   exists;
7. remove generic dollar-savings claims unless the inputs and basis are shown;
8. stop treating application intent or switching intent as verified savings;
9. replace duplicate Home Savings accounts with references to canonical
   policy, warranty, utility, service-plan, and bill records;
10. provide explicit setup prompts only for facts that materially improve a
    named opportunity;
11. create a governed application, quote, or provider handoff with status,
    consent, disclosure, deadline, and result tracking;
12. write decisions and realized outcomes back to the Living Home Record;
13. promote only a qualified, timely opportunity or unfinished action to Home;
    and
14. keep passive discovery in Explore Tools and the Savings and Benefits
    workspace.

The target promise should be:

> Find rebates, credits, exemptions, discounts, and recurring-cost
> opportunities that are relevant to this home—then see what to verify, what to
> do next, and what you actually saved.

### 1.1 Implementation constraint

There are no real users and no production data migration requirement.

Implementation may change the Prisma schema directly. It must not create:

- database migration scripts;
- historical backfills;
- compatibility tables for obsolete match or opportunity semantics;
- dual-write behavior;
- legacy fields solely to preserve current generated estimates; or
- synthetic realized-savings history.

The user will reconcile the database separately after schema changes.

This constraint should be used to create a clean opportunity, application, and
realized-value model instead of preserving the current `CLAIMED`, `APPLIED`,
and `SWITCHED` ambiguity.

---

## 2. Scope

### 2.1 In scope

This audit covers:

- Hidden Asset Finder service, rule engine, registry, routes, worker, API, page,
  trust copy, filters, statuses, and analytics;
- Home Savings Check service, category modules, routes, API, page, plan capture,
  opportunity statuses, and guidance completion;
- the Save / Financial Efficiency aggregation page;
- dashboard and mobile savings cards;
- Product Framework capability definitions, readiness, recommendation mode,
  route disposition, and completion;
- Property Context requirements and financial-context versioning;
- program, account, run, match, opportunity, and scan persistence;
- source provenance, freshness, jurisdiction, eligibility, value, deadlines,
  application state, outcome state, and commercial integrity;
- contextual handoffs to Property Tax, Coverage and Premium Review, Energy,
  Mortgage Refinance Radar, Service Price Radar, Guidance, Reserve Fund, and
  canonical Home Actions;
- copy, accessibility, performance, telemetry, operations, and tests.

### 2.2 Out of scope

This document does not:

- determine eligibility for a specific public benefit;
- provide tax, legal, financial, insurance, or utility advice;
- assert that any current program is available;
- select a program-data, utility, telecom, insurance, or affiliate partner;
- define partner compensation;
- automate an application or account switch without explicit consent;
- build a general household budget product;
- replace Property Tax, Coverage, Refinance, Energy, or Reserve Fund;
- create a database migration; or
- implement the recommended slices.

### 2.3 Evidence reviewed

Repository evidence reviewed includes:

- the Product Framework and capability audit framework;
- generated capability inventory and route-disposition audits;
- Hidden Asset Finder functional documentation;
- production-readiness and data-duplication audits;
- capability definitions and contextual trigger configuration;
- Hidden Asset Finder schema, service, rule engine, category confidence policy,
  worker, controller, routes, API, UI, and trust preset;
- Home Savings schema, service, category modules, controllers, routes, API,
  workspace, panel, and dashboard card;
- Save / Financial Efficiency page and property-scoped redirect;
- Property Context feature requirements;
- financial-context scopes;
- Guidance mappings and completion hook;
- analytics events and outcome signals;
- available worker tests and frontend CTA/route tests.

No single governing FRD currently defines the combined Savings and Benefits
outcome or its truth, source, application, and realized-value contracts.

---

## 3. Homeowner Job and Target Outcome

### 3.1 Primary homeowner job

> Periodically and before relevant deadlines, show me credible savings and
> benefit opportunities for this home, help me verify the important criteria,
> and help me complete and track the best next action.

### 3.2 Secondary homeowner jobs

- Discover tax exemptions, credits, rebates, grants, utility incentives, and
  property-related discounts.
- Understand why a program may apply to this home.
- See the official source, deadline, funding status, and last review date.
- Know which eligibility facts are confirmed, missing, or need professional
  verification.
- Compare the current recurring bill against an equivalent, address-qualified
  option.
- Understand fees, contract terms, promotional periods, coverage or service
  tradeoffs, and switching friction.
- Save an opportunity for later.
- Gather documents and prepare an application or quote request.
- Track submitted, approved, denied, expired, received, and switched states.
- Record the amount actually received or observed.
- Revisit when programs, bills, rates, property facts, or deadlines change.

### 3.3 Triggering situations

The outcome family is contextually relevant when:

- a reviewed program becomes available for the property's jurisdiction;
- a program deadline or funding window is approaching;
- a property system, project, purchase, or completed upgrade may qualify;
- a tax, occupancy, age, disability, veteran, income, or household fact changes
  with appropriate consent and sensitivity controls;
- a utility or service provider, rate plan, bill, renewal, or contract changes;
- a recurring cost rises materially;
- a policy or warranty approaches renewal;
- a project has a qualified rebate or credit;
- a homeowner starts but does not finish an application or switch;
- an expected benefit requires confirmation;
- an actual bill or award document can confirm realized value.

### 3.4 Current delivered outcome

Today, Hidden Asset Finder can:

- scan a populated program registry;
- pre-filter on country, state, city, and ZIP;
- evaluate property rules;
- persist matches and match reasons;
- apply category and freshness adjustments;
- display official source links when present;
- record view, dismissal, and a `CLAIMED` state;
- refresh in a weekly worker.

Today, Home Savings Check can:

- store four recurring-cost categories;
- reuse an insurance policy or warranty to create a parallel savings account;
- accept internet and utility inputs;
- compare bills against hard-coded broad baselines;
- generate estimated opportunities;
- save status changes;
- run within Guidance and publish a tool completion.

Today, the combined family cannot reliably answer:

- which programs are actually in the registry;
- which jurisdictions and categories are covered;
- whether zero results means no program or no source coverage;
- whether all material eligibility criteria were evaluated;
- whether funding remains;
- whether a recurring alternative is available at the address;
- whether plan terms are equivalent;
- whether a dollar estimate is a benchmark, offer, award, or observed result;
- whether the homeowner applied, was approved, received value, or merely
  clicked a button;
- what savings were actually realized.

### 3.5 Target best-in-class outcome

A best-in-class family should produce:

1. a coverage statement before any result;
2. a ranked set of relevant, reviewed opportunities;
3. a plain-language explanation of benefit, deadline, and effort;
4. an eligibility checklist separating known, unknown, and externally verified
   criteria;
5. an evidence-based value range and its basis;
6. a safe action: add a relevant fact, open the official source, prepare an
   application, request a qualified comparison, or dismiss;
7. an application or switch lifecycle;
8. deadline and status reminders;
9. a confirmed outcome or explicit “unknown outcome” state;
10. a realized-value ledger with source evidence;
11. contextual Home Actions only for material, timely next steps;
12. a healthy state that states what was checked and when the next review will
    occur.

---

## 4. Outcome-Family Consolidation

### 4.1 Current fragmentation

| Current surface | Homeowner promise | Current role | Problem |
| --- | --- | --- | --- |
| Hidden Asset Finder | Find property-linked benefits | Program-rule matcher | Empty without externally populated registry; no application outcome |
| Home Savings Check | Find recurring savings | Generic baseline comparator | No live alternatives or realized value |
| Save / Financial Efficiency | Aggregate savings, benefits, refinance, equity, reserve | Parallel dashboard | Overstates evidence and creates a priority system outside Home Actions |
| Property Tax | Tax review and appeal | Canonical tax decision | Benefit/exemption overlap is not governed |
| Coverage and Premium Review | Coverage and renewal decision | Canonical regulated decision | Insurance “savings” is duplicated in Home Savings |
| Refinance Radar | Mortgage opportunity | Canonical material decision | Save surface summarizes it without a unified evidence contract |
| Energy / upgrade tools | Usage and project decisions | Canonical system/project decisions | Rebates are not attached to the actual project/application |
| Guidance | Multi-step resolution | Orchestration | A generated comparison can count as completed |

### 4.2 Recommended canonical product

Create one **Savings and Benefits** workspace with four homeowner sections:

1. **Worth acting on**
   - qualified opportunity;
   - deadline or renewal window;
   - estimated or quoted value;
   - effort;
   - next action.
2. **Benefits and rebates**
   - reviewed public, utility, nonprofit, carrier, and manufacturer programs;
   - explicit source coverage;
   - eligibility checklist;
   - application lifecycle.
3. **Recurring costs**
   - current bills and plans;
   - address-qualified or clearly labeled benchmark comparisons;
   - equivalent-term comparison;
   - switch or negotiate lifecycle.
4. **In progress and realized**
   - saved;
   - preparing;
   - submitted;
   - approved or denied;
   - switched;
   - received;
   - observed and verified value.

### 4.3 Capability disposition

| Capability | Disposition | Target role |
| --- | --- | --- |
| Hidden Asset Finder | Reposition and rename | Benefits and rebates engine behind Savings and Benefits |
| Home Savings Check | Merge | Recurring-cost engine behind Savings and Benefits |
| Save / Financial Efficiency | Retire as a parallel dashboard | Redirect to property workspace or contextual Savings and Benefits view |
| Property Tax exemptions/appeals | Preserve canonical owner | Publish qualified opportunities into the family; execute in Property Tax |
| Coverage savings | Preserve canonical owner | Publish renewal/shop actions only from Coverage and Premium Review |
| Refinance | Preserve canonical owner | Publish qualified window summary; execute in Refinance Radar |
| Energy/project incentives | Preserve canonical owner | Attach benefit to the system/project and application |
| Reserve Fund/equity | Exclude from savings opportunity ranking | Keep in their canonical planning/record surfaces |

### 4.4 Route disposition

| Route | Recommendation |
| --- | --- |
| `/dashboard/properties/[id]/tools/hidden-asset-finder` | Redirect to `/dashboard/properties/[id]/tools/savings-benefits?section=benefits` |
| `/dashboard/properties/[id]/tools/home-savings` | Redirect to `/dashboard/properties/[id]/tools/savings-benefits?section=recurring` |
| `/dashboard/home-savings` | Preserve property-selection redirect, then canonical workspace |
| `/dashboard/save` | Keep job-hub redirect behavior |
| `/dashboard/properties/[id]/save` | Redirect to canonical workspace or property hub focus; do not host a second dashboard |

The final path name can change, but one property-scoped canonical route is
required.

### 4.5 Canonical responsibility map

| Concern | Canonical owner |
| --- | --- |
| Benefit program and version | Savings and Benefits source registry |
| Program jurisdiction and source coverage | Savings and Benefits source operations |
| Property and system facts | Living Home Record |
| Sensitive household eligibility facts | Consented homeowner profile / eligibility fact store |
| Tax assessment, exemption, appeal decision | Property Tax |
| Policy and insurance decision | Coverage and Premium Review |
| Mortgage decision | Mortgage Refinance Radar |
| Project and installed-system fact | Projects / Living Home Record |
| Current utility/service account | Canonical provider or bill record |
| Application/switch action | Shared action and fulfillment lifecycle |
| Award, rebate, or observed bill change | Realized-value ledger |
| Home priority | Canonical Home Action |

### 4.6 Why consolidation is mandatory

The homeowner does not benefit from understanding the difference between a
stored program match, a state baseline comparison, a refinance signal, a tax
exemption, and an insurance renewal analysis. The product must preserve those
domain boundaries internally while presenting:

- what the opportunity is;
- why it may matter;
- how credible it is;
- what is missing;
- what action is possible;
- who owns the next step;
- what happened.

A parallel Save dashboard must not independently manufacture financial
priority, confidence, or realized-value claims.

---

## 5. Current Strengths to Preserve

### 5.1 Property-scoped authorization

Both services verify property ownership for property-specific reads and writes.
This is a sound baseline for sensitive financial and eligibility context.

### 5.2 Program registry structure

`HiddenAssetProgram` already supports:

- category;
- region type and value;
- benefit type and value range;
- source;
- eligibility notes;
- expiration;
- last verification;
- active state;
- associated rules.

This should be evolved rather than discarded.

### 5.3 Explainable deterministic matching

The rule engine:

- resolves only allowlisted attributes;
- handles missing attributes without crashing;
- creates human-readable reasons;
- records matched and total rule counts;
- applies category-specific context caps;
- records property-context version.

Deterministic matching is appropriate for eligibility triage when the source
rules are complete, reviewed, versioned, and accurately represented.

### 5.4 Source and lifecycle fields

Official source, source label, expiration, last verification, active status,
match evaluation time, first detection, and scan history provide a useful
starting point for trust and operations.

### 5.5 Worker and concurrency foundations

The batch refresh job supports:

- scheduled scanning;
- property-scoped smoke execution;
- allowlisting;
- dry run;
- success/failure counts;
- a recent-scan concurrency guard.

### 5.6 Modular recurring-cost categories

Home Savings category modules isolate insurance, warranty, internet, and
electricity/gas behavior. That design can support replacement by reviewed
provider connectors without rewriting the workspace.

### 5.7 Account and opportunity lifecycle foundation

The current models support current-plan data, billing cadence, renewal and
contract dates, estimated monthly and annual value, alternatives, action URL,
expiration, and several intent states.

### 5.8 Property Context adoption

Both capabilities use shared Property Context and financial-context versioning.
The target experience should retain progressive capture while making each
request opportunity-specific.

### 5.9 Cautious detail-page language

Hidden Asset Finder repeatedly says that results are potential matches and
provides official-source verification language. This is directionally correct,
though contradicted by labels such as “Likely eligible,” “Claim,” and the Save
surface.

---

## 6. Current-State Functional Review

### 6.1 Program availability and source coverage

The scanner queries `HiddenAssetProgram` rows. No application code in the
repository creates or upserts those programs.

Consequences:

- deployment does not establish a minimum reviewed catalog;
- source coverage is not measurable;
- zero evaluated programs can appear as a successful homeowner scan;
- weekly refresh only re-evaluates the same registry;
- product readiness cannot be inferred from worker health;
- the source promise depends on undocumented external/manual operations.

The target must expose:

- reviewed sources;
- covered jurisdictions;
- covered program families;
- last successful source update;
- record counts;
- stale/failed source state;
- homeowner-facing coverage statement.

### 6.2 Geography resolution

The schema permits:

- country;
- state;
- county;
- city;
- ZIP;
- utility;
- hazard zone;
- historic district.

`deriveRegionPairs` supplies:

- `COUNTRY=USA`;
- state;
- city;
- ZIP.

Therefore county, utility, hazard-zone, and historic-district programs are
unreachable through their native region types. This is more than missing
personalization: it invalidates claimed category breadth.

### 6.3 Eligibility fact coverage

The rule engine supports many attributes, but the property adapter sets several
to `null` by design.

Unavailable or materially incomplete criteria include:

- county;
- electric and gas utility;
- solar;
- EV charging;
- leak sensors;
- fire sprinklers;
- impact windows;
- shutters;
- roof straps;
- insulation and window upgrades;
- historic district and registry;
- hurricane, flood, and wildfire zones;
- household income;
- household size;
- owner age;
- disability;
- veteran status;
- tax filing and tax-liability context;
- equipment make/model/certification;
- purchase, installation, and placed-in-service dates;
- contractor qualification;
- prior participation;
- project cost;
- funding reservation;
- documentation requirements.

Some criteria are sensitive and should not be copied into the generic property
record. The target needs a consented eligibility-fact contract with purpose,
retention, provenance, and reuse controls.

### 6.4 Rule semantics

Rules are evaluated as a flat list. `groupKey` is reserved but unused, so the
engine cannot accurately represent common logic such as:

- A and (B or C);
- alternative eligible technologies;
- household or project paths;
- tiered benefit amounts;
- prerequisites;
- exclusions;
- mutually exclusive programs;
- stacking rules;
- funding caps;
- application windows.

The current confidence ratio can also reward a partial match without
distinguishing:

- mandatory criteria;
- optional ranking factors;
- unknown criteria;
- explicit disqualifiers;
- criteria requiring external evidence.

### 6.5 Confidence and eligibility language

Current computation is rule completeness, not approval likelihood.

`HIGH` can mean:

- at least 90% of evaluable stored rules matched;
- fewer than half of all rules were missing;
- category context gates did not cap it;
- the source was not old enough to reduce it.

It does not mean:

- the full official eligibility definition was modeled;
- funds are available;
- the homeowner meets income/tax requirements;
- the product/project qualifies;
- the application will be approved;
- observed approval rates support the label.

“Likely eligible” must be replaced with evidence-stage language such as:

- “Strong property match—check remaining criteria”;
- “Some property details match”;
- “Location match only”;
- “Cannot evaluate until these facts are known.”

### 6.6 Freshness

The current rule treats a null verification date as newly added and applies no
penalty. Null actually means unknown. The target must fail closed:

- unreviewed source: not homeowner-visible;
- missing official source: not actionable;
- unknown verification: “source review required,” not fresh;
- expired or unavailable: removed from active recommendations;
- stale: suppressed or explicitly downgraded under a category-specific SLA.

### 6.7 Match lifecycle

Current states are:

- detected;
- viewed;
- dismissed;
- claimed;
- expired;
- inactive.

The UI maps “Mark as Pursuing” to `CLAIMED`. There is no record of:

- saved;
- gathering information;
- externally opened;
- started;
- submitted;
- awaiting decision;
- approved;
- denied;
- waitlisted;
- withdrawn;
- received;
- amount received;
- denial reason;
- evidence;
- follow-up date.

### 6.8 Home Savings baselines

The four modules use configuration such as:

- state-level annual insurance baseline;
- one annual warranty baseline;
- state-level internet baseline and a short provider-name list;
- state-level utility baseline;
- generic savings percentages.

These do not control for:

- address serviceability;
- dwelling characteristics;
- coverage equivalence;
- deductibles and exclusions;
- warranty limits and service fees;
- internet speed, equipment fees, taxes, data caps, promotions, and contract;
- weather, season, floor area, fuel, tariff, household use, and normalization;
- cancellation, installation, early termination, and switching costs.

The calculations can be useful as private triage heuristics, but not as “found
savings” or a market comparison.

### 6.9 Opportunity generation

Several generated records are not opportunities:

- “add your bill” is a readiness request;
- “spend looks reasonable” is a healthy result;
- “fixed rate could reduce swings” is a stability suggestion;
- “review deductible” is a coverage decision;
- “simple efficiency wins” is generic education.

All are persisted in `HomeSavingsOpportunity` and can influence summary,
completion, and analytics. The target must separate:

- readiness request;
- observation;
- benchmark flag;
- address-qualified offer;
- decision;
- action;
- realized outcome.

### 6.10 Savings aggregation

The summary adds only the top opportunity per category. It does not prevent:

- overlapping opportunities;
- mutually exclusive alternatives;
- duplicate insurance/warranty records;
- promotional savings and ongoing savings being mixed;
- gross savings without switching cost;
- a zero-value healthy result being treated as an opportunity.

The target must expose:

- non-additive value;
- one-time vs recurring;
- gross vs net;
- promotional vs ongoing;
- estimated vs quoted vs observed;
- confidence and basis;
- mutually exclusive groups.

### 6.11 Canonical record duplication

Insurance and warranty modules create `HomeSavingsAccount` copies with linked
IDs. They do not establish ongoing synchronization or canonical field
ownership. The target should read canonical records directly or use a typed
reference plus explicitly owned savings-only attributes.

### 6.12 Guidance completion

Every comparison run can call `recordToolCompletion` with `COMPLETED`, including
a run that:

- generated only missing-input prompts;
- evaluated no real alternative;
- found no actionable result;
- used generic baselines;
- produced no homeowner decision.

Completion should require the journey's intended outcome:

- relevant accounts reviewed;
- a qualified opportunity assessed;
- a decision recorded;
- an action completed;
- or an explicit no-action decision with reason.

### 6.13 Analytics and outcome integrity

Current telemetry overstates value:

- any detected hidden match triggers `outcome_win_generated`;
- clicking pursue triggers `outcome_action_taken`;
- marking Home Savings `APPLIED` triggers `savings_verified`;
- APPLIED or SWITCHED publishes estimated savings as a realization signal.

The target taxonomy must separate:

- opportunity detected;
- opportunity viewed;
- intent recorded;
- external action started;
- submitted;
- approved;
- received;
- switch completed;
- value observed;
- value verified.

### 6.14 Save / Financial Efficiency

The page has a useful aggregation concept, but its current execution is not a
safe canonical experience.

Material defects include:

- “verified upside” without verification;
- a fabricated minimum “protected this year” amount;
- “Claim This Benefit” for a potential match;
- hidden programs labeled “unclaimed” without claim evidence;
- “AI-powered” positioning for deterministic rules;
- “better rates” without rate shopping;
- mortgage trust claims that belong to the Refinance audit;
- equity and reserve planning mixed into savings ranking;
- hard-coded fallback states that imply active monitoring;
- DTO field mismatches that can hide actual values;
- no single application or realized-value lifecycle.

---

## 7. Homeowner Question Contract

| Homeowner question | Current answer | Gap | Target answer |
| --- | --- | --- | --- |
| What is this? | Two tools plus a Save dashboard | Fragmented mental model | One place for relevant benefits and recurring-cost opportunities |
| How will this benefit me? | Potential dollars and broad claims | Basis may be generic or absent | Clear benefit type, value basis, deadline, effort, and tradeoffs |
| What should I do to get full value? | Re-scan, add plan, check savings | Mechanics, not purpose | Add only the fact/document needed for a named opportunity |
| What should I care about? | Confidence, categories, generic ranking | No urgency/effort/action ranking | Qualified value × deadline × confidence × effort × fit |
| What can I control? | Filter, dismiss, pursue, apply | Status semantics are inaccurate | Save, verify facts, prepare, submit, track, dismiss, mute, control data |
| What was checked? | “Program database” or broad source labels | No catalog coverage | Named source families, jurisdictions, dates, and known gaps |
| Why did this match? | Rule reasons | Mandatory/unknown criteria are hidden | Known matches, unknown criteria, exclusions, and evidence required |
| Is the value real? | Estimated range or baseline | Stage is unclear | Estimated, quoted, approved, received, or observed label |
| Did I actually save? | Applied/switch status can imply yes | No confirmation | Evidence-backed realized-value entry or explicit unconfirmed state |
| When should I return? | Re-scan periodically | No meaningful revisit loop | Deadline, renewal, source update, fact change, or outcome follow-up |

### 7.1 Recommended first-screen hierarchy

1. **Outcome**
   - “Savings and benefits for this home.”
2. **Current priority**
   - one qualified action, or a calm healthy/coverage-limited state.
3. **Why it matters**
   - credible value stage, deadline, effort, and key tradeoff.
4. **Next action**
   - verify one fact, review official criteria, continue application, compare an
     equivalent option, or record a decision.
5. **Opportunity groups**
   - benefits and rebates;
   - recurring costs;
   - in progress;
   - realized.
6. **Coverage and trust**
   - what sources and jurisdictions were checked;
   - when;
   - what is not covered.
7. **Controls**
   - data use;
   - reminders;
   - dismissed items;
   - opportunity categories;
   - partner/communication consent.

---

## 8. Product-Framework Conformance

### 8.1 Current manifest assessment

| Capability | Current outcome | Mode | Safety | Completion | Assessment |
| --- | --- | --- | --- | --- | --- |
| Hidden Asset Finder | SAVE_OPTIMIZE | CONTEXTUAL | LOW_CONSEQUENCE | OUTPUT_GENERATED | Contextual is correct; safety and completion are too weak |
| Home Savings Check | SAVE_OPTIMIZE | CATALOG_ONLY | LOW_CONSEQUENCE | OUTPUT_GENERATED | Under-discoverable when a real cost event exists; completion too weak |

Additional inconsistencies:

- Hidden Asset Finder readiness requires one inventory item even though tax and
  location benefits may not depend on a tracked system.
- Home Savings route template is global while the live experience is
  property-scoped.
- Hidden Asset Finder is contextual but may be recommended before source
  coverage exists.
- Home Savings can serve event-driven and renewal triggers but is catalog-only.
- both treat output generation as the homeowner outcome.

### 8.2 Target framework contract

Recommended canonical capability:

| Field | Target |
| --- | --- |
| ID | `savings-benefits` |
| Label | Savings and Benefits |
| Outcome category | SAVE_OPTIMIZE |
| Route | `/dashboard/properties/[id]/tools/savings-benefits` |
| Release stage | BETA until source and outcome gates pass |
| Safety tier | MATERIAL_FINANCIAL |
| Recommendation mode | CONTEXTUAL |
| Safe partial value | Yes, only with explicit source-coverage limits |
| Completion kind | DECISION_RECORDED or EXTERNAL_ACTION_RECORDED |
| Completion signal | `savings_benefit_decision_or_external_action_recorded` |

Proposed homeowner outcome:

> Identify a reviewed opportunity relevant to this home, understand what
> remains to verify, and record a decision or completed external action.

Expected output:

> A saved decision, application/switch state, or verified realized outcome tied
> to a reviewed source and current property context.

### 8.3 Contextual trigger families

Recommended triggers:

- reviewed benefit becomes relevant;
- benefit deadline approaching;
- eligible system/project detected;
- renewal window approaching;
- recurring bill increased materially;
- address-qualified alternative available;
- application incomplete;
- application decision due;
- approved value not yet recorded;
- actual bill needed to verify a completed switch;
- source coverage expanded for the property.

### 8.4 Readiness

Readiness must be opportunity-specific.

Examples:

- a nationwide property-tax benefit may need occupancy and age;
- a utility rebate may need utility territory, equipment, project, and
  installation timing;
- an internet comparison may need address, speed, bill, fees, and contract end;
- an insurance comparison must hand off to the regulated coverage workflow.

“Add at least one home system” is not a universal gate.

### 8.5 Home placement

Do not show a permanent Savings and Benefits card above more important Home
Actions.

Promote only when:

- a reviewed, non-stale opportunity has a material value or deadline;
- a homeowner-started action needs attention;
- an expiring program or contract requires a decision;
- one missing fact unlocks a specific high-value review;
- an outcome requires confirmation.

Do not promote:

- background scanning;
- an empty registry;
- generic “run a scan” behavior;
- stable recurring bills;
- a broad marketing promise;
- passive source-refresh state.

---

## 9. Trust, Safety, Data, and Commercial Review

### 9.1 Safety classification

Browsing generic financial education can be low consequence. The family becomes
material financial when it:

- estimates eligibility;
- estimates monetary value;
- recommends a tax, utility, coverage, financing, or contract action;
- ranks opportunities;
- captures sensitive eligibility facts;
- sends an application or quote request;
- reports realized savings.

The canonical family should therefore use material-financial controls.

### 9.2 Fail-closed rules

The product must not recommend a program when:

- the official source is absent;
- the source has never been reviewed;
- the program is expired or inactive;
- source refresh is beyond the category SLA;
- jurisdiction coverage is unknown;
- mandatory disqualifying criteria are known;
- critical criteria cannot be represented;
- funding availability is known to be closed;
- value currency or period is ambiguous.

It must not show recurring savings as “found” when:

- no address-qualified alternative or defensible benchmark exists;
- material plan terms cannot be normalized;
- switching costs exceed or are absent from net value;
- coverage/service tradeoffs are not shown;
- the input bill is stale or incomplete.

### 9.3 Source taxonomy

Every opportunity should declare a source kind:

- official government;
- official utility;
- official nonprofit administrator;
- carrier/manufacturer;
- licensed or contracted market partner;
- public benchmark;
- homeowner document;
- homeowner statement;
- platform estimate.

Source kind must not be hidden behind one generic trust label.

### 9.4 Value stages

Use a mandatory value stage:

| Stage | Meaning |
| --- | --- |
| ESTIMATED_RANGE | Rule- or benchmark-based indication |
| ADDRESS_QUALIFIED | Availability confirmed for address |
| QUOTED | Named offer with terms and timestamp |
| APPROVED | Program or provider approved value |
| RECEIVED | Award, credit, rebate, or grant received |
| OBSERVED | Bill difference observed after action |
| VERIFIED | Observed/received value supported by evidence |

The UI must never collapse these into one “savings” total.

### 9.5 Eligibility stages

Use:

- location match;
- property match;
- remaining criteria;
- ready to apply;
- submitted;
- approved;
- denied;
- outcome unknown.

Do not use “likely eligible” unless approval calibration and complete rule
coverage support it.

### 9.6 Sensitive facts

Potentially sensitive criteria include:

- income;
- disability;
- age;
- veteran status;
- tax filing status;
- household composition;
- mortgage or utility hardship;
- immigration or other program-specific attributes.

Requirements:

- request only for a named opportunity;
- explain why;
- make optional until needed;
- capture consent and purpose;
- minimize retention;
- allow correction and deletion;
- avoid broad analytics payloads;
- restrict internal access;
- never infer a protected or sensitive status from unrelated data.

### 9.7 AI boundary

AI may:

- summarize official program language;
- map document fields into proposed structured facts;
- explain a comparison;
- generate a checklist from reviewed rules;
- help draft questions.

AI must not:

- invent programs;
- infer missing eligibility;
- determine final eligibility;
- claim funding availability;
- fabricate dollar value;
- submit or consent on behalf of the homeowner;
- silently replace official criteria;
- label an outcome verified.

### 9.8 Commercial integrity

If the platform later uses affiliate, lead, marketplace, or paid-placement
partners:

- opportunity ranking must be independent of compensation;
- sponsored options must be clearly labeled;
- organic official programs must not be suppressed;
- partner scope and limitations must be disclosed;
- communication consent must be specific;
- quote/application recipient must be named;
- data shared must be previewed;
- revocation and deletion must be supported;
- fulfillment and complaints must be audited;
- gross and net economics must be separated from homeowner value.

### 9.9 Professional boundaries

The family should route:

- tax questions to official authorities or qualified tax professionals;
- insurance changes to Coverage and Premium Review and licensed help;
- legal eligibility questions to official administrators or counsel;
- project qualification to program-approved contractors where required;
- financing decisions to the appropriate material-financial workflow.

---

## 10. Functional Gap Register

| ID | Priority | Gap | Consequence | Recommended action |
| --- | --- | --- | --- | --- |
| HSB-001 | P0 | No program population path | Scanner can always return zero | Add reviewed registry ingestion/admin workflow |
| HSB-002 | P0 | Zero results do not distinguish zero coverage | False reassurance | Return source/jurisdiction coverage state |
| HSB-003 | P0 | Null verification treated as fresh | Unreviewed programs can appear current | Fail closed on missing verification |
| HSB-004 | P0 | “Likely eligible” is uncalibrated | Overstates approval likelihood | Replace with match-stage language |
| HSB-005 | P0 | `CLAIMED` means pursuing | Corrupt outcome semantics | Replace lifecycle cleanly |
| HSB-006 | P0 | Applied emits verified savings | False outcome metrics | Split intent, completion, observation, verification |
| HSB-007 | P0 | Save page claims verified/protected value | Misleading financial claims | Remove unsupported copy and fabricated floor |
| HSB-008 | P0 | Generic baselines shown as found savings | Overstates value | Label benchmark or suppress dollars |
| HSB-009 | P0 | Guidance completes on generated output | False journey completion | Require decision/action completion |
| HSB-010 | P1 | County/utility/hazard/historic regions unreachable | Large program classes cannot match | Add canonical geography/territory resolver |
| HSB-011 | P1 | Many rule facts permanently null | Broad categories are not credible | Add typed fact sources or narrow supported scope |
| HSB-012 | P1 | No mandatory/optional/disqualifier semantics | Partial ratios can mislead | Versioned eligibility expression model |
| HSB-013 | P1 | OR/group logic unused | Official rules cannot be represented | Implement expression groups |
| HSB-014 | P1 | No program version/effective period | Rule history is untraceable | Version programs and criteria |
| HSB-015 | P1 | No funding/application window state | Stale availability | Add availability and window lifecycle |
| HSB-016 | P1 | No stacking/mutual exclusion | Double-counting risk | Model compatibility and exclusivity |
| HSB-017 | P1 | No application checklist | No execution path | Generate reviewed criteria/evidence checklist |
| HSB-018 | P1 | No application lifecycle | No follow-through | Add application/action entity |
| HSB-019 | P1 | No realized-value ledger | Cannot prove impact | Add outcome and evidence model |
| HSB-020 | P1 | Home Savings account duplication | Canonical record drift | Use typed references to canonical records |
| HSB-021 | P1 | No address-qualified alternatives | Generic provider suggestions | Add connector or benchmark-only mode |
| HSB-022 | P1 | No equivalent-plan normalization | Unsafe comparisons | Normalize price, service, protection, term, and fees |
| HSB-023 | P1 | Gross savings ignores friction | Inflated benefit | Calculate net value and payback |
| HSB-024 | P1 | Top-per-category sum can overlap | Inflated total | Add exclusivity and additive rules |
| HSB-025 | P1 | Readiness prompts are generic | Unnecessary data capture | Opportunity-specific progressive capture |
| HSB-026 | P1 | Save DTO mismatches | Missing/mis-ranked UI results | Use typed contract; eliminate `any` |
| HSB-027 | P1 | Specialized domains are duplicated | Conflicting decisions | Canonical ownership and typed handoffs |
| HSB-028 | P1 | No canonical Home Action lifecycle | Parallel priority | Promote only governed actions |
| HSB-029 | P2 | No reviewed-program admin UI | Operational fragility | Add source review console |
| HSB-030 | P2 | No source SLA/alerting | Silent staleness | Source health metrics and alerts |
| HSB-031 | P2 | No deadline reminders | Missed value | Consented reminder workflow |
| HSB-032 | P2 | No denial/expiration feedback | Cannot improve matching | Capture structured outcomes |
| HSB-033 | P2 | No document/evidence packet | High application effort | Reuse Document Vault with consent |
| HSB-034 | P2 | No accessibility regression suite | Interaction risk | Keyboard, screen reader, contrast, zoom tests |
| HSB-035 | P2 | No end-to-end domain fixtures | Truth regressions | Golden program and offer fixtures |
| HSB-036 | P2 | No category-specific empty states | Zero appears generic | Show coverage and next review |
| HSB-037 | P2 | No notification preferences | Either dead or noisy | Category/deadline/value controls |
| HSB-038 | P2 | No household/property applicability separation | Benefits can be mis-scoped | Explicit beneficiary and property scope |
| HSB-039 | P2 | No amount-period taxonomy | One-time and annual values mix | Type monetary period and recurrence |
| HSB-040 | P2 | No partner governance | Future lead risk | Add disclosure, consent, rank, and audit controls |

### 10.1 P2 implementation reconciliation — July 29, 2026

| ID | Current state | Repository evidence |
| --- | --- | --- |
| HSB-029 | Implemented | Reviewed source/program author-review-publish console and role-gated admin APIs |
| HSB-030 | Implemented | Source-health audit worker, bounded metrics, Prometheus alerts, and operations runbook |
| HSB-031 | Implemented | Retry-safe, explicit-opt-in deadline reminder worker |
| HSB-032 | Implemented | Append-only `DENIED`, `WITHDRAWN`, `EXPIRED`, and `NO_ACTION` outcomes with required reasons |
| HSB-033 | Implemented | Property-scoped Document Vault evidence on action checklists and outcomes |
| HSB-034 | Implemented | Savings and Benefits accessibility regression contract covering names, keyboard behavior, dialogs, focus, and touch targets |
| HSB-035 | Implemented | All 17 golden scenarios execute without skipped cases |
| HSB-036 | Implemented | Category-specific coverage/match empty states with next-review date or explicit unscheduled state |
| HSB-037 | Implemented | Category-specific opt-in, cadence, quiet hours, deadline lead time, and minimum-value controls |
| HSB-038 | Implemented | Explicit `PROPERTY` / `HOUSEHOLD` / `EITHER` beneficiary scope |
| HSB-039 | Implemented | Exact `ONE_TIME` / `MONTHLY` / `ANNUAL` / `UNKNOWN` monetary periods |
| HSB-040 | Implemented | Approved-recipient allowlist, disclosure/ranking contract, exact field preview, consent persistence, and fail-closed handoff |

### 10.2 P2 operational-integrity hardening — July 29, 2026

The implementation follow-up closed four defects beneath the P2 feature-level
checks:

- source metadata edits no longer renew source freshness; a reviewer must use
  the explicit, reasoned source-review attestation action;
- source-review attestations and program lifecycle transitions commit in the
  same transaction as their business audit rows, with compare-and-set
  protection against concurrent transitions;
- deadline reminders acquire a time-bounded database lease before delivery,
  preventing concurrent worker sweeps from sending duplicates while allowing
  failed or abandoned claims to be retried;
- muting a Savings and Benefits reminder remains scoped to
  `SAVINGS_BENEFITS`, rather than muting the broader material-deadline
  category.

### 10.3 Post-implementation gap closure — July 29, 2026

The final implementation review closed the remaining cross-cutting integrity
and operations gaps:

- source attestations are content-version-bound; material metadata edits
  increment the source version and invalidate the prior review;
- program content is editable only in `DRAFT`, approval is bound to the exact
  content version, and publish uses a compare-and-set transition;
- all source/program authoring changes and partner-governance changes write
  queryable admin audit records;
- realized outcomes remain self-reported or evidence-attached until an admin
  reviewer verifies Document Vault evidence; only `VERIFIED` recurring
  outcomes may publish shared realization signals;
- action completion, terminal outcomes, idempotency, and revocation
  reconciliation now commit atomically;
- realized totals are grouped by ISO currency and never summed or formatted
  as USD across currencies;
- the partner allowlist is now a durable, effective-dated registry with
  jurisdiction, disclosure version, SLA, lifecycle, complaints, revocation,
  linked outcomes, and an overdue handoff work queue;
- source/program/property/account changes request event-driven reevaluation,
  with the scheduled sweep retained as recovery;
- saved action follow-ups use an opt-in, lease-protected, idempotent reminder
  worker with durable notification reconciliation;
- accessibility coverage now renders the real outcome interaction and runs
  executable WCAG A/AA checks in addition to source contracts;
- the golden-path suite now includes an isolated, database-backed
  owner-applied-schema and integrity gate, enabled with
  `SAVINGS_BENEFITS_ACCEPTANCE_DATABASE_URL`.

Validation for this closure includes backend type-checking, focused domain
tests, frontend production compilation, worker compilation, and the actual
worker Docker image build.

---

## 11. Best-in-Class Target Experience

### 11.1 Stage 1 — Coverage statement

Before showing results:

> We checked reviewed federal, New Jersey, local, and participating utility
> sources for this address. Local and utility coverage is partial. Last source
> review: July 24.

The statement must be generated from real source operations, not static copy.

### 11.2 Stage 2 — Opportunity summary

Show only actionable categories:

- **Act by September 30**
- **Worth verifying**
- **Add one detail to check**
- **In progress**
- **Completed**

Do not lead with tool names, scan mechanics, or confidence tiers.

### 11.3 Stage 3 — Benefit detail

Each benefit should show:

- what it may provide;
- one-time or recurring value;
- value stage and basis;
- official program owner;
- jurisdiction;
- application and funding dates;
- why it matched;
- confirmed criteria;
- missing criteria;
- known disqualifiers;
- documents likely required;
- estimated effort;
- official source;
- last reviewed date;
- next action.

### 11.4 Stage 4 — Recurring-cost detail

Each comparison should show:

- current provider/plan and source date;
- normalized current cost;
- alternative or benchmark source;
- address availability;
- equivalent service/coverage terms;
- promotion and ongoing price;
- fees and taxes;
- contract and cancellation terms;
- switching cost;
- gross and net value;
- uncertainty;
- next action.

If no live alternative exists, say:

> Your bill is above a broad state benchmark. We do not yet have an
> address-qualified offer, so this is a prompt to review—not confirmed savings.

### 11.5 Stage 5 — Preparation and action

The homeowner can:

- save;
- dismiss with a reason;
- add a specific fact;
- upload or link evidence;
- open official instructions;
- prepare a checklist;
- request a qualified quote;
- consent to a partner handoff;
- mark externally submitted;
- set a follow-up reminder.

### 11.6 Stage 6 — Outcome

Track:

- decision not to proceed;
- submitted;
- approved or denied;
- awarded/received;
- service switched;
- first full bill received;
- expected value;
- actual value;
- evidence;
- ongoing review date.

### 11.7 Healthy and limited states

Healthy:

> No timely opportunity needs action today. We checked 18 reviewed programs and
> three recurring-cost categories. We will review again when a source, bill, or
> property detail changes.

Coverage limited:

> We could not complete a local-program check because this county is not yet
> covered. Federal and state sources were checked. You can still browse the
> official local resources listed here.

Not ready:

> Add your electric utility—not your full account number—to check two
> utility-specific rebate sources for the planned heat-pump project.

### 11.8 Revisit value

The family earns revisits through:

- new or changed reviewed programs;
- deadlines;
- renewal and contract windows;
- bill changes;
- project milestones;
- application follow-up;
- approved or denied outcomes;
- evidence needed to verify value;
- annual benefit renewal;
- source-coverage expansion.

“Run scan again” is not a revisit strategy.

---

## 12. Target Data and Domain Model

### 12.1 Design principles

- one canonical opportunity identity;
- versioned source and rule definitions;
- explicit source coverage;
- typed eligibility criteria;
- property facts referenced, not copied;
- sensitive facts purpose-bound;
- value stage always explicit;
- application and outcome separated;
- no duplicate canonical account facts;
- estimates never become realized values automatically;
- actions integrate with canonical Home Actions;
- clean schema replacement is allowed because no migration is required.

### 12.2 Recommended entities

#### `SavingsBenefitSource`

- id;
- name;
- source kind;
- official owner;
- base URL;
- jurisdictions;
- category coverage;
- ingestion method;
- review SLA;
- last attempted/succeeded/reviewed;
- status;
- failure reason;
- commercial relationship;
- disclosure text.

#### `SavingsBenefitProgram`

- id;
- source ID;
- external ID;
- name;
- benefit family;
- administrator;
- jurisdiction;
- beneficiary scope;
- description;
- official URL;
- application URL;
- effective start/end;
- application window;
- funding state;
- status.

#### `SavingsBenefitProgramVersion`

- program ID;
- version;
- source snapshot or checksum;
- effective dates;
- reviewed at/by;
- rule completeness state;
- material change summary;
- published state.

#### `SavingsBenefitCriterion`

- program version;
- stable key;
- criterion type;
- fact key;
- operator/value;
- mandatory/optional/disqualifying;
- expression group;
- evidence requirement;
- sensitivity;
- homeowner explanation;
- unknown handling.

#### `SavingsBenefitValue`

- program version;
- value type;
- minimum/maximum/fixed/formula;
- currency;
- recurrence;
- tax treatment caveat;
- cap;
- basis;
- assumptions.

#### `SavingsOpportunity`

- property;
- opportunity family;
- source entity/version;
- current context version;
- state;
- match stage;
- value stage;
- expected value;
- net value;
- deadline;
- effort;
- rank inputs;
- explanation;
- first seen/last evaluated;
- suppression/dismissal.

#### `SavingsOpportunityCriterionResult`

- opportunity;
- criterion;
- result: met/not met/unknown/external verification;
- fact reference;
- evidence reference;
- evaluated at;
- explanation.

#### `RecurringCostAccountReference`

- property;
- category;
- canonical entity type/ID;
- current bill document;
- savings-only preferences;
- latest normalized cost;
- as-of date.

This replaces mirrored policy and warranty facts.

#### `RecurringCostComparison`

- account reference;
- current-plan snapshot;
- alternative/benchmark;
- source kind;
- serviceability state;
- equivalence state;
- gross/net value;
- promotion/ongoing periods;
- fees;
- switching costs;
- assumptions;
- expiration.

#### `SavingsBenefitAction`

- opportunity;
- action type;
- state;
- external owner;
- consent;
- shared fields;
- started/submitted/completed dates;
- follow-up date;
- Home Action reference.

#### `SavingsBenefitOutcome`

- opportunity/action;
- outcome type;
- expected value;
- approved value;
- received value;
- observed recurring value;
- value period;
- source/evidence;
- observed at;
- verified at/by;
- denial or no-action reason.

#### `SavingsBenefitPreference`

- categories;
- minimum value;
- reminder channels;
- dismissed-source behavior;
- partner contact consent;
- sensitive-data controls.

### 12.3 Models to retire or reshape

Because no migration is required:

- replace `PropertyHiddenAssetMatchStatus.CLAIMED`;
- reshape `PropertyHiddenAssetMatch` into the canonical opportunity model or
  retire it;
- version or replace `HiddenAssetProgram` and flat rules;
- replace duplicated `HomeSavingsAccount` ownership with canonical references;
- split `HomeSavingsOpportunity` into comparison, opportunity, action, and
  outcome;
- keep run records only for reproducibility and operations;
- never retain estimated savings as an outcome field;
- remove obsolete summary semantics.

### 12.4 No migration requirement

Implementation should:

- edit `schema.prisma`;
- update application code and fixtures;
- generate the Prisma client;
- validate and test against a clean database;
- provide schema reconciliation notes;
- not create a migration directory or SQL migration.

---

## 13. API and Service Design

### 13.1 Canonical read

`GET /api/properties/:propertyId/savings-benefits`

Returns:

- source coverage;
- readiness;
- ranked actionable opportunities;
- benefits;
- recurring costs;
- in-progress actions;
- realized outcomes;
- healthy/limited state;
- next review;
- property-context version.

### 13.2 Opportunity detail

`GET /api/properties/:propertyId/savings-benefits/opportunities/:id`

Returns:

- source/version;
- match and remaining criteria;
- value stage and basis;
- dates;
- evidence checklist;
- tradeoffs;
- allowed actions;
- canonical destination.

### 13.3 Fact capture

`POST /api/properties/:propertyId/savings-benefits/opportunities/:id/facts`

Requirements:

- only requested fact keys;
- purpose and consent;
- provenance;
- sensitivity;
- conflict handling;
- recomputation result.

### 13.4 Action lifecycle

`POST /api/properties/:propertyId/savings-benefits/opportunities/:id/actions`

`PATCH /api/properties/:propertyId/savings-benefits/actions/:actionId`

Actions include:

- save;
- dismiss;
- prepare;
- official source opened;
- quote requested;
- partner handoff consented;
- externally submitted;
- approved/denied;
- switched;
- received;
- follow-up scheduled.

### 13.5 Outcome

`POST /api/properties/:propertyId/savings-benefits/actions/:actionId/outcome`

Must never infer actual value from the estimate. It accepts:

- result;
- amount;
- recurrence;
- observation period;
- evidence;
- source;
- verification state.

### 13.6 Source coverage

`GET /api/savings-benefits/coverage?propertyId=:propertyId`

Returns real:

- sources;
- jurisdiction/category coverage;
- freshness;
- source health;
- limitations.

### 13.7 Admin/source operations

Required internal APIs:

- source registration;
- ingest preview;
- diff and review;
- publish;
- deactivate;
- freshness override with reason;
- source health;
- program/rule validation;
- test property simulation;
- rollback to prior version.

### 13.8 Errors and state model

Differentiate:

- source unavailable;
- jurisdiction not covered;
- program registry empty;
- source stale;
- missing property fact;
- missing sensitive criterion;
- criteria incomplete;
- no matching reviewed program;
- no address-qualified recurring option;
- action already in progress;
- partner unavailable;
- outcome unconfirmed.

A generic empty list is insufficient.

---

## 14. UX and Content Requirements

### 14.1 Naming

Recommended homeowner label:

**Savings and Benefits**

Optional section labels:

- Benefits and rebates;
- Monthly bills;
- In progress;
- Savings received.

Avoid as primary copy:

- Hidden Asset Finder;
- intelligence;
- scanner;
- engine;
- confidence score;
- source family;
- fintech-grade;
- claim this benefit;
- verified upside;
- protected this year.

### 14.2 Opportunity copy pattern

Use:

> **New Jersey property-tax benefit worth checking**  
> This home matches the location and primary-residence criteria. Age and
> household eligibility still need confirmation. The official application
> window closes October 31.

Not:

> High-confidence hidden asset. Claim this benefit.

### 14.3 Value copy

Use:

- “Program publishes a benefit of up to …”
- “Broad benchmark suggests …”
- “Address-qualified quote shows …”
- “Approved amount …”
- “Observed over two full bills …”

Do not use an unlabeled “savings” number.

### 14.4 Readiness prompts

Every prompt must include:

- the exact fact;
- the named opportunity;
- why it changes the answer;
- where it will be stored;
- whether it is sensitive;
- skip/not-now control.

### 14.5 Ranking

Rank by:

- deadline/urgency;
- reviewed relevance;
- net value;
- value stage;
- effort;
- missing criteria;
- homeowner goal;
- action state.

Never rank paid placement above homeowner value.

### 14.6 Controls

Homeowners can:

- hide categories;
- mute a source;
- dismiss with reason;
- undo dismissal;
- set a minimum value;
- choose reminders;
- manage partner consent;
- review sensitive facts;
- delete eligibility facts;
- correct source-linked property facts.

### 14.7 Accessibility

Requirements:

- semantic headings and regions;
- keyboard-operable tabs, filters, dialogs, and action menus;
- no color-only value or status;
- screen-reader-friendly value stage and deadline;
- focus restoration after dialogs;
- explicit external-link behavior;
- accessible validation and errors;
- 200% zoom and narrow-width support;
- reduced-motion support;
- touch targets of at least 44px;
- currency and date localization.

### 14.8 Performance

- first response must not wait on live external calls;
- serve last reviewed opportunity state with freshness;
- refresh asynchronously;
- source failures must not erase prior reviewed state;
- paginate catalogs/history;
- deduplicate concurrent refresh;
- cache source coverage by jurisdiction;
- expose partial failures.

---

## 15. Portfolio Score and Disposition

### 15.1 Current scorecard

| Dimension | Hidden Asset Finder | Home Savings | Combined assessment |
| --- | ---: | ---: | --- |
| Homeowner outcome clarity | 3/5 | 3/5 | Two overlapping concepts |
| Functional completeness | 2/5 | 2/5 | Discovery/comparison without credible execution |
| Source/data quality | 1/5 | 1/5 | Registry population absent; hard-coded baselines |
| Trust and explainability | 3/5 | 2/5 | Good caveats undermined by claim language |
| Actionability | 2/5 | 2/5 | Links and self-reported statuses only |
| Completion integrity | 1/5 | 1/5 | Generated/applied treated as outcome |
| Revisit value | 2/5 | 2/5 | Refresh mechanics, weak lifecycle |
| Framework alignment | 3/5 | 2/5 | Contextual foundation, fragmented routes |
| Operational readiness | 2/5 | 2/5 | Worker exists, source operations do not |
| Commercial integrity | 3/5 | 2/5 | No partner yet, future surface is ungoverned |

### 15.2 Disposition

**Consolidate and rebuild.**

Do not retire the outcome family. Finding missed benefits and reducing recurring
ownership cost is strongly aligned with the product thesis. Retire the
fragmented tool contracts and unsupported claims.

### 15.3 Release recommendation

Move the family to BETA until:

- at least one reviewed source package is operational;
- coverage statements are accurate;
- value-stage language is enforced;
- application and outcome semantics are separated;
- Home/Guidance completion is corrected;
- unsupported Save claims are removed;
- golden fixtures and source-health gates pass.

---

## 16. Recommended Implementation Sequence

### Slice 0 — Immediate truth containment

**Goal:** Stop unsupported eligibility, value, and outcome claims.

Changes:

- replace “Likely eligible” with match-stage language;
- replace “Claim This Benefit” and `CLAIMED`;
- stop `savings_verified` on APPLIED;
- stop realization signals from APPLIED/SWITCHED estimates;
- remove “verified upside,” fabricated “protected” amount, and similar Save
  copy;
- label baseline calculations as broad estimates;
- do not show a positive dollar total from readiness or healthy-result records;
- treat null `lastVerifiedAt` as unreviewed;
- distinguish registry empty from no matches;
- prevent output-only Guidance completion;
- fix Save DTO field usage or hide the broken section pending consolidation.

Acceptance:

- no UI or analytics event equates interest/application with realized value;
- an empty registry is explicitly reported;
- no unreviewed program appears actionable;
- generated baseline values are labeled estimated.

### Slice 1 — Canonical capability and route

**Goal:** Establish one Savings and Benefits outcome family.

Changes:

- add canonical capability definition;
- define material-financial safety;
- define decision/action completion;
- add property-scoped route and workspace shell;
- create sections for benefits, recurring costs, in progress, and realized;
- redirect old routes;
- retire the property Save parallel dashboard;
- preserve Explore Tools entry;
- define canonical handoffs.

Acceptance:

- one route owns the outcome;
- old links land in the correct section;
- no second priority dashboard remains;
- Home Actions remain the only priority system.

### Slice 2 — Reviewed source registry and coverage

**Goal:** Make program coverage real and observable.

Changes:

- reshape schema for sources, program versions, review, and coverage;
- implement at least one reviewed source ingestion package;
- add source validation and publish workflow;
- add jurisdiction/category coverage response;
- add source health and staleness rules;
- add admin review console or bounded operational CLI;
- add runbook and alerts.

Acceptance:

- a clean environment can populate reviewed programs reproducibly;
- the product states exactly what was checked;
- stale/unreviewed sources fail closed;
- source failure is visible operationally and to affected homeowners.

### Slice 3 — Eligibility expression and context

**Goal:** Represent official criteria and unknowns accurately.

Changes:

- mandatory, optional, disqualifying, and externally verified criteria;
- AND/OR expression groups;
- typed value and evidence rules;
- geography/utility/hazard/historic resolver;
- program completeness score owned by operations, not homeowner confidence;
- opportunity-specific Property Context prompts;
- consented sensitive eligibility facts.

Acceptance:

- golden program rules reproduce reviewed examples;
- missing mandatory facts cannot create an implied eligible state;
- sensitive facts are purpose-bound;
- unsupported region types are no longer silently ignored.

### Slice 4 — Opportunity truth and ranking

**Goal:** Create a canonical opportunity read model.

Changes:

- unify benefit and recurring opportunity identity;
- add value stage, recurrence, gross/net, source, deadline, effort, and
  exclusivity;
- distinguish readiness, observation, benchmark flag, qualified option, action,
  and outcome;
- implement qualified ranking;
- build healthy and coverage-limited states.

Acceptance:

- one-time and recurring values do not mix;
- mutually exclusive values are not summed;
- readiness prompts are not counted as savings;
- every dollar has a visible basis and stage.

### Slice 5 — Canonical recurring-cost records and comparisons

**Goal:** Replace generic baseline promises with defensible comparisons.

Changes:

- remove mirrored insurance/warranty ownership;
- create canonical account references;
- normalize current bills;
- add address-qualified provider connector for one pilot category, or clearly
  remain benchmark-only;
- model service/coverage equivalence, fees, promotion, ongoing price, contract,
  switching cost, and net value;
- hand insurance decisions to Coverage and Premium Review.

Acceptance:

- no duplicate canonical policy/warranty values;
- live alternatives are address-qualified and timestamped;
- benchmark flags cannot be presented as offers;
- net value includes known friction.

### Slice 6 — Application and switching lifecycle

**Goal:** Help the homeowner move from opportunity to completion.

Changes:

- add action lifecycle;
- add reviewed checklist and evidence requirements;
- reuse Document Vault references;
- support official-source handoff;
- add partner/quote consent contract;
- add reminders and follow-up;
- capture denial, expiration, withdrawal, and no-action reason;
- integrate canonical Home Actions.

Acceptance:

- the homeowner can resume an unfinished action;
- external steps and platform state remain distinguishable;
- partner data sharing is explicit;
- completed actions have evidence or an explicit self-reported state.

### Slice 7 — Realized-value ledger

**Goal:** Measure actual homeowner outcomes.

Changes:

- add approved, received, observed, and verified value;
- support award, credit, rebate, quote, contract, and bill evidence;
- compare expected with actual;
- require a sufficient observation window for recurring savings;
- correct analytics taxonomy;
- write results to the Living Home Record.

Acceptance:

- estimates never populate realized fields;
- verified value has evidence and provenance;
- analytics report funnel stages separately;
- users can correct or revoke an outcome.

### Slice 8 — Contextual discovery and revisit loop

**Goal:** Surface the family only when it creates value.

Changes:

- event-driven reevaluation on relevant source, property, project, bill, and
  contract changes;
- deadline and renewal Home Actions;
- source-coverage expansion notice;
- in-progress follow-up;
- outcome-confirmation request;
- preferences and notification controls;
- suppress passive setup and scanning state from Home.

Acceptance:

- Home shows a specific action, not a permanent tool card;
- no-action state remains available in workspace/Explore Tools;
- alerts are deduplicated and consented;
- revisit triggers are measurable.

### Slice 9 — Commercial and partner governance

**Goal:** Safely support monetized or fulfilled opportunities.

Changes:

- partner registry;
- compensation and sponsorship disclosure;
- organic/paid ranking separation;
- recipient and data-share preview;
- consent receipt;
- fulfillment SLA;
- complaint and revocation workflow;
- partner outcome reconciliation.

Acceptance:

- compensation cannot alter organic rank;
- every handoff has consent and recipient;
- unfulfilled leads are visible;
- commercial metrics do not substitute for homeowner outcomes.

### Slice 10 — Validation and launch gate

**Goal:** Prove the family is credible and operable.

Changes:

- golden source/program fixtures;
- eligibility expression tests;
- value math tests;
- source staleness drills;
- clean-schema rehearsal;
- API contract tests;
- full responsive and accessibility test;
- analytics truth audit;
- legal/tax/coverage/commercial review;
- pilot source and jurisdiction runbook.

Acceptance:

- all Definition of Done gates pass;
- no migration script exists;
- source operations are staffed;
- a clean deployment produces a truthful, useful experience.

---

## 17. Acceptance Matrix

| Outcome | Required evidence |
| --- | --- |
| Source coverage is trustworthy | Published source/jurisdiction records and health |
| Match is explainable | Versioned criteria and criterion results |
| Eligibility is not overstated | Match-stage copy and unknown criteria |
| Value is interpretable | Value stage, period, basis, assumptions |
| Recurring comparison is fair | Equivalent terms, address availability, net value |
| Setup is actionable | Named fact, benefit, purpose, and capture path |
| Action is resumable | Durable action state and follow-up |
| Completion is meaningful | Decision or external action, not generated output |
| Realized value is credible | Outcome stage, evidence, observation period |
| Home placement is governed | Canonical Home Action |
| Commercial relationship is transparent | Disclosure, ranking policy, consent receipt |
| Empty state is truthful | Source coverage and next review |

---

## 18. Test Strategy

### 18.1 Unit tests

- source freshness and fail-closed rules;
- geography/utility/hazard resolution;
- eligibility expressions;
- mandatory and disqualifying criteria;
- unknown handling;
- value stage and recurrence;
- gross/net value;
- switching cost;
- exclusivity and stacking;
- ranking;
- state transitions;
- completion rules;
- sensitive-fact policy.

### 18.2 Golden fixtures

Include:

- nationwide program;
- state property-tax benefit;
- county program;
- utility territory rebate;
- income-sensitive program;
- equipment certification requirement;
- mutually exclusive rebates;
- stackable programs;
- expired program;
- stale source;
- funding closed;
- no source coverage;
- internet benchmark only;
- address-qualified offer;
- promotional-to-ongoing price;
- completed switch with two observed bills;
- denied application.

### 18.3 API tests

- property authorization;
- source coverage;
- opportunity list/detail;
- fact consent;
- action transitions;
- outcome evidence;
- invalid transition rejection;
- idempotency;
- partner consent;
- stale source suppression;
- partial source failure.

### 18.4 UI tests

- first use;
- source-limited empty state;
- opportunity-specific setup;
- benefits detail;
- recurring comparison;
- deadline;
- action resume;
- approval/denial;
- realized value;
- dismissal/undo;
- mobile/desktop;
- keyboard/screen reader;
- 200% zoom;
- external link warning.

### 18.5 Regression assertions

- no “verified savings” event on APPLIED;
- no estimated value in realized totals;
- no `CLAIMED` status;
- no unreviewed program action;
- no permanent Home card without an action;
- no duplicate insurance/warranty ownership;
- no DTO `any` access in canonical workspace;
- no Guidance completion from readiness output;
- no migration directory added.

### 18.6 Operational tests

- clean source bootstrap;
- ingest preview/publish;
- source outage;
- stale source;
- bad schema/record quarantine;
- rollback;
- worker retry;
- property-scoped smoke run;
- clean Prisma schema push rehearsal.

---

## 19. Measurement

### 19.1 Primary funnel

- qualified opportunity presented;
- detail reviewed;
- missing criterion completed;
- decision recorded;
- action started;
- submitted/switched;
- approved/denied;
- received/observed;
- verified.

### 19.2 Value metrics

- verified one-time value received;
- verified recurring net value;
- opportunity-to-action rate;
- action-to-outcome rate;
- median time to outcome;
- deadline completion rate;
- benefit renewal/retention;
- source coverage by property.

### 19.3 Trust metrics

- match false-positive feedback;
- denial reason distribution;
- stale-source exposure;
- correction rate;
- estimate-to-actual error;
- benchmark-to-quote error;
- source click-to-return behavior;
- unsupported-claim incidents.

### 19.4 Guardrails

Do not report:

- detected value as saved;
- applied value as verified;
- gross mutually exclusive opportunities as additive;
- page views as homeowner outcomes;
- partner conversions without homeowner-value result;
- a zero result as “no benefits available.”

---

## 20. Operations and Governance

### 20.1 Required owners

- product owner;
- source/program operations owner;
- data engineering owner;
- domain reviewer for tax/benefit categories;
- recurring-market connector owner;
- security/privacy owner;
- commercial-integrity owner;
- customer support owner;
- analytics owner.

### 20.2 Admin controls

Operations must be able to:

- preview source changes;
- compare program versions;
- validate official URLs;
- review criteria and value;
- simulate a property;
- publish/unpublish;
- pause a source;
- set freshness SLA;
- mark funding state;
- inspect match volume;
- investigate complaints;
- correct a program;
- invalidate affected opportunities;
- audit who changed what.

### 20.3 Runbooks

Required:

- source onboarding;
- source failure;
- stale program;
- incorrect eligibility rule;
- incorrect value;
- expired funding;
- official URL change;
- partner outage;
- data deletion;
- homeowner dispute;
- analytics correction;
- schema reconciliation without migration.

### 20.4 Review cadence

- source-specific automated checks;
- category-specific human review SLA;
- pre-deadline validation;
- quarterly truth-contract audit;
- annual sensitive-data review;
- commercial ranking audit;
- outcome calibration review after sufficient evidence.

---

## 21. Documentation Change List

Update or replace:

- `docs/functional/HIDDEN_ASSET_FINDER.md`;
- Home Savings functional documentation;
- Product Framework capability definitions and generated inventory;
- capability discovery readiness and triggers;
- route disposition documentation;
- Property Context requirements;
- Guidance completion and destination documentation;
- worker job documentation;
- analytics event taxonomy;
- source operations runbook;
- privacy/data inventory;
- commercial disclosure policy;
- dashboard and navigation copy.

The Hidden Asset document must no longer describe the feature as operationally
complete without documenting how the program registry is populated.

---

## 22. Definition of Done

The family is done when:

1. one canonical Savings and Benefits route exists;
2. old tool routes redirect correctly;
3. the Save parallel dashboard is retired;
4. a clean environment can load at least one reviewed source package;
5. source coverage and limitations are homeowner-visible;
6. null review date fails closed;
7. official criteria are versioned;
8. mandatory, optional, disqualifying, grouped, and external criteria work;
9. sensitive facts are purpose-bound and consented;
10. every value has stage, period, source, and basis;
11. broad benchmarks are not presented as offers or found savings;
12. recurring comparisons include equivalence and net value;
13. canonical policy/warranty records are not duplicated;
14. benefits and recurring opportunities use one lifecycle;
15. application intent is distinct from submission, approval, receipt, and
    verification;
16. estimates never become realized value automatically;
17. Guidance requires a decision or action for completion;
18. Home promotes only a canonical action;
19. controls, accessibility, and responsive behavior pass;
20. source health, alerts, and runbooks exist;
21. analytics use truthful funnel stages;
22. golden fixtures and operational drills pass;
23. Prisma validation and clean-schema rehearsal pass;
24. no migration script is created.

---

## 23. Immediate Recommendation

Implement Slice 0 before expanding the registry or adding more program
categories.

The highest-value near-term work is not adding more estimated savings. It is
correcting the truth contract:

- a match is not eligibility;
- applying is not saving;
- switching intent is not observed value;
- a benchmark is not an offer;
- a successful scan is not source coverage;
- a tool output is not a homeowner outcome.

Then build the family around one narrow, reviewed pilot:

1. one jurisdiction;
2. a small set of official program sources;
3. one recurring-cost category with either address-qualified data or explicit
   benchmark-only behavior;
4. complete source, criterion, action, and outcome tracking;
5. no permanent Home card;
6. measured homeowner value only after evidence.

That pilot creates a reusable best-in-class contract. Expanding the existing
catalog without it would increase the number of claims the product cannot
defend.

---

## Appendix A — Repository Evidence Map

| Area | Evidence |
| --- | --- |
| Capability definitions | `apps/backend/src/productFramework/capabilities/definitions/saveOptimize.ts` |
| Contextual Hidden Asset trigger | `apps/backend/src/productFramework/capabilities/definitions/capabilityDefinitionFactory.ts` |
| Capability inventory | `docs/product/capability-discovery/current-capability-inventory.md` |
| Audit framework | `docs/product/CAPABILITY_OUTCOME_AND_EXPERIENCE_AUDIT_FRAMEWORK.md` |
| Hidden Asset documentation | `docs/functional/HIDDEN_ASSET_FINDER.md` |
| Production-readiness assessment | `docs/functional/PRODUCTION_READINESS_AUDIT_2026.md` |
| Duplication analysis | `docs/gap-duplication-pass4.md` |
| Hidden Asset schema | `apps/backend/prisma/schema.prisma` |
| Hidden Asset service | `apps/backend/src/services/hiddenAssets.service.ts` |
| Hidden Asset rule engine | `apps/backend/src/services/hiddenAssets/ruleEngine.ts` |
| Hidden Asset confidence policies | `apps/backend/src/services/hiddenAssets/categoryConfig.ts` |
| Hidden Asset controller/routes | `apps/backend/src/controllers/hiddenAssets.controller.ts`, `apps/backend/src/routes/hiddenAssets.routes.ts` |
| Hidden Asset worker | `apps/workers/src/jobs/hiddenAssetRefresh.job.ts` |
| Hidden Asset UI | `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/hidden-asset-finder/HiddenAssetFinderClient.tsx` |
| Hidden Asset trust copy | `apps/frontend/src/lib/trust/trustPresets.ts` |
| Home Savings schema | `apps/backend/prisma/schema.prisma` |
| Home Savings service | `apps/backend/src/services/homeSavings.service.ts` |
| Home Savings modules | `apps/backend/src/services/homeSavings/categories/*` |
| Home Savings seeds | `apps/backend/src/services/homeSavings/types.ts` |
| Home Savings controller/routes | `apps/backend/src/controllers/homeSavings.controller.ts`, `apps/backend/src/routes/homeSavings.routes.ts` |
| Home Savings UI | `apps/frontend/src/components/ai/HomeSavingsCheckPanel.tsx` |
| Home Savings workspace | `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-savings/HomeSavingsToolClient.tsx` |
| Dashboard card | `apps/frontend/src/app/(dashboard)/dashboard/components/HomeSavingsCheckToolCard.tsx` |
| Save aggregation | `apps/frontend/src/app/(dashboard)/dashboard/save/FinancialEfficiencyClient.tsx` |
| Save redirects | `apps/frontend/src/app/(dashboard)/dashboard/save/page.tsx`, `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/save/page.tsx` |
| Property Context requirements | `apps/backend/src/modules/propertyContext/catalog/featureRequirementRegistry.ts` |
| Financial context | `apps/backend/src/services/financialContext/context.ts` |
| Home Savings API | `apps/frontend/src/lib/api/homeSavingsApi.ts` |
| Hidden Asset DTOs | `apps/backend/src/services/hiddenAssets/types.ts`, `apps/frontend/src/types/index.ts` |
| Analytics events | `apps/frontend/src/lib/analytics/events.ts` |

## Appendix B — Review Verification Baseline

The audit is based on static repository inspection as of July 28, 2026.

Observed validation baseline:

- no Hidden Asset program create/upsert/seed path was found outside the schema
  and read/evaluation service;
- available focused automated coverage is concentrated in worker refresh tests
  and generic route/CTA contracts;
- no dedicated backend test suite for program matching or Home Savings category
  math was found by filename search;
- the review does not assert the contents of an externally managed production
  database;
- the absence of a repository population path is still a product and
  operational gap even if production rows were inserted manually;
- live program availability, tax rules, utility offers, and legal requirements
  were intentionally not validated in this repository audit.
