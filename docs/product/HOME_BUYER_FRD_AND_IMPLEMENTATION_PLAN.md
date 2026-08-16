# Home Buyer Experience — Functional Requirements and Implementation Plan

**Version:** 1.0
**Date:** 2026-08-16
**Status:** Proposed greenfield product consolidation
**Audience:** Product, design, frontend, backend, workers, data, content, and engineering
**Primary routes:** `/onboarding/address`, `/dashboard`, `/dashboard/properties/:propertyId/buyer-plan`, `/dashboard/ask`
**Related systems:** Unified Home, Plan & Projects, Home Record, Inspection Hub, Ask Cozy, Guidance, Negotiation Shield, Provider Booking, Coverage, Household, Notifications, and Moving Concierge

---

## 1. Executive summary

ContractToCozy shall provide a premium, continuous home-buyer experience that
begins when a homeowner account is shopping for or purchasing a property and
continues through due diligence, closing, move-in, the first 90 days, and normal
homeownership.

A buyer is a guaranteed `HOMEOWNER` account. Buyer is not a reduced account
role and shall not become a new `UserRole` enum. Buying is a property-scoped
journey derived from canonical entry context, ownership state, an active buyer
plan, and the user's property access. The same person may own one home while
buying another.

The product promise is:

> ContractToCozy turns the fragmented work of buying a home into one calm,
> evidence-backed plan, then carries everything learned during the transaction
> into the buyer's permanent Home Record and recurring ownership experience.

The target experience shall make the buyer plan a first-class major moment in
Unified Home. It shall combine deadlines, inspection findings, transaction
documents, negotiation decisions, service work, moving, household assignment,
and post-close setup. Ask Cozy shall understand the exact buyer stage and offer
buyer-specific prompts and operations grounded in the selected property's
records.

The experience must feel like the best expression of ContractToCozy. A
successful buyer is likely to invite a co-buyer, agent, family member, or future
home buyer and therefore acts as a natural marketing advocate for the product.

---

## 2. Greenfield implementation policy

This initiative uses the following operating assumptions:

1. There are no real users and no production user data.
2. Data migration and backfill are not required.
3. The target Prisma schema may be changed directly.
4. The user will apply the database schema change.
5. Engineering shall not create a database migration script.
6. Obsolete demo data, duplicate tables, and compatibility paths do not need to
   be preserved.
7. Do not build dual-read, dual-write, shadow, backfill, compatibility, staged
   migration, or percentage-rollout infrastructure.
8. Do not add internal approval gates, pilot admission gates, or manual policy
   gates that slow development.
9. Safety, authorization, evidence, regulated-advice boundaries, and explicit
   confirmation for material writes remain required product behavior; these are
   user protections, not internal approval gates.
10. Implementation priority is a seamless working journey. Tests shall support
    functionality and prevent regressions, but test-count maximization is not a
    product objective.

Schema changes proposed by this document shall be made in
`apps/backend/prisma/schema.prisma` during the implementation slice that uses
them. Prisma Client shall then be regenerated. No migration file shall be
committed.

---

## 3. Product decision: buyer is a journey, not an account type

### 3.1 Account identity

- Account role remains `HOMEOWNER`.
- A buyer receives the complete homeowner application and is never routed into
  a restricted mini-product.
- Property permissions remain `OWNER`, `CONTRIBUTOR`, and `VIEWER`.
- Provider and admin account behavior remains separate.

### 3.2 Buyer applicability

A property is buyer-applicable when any of the following is true:

- `PropertyOnboarding.entryPath = EXISTING_HOME_PURCHASE`;
- `PropertyOnboarding.ownershipState` is `SHOPPING`, `UNDER_CONTRACT`, or
  `RECENT_OWNER`;
- an active or handed-off `HomeBuyerChecklist` exists for the property; or
- the user explicitly starts a buyer journey for an authorized candidate
  property.

`NEW_HOME_SETUP` plus `NEW_CONSTRUCTION` continues to use the dedicated new-home
plan. It shall share navigation and Home-surface conventions with the buyer
journey without reusing existing-home inspection and transaction templates.

### 3.3 Journey modes

| Mode | Canonical basis | Experience emphasis |
| --- | --- | --- |
| Exploring | `SHOPPING`, no accepted contract | Compare evidence, identify missing records, estimate immediate ownership work |
| Under contract | `UNDER_CONTRACT` | Contingencies, inspection, documents, coverage, financing readiness, closing deadlines |
| Closing scheduled | Under contract plus a target closing date | Blocking items, final walkthrough, cash-to-close preparation, move coordination |
| Recent owner | `RECENT_OWNER` or ownership-start date | Safety, access, utilities, warranties, systems baseline, first maintenance cycle |
| Established owner | `ESTABLISHED_OWNER` or completed handoff | Unified Home and recurring Home Operations, with buyer history preserved |
| Paused/cancelled | Buyer plan paused or deal cancelled | Preserve evidence, stop reminders, offer archive or reuse for another candidate |

---

## 4. Current-state assessment

### 4.1 Useful capabilities already present

- Trigger-first onboarding distinguishes buying existing, new construction,
  owning, and exploring.
- A property-scoped buyer checklist stores twelve default actions across
  pre-close, first 30 days, days 31–90, and recurring handoff.
- Target closing and ownership-start dates can recalculate due dates.
- Inspection reports and findings can be reviewed.
- Findings can be classified as verified fact, pre-close negotiation,
  post-close action, or dismissed.
- Major and safety findings can create canonical guidance and repair journeys.
- Transaction/property documents can be verified or rejected.
- Tasks can be assigned to household members.
- Tasks can store service category, cost, booking, source lineage, and completion
  metadata.
- Day-91 handoff can create recurring maintenance tasks.
- Moving Concierge can generate moving tasks, costs, utility guidance, packing
  schedules, and recommendations.
- Ask Cozy has lifecycle-aware presentation and four broad buyer prompts.

### 4.2 Current functional gaps this FRD resolves

- Unified Home calculates but does not render its buyer-specific hero.
- The buyer plan is not a first-class Home Action source or active major moment.
- Buyer tasks can remain invisible outside the direct buyer-plan URL.
- The buyer-plan “Import documents” CTA resolves to inventory instead of
  document upload.
- Closing date is not captured during buyer onboarding, so initial deadlines
  are anchored to plan creation.
- The UI exposes only assignment and complete/reopen, despite a broader API.
- “Complete with evidence” records only a user attestation.
- Finding reclassification can retain stale pre-close/post-close task semantics.
- Moving Concierge maintains a separate task and completion system.
- Moving, buyer-plan, and household permissions are inconsistent.
- Existing buyer tests primarily prove source structure rather than the real
  navigation and persistence journey.
- Existing Ask Cozy buyer prompts do not read or operate the buyer plan,
  transaction milestones, or finding dispositions.
- The default plan omits several transaction-critical milestones.

### 4.3 Non-goals

This initiative does not attempt to:

- act as a licensed real-estate agent, lender, attorney, title company,
  appraiser, insurer, inspector, or closing authority;
- certify contract compliance, clear title, loan approval, insurability,
  appraisal value, property safety, or closing readiness;
- generate or execute binding contract amendments, legal notices, loan
  commitments, insurance binders, or title instruments;
- send messages to agents, lenders, attorneys, sellers, or other external
  contacts without a separate explicit user-initiated communication workflow;
- create a public anonymous buyer portal or grant property access from a typed
  email address alone;
- replace the dedicated new-construction plan with the existing-home buyer plan;
- build native iOS or Android applications as part of this scope; the responsive
  web experience must nevertheless be fully usable on mobile;
- create a permanent buyer account role or user-level buyer segment; or
- preserve obsolete demo data, duplicate buyer/moving task stores, or legacy
  route behavior for compatibility.

---

## 5. Vision and experience principles

### 5.1 One journey, one plan

All buyer work shall be represented in one canonical buyer plan. Inspection,
document, negotiation, moving, booking, and Ask Cozy actions may create or
update buyer-plan tasks, but shall not introduce competing task lists.

