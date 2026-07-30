# Property Intelligence and Briefings Capability Audit and Implementation Plan

**Capabilities:** Home Score, Home Risk Replay, Climate Risk, Neighborhood
Change Radar, Home Gazette, and Home Timeline<br>
**Contributing domains:** Home Record, Home Digital Twin, Status Board, Home
Actions, Environment Report, Home Event Radar, Incidents, Maintenance, Projects,
Claims, Insurance, Capital Timeline, Documents, Inventory, and Notifications<br>
**Audit framework:** `CAPABILITY_OUTCOME_AND_EXPERIENCE_AUDIT_FRAMEWORK.md`<br>
**Audit date:** July 29, 2026<br>
**Status:** Recommended implementation plan<br>
**Recommended disposition:** **Create one coherent property-intelligence
system; double down on Timeline and a delta-based Home Briefing; merge
authoritative climate context into Environment Report; reposition Neighborhood
Radar and Risk Replay as evidence-backed drill-downs; retire the composite Home
Score and replace its useful sharing workflow with a governed Property Brief**<br>
**Current safety classification:** All five registered capabilities are low
consequence; Home Score has no registered capability contract<br>
**Recommended safety classification:** Instance-based, ranging from low
consequence through safety-sensitive, material-financial, and
privacy-sensitive<br>
**Primary outcome family:** Property Intelligence and Briefings

---

## 1. Executive Decision

ContractToCozy has many of the ingredients for an excellent property
intelligence product, but it currently presents them as six overlapping mental
models:

- Home Score claims to summarize the home's health, risk, value protection,
  financial exposure, system state, data trust, improvement plan, and history;
- Risk Replay estimates how historical events may have stressed the home;
- Climate Risk generates regional hazard scores and financial implications;
- Neighborhood Change Radar estimates how external changes may affect value and
  livability;
- Home Gazette creates another ranked weekly summary of signals from across the
  product; and
- Home Timeline records and replays property history while also injecting
  transient analytical signals.

The overlap is not solved by placing all six tools behind one new dashboard.
That would create a seventh summary surface competing with Unified Home, Status
Board, Home Actions, Environment Report, the Digital Twin, and Capital
Timeline.

The homeowner job is:

> Tell me what changed in or around my home, explain why it matters using
> trustworthy evidence, help me act when action is warranted, and preserve a
> reliable history that I can use later.

The recommended product decision is:

1. make **Home Timeline** the canonical, evidence-aware history of things that
   actually happened to the property;
2. replace Home Gazette with a homeowner-language **Home Briefing** that
   summarizes only meaningful changes since the homeowner last engaged;
3. make **Environment Report** the authority for current environmental
   conditions and long-term hazard context;
4. reposition Risk Replay as **Past Hazard Exposure**, a specialized,
   source-backed view that distinguishes an event near the property from
   observed damage to the home;
5. reposition Neighborhood Change Radar as **Around Your Home**, a
   source-backed view of planning, infrastructure, land-use, and other local
   changes;
6. retire the current composite **Home Score**, including its proprietary grade
   and unsupported buyer-facing quality implication;
7. preserve the useful evidence, export, and controlled-sharing parts of Home
   Score as a **Property Brief**, built from selected verified facts, known
   history, coverage, and explicit unknowns;
8. introduce a common source-coverage and observation foundation before
   claiming that no external events were found;
9. create a canonical property change ledger so every source does not invent
   another ranking, deduplication, and notification system;
10. keep Home Actions as the sole authority for what needs attention;
11. keep Status Board as the current-state authority, Capital Timeline as the
    forward-looking lifecycle authority, and the Digital Twin as the scenario
    authority;
12. promote a briefing on Home only when there is a new, meaningful delta;
13. never use page refreshes, forced weekly editions, recomputed scores, or
    repeated replay runs as substitutes for real new value;
14. never treat unavailable sources as an all-clear; and
15. measure understood changes, verified history, and completed follow-through,
    not reports viewed or editions generated.

The target promise should be:

> See what changed, understand what it means for this home, take the right next
> step, and keep a trustworthy history.

### 1.1 Immediate trust decision

The current Climate Risk experience must not remain available in its current
form. Its service can:

- ask a generative model for category scores using only sparse property
  context;
- use state-level fallback heuristics for a small set of states and generic
  values elsewhere;
- present a simple average as an overall climate-risk score;
- claim premium changes such as 10–25% or 20–40%;
- claim property-value effects such as 2–8% or 5–15%; and
- infer that coverage is required, essential, or standard.

The response metadata correctly classifies the result as an educational
estimate, with partial or no grounding and `financialPlanningSafe: false`.
Those guardrails do not make the prominent numeric score or financial claims
safe. The standalone route should be disabled or redirected until the product
uses reviewed, authoritative hazard sources and evidence-bounded language.

Risk Replay and Neighborhood Change Radar also must not imply comprehensive
monitoring while their documented production path has no live provider ingest.
Fixtures and manually inserted canonical records are appropriate for testing,
not for homeowner coverage claims.

### 1.2 Implementation constraint

There are no real users and no production data migration requirement.

Implementation may change the Prisma schema directly. It must not create:

- database migration scripts;
- historical backfills;
- compatibility tables for obsolete score, replay, gazette, or signal models;
- dual-write behavior solely to preserve the current fragmented products;
- synthetic history, neighborhood changes, hazard events, editions, or source
  coverage; or
- legacy fields solely to keep unsupported grades, trends, or financial claims.

The user will reconcile the database separately after schema changes.

Use this constraint to establish clean truth layers and canonical ownership.
Do not preserve misleading output contracts for data that does not need to be
retained.

---

## 2. Scope and Portfolio Boundaries

### 2.1 In scope

| Area | Current responsibility | Target responsibility |
| --- | --- | --- |
| Home Score | Composite score, grade, system health, financial exposure, trust, actions, timeline, benchmarks, and buyer sharing | Retire composite score; preserve governed, evidence-based Property Brief generation and sharing |
| Home Risk Replay | User-triggered historical event matching and inferred home impact | Past Hazard Exposure drill-down with explicit source coverage and observed-impact follow-up |
| Climate Risk | AI/state-heuristic hazard score and financial implications | Retire route; merge sourced long-term hazard context into Environment Report |
| Neighborhood Change Radar | Stored local events, geographic matching, inferred value/livability impact | Around Your Home observation feed with live reviewed sources, factual lifecycle, and bounded relevance |
| Home Gazette | Weekly independently ranked AI digest with a four-story minimum | Delta-based Home Briefing using canonical changes and Home Action priority |
| Home Timeline | Durable property events plus inferred events and projected signals | Canonical property history with evidence, provenance, revisions, grouping, and honest date precision |
| Source coverage | Fragmented or absent | Shared registry of providers, geography, freshness, fetch health, and checked-through time |
| Property changes | Re-derived by each product | Canonical change ledger referencing source-of-truth records |

### 2.2 Adjacent but not owned

- **Unified Home** owns the ranked home overview. It shows a briefing only when
  a material new change exists.
- **Home Actions** owns what needs attention, priority, due dates, household
  coordination, and completion.
- **Status Board** owns the current state of systems, risks, costs, maintenance,
  and coverage.
