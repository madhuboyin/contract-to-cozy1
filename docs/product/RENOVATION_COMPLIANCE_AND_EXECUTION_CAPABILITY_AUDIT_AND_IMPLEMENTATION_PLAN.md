# Renovation Compliance and Execution Capability Audit and Implementation Plan

**Capabilities:** Renovation Risk Advisor, Permit Tracker, HOA Compliance, Home
Upgrades, Project Tracker, and Material Specs<br>
**Contributing domains:** Property Context, Documents, Home Digital Twin,
Inspection Hub, Service Price Radar, Capital Decision Planning, Home Operations,
Providers, Bookings, Property Tax, Expenses, Warranties, Inventory, Home
Timeline, and Notifications<br>
**Audit framework:** `CAPABILITY_OUTCOME_AND_EXPERIENCE_AUDIT_FRAMEWORK.md`<br>
**Audit date:** July 29, 2026<br>
**Status:** Recommended implementation plan<br>
**Recommended disposition:** **Create one Renovation Case journey; merge
standalone planning and advisory experiences into it; preserve and integrate
the authoritative permit, HOA, project, and material records**<br>
**Current safety classification:** All six registered capabilities are low
consequence<br>
**Recommended safety classification:** Instance-based, ranging from low
consequence through material financial, regulated/compliance-sensitive, and
safety/emergency<br>
**Primary outcome family:** Renovation Compliance and Execution

---

## 1. Executive Decision

ContractToCozy has much of the machinery required to help a homeowner plan and
complete a renovation, but it does not yet have one renovation product.

Today, one proposed renovation can become:

- a transient list of AI-generated Home Upgrade recommendations;
- a Renovation Risk Advisor session with estimated permit, tax, licensing, and
  inspection requirements;
- a manually tracked HOA approval;
- one or more permit records with inspection milestones;
- an independently created Project with another milestone list; and
- installed material records created during or after Project completion.

The records can reference one another in a few places, but they do not share one
scope, one lifecycle, one readiness decision, or one definition of completion.
The homeowner must translate the same project among six product mental models.

This is particularly serious because the product operates near legal,
jurisdictional, financial, and physical-safety boundaries. The current
implementation can:

- label static national heuristics as required or likely required without
  verifying the actual authority having jurisdiction;
- fail to create its promised compliance task because integration code compares
  persisted enum values with different string values;
- let a homeowner manually mark an HOA request approved or denied without
  recording whether the association supplied that decision;
- let locally updated inspection milestones automatically mark a permit
  `FINALED`, even though only the issuing authority can establish official
  closeout;
- describe a Project milestone as synchronized with Permit Tracker while neither
  update path performs that synchronization;
- pass the Project completion check “All permit inspections passed” when a
  project has no permit milestones at all;
- complete a Project without checking a linked HOA approval or an authoritative
  permit closeout;
- treat an advisor run as an improvement in Home Timeline and create a Digital
  Twin scenario even when no renovation was chosen or performed; and
- show precise cost totals, average ROI, priorities, and Boolean permit claims
  from a transient recommendation generator that is explicitly not safe for
  financial planning.

The homeowner job is:

> Help me decide whether an improvement is right for this home, determine what
> must be checked or approved before work starts, organize the scope and people,
> guide the work through permits and inspections, and leave me with a verified
> record of what was approved, installed, paid, and completed.

The recommended product decision is:

1. introduce one durable **Renovation Case** for every accepted renovation idea;
2. make **Explore Upgrades** the optional discovery stage of that case, not a
   separate plan with unsupported portfolio totals;
3. turn Renovation Risk Advisor into a **Requirements Check** within the case;
4. distinguish an advisory likelihood, homeowner-confirmed research, and an
   official authority or association record;
5. preserve Permit Tracker as the property-wide permit-history and active
   permit authority, while attaching relevant permit records to a case;
6. preserve HOA as the property-wide association and notice authority, while
   attaching approvals and conditions to a case;
7. make Project Tracker the execution authority after a case is ready to start;
8. make Material Specs support planned, approved, substituted, and installed
   product states, with the installed specification becoming the as-built home
   record;
9. introduce a governed start-readiness decision without preventing a homeowner
   from recording work that has already started;
10. separate official status from homeowner-entered progress;
11. connect requirements, approvals, milestones, conditions, changes,
    inspections, payments, and closeout to the same scope;
12. write verified outcomes to Inventory, Home Digital Twin, Home Timeline,
    Property Tax, Ownership Cost, Capital Planning, documents, expenses,
    warranties, and future care;
13. promote only real blockers, deadlines, decisions, or material changes
    through canonical Home Actions;
14. never advertise a project, permit, approval, inspection, or property as
    compliant based only on ContractToCozy inference or user-entered progress;
    and
15. measure ready-to-start and verified-completion outcomes, not advisor runs,
    permit records created, or pages viewed.

The target promise should be:

> Plan the right improvement, understand what to verify before work starts,
> keep approvals and the project in one place, and finish with a reliable record
> of what changed in your home.

### 1.1 Implementation constraint

There are no real users and no production data migration requirement.

Implementation may change the Prisma schema directly. It must not create:

- database migration scripts;
- historical backfills;
- compatibility tables for obsolete advisor sessions or fragmented source
  lineage;
- dual-write behavior solely to preserve the existing independent lifecycles;
- synthetic permit, HOA, project, inspection, or material history; or
- legacy fields solely to retain current unsafe status semantics.

The user will reconcile the database separately after schema changes.

Use this constraint to establish one clean Renovation Case model and explicit
truth boundaries. Do not preserve contradictory status or completion behavior
for data that does not need to be retained.

---

## 2. Scope and Portfolio Boundaries

### 2.1 In scope

| Area | Current responsibility | Target responsibility |
| --- | --- | --- |
| Home Upgrades | Generates transient AI recommendations | Helps explore goals and candidate options before a case is accepted |
| Renovation Risk Advisor | Produces static permit, tax, licensing, and risk estimates | Case-specific requirements research and preparation |
| Permit Tracker | Stores permit history, active permits, inspections, flags, and exports | Property permit authority plus case-specific permit workflow |
| HOA Compliance | Stores association, approvals, and violation incidents | Association authority plus case approval workflow and conditions |
| Project Tracker | Runs milestones, payments, changes, issues, evidence, and completion | Authoritative execution record for an accepted case |
| Material Specs | Stores property-, room-, inventory-, or Project-linked products | Planned, approved, substituted, installed, and as-built specifications |
| Renovation Case | Does not exist | Canonical scope, lifecycle, readiness, lineage, and closeout |

### 2.2 Adjacent but not owned

- **Home Digital Twin and Inventory** own verified property and system facts.
- **Inspection Hub** owns professional report extraction and confirmed findings.
- **Service Price Radar, quote comparison, providers, and bookings** own market
  pricing and commercial selection.
- **Capital Decision Planning** owns affordability, funding, alternatives, and
  portfolio timing before execution.
- **Home Operations** owns canonical work visibility, assignment, due dates, and
  household coordination.
