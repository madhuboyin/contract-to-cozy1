# Home Operations and Action Management Capability Audit and Implementation Plan

**Capabilities:** Guidance Overview, Status Board, maintenance tasks, seasonal
maintenance, Home Habit Coach, Inspection Hub, Project Tracker, canonical Home
Actions, and the Prioritized Action Plan<br>
**Contributing domains:** Property Context, Inventory, Risk, Coverage, Incidents,
Bookings, Providers, Documents, Home Timeline, Home Digital Twin, Capital
Planning, Service Price Radar, and Notifications<br>
**Audit framework:** `CAPABILITY_OUTCOME_AND_EXPERIENCE_AUDIT_FRAMEWORK.md`<br>
**Audit date:** July 29, 2026<br>
**Status:** Recommended implementation plan<br>
**Recommended disposition:** **Consolidate action management, keep domain
workspaces, merge seasonal and habit execution into Maintenance, and make
completion reconcile every source**<br>
**Current safety classification:** Predominantly low consequence at the
capability level<br>
**Recommended safety classification:** Instance-based, ranging from low
consequence through material financial and safety/emergency<br>
**Primary outcome family:** Home Operations and Action Management

---

## 1. Executive Decision

ContractToCozy has many of the components required for a strong home operations
system, but it does not yet have one operational model.

Today, the same homeowner obligation can exist as:

- a Guidance signal, journey, and incomplete step;
- a Status Board item marked `ACTION_NEEDED`;
- an orchestrated risk or checklist action;
- a canonical Home Action projection;
- a maintenance task;
- a seasonal checklist item and its linked maintenance task;
- a generated property habit;
- an inspection finding;
- a project, milestone, issue, or follow-up task; and
- an action event that says the item was completed, dismissed, or snoozed.

Some of these links are deliberate and useful. Others are parallel lifecycle
systems. As a result:

- Home may promote one representation while the homeowner executes another;
- converting an action to a maintenance task can suppress the source action
  without promoting the task itself as the continuing operational record;
- completing a Home Action can hide its projection without completing the
  underlying journey, task, finding, or project;
- a Guidance journey and the Project created from it can both appear as open;
- seasonal work has two user-visible records even though the implementation
  already auto-promotes it into Maintenance;
- habits are generated, ranked, completed, snoozed, skipped, and dismissed in a
  separate lifecycle that is not part of canonical Home Actions;
- confirmed inspection findings do not generally enter the canonical Home
  Action feed;
- verified project completion performs rich write-backs but does not
  consistently close the originating Guidance journey or canonical action; and
- Status Board independently computes and presents a “priority action,” even
  though the Product Framework assigns priority to Home Actions.

The homeowner job is:

> Tell me what this home needs, why it matters, what to do next, who owns it,
> and when it is due; help me carry the work from recommendation through task or
> project; then recognize completion everywhere without making me close the same
> issue twice.

The repository contains strong foundations:

- a canonical `HomeAction` response contract with evidence, assumptions,
  timing, confidence, governance, actions, and feedback controls;
- a Unified Home surface and a full Prioritized Action Plan;
- source adapters for Guidance, incidents, recalls, coverage, seasonal work,
  personalization, projects, and other outcome families;
- ranking, grouped presentation, suppression, snooze, and telemetry;
- property-scoped maintenance tasks with assignment, recurrence, due dates,
  cost, booking, warranty, inventory, seasonal, recall, and radar links;
- automatic seasonal-to-maintenance promotion and bidirectional seasonal
  completion synchronization;
- Guidance journeys with ordered steps, evidence, governance, branching,
  readiness, and completion events;
- Status Board projections from Inventory and shared signals;
- property-specific habits with applicability, ranking, cooldowns, history,
  preferences, and lifecycle actions;
- inspection report extraction, homeowner confirmation, structured findings,
  dispositions, write-backs, and project-resolution linkage;
- a sophisticated Project Tracker with milestones, payments, change orders,
  issues, evidence, verified completion, and broad write-backs; and
- household authorization on canonical Home Action commands.

Those foundations do not yet satisfy the Home Operations outcome.

The recommended product decision is:

1. evolve the existing **Prioritized Action Plan** into the canonical **Home
   Operations** workspace rather than create another dashboard;
2. preserve source-domain records but create one durable **Operational Work
   Item** identity and lifecycle for homeowner work;
3. make Home show only a small ranked projection of those work items;
4. make Maintenance the canonical engine for atomic and recurring work;
5. make seasonal checklists a time-based Maintenance view and template source,
   not a parallel task list;
6. make Home Habit Coach a recommendation and routine-building layer inside
   Maintenance, not an independent completion system;
7. make Guidance the choreography for complex decisions and resolutions, not a
   second backlog;
8. make Inspection Hub the evidence and finding authority, with explicit
   conversion of confirmed findings into work;
9. make Project Tracker the execution container for multi-step work, while the
   originating work item becomes `IN_PROJECT`;
10. make Status Board the condition and readiness view for home systems, not a
    competing priority engine;
11. reconcile completion from the authoritative execution record back to the
    finding, task, journey, signal, Home Action, Status Board, and Home Timeline;
12. use instance-level safety and financial governance;
13. give the homeowner durable controls for accept, schedule, assign, snooze,
    dismiss, mark not applicable, convert, complete, reopen, and correct facts;
14. distinguish recommendation, accepted work, execution, evidence, and
    verified outcome; and
15. measure completed and verified home outcomes rather than route views or
    generated records.

The target promise should be:

> See what your home needs, turn the right recommendations into scheduled work,
> manage tasks and projects in one place, and have completion update the whole
> home record automatically.

### 1.1 Implementation constraint

There are no real users and no production data migration requirement.

Implementation may change the Prisma schema directly. It must not create:

- database migration scripts;
- historical backfills;
- compatibility tables for obsolete action or task identities;
- dual-write behavior solely to preserve parallel completion models;
- synthetic task, habit, finding, project, or completion history; or
- legacy fields solely to preserve the current fragmented contracts.

The user will reconcile the database separately after schema changes.

Use this constraint to establish one clean operational model. Do not preserve
contradictory lifecycle semantics for data that does not need to be retained.

---

## 2. Scope and Portfolio Boundaries

### 2.1 In scope

| Area | Current responsibility | Target responsibility |
| --- | --- | --- |
| Unified Home | Shows up to five ranked Home Actions | Shows the most important actionable work and active major moment |
| Prioritized Action Plan | Full ranked projection feed | Canonical Home Operations workspace |
| Canonical Home Actions | Transient normalized recommendation contract | Durable work identity plus a current presentation projection |
| Guidance Overview | Selects or resumes guided journeys | Choreographs complex resolution attached to one work item |
| Status Board | Computes condition and a local priority action | Shows system health, condition, readiness, and contributing evidence |
| Maintenance | Tracks atomic, recurring, seasonal, and generated tasks | Canonical task execution engine |
| Seasonal Maintenance | Generates and manages seasonal checklist items | Seasonal view and applicability source for Maintenance |
| Home Habit Coach | Separate generated-habit lifecycle | Routine recommendation/adoption layer for Maintenance |
| Inspection Hub | Extracts and tracks inspection findings | Evidence/finding authority with explicit work conversion and resolution |
| Project Tracker | Executes contractor projects | Multi-step execution container attached to one or more work items |