- **Home Record, Inventory, and Documents** own canonical facts and evidence.
- **Home Digital Twin** owns “what if” scenarios and modeled consequences.
- **Capital Timeline** owns forward-looking system lifecycle and capital timing.
- **Environment Report** owns current environmental conditions, environmental
  preparation, and long-term hazard context.
- **Home Event Radar and Incidents** own active, time-sensitive external signals
  and safety workflows.
- **Claims, Projects, Maintenance, Expenses, and Insurance** own their durable
  domain records.

Property Intelligence references these authorities. It does not recalculate or
replace them.

### 2.3 Explicit non-goals

This plan does not recommend:

- a new permanent “intelligence dashboard” above the canonical product
  surfaces;
- a single number that claims to measure overall home quality, safety, risk, or
  value;
- predicting property damage from a nearby event;
- predicting premiums or property-value changes from generic hazard categories;
- treating regional exposure as a parcel-specific finding;
- treating a homeowner-entered date as authoritative;
- generating filler stories to maintain a weekly publishing cadence;
- notifying the homeowner when nothing material changed;
- placing Home Briefing permanently at the top of Home;
- turning every analytical change into a durable Timeline event;
- making an external observation part of property history unless the property
  effect is observed, confirmed, or otherwise appropriate to record; or
- representing a shared Property Brief as an inspection, appraisal,
  certification, disclosure, or professional opinion.

---

## 3. Repository-Backed Current-State Map

### 3.1 Registered capability contracts

| Capability | Outcome | Release | Safety | Completion | Mode |
| --- | --- | --- | --- | --- | --- |
| Climate Risk | `PROTECT_MONITOR` | Beta | Low consequence | Output viewed | Catalog only |
| Home Gazette | `PROTECT_MONITOR` | Active | Low consequence | Output viewed | Catalog only |
| Home Risk Replay | `UNDERSTAND_HOME` | Active | Low consequence | Output viewed | Contextual |
| Neighborhood Change Radar | `PROTECT_MONITOR` | Beta | Low consequence | Output viewed | Contextual |
| Home Timeline | `PLAN_BUDGET` | Active | Low consequence | Plan created | Catalog only |
| Home Score | **Not registered** | N/A | N/A | N/A | N/A |

The contracts reveal several governance gaps:

- Home Score has a large authenticated report, public share route, buyer
  preview, API surface, analytics taxonomy, and extensive persistence but no
  capability contract;
- Timeline is not a plan and does not complete when a plan is created;
- output viewed is not a meaningful outcome for a monitoring or briefing
  capability;
- Risk Replay is contextual without a sufficiently bounded trigger and can be
  promoted from a generic safety signal;
- all capabilities are classified low consequence even when they can influence
  safety preparation, insurance, property value, or buyer perception;
- registered descriptions do not identify source-coverage requirements; and
- no relationship contract explains which product owns current state, history,
  action priority, or environmental truth.

### 3.2 Current conceptual overlap

| Homeowner question | Current competing answers |
| --- | --- |
| How healthy is my home? | Home Score, Status Board, Digital Twin, system health views |
| What risks matter? | Home Score, Climate Risk, Risk Replay, Environment Report, Home Event Radar |
| What changed? | Gazette, Timeline, score trend, Neighborhood Radar, Status Board |
| What should I do? | Home Score improvement plan, Gazette ranking, Radar recommendations, Home Actions |
| What happened before? | Timeline, Risk Replay, Home Score timeline, Gazette history |
| What can I share? | Home Score buyer report, Gazette public share, Timeline/export-adjacent records |
| What is happening around me? | Climate Risk, Environment Report, Home Event Radar, Neighborhood Radar |

The result is not richer intelligence. It is duplicated interpretation with
different scopes, confidence rules, ranking formulas, and empty-state claims.

### 3.3 Current data flow

```text
Property/domain records
  ├─ Property score snapshots ─────────────► Home Score report + grade
  ├─ Stored HomeRiskEvent records ─────────► manually triggered Risk Replay runs
  ├─ sparse property context ──────────────► AI/state Climate Risk estimate
  ├─ stored NeighborhoodEvent records ─────► property matches + heuristic impact
  ├─ eight independently queried domains ─► Gazette candidates + new ranking
  └─ HomeEvent + projected signals ────────► Timeline / Replay presentation

Each surface:
  ranks or summarizes independently
  owns a different history
  invents a different completion signal
  presents a different empty state
```

There is no common definition of:

- a source observation;
- checked coverage;
- a property match;
- inferred relevance;
- an observed property outcome;
- a meaningful change;
- changed since last seen;
- materiality;
- canonical action priority; or
- what belongs in durable property history.

---

## 4. Capability Findings and Dispositions

### 4.1 Home Score

#### Current strengths

- substantial report assembly and persistence;
- evidence links, data-source runs, integrity checks, forecasts, benchmarks,
  correction workflows, export jobs, share tokens, and buyer preview;
- attempts to expose confidence and data completeness;
- includes useful system summaries and improvement opportunities; and
- demonstrates demand for a concise, shareable property artifact.

#### Material gaps

1. **It combines unlike concepts.** Health and risk scores are averaged into a
   single score and grade. Maintenance state, record completeness, hazard
   exposure, system condition, and financial risk are not interchangeable
   dimensions.
2. **It duplicates canonical products.** Current system state belongs to Status
   Board; facts and evidence belong to Home Record; lifecycle belongs to
   Capital Timeline; actions belong to Home Actions; history belongs to
   Timeline.
3. **Its numeric precision exceeds its evidence.** Score trends can reflect
   changes in input completeness or system computation rather than a real
   improvement or deterioration in the home.
4. **The grade creates a buyer-risk problem.** A public or buyer-facing score
   can be mistaken for an inspection, certification, appraisal, disclosure, or
   objective property-quality rating.
5. **“Money at risk” is an especially strong claim.** It can make modeled
   exposure look like an expected loss.
6. **Verification is too broad.** A system-computed result can be treated as
   verified, and the existence of evidence documents does not prove that a
   document supports a particular fact.
7. **The improvement plan creates another action backlog.**
8. **The embedded timeline creates another history view.**
9. **The route is absent from capability governance.**
10. **Revisit value is synthetic.** A recomputed score is not necessarily a new
    homeowner event.

#### Disposition

**Retire and reposition.**

- Remove the composite score, grade, overall trend, “money at risk” headline,
  and buyer-quality framing.
- Move current-state summaries to their canonical owners.
- Convert the useful artifact-generation and access-control machinery into a
  governed **Property Brief**.
- The Property Brief should contain selected verified facts, important known
  history, open unknowns, source dates, evidence links, and explicit
  exclusions.
- If completeness is shown, call it **record coverage** or **information
  readiness**, not home health, quality, safety, or value.
- A shared brief must state that it is homeowner-assembled information, not an
  inspection, appraisal, certification, title report, or disclosure.

### 4.2 Home Risk Replay

#### Current strengths

- deterministic matching and scoring rather than unbounded generative
  reasoning;
- property-context snapshots support explainability;
- configurable historical windows;
- an appropriate “may have affected” framing in several UI areas; and
- a useful concept: connect past external hazards with current inspection and
  maintenance needs.

#### Material gaps

1. The documented MVP has no live provider ingestion.
2. A zero-result state can say no significant events were found without proving
   source or time-window coverage.