- **Property Tax and Ownership Cost** own tax and long-term cost outcomes.
- **Documents** owns source files and evidence.
- **Home Timeline** records real decisions and changes, not advisor page use.

These domains contribute through typed case relationships. They must not create
another renovation lifecycle.

### 2.3 Explicit non-goals

This plan does not recommend:

- guaranteeing permit, zoning, code, license, tax, or HOA requirements;
- replacing an authority, licensed professional, inspector, attorney,
  architect, engineer, or association;
- automatically filing permits or HOA applications without a separately
  approved integration and explicit homeowner authorization;
- treating open-data absence as proof that no permit exists;
- blocking a homeowner from recording an already-started or historical project;
- merging all property permit history into Projects;
- making every paint touch-up a Renovation Case;
- presenting AI photo review as an inspection;
- calculating precise resale ROI from generic category ranges; or
- placing a permanent renovation card on Home.

---

## 3. Repository-Backed Current-State Map

### 3.1 Registered capability contract

| Capability | Outcome | Release | Safety | Completion | Mode |
| --- | --- | --- | --- | --- | --- |
| Renovation Risk Advisor | `PLAN_BUDGET` | Active | Low consequence | Plan created | Contextual |
| Permit Tracker | `PLAN_BUDGET` | Active | Low consequence | Plan created | Contextual |
| HOA Compliance | `PLAN_BUDGET` | Active | Low consequence | Plan created | Contextual |
| Home Upgrades | `PLAN_BUDGET` | Beta | Low consequence | Plan created | Catalog only |
| Project Tracker | `PLAN_BUDGET` | Active | Low consequence | Action completed | Contextual |
| Material Specs | `UNDERSTAND_HOME` | Active | Low consequence | Artifact created | Contextual |

The inventory contracts already contain useful homeowner outcomes for Permit
Tracker, HOA, Project Tracker, and Material Specs. They also reveal material
misalignment:

- jurisdictional, approval, contractor, inspection, and construction decisions
  are not universally low consequence;
- Project Tracker’s completion signal is
  `project_created_with_milestone_or_progress_verified`, which contradicts
  `ACTION_COMPLETED`;
- Permit and HOA “completion” occurs when a record is created, not when the
  homeowner reaches a verified decision or approval outcome;
- Renovation Risk Advisor’s related capabilities omit the three most important
  handoffs: Permit Tracker, HOA, and Project Tracker;
- Material Specs accepts a room or issue context but its readiness rule requires
  a Project context; and
- Home Upgrades has no durable Living Home Record output or case handoff.

### 3.2 Current lifecycle

```text
Home Upgrades
  goals → generated recommendation list → Start Over
                                   ╳ no durable selected option
                                   ╳ no case/project conversion

Renovation Risk Advisor
  renovation type + cost → static requirements/risk evaluation
  ├─ Home Event written as an "IMPROVEMENT"
  ├─ Digital Twin scenario created
  └─ compliance task attempted
                                   ╳ no Project identity
                                   ╳ enum mismatch can suppress task

HOA Compliance
  association → manually tracked approval/status/conditions
                                   ╳ no typed Project or case relation

Permit Tracker
  open-data/manual permit → generic inspection milestones
  → homeowner-updated passed statuses → permit auto-"FINALED"
                                   ╳ official and self-reported truth mixed

Project Tracker
  independent Project → Project milestones/payments/changes/issues
  → completion checklist → verified completion write-backs
                                   ╳ permit link not synchronized
                                   ╳ HOA not checked

Material Specs
  manual record or Project progress-log write-back → property record
                                   ╳ planned/approved/installed states absent
```

### 3.3 Strong foundations to preserve

1. Renovation Advisor persists sessions, source types, confidence, assumptions,
   versions, warnings, permit outputs, tax outputs, licensing outputs, and
   likely inspection stages.
2. Permit Tracker distinguishes manual and API records, supports configurable
   open-data sources, fetch jobs, historical records, active records,
   inspection milestones, readiness checks, disclosure exports, and cautious
   unpermitted-work flags.
3. Inspection Readiness clearly states that the photo review is general
   guidance and does not replace an inspector.
4. HOA stores association contacts, documents, dues, approval dates,
   conditions, denial reasons, expiration, and violation incidents.
5. Project Tracker is a substantial execution engine with scope, contractor
   snapshots, credentials, milestones, dependencies, progress, payments,
   change orders, issues, evidence, outcomes, warranty, and write-backs.
6. Project completion can create Home Events, documents, expenses, warranties,
   Inventory updates, Material Specs, future-care work, and provider reviews.
7. Material Specs can attach to a property, room, inventory item, Project, and
   source progress log, and can preserve manufacturer, SKU, color, finish,
   quantity, supplier, batch, and photos.
8. Capability discovery has contextual triggers for permit-relevant projects,
   HOA approvals, active execution, and material recording.
9. Property Context readiness exists for permit and HOA actions.
10. Source lineage fields are present in several records, providing a useful
    starting point for clean typed relationships.

---

## 4. Scorecard and Portfolio Disposition

| Dimension | Weight | Score | Assessment |
| --- | ---: | ---: | --- |
| Homeowner value and differentiation | 20 | 15 | High-value problem and unusually broad foundations |
| Functional completeness | 20 | 10 | Strong point tools; no end-to-end renovation lifecycle |
| Actionability and closed-loop completion | 15 | 8 | Project execution is strong; planning and compliance handoffs break |
| Data quality, freshness, and trust | 15 | 7 | Good provenance structures; unsafe official-status and heuristic semantics |
| UX clarity and readiness | 15 | 9 | Individual screens are understandable; the combined journey is not |
| Product Framework integration | 10 | 5 | Contextual registrations exist; parallel plans and priorities remain |
| Accessibility, performance, reliability | 5 | 3 | Reasonable UI primitives; cross-capability reliability evidence is limited |
| **Total** | **100** | **57** | **Consolidate before expanding** |

### 4.1 Disposition by capability

| Capability | Decision | Rationale |
| --- | --- | --- |
| Renovation Case | **Create** | Missing canonical scope, lifecycle, readiness, and outcome identity |
| Home Upgrades | **Merge / retire standalone route** | Useful goal discovery; transient AI plan is not an execution product |
| Renovation Risk Advisor | **Merge / reposition** | Valuable requirements engine, but should not be a separate “risk” destination |
| Permit Tracker | **Double down / integrate** | Must remain property-wide history and official-record workspace |
| HOA Compliance | **Improve / integrate** | Must remain association authority while approvals become case-specific |
| Project Tracker | **Double down / integrate** | Best existing execution authority |
| Material Specs | **Double down / expand** | Strong durable record; must cover planned through as-built states |

---

## 5. Critical Truth and Safety Defects

### 5.1 Compliance-task enum mismatch

The advisor integration checks permit values `PERMIT_REQUIRED` and
`PERMIT_LIKELY_REQUIRED`, and licensing values `LICENSE_REQUIRED` and
`LICENSE_LIKELY_REQUIRED`.

The persisted enums are:

- permit: `REQUIRED`, `LIKELY_REQUIRED`, and related values; and
- licensing: `REQUIRED`, `MAY_BE_REQUIRED`, and related values.

Permit- or license-driven compliance tasks are therefore not created unless the
separate overall-risk condition also happens to be high or critical.

**Required containment:** compare typed enums, add exhaustive compile-time
handling, and test every status-to-action transition.

### 5.2 Permit closeout is overstated

When all locally modeled required inspection milestones are marked passed,
Permit Tracker automatically:

- changes the permit record to `FINALED`;
- sets `finaledDate`; and
- writes a Home Event saying the permit is closed out.

A homeowner-entered milestone, an AI readiness check, and an official inspector
or authority record are not equivalent. ContractToCozy cannot infer official
permit finalization from its local checklist.

**Required containment:** split:

- `trackingProgress`;
- `homeownerReportedInspectionStatus`;
- `officialPermitStatus`;
- `officialStatusSource`;
- `officialStatusObservedAt`; and
- `closeoutEvidenceDocumentId`.

Only authority-sourced data or explicit authority evidence may change official
status. Local milestones may produce “all tracked steps marked complete,” never
“permit finaled” or “permit closed out.”

### 5.3 Project and permit milestones are not synchronized

`ProjectMilestone.linkedPermitMilestoneId` is described as synchronized, but:

- completing a Project milestone does not update Permit Tracker; and
- updating a Permit Tracker milestone does not update Project Tracker.

The relation is therefore a dormant pointer, not a synchronization contract.

**Required containment:** select one authority for inspection truth, project the
status into the Project, and implement idempotent event-driven reconciliation.
Do not allow two editable status authorities.

### 5.4 Project completion can pass a vacuous permit check

Project completion selects Project milestones with type `PERMIT_INSPECTION`,
then passes “All permit inspections passed” whenever none are unpassed. If no
permit milestone exists, the check passes.

It does not establish:

- whether a permit was required;
- whether a determination was completed;
- whether a relevant Permit Tracker record exists;
- whether required official inspections passed;
- whether official closeout exists; or
- whether HOA approval or its conditions were satisfied.

**Required containment:** completion must evaluate explicit applicability:
`NOT_APPLICABLE`, `REQUIRED`, `NOT_REQUIRED_CONFIRMED`, `UNKNOWN`, or
`WAIVED_WITH_ACKNOWLEDGMENT`. Unknown is not passed.

### 5.5 Unverified HOA status appears authoritative

The UI lets a homeowner switch an approval among submitted, under review,
approved, approved with conditions, and denied. The model does not preserve:

- source of the decision;
- who reported it;
- whether a document supports it;
- association reference number;
- verification state; or
- which exact case/project scope it covers.

**Required containment:** distinguish reported status from verified association
status. Conditions and expiration become case gates and work items, not notes.

### 5.6 Generated upgrade claims exceed their evidence

Home Upgrades:

- prompts a general-purpose model for costs, ROI, priority, contractor type, and
  a Boolean `permitRequired`;
- clamps costs to state multipliers and ROI to category ranges;
- sums unrelated recommendations into “Estimated total cost”;
- averages their ROI into “Avg. ROI”;
- calls items “Quick Wins (High ROI, Low Cost)”; and
- has no durable save, compare, accept, or execute action.

Although a disclaimer says the result is educational and not safe for financial
planning, the prominent numbers communicate a more precise plan.

**Required containment:** remove portfolio totals, average ROI, absolute permit
claims, and urgency rankings until supported. Present ranges, evidence,
assumptions, confidence, and “why this fits,” then let the homeowner select an
option for deeper analysis.

### 5.7 Advisor activity pollutes durable property truth

An advisor evaluation can create a Home Event typed as an improvement and a
Digital Twin scenario. An evaluation is not a completed improvement or a chosen
scenario.

**Required containment:** record advisor evaluation as case audit history only.
Create planning scenarios only after explicit homeowner selection. Write an
improvement event only after verified completion.

### 5.8 Cross-property and cross-scope relationships need enforcement

String source links and optional milestone/permit relationships allow records
to be linked without a single typed case scope. Every relationship among case,
project, permit, HOA approval, material, document, room, and inspection must
validate:

- the same property;
- compatible scope;
- household authorization;
- active/non-archived status; and
- source ownership.

Database foreign keys alone do not prove same-property or same-scope integrity.

---

## 6. Material Functionality Gaps

### 6.1 No canonical renovation scope

No record answers all of:

- What is being changed?
- Where in the home?
- Why is the homeowner considering it?
- What is included and excluded?
- Which version of the scope was assessed?
- Which requirements, approvals, quotes, contract, materials, and inspections
  apply to that version?
- What changed after approval?
- What was actually installed?

**Required change:** create versioned case scope with spaces, systems, work
items, structural/exterior/utility effects, intended use, dimensions, documents,
estimated cost, target dates, and known exclusions.

### 6.2 Jurisdiction is inferred, not resolved

The advisor derives state, city, and ZIP from the property; county depends on an
override. This is geographic specificity, not confirmation of:

- authority having jurisdiction;
- zoning authority;
- building department;
- permitting portal;
- adopted code edition;
- utility/fire/health authority;
- historic-district or floodplain overlay; or
- licensing authority.

**Required change:** introduce a sourced jurisdiction/authority profile with
coverage, confidence, last verified date, contacts, URLs, and explicit unknowns.

### 6.3 Requirements are estimates rather than determinations

The current engine can produce useful likelihoods but lacks a durable
requirement lifecycle:

```text
POSSIBLE → RESEARCH_NEEDED → HOMEOWNER_CONFIRMED
         → PROFESSIONAL_CONFIRMED → AUTHORITY_CONFIRMED
         → NOT_APPLICABLE / REQUIRED / UNKNOWN
```

Each determination needs question, answer, source, scope version, authority,
effective date, expiration, evidence, and who confirmed it.

### 6.4 Missing regulated and safety preparation

Best-in-class preparation must conditionally cover:

- zoning/use, setbacks, lot coverage, egress, and occupancy;
- structural engineering and design-professional needs;
- electrical, plumbing, mechanical, fire, and energy code work;
- lead-safe renovation for older homes;
- asbestos, mold, radon, and other hazard controls where applicable;
- excavation and utility-location requirements;
- historic district, floodplain, coastal, wildfire, or environmental review;
- accessibility and aging-in-place standards without claiming ADA applicability
  to private homes;
- contractor license, registration, insurance, bond, and workers compensation;
- owner-builder implications;
- construction insurance and lender requirements; and
- safety escalation when active conditions require a professional.

The product must present these as questions to verify, not universal rules.

### 6.5 No start-readiness decision

Project Tracker can begin execution without one case-level answer to:

> What is still unresolved before work starts, who owns it, and what evidence
> will resolve it?

The target readiness model includes:

- scope sufficiently defined;
- responsibility and property applicability known;
- permit determination;
- HOA applicability and decision;
- design/professional requirements;
- contractor credential decision;
- contract and insurance evidence;
- material decisions that affect approval;
- known safety/hazard preparation;
- funding approval if applicable; and
- dependencies and long-lead items.