### 5.2 One selected property everywhere

The selected property must survive every transition. Buyer CTAs shall use a
direct property-scoped canonical route. No buyer action may depend on a global
redirect that guesses the property.

### 5.3 No dead ends

Every empty state and readiness recommendation shall provide a working next
action. After the action, the user shall return to the same buyer-plan context
with the updated state visible.

### 5.4 Ask once, reuse everywhere

Closing date, move-in date, household members, transaction contacts, and known
property facts shall have one canonical owner. Buyer Plan, Moving, Ask Cozy,
notifications, and Home shall reuse those values.

### 5.5 Evidence without ceremony

The product shall distinguish recorded, user-attested, document-supported,
externally confirmed, and unresolved states. Evidence attachment should be easy
but honest; the interface shall never label an attestation as verified proof.

### 5.6 Buyer first, homeowner always

The buyer shall see complete homeowner capabilities. Buyer context changes
ordering, emphasis, language, and defaults; it does not suppress useful Home
Record, coverage, savings, provider, maintenance, or Ask capabilities.

### 5.7 Mobile is a primary buyer surface

Inspection negotiations, walkthroughs, moving tasks, and document collection
often happen away from a desk. All primary buyer workflows shall be complete on
mobile, including upload, assignment, disposition, evidence, and Ask Cozy.

### 5.8 Celebrate progress without trivializing risk

Closing, inspection review, move-in, and 90-day handoff deserve polished
celebration states. Safety findings, legal deadlines, coverage gaps, and
uncertain evidence shall remain clear and serious.

---

## 6. Personas and jobs to be done

### 6.1 Primary buyer

Needs one reliable answer to: “What matters next, what is blocking me, and what
will become my responsibility after closing?”

### 6.2 Co-buyer or household contributor

Needs shared assignments, common deadlines, clear ownership, and no duplicate
work.

### 6.3 Read-only household member

Needs visibility into the plan and evidence without accidental mutation.

### 6.4 First-time buyer

Needs plain-language explanations of milestones, documents, property systems,
and post-close obligations without unsupported legal or financial conclusions.

### 6.5 Experienced buyer

Needs speed, editable templates, bulk actions, concise status, and reliable
evidence lineage.

### 6.6 Natural advocate

After receiving visible value, needs a tasteful way to invite a co-buyer,
recommend ContractToCozy, or carry the Home Record into long-term ownership.
Referral actions shall be optional and appear only after a meaningful success
moment.

---

## 7. Target end-to-end journey

### 7.1 Account creation

1. User creates a `HOMEOWNER` account.
2. Copy welcomes homeowners and buyers equally; no separate buyer signup is
   required.
3. After verification/sign-in, the user enters trigger-first onboarding.

### 7.2 Buyer onboarding

The user chooses one of:

- I am exploring a home;
- I am buying an existing home;
- I am buying a new-construction home;
- I already own this home.

For an existing-home buyer, onboarding shall collect only the minimum data
needed to produce an accurate first plan:

- address or candidate label;
- purchase stage: exploring, offer made, or under contract;
- target closing date, if known;
- inspection status: not scheduled, scheduled, report available, or reviewed;
- optional move-in date;
- the user's immediate concern or goal.

Unknown values are allowed. The user shall never be blocked because a closing
date, inspection report, lender, or agent is not yet known.

### 7.3 Immediate first value

After confirmation, the user shall see a buyer-specific reveal:

- journey stage;
- the single next best action;
- the nearest known deadline;
- evidence readiness;
- a direct “Open my buyer plan” CTA;
- an Ask Cozy prompt relevant to the selected stage.

The app shall create the buyer plan before this reveal completes. It shall not
wait for the dashboard to be opened.

### 7.4 Unified Home

While the buyer plan is active, Unified Home shall show:

- a “Buying this home” journey badge;
- buyer-plan progress;
- nearest deadline;
- number of blocking items;
- evidence-readiness summary;
- one primary “Continue buyer plan” CTA;
- buyer-plan tasks within the ranked attention feed;
- the buyer plan as `activeMajorMoment` unless a more urgent incident requires
  top placement.

The generic “No action needs attention” state shall never be shown while an
applicable buyer task is pending or in progress.

### 7.5 Due diligence and inspection

1. Upload or import an inspection report.
2. Review extraction and confirm the report.
3. For each material finding, choose:
   - seller resolution/negotiation;
   - buyer accepts and plans post-close work;
   - verified informational fact;
   - dismiss with reason.
4. The choice updates one linked buyer task transactionally.
5. Relevant costs, provider options, and Negotiation Shield are available from
   the finding.
6. The buyer can return to the same finding and revise the decision; phase,
   deadline, status, linked journeys, and wording update consistently.

### 7.6 Closing preparation

The plan shall show a compact readiness section:

- closing date and countdown;
- incomplete blocking milestones;
- inspection contingency status;
- financing/appraisal/title readiness as user-recorded status, not lender or
  legal certification;
- insurance bound and policy document recorded;
- closing documents expected/received;
- final walkthrough readiness;
- utilities and move readiness;
- unresolved items that will become post-close work.

### 7.7 Closing and move-in

The user marks the property closed or confirms ownership-start date. The app:

- updates canonical ownership state to `RECENT_OWNER`;
- celebrates the milestone;
- changes language from “Buying this home” to “Your first 90 days”;
- carries unresolved accepted work forward;
- activates safety, access, utility, coverage, warranty, and systems-baseline
  tasks;
- keeps transaction evidence in the permanent Home Record.

Moving tasks appear in the same buyer plan and may be filtered as “Move.”

### 7.8 First 90 days and handoff

The user completes post-close work through the same plan. At day 91, or when
the user explicitly finishes early:

- completed transaction tasks remain in history;
- incomplete ownership work becomes canonical recurring Home Operations work;
- no unresolved pre-close task is silently stranded;
- unresolved pre-close tasks require a final disposition: resolved, accepted
  post-close, no longer needed, or deal exception;
- the buyer plan becomes a completed Home Record milestone;
- Unified Home becomes the normal homeowner experience.

### 7.9 Deal paused or cancelled

The buyer can pause or cancel a deal. The app shall:

- stop deadline and task reminders immediately;
- preserve uploaded evidence and user notes;
- mark open tasks cancelled or archived with lineage;
- avoid creating recurring maintenance work;
- allow the candidate property to be archived;
- optionally let the user start another candidate property without repeating
  account setup.

---

## 8. Information architecture and zero-friction navigation

### 8.1 Primary navigation

The homeowner shell remains:

1. Home
2. Plan & Projects
3. Home Record
4. Ask
5. Profile & Settings

Do not add a permanent sixth global “Buyer” tab. Instead, make the active buyer
journey impossible to miss within the existing shell.

### 8.2 Contextual buyer navigation

When the selected property is buyer-applicable:

- Home header includes a persistent buyer-journey chip.
- Plan & Projects pins “Buyer plan” as the first active major moment.
- Property switcher shows a stage label such as “Under contract” or “First 90
  days.”
- Mobile displays a sticky “Continue buyer plan” action when the user is not on
  the plan.
- Ask Cozy launcher includes the buyer stage in its accessible label and
  suggested prompts.

### 8.3 Canonical routes

| Destination | Canonical route |
| --- | --- |
| Buyer plan | `/dashboard/properties/:propertyId/buyer-plan` |
| Inspection Hub | `/dashboard/properties/:propertyId/inspection-hub` |
| Documents | `/dashboard/properties/:propertyId/documents` |
| Negotiation Shield | `/dashboard/properties/:propertyId/tools/negotiation-shield` |
| Household | `/dashboard/household?propertyId=:propertyId` or future property-scoped canonical household route |
| Provider discovery | Existing property-aware provider route with return context |
| Ask Cozy | `/dashboard/ask?propertyId=:propertyId&buyerContext=...` |

All buyer-plan CTAs shall link directly to these routes. Do not link through
`/dashboard/vault`, `/dashboard/documents`, or another redirect resolver.