### 2.2 Adjacent but not owned

The following capabilities contribute triggers, context, or execution but retain
their domain ownership:

- Home Event Radar and incidents;
- risk and coverage capabilities;
- Home Digital Twin and Inventory;
- Service Price Radar, providers, and bookings;
- Capital Decision Planning;
- Property Tax and savings;
- permits, HOA, warranties, and documents;
- Home Timeline; and
- notifications and household roles.

They must integrate through the operational contract rather than create their
own task or completion systems.

### 2.3 Explicit non-goals

This review does not recommend:

- merging Inventory, Status Board, Inspection Hub, and Projects into one table;
- turning every signal into a task;
- showing every open maintenance task on Home;
- automatically treating an extracted inspection finding as accepted work;
- treating a recommendation view as completion;
- making a safety issue dismissible merely because the enclosing capability is
  classified as low consequence;
- replacing Project Tracker milestones with maintenance tasks;
- building another “Action Center” route; or
- making users understand internal entities such as source families, lineage,
  orchestration, signals, or readiness states.

---

## 3. Repository-Backed Current-State Map

### 3.1 Registered capability contract

The generated capability inventory currently records:

| Capability | Outcome category | Mode | Safety | Completion |
| --- | --- | --- | --- | --- |
| Guidance Overview | `PROTECT_MONITOR` | Catalog only | Low consequence | Output viewed |
| Status Board | `PLAN_BUDGET` | Contextual | Low consequence | Plan created |
| Home Habit Coach | `MAINTAIN_PREVENT` | Contextual | Low consequence | Action initiated |
| Inspection Hub | `PLAN_BUDGET` | Contextual | Low consequence | Artifact created |
| Project Tracker | `PLAN_BUDGET` | Contextual | Low consequence | Action completed |

Maintenance and seasonal tasks are operating systems and routes but are not
represented as one first-class portfolio capability in this set.

The registrations reveal contract mismatches:

- Guidance is promoted into Home through active journeys even though the
  registered capability completion is only an output view.
- Status Board does not create the operational plan it claims as completion.
- Inspection extraction creates an artifact, but the stated homeowner outcome
  includes durable follow-up actions.
- Project Tracker’s current completion signal permits creation with a milestone
  or progress, while the capability kind says action completed.
- Home Habit Coach defines no explicit Living Home Record read/write contract
  and remains isolated from Maintenance.
- capability-wide low-consequence classification is not safe for all findings,
  tasks, projects, or guidance steps.

### 3.2 Current object and lifecycle map

```text
Signals / status / recommendations
  ├─ GuidanceSignal → GuidanceJourney → GuidanceJourneyStep
  ├─ Risk / checklist → OrchestratedAction
  ├─ Status Board computed condition/recommendation
  ├─ SeasonalTaskTemplate → SeasonalChecklistItem
  ├─ HabitTemplate → PropertyHabit
  └─ InspectionReport → InspectionFinding

Home projection
  ├─ source adapters → HomeAction
  ├─ rank + presentation deduplication
  ├─ snooze / dismiss / mark-complete events
  └─ Unified Home + Prioritized Action Plan

Execution
  ├─ PropertyMaintenanceTask
  ├─ Guidance journey steps
  ├─ ProjectRecord + milestones/issues/payments
  ├─ Booking / provider work
  └─ Inspection finding disposition/resolution

Outcome evidence
  ├─ completion metadata and photos
  ├─ verified project completion
  ├─ InspectionWriteBack / ProjectWriteBack
  ├─ HomeEvent
  └─ updates to Inventory, documents, warranty, cost, and future care
```

The system contains bridges, but no single authoritative identity spans this
entire graph.

### 3.3 What already works well

1. **Home Action explanation is structurally strong.** The response includes
   why it matters, next action, expected outcome, timing, evidence, assumptions,
   confidence, governance, CTAs, and controls.
2. **Home ranking is centralized.** Consequence, urgency, confidence,
   homeowner job, actionability, and missing-context penalties contribute to a
   shared score.
3. **Home has a bounded primary surface.** Unified Home shows a limited set and
   links to the complete action plan.
4. **Seasonal integration is more mature than its UI boundary suggests.**
   Generated items are auto-promoted into maintenance, deliberate removal is
   remembered, and completion/uncompletion can synchronize.
5. **Maintenance supports real execution details.** It has assignment,
   recurrence, due date, cost, source, inventory, booking, warranty, recall,
   radar, and seasonal relationships.
6. **Guidance has real choreography.** Journeys have ordered steps, required
   context, blocking, branching, evidence, governance, and event history.
7. **Inspection findings are durable.** They survive the report and can hold
   disposition, cost range, severity, resolution, and project linkage.
8. **Project Tracker closes a substantial record loop.** Verified completion
   can update Home Events, documents, expenses, warranties, Inventory,
   materials, future-care tasks, reviews, and linked findings.
9. **Project creation has useful deduplication.** A Guidance journey can have
   only one project, and project creation checks for active overlapping work.
10. **Authorization exists.** Home Action mutations require household
    contributor access.

---

## 4. Scorecard and Portfolio Disposition

| Dimension | Weight | Current score | Evidence-based assessment |
| --- | ---: | ---: | --- |
| Homeowner value and differentiation | 20 | 15 | Strong breadth and high-value operational promise, but fragmented |
| Functional completeness | 20 | 12 | Rich domain functions; no end-to-end authoritative work lifecycle |
| Actionability and closed-loop completion | 15 | 8 | Many actions exist; completion propagation is inconsistent |
| Data quality, freshness, and trust | 15 | 10 | Good evidence foundations; weak instance governance and identity |
| UX clarity and readiness | 15 | 9 | Several polished routes; portfolio mental model is unclear |
| Product Framework integration | 10 | 6 | Home Actions exist, but parallel priorities and lifecycle systems remain |
| Accessibility, performance, reliability | 5 | 3 | Some explicit accessibility and loading behavior; cross-workflow tests are limited |
| **Total** | **100** | **63** | **Improve by consolidating the operating model** |

### 4.1 Disposition by capability