3. The engine can infer that a roof or system was “likely stressed” based on
   present-day vulnerability, without evidence of historical damage.
4. A nearby event, a property match, inferred stress, observed damage, a claim,
   and a completed repair are not modeled as separate truth states.
5. Manual “Replay history” and repeated saved runs create artificial revisit
   behavior when neither source events nor property facts changed.
6. Generic recommended actions can duplicate Home Actions.
7. Run history is an analysis history, not property history.

#### Disposition

**Reposition as a specialized Past Hazard Exposure drill-down.**

- Keep deterministic event matching.
- Require reviewed source coverage before production availability.
- Show what sources and years were checked.
- Separate “event occurred in the area,” “property geographically matched,”
  “home may be more vulnerable,” and “effect on home confirmed.”
- Ask a bounded follow-up such as “Was damage observed?” and allow a claim,
  inspection, photo, repair, or no-observed-effect record.
- Recompute automatically only when an event, property fact, or evidence record
  changes.
- Promote only a resulting inspection, documentation, or maintenance need
  through Home Actions.
- Add a Timeline entry only for a confirmed property event or outcome, not for
  running the analysis.

### 4.3 Climate Risk

#### Current strengths

- response metadata acknowledges educational-estimate status;
- attempts to show confidence and grounding;
- covers a useful set of hazards; and
- recognizes that longer-term exposure can affect home protection decisions.

#### Material gaps

1. Scores can be generated from city, state, and dwelling type rather than
   authoritative parcel-appropriate sources.
2. Fallback logic is meaningfully tailored only for a few states and generic
   elsewhere.
3. Averaging unrelated hazard scores into one climate number is not a sound
   homeowner decision model.
4. Generated historical trends may not correspond to a fetched historical
   dataset.
5. Premium and property-value ranges are presented without quote, carrier,
   actuarial, appraisal, or market evidence.
6. Coverage language can sound binding.
7. A mock analyzer can create fabricated financial exposure and probability.
8. The route duplicates the stronger Environment Report, which already has
   authoritative-source, freshness, graceful-degradation, and property-aware
   preparation contracts.

#### Disposition

**Retire the standalone capability and merge credible scope into Environment
Report.**

- Disable the current output and remove unsupported financial claims.
- Add a long-term hazard context view to Environment Report using reviewed
  authoritative providers.
- Present hazard-specific exposure, geography, time horizon, source date, and
  limitations; do not average them into one score.
- Separate external hazard exposure from property vulnerability and current
  active conditions.
- Use Home Event Radar/Incidents for active alerts and Home Actions for
  preparation.
- Treat insurance or property-value implications as questions to investigate,
  not numeric predictions, unless supported by a qualified source.

### 4.4 Neighborhood Change Radar

#### Current strengths

- a canonical event and property-match concept;
- coordinates, event-type radii, confidence, freshness, and deterministic
  impact logic;
- duplicate prevention and event revisions in parts of the pipeline;
- support for positive and negative external changes; and
- a valuable distinct homeowner job: understand changes outside the parcel.

#### Material gaps

1. The documented implementation has no live external-provider ingestion.
2. A property without coordinates can be assigned an assumed distance of 0.5
   miles based only on city/state co-location.
3. The UI can imply continuous monitoring and notification without proving
   source coverage.
4. Generic rules infer value and livability impacts without local market or
   household preference evidence.
5. Proposal, approval, construction, completion, cancellation, and stale status
   are not consistently presented as the central factual lifecycle.
6. “No major changes detected” can imply all-clear.
7. Save, follow, dismiss, and “not relevant to me” controls are incomplete.
8. The worker can recompute stored records without actually discovering new
   records.
9. Some Gazette collection/deep-link behavior does not align with the canonical
   relation or route.
10. Prior production fixture exposure demonstrates the need for reviewed-source
    gates and environment guardrails.

#### Disposition

**Improve and merge into an “Around Your Home” intelligence view.**

- Retain a focused list/map drill-down after live reviewed sources exist.
- Require precise coordinates for distance-based claims; otherwise label the
  match at its actual coarse geography and do not invent mileage.
- Focus on factual local changes such as planning/zoning, infrastructure,
  flood-map changes, school-boundary changes, land use, and major public works.
- Separate the source fact and lifecycle from inferred homeowner relevance.
- Allow the homeowner to follow, dismiss, or mark a topic irrelevant.
- Show only material updates since the last view in Home Briefing.
- Do not predict property value without direct, appropriately governed market
  evidence.

### 4.5 Home Gazette

#### Current strengths

- a cross-domain signal collector;
- durable edition, story, trace, generation-job, and share-link models;
- deterministic fallback when editorial AI is unavailable;
- ranking, deduplication, expiration, and validation stages;
- a useful recurring-delivery concept; and
- the potential to reduce the need to visit multiple tools.

#### Material gaps

1. It creates a second priority system rather than consuming Home Action
   priority.
2. A four-story minimum encourages filler or causes a meaningful one-item
   briefing to be skipped.
3. “Quiet week” or “nothing urgent” can mean insufficient qualified records or
   failed source collection, not a verified lack of urgent issues.
4. Partial `Promise.allSettled` source failures are not adequately disclosed.
5. Raw domain queries re-derive signal meaning and can drift from source
   products.
6. A stored Home Score snapshot receives high confidence merely because the
   snapshot exists.
7. Some source deep links are obsolete or noncanonical.
8. The neighborhood collector does not consistently load the related source
   event needed to populate the story.
9. A forced weekly cadence creates a reason for the system to publish, not a
   reason for the homeowner to read.
10. Public sharing of a multi-domain briefing can expose sensitive incidents,
    claims, financial, or household information.
11. Edition history is a delivery archive and must not be confused with
    property history.
12. “AI-enriched newspaper” is product mechanics, not homeowner value.

#### Disposition

**Double down on the delivery concept and replace the implementation contract.**

Rename the homeowner experience **Home Briefing**:

- publish on meaningful change, not story count;
- allow zero, one, or several briefing items;
- organize by “Needs attention,” “What changed,” “Looking ahead,” “Around your
  home,” and “Record updates”;
- consume canonical Property Changes and Home Actions instead of raw domain
  tables;
- preserve source-owned rank and lifecycle;
- explain why each item is included and what changed;
- deep-link to the canonical source or action;
- offer immediate, weekly, monthly, and important-only preferences;
- notify only when the selected cadence and materiality warrant it;
- show source health when a quiet summary is requested;
- keep delivery/read history separate from Home Timeline; and
- make sharing private and selective by default.

### 4.6 Home Timeline

#### Current strengths

- a durable `HomeEvent` model with date, type, subtype, importance, visibility,
  money/value fields, provenance, confidence, guidance, retrospective context,
  documents, and typed domain relationships;
- property-scoped authorization and contributor roles;
- list, visual, and replay presentations;
- automatic event creation from several canonical domains;
- support for manual history capture; and
- the strongest natural revisit loop in this family: the property accumulates a
  useful history over time.

#### Material gaps

1. The capability is misclassified as planning with “plan created”
   completion.
2. Projected shared signals such as maintenance adherence, coverage gaps,
   savings realization, and financial discipline can be injected alongside
   real property events.
3. Synthetic purchase events can use a record creation date when the actual
   purchase or installation date is unknown.