### 8.4 Return continuity

Every destination launched from Buyer Plan shall receive:

- `propertyId`;
- `source=buyer-plan`;
- source task, finding, document requirement, or milestone ID;
- `returnTo` pointing to the exact buyer-plan section;
- journey stage and recommendation reason where applicable.

After a successful action, the destination shall either return automatically or
offer a prominent “Back to buyer plan” CTA. Browser back shall also preserve
filters and scroll context.

### 8.5 Property switching

- Switching properties updates all buyer content immediately.
- Buyer state from one property must never appear on another.
- If the destination does not apply to the newly selected property, route to
  that property's Home with a plain-language explanation.
- Never silently select the first property when a buyer deep link already
  contains a property ID.

### 8.6 Route eligibility

- `VIEWER` may open and read the plan.
- `CONTRIBUTOR` may manage ordinary tasks, documents, findings, and assignments.
- `OWNER` may change journey lifecycle, cancel/archive the journey, and perform
  owner-only actions.
- An ineligible property receives an intentional empty state and a route back
  to Home, not a generic 403 or server error.

---

## 9. Buyer Plan functional requirements

### 9.1 Overview

The buyer plan is the canonical execution surface. It shall be responsive,
stage-aware, editable, and evidence-connected.

### 9.2 Page structure

1. Journey header: property, stage, closing/move dates, progress, nearest
   deadline.
2. “Next best move” card.
3. Deadline/readiness strip.
4. Evidence and inspection status.
5. Phase-grouped tasks.
6. Household workload.
7. Contacts and service coordination.
8. Ask Cozy buyer panel.
9. Journey history and handoff status.

### 9.3 Task operations

The user shall be able to:

- create a task;
- edit title and description;
- change phase, priority, type, due date, and estimated cost;
- assign or unassign a household member;
- mark pending, in progress, blocked, completed, not needed, or cancelled;
- attach real evidence;
- add notes;
- start or link a provider booking;
- link an existing document, finding, milestone, guidance journey, or Home
  Action;
- delete a custom task;
- restore a recently deleted custom task during the session;
- bulk assign or move non-blocking tasks;
- filter by phase, assignee, deadline, status, task type, and source.

System tasks cannot be deleted, but may be marked not needed with a reason when
they are not mandatory safety or lifecycle blockers.

### 9.4 Task status model

Target statuses:

- `PENDING`
- `IN_PROGRESS`
- `BLOCKED`
- `COMPLETED`
- `NOT_NEEDED`
- `CANCELLED`

Completion requires a completion method:

- `USER_ATTESTATION`
- `DOCUMENT`
- `PHOTO`
- `BOOKING_COMPLETION`
- `INSPECTION_CONFIRMATION`
- `EXTERNAL_CONFIRMATION`

The UI shall label the result accurately:

- “Marked complete” for attestation;
- “Evidence attached” for unreviewed evidence;
- “Verified” only when a supported verification workflow confirms it.

### 9.5 Dependencies and blockers

- A task may depend on one or more tasks or milestones.
- Blocking dependencies are shown inline.
- A blocked task cannot be presented as the next best executable move.
- Completing or waiving a dependency recalculates readiness immediately.
- The app shall never infer that financing, title, legal review, appraisal, or
  insurance approval occurred without user-recorded or imported evidence.

### 9.6 Default plan templates

Templates are applicable defaults, not a rigid checklist. They shall be added
idempotently based on journey stage and known context.

| Phase | Default action | Applicability |
| --- | --- | --- |
| Exploring | Add or confirm candidate property | Candidate journey |
| Exploring | Review known property facts and missing records | Always |
| Exploring | Estimate immediate ownership costs | When sufficient property context exists |
| Exploring | Record questions for agent/seller | Always |
| Offer/contract | Record accepted contract and key dates | Under contract |
| Offer/contract | Record earnest-money deadline | When applicable/known |
| Due diligence | Schedule/import inspection | Existing-home purchase |
| Due diligence | Review extracted findings | Report imported |
| Due diligence | Classify material findings | Confirmed findings |
| Due diligence | Track inspection contingency | Deadline known |
| Due diligence | Review seller disclosures | Document available/expected |
| Financing | Track application and underwriting items | User says financing applies |
| Financing | Record financing contingency | Deadline known |
| Financing | Track appraisal | Financing or user-added |
| Title/legal | Track title/attorney/survey requirements | Jurisdiction/user context; informational only |
| Coverage | Bind homeowners insurance | Under contract |
| Coverage | Store and verify policy document | Policy available |
| Closing | Review closing disclosure | User records receipt |
| Closing | Confirm cash-to-close preparation | User-recorded readiness only |
| Closing | Prepare final walkthrough | Closing scheduled |
| Closing | Store closing, title, warranty, and disclosure records | Closing scheduled/recent owner |
| Move | Book moving/cleaning/storage services | Move required |
| Move | Set up utilities and address changes | Move required |
| Move | Complete final access/key plan | Closing/move-in scheduled |
| First 30 days | Rekey and verify life-safety devices | Existing-home purchase |
| First 30 days | Confirm utilities and emergency shutoffs | Always after closing |
| First 30 days | Start accepted repair journeys | Accepted findings exist |
| First 30 days | Assign household responsibilities | Multiple members or owner chooses |
| Days 31–90 | Build system and appliance baseline | Always |
| Days 31–90 | Register warranties and products | Applicable records/items |
| Days 31–90 | Schedule first maintenance cycle | Always |
| Days 31–90 | Review recurring Home handoff | Always |

Templates involving lender, title, attorney, appraisal, survey, insurance, or
closing readiness shall clearly state that ContractToCozy tracks the user's
records and preparation; it does not certify external approval or legal status.

### 9.7 Milestones

Milestones shall be separate from tasks so canonical deadlines do not need to
be embedded in arbitrary task rows. Milestones include:

- offer submitted/accepted;
- contract effective;
- earnest money due;
- inspection scheduled/completed;
- inspection contingency due;
- attorney review due;
- financing contingency due;
- appraisal due/completed;
- title/survey readiness;
- insurance effective;
- closing disclosure received;
- final walkthrough;
- closing;
- move-in;
- day 30, day 60, and day 90.

Each milestone has source, confidence, status, due time, completion time,
responsible user, and optional source document.

### 9.8 Contacts

The buyer journey shall support lightweight transaction contacts:

- buyer agent;
- lender or loan officer;
- attorney;
- title/escrow contact;
- inspector;
- insurance contact;
- mover;
- other.

Contacts are for organization and communication reference. ContractToCozy shall
not send messages to external contacts unless the user explicitly initiates a
future supported communication workflow.

---

## 10. Inspection, negotiation, and repair requirements

### 10.1 Inspection integration

- Buyer Plan shall display report state: none, processing, review pending,
  confirmed, or archived.
- Import opens the property-scoped Inspection Hub directly.
- On return, Buyer Plan refreshes report and finding state without a full-page
  reload.
- Every confirmed material finding appears exactly once in buyer-plan
  decision/readiness views.

### 10.2 Finding disposition

Reclassification shall be transactional and idempotent:

- `PRE_CLOSE_NEGOTIATION` creates or updates one pre-close decision task.
- `POST_CLOSE_ACTION` creates or updates one post-close ownership task.
- `VERIFIED_FACT` closes any no-longer-applicable action while preserving
  lineage.
- `DISMISSED` requires an optional reason and closes related active work.
- Changing between dispositions updates phase, priority, deadline, assignment,
  journey linkage, Home Action, and wording on the existing canonical task.

### 10.3 Negotiation Shield buyer mode

Negotiation Shield shall expose a buyer mode launched from selected findings.
It shall support:

- selected findings and evidence;
- local repair-cost context where available;
- request-for-repair versus request-for-credit organization;
- seller response tracking;
- accepted, rejected, credited, repaired, or transferred-to-buyer outcomes;
- copy-ready discussion points with legal boundary language;
- write-back of the final outcome to the finding and buyer plan.

It shall not generate or represent a legal notice, contractual amendment, or
attorney advice.