| Capability | Decision | Rationale |
| --- | --- | --- |
| Prioritized Action Plan | **Double down / rename** | It is the correct foundation for Home Operations |
| Canonical Home Actions | **Double down / persist lifecycle** | Correct normalization contract; currently too projection-oriented |
| Maintenance | **Double down** | Best existing atomic execution engine |
| Seasonal Maintenance | **Merge into Maintenance** | Already materializes maintenance tasks; parallel checklist presentation is redundant |
| Home Habit Coach | **Merge and reposition** | Keep applicability and behavior intelligence; remove separate work lifecycle |
| Guidance Overview | **Reposition** | Keep as journey detail/choreography, not a general signal dashboard |
| Status Board | **Reposition** | Keep as system health/readiness, remove competing action priority |
| Inspection Hub | **Improve** | Strong evidence capture; incomplete canonical action handoff |
| Project Tracker | **Double down / integrate** | Strong execution and write-backs; needs source-work closure |

---

## 5. Material Functionality Gaps

### 5.1 No authoritative operational work identity

`HomeAction` has `id`, `lineageId`, source identity, state, and priority, but it
is assembled as a response projection. `OrchestrationActionEvent` and snooze
records use an `actionKey`; Maintenance uses an optional `actionKey`; Guidance,
habits, findings, and Projects keep their own states.

This creates multiple answers to:

- Is this accepted work?
- Is it scheduled?
- Who owns it?
- Is it in a project?
- Was it completed?
- Was completion verified?
- Should it remain on Home?
- Should the originating signal be resolved or re-evaluated?

**Required change:** introduce one durable property-scoped operational work
identity that links every representation without replacing domain truth.

### 5.2 Presentation deduplication is not lifecycle reconciliation

Home ranks and deduplicates candidates using a canonical key. Coverage has a
special item key; other actions prefer a normalized signal string before
falling back to lineage.

Consequences:

- two phrasings of the same issue may not merge;
- two unrelated issues with identical copy can merge;
- a Guidance journey and its Project can use the same lineage but different
  signals and both surface;
- merged action IDs are telemetry/presentation metadata, not durable source
  supersession; and
- commands apply to the winning action ID rather than the operational lineage.

**Required change:** deduplicate by durable work/subject/obligation identity,
with presentation copy only as a last-resort containment heuristic.

### 5.3 Home Action commands can create false completion

For most promoted actions, `COMPLETE` or `ALREADY_DONE` writes a
`USER_MARKED_COMPLETE` action event. It does not update the underlying Guidance
step, maintenance task, finding, Project, or source recommendation.

This is safe only if the command means “hide this suggestion.” It is not safe
when the UI communicates completed work.

**Required change:**

- `COMPLETE` must invoke the authoritative domain completion adapter;
- if no adapter exists, use `ACKNOWLEDGE` or `REMOVE_FROM_HOME`, not complete;
- material or safety work must require evidence or an explicit verified
  authority;
- source closure and work closure must be transactionally or reliably
  event-driven; and
- re-evaluation must reopen work when the underlying condition remains.

### 5.4 Accepted maintenance work can disappear from Home continuity

Orchestrated risk/checklist actions can be converted to maintenance tasks.
Existing suppression logic then hides the source action because it is already
tracked. The Home projection primarily adapts risk/checklist actions rather
than loading every accepted maintenance task as the continuing work item.

The homeowner can therefore act correctly and lose the item from the primary
operational narrative until they find Maintenance.

**Required change:** conversion must change the same work item from
`RECOMMENDED` to `ACCEPTED/SCHEDULED`, with Maintenance as its execution record.

### 5.5 Maintenance has inconsistent mutation paths

`updateTaskStatus` synchronizes linked seasonal state, triggers analytics,
Radar reconciliation, adherence signals, and project follow-up behavior.
The general `updateTask` path can also change status but does not execute the
same seasonal and completion logic.

**Required change:** all task status transitions must pass through one domain
transition service with idempotent side effects. Generic CRUD must not bypass
lifecycle rules.

### 5.6 Seasonal work is both a checklist and a task

Each applicable seasonal item can be automatically promoted to a
`PropertyMaintenanceTask`, while the seasonal page continues to expose its own
status, completion, dismissal, snooze, counts, and add/remove semantics.

The bridge is thoughtful, but the user still sees two work systems.

**Required change:**

- keep seasonal templates and applicability;
- use one maintenance task as the accepted/executable record;
- make “Seasonal” a saved view over those tasks;
- represent “not for my home,” “skip this season,” and “snooze” as explicit
  applicability/work controls;
- calculate seasonal progress from canonical task outcomes; and
- do not show an aggregate seasonal Home Action plus individually promoted
  seasonal tasks at the same time.

### 5.7 Home Habit Coach is a parallel recurring-work engine

Property habits have active, completed, snoozed, skipped, dismissed, and
reopened states, their own action history, ranking, preferences, generation,
cooldowns, and due dates. They are not loaded by canonical Home Action
promotion and are not materialized into Maintenance.

The useful differentiation is recommendation timing, routine formation,
friction, encouragement, and applicability—not a second task database.

**Required change:**

- habits begin as recommendations, not accepted work;
- “Add to my routine” creates or links a recurring maintenance task;
- completion occurs in Maintenance and feeds habit adherence/history;
- Habit Coach becomes a Maintenance “Routines” experience;
- skip/dismiss feedback tunes future recommendations without closing unrelated
  maintenance obligations; and
- critical, regulated, or one-time work must never be framed as a habit.

### 5.8 Inspection findings do not reliably enter Home Operations

Inspection Hub creates structured findings with severity, estimated cost,
status, disposition, and resolution fields. Specialized buyer workflows can
create journeys and maintenance records, and Projects can resolve linked
findings. The general Home Action promotion service does not adapt inspection
findings.

**Required change:**

- confirmation creates candidate work only for actionable findings;
- homeowner review distinguishes accept, monitor, duplicate, already resolved,
  not applicable, and correct extraction;
- accepted minor findings create/link maintenance tasks;
- complex, material, or safety findings create/link Guidance;
- multi-step execution creates/links a Project;
- the finding remains the evidence authority; and
- the work item remains the operational authority.

### 5.9 Guidance is a journey and a backlog

Home promotes the next incomplete step of every active Guidance journey.
Guidance Overview also presents active signals and next steps. Projects linked
to journeys are separately promoted.

This can duplicate the same homeowner obligation at journey and execution
levels.

**Required change:**

- one work item owns Home placement;
- Guidance owns decision/resolution choreography under that work item;
- when a Project starts, the work item becomes `IN_PROJECT` and Home shows the
  Project’s true blocker or next milestone;
- the Guidance journey remains available as context, not a separate action;
- tool-specific steps complete only from authoritative domain events; and
- project verified completion completes the relevant journey step/journey or
  records a governed exception.

### 5.10 Guidance completion can overstate verified resolution

For user-initiated journeys, journey completion hooks can mark an Inventory item
`NEW` or `GOOD` and create a verified resolution Home Event. The hook infers the
outcome from a journey verdict and completed required steps.

That is appropriate only if the execution and evidence steps truly establish
the physical result. A manually advanced journey must not certify an asset.