4. Observed, user-reported, inferred, system-computed, and projected records are
   not sufficiently distinct in the main experience.
5. The visual “Replay” terminology overlaps Risk Replay even though one should
   represent property history and the other external hazard exposure.
6. Repeated generated events can create noise instead of a coherent project,
   claim, or renovation story.
7. Edit/delete behavior needs stronger provenance and revision policy for
   system-generated or evidence-backed events.
8. Home Score and Gazette maintain competing timeline/history presentations.

#### Disposition

**Double down and make Timeline the canonical property-history authority.**

- Introduce explicit observation types and date precision.
- Keep transient analytical signals out of Timeline by default.
- Group child milestones beneath a claim, project, renovation, incident, or
  system lifecycle.
- Treat corrections as revisions with provenance for governed events.
- Make evidence, source, confidence, exact/estimated date, and verification
  visible.
- Support manual history capture and evidence attachment.
- Add annual recap and governed export without inventing a score.
- Rename its presentation control from “Replay” to “Story” or “Playback” to
  avoid collision with Past Hazard Exposure.
- Add confirmed external-event outcomes to Timeline; do not add mere geographic
  matches or analysis runs.

---

## 5. Functional Completeness and Experience Audit

### 5.1 Portfolio score

| Framework dimension | Score | Maximum | Finding |
| --- | ---: | ---: | --- |
| Homeowner value clarity | 12 | 20 | Useful concepts, but six overlapping promises obscure the job |
| Functional completeness | 8 | 20 | Timeline is substantial; external-source and delta foundations are incomplete |
| Actionability and lifecycle | 7 | 15 | Each surface creates partial actions or ranking without one lifecycle |
| Trust, safety, and evidence | 5 | 15 | Climate claims and unsupported coverage are launch-blocking |
| UX and progressive disclosure | 8 | 15 | Rich screens, but summaries, scores, filters, and technical states dominate |
| Product-framework conformance | 4 | 10 | Duplicate priority/history systems and incorrect capability contracts |
| Reliability and operability | 3 | 5 | Jobs and persistence exist, but source health is not a homeowner truth boundary |
| **Total** | **47** | **100** | **Reposition and consolidate before further surface expansion** |

The low score does not mean the codebase lacks depth. It means substantial
depth is organized around outputs—scores, runs, editions, matches, and
views—rather than a coherent homeowner outcome and trustworthy observation
chain.

### 5.2 Homeowner question contract

| Homeowner question | Current answer | Target answer |
| --- | --- | --- |
| What is this? | Six tools with overlapping summaries | One system that explains changes, context, and property history |
| How does it benefit me? | Monitor, score, replay, or read | Avoid surprises, act on meaningful change, and retain a reliable record |
| What must I add? | Scattered property facts; limited explanation | Ask only for a fact that materially improves an active interpretation |
| What should I care about? | Several independent rankings | Home Actions for attention; Briefing for meaningful changes |
| What can I control? | Filters, reruns, refreshes, and shares | Follow topics, set cadence/channels, confirm outcomes, correct facts, control sharing |
| Can I trust “nothing found”? | Often unclear | Coverage, checked-through date, failed sources, and limitations shown |
| What happened to my home? | Mixed history and analytical signals | Timeline of observed/reported events with evidence and date precision |
| What happened near my home? | Risk Replay and Neighborhood matches | External observations clearly separated from property effects |
| What changed since last time? | Forced edition or score trend | Canonical delta from last seen or delivered state |

### 5.3 Current revisit-value diagnosis

| Capability | Current revisit mechanism | Why it is weak | Target revisit trigger |
| --- | --- | --- | --- |
| Home Score | Recomputed score/trend | Calculation change may not represent a real-world change | No standalone revisit; generate a brief on demand |
| Risk Replay | Manual rerun/run history | Same inputs create another analysis record | New event coverage, property fact, or evidence |
| Climate Risk | Regenerate AI result | Nondeterminism can look like environmental change | Reviewed source refresh or material hazard update |
| Neighborhood Radar | Recompute stored events | No live ingest means no new discovery | New or materially changed source observation |
| Gazette | Weekly publication | Calendar cadence can force noise | Meaningful delta within user-selected cadence |
| Timeline | New events | Natural and durable | Verified/reported event, milestone, correction, or annual recap |

### 5.4 Severity-ranked findings

#### P0 — Trust and safety

- Climate Risk presents unsupported numeric and financial implications.
- External monitoring can appear comprehensive without reviewed live sources.
- Zero-result language can be interpreted as all-clear.
- Geographic co-location can be converted into invented 0.5-mile precision.
- A nearby hazard can be mistaken for damage to the home.
- A shared score can be mistaken for a professional property assessment.

#### P1 — Product architecture

- Home Score is unregistered and duplicates several canonical capabilities.
- Gazette, Home Score, and source tools create competing priority systems.
- Timeline mixes durable history with transient analytical signals.
- There is no canonical change ledger or shared source-coverage contract.
- Property, environmental, neighborhood, and delivery histories are conflated.

#### P2 — Homeowner experience

- Tool names and technical mechanics lead before homeowner value.
- Re-run, refresh, filter, edition, score, and trend controls substitute for
  meaningful next steps.
- Missing facts are not consistently requested in the context of their benefit.
- Source failure, no coverage, no match, and no material change are not
  consistently distinct.
- Controls over cadence, followed topics, relevance, and selective sharing are
  incomplete.

#### P3 — Operations and measurement

- Page views and generated outputs are treated as completion.
- Provider coverage and source health are not common launch gates.
- Duplicate changes and notifications can emerge from parallel pipelines.
- There is no portfolio-wide measure of briefing usefulness or historical
  verification.

---

## 6. Target Product Architecture

### 6.1 Canonical question ownership

| Question | Canonical owner |
| --- | --- |
| What needs attention now? | Home Actions |
| What is the current state of my home? | Status Board |
| What facts and evidence describe my home? | Home Record, Inventory, Documents |
| What might wear out and when? | Capital Timeline |
| What if I make a change? | Home Digital Twin |
| What changed since I last checked? | Home Briefing |
| What actually happened to my home? | Home Timeline |
| What environmental conditions matter now? | Environment Report and active Incidents |
| What is the home's long-term hazard context? | Environment Report |
| What hazards occurred near the property in the past? | Past Hazard Exposure |
| What is changing around the property? | Around Your Home |
| What can I safely share? | Governed Property Brief |

### 6.2 Target experience topology

```text
Unified Home
  ├─ ranked Home Actions
  └─ new Home Briefing card only when meaningful change exists
                              │
                              ▼
Home Briefing
  ├─ Needs attention ─────────► canonical Home Action
  ├─ What changed ────────────► source record / Status Board / Home Record
  ├─ Looking ahead ───────────► Capital Timeline
  ├─ Around your home ────────► Environment / Neighborhood / Past Exposure
  └─ Record updates ──────────► Home Timeline

Home Timeline
  └─ durable property events, milestones, evidence, and corrections

Property Brief
  └─ on-demand, access-scoped selection of verified facts and history
```

This topology consolidates the outcome without making one route own every
detail.

### 6.3 Truth layers

Every external-intelligence path must preserve these distinct layers:

1. **Source observation:** a provider states that an event or change exists.
2. **Coverage:** the provider was checked for a particular geography and time
   range.