### 10.4 Repair continuity

Accepted post-close safety/major findings create canonical repair journeys.
Buyer Plan shall show the journey status and link directly to it. Completion
evidence writes back to the finding, Home Record, task, and recurring plan.

---

## 11. Document and Home Record requirements

### 11.1 Canonical document destination

All buyer document actions shall use
`/dashboard/properties/:propertyId/documents`. The buyer plan shall support
upload in context without routing through the legacy Vault alias.

### 11.2 Buyer document categories

- purchase agreement/contract;
- amendments/addenda;
- seller disclosure;
- inspection report;
- appraisal;
- title/settlement record;
- survey;
- insurance policy/declarations;
- home warranty;
- closing disclosure;
- deed/recording evidence;
- receipts, invoices, and repair evidence;
- other transaction record.

### 11.3 Document readiness

Buyer Plan and Ask Cozy shall distinguish:

- expected but not uploaded;
- uploaded and unreviewed;
- extraction pending;
- user-confirmed;
- verified by a supported workflow;
- rejected or superseded.

Document verification is not a statement of legal validity or authenticity
unless a future authoritative verification source explicitly supports it.

### 11.4 Permanent Home Record

Closing and property-condition records shall survive the buyer-plan handoff.
The Home Record shall preserve source, dates, finding decisions, task outcomes,
and attachments. Private transaction documents remain private unless the owner
explicitly includes permitted facts or documents in a governed share.

---

## 12. Moving Concierge consolidation

### 12.1 Product decision

Moving Concierge remains a generation and guidance capability, not a separate
task system.

### 12.2 Required behavior

- Closing date and move-in date come from buyer journey milestones.
- Moving inputs are stored as buyer-plan preferences/context.
- Generated moving actions become `HomeBuyerTask` rows with stable action keys
  and `taskType = MOVE`.
- Task completion, assignment, evidence, booking, and cost use buyer-plan
  services.
- Regeneration updates eligible generated tasks without overwriting user-edited
  or completed tasks.
- Moving cost estimates remain modeled estimates with visible assumptions.
- The current separate `MovingPlan.completedTasks` array is retired.
- The current JSON plan may be removed or reduced to a versioned generation
  snapshot for audit/re-generation purposes.

### 12.3 Moving views

Buyer Plan provides a Move filter and compact progress summary. A dedicated
Moving view may remain as a richer presentation, but it reads and writes the
same canonical buyer tasks.

---

## 13. Ask Cozy buyer experience

### 13.1 Objective

Ask Cozy shall behave like a buyer-aware property copilot. It must know the
selected property's journey stage, deadlines, open buyer tasks, inspection
findings, document readiness, contacts, assignments, and unresolved post-close
work before it selects prompts or answers a buyer question.

Ask Cozy shall not create a new `BUYER` account role or infer buyer status from
free-form text alone.

### 13.2 Buyer context provider

Add a bounded buyer-journey context provider containing:

- property ID and access role;
- entry path and ownership state;
- buyer-plan ID, stage, status, and progress;
- target closing and move-in dates;
- next three milestones;
- blocking/overdue task counts;
- current next-best buyer action;
- inspection report readiness and material finding counts;
- negotiation versus post-close finding counts;
- document requirement readiness;
- moving progress;
- household assignment summary;
- handoff status;
- data freshness and missing-context keys.

The provider must return bounded summaries and IDs, not full private documents
or unlimited finding/task content.

### 13.3 Buyer Ask operations

Add or extend registered Ask operations:

| Operation | Purpose | Example |
| --- | --- | --- |
| `BUYER_PLAN_STATUS` | Summarize plan and next move | “What should I do next for this purchase?” |
| `BUYER_DEADLINES` | Show recorded deadlines and blockers | “What is due before closing?” |
| `BUYER_INSPECTION_REVIEW` | Summarize confirmed finding decisions | “Which inspection findings still need a decision?” |
| `BUYER_NEGOTIATION_READINESS` | Organize negotiation inputs | “What should I discuss with my agent about the inspection?” |
| `BUYER_DOCUMENT_READINESS` | Show expected/received documents | “Which closing records am I still missing?” |
| `BUYER_COST_READINESS` | Explain recorded/modelled near-term costs | “What could cost me money in the first 90 days?” |
| `BUYER_MOVE_STATUS` | Summarize moving/utilities progress | “What should I do before move-in?” |
| `BUYER_TASK_CREATE` | Draft a custom buyer task | “Add final walkthrough photos to my plan.” |
| `BUYER_TASK_UPDATE` | Reassign/reschedule/update task | “Assign utilities to Alex.” |
| `BUYER_TASK_COMPLETE` | Complete with explicit method | “Mark the locksmith task complete.” |
| `BUYER_FINDING_DISPOSITION` | Draft a finding decision | “Move the roof finding into my post-close plan.” |
| `BUYER_LIFECYCLE_UPDATE` | Record closing/move/cancel transition | “We closed today.” |

Read operations may be available to `VIEWER`. Mutations require the same
`CONTRIBUTOR` or `OWNER` permission as the canonical buyer-plan endpoint and an
explicit confirmation card before execution.

### 13.4 Stage-specific featured prompts

Maximum four featured prompts remain. Exact active tasks/findings/deadlines take
precedence over generic prompts.

#### Exploring

- What do we know—and not know—about this property?
- Which records should I request before making a decision?
- What conditions could become immediate ownership costs?
- Help me organize questions for my agent or inspector.

#### Under contract

- What is my next deadline before closing?
- Which inspection findings still need a decision?
- Which transaction and coverage documents are missing?
- What could become my responsibility after closing?

#### Closing scheduled

- What could block my closing readiness?
- Help me prepare for the final walkthrough.
- What should I confirm for insurance, utilities, and access?
- What work is already planned for after closing?

#### Recent owner

- What should I handle in my first 30 days?
- Which accepted inspection findings need action first?
- Which warranties and systems should I register?
- What maintenance should I schedule before day 90?

#### Deal paused or cancelled

- What records should I keep from this property?
- Pause reminders for this purchase.
- What open tasks will be archived?
- Help me start a plan for another property.

### 13.5 Contextual Ask entry points

Every major Buyer Plan section shall include one contextual Ask action:

- “Ask about this deadline”;
- “Ask about this finding”;
- “Ask what this document is for”;
- “Ask how this affects my first 90 days”;
- “Ask what to do next.”

The invocation shall carry exact canonical entity IDs. Ask must not ask the
user to identify the same finding or task again.

### 13.6 Answer requirements

Buyer answers shall:

- lead with the direct next action or status;
- distinguish recorded fact, user input, modelled estimate, and missing data;
- name deadlines with dates and timezone when known;
- link to the exact buyer-plan section or underlying tool;
- explain when a contributor/owner is required;
- avoid implying legal review, loan approval, insurability, title clearance,
  inspection certification, or guaranteed closing;
- preserve the existing unsafe-request and regulated-advice boundaries.

### 13.7 Current prompt replacement

The existing broad buying prompts in `askLifecyclePromptPolicy.ts` shall be
replaced or ranked behind the buyer operations above. In particular, generic
`HOME_ACTIONS` and `COVERAGE_GAPS` prompts shall not crowd out active buyer-plan
deadlines, finding decisions, or document readiness.

---

## 14. Other buyer-specific site requirements

### 14.1 Signup and authentication

- Signup copy shall say the account supports buying, owning, maintaining, and
  protecting a home.
- No separate buyer signup, role selector, or upgrade is required.
- Post-login transition copy shall reflect the selected buyer journey when one
  exists.

### 14.2 Unified Home

- Buyer journey is the default active major moment.
- Buyer tasks participate in ranking and deduplication.
- Buyer progress and next deadline appear in the Home header/hero.
- The buyer state must render on both desktop and mobile.

### 14.3 Plan & Projects

- Active buyer plan is pinned first.
- Related negotiation, repair, booking, and moving work appears grouped beneath
  it rather than as unrelated projects.

### 14.4 Home Record