**Required change:** separate:

- decision complete;
- plan complete;
- work reported complete;
- work evidence received; and
- outcome verified.

Only the final state can update physical condition as verified.

### 5.11 Status Board creates a competing priority system

Status Board computes condition, recommendation, category weighting, pinning,
and a local “priority action.” It also contributes decision candidates such as
risk, cost, and maintenance pressure.

The Product Framework states that Home Actions determine what matters.

**Required change:**

- Status Board owns system condition and readiness;
- Home Operations owns operational priority;
- Status Board may show “needs attention” as a condition filter;
- its primary CTA opens the canonical work item when one exists;
- it must not independently tell the homeowner that a different item is the
  top action; and
- pinned system visibility must not raise operational urgency.

### 5.12 Project completion is rich but source closure is incomplete

Verified project completion updates many downstream records and linked findings.
It also creates future-care maintenance tasks. However, the completion path does
not consistently close the linked Guidance journey, source Home Action,
maintenance task, or original signal.

**Required change:** Project completion must publish one idempotent verified
outcome event consumed by all linked source domains.

### 5.13 Project governance is not instance-sensitive

Project Tracker is registered as low consequence, while a Project can include:

- high contract value;
- contractor credentials and commercial selection;
- blocking safety issues;
- payments and change orders;
- permits and inspections;
- financing or coverage implications; and
- unsafe, failed, disputed, or incomplete outcomes.

**Required change:** derive governance at the work/project instance:

| Situation | Minimum tier |
| --- | --- |
| Simple recordkeeping or low-risk task | Low consequence |
| Material quote, contract, payment, financing, or replacement decision | Material financial |
| Coverage-dependent work | Regulated coverage |
| Unsafe condition, emergency, or critical inspection finding | Safety/emergency |

### 5.14 Household coordination is incomplete

Maintenance has an assignee, but canonical Home Actions, Guidance, habits,
findings, and Projects do not expose one consistent owner/watchers/approval
model.

**Required change:** work items need:

- responsible household member;
- watchers;
- due window and reminders;
- contributor vs manager permissions;
- completion authority;
- optional approval for material actions; and
- an audit trail of reassignment and decisions.

### 5.15 Reminder and recurrence semantics are fragmented

Maintenance reminders, seasonal timing, habit cadence/cooldown, project
milestones, Guidance blocks, and Home Action snoozes use different clocks.

**Required change:** define:

- `dueWindowStart`, `dueAt`, and `dueWindowEnd`;
- recurrence template vs occurrence;
- snooze vs reschedule vs defer;
- next review vs next execution;
- reminder policy; and
- how late completion affects the next occurrence.

### 5.16 “No actions” can imply too much

The action plan empty state says no action currently needs attention. That may
mean no eligible candidates, failed source materialization, low readiness,
suppressed actions, or a truly clear queue.

**Required change:** distinguish:

- all caught up;
- no accepted work yet;
- source evaluation pending;
- missing facts limiting recommendations;
- recommendations paused;
- data unavailable; and
- filtered empty.

Do not translate system silence into a home-health guarantee.

### 5.17 Completion analytics are not one outcome contract

Current capability completion kinds include output viewed, plan created,
artifact created, action initiated, and action completed. Individual services
emit domain analytics, while Home emits action and resolution lineage events.

**Required change:** measure the shared funnel:

```text
candidate detected
→ homeowner understood
→ work accepted
→ scheduled/assigned
→ execution started
→ reported complete
→ evidence received
→ outcome verified
→ source condition reconciled
→ recurrence or follow-up created
```

---

## 6. Homeowner Experience Audit

### 6.1 “What is this?”

**Current answer:** spread across “Guidance,” “Status,” “Maintenance,”
“Seasonal,” “Habit,” “Inspection,” “Project,” and “Action Plan.”

**Gap:** internal workflow and route names define the experience.

**Target answer:**

> Home Operations keeps all the work your home needs in one place—from a quick
> seasonal task to a contractor project.

Domain pages should then explain their supporting role:

- **Systems:** “See how your home’s important systems are doing.”
- **Guided plan:** “Work through a complex home decision step by step.”
- **Inspections:** “Turn inspection reports into findings you can track.”
- **Projects:** “Manage scope, milestones, money, and proof through completion.”

### 6.2 “How will this benefit me?”

The target first screen should state:

> Avoid forgotten upkeep and duplicate work. Know what matters now, what can
> wait, who owns it, and what changed when the work was completed.

Do not claim savings or avoided damage without evidence. Show realized benefits
when available:

- tasks completed on time;
- overdue work cleared;
- findings resolved;
- project variance;
- repeat issue avoided;
- warranty or proof captured; and
- home facts improved by completion.

### 6.3 “What should I do to realize the full benefit?”

Show a compact readiness panel only when it changes the result:

| Missing context | Homeowner explanation | Destination |
| --- | --- | --- |
| System identity or age | Helps tailor timing and recurring care | Exact Inventory item editor |
| Location or climate context | Makes seasonal work relevant | Exact Property Context editor |
| Inspection report | Converts professional evidence into trackable findings | Inspection upload |
| Due date or owner | Makes accepted work schedulable | Inline work-item control |
| Project scope or contract | Enables milestone, payment, and change tracking | Project setup |
| Completion evidence | Allows verified closure and record updates | Task/project completion |

Never use generic “setup needed.” Never redirect to a fictional consolidated
Home Record page. Link to the actual canonical editor for the fact.

### 6.4 “What should I care about?”

Home Operations should lead with:

1. one urgent safety or damage-prevention item, if present;
2. time-sensitive due or blocked work;
3. the active major project or complex journey;
4. upcoming recurring and seasonal work; and
5. optional recommendations to adopt.

Each row answers:

- what needs attention;
- what can happen if it is ignored;
- why it applies to this home;
- when to act;
- who owns it;
- current progress;
- confidence or missing evidence; and
- one next move.

### 6.5 “What can I control?”

Controls must depend on lifecycle:

| State | Primary controls |
| --- | --- |
| Recommended | Add to plan, not relevant, correct facts, remind later |
| Accepted | Schedule, assign, set recurrence, convert to project |
| Scheduled | Start, reschedule, reassign, add evidence |
| In progress | Update progress, report blocker, request help |
| In project | Open project, review next milestone/blocker |
| Reported complete | Add proof, verify, reopen |
| Verified | View outcome and record updates, schedule follow-up |
| Deferred | Change revisit date, restore |

Safety and regulated actions require bounded controls and escalation.

### 6.6 “Why should I trust this?”

Progressively disclose:

- originating source and observed date;
- the home facts that made it relevant;
- whether it was generated, homeowner-added, or professional-reported;
- confidence and missing evidence;
- safety/financial boundary;
- commercial relationships;
- who accepted, changed, completed, and verified it;
- completion proof; and
- every downstream write-back.