The product may allow an override, but a material or safety override must record
the reason, actor, time, unresolved risks, and next action. It must not produce
“compliant” or “ready” language.

### 6.6 Permit tracking lacks a case workflow

Permit Tracker is useful property history, but a current renovation also needs:

- requirement-to-application lineage;
- permit/application type and responsible filer;
- prerequisite checklist;
- application number, submission, corrections, resubmission, fees, issuance,
  expiration, inspection, certificate, and closeout;
- authoritative status source and freshness;
- dependencies on scope and material changes;
- conditions and correction notices as case blockers;
- renewal and expiration reminders; and
- Project projection without duplicate editing.

### 6.7 HOA tracking lacks document intelligence and conditions execution

HOA currently records association and approval status but does not:

- extract candidate rules from CC&Rs/design guidelines;
- show document section and confidence;
- distinguish rule research from association confirmation;
- create an application package;
- relate approval to a typed scope version;
- turn conditions into Project constraints or milestones;
- detect scope changes that may invalidate approval;
- warn on expiration;
- track neighbor notice or hearing where required; or
- preserve official communication and reference numbers.

Document extraction must require homeowner review and must never be called an
authoritative interpretation.

### 6.8 Planning does not become execution

Home Upgrades and Renovation Advisor end at results. Missing actions include:

- compare options;
- save an option;
- add missing home facts and see exactly what improves;
- create a Renovation Case;
- request cost validation;
- start a requirements check;
- attach an existing permit or HOA approval;
- create Project scope and milestones; and
- reject an option with a remembered reason.

### 6.9 Project execution does not inherit compliance conditions

A Project should project:

- unresolved readiness blockers;
- permit inspections and correction notices;
- HOA conditions and expiration;
- approved scope and material constraints;
- required evidence;
- professional/contractor responsibilities; and
- change impacts.

Today those records remain separate or do not exist.

### 6.10 Change control is not compliance-aware

A Project change order may alter:

- structural scope;
- exterior appearance;
- project value;
- equipment capacity;
- location/dimensions;
- material product;
- contractor;
- schedule; or
- intended use.

The system must evaluate whether the change requires:

- revised permit research;
- amended permit;
- new HOA approval;
- design revision;
- tax-impact refresh;
- new quote or funding decision; or
- updated material submittal.

An approved commercial change is not automatically an approved compliance
change.

### 6.11 Material Specs begin too late

The present Material Spec is primarily a durable product record. A renovation
needs four distinct states:

1. **Proposed** — under consideration;
2. **Approved** — accepted by homeowner, designer, HOA, authority, or contract
   as applicable;
3. **Substituted** — proposed replacement with reason and approvals; and
4. **Installed/as-built** — verified product, location, quantity, batch,
   warranty, care, and evidence.

The same UI must not imply that a proposed finish is installed.

### 6.12 Closeout is incomplete

Verified renovation completion should reconcile:

- final scope and exceptions;
- official permit closeout or known outstanding status;
- HOA condition completion where applicable;
- punch list and correction notices;
- lien waiver and final payment;
- commissioning and functional/safety verification;
- final photos;
- contract, invoices, receipts, warranties, manuals, and certificates;
- installed materials and substitutions;
- Inventory/Home Digital Twin changes;
- Home Timeline improvement event;
- tax and ownership-cost re-evaluation;
- future maintenance; and
- unresolved follow-up work.

Project completion already performs several useful write-backs, but it does not
close this whole graph.

### 6.13 Retroactive and already-started work is underserved

Homeowners also need:

- “work already started” intake;
- “work completed before I owned the home” research;
- unknown permit/approval state;
- document and open-data matching;
- professional/authority follow-up;
- remediation planning; and
- resale disclosure preparation.

Absence of evidence must remain “not found in available records,” never
“unpermitted” or “compliant.”

---

## 7. Homeowner Experience Audit

### 7.1 What is this?

The current names describe internal tools:

- “Risk Advisor” suggests an authoritative risk conclusion;
- “Permit Tracker” mixes historical research with current workflow;
- “HOA Compliance” implies compliance determination;
- “Home Modification Advisor” and “Home Upgrades” refer to the same discovery
  concept with different labels; and
- “Material Specs” is meaningful mainly after the user already knows why it
  matters.

The primary experience should be **Renovation Planner** or **Renovation
Workspace**, with stage labels written as homeowner jobs:

- Explore options
- Define the project
- Check requirements
- Get approvals
- Prepare to start
- Track the work
- Finish and save records

Specialized property-wide destinations can retain names such as Permit Records,
HOA & Association, Projects, and Materials & Finishes.

### 7.2 How will this benefit me?

The first screen should explain:

> Avoid expensive surprises before work starts, keep approvals and contractor
> decisions organized, know what is blocking progress, and preserve a reliable
> record for future repairs, insurance, taxes, and resale.

Do not lead with model mechanics, risk scores, enum-like status, source types,
or disclaimers. Place the trust boundary beside the affected claim.

### 7.3 What should I add for better results?

Readiness must be progressive and benefit-led:

| Missing context | Homeowner explanation | Action |
| --- | --- | --- |
| Exact room/system | “Helps us narrow the likely requirements and cost range” | Choose area |
| Scope/dimensions | “Needed to distinguish repair from structural or use changes” | Define scope |
| County/jurisdiction | “Helps find the right local office; we still ask you to confirm it” | Confirm authority |
| HOA status | “Exterior work may need association review before ordering materials” | Add/confirm association |
| Year built | “Helps surface older-home safety questions” | Add year built |
| Contractor | “Lets you track credentials, contract, insurance, and responsibilities” | Add contractor |
| Rules/permit documents | “Lets the project keep decisions and conditions with the work” | Upload document |

Optional context improves specificity. It must not block safe partial value.

### 7.4 What should I care about now?

Every case overview should prioritize at most:

1. a safety or stop-work concern;
2. a requirement or approval blocking start;
3. an approaching expiration, inspection, correction, or decision deadline;
4. a cost/scope change needing approval; and
5. the next execution milestone.

“Risk score,” “number of records,” and “advisor complete” do not outrank these
homeowner outcomes.

### 7.5 What can I control?

The homeowner needs controls to:

- edit scope and goals;
- correct property facts;
- confirm or reject a suggested requirement;
- record how a requirement was verified;
- assign owner/contractor responsibility;
- upload source evidence;
- link an existing permit, approval, Project, or material;
- request professional/local confirmation;
- acknowledge an unresolved risk;
- approve or reject a change;
- mark a local task complete without changing official status;
- record official status with evidence;
- archive an abandoned option or case;
- reopen a case or unresolved item; and
- export/share the case record.

The homeowner must not be able to manufacture an official permit or association
decision merely by selecting a status.

### 7.6 Target case overview