- Buyer-specific document shortcuts go to the correct property documents page.
- Inspection, disclosures, title/closing records, warranties, and completed
  transaction milestones appear in a clear acquisition-history section.
- Private financial and transaction documents are not publicly shared by
  default.

### 14.5 Provider discovery and bookings

- Buyer tasks may launch inspection, locksmith, cleaning, moving, HVAC,
  insurance, attorney, and other applicable provider categories.
- Provider routes preserve buyer task ID and return path.
- A completed booking reconciles the linked buyer task; it does not create
  duplicate work.
- Commercial relationships and ranking influence remain disclosed.

### 14.6 Coverage and protection

- Under-contract buyers see “bind and record coverage,” not renewal-focused
  established-owner copy.
- Coverage status is preparation tracking, not confirmation of insurer
  acceptance.
- Policy document upload returns to Buyer Plan and updates readiness.

### 14.7 Financing surfaces

- Refinance-focused tools shall not be promoted as purchase-mortgage tools.
- Buyer Plan may track mortgage milestones and documents without pretending to
  perform lender underwriting.
- A future purchase-loan comparison capability must have its own explicit
  contract rather than reusing refinance conclusions.

### 14.8 Knowledge and tool discovery

- Buyer stage influences recommended articles and tools.
- Buyer-focused labels use “before closing,” “after closing,” and “first 90
  days,” not generic homeowner maintenance language.
- Tools irrelevant to the current stage remain discoverable through search but
  do not displace buyer-critical actions.

### 14.9 Notifications

Notifications shall support:

- milestone due soon/overdue;
- newly imported report ready for review;
- unclassified material finding;
- document requirement missing near closing;
- assigned task changed;
- seller/negotiation outcome recorded;
- move task due;
- first-30-day and day-90 handoff reminders.

Notifications shall deduplicate by property, journey, entity, and due window.
Cancelled or paused journeys stop future reminders immediately.

### 14.10 Household and invitations

- “Invite co-buyer” is available from Buyer Plan.
- The invitation explains permission choices.
- New members land directly on the shared buyer plan after acceptance.
- Assignee lists show only authorized household participants.

### 14.11 Sharing and advocacy

After meaningful success moments, the app may offer:

- invite a co-buyer;
- share a governed property-readiness summary with an authorized professional;
- recommend ContractToCozy to another buyer;
- preserve a referral link.

These prompts shall never interrupt an urgent deadline, inspection finding,
safety item, or closing blocker. They shall be dismissible and frequency
limited.

---

## 15. Data model requirements

### 15.1 Required schema direction

The current property-scoped `HomeBuyerChecklist` and `HomeBuyerTask` models are
the foundation. Extend them rather than introducing another plan/task family.

### 15.2 Proposed enum changes

```prisma
enum BuyerJourneyStatus {
  ACTIVE
  PAUSED
  CANCELLED
  HANDED_OFF
  ARCHIVED
}

enum BuyerJourneyStage {
  EXPLORING
  OFFER_CONTRACT
  DUE_DILIGENCE
  CLOSING_PREP
  CLOSED
  MOVE_IN
  FIRST_30_DAYS
  DAYS_31_TO_90
  HANDED_OFF
}

enum BuyerPlanPhase {
  EXPLORING
  OFFER_CONTRACT
  DUE_DILIGENCE
  CLOSING_PREP
  MOVE_IN
  FIRST_30_DAYS
  DAYS_31_TO_90
  RECURRING_HOME
}

enum HomeBuyerTaskStatus {
  PENDING
  IN_PROGRESS
  BLOCKED
  COMPLETED
  NOT_NEEDED
  CANCELLED
}

enum BuyerTaskType {
  ACTION
  MILESTONE_SUPPORT
  DECISION
  DOCUMENT
  SERVICE
  MOVE
  HOME_SETUP
}

enum BuyerCompletionMethod {
  USER_ATTESTATION
  DOCUMENT
  PHOTO
  BOOKING_COMPLETION
  INSPECTION_CONFIRMATION
  EXTERNAL_CONFIRMATION
}

enum BuyerMilestoneStatus {
  NOT_STARTED
  IN_PROGRESS
  COMPLETED
  WAIVED
  MISSED
  CANCELLED
}

enum BuyerMilestoneType {
  OFFER_SUBMITTED
  CONTRACT_ACCEPTED
  EARNEST_MONEY_DUE
  INSPECTION
  INSPECTION_CONTINGENCY
  ATTORNEY_REVIEW
  FINANCING_CONTINGENCY
  APPRAISAL
  TITLE_SURVEY
  INSURANCE_EFFECTIVE
  CLOSING_DISCLOSURE
  FINAL_WALKTHROUGH
  CLOSING
  MOVE_IN
  DAY_30
  DAY_60
  DAY_90
  CUSTOM
}

enum BuyerContactRole {
  BUYER_AGENT
  LENDER
  ATTORNEY
  TITLE_ESCROW
  INSPECTOR
  INSURANCE
  MOVER
  OTHER
}
```

### 15.3 `HomeBuyerChecklist` additions

```prisma
stage                  BuyerJourneyStage  @default(EXPLORING)
moveInDate             DateTime?
pausedAt               DateTime?
cancelledAt            DateTime?
cancellationReason     String?
completedAt            DateTime?
lastStageChangedAt     DateTime?
movingPreferencesJson Json?
generationVersion      String?

milestones BuyerJourneyMilestone[]
contacts   BuyerJourneyContact[]
```

Existing `targetCloseDate` and `ownershipStartedAt` remain canonical lifecycle
anchors. `planStartDate`, handoff fields, and status remain.

### 15.4 `HomeBuyerTask` additions

```prisma
taskType                 BuyerTaskType @default(ACTION)
blocking                 Boolean       @default(false)
required                 Boolean       @default(false)
statusReason             String?
notes                    String?
completedByUserId        String?
completionMethod         BuyerCompletionMethod?
completionDocumentId     String?
completionVerifiedAt     DateTime?
completionVerifiedById   String?
generatedBy              String?
generationVersion        String?
userEditedAt             DateTime?
```

Add explicit relations for completion user/document where compatible with the
existing schema. Retain stable `actionKey` and source lineage.

### 15.5 `BuyerJourneyMilestone`

```prisma
model BuyerJourneyMilestone {
  id                  String               @id @default(uuid())
  checklistId         String
  type                BuyerMilestoneType
  customLabel         String?
  status              BuyerMilestoneStatus @default(NOT_STARTED)
  dueAt               DateTime?
  completedAt         DateTime?
  responsibleUserId   String?
  sourceType          String?
  sourceEntityId      String?
  sourceDocumentId    String?
  confidence          Float?
  notes               String?
  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt

  checklist HomeBuyerChecklist @relation(fields: [checklistId], references: [id], onDelete: Cascade)

  @@unique([checklistId, type])
  @@index([checklistId, status, dueAt])
}
```

If multiple custom milestones are required, use a stable `milestoneKey` unique
within the checklist instead of the exact unique constraint shown above.

### 15.6 `BuyerJourneyContact`

```prisma
model BuyerJourneyContact {
  id          String           @id @default(uuid())
  checklistId String
  role        BuyerContactRole
  name        String
  company     String?
  email       String?
  phone       String?
  notes       String?
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt

  checklist HomeBuyerChecklist @relation(fields: [checklistId], references: [id], onDelete: Cascade)

  @@index([checklistId, role])
}
```

### 15.7 Moving model cleanup

Remove the separate `MovingPlan.completedTasks` execution source. Preferred
target:

- canonical moving tasks in `HomeBuyerTask`;
- moving inputs in `HomeBuyerChecklist.movingPreferencesJson`;
- optional immutable generation snapshot table or JSON only if regeneration
  provenance is useful.

Because there are no real users, remove obsolete `MovingPlan` fields/model and
all code references directly when the canonical implementation is ready. Do not
create data migration or compatibility logic.

### 15.8 Models not required

Do not add:

- `BUYER` to `UserRole`;
- a user-level permanent buyer segment;
- a second buyer task table;
- a generic arbitrary transaction JSON store as the canonical source;
- migration/backfill tracking tables;
- approval or pilot-admission tables.

---

## 16. API requirements

### 16.1 Buyer overview

`GET /api/home-buyer-tasks/properties/:propertyId/overview`

Returns plan, stage, progress, next action, milestones, readiness, assignment
summary, evidence summary, moving summary, and handoff state in one bounded read
model. The buyer page should not require five independent queries that race plan
creation.

### 16.2 Lifecycle

- `PATCH .../lifecycle` updates known lifecycle anchors and recalculates only
  eligible generated deadlines.
- `POST .../pause`
- `POST .../resume`
- `POST .../cancel`
- `POST .../close`
- `POST .../handoff`

Owner permission is required for pause/cancel/close/archive. Handoff may run
automatically and idempotently.

### 16.3 Milestones

- list/create/update/delete custom milestones;
- update milestone status;
- link document;
- resolve deadline conflicts;
- return affected task recalculation summary.

### 16.4 Tasks

Existing task endpoints shall use strict runtime schemas. Add:

- batch assignment/status update;
- completion evidence endpoint;
- unlink booking;
- dependency management if dependencies are implemented;
- restore custom task where supported.

Every mutation returns the updated overview fragment needed by the page.

### 16.5 Finding disposition

Finding mutation shall update the finding, linked buyer task, linked guidance
journeys, repair journey, and Home Action inside a transaction or compensating
idempotent workflow. Response returns all affected IDs and new states.

### 16.6 Ask Cozy

Ask operations call the same buyer services as the page. Ask shall not directly
write Prisma buyer records.

### 16.7 Error contract

Expected errors must return stable codes and appropriate statuses:

- `BUYER_PLAN_NOT_APPLICABLE` — 409 or intentional eligibility response;
- `BUYER_PLAN_READ_ONLY` — 403;
- `BUYER_PLAN_NOT_FOUND` — 404 only when creation is not appropriate;
- `INVALID_BUYER_TRANSITION` — 409;
- `INVALID_BUYER_ASSIGNEE` — 400;
- `INVALID_TASK_STATUS` — 400;
- `DEFAULT_TASK_DELETE_FORBIDDEN` — 409;
- `MILESTONE_CONFLICT` — 409;
- `FINDING_REVIEW_REQUIRED` — 409.

Do not expose Prisma validation errors as 500 responses.

---

## 17. Unified Home and Home Action integration

### 17.1 Source adapter

Add a canonical buyer-plan Home Action source kind or a reviewed adapter under
an existing appropriate source family. Preferred explicit source:

```text
BUYER_PLAN
```

The source must support completion, defer/snooze where allowed, assignment, and
deep linking back to the exact buyer task or milestone.

### 17.2 Promotion rules

- Promote active pending/in-progress buyer tasks.
- Exclude completed, not-needed, and cancelled tasks.
- Do not promote future low-priority tasks too early.
- Prioritize known deadlines, safety findings, insurance effective date, final
  walkthrough, and immediate post-close access/safety work.
- Apply the same deduplication identity when a finding, guidance journey, and
  buyer task represent one obligation.
- Never duplicate a handed-off maintenance task and its buyer source task.

### 17.3 Active major moment

Unified Home active-major-moment selection shall include active buyer and
new-home plans. An urgent incident may take the top attention position, but the
buyer plan remains visible below it.

### 17.4 Commands

Home Action commands on buyer tasks shall reconcile with buyer-plan state.
Completing a Home card must update the same task shown in Buyer Plan.

---

## 18. Permissions and privacy

| Capability | Viewer | Contributor | Owner |
| --- | ---: | ---: | ---: |
| View buyer plan, milestones, findings, and permitted documents | Yes | Yes | Yes |
| Use read-only buyer Ask operations | Yes | Yes | Yes |
| Create/edit ordinary tasks | No | Yes | Yes |
| Assign tasks | No | Yes | Yes |
| Upload documents and evidence | No | Yes | Yes |
| Disposition findings | No | Yes | Yes |
| Start/link bookings | No | Yes | Yes |
| Add/update contacts | No | Yes | Yes |
| Change lifecycle anchors | No | Yes | Yes |
| Pause/cancel/archive/close journey | No | No | Yes |
| Invite members/change roles | No | No | Yes |

Read endpoints must not perform contributor-only creation as an incidental side
effect. If a viewer opens an eligible property before a plan exists, return a
read-only “Plan has not been started” state; an owner/contributor can initialize
it.

Documents, financial details, negotiation notes, and contact information remain
private to authorized property members. Sharing uses explicit governed share
workflows and recipient scopes.

---

## 19. UX, accessibility, performance, and reliability

### 19.1 UX requirements

- Primary next action visible without scrolling on common mobile sizes.
- Closing countdown never substitutes for the absolute date.
- Status and priority never rely on color alone.
- Loading uses stable skeletons; no layout jump between plan and overview.
- Mutation buttons show pending state and prevent duplicate submissions.
- Optimistic updates are allowed only when rollback is reliable.
- Empty evidence/task sections explain why they matter and provide one direct
  action.
- Page copy uses buyer language appropriate to stage.

### 19.2 Accessibility

- Meet WCAG 2.2 AA for primary buyer workflows.
- All task/status controls are keyboard operable.
- Custom selects have explicit labels.
- Dynamic mutation results use non-disruptive live regions.
- Focus returns correctly after dialogs and mobile sheets.
- Date and countdown information is readable by assistive technology.
- Finding severity, confidence, and evidence state have text labels.

### 19.3 Responsive behavior

- Desktop may use a two-column overview and plan workspace.
- Mobile uses a single column, sticky stage/next-action summary, and bottom-safe
  action sheets.
- Evidence review buttons wrap without truncating decision meaning.
- The full plan, not a reduced read-only variant, is available on mobile.

### 19.4 Performance

- Buyer overview p95 backend target: under 800 ms with normal property data.
- Initial page should require one overview request plus independently lazy
  evidence detail when expanded.
- Avoid loading full document contents or all historical findings in the
  overview.
- Plan writes return affected fragments and invalidate bounded queries.

### 19.5 Reliability

- Default plan creation is idempotent.
- Generated task/milestone keys are stable.
- Handoff is idempotent.
- Regeneration never overwrites completed or user-edited work silently.
- Notification delivery records success only after delivery succeeds.
- Ask and UI writes call the same services and produce the same result.

---

## 20. Analytics and product learning

No internal approval gate is required. Analytics exists to improve the product,
not to block development.

Track at minimum:

- buyer journey selected;
- buyer plan created/opened;
- first buyer action viewed/completed;
- closing date recorded;
- inspection imported/confirmed;
- material finding classified;
- negotiation versus post-close decision;
- document uploaded/verified;
- household member invited/task assigned;
- buyer Ask prompt viewed/submitted/completed;
- Ask-to-buyer-action conversion;
- moving plan generated/task completed;
- closing recorded;
- first-30-day and day-90 completion;
- handoff completed;
- buyer advocacy/referral prompt shown/used/dismissed.

Key product measures before real-user learning:

- zero broken buyer CTAs;
- zero property-context loss across buyer navigation;
- one canonical task per obligation;
- one canonical closing/move date reused everywhere;
- complete buyer journey operable on mobile;
- no generic all-clear while actionable buyer work exists;
- no buyer mutation available above the user's property permission;
- no unresolved task silently lost during handoff.

---

## 21. Implementation plan

Implementation is organized as vertical slices. Each slice must leave a usable
product increment. Avoid building all backend layers before connecting the UI.

### Slice 0 — Contracts and direct schema correction

**Goal:** Establish one canonical target without compatibility scaffolding.

Backend/schema:

1. Extend buyer journey, task-status, task-type, completion, milestone, and
   contact enums/models described in Section 15.
2. Add fields and relations to `HomeBuyerChecklist` and `HomeBuyerTask`.
3. Add `BuyerJourneyMilestone` and `BuyerJourneyContact`.
4. Remove or simplify the duplicate Moving execution model only when Slice 6
   connects generated moving tasks to the buyer plan.