---

## 7. Target Product Model

### 7.1 Target information architecture

```text
Home
  ├─ What needs attention (maximum ranked set)
  ├─ Active project or guided decision
  └─ Open Home Operations

Plan & Projects
  └─ Home Operations
       ├─ Today
       ├─ Upcoming
       ├─ Routines
       ├─ Projects
       ├─ Waiting / blocked
       └─ Completed

Supporting workspaces
  ├─ Systems / Status Board
  ├─ Guided resolution detail
  ├─ Inspection Hub
  ├─ Project Tracker
  └─ actual canonical fact editors
```

### 7.2 Core semantic model

Do not call every entity a task.

| Entity | Meaning | Authoritative owner |
| --- | --- | --- |
| Signal | Evidence that may require attention | Source domain |
| Recommendation | A safe suggested response not yet accepted | Recommendation/source domain |
| Operational Work Item | One homeowner obligation across its lifecycle | Home Operations |
| Task | An atomic or recurring execution unit | Maintenance |
| Guidance Journey | Ordered decision/resolution choreography | Guidance |
| Finding | Professional or extracted condition evidence | Inspection Hub |
| Project | Multi-step execution container | Project Tracker |
| Outcome | Reported or verified result | Execution domain + Home Operations |
| Home Event | Durable historical fact | Home Timeline |

### 7.3 Operational Work Item

Recommended clean Prisma model:

```text
OperationalWorkItem
  id
  propertyId
  workKey                  // stable property-scoped identity
  subjectType
  subjectId
  obligationType
  state
  acceptanceState
  priority
  safetyTier
  title
  homeownerReason
  expectedOutcome
  dueWindowStart
  dueAt
  dueWindowEnd
  ownerUserId
  sourceVersion
  confidence
  missingContext
  acceptedAt
  startedAt
  reportedCompletedAt
  verifiedAt
  deferredUntil
  dismissedAt
  closedAt
  createdAt
  updatedAt

OperationalWorkSource
  workItemId
  sourceType
  sourceEntityId
  sourceVersion
  sourceRole                // TRIGGER, EVIDENCE, EXECUTION, OUTCOME
  active

OperationalWorkExecution
  workItemId
  executionType             // MAINTENANCE_TASK, GUIDANCE, PROJECT, BOOKING
  executionEntityId
  role                      // PRIMARY, SUPPORTING

OperationalWorkEvent
  workItemId
  eventType
  actorType
  actorUserId
  idempotencyKey
  payload
  occurredAt

OperationalWorkEvidence
  workItemId
  evidenceType
  evidenceEntityId
  verificationStatus
  observedAt
```

Add uniqueness at the operational identity and linkage boundaries. Do not rely
on title equality.

### 7.4 Lifecycle

```text
CANDIDATE
  ├─ NOT_RELEVANT / DUPLICATE / EXPIRED
  └─ ACCEPTED
       ├─ SCHEDULED
       ├─ IN_PROGRESS
       ├─ IN_GUIDANCE
       ├─ IN_PROJECT
       ├─ BLOCKED
       ├─ DEFERRED
       └─ REPORTED_COMPLETE
              ├─ REOPENED
              └─ VERIFIED
                    ├─ FOLLOW_UP_DUE
                    └─ CLOSED
```

State and disposition are separate. `DISMISSED` should not mean the same thing
as `COMPLETED`, `NOT_RELEVANT`, `DUPLICATE`, or `DEFERRED`.

### 7.5 Identity and deduplication

Preferred key components:

```text
property
+ subject
+ obligation
+ occurrence/window
+ source family when obligations are genuinely independent
```

Examples:

- `property:{id}:inventory:{hvacId}:filter-replacement:2026-08`
- `property:{id}:finding:{findingId}:resolve`
- `property:{id}:inventory:{roofId}:replacement-decision`
- `property:{id}:project:{projectId}:execution`

Rules:

1. source adapters propose a `workKey`;
2. an identity resolver merges or links candidates before presentation;
3. one work item may have many triggers and evidence sources;
4. one source can contribute to more than one distinct obligation;
5. conversion adds an execution link; it does not create a competing work
   identity;
6. recurrence creates a new occurrence linked to one template; and
7. deduplication decisions are durable and reversible.

---

## 8. Target Cross-Capability Responsibilities

### 8.1 Unified Home

- Show at most the ranked limit already defined by the Unified Home contract.
- Show only `NOW`/`SOON` work plus one active major moment when justified.
- Do not show passive health, setup, catalog promotion, or every open task.
- Preserve homeowner language, next move, owner, due timing, and progress.
- If execution moves to a Project, render the Project state under the same work
  identity.

### 8.2 Home Operations

- Become the complete work portfolio.
- Support Today, Upcoming, Routines, Projects, Waiting, and Completed views.
- Allow group-by system, room, owner, source, or outcome as secondary controls.
- Show recommended work separately from accepted work.
- Preserve focused deep links by work-item ID.
- Replace “ranked actions and supporting details” technical framing with
  homeowner work language.

### 8.3 Maintenance

- Own atomic, repeatable, and scheduled task execution.
- Provide one transition API for all status changes.
- Support checklist/subtask evidence without becoming Project Tracker.
- Materialize adopted routines and applicable seasonal occurrences.
- Link back to one operational work item.
- Publish reported/verified completion and recurrence events.

### 8.4 Seasonal Maintenance

- Retain templates, climate/property applicability, season windows, and content
  governance.
- Render as a filtered Maintenance experience.
- Keep aggregate seasonal progress as a view, not an independent action.
- Avoid automatic adoption when applicability or responsibility is uncertain.
- Let the homeowner say “not for this home” and correct the driving fact.

### 8.5 Home Habit Coach

- Recommend a manageable number of routines based on the home and household.
- Explain the expected benefit and effort.
- Ask the homeowner to adopt a routine.
- On adoption, create or link a recurring maintenance template/task.
- Use completion history to show consistency and adjust timing.
- Avoid streak shame, false savings, or engagement-only notifications.

### 8.6 Guidance

- Own multi-stage decision and resolution logic.
- Attach each active journey to a work item.
- Receive authoritative completion events from Maintenance, Inspection,
  Booking, or Projects.
- Do not require manual re-confirmation of known domain outcomes.
- Do not mark physical resolution verified from navigation or unchecked form
  completion.

### 8.7 Status Board

- Own system condition, readiness, and health evidence.
- Show whether an open work item exists for an `ACTION_NEEDED` system.
- Link “Address this” to that work item.
- Allow condition correction through the real Inventory editor.
- Remove local top-priority claims.

### 8.8 Inspection Hub

- Own reports, extraction, findings, confirmation, and evidence correction.
- Generate candidate work only after homeowner confirmation or reviewed policy.
- Route minor accepted findings to Maintenance, complex findings to Guidance,
  and multi-step work to Projects.