```text
Kitchen renovation                                      In planning
Replace cabinets, counters, lighting, and move sink

Next step
Confirm whether moving the sink requires a plumbing permit
[Find the local building office]  [Record an answer]

Before work starts                         3 of 6 ready
✓ Scope saved
✓ HOA not applicable — homeowner confirmed
! Permit question unresolved
! Contractor insurance missing
○ Contract not signed
○ Start date not set

Budget range       $— to $—     Updated from validated sources
Target start       Not set

[Scope] [Requirements] [Approvals] [Project] [Materials] [Records]
```

### 7.7 Empty, degraded, and historical states

- No open-data results: “We did not find records in the sources currently
  available for this address.”
- Source unsupported: “Online permit lookup is not configured for this area.
  You can add records or contact the local office.”
- Requirements unknown: “We cannot determine this from the information
  available. Confirm with the listed authority.”
- Project already started: show a catch-up checklist without blame.
- Work completed without records: offer evidence collection and research; do
  not diagnose illegal work.
- No renovation: keep capability discoverable in Explore Tools; do not occupy
  Home.

---

## 8. Target Domain and Truth Model

### 8.1 Renovation Case

Introduce a property-scoped `RenovationCase` with:

- homeowner-readable name and objective;
- lifecycle and outcome status;
- case type and safety/governance tier;
- responsibility/ownership context;
- current scope version;
- spaces and systems affected;
- target budget and schedule;
- source/entry lineage;
- linked option, advisor evaluation, Project, permits, HOA approvals,
  requirements, documents, quotes, materials, and findings;
- readiness summary derived from child truth;
- archive/cancel reason; and
- versioned audit history.

Suggested lifecycle:

```text
IDEA
  → FEASIBILITY
  → SCOPE_DEFINITION
  → REQUIREMENTS_RESEARCH
  → APPROVALS_IN_PROGRESS
  → PREPARING_TO_START
  → READY_TO_START
  → IN_EXECUTION
  → INSPECTION_AND_CLOSEOUT
  → VERIFIED_COMPLETE

Side states:
  ON_HOLD | CANCELLED | COMPLETED_WITH_OPEN_ITEMS | HISTORICAL_RESEARCH
```

Lifecycle does not replace the authoritative child statuses. It summarizes
whether the case can advance.

### 8.2 Versioned scope

`RenovationScopeVersion` should preserve:

- version and effective date;
- created by and change reason;
- structured work items;
- spaces, systems, intended use, dimensions, and structural/exterior effects;
- drawings/specification documents;
- estimated/contract cost;
- comparison to prior version;
- approval status; and
- downstream assessments that must be refreshed.

Requirements and approvals always reference the scope version they evaluated.

### 8.3 Requirement determination

Use a common `RenovationRequirement` for permit, zoning, HOA, professional,
contractor, safety, insurance, lender, utility, and other requirements.

It stores:

- question and requirement family;
- applicability and determination state;
- advisory likelihood separately from confirmed determination;
- authority/association/professional;
- source URL/document/section;
- source type, freshness, and confidence;
- scope version;
- owner and due date;
- evidence and notes;
- blocking behavior;
- expiration;
- related application/approval/permit; and
- audit events.

### 8.4 Official versus reported status

Every approval/permit/inspection record uses:

| Layer | Meaning |
| --- | --- |
| Advisory | ContractToCozy suggests what may apply |
| Reported | Homeowner/contractor reports progress |
| Documented | Evidence was uploaded and reviewed by the homeowner |
| Source-observed | Status came from configured authority/association source |
| Authority-confirmed | A verifiable decision/record from the decision maker |

UI language and automation depend on the layer. Only the last two can update
official status automatically.

### 8.5 Project projection

The Project remains the execution authority. It receives a read-only projection
of:

- case readiness;
- approved scope version;
- permit and HOA conditions;
- official inspection status;
- evidence requirements;
- materials requiring approval; and
- unresolved blockers.

Project milestones may reference those records but must not become a second
editable authority.

### 8.6 Material decision model

Extend materials with:

- case and scope-version relation;
- proposed/approved/substituted/installed/as-built state;
- intended location and quantity;
- decision owner and approval evidence;
- compliance attributes/certifications where relevant;
- substitution lineage and cost/schedule impact;
- installed verification;
- receipt, warranty, manual, care, and remaining quantity; and
- source confidence.

Only installed/as-built records become current Living Home Record facts.

### 8.7 Events and reconciliation

Publish durable, idempotent events such as:

- `renovation.case.created`
- `renovation.scope.changed`
- `renovation.requirement.determined`
- `renovation.readiness.changed`
- `permit.official_status_observed`
- `hoa.official_decision_recorded`
- `renovation.change.requires_recheck`
- `project.outcome.verified`
- `renovation.closeout.completed`
- `material.installed_verified`

Consumers must be retryable. Notification delivery is never a source of truth.

---

## 9. Product Framework Conformance

### 9.1 Home and Home Actions

Do not show a permanent Renovation card. Home may show:

- “HOA approval expires in 14 days”;
- “Permit correction response due”;
- “Confirm contractor insurance before the planned start”;
- “Kitchen project is waiting on final inspection”;
- “Review a $4,200 change order”; or
- “Finish closeout records.”

Each is one canonical Home Action linked to the case and its authoritative
record. Opening it focuses the relevant case step.

### 9.2 Capability discovery

- Explore Upgrades remains catalog discoverable.
- Requirements Check appears only after an idea/scope exists.
- Permit workflow appears when a requirement is possible/required, a permit
  record is present, or the homeowner explicitly asks.
- HOA approval appears only when responsibility and association context make it
  relevant or the homeowner explicitly asks.
- Project Tracker appears after contract, booking, explicit start, or accepted
  execution decision.
- Material capture appears when a product decision or installed product exists.

Capability relationships must explicitly connect all six contributors through
the Renovation Case.

### 9.3 Living Home Record

Read:

- verified property, structure, room, system, responsibility, jurisdiction,
  association, permit, project, material, document, and historical improvement
  facts.

Write:

- accepted renovation plan;
- sourced requirement determination;
- approval and permit records;
- Project execution;
- verified installed systems/materials;
- documents, warranty, expense, and future care; and
- verified improvement event.

Planning assumptions remain case data, not verified home facts.

### 9.4 Safety and commercial integrity

Derive governance by instance:

- decorative idea exploration: low consequence;
- cost, funding, tax, contract, change order: material financial;
- permit, zoning, license, HOA, insurance, official inspection: regulated or
  compliance-sensitive;
- structural, electrical, gas, fire, hazard, egress, active unsafe condition:
  safety/emergency as applicable.

Provider rankings, referrals, and paid relationships retain commercial
disclosures. Requirement and safety content cannot be influenced by referral
economics.

---

## 10. Recommended Implementation Sequence

### Slice 0 — Truth containment and defect correction

**Goal:** stop false compliance, false completion, and broken handoffs.

Deliver:

- fix advisor enum comparisons using typed exhaustive mappings;
- stop auto-finaling permit records from local milestones;
- replace “closed out” Home Events with truthful tracked-progress language;
- make zero Project permit milestones return `NOT_EVALUATED`, not passed;
- require explicit permit and HOA applicability on renovation Projects;
- validate same-property/same-scope links;
- distinguish AI readiness from official inspection;
- prevent advisor checks from creating improvement events;
- create Digital Twin scenarios only after explicit selection;
- remove unsupported totals, average ROI, and absolute permit claims from Home
  Upgrades;
- add status provenance to HOA decisions; and
- add deterministic tests for every defect above.

Exit criteria:

- no user-entered or AI-derived state is presented as an official decision;
- a Project cannot appear permit-ready merely because no milestone exists;
- expected compliance tasks are created for every mapped status; and
- planning activity never becomes verified property history.

### Slice 1 — Renovation Case and typed lineage

**Goal:** establish one durable identity and scope.

Deliver:

- clean Prisma models for case, scope versions, participants, relations, events,
  and governance;
- no migration scripts or backfills;
- create/read/update/archive APIs;
- property and household authorization;
- typed links to Project, advisor session, permits, HOA approvals, materials,
  documents, findings, quotes, and capital scenarios;
- uniqueness/idempotency rules;
- case lifecycle reducer;
- scope change diff and invalidation policy; and
- case-level audit log.

Exit criteria:

- one accepted renovation has one case;
- every contributor can resolve the same property and scope;
- scope changes preserve history; and
- arbitrary cross-property linkage is rejected.

### Slice 2 — Explore and define

**Goal:** turn Home Upgrades into credible option discovery and selection.

Deliver:

- property-scoped Explore Upgrades inside the case journey;
- goals, constraints, responsibility, affected space/system, budget, timing,
  accessibility, resilience, efficiency, and maintenance preferences;
- explain why each option fits known property context;
- evidence-based ranges from appropriate cost/benefit sources;
- missing-fact benefit and correction actions;
- compare/save/reject controls;
- explicit “Create renovation plan” conversion;
- remove transient aggregate plan semantics; and
- retire or redirect `/dashboard/modifications`.

Exit criteria:

- a recommendation does not become a plan until selected;
- selected option and assumptions persist;
- unsupported ROI and permit certainty are absent; and
- the homeowner can proceed without re-entering known facts.

### Slice 3 — Requirements and authority resolution

**Goal:** replace a standalone risk score with sourced preparation.

Deliver:

- authority/jurisdiction profile and confirmation workflow;
- versioned requirement engine using advisor rules as candidate generation;
- permit, zoning, HOA, professional, contractor, insurance, lender, utility,
  safety, hazard, and overlay families;
- advisory versus confirmed determination;
- source, freshness, confidence, limitation, and evidence;
- exact next action and owner for every unknown;
- authority/professional confirmation capture;
- scope-change re-evaluation; and
- retire Renovation Advisor as an independent outcome.

Exit criteria:

- every “required” claim identifies who confirmed it and for which scope;
- an advisory result remains visibly advisory;
- unknowns are actionable; and
- scope changes invalidate only affected determinations.

### Slice 4 — Permit and HOA case workflows

**Goal:** connect official records and approvals to the renovation without
losing property-wide history.

Deliver:

- attach existing or new permit and HOA records to case/scope;
- application, review, correction, resubmission, issuance, inspection,
  expiration, and closeout workflow;
- reported/documented/source-observed/authority-confirmed status layers;
- official reference, source, evidence, and observed-at timestamps;
- HOA document extraction with homeowner review;
- conditions as blockers/tasks/milestones;
- expiration and renewal alerts;
- one editable authority for every status;
- property-wide history views preserved; and
- improved no-record/no-coverage language.

Exit criteria:

- case and property views show the same permit/approval truth;
- user progress cannot change official status;
- conditions influence readiness and execution; and
- no open-data zero result is translated into an all-clear.

### Slice 5 — Start readiness and Project handoff

**Goal:** make readiness concrete and safely begin execution.

Deliver:

- derived start-readiness checklist;
- accountable owner, evidence, and due date for every item;
- readiness states: ready, ready with acknowledged open items, not ready, and
  not evaluated;
- governed overrides;
- create/link Project from the approved case scope;
- inherit contractor, contract, approved scope, conditions, dependencies, and
  evidence requirements;
- preserve already-started/historical intake;
- project start event and canonical Home Action; and
- no duplicate Project creation.

Exit criteria:

- homeowner sees exactly what blocks start and why;
- Project scope matches a versioned case scope;
- every override is auditable; and
- the product does not claim legal compliance.

### Slice 6 — Execution, inspection, and change control

**Goal:** keep approvals and work aligned after construction starts.

Deliver:

- Permit Tracker as inspection status authority;
- read-only permit projections in Project milestones;
- bidirectional navigation and one-way authoritative event reconciliation;
- correction notices and failed inspections as blockers;
- HOA conditions projected into milestones;
- change-order impact assessment;
- automatic requirement/approval recheck when relevant scope fields change;
- explicit amended-permit/reapproval workflow;
- evidence capture and household/contractor responsibility;
- operational alerts for real deadlines and blockers; and
- retry/reconciliation diagnostics.

Exit criteria:

- Project and permit views cannot disagree silently;
- a commercial change cannot bypass compliance re-evaluation;
- failed/corrective work remains open; and
- notifications represent durable state changes.

### Slice 7 — Materials from selection to as-built

**Goal:** make Material Specs useful before, during, and after work.

Deliver:

- proposed/approved/substituted/installed/as-built states;
- location and scope-version links;
- material submittal and approval evidence;
- substitution comparison and impact;
- Product, SKU, batch, quantity, supplier, receipt, warranty, manual, and care;
- photo/document extraction with homeowner review;
- HOA/permit-relevant attribute checks where configured;
- installed verification and remaining-material record; and
- repair/reorder experience using the as-built record.

Exit criteria:

- proposed products never appear installed;
- substitutions retain approval history;
- Project closeout produces verified as-built records; and
- future repair can identify the exact known product and confidence.

### Slice 8 — Closeout and Living Home Record reconciliation

**Goal:** finish once and update every appropriate domain.

Deliver:

- case closeout checklist with explicit applicability;
- official permit/HOA status or visible unresolved exception;
- punch list, correction, lien waiver, payment, warranty, commissioning,
  safety, and inspection evidence;
- actual cost and outcome;
- verified Inventory/Home Digital Twin updates;
- real improvement Home Event;
- Property Tax, Ownership Cost, and Capital Plan refresh triggers;
- documents, expenses, warranties, materials, and future care;
- partial completion and open-item handling;
- idempotent write-back ledger; and
- case export/share package.

Exit criteria:

- one closeout action reconciles the full case graph;
- unresolved items stay visible;
- only verified installed facts update the home record; and
- repeated closeout processing is idempotent.

### Slice 9 — Retroactive compliance and property history

**Goal:** support existing and inherited work without false diagnosis.

Deliver:

- already-started and prior-owner intake;
- open-data and document matching;
- “not found in available records” semantics;
- unpermitted-flag evidence and confidence improvements;
- professional/authority research workflow;
- remediation case conversion;
- governed disposition with evidence;
- resale/disclosure package integration; and
- audit history for resolved, dismissed, and unknown findings.