5. Regenerate Prisma Client.
6. Do not create a migration script.

Contracts/services:

1. Create strict Zod request/response contracts for overview, tasks,
   milestones, lifecycle, contacts, evidence completion, and batch operations.
2. Define stable buyer action and milestone keys.
3. Centralize journey-stage derivation and valid transitions.
4. Centralize permissions in buyer services.

Functional check:

- An owner can create and retrieve one buyer plan with stage, milestones,
  contacts, and expanded task states.
- A viewer can read an existing plan without triggering a write.

### Slice 1 — Zero-friction onboarding and first value

**Goal:** Create an accurate plan before the buyer reaches Home.

Frontend:

1. Refine journey choices and buyer-specific copy in onboarding.
2. Collect purchase stage, optional closing date, inspection status, optional
   move date, and immediate concern.
3. Show a buyer-specific confirmation summary.
4. Replace generic first-value result with buyer next action, deadline, evidence
   readiness, and Ask prompt.

Backend:

1. Extend entry-context capture payload for optional buyer anchors.
2. Create buyer plan and applicable templates immediately after entry-context
   capture.
3. Set target close/move milestones and calculate deadlines.
4. Keep unknown values unknown.

Functional check:

- A new user selecting “Buying existing” reaches a populated plan with the
  correct property and known date anchors in one uninterrupted flow.

### Slice 2 — Buyer-aware Unified Home and navigation

**Goal:** Make the buyer journey impossible to lose.

Frontend:

1. Remove the dead buyer-hero branch from dashboard legacy logic.
2. Render buyer journey state directly in `UnifiedHomeSurface`.
3. Add buyer plan to active major moments.
4. Add persistent journey chip and mobile continue action.
5. Pin Buyer Plan in Plan & Projects.
6. Add buyer stage to property selector labels.
7. Fix all buyer links to canonical property-scoped routes.

Backend:

1. Add buyer summary to Unified Home DTO.
2. Promote buyer tasks/milestones through a canonical Home Action adapter.
3. Reconcile Home commands with buyer task state.
4. Include buyer plan in major-moment selection.

Functional check:

- From login, the buyer reaches the correct selected property's plan in one
  click on desktop and mobile.
- Pending buyer work prevents a false all-clear state.

### Slice 3 — Complete Buyer Plan workspace

**Goal:** Make the plan fully operable without hidden API-only capabilities.

Frontend:

1. Build one-query overview loading.
2. Implement stage header, readiness strip, next move, grouped tasks,
   milestones, workload, contacts, and history.
3. Add create/edit/status/not-needed/cancel/delete/restore actions.
4. Add assignment, cost, booking, note, filter, and batch controls.
5. Replace “Complete with evidence” with explicit completion method and real
   evidence selection.
6. Add clear viewer read-only presentation.

Backend:

1. Add overview and milestone/contact endpoints.
2. Apply runtime validation to all mutations.
3. Return stable expected error codes.
4. Make date recalculation respect completed/user-edited tasks.

Functional check:

- Every supported backend buyer task capability has an intentional UI path.

### Slice 4 — Inspection, negotiation, documents, and repair continuity

**Goal:** Turn transaction evidence into one trustworthy plan.

1. Fix document upload navigation to the property documents route.
2. Preserve buyer return context through documents and Inspection Hub.
3. Make finding reclassification transactionally update the linked task and
   journeys.
4. Add buyer mode to Negotiation Shield.
5. Persist seller response/outcome and transfer accepted work post-close.
6. Attach completion evidence to findings, tasks, Home Record, and repair
   journeys.
7. Deduplicate finding, guidance, Home Action, and buyer-plan obligations.

Functional check:

- A report upload can be reviewed, classified, negotiated or accepted, and
  carried into repair/ownership without duplicate tasks or stale phase data.

### Slice 5 — Ask Cozy buyer copilot

**Goal:** Make Ask Cozy genuinely buyer-specific.

Backend:

1. Add the buyer context provider.
2. Register buyer plan, deadline, inspection, negotiation, document, cost,
   move, task, finding, and lifecycle operations.
3. Bind operations to canonical buyer services.
4. Add permission-aware confirmation cards for writes.
5. Update audience applicability and answer presentation.
6. Replace generic buyer prompt ranking with stage- and entity-aware prompts.

Frontend:

1. Show stage-specific featured prompts on Ask landing.
2. Add contextual Ask actions throughout Buyer Plan.
3. Preserve entity and return context.
4. Render buyer deadline, readiness, finding, and plan-status blocks.

Functional check:

- “What should I do before closing?” answers from the buyer plan and links to
  the exact next task.
- “Move this finding to my post-close plan” creates a confirmation and updates
  the same canonical finding/task after confirmation.

### Slice 6 — Moving, services, household, and notifications

**Goal:** Eliminate duplicate coordination systems.

1. Convert Moving Concierge generation into canonical buyer tasks.
2. Reuse closing/move milestones and household assignments.
3. Add move filter and optional rich Moving view backed by the same tasks.
4. Reconcile provider booking completion with buyer tasks.
5. Normalize buyer/moving property permissions.
6. Add co-buyer invite and direct post-acceptance landing.
7. Add deduplicated buyer deadline, assignment, inspection, document, moving,
   and handoff notifications.
8. Stop notifications on pause/cancel.

Functional check:

- Completing a moving task in either view updates one task and one progress
  count everywhere.

### Slice 7 — Closing, handoff, retention, and advocacy

**Goal:** Convert transaction value into durable homeowner value.

1. Add explicit close and cancel transitions.
2. Present a polished closing celebration and first-90-day transition.
3. Require resolution of stranded pre-close work before final handoff.
4. Move incomplete ownership work into recurring Home Operations idempotently.
5. Write a buyer-journey completion milestone to Home Record.
6. Preserve transaction evidence and outcomes.
7. Add tasteful, dismissible co-buyer/referral/recommendation prompts after
   meaningful success moments.

Functional check:

- The same property moves from under contract to recent owner to established
  owner without losing work, evidence, selected-property context, or navigation
  continuity.

### Slice 8 — Site-wide buyer polish and cleanup

**Goal:** Remove legacy contradictions and deliver top-tier fit and finish.

1. Audit signup, login transition, Home, Plan & Projects, Home Record, provider,
   coverage, financing, Knowledge, notifications, breadcrumbs, mobile catalog,
   and empty states for buyer copy and links.
2. Remove obsolete `HOME_BUYER` segment documentation/comments where they imply
   a user-level role.
3. Remove dead `HomeBuyerChecklistCard` and legacy checklist redirects if no
   longer used.
4. Remove unused orchestration buyer helpers after the canonical adapter ships.
5. Remove duplicate Moving execution storage and APIs.
6. Run a route/CTA traversal across the complete buyer journey.
7. Conduct responsive and accessibility review on real rendered states.

Functional check:

- No buyer-specific page relies on a legacy global redirect or duplicate state
  owner.

---

## 22. Recommended implementation order and dependencies

```text
Slice 0: schema + contracts
        ↓
Slice 1: onboarding + first value
        ↓
Slice 2: Home + navigation
        ↓
Slice 3: complete plan workspace
        ↓
Slice 4: evidence + negotiation continuity
        ↓
Slice 5: Ask Cozy buyer copilot
        ↓
Slice 6: moving + services + household + notifications
        ↓
Slice 7: closing + handoff + advocacy
        ↓
Slice 8: site-wide polish + legacy removal
```

Slices 4 and 5 may proceed in parallel after Slice 3 contracts stabilize. Slice
6 depends on the canonical task model from Slice 3. Slice 7 depends on lifecycle
and handoff semantics from Slices 0–4.

---

## 23. Definition of done

The home-buyer initiative is functionally complete when all of the following
are true:

1. A buyer signs up as a homeowner and selects a purchase journey without a
   separate role or approval.
2. The buyer can add a candidate/purchase property and optionally record
   closing/move dates.