- Prevent the same finding from creating multiple active execution records.
- Resolve the finding only from an explicit resolution or linked verified
  outcome.

### 8.9 Project Tracker

- Own contract-to-completion execution.
- Accept one or more source work items and preserve their full lineage.
- Expose the real next milestone or blocker to Home.
- On verified completion, publish an idempotent outcome event.
- Close linked work and Guidance only when the completion scope covers them.
- Keep unresolved exceptions open as follow-up work.

---

## 9. Completion and Write-Back Contract

### 9.1 Completion authority matrix

| Work type | Reported-complete authority | Verified authority | Required write-backs |
| --- | --- | --- | --- |
| Simple homeowner task | Maintenance | Homeowner evidence or low-risk self-attestation | task, work item, recurrence, timeline |
| Seasonal task | Maintenance | Same as underlying task | seasonal view, work item, recurrence |
| Routine/habit | Maintenance occurrence | Low-risk self-attestation | habit adherence, next occurrence |
| Inspection finding | Finding resolution or linked execution | Reviewed evidence / verified project | finding, work item, Status Board, timeline |
| Guided decision | Guidance | Decision artifact, not physical condition | journey/work decision state |
| Guided physical resolution | Linked task/project/inspection | Execution evidence | journey, work item, source condition, timeline |
| Contractor project | Project Tracker | Completion checklist and evidence | project, findings, task, journey, Inventory, costs, warranties, future care |
| Safety issue | Qualified resolution path | Appropriate evidence/professional boundary | all linked sources plus audit/escalation |

### 9.2 Event contract

Create governed, idempotent events:

- `WORK_CANDIDATE_DETECTED`
- `WORK_ACCEPTED`
- `WORK_SCHEDULED`
- `WORK_ASSIGNED`
- `EXECUTION_STARTED`
- `EXECUTION_BLOCKED`
- `WORK_DEFERRED`
- `WORK_REPORTED_COMPLETE`
- `OUTCOME_EVIDENCE_ADDED`
- `OUTCOME_VERIFIED`
- `WORK_REOPENED`
- `WORK_DISPOSITION_RECORDED`
- `FOLLOW_UP_CREATED`
- `SOURCE_RECONCILED`

Each event includes property, work item, source, execution link, actor,
correlation, idempotency key, occurrence time, and relevant governance.

### 9.3 Failure handling

- Source closure failure must not silently mark the work verified.
- Persist a reconciliation-needed state and retry.
- Display “Work completed; record update pending” only when true.
- Surface operational errors to internal monitoring, not as technical states on
  Home.
- Make event replay safe.
- Reconciliation must be observable by source and failure reason.

---

## 10. Recommended UX

### 10.1 Home card/section

Home should not contain a permanent Home Operations promotional card.

Show:

- ranked urgent/time-sensitive work;
- one active major moment;
- a concise “View all work” link with count; and
- a quiet caught-up state only when source evaluation is healthy.

Example:

> **Service the upstairs HVAC by Aug 15**<br>
> Its annual service is due and the last visit recorded was 14 months ago.<br>
> Assigned to Madhu · 20 minutes to schedule<br>
> **Schedule service** · Change date

### 10.2 Home Operations header

> **Home Operations**<br>
> Keep routine care, inspection follow-ups, and projects moving without tracking
> the same work twice.

Summary:

- Needs attention;
- Due this month;
- Active projects;
- Waiting on someone;
- Completed recently.

Do not lead with internal source counts, deduplication, confidence grids, or
algorithm diagnostics.

### 10.3 Work-item detail

Sections:

1. **What needs attention**
2. **Why it matters for this home**
3. **What to do next**
4. **Owner and timing**
5. **Plan or execution**
6. **Evidence and assumptions**
7. **History and record updates**
8. **Controls**

### 10.4 Recommended work vs accepted work

Keep a visible semantic distinction:

- “Recommended for your home” means not yet committed.
- “In your plan” means accepted.
- “Scheduled” means date/owner exists.
- “In progress” means execution began.
- “Done” is reported completion.
- “Verified” means outcome evidence satisfied the policy.

### 10.5 Mobile and accessibility

- One dominant CTA per item.
- All controls keyboard reachable.
- Status is text, not color only.
- Announce state changes through live regions.
- Preserve focus after mutations.
- Make swipe actions optional, never exclusive.
- Support reduced motion.
- Avoid nested interactive cards.
- Expose owner, due date, and progress in accessible names.
- Verify 320 px layouts, zoom to 200%, and screen-reader reading order.

---

## 11. Product Framework Corrections

Update capability definitions as part of implementation:

| Capability | Recommended contract |
| --- | --- |
| Home Operations | `MAINTAIN_PREVENT` or a reviewed cross-job outcome; contextual destination; completion `OUTCOME_VERIFIED` |
| Guidance Overview | Workflow-only or catalog entry into guided resolution; completion `DECISION_RECORDED` or linked resolution |
| Status Board | Catalog/contextual system-health view; completion `OUTPUT_VIEWED`; never a plan owner |
| Maintenance | First-class operational capability; completion `ACTION_COMPLETED` with recurrence semantics |
| Seasonal Maintenance | Relationship/view under Maintenance, not independent priority capability |
| Home Habit Coach | Contextual routine recommendation within Maintenance; completion `ACTION_INITIATED` only on adoption |
| Inspection Hub | Contextual evidence workflow; completion distinguishes findings confirmed from follow-up resolved |
| Project Tracker | Workflow/contextual execution; completion `OUTCOME_VERIFIED`, not project creation |

Also define:

- Living Home Record reads and writes for Maintenance and Habit Coach;
- accepted context types for source work item, finding, system, and journey;
- trigger families that produce candidate work rather than capability cards;
- instance safety derivation; and
- explicit capability relationships to Home Operations.

---

## 12. Recommended Implementation Sequence

### Slice 0 — Truth containment and vocabulary

**Goal:** stop new false completion and agree on semantics before UI work.

Deliver:

- approved entity/state vocabulary;
- matrix of every current completion endpoint and authoritative source;
- change Home Action `COMPLETE` to domain-aware completion;
- replace unsupported completion with acknowledge/remove controls;
- prevent verified physical write-backs from decision/page completion;
- route all Maintenance state changes through one transition service;
- instance safety derivation for findings, work, and Projects;
- diagnostics for actions hidden while source work remains open; and
- fixture coverage for task, journey, finding, and Project completion.

Exit criteria:

- no Home control can claim completed work without an authoritative transition;
- both Maintenance update paths produce identical side effects; and
- safety work cannot be casually dismissed or deferred.

### Slice 1 — Durable operational identity

**Goal:** create one work identity across recommendations and execution.

Deliver:

- clean Prisma schema for work items, sources, executions, events, and evidence;
- no migration scripts or backfills;
- stable `workKey` resolver;
- source adapter contract;
- uniqueness and idempotency rules;
- durable duplicate/supersession decisions;
- state reducer and transition policy;
- household owner/watchers; and
- read API for Home Operations.