3. **Property match:** the property is within a known, explicitly described
   geography.
4. **Inferred relevance:** known property or household context suggests the
   observation may matter.
5. **Observed property effect:** the homeowner or trusted evidence records an
   actual effect.
6. **Verified outcome:** a claim, inspection, repair, project, official record,
   or other governed source confirms what happened.

Language and UI must never collapse these layers.

Example:

> A severe hail event was recorded within 2.1 miles on May 9. Because the roof
> age is unknown, we cannot estimate how vulnerable it was. We have no record
> of damage to this home. Add the roof installation year, record that no damage
> was observed, or attach an inspection.

### 6.4 Canonical data contracts

#### Source coverage

```text
IntelligenceSource
  id
  family
  provider
  reviewedStatus
  termsVersion
  supportedObservationTypes
  refreshPolicy
  enabledEnvironments

IntelligenceSourceCoverage
  sourceId
  geographyType
  geographyKey / geometry
  validFrom
  validThrough
  checkedThrough
  coverageLimitations
  status

IntelligenceSourceRun
  sourceId
  startedAt
  completedAt
  status
  recordsRead
  recordsAccepted
  recordsRejected
  coverageUpdated
  failureCode
```

#### External observations and property assessment

```text
IntelligenceObservation
  sourceId
  externalId
  observationType
  lifecycleStatus
  observedAt / effectiveFrom / effectiveTo
  geography / geometry
  sourceUrl
  sourcePublishedAt
  lastVerifiedAt
  revision
  factualPayload

PropertyObservationMatch
  propertyId
  observationId
  matchMethod
  distance / overlap
  geographicPrecision
  matchConfidence

PropertyImpactAssessment
  propertyMatchId
  rulesVersion
  affectedEntities
  relevance
  materiality
  confidence
  knownFactsUsed
  missingFacts
  boundedExplanation
  supersededAt
```

#### Change ledger and briefing

```text
PropertyChange
  propertyId
  sourceType
  sourceEntityId
  sourceRevision
  changeType
  occurredAt
  detectedAt
  materiality
  canonicalActionId?
  canonicalEventId?
  deduplicationKey

PropertyChangeAudienceState
  propertyChangeId
  userId
  firstDeliveredAt?
  lastDeliveredAt?
  seenAt?
  dismissedAt?

HomeBriefing
  propertyId
  userId
  periodStart
  periodEnd
  generatedAt
  sourceHealthSnapshot
  deliveryStatus

HomeBriefingItem
  briefingId
  propertyChangeId
  canonicalActionId?
  section
  explanationSnapshot
  sortOrder
```

A briefing item references truth. It does not become another independent truth
record.

#### Timeline truth

Add or normalize:

- `observationKind`: observed, user-reported, evidence-derived, inferred, or
  system-generated;
- `datePrecision`: exact date, month, year, range, or unknown;
- `verificationStatus`;
- `supersedesEventId` or a revision relation;
- `parentEventId` or a typed event-group relation;
- explicit source and evidence relations; and
- a rule that analytical projections do not enter the canonical history.

### 6.5 Safety classification

| Instance | Recommended tier |
| --- | --- |
| Reading a verified past maintenance event | Low consequence |
| Editing a homeowner-reported date | Low consequence with audit |
| Severe active environmental preparation | Safety-sensitive |
| Inferring possible historical structural stress | Safety-sensitive |
| Suggesting insurance or value implications | Material financial |
| Sharing claims, incidents, financial information, or household details | Privacy-sensitive / material |
| Publishing official permit, flood, or hazard status | Regulated or safety-sensitive depending on use |

Safety tier must derive from the observation and recommended action, not only
from the route.

---

## 7. Target Homeowner Experience

### 7.1 Home placement

Do not show a permanent Property Intelligence or Home Briefing card merely to
advertise monitoring.

Show a card only when:

- a new material change has not been seen;
- a canonical action has been created from that change;
- a requested briefing is ready; or
- an annual/ownership recap is available and useful.

Card anatomy:

- homeowner outcome first;
- one concrete change or a concise count;
- why it matters;
- source/freshness in progressive disclosure;
- one primary action;
- “Review briefing” as a secondary action; and
- no operational statuses such as job pending, edition skipped, sources
  collected, or replay ready.

### 7.2 Home Briefing

Header:

> What changed for 94 Ashford Dr

Subhead:

> A short summary of new information since your last review. We only include
> changes that may affect a decision, action, or home record.

Sections appear only when populated:

- **Needs attention**
- **What changed**
- **Looking ahead**
- **Around your home**
- **Added to your home history**

Every item answers:

- What changed?
- Why might it matter for this home?
- Is this fact, inference, or confirmed outcome?
- What should I do, if anything?
- Where did it come from and when was it checked?

The empty state must distinguish:

- no meaningful changes across successfully checked sources;
- no configured source coverage;
- some sources unavailable;
- briefing not yet due under user preference; and
- no prior baseline.

### 7.3 Around Your Home

Default hierarchy:

1. followed changes with material updates;
2. new relevant changes;
3. proposed/upcoming changes;
4. recently completed changes;
5. dismissed or no-longer-relevant changes.

Each card shows:

- source fact and official lifecycle first;
- actual geography or distance precision;
- possible relevance separately;
- source, source date, and last checked;
- follow, dismiss, not relevant, and open source;
- no unsupported property-value prediction; and
- a clear statement when the product cannot determine impact.

### 7.4 Past Hazard Exposure

Default hierarchy:

1. event evidence and match;
2. what is known about this property's outcome;
3. property facts that may affect vulnerability;
4. missing fact that would improve interpretation;
5. next step only when warranted.

Controls:

- time range;
- hazard type;
- source coverage details;
- confirm no observed damage;
- record observed damage;
- link claim, inspection, repair, photo, or document; and
- correct property facts.

Remove “run again.” Use “Check for new source updates” only when the source has
actually advanced or a retryable fetch failed.

### 7.5 Home Timeline

Default hierarchy:

- year and major event groups;
- verified/observed events before inferred items;
- projects, claims, incidents, and system lifecycles as grouped stories;
- estimated dates visibly marked;
- source and evidence expandable;
- correction history available; and
- transient analytics excluded by default.

Useful controls:

- add past event;
- add evidence;
- correct a date or description;
- filter by system, event type, and evidence status;
- show estimates;
- export selected history; and
- create an annual recap.

### 7.6 Property Brief

Property Brief is generated on demand for a declared purpose:

- homeowner reference;
- contractor or service professional;
- household/trusted contact;
- insurer/claim support; or
- prospective buyer, subject to explicit warnings and selection.

The homeowner selects sections. The preview shows exactly what recipients can
see. Access has:

- expiration;
- revoke control;
- access log;
- download policy;
- sensitive-field warnings;
- source and as-of dates; and
- a conspicuous limitation statement.

There is no overall grade.

---

## 8. Recommended Implementation Sequence

### Slice 0 — Trust containment and route decisions

**Goal:** Stop unsafe or misleading output before consolidation.

Work:

- disable or redirect the standalone Climate Risk route;
- remove unsupported premium, coverage, property-value, and financial-exposure
  claims;