Exit criteria:

- the product never infers illegality from missing data;
- remediation is linked to evidence and authoritative outcome; and
- historical research does not contaminate active Project state.

### Slice 10 — UX, framework, and portfolio cleanup

**Goal:** present one best-in-class renovation experience.

**Implementation status (2026-07-29):** Implemented. The canonical property-scoped workspace
now owns stage navigation, lifecycle questions, one primary next action, progressive trust
details, partial-failure handling, and specialist-record links. Discovery and Home Action
routes resolve to the case workspace; Home Upgrades and Renovation Advisor survive only as
compatibility redirects.

Deliver:

- Renovation workspace with stage navigation and one next action;
- homeowner-question content contract across all states;
- progressive readiness and trust details;
- contextual discovery and canonical Home Action adapters;
- remove permanent passive cards and parallel priority systems;
- update capability definitions, safety, completion, relationships, and routes;
- retire standalone Home Upgrades and Renovation Advisor destinations;
- retain specialized property-wide Permit, HOA, Projects, and Materials views;
- accessibility, responsive, loading, partial-failure, and empty-state QA;
- telemetry and operational dashboards;
- update functional and API documentation; and
- final Product Framework conformance review.

Exit criteria:

- one renovation journey is visible to the homeowner;
- specialized records remain accessible without becoming separate plans;
- Home promotes only actionable changes; and
- obsolete routes and contracts are no longer discoverable.

### Slice 11 — Acceptance measurement and operational health

**Goal:** make the acceptance, measurement, and operational requirements in
Sections 11–13 inspectable without changing homeowner records.

**Implementation status (2026-07-29):** Implemented.

Deliver:

- an admin-only renovation health read model using the existing analytics MFA,
  ADMIN-role, and `ANALYTICS_VIEW` capability gates;
- lifecycle distribution and verified-closeout measurement;
- separate counts for not-evaluated readiness, blocking readiness, unresolved
  and stale requirements, overdue conditions, unknown Project applicability,
  missing scopes, and reconciliation failures;
- deduplicated operational alerts with exact next actions;
- explicit guardrails that keep completed-with-open-items separate from
  verified completion; and
- loading, failure, empty, and healthy states in Admin Analytics.

Exit criteria:

- operators can see the renovation funnel and current trust queues;
- projection failures and overdue blockers are actionable;
- missing data never appears as official status; and
- the endpoint is read-only and covered by aggregation and authorization
  contract tests.

### Slice 12 — Browser acceptance and accessibility gate

**Goal:** turn the highest-risk UX acceptance requirements into a repeatable
production-build browser gate.

**Implementation status (2026-07-29):** Implemented.

Deliver:

- deterministic authenticated renovation API fixtures;
- canonical list-to-case and one-primary-next-action coverage;
- honest empty and independently degraded supporting-data states;
- legacy advisor redirect coverage;
- desktop Chromium, Firefox, and WebKit coverage;
- mobile Chrome and WebKit responsive/overflow coverage;
- keyboard focus and WCAG 2 A/AA automated checks; and
- an isolated `npm run test:renovations:e2e` acceptance command.

Exit criteria:

- the production build passes all configured desktop and mobile browser projects;
- accessibility failures expose and fix shared-shell defects instead of being
  excluded from the scan;
- a supporting API failure does not hide the durable renovation case; and
- the legacy property-scoped advisor route resolves to the canonical workspace.

### Slice 13 — Truthful requirements recovery and CI enforcement

**Goal:** prevent a requirements outage from appearing as a successful empty
research state and make the browser contract a required quality gate.

**Implementation status (2026-07-29):** Implemented.

Deliver:

- treat malformed or unsuccessful requirements responses as load failures;
- keep authority and requirement mutation controls hidden until the governing
  requirements read succeeds;
- expose an accessible retry action without relabeling failure as “no research”;
- verify recovery from a transient requirements failure in the cross-browser
  acceptance suite; and
- run the renovation browser suite in frontend CI for pushes and pull requests
  targeting `main`.

Exit criteria:

- an unavailable requirements source never renders the successful empty state;
- a retry can recover without reloading the whole application;
- mutation failures remain distinct from initial-load failures; and
- CI blocks changes that break the renovation truth, accessibility, redirect,
  or responsive contracts.

---

## 11. Acceptance Strategy

### 11.1 Golden lifecycle scenarios

1. Explore kitchen options → select one → define scope → create case.
2. Advisor suggests a possible permit → homeowner confirms authority → records
   “not required” with source → readiness updates.
3. Exterior project → HOA guideline extracted → homeowner confirms rule →
   application submitted → approval with conditions → conditions enter Project.
4. Permit required → application/corrections/issuance → inspections →
   authority-observed finalization → closeout.
5. User marks every tracked inspection passed without official evidence →
   permit remains not officially finaled.
6. Project with no permit determination → completion check is not evaluated and
   provides the exact next action.
7. Scope change moves plumbing → affected requirements, permit, cost, and
   materials are re-evaluated.
8. Material substitution → homeowner/HOA approval → installed evidence →
   as-built record.
9. Project verified complete with one failed final inspection → case becomes
   completed with open items, not verified complete.
10. Already-started work → catch-up requirements → existing permit linked →
    Project continues without fabricated prior history.
11. Prior-owner improvement → no permit found in configured sources → honest
    unknown state → research/remediation path.
12. Same permit appears from open data and manual entry → one reconciled record
    with source history.

### 11.2 Contract and integration tests

- exhaustive enum mappings;
- same-property and same-scope validation;
- advisory/reported/official status separation;
- authority-source precedence and staleness;
- scope-version invalidation;
- one Project per active case execution unless explicitly split;
- idempotent event handling and write-backs;
- Permit-to-Project projection;
- HOA-condition projection;
- completion applicability with empty collections;
- partial closeout;
- household authorization;
- instance governance;
- document/evidence access;
- retry after downstream failure; and
- no duplicate Home Actions.

### 11.3 UX acceptance

For every stage verify that a homeowner can answer:

- What is this?
- How will it benefit me?
- What should I add to improve the result?
- What should I care about now?
- What can I control?
- What is known, inferred, reported, or official?
- What is the next action?

Also verify keyboard, screen reader, focus, zoom, mobile, reduced motion,
loading, partial failure, unsupported jurisdiction, empty, stale, and offline
retry states.

### 11.4 Safety and trust red-team scenarios

- AI says a permit is not required when local authority says it is;
- homeowner selects “approved” without evidence;
- contractor reports an inspection passed;
- photo review misses concealed work;
- open data omits a permit;
- permit belongs to a different property;
- approval covered an earlier scope version;
- unsafe structural/electrical/gas condition appears in a low-risk case;
- provider commercial ranking conflicts with safety advice; and
- official source reverses or expires a prior status.

---

## 12. Measurement

### 12.1 North-star measure