Exit criteria:

- one obligation resolves to one work item across source recalculation;
- multiple sources can support the same work item; and
- source copy changes do not create duplicate work.

### Slice 2 — Home and action-plan cutover

**Goal:** make the existing action plan the canonical Home Operations surface.

Deliver:

- rename and redesign Prioritized Action Plan as Home Operations;
- Today, Upcoming, Waiting, Projects, Routines, and Completed views;
- Home projection from durable work items;
- focused deep link by work-item ID;
- recommended vs accepted work separation;
- exact missing-context actions;
- truthful empty/degraded states;
- remove signal-string deduplication as the primary identity;
- preserve evidence/confidence progressive disclosure; and
- compatibility route redirect only where required for navigation, not data.

Exit criteria:

- Home and Home Operations show the same lifecycle truth;
- accepting work preserves continuity; and
- no parallel full action backlog remains.

### Slice 3 — Maintenance, seasonal, and routines convergence

**Goal:** establish Maintenance as the atomic execution engine.

Deliver:

- work-item link on every maintenance task;
- adopt/schedule/assign/complete/reopen transitions;
- recurring template and occurrence model;
- seasonal applicability generates task occurrences;
- Seasonal route becomes a Maintenance view;
- Habit recommendations support “Add to my routine”;
- adopted habit creates/links recurrence;
- habit adherence reads task outcomes;
- unified reminders, snooze, reschedule, and defer semantics; and
- source-aware not-applicable/correction controls.

Exit criteria:

- a seasonal obligation appears once;
- a habit becomes work only when adopted;
- completion updates seasonal/routine progress automatically; and
- Home can continue showing accepted Maintenance work when relevant.

### Slice 4 — Guidance orchestration

**Goal:** make Guidance a child workflow of one operational work item.

Deliver:

- required work-item link for active operational journeys;
- next-step projection under the work item;
- authoritative domain completion listeners;
- separation of decision, plan, reported, and verified completion;
- project handoff changes work state to `IN_PROJECT`;
- one active major-moment presentation;
- close/reopen reconciliation; and
- retire Guidance as a competing active-signal backlog.

Exit criteria:

- journey and linked Project never appear as competing Home actions;
- tool outcomes advance steps without manual duplicate confirmation; and
- only verified resolution updates physical condition as verified.

### Slice 5 — Inspection-to-work conversion

**Goal:** turn reviewed findings into the right work without duplicate records.

Deliver:

- confirmed-finding work candidate adapter;
- homeowner disposition workflow;
- duplicate and extraction-correction controls;
- policy mapping to Maintenance, Guidance, or Project;
- finding/work/execution link;
- safety escalation;
- cost-range and professional-boundary presentation;
- resolution/reopen propagation; and
- inspection source freshness and evidence display.

Exit criteria:

- every accepted actionable finding has exactly one active operational lineage;
- unaccepted extraction does not become committed work; and
- verified linked execution resolves the finding.

### Slice 6 — Project execution closure

**Goal:** close the complete source graph from verified Project outcomes.

Deliver:

- many-to-many Project/work-item scope where justified;
- exact completion coverage mapping;
- publish `OUTCOME_VERIFIED`;
- close linked work, Maintenance tasks, findings, Guidance steps/journeys, and
  source signals where covered;
- preserve unresolved exceptions as child work;
- create future-care occurrences without reopening completed source work;
- show actual next milestone/blocker on Home;
- idempotent retry/replay; and
- reconciliation ledger UI for support/admin use.

Exit criteria:

- verified Project completion removes resolved work everywhere;
- partial or failed completion keeps only unresolved scope open; and
- downstream record updates are auditable.

### Slice 7 — Status Board alignment

**Goal:** separate system condition from operational priority.

Deliver:

- work-item link for system conditions;
- “Address this” opens the canonical work item;
- remove local top-priority logic and duplicate urgency language;
- distinguish unknown data, monitored condition, and actionable work;
- exact fact correction destinations;
- condition refresh after verified outcomes; and
- prevent pinning/filtering from changing Home priority.

Exit criteria:

- Status Board and Home never disagree on the homeowner’s top work because
  Status Board no longer owns that decision.

### Slice 8 — Household coordination and best-in-class operations

**Goal:** make the system useful for ongoing household execution.

Deliver:

- assignment, watchers, approvals, and handoff;
- shared calendar and reminder policy;
- contractor/household responsibility states;
- batch scheduling for low-risk routine work;
- completion evidence capture;
- offline/retry-safe low-risk task updates;
- digest limited to changed or due work;
- completed-work and realized-outcome history;
- accessibility and responsive acceptance; and
- operational dashboards and alerting.

Exit criteria:

- a household can coordinate work without external duplicate lists;
- notifications correspond to real lifecycle changes; and
- the platform can measure accepted-to-verified outcomes.

### Slice 9 — Portfolio cleanup

**Goal:** remove redundant surfaces and contracts.

Deliver:

- retire old full Action Center/backlog variants;
- retire independent seasonal and habit work lifecycles;
- remove obsolete action-event completion paths;
- update capability inventory and relationships;
- update route and content documentation;
- delete dead feature flags and compatibility code;
- final Product Framework conformance audit; and
- outcome-based launch review.

Exit criteria:

- one operational backlog;
- one priority system;
- one lifecycle contract;
- domain workspaces remain specialized and coherent; and
- no obsolete route is promoted through discovery.

---

## 13. Acceptance Strategy

### 13.1 Golden lifecycle scenarios

Automate end-to-end scenarios:

1. Risk signal → recommendation → accepted maintenance task → completion →
   Status Board refresh → Home removal → Home Event.
2. Seasonal applicability → maintenance occurrence → snooze → reschedule →
   completion → next season.
3. Habit recommendation → adopt routine → recurring task → completion →
   adherence update.
4. Inspection upload → extraction → homeowner correction → finding accepted →
   maintenance resolution.
5. Safety inspection finding → governed Guidance/escalation → verified Project
   completion.
6. Guidance journey → Project creation → Project blocker on Home → verified
   completion → journey and work closure.
7. One issue from three sources → one work item with three evidence sources.
8. Reported completion without proof → pending verification, not verified.
9. Failed source reconciliation → visible pending record update and successful
   replay.
10. Reopened condition after completion → new occurrence or reopened work with
    prior history preserved.

### 13.2 Contract tests

- stable `workKey` under copy and source-version changes;
- no merge across different property, subject, obligation, or occurrence;
- idempotent accept, schedule, complete, verify, reopen, and reconcile;
- role enforcement;
- safety-tier controls;
- domain completion adapter coverage;
- recurrence boundary and timezone behavior;
- Project scope coverage;
- source deletion/archive behavior; and
- capability completion signals.