- prevent the mock climate analyzer from serving production output;
- gate Risk Replay and Neighborhood Change Radar on reviewed live coverage;
- replace all-clear empty states with coverage-aware language;
- remove assumed 0.5-mile neighborhood distance;
- stop treating a stored score snapshot as fully confident;
- stop Home Score public/buyer sharing until the Property Brief policy exists;
- correct broken Gazette source relations and canonical deep links;
- distinguish Gazette source failure from a quiet period;
- label Timeline inferred dates and hide transient shared signals by default;
- audit all dummy/fixture ingest flags and production startup guards; and
- add observability for blocked output and source-health state.

**Exit gate:** No homeowner can receive an unsupported climate financial claim,
false all-clear, fabricated distance, fixture-derived event, or ungoverned
buyer score.

### Slice 1 — Portfolio contract and canonical ownership

**Goal:** Encode the product decision before building a new UI.

Work:

- register the replacement Property Brief/Home Briefing capabilities;
- retire Home Score and Climate Risk capability contracts;
- reclassify Timeline under `UNDERSTAND_HOME`;
- replace page-view and plan-created completion signals;
- define instance-based safety;
- define contextual triggers for briefing, past exposure, and neighborhood
  change;
- publish the canonical question-ownership matrix;
- define route redirects and feature-flag behavior;
- remove duplicate Home placements and recommendation candidates; and
- update tool catalog language and related-capability relationships.

**Exit gate:** Capability inventory, routes, analytics, and discovery rules
express one coherent product architecture.

### Slice 2 — Source coverage and observation foundation

**Goal:** Make “what was checked” part of the data contract.

Work:

- add the source, coverage, run, observation, revision, match, and impact models;
- build provider adapter contracts and ingestion validation;
- require reviewed-source activation per environment;
- implement exact geospatial matching and honest coarse-geography fallback;
- preserve source fact separately from inferred relevance;
- implement deduplication by provider identity and revision;
- add freshness, staleness, health, and checked-through calculations;
- expose coverage and degraded-state APIs;
- add admin source-health and record-review tooling; and
- prohibit production enablement without source, terms, coverage, and QA review.

**Exit gate:** Every external result and zero state can explain its source,
geography, time coverage, freshness, and limitations.

### Slice 3 — Canonical property change ledger

**Goal:** Give briefings and notifications one delta source.

Work:

- add `PropertyChange` and per-user audience state;
- emit changes from canonical domain events and record revisions;
- reference, rather than copy, the source entity;
- define materiality and deduplication contracts;
- distinguish occurred, detected, delivered, seen, dismissed, and superseded;
- relate a change to a canonical Home Action when one exists;
- prevent source products from creating competing notification candidates;
- add idempotency and replay-safe processing; and
- add inspection tools for why a change did or did not become briefing-worthy.

**Exit gate:** The same source revision produces at most one canonical change
and one governed action, regardless of how many surfaces consume it.

### Slice 4 — Timeline truth hardening

**Goal:** Establish a trustworthy durable history.

Work:

- add observation kind, date precision, verification, revision, and grouping;
- remove projected/current analytical signals from default history;
- replace false exact dates with year/month/range/unknown precision;
- group claim, project, renovation, incident, and system milestones;
- define create, correct, supersede, and delete permissions;
- support evidence attachment and source inspection;
- add homeowner confirmation flows for inferred records;
- update automated event writers to the new contract;
- replace overlapping “Replay” wording;
- add selected export and annual recap; and
- update Timeline completion to a verified/reported event or useful history
  action, not plan creation.

**Exit gate:** A homeowner can tell what happened, how it is known, when it
happened, and whether the date or claim is exact.

### Slice 5 — Environment and Past Hazard Exposure

**Goal:** Replace speculative climate scoring with evidence-backed context.

Work:

- add long-term hazard context within Environment Report;
- integrate only reviewed authoritative sources;
- present hazard-specific exposure without a composite average;
- reuse common coverage and observation models;
- separate current conditions, long-term exposure, and past event history;
- convert Risk Replay to the Past Hazard Exposure view;
- add confirmed/no-observed/unknown property-effect states;
- link claims, inspections, repairs, photos, and documents;
- promote a canonical action only when evidence and materiality warrant it; and
- add safety-reviewed copy and degraded states.

**Exit gate:** Past and future hazard context is sourced, bounded, and never
presented as actual property damage without evidence.

### Slice 6 — Around Your Home

**Goal:** Deliver credible local-change intelligence.

Work:

- activate a small, reviewed pilot geography and source set;
- ingest factual lifecycle updates from planning, infrastructure, land-use, or
  similar sources;
- implement map/list presentation with accurate geography;
- show proposed, approved, active, completed, cancelled, and stale states;
- keep relevance and impact inference separate;
- support follow, dismiss, and not-relevant controls;
- generate a change only for new or materially revised observations;
- add source coverage and admin quality dashboards; and
- prohibit generic value prediction.

**Exit gate:** The product discovers real changes, explains exactly where they
came from, and does not overstate effect on the home.

### Slice 7 — Home Briefing

**Goal:** Replace forced Gazette editions with meaningful delta delivery.

Work:

- consume Property Changes and canonical Home Actions;
- remove the four-story minimum and independent ranking formula;
- generate zero-to-many items based on materiality and user preference;
- implement immediate, weekly, monthly, and important-only cadence;
- add topic and channel controls;
- snapshot source health for quiet/degraded statements;
- use homeowner-language, deterministic summaries as the trusted baseline;
- use generative editing only within validated facts and with fallback;
- deep-link every item to its canonical owner;
- track delivered, opened, seen, acted, dismissed, and not-useful;
- preserve edition history only as a delivery archive;
- replace public whole-edition sharing with explicit selected sharing; and
- show a Home card only for an unread material briefing.

**Exit gate:** Every briefing item represents a real new delta, retains source
lineage, and either informs a decision or leads to the canonical next step.

### Slice 8 — Governed Property Brief

**Goal:** Preserve the valuable sharing outcome without a misleading score.

Work:

- retire the Home Score route, score, grade, benchmarks, trend, and parallel
  action/timeline panels;
- define purpose-specific brief templates;
- source only selected canonical facts, history, documents, and open unknowns;
- require evidence support at the field or event level;
- show as-of dates, record coverage, and explicit exclusions;
- add recipient preview, expiration, revoke, access log, and download policy;
- prevent sensitive defaults;
- add buyer/professional limitation language;
- update share analytics and completion; and
- redirect old Home Score links to Property Brief or canonical views.

**Exit gate:** A recipient cannot reasonably mistake the brief for an
inspection, appraisal, certification, or comprehensive disclosure.

### Slice 9 — Unified experience and discovery

**Goal:** Complete the homeowner journey without creating another permanent
dashboard.

Work:

- add meaningful-change Home cards and suppress passive monitoring cards;
- add Property Intelligence grouping in tool discovery without duplicating
  canonical destinations;
- update related tools and contextual entry points;
- connect source-specific views back to Home Briefing, Timeline, and Home
  Actions;
- add contextual missing-fact capture with benefit explanation;
- standardize source, freshness, confidence, and limitation disclosure;
- complete responsive, keyboard, screen-reader, and reduced-motion behavior;
- remove obsolete score, gazette, climate, and replay UI/code paths; and
- update support, knowledge, product, and operational documentation.