3. A buyer plan is created before the first-value reveal.
4. Home displays the plan as an active major moment and shows buyer tasks in the
   ranked feed.
5. The plan is reachable in one click from Home on desktop and mobile.
6. All buyer-plan CTAs preserve property and return context.
7. Document upload opens the correct property documents workspace.
8. Inspection findings flow into negotiation or post-close work without
   duplication.
9. All task states, editing, assignment, evidence, booking, and custom-task
   capabilities are operable in the UI.
10. Moving tasks use the canonical buyer plan.
11. Ask Cozy offers stage-specific buyer prompts and can read and operate the
    buyer plan with proper confirmation and permissions.
12. Viewers can read; contributors can collaborate; owners control lifecycle
    and membership.
13. Pause/cancel stops reminders and prevents handoff.
14. Closing transitions the plan into a first-90-day homeowner experience.
15. Handoff preserves history and moves every unresolved ownership obligation
    into canonical Home Operations or an explicit terminal disposition.
16. The buyer receives complete homeowner capabilities throughout.
17. The experience is complete, accessible, and polished on mobile.
18. No database migration or data-migration script is committed.

---

## 24. Functional walkthrough for implementation review

Use this scenario as the primary working-product review, not merely a source
contract check:

1. Create a homeowner account.
2. Select “Buying existing.”
3. Add an address, closing date, move-in date, and inspection concern.
4. Confirm the property and see buyer-specific first value.
5. Open Home and verify the buyer major moment, next deadline, and plan CTA.
6. Open Buyer Plan and invite/assign a co-buyer.
7. Upload an inspection report through the direct Inspection Hub route.
8. Confirm findings and classify one for negotiation and one for post-close
   work.
9. Revise the first finding to post-close and verify the existing task changes
   phase rather than duplicating.
10. Upload and verify an insurance/closing document through the direct document
    route.
11. Ask Cozy: “What is blocking me before closing?”
12. Use Ask Cozy to draft and confirm assignment of one buyer task.
13. Generate moving actions and complete one from the buyer plan.
14. Link a provider booking to an applicable task and reconcile completion.
15. Mark the property closed and verify `RECENT_OWNER`, first-30-day copy, and
    carried inspection work.
16. Complete or disposition remaining pre-close work.
17. Trigger day-90 handoff and verify one canonical recurring task per unresolved
    ownership obligation.
18. Open Home and verify the normal homeowner experience retains the acquisition
    record and no duplicate work.

This walkthrough must work with normal application navigation and rendered UI.
Direct API calls or hand-constructed URLs are not an acceptable substitute for
the user journey.

---

## 25. Repository impact map

Expected primary implementation areas:

- `apps/backend/prisma/schema.prisma`
- `apps/backend/src/productFramework/buyerAcquisition.contract.ts`
- `apps/backend/src/services/HomeBuyerTask.service.ts`
- `apps/backend/src/services/buyerAcquisition.service.ts`
- `apps/backend/src/controllers/homeBuyerTask.controller.ts`
- `apps/backend/src/routes/homeBuyerTask.routes.ts`
- `apps/backend/src/services/homeActions.service.ts`
- `apps/backend/src/productFramework/homeAction.contract.ts`
- `apps/backend/src/productFramework/homeActionSourceAdapters.ts`
- `apps/backend/src/services/movingConcierge.service.ts`
- `apps/backend/src/routes/movingConcierge.routes.ts`
- `apps/backend/src/services/ask/askLifecyclePromptPolicy.ts`
- `apps/backend/src/services/ask/askAudienceContext.ts`
- `apps/backend/src/services/ask/askOperationRegistry.ts`
- `apps/backend/src/services/ask/askOrchestrator.service.ts`
- `apps/frontend/src/app/onboarding/address/page.tsx`
- `apps/frontend/src/app/onboarding/confirm/page.tsx`
- `apps/frontend/src/app/onboarding/first-value/page.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/page.tsx`
- `apps/frontend/src/components/home/UnifiedHomeSurface.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/buyer-plan/page.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/moving-concierge/page.tsx`
- `apps/frontend/src/components/MovingConcierge.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/ask/*`
- `apps/frontend/src/lib/api/client.ts`
- `apps/frontend/src/lib/navigation/*`
- `apps/frontend/src/components/mobile/dashboard/*`
- worker notification scheduling and destination resolution

Implementation may refactor these locations, but it shall preserve the product
contracts and canonical ownership defined by this FRD.

---

## 26. Requirement traceability index

| ID | Requirement | Primary sections |
| --- | --- | --- |
| `HB-IDENT-001` | Buyer remains a full `HOMEOWNER` account and a property-scoped journey | 3, 18 |
| `HB-IDENT-002` | One user may own one property and buy another without global-segment conflicts | 3, 8 |
| `HB-ONB-001` | Buyer onboarding captures stage and optional lifecycle anchors with minimal friction | 7.2, Slice 1 |
| `HB-ONB-002` | Buyer plan exists before first-value reveal | 7.3, Slice 1 |
| `HB-HOME-001` | Unified Home renders buyer plan as an active major moment | 7.4, 17 |
| `HB-HOME-002` | Buyer tasks participate in the canonical ranked Home feed | 17 |
| `HB-NAV-001` | Buyer plan is reachable in one click from Home on desktop and mobile | 8, Slice 2 |
| `HB-NAV-002` | Every buyer CTA uses a direct property-scoped canonical route | 8.3 |
| `HB-NAV-003` | Property, entity, and return context survive every buyer workflow transition | 8.4–8.5 |
| `HB-PLAN-001` | One canonical buyer plan owns transaction, inspection, moving, and first-90-day work | 5.1, 9, 12 |
| `HB-PLAN-002` | Buyer task create/edit/status/assignment/evidence/booking operations are available in UI | 9.3–9.5 |
| `HB-PLAN-003` | Milestones and blockers are first-class, explainable records | 9.5, 9.7 |
| `HB-PLAN-004` | Default templates are stage- and context-applicable and idempotent | 9.6 |
| `HB-EVID-001` | Completion distinguishes attestation, attached evidence, and verification | 9.4, 11 |
| `HB-INSP-001` | Inspection import, confirmation, disposition, and repair continuity use one obligation identity | 10 |
| `HB-INSP-002` | Finding reclassification transactionally updates existing linked work | 10.2, 16.5 |
| `HB-NEG-001` | Negotiation Shield has a buyer mode with write-back and professional boundaries | 10.3 |
| `HB-DOC-001` | Buyer documents use the canonical property document workspace and readiness states | 11 |
| `HB-MOVE-001` | Moving Concierge generates canonical buyer tasks rather than a second checklist | 12 |
| `HB-ASK-001` | Ask Cozy receives bounded canonical buyer context | 13.2 |
| `HB-ASK-002` | Ask Cozy supports buyer-specific read and confirmed-write operations | 13.3 |
| `HB-ASK-003` | Ask Cozy prompts vary by exact buyer stage and current entity context | 13.4–13.7 |
| `HB-SITE-001` | Buyer-aware copy and actions are consistent across all major site surfaces | 14 |
| `HB-DATA-001` | Schema directly supports stage, milestones, contacts, task states, and evidence | 15 |
| `HB-DATA-002` | No migration, backfill, dual-read, or permanent buyer-role model is introduced | 2, 15.8 |
| `HB-API-001` | One buyer overview read model prevents query races and fragmented page loading | 16.1 |
| `HB-PERM-001` | Viewer, contributor, and owner behavior is consistent across buyer features | 18 |
| `HB-LIFE-001` | Pause/cancel stops reminders and prevents recurring handoff | 7.9, 16.2 |
| `HB-LIFE-002` | Closing and day-90 handoff preserve history and strand no unresolved obligation | 7.7–7.8, Slice 7 |
| `HB-UX-001` | The complete buyer journey is responsive, accessible, fast, and reliable | 19 |
| `HB-ADV-001` | Advocacy prompts appear only after meaningful value and never interrupt urgent work | 14.11, Slice 7 |