### 13.3 UX acceptance

For Home, Home Operations, Maintenance, Guidance, Inspection, Status Board, and
Projects verify:

- What is this?
- How does it benefit me?
- What information would improve it?
- What matters now?
- What can I control?
- Why should I trust it?

Also verify keyboard, screen reader, focus, zoom, mobile, reduced motion, loading,
partial failure, empty, stale, and offline/retry states.

---

## 14. Measurement

### 14.1 North-star measure

**Verified important home outcomes per active property**, with no duplicate
closure required.

### 14.2 Funnel

- actionable candidates detected;
- unique work items after reconciliation;
- recommendation-understood rate;
- acceptance rate;
- accepted-to-scheduled time;
- scheduled-to-started time;
- started-to-reported-complete time;
- reported-to-verified time;
- source reconciliation success;
- overdue rate;
- reopen rate;
- duplicate prevention rate; and
- work completed without duplicate user closure.

### 14.3 Quality and trust

- false-completion incidents;
- unresolved source after verified outcome;
- work hidden while source remains open;
- incorrect merges and duplicate splits;
- stale-source promotions;
- safety-governance violations;
- notification without actionable change;
- fact-correction completion;
- Project write-back failures; and
- accessibility defects.

### 14.4 Guardrails

Do not optimize:

- number of tasks generated;
- number of reminders sent;
- page views;
- streak length;
- dismissals interpreted as resolution;
- Project creation without verified outcome; or
- Home Action volume.

---

## 15. Operational Requirements

- Every source adapter exposes health, latency, and candidate counts.
- Every work transition is auditable.
- Every side effect has an idempotency key.
- Reconciliation failures are retryable and visible internally.
- Source evaluation failure is distinct from zero work.
- Capability kill switches do not delete work history.
- Disabled recommendation sources stop new candidates but do not orphan
  accepted work.
- Notification delivery is downstream of durable state, never the source of it.
- Personalization failure cannot block manual or accepted work.
- Admin tooling can inspect one work item’s full source/execution/outcome graph.
- Data retention follows the sensitivity of documents, inspection evidence,
  contractor records, and household activity.

---

## 16. Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| New work-item model becomes another parallel system | Cut Home and action plan reads to it; domain records link as sources/execution |
| Over-merging distinct work | Typed subject/obligation/occurrence identity and reversible merge decisions |
| Under-merging related sources | Source identity resolver and golden multi-source fixtures |
| Automatic recommendations create overwhelming work | Candidate vs accepted state; bounded promotion |
| Completion cascade closes too much | Explicit Project/task scope and authoritative completion matrix |
| Safety actions become dismissible | Instance governance and constrained transitions |
| Seasonal/habit merge loses useful behavior features | Preserve applicability, coaching, cadence, and adherence as layers |
| Guidance loses context when hidden from backlog | Keep journey detail attached to the work item |
| Status Board becomes less useful | Strengthen system evidence/readiness and direct work linkage |
| No migration hides integration defects | Use deterministic fixtures and full lifecycle tests before schema push |
| Notification fatigue | Trigger on meaningful due/state changes and honor household preferences |

---

## 17. Repository Evidence Reviewed

Primary evidence:

- `docs/product/CAPABILITY_OUTCOME_AND_EXPERIENCE_AUDIT_FRAMEWORK.md`
- `docs/product/capability-discovery/current-capability-inventory.md`
- `apps/backend/src/productFramework/homeAction.contract.ts`
- `apps/backend/src/productFramework/capabilities/definitions/maintainPrevent.ts`
- `apps/backend/src/productFramework/capabilities/definitions/planBudget.ts`
- `apps/backend/src/productFramework/capabilities/definitions/protectMonitor.ts`
- `apps/backend/src/services/homeActions.service.ts`
- `apps/backend/src/services/homeActionSourcePromotion.service.ts`
- `apps/backend/src/services/orchestration.service.ts`
- `apps/backend/src/services/orchestrationSuppression.service.ts`
- `apps/backend/src/services/PropertyMaintenanceTask.service.ts`
- `apps/backend/src/services/seasonalChecklist.service.ts`
- `apps/backend/src/services/seasonalChecklistIntegration.service.ts`
- `apps/backend/src/services/seasonalChecklistStatus.service.ts`
- `apps/backend/src/services/homeHabitCoach/homeHabitCoachService.ts`
- `apps/backend/src/services/homeHabitCoach/habitGenerationEngine.ts`
- `apps/backend/src/services/homeHabitCoach/habitRankingEngine.ts`
- `apps/backend/src/services/guidanceEngine/guidanceStepResolver.service.ts`
- `apps/backend/src/services/guidanceEngine/guidanceCompletionHooks.service.ts`
- `apps/backend/src/services/guidanceEngine/guidanceTemplateRegistry.ts`
- `apps/backend/src/services/homeStatusBoard.service.ts`
- `apps/backend/src/services/inspectionHub.service.ts`
- `apps/backend/src/services/inspectionWriteBack.service.ts`
- `apps/backend/src/services/buyerAcquisition.service.ts`
- `apps/backend/src/services/projectTracker.service.ts`
- `apps/backend/prisma/schema.prisma`
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/action-plan/page.tsx`
- `apps/frontend/src/components/home/UnifiedHomeSurface.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/maintenance/MaintenancePageClient.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/seasonal/page.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-habit-coach/HomeHabitCoachClient.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/guidance-overview/GuidanceOverviewClient.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/status-board/StatusBoardClient.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/inspection-hub/page.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/projects`

This is a repository-backed product and architecture review. Runtime source
quality, production telemetry, worker health, and rendered cross-device
behavior still require implementation-slice acceptance.

---

## 18. Definition of Done

Home Operations and Action Management is complete when:

1. one homeowner obligation has one durable operational identity;
2. Home uses the same priority and lifecycle truth as the full operations
   workspace;
3. a recommendation remains distinct from accepted work;
4. Maintenance owns atomic and recurring execution;
5. seasonal and habit work no longer creates parallel user-visible task
   lifecycles;
6. Guidance provides choreography without a duplicate backlog entry;
7. accepted inspection findings enter the right execution path exactly once;
8. Projects preserve source scope and close it from verified outcomes;
9. Status Board shows system condition without a competing priority engine;
10. complete means the authoritative domain record changed;
11. verified means the required evidence policy was satisfied;
12. every source and downstream record reconciles or exposes a retryable
    failure;
13. safety and financial governance is derived per work instance;
14. users can assign, schedule, defer, correct, complete, verify, and reopen
    work with durable effects;
15. exact missing facts link to real canonical editors;
16. empty, pending, degraded, filtered, and caught-up states are distinct;
17. all core lifecycle scenarios pass automated acceptance;
18. accessibility and mobile gates pass;
19. capability contracts and documentation match implemented behavior; and
20. success is measured by verified outcomes without duplicate closure.