**Exit gate:** A homeowner can enter from a change, understand it, act, confirm
the outcome, and see the verified history without navigating competing summary
surfaces.

### Slice 10 — Measurement, pilots, and launch governance

**Goal:** Prove that intelligence is useful and trustworthy.

Work:

- pilot external sources by reviewed geography;
- establish source freshness and coverage SLOs;
- measure briefing usefulness and action follow-through;
- review false positives, false all-clears, and unsupported impact language;
- add source kill switches and per-provider rollback;
- run safety and privacy review for sharing and hazard language;
- audit duplicate actions, changes, events, and notifications;
- define launch gates by source family, not route completeness; and
- remove old models and flags after acceptance.

**Exit gate:** Each launched source family meets coverage, freshness, trust,
usefulness, and operational-response thresholds.

---

## 9. Detailed Engineering Plan

### 9.1 Backend

- Create `propertyIntelligence` modules for source registry, ingestion,
  coverage, observation revisions, matching, impact assessment, change
  emission, and briefing selection.
- Make provider adapters return typed factual observations and coverage, not
  homeowner copy.
- Centralize source review, environment enablement, retry, quarantine, and
  kill-switch policy.
- Use database uniqueness for provider/source identity, observation revision,
  property match, property change, and audience delivery.
- Build a deterministic change explanation contract before optional editorial
  generation.
- Make Home Action promotion consume the same property change and retain its
  source ID.
- Refactor Home Events writers into an explicit Timeline service contract.
- Remove Climate Risk predictor and mock analyzer from homeowner-serving paths.
- Refactor Risk Replay to read common observations and coverage.
- Refactor Neighborhood services to read common observations and lifecycle.
- Replace Gazette signal collection and ranking with briefing selection from
  canonical changes/actions.
- Replace Home Score report generation with Property Brief assembly from
  canonical facts/events/evidence.
- Add purpose-based redaction and share authorization.

### 9.2 Frontend

- Add reusable `SourceCoverageSummary`, `TruthStateBadge`,
  `DatePrecisionLabel`, `WhyThisMatters`, and `MissingFactPrompt` components.
- Build Home Briefing sections from typed change items.
- Build coverage-aware empty and degraded states.
- Rework Timeline event cards and grouped event detail.
- Rework Risk Replay as Past Hazard Exposure.
- Rework Neighborhood Radar as Around Your Home.
- Add long-term hazard context to Environment Report.
- Build purpose-based Property Brief composer, preview, share, and revoke UX.
- Replace refresh/rerun CTAs with outcome-oriented actions.
- Remove the Climate Risk and Home Score standalone experiences after redirects
  are active.
- Ensure Home cards are driven by unread material change, not feature status.

### 9.3 Workers and jobs

- Replace recompute-only “monitoring” jobs with reviewed source-ingestion jobs.
- Persist checked coverage even when a valid provider response contains no
  observations.
- Distinguish provider success/no records, partial coverage, rate limit,
  validation quarantine, and hard failure.
- Emit changes only for accepted new revisions.
- Generate briefings according to user cadence and materiality.
- Deliver notifications through the shared notification platform with
  idempotency and preference enforcement.
- Add dead-letter/quarantine inspection for rejected source records.
- Never enable fixtures from a production job path.

### 9.4 Data model and schema

Direct Prisma schema changes are expected. No migration scripts or backfills
are required.

Preferred cleanup:

- remove or repurpose obsolete Home Score report/section/benchmark/forecast
  persistence;
- remove obsolete independent Gazette candidates and selection traces after
  Home Briefing acceptance;
- replace separate risk/neighborhood source records when the common observation
  model can represent them cleanly;
- preserve useful share/access and edition-delivery concepts only under the new
  contract;
- add explicit Timeline truth and revision fields; and
- add the common coverage, observation, change, audience, briefing, and brief
  models.

Do not retain old tables solely for compatibility.

### 9.5 API contracts

Recommended property-scoped contracts:

```text
GET  /api/properties/:propertyId/intelligence/changes
GET  /api/properties/:propertyId/intelligence/coverage
GET  /api/properties/:propertyId/intelligence/observations
POST /api/properties/:propertyId/intelligence/observations/:id/follow
POST /api/properties/:propertyId/intelligence/observations/:id/dismiss
POST /api/properties/:propertyId/intelligence/observations/:id/outcome

GET  /api/properties/:propertyId/briefings/current
GET  /api/properties/:propertyId/briefings
POST /api/properties/:propertyId/briefings/:id/seen
PUT  /api/properties/:propertyId/briefing-preferences

GET  /api/properties/:propertyId/timeline
POST /api/properties/:propertyId/timeline/events
POST /api/properties/:propertyId/timeline/events/:id/corrections

POST /api/properties/:propertyId/property-briefs
GET  /api/properties/:propertyId/property-briefs/:id/preview
POST /api/properties/:propertyId/property-briefs/:id/share
POST /api/property-briefs/shares/:token/revoke
GET  /api/property-briefs/shares/:token
```

Every external observation response must include:

- source;
- published/effective/checked-through dates;
- coverage state;
- geography and precision;
- factual lifecycle;
- match method;
- inference status;
- confidence and limitations; and
- canonical next action, if any.

---

## 10. Acceptance Criteria

### 10.1 Trust and source coverage

- [ ] No external result appears in production without a reviewed enabled
      source.
- [ ] No empty state says or implies “nothing happened” unless the displayed
      source/time/geography coverage supports that statement.
- [ ] Partial and failed source checks are visible.
- [ ] No distance is displayed unless derived from valid geometries.
- [ ] Coarse matches state their actual geography.
- [ ] No climate premium or property-value range is generated from generic
      heuristics or generative output.
- [ ] A nearby event is never labeled as property damage.
- [ ] Source revisions are idempotent and auditable.

### 10.2 Change and briefing

- [ ] One source revision produces at most one canonical Property Change.
- [ ] A briefing can contain one meaningful item.
- [ ] A quiet briefing is shown only when requested and source health supports
      the statement.
- [ ] Source failure cannot be rendered as “nothing urgent.”
- [ ] Briefing priority matches canonical Home Action priority.
- [ ] Every item explains what changed and why it was included.
- [ ] Seen/dismissed state is per user.
- [ ] Home does not show a permanent passive-intelligence card.
- [ ] No notification is sent solely because a weekly job ran.

### 10.3 Timeline

- [ ] Observed, reported, evidence-derived, inferred, and system-generated events
      are distinguishable.
- [ ] Exact and estimated dates are distinguishable.
- [ ] Record creation date is not presented as purchase/installation date.
- [ ] Current analytical signals do not appear as historical events by default.
- [ ] Related milestones can be grouped under one durable lifecycle.
- [ ] Governed event corrections retain revision history.
- [ ] Confirmed hazard effects can link claims, inspections, repairs, and
      evidence.
- [ ] Running an analysis or reading a briefing does not create a property event.

### 10.4 Property Brief and privacy

- [ ] There is no composite home grade.
- [ ] Every included fact/event has source and as-of context.
- [ ] Unknowns and excluded sections are explicit.
- [ ] The homeowner previews the recipient view before sharing.
- [ ] Shares expire and can be revoked.
- [ ] Sensitive sections are opt-in, not default.
- [ ] Access is logged.
- [ ] The artifact states that it is not an inspection, appraisal,
      certification, title report, or comprehensive disclosure.