**Renovation cases reaching verified closeout with required decisions and
durable as-built records, without duplicate homeowner tracking.**

### 12.2 Funnel

- upgrade option understood;
- option saved and case created;
- scope sufficiently defined;
- requirements evaluated;
- unknown-to-confirmed requirement conversion;
- approval/permit cycle time;
- ready-to-start rate;
- ready-to-start to execution;
- change-order recheck completion;
- inspection/correction resolution;
- Project completion;
- verified case closeout;
- installed material completeness; and
- downstream write-back success.

### 12.3 Trust and quality

- false official-status incidents;
- enum/action mapping misses;
- projects with unknown permit or HOA applicability;
- Project/Permit status disagreements;
- stale authority evidence;
- approval attached to wrong scope version;
- cross-property link rejection;
- false unpermitted-work flags;
- completion with unresolved required records;
- duplicate cases/projects/permits;
- write-back reconciliation failures; and
- homeowner corrections to generated requirements.

### 12.4 Guardrails

Do not optimize:

- advisor runs;
- AI recommendations generated;
- total estimated project value;
- average ROI;
- permit or HOA records created;
- “ready” rates achieved by marking requirements not applicable;
- inspections called ready by AI;
- projects started before readiness;
- page views; or
- notification volume.

---

## 13. Operational Requirements

- Every authority/source adapter exposes coverage, health, latency, freshness,
  and last error.
- Source unavailability is distinct from no records and from no requirement.
- Every status transition preserves actor, source, evidence, and time.
- Every cross-domain side effect has an idempotency key.
- Scope-change invalidation is deterministic and inspectable.
- Reconciliation failures are retryable and visible to support/admin users.
- Official-source updates never silently overwrite contradictory homeowner
  evidence; they create a reviewed conflict.
- Capability kill switches stop new evaluations without deleting case history.
- Notification delivery is downstream of durable state.
- Sensitive documents and contractor/financial data follow household
  authorization.
- Admin tooling can inspect the entire case graph and replay failed write-backs.
- Rules, disclaimers, cost models, and provider versions are preserved per
  evaluation.

---

## 14. Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Renovation Case becomes a seventh disconnected tool | Cut planning and execution entry points to the case and retire standalone plan routes |
| Product implies legal compliance | Explicit truth layers; authority attribution; prohibited vocabulary without official evidence |
| Requirements model becomes a giant universal checklist | Instance applicability, progressive questions, and one-next-action presentation |
| Homeowner is blocked from tracking work | Allow catch-up and governed overrides without using “ready/compliant” language |
| Permit and Project remain dual authorities | Permit owns inspection status; Project consumes a projection |
| Scope changes invalidate too much | Typed impact rules and version-specific invalidation |
| AI document extraction invents requirements | Candidate extraction, citation, confidence, homeowner review, authority confirmation |
| Material workflow burdens small projects | Require cases only for material work; keep simple as-built capture for routine repairs |
| No migration hides relationship defects | Deterministic fixtures and full lifecycle tests before schema push |
| Too many Home Actions | One case-level next action plus exceptional safety/deadline blockers |
| Commercial provider incentives affect advice | Separate recommendation governance and disclose commercial relationships |

---

## 15. Documentation Impact

Update during implementation:

- Product Framework capability definitions and relationships;
- current capability inventory;
- Renovation Risk Advisor functional documentation;
- Permit Tracker functional documentation;
- HOA functional/API documentation;
- Project Tracker functional/API documentation;
- Material Spec Registry documentation;
- Home Upgrades documentation or retirement record;
- Property Context fact/readiness catalog;
- Home Operations source adapter documentation;
- event and reconciliation contracts;
- safety and official-status vocabulary;
- deployment/configuration documentation for jurisdiction sources; and
- schema-push instructions when Prisma changes land.

Do not publish configuration keys for sources or automations until the slice that
consumes them is implemented and has a documented disabled/unsupported state.

---

## 16. Repository Evidence Reviewed

Primary evidence:

- `docs/product/CAPABILITY_OUTCOME_AND_EXPERIENCE_AUDIT_FRAMEWORK.md`
- `docs/product/ContractToCozy_Product_Framework.md`
- `docs/product/capability-discovery/current-capability-inventory.md`
- `docs/functional/HOME_RENOVATION_RISK_ADVISOR.md`
- `docs/functional/PERMIT_HISTORY_TRACKER.md`
- `docs/functional/MATERIAL_SPEC_REGISTRY.md`
- `apps/backend/prisma/schema.prisma`
- `apps/backend/src/productFramework/capabilities/definitions/planBudget.ts`
- `apps/backend/src/productFramework/capabilities/definitions/understandHome.ts`
- `apps/backend/src/productFramework/capabilities/definitions/capabilityDefinitionFactory.ts`
- `apps/backend/src/homeRenovationAdvisor/engine`
- `apps/backend/src/homeRenovationAdvisor/integrations/advisorIntegration.service.ts`
- `apps/backend/src/services/homeModificationAdvisor.service.ts`
- `apps/backend/src/services/homeModification/applicabilityPolicy.ts`
- `apps/backend/src/services/permitTracker.service.ts`
- `apps/backend/src/services/hoaCompliance.service.ts`
- `apps/backend/src/services/projectTracker.service.ts`
- `apps/backend/src/routes/homeModification.routes.ts`
- `apps/backend/src/routes/permitTracker.routes.ts`
- `apps/backend/src/routes/hoaCompliance.routes.ts`
- `apps/frontend/src/components/HomeModificationAdvisor.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/modifications/page.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/home-renovation-risk-advisor/HomeRenovationRiskAdvisorPageClient.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/permits/page.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/hoa/page.tsx`
- `apps/frontend/src/components/features/permits/InspectionReadinessModal.tsx`
- `apps/frontend/src/components/features/hoa/ApprovalRecordList.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/projects`
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/materials/MaterialSpecsClient.tsx`

---

## 17. Definition of Done

This outcome family is best in class only when:

1. one accepted renovation has one durable case and versioned scope;
2. every requirement distinguishes advisory, reported, documented, and official
   truth;
3. the homeowner knows the next action, why it matters, who owns it, and what
   evidence resolves it;
4. a Project cannot appear ready or complete because an applicable record is
   absent;
5. Permit Tracker and Project Tracker cannot silently disagree;
6. HOA decisions and conditions are tied to the exact scope they cover;
7. changes trigger only the necessary re-evaluations and reapprovals;
8. proposed, substituted, installed, and as-built materials are distinct;
9. verified completion updates the Living Home Record and preserves unresolved
   items;
10. Home promotes only meaningful renovation decisions, blockers, deadlines, or
    changes;
11. no AI, homeowner, or contractor action is presented as an authority,
    association, or inspector decision;
12. all six current contributors answer the homeowner-question contract through
    one coherent experience;
13. Product Framework completion and safety contracts match real behavior;
14. accessibility, partial failure, stale-source, unsupported-jurisdiction, and
    historical-work states pass acceptance; and
15. redundant standalone planning/advisor routes and lifecycle contracts are
    retired.