### 10.5 Product-framework conformance

- [ ] Home Actions is the sole attention-priority authority.
- [ ] Status Board remains the current-state authority.
- [ ] Digital Twin remains the scenario authority.
- [ ] Capital Timeline remains the forward lifecycle authority.
- [ ] Environment Report remains the environmental authority.
- [ ] Timeline remains the durable history authority.
- [ ] Capability completion represents a homeowner outcome, not page view,
      report generation, or job execution.
- [ ] Safety is classified per instance.

---

## 11. Test Strategy

### 11.1 Unit tests

- source coverage state and checked-through calculation;
- observation validation and revision deduplication;
- exact and coarse geographic matching;
- impact-assessment truth boundaries;
- change materiality and deduplication;
- briefing selection and cadence;
- Timeline date precision and grouping;
- Property Brief field-level evidence and redaction; and
- safety-tier derivation.

### 11.2 Contract tests

- provider fixtures against adapter schemas;
- partial/no-record/failure coverage responses;
- source revision ordering;
- source-to-change-to-action lineage;
- briefing item canonical deep links;
- shared artifact access, expiry, and revoke;
- old-route redirects; and
- capability inventory validation.

### 11.3 Integration scenarios

1. Provider succeeds with zero observations and records valid coverage.
2. Provider fails while other sources succeed; briefing reports degradation.
3. A hazard occurs near the property but no property effect is known.
4. The homeowner confirms no observed effect.
5. An inspection confirms damage and creates a grouped Timeline outcome.
6. A neighborhood proposal becomes approved, then completed, without duplicate
   briefing items.
7. A property lacks coordinates and receives only honest municipality-level
   context.
8. One material change produces a one-item briefing.
9. No material change produces no push notification.
10. An inferred appliance event has year-only date precision.
11. A user corrects a governed Timeline event and the revision is retained.
12. A shared Property Brief excludes claims and financial data by default.
13. A revoked share token is no longer accessible.
14. A retired Home Score or Climate route lands at the correct canonical
    destination.

### 11.4 End-to-end journeys

- new environmental observation → property match → briefing → Home Action →
  preparation completion → Timeline outcome;
- historical hazard match → missing roof fact → fact added → assessment
  updated → inspection attached → Timeline;
- neighborhood change → follow → lifecycle update → briefing → dismiss;
- manual past event → evidence → grouped history → annual recap;
- create Property Brief → select sections → preview → share → access → revoke;
  and
- source outage → honest degraded state → recovery → one deduplicated change.

---

## 12. Measurement

### 12.1 North-star outcome

> Percentage of material property changes that are understood, resolved, or
> incorporated into a verified home record without duplicate actions or
> notifications.

### 12.2 Product metrics

- material changes detected by source family;
- briefing delivery, meaningful open, and “useful/not useful” rate;
- change-to-canonical-action conversion;
- action completion following a change;
- external observation outcome confirmation rate;
- Timeline events with evidence and accurate date precision;
- Property Brief creation, selective sharing, and revoke rate;
- followed versus dismissed neighborhood observations; and
- annual recap engagement.

### 12.3 Trust and reliability metrics

- source coverage by property and family;
- source freshness SLO attainment;
- source failure and partial-coverage rate;
- false all-clear incidents;
- unsupported-claim incidents;
- duplicate observation/change/action/notification rate;
- fixture leakage incidents;
- observation quarantine rate;
- coarse-versus-precise match rate;
- inferred-to-confirmed outcome rate; and
- privacy/share access incidents.

### 12.4 Metrics to retire

- Home Score viewed;
- grade improved;
- Climate Risk generated;
- Risk Replay run count;
- Gazette editions generated;
- minimum story count achieved;
- Timeline plan created; and
- passive tool card click-through as a proxy for homeowner value.

---

## 13. Rollout and Operational Governance

### 13.1 Launch order

1. Trust containment.
2. Capability contracts and route decisions.
3. Timeline truth hardening.
4. Source coverage/observation foundation.
5. One reviewed environmental or hazard pilot.
6. Property change ledger.
7. Home Briefing.
8. One reviewed neighborhood geography pilot.
9. Property Brief.
10. Broader source expansion.

Timeline and briefing architecture should not wait for broad external-source
coverage. They already add value from canonical internal changes.

### 13.2 Source launch gate

Each provider/source family requires:

- named product and engineering owner;
- reviewed terms and usage constraints;
- known geography and history coverage;
- source schema and validation policy;
- source status/lifecycle mapping;
- freshness SLO;
- degraded and zero-result language;
- sampled record QA;
- duplicate/revision tests;
- safety/privacy review;
- production kill switch;
- admin health visibility; and
- incident response playbook.

### 13.3 Rollback

Rollback is per source family and presentation:

- stop ingestion;
- suppress new matches;
- preserve audit/source records;
- stop briefing selection and notifications;
- show honest unavailable state;
- retain canonical property outcomes already confirmed; and
- never delete real Timeline history because an external source is disabled.

---

## 14. Documentation Updates

Implementation must update:

- `CAPABILITY_OUTCOME_AND_EXPERIENCE_AUDIT_FRAMEWORK.md` examples, if needed;
- current capability inventory and relationship contracts;
- `HOME_GAZETTE.md` to the Home Briefing contract;
- `HOME_RISK_REPLAY.md` to Past Hazard Exposure;
- `NEIGHBORHOOD_CHANGE_RADAR.md` to Around Your Home;
- `HOME_TIMELINE.md` truth and revision semantics;
- `ENVIRONMENT_REPORT_FRD.md` long-term hazard context;
- Home Score documentation or a new Property Brief FRD;
- source onboarding and operations runbooks;
- notification and sharing privacy documentation;
- analytics taxonomy;
- route and redirect references;
- support/knowledge copy; and
- production fixture/dummy-data safeguards.

---

## 15. Final Portfolio Disposition

| Capability | Decision | Independent destination? | Revisit value |
| --- | --- | --- | --- |
| Home Score | Retire composite score; preserve as Property Brief | On-demand artifact composer, not monitoring dashboard | When the homeowner needs to review/share a governed snapshot |
| Home Risk Replay | Reposition as Past Hazard Exposure | Specialized drill-down when covered | New source event, changed property fact, or confirmed outcome |
| Climate Risk | Retire standalone and merge into Environment Report | No | Material authoritative environmental/hazard update |
| Neighborhood Change Radar | Improve and merge as Around Your Home | Focused drill-down after live coverage | New or changed followed local observation |
| Home Gazette | Rebuild as Home Briefing | Yes, as briefing/history—not source authority | Meaningful change within selected cadence |
| Home Timeline | Double down as canonical history | Yes | New event, milestone, correction, evidence, or recap |

The best-in-class result is not six improved dashboards. It is a trustworthy
intelligence loop:

```text
Reviewed source or canonical home change
  → factual observation
  → property relevance with explicit inference
  → meaningful delta
  → Home Briefing
  → canonical Home Action when needed
  → confirmed outcome
  → durable Home Timeline
```

That loop gives the homeowner a reason to return: something real changed,
ContractToCozy can explain it, the homeowner has control over the response, and
the outcome becomes part of a home record that grows more useful over time.
