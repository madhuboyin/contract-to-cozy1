# Home Buyer Experience — Functional Requirements and Implementation Plan

**Version:** 1.47
**Date:** 2026-08-19
**Status:** Implementation in progress
**Audience:** Product, design, frontend, backend, workers, data, content, and engineering
**Primary routes:** `/onboarding/address`, `/dashboard`, `/dashboard/properties/:propertyId/buyer-plan`, `/dashboard/ask`
**Related systems:** Unified Home, Plan & Projects, Home Record, Inspection Hub, Ask Cozy, Guidance, Negotiation Shield, Provider Booking, Coverage, Household, Notifications, and Moving Concierge

---

## 1. Executive summary

ContractToCozy shall provide a premium, continuous home-buyer experience whose
initial and dominant purpose is a seamless journey from an active purchase
through closing. Before closing, every major surface shall prioritize the work
required to reach closing: deadlines, contingencies, inspections, financing and
title readiness, insurance, documents, final walkthrough, communications, and
move coordination. The experience may continue into move-in, the first 90 days,
and normal homeownership only after the purchase is confirmed closed.

A buyer is a possible future homeowner, not a guaranteed property owner. The
platform may represent the consumer with the existing `HOMEOWNER` account role,
but that technical role must not imply that the purchase will close. Buyer is
not a reduced account role and shall not become a new `UserRole` enum. Buying is
a property-scoped journey derived from canonical entry context, ownership
state, an active buyer plan, and the user's property access. The same person may
own one home while buying another, and an active purchase may be paused,
cancelled, or abandoned without becoming an owned property.

The product promise is:

> ContractToCozy turns the fragmented work of buying a home into one calm,
> evidence-backed plan, then carries everything learned during the transaction
> into the buyer's permanent Home Record and recurring ownership experience.

The target experience shall give the active buyer a dedicated Buyer Closing
Home rather than a rearranged homeowner dashboard. It shall combine deadlines,
inspection findings, transaction documents, negotiation decisions, service
work, moving, household assignment, and closing preparation. Ask Cozy shall
understand the exact buyer stage and offer buyer-specific prompts and operations
grounded in the selected property's records. Homeowner-oriented maintenance,
savings, renovation, recurring operations, and long-term property-management
content shall not compete for attention before closing. Those capabilities
shall be progressively revealed after closing is confirmed.

Buyer guidance shall be customized from accurate canonical context, including
property type and features, property age, the independent ages/evidence of
included appliances and major systems, and source-qualified location. Whenever
the product requests one of these details, it shall first explain the specific
checklist benefit and permit the buyer to continue when the answer is unknown.

The Home Buyer module is a **guidance engine and helping hand**, not a transaction
data-entry system. Every phase shall first tell the buyer what matters now, why
it matters, what to do next, the nearest reliable deadline, and what to ask the
appropriate professional. Data capture is secondary and shall be requested only
when it changes guidance, protects continuity, or records a material decision.
Detailed transaction records remain available through progressive disclosure
without dominating the buyer's primary experience.

The experience must feel like the best expression of ContractToCozy. Buyers are
high-intent acquisition users with unusually low tolerance for friction because
they are already navigating a stressful, deadline-driven transaction. A broken
link, confusing status, repeated question, slow workflow, or missing next step
can cause immediate abandonment. When the experience consistently reduces that
stress, a buyer is likely to invite a co-buyer, agent, family member, or future
home buyer and may become a strong organic advocate for the product.

The highest-priority delivery constraint is that buyer changes shall not break,
degrade, reroute, hide, or semantically alter existing homeowner functionality.
Buyer Closing Home is an additional property-scoped experience, not a rewrite of
the homeowner product. A user viewing an owned property must retain the current
Home, Plan & Projects, Home Record, tools, Ask Cozy behavior, permissions,
notifications, routes, and canonical data semantics unless this FRD explicitly
describes an additive post-close handoff.

---

## 2. Greenfield implementation policy

This initiative uses the following operating assumptions:

1. There are no real users and no production user data.
2. Data migration and backfill are not required.
3. The target Prisma schema may be changed directly.
4. The user will apply the database schema change.
5. Engineering shall not create a database migration script.
6. Obsolete demo data, duplicate buyer tables, and obsolete buyer compatibility
   paths do not need to be preserved. This does not authorize removal or
   behavioral change of functioning homeowner capabilities.
7. Do not build buyer-data dual-read, dual-write, shadow, backfill,
   compatibility, staged migration, or percentage-rollout infrastructure.
   Preserve the existing homeowner runtime contract directly.
8. Do not add internal approval gates, pilot admission gates, or manual policy
   gates that slow development.
9. Safety, authorization, evidence, regulated-advice boundaries, and explicit
   confirmation for material writes remain required product behavior; these are
   user protections, not internal approval gates.
10. Implementation priority is a seamless working journey. Tests shall support
    functionality and prevent regressions, but test-count maximization is not a
    product objective.
11. Homeowner functional preservation is P0. A buyer feature is incomplete if
    it causes an existing homeowner route, workflow, tool, permission, command,
    notification, property switch, or data write to behave incorrectly.

Schema changes proposed by this document shall be made in
`apps/backend/prisma/schema.prisma` during the implementation slice that uses
them. Prisma Client shall then be regenerated. No migration file shall be
committed.

---

## 3. Product decision: buyer is a journey, not an account type

### 3.1 Account identity

- Account role remains `HOMEOWNER`.
- `HOMEOWNER` is the platform's consumer account classification; it is not a
  factual claim that an active buyer owns the selected property.
- A buyer retains the consumer account's underlying capabilities and data
  continuity, but the pre-close experience intentionally suppresses or
  deprioritizes homeowner-only features that are irrelevant to reaching closing.
- Progressive disclosure is presentation logic, not a restricted account role:
  the buyer remains in one coherent product and transitions in place at closing.
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
| Recent owner | Confirmed close plus `RECENT_OWNER` or ownership-start date | Progressive reveal of safety, access, utilities, warranties, systems baseline, and first maintenance cycle |
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
- Ask Cozy has lifecycle-aware presentation and a property-scoped buyer context
  provider with deterministic buyer reads and confirmation-gated commands.
- Buyer Plan has a five-phase, property-scoped closing workspace with a single
  recommended action, nearest known deadline, and phase-specific professional
  questions ahead of optional forms and complete task records.
- A revision-aware Contract & Contingency Tracker supports resumable manual or
  linked-document drafts, field-level source confirmation, superseded revisions,
  and guarded write-back to eligible Buyer Plan milestones and tasks.
- Owners can pause and resume active pre-close journeys while preserving tasks,
  documents, evidence, findings, and entered work; reminders stop while paused.
- Onboarding confirmation captures or confirms a compact home profile—plain-
  language home type, approximate year built, and optional bedroom/bathroom
  counts—and persists those facts to the canonical Property record.
- Ask Cozy reads contract timelines, negotiation readiness, buyer costs,
  inspection/document state, task/finding dispositions, and lifecycle state,
  and uses confirmation-gated buyer commands including pause and resume.

### 4.2 Remaining functional gaps this FRD resolves

- The first-value reveal does not yet consistently turn those facts into an
  immediately useful age-, type-, and location-aware preview.
- Buyer Plan still exposes several complete operational forms behind its new
  guidance layer; each phase needs continued conversion from manual recordkeeping
  to document-assisted, outcome-oriented guidance.
- Contract extraction remains optional future acceleration; the implemented
  tracker has safe manual/link-document revision and confirmation paths but its
  primary UI still needs a concise critical-deadline summary before advanced
  fields.
- Inspection coordination persists useful operational data, but the primary
  experience still needs to lead with a personalized inspection checklist,
  local questions, and report-to-action guidance rather than scheduling fields.
- Full task create/edit/delete/restore, batch, contact/milestone mutation, and
  evidence-completion controls are not yet available through intentional Buyer
  Plan UI paths.
- Persistent journey navigation, buyer-aware tool discovery, remaining
  notification/collaboration work, and complete included-path rendered
  acceptance coverage remain unfinished.
- Technical schema cleanup and removal of genuinely unused buyer tables/columns
  requires a separate evidence-based cleanup exercise; it shall not be coupled
  to the guidance redesign or performed from UI assumptions.

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

### 5.6 Closing first, homeowner after closing

Before a purchase is confirmed closed, the experience shall optimize for one
outcome: helping the buyer complete the closing journey calmly and correctly.
The account may retain access to shared platform infrastructure, but the default
navigation, Home surface, recommendations, notifications, Ask Cozy prompts, and
calls to action shall suppress homeowner-only maintenance, renovation,
refinance, savings, recurring operations, and long-term property-management
content.

Pre-close suppression shall not hide transaction-relevant capabilities merely
because they are also useful to owners. Documents, inspection records,
insurance binding, provider coordination, moving, household collaboration, and
property facts remain available when they support closing. After the user
confirms closing, the same product shall progressively reveal first-90-day and
homeowner capabilities without requiring a new account, re-onboarding, or data
re-entry.

### 5.7 Mobile is a primary buyer surface

Inspection negotiations, walkthroughs, moving tasks, and document collection
often happen away from a desk. All primary buyer workflows shall be complete on
mobile, including upload, assignment, disposition, evidence, and Ask Cozy.

### 5.8 Celebrate progress without trivializing risk

Closing, inspection review, move-in, and 90-day handoff deserve polished
celebration states. Safety findings, legal deadlines, coverage gaps, and
uncertain evidence shall remain clear and serious.

### 5.9 Near-zero friction is a retention requirement

Buyer friction is a product failure, not cosmetic inconvenience. The primary
journey shall minimize required input, page transitions, redirects, repeated
questions, loading states, and unclear decisions. Every buyer surface must make
the next useful action obvious, preserve entered data, recover safely from
errors, and allow the user to leave and resume without reconstructing context.

The experience shall specifically prevent:

- asking for information already recorded elsewhere;
- requiring unknown transaction details before the buyer can receive value;
- routing through global pages that must rediscover the property;
- exposing an API capability without an understandable UI path;
- showing generic homeowner content ahead of urgent buyer work;
- promoting maintenance, renovation, refinancing, long-term savings, or
  recurring ownership actions before the purchase is confirmed closed;
- losing draft input after upload, validation, network, or provider failure;
- forcing the user to understand internal terms such as orchestration,
  disposition, lineage, or handoff; and
- presenting an error without a recovery action.

The buyer must receive useful first value in the initial session even when the
address lookup, inspection report, closing date, or external AI provider is
unavailable.

### 5.10 Homeowner functionality is a protected contract

Buyer work may reuse stable homeowner services and records, but shall not change
their existing owner semantics as a side effect. Additive fields, adapters, and
buyer modes must be explicitly scoped by selected property and lifecycle. When
buyer context is absent, cancelled, invalid, or associated with another
property, existing homeowner behavior is the default.

Implementation shall prefer:

- a thin dashboard mode dispatcher over conditional buyer logic inside the
  standard homeowner Home;
- buyer-specific page composition and DTOs over removing fields from homeowner
  DTOs;
- additive registry metadata with owner-preserving defaults over global tool
  filters;
- adapters that translate buyer work into existing canonical obligations over
  changes to homeowner obligation meaning;
- property-scoped feature decisions over user-role or account-wide switches;
  and
- additive post-close acquisition history over replacement of existing Home
  Record, Home Operations, coverage, property, or household records.

No buyer code path may require an owned property to have a buyer plan, create a
buyer plan during a homeowner read, reinterpret `HOMEOWNER` as an active buyer,
or suppress an owner tool because the same account is buying a different
property.

### 5.11 Guidance first, data capture last

The primary buyer experience shall behave like a calm closing companion. Each
surface must prioritize, in order:

1. what matters now;
2. the single recommended next action and why it is next;
3. the nearest reliable deadline;
4. plain-language questions to ask the responsible professional;
5. recovery guidance when the buyer is blocked or unsure; and
6. optional records and advanced details.

The interface shall not present a database form, complete transaction taxonomy,
or equal-priority checklist as the default phase experience. It shall prefer
document upload, canonical fact reuse, derived guidance, and short conditional
questions over transcription. A field may appear in the primary flow only when
its answer changes the next action, deadline, applicability, safety boundary,
or durable handoff. Otherwise it belongs under optional details.

The product's advantage over a generic AI answer is continuity: it remembers
the selected property, current phase, confirmed deadlines, documents, decisions,
and completed actions, then uses them to guide the next step without asking the
buyer to reconstruct context.

---

## 6. Personas and jobs to be done

### 6.1 Primary buyer

Needs one reliable answer to: “What matters next, and what could prevent or
delay my closing?” Post-close obligations may be captured for later, but they
must not overwhelm the active closing journey.

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

### 6.6 High-intent acquisition and advocacy user

The buyer may never complete the purchase and must receive standalone value
before ownership. If the experience is fast, calm, and dependable, the buyer is
well positioned to invite a co-buyer, recommend ContractToCozy, or carry the
Home Record into long-term ownership. Referral actions shall be optional and
appear only after a meaningful success moment. Advocacy is an earned outcome,
not an assumption about the user.

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
- home type using familiar choices such as house, townhome, condo/apartment,
  multi-family, or **Not sure**; a response is required, but uncertainty is valid;
- approximate year built when known, with **Not sure** and no forced guess;
- optional bedrooms and bathrooms through compact controls;
- basement configuration: none, unfinished, finished, or **Not sure**;
- pool or spa presence: yes, no, or **Not sure**;
- purchase stage: exploring, offer made, or under contract;
- target closing date, if known;
- inspection status: not scheduled, scheduled, report available, or reviewed;
- optional move-in date;
- the user's immediate concern or goal.

Unknown values are allowed. The user shall never be blocked because a closing
date, inspection report, lender, or agent is not yet known.

Year built is the canonical input for property age. The product shall derive
the approximate property age or age band instead of asking the buyer to enter
both values. Lookup- or document-sourced values shall be prefilled and remain
correctable. This compact home snapshot should normally take about one minute
and shall immediately produce a plain-language preview of the guidance it
changed.

### 7.3 Immediate first value

After confirmation, the user shall see a buyer-specific reveal:

- journey stage;
- the single next best action;
- the nearest known deadline;
- evidence readiness;
- a short personalized preview such as age/type-relevant inspection questions,
  location-aware topics to investigate, or the key dates to confirm next;
- a direct “Open my buyer plan” CTA;
- an Ask Cozy prompt relevant to the selected stage.

The app shall create the buyer plan before this reveal completes. It shall not
wait for the dashboard to be opened.

### 7.4 Dedicated Buyer Closing Home

When the selected property has an active pre-close buyer journey, `/dashboard`
shall render a dedicated **Buyer Closing Home**, not the standard homeowner Home
with cards hidden or reordered. It may share the application shell, design
tokens, property switcher, component primitives, and canonical data services,
but its page composition, information hierarchy, loading state, empty states,
recommendations, and analytics are buyer-specific.

The Buyer Closing Home shall identify itself unmistakably as the selected
property's closing command center and answer three questions immediately:

1. How close am I to being ready for closing?
2. What must I do next?
3. What could delay or block closing?

Its desktop and mobile hierarchy shall be:

1. **Closing summary:** a buyer-facing title such as **Your closing at [street
   address]**, complete address, current closing step, target closing date,
   days until closing, plain-language attention state, an **Open closing guide**
   action, and a compact five-step journey. The current activity may support
   this summary but shall never replace the closing identity of the page.
2. **Next best action:** exactly one dominant, actionable CTA with the reason it
   is next, its due date, and a safe recovery path.
3. **Needs attention now:** only blocked, overdue, or explicitly
   closing-blocking work due within seven days, ordered by deadline and
   materiality. The selected next action shall not be repeated here.
4. **Coming up:** at most three chronologically ordered, de-duplicated confirmed
   task or milestone dates through closing, including
   contingencies, inspection, appraisal/financing, title/attorney, insurance,
   final walkthrough, funds preparation, and close date when applicable.
5. **Closing guide summary:** compact outcome-oriented status that leads to the
   complete guide without turning Home into a second checklist or transaction
   dashboard.
6. **Ask Cozy closing copilot:** stage-specific prompts grounded in the current
   blocker, deadline, or readiness lane.
7. **Saved for after closing:** collapsed count of accepted future obligations;
   never a competing pre-close work queue.

When a missing or conflicting property age, appliance/system age, dwelling/
feature, responsibility, or location fact materially affects the current or next
phase, Buyer Closing Home may show one secondary **Improve this checklist**
prompt. It shall explain the specific benefit, allow **Not sure**, and preview
the resulting checklist change. It shall never displace an urgent deadline or
block the primary closing action.

The primary CTA shall normally be “Continue closing journey” or the exact next
action, not “Explore your home.” The page shall never show the homeowner Home's
generic all-clear. When no blocker exists, it shall show “On track for your
recorded closing date” together with the next preparation action and a clear
statement that ContractToCozy does not certify closing readiness.

Before confirmed closing, Buyer Closing Home operates in **Closing Journey
Mode**. Its entire content budget is reserved for closing progress, next action,
deadlines, blockers, transaction evidence, and buyer coordination.
Homeowner maintenance schedules, renovation inspiration, refinancing,
long-term savings, recurring home operations, owner-oriented coverage renewal,
and generic property-improvement recommendations shall not render on this page.
A captured post-close obligation may appear only as a quiet “Saved for after
closing” count and shall not compete with a pre-close action.

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

The readiness section shall visually separate “Required or useful before
closing” from “Saved for after closing.” The pre-close group is expanded and
ranked; the post-close group is collapsed by default and displays only a count
and reassurance that the work has been preserved.

### 7.7 Closing and move-in

The user marks the property closed or confirms ownership-start date. Closing is
the presentation-mode boundary. The app:

- updates canonical ownership state to `RECENT_OWNER`;
- celebrates the milestone;
- changes language from “Buying this home” to “Your first 90 days”;
- carries unresolved accepted work forward;
- activates safety, access, utility, coverage, warranty, and systems-baseline
  tasks;
- keeps transaction evidence in the permanent Home Record.
- exits Closing Journey Mode only after the close transition is successfully
  persisted;
- progressively reveals first-90-day homeowner navigation and modules; and
- never switches modes based only on a scheduled closing date passing.

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

### 7.9 Deal paused, resumed, or cancelled

The buyer can pause, resume, or cancel a deal. The app shall:

- stop deadline and task reminders immediately;
- preserve uploaded evidence and user notes;
- restore the preserved journey, next action, and eligible reminders when the
  owner resumes;
- mark open tasks cancelled or archived with lineage;
- avoid creating recurring maintenance work;
- allow the candidate property to be archived;
- optionally let the user start another candidate property without repeating
  account setup.

---

## 8. Information architecture and zero-friction navigation

### 8.1 Primary navigation

Before confirmed closing, the shell presents a buyer-focused navigation model:

1. Home
2. Closing Plan
3. Documents
4. Ask Cozy
5. Profile & Settings

“Home” resolves to the dedicated Buyer Closing Home for the selected purchase
property. It shall not resolve to the standard homeowner Home and then filter
its modules on the client.

“Closing Plan” routes directly to the selected property's canonical Buyer Plan;
it shall not open a generic projects catalog. “Documents” opens the selected
property's transaction document workspace. Do not add a permanent sixth global
“Buyer” tab or make the buyer choose between buyer and homeowner workspaces.

After closing is confirmed, navigation transitions in place to the standard
homeowner shell:

1. Home
2. Plan & Projects
3. Home Record
4. Ask Cozy
5. Profile & Settings

The transition shall preserve the selected property, browser/session context,
history, and existing deep links.

### 8.2 Contextual buyer navigation

When the selected property is buyer-applicable:

- Home header includes a persistent closing-journey chip.
- Closing Plan is a persistent one-click destination on desktop and mobile.
- Property switcher shows a stage label such as “Under contract” or “First 90
  days.”
- Mobile displays a sticky “Continue buyer plan” action when the user is not on
  the plan.
- Ask Cozy launcher includes the buyer stage in its accessible label and
  suggested prompts.
- Homeowner-only catalogs and promotional navigation are omitted before closing.

If one account owns another property while buying the selected property, shell
presentation follows the selected property. Switching to an owned property may
show the homeowner shell; switching back to the active purchase immediately
restores Closing Journey Mode with no lost context.

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

### 8.7 Closing Journey Mode rules

Closing Journey Mode is active for the selected property while its buyer
journey is `ACTIVE` or `PAUSED` and no successful close transition has recorded
the property as owned. A target closing date, completed task percentage,
document upload, or inferred conversation shall never activate homeowner mode.

The mode shall be derived from canonical lifecycle state on the server and
included in the dashboard bootstrap, Buyer Closing Home, navigation, Buyer
Plan, recommendation, and Ask Cozy read models. Frontend surfaces shall not
independently guess the mode.
Closing Journey Mode ends only through the explicit, authorized close
transition. Cancellation or abandonment returns the user to an intentional
candidate-property state; it must not reveal homeowner content for that
property.

### 8.8 Buyer/homeowner isolation and dispatch

`/dashboard` shall resolve the selected property and one server-derived
presentation mode before choosing a page composition:

- `BUYER_CLOSING` renders Buyer Closing Home only for an applicable active
  pre-close purchase;
- `HOMEOWNER` renders the existing standard homeowner Home for owned properties;
  and
- an intentional no-property/cancelled-candidate state renders its existing or
  explicitly defined neutral experience.

The dispatcher shall not mutate data, create a buyer plan, infer mode from
`UserRole`, or fall through from an owned property into buyer mode. Direct
homeowner deep links remain valid. Property switching changes presentation for
the selected property only, without changing account-level role, another
property's mode, cached queries, navigation history, or permissions.

Shared caches and query keys shall include property ID and presentation mode
where response shapes differ. Buyer invalidation shall not evict or replace
unrelated owned-property data. A buyer endpoint or component failure may show a
buyer recovery state for that purchase; it shall not prevent the user from
switching to and operating an owned property.

---

## 9. Buyer Plan functional requirements

### 9.1 Overview

The buyer plan is the canonical execution surface. It shall be responsive,
stage-aware, editable, and evidence-connected.

### 9.2 Page structure

1. A one-time **Make this plan fit my home** initialization appears before the
   closing phases when material property facts remain unanswered; it summarizes
   known facts, asks only high-impact plain-language questions, and collapses to
   a compact **Plan personalized** summary after completion.
2. Compact journey header: property, stage, and one editable closing-date
   summary with absolute date and countdown when known.
3. Five plain-language closing steps that describe buyer outcomes rather than
   internal transaction domains. Buyer-facing navigation, cards, and print
   output shall not prefix them with **Phase 1**, **Phase 2**, or other internal
   sequence labels; completed, current, and upcoming states communicate order.
4. Overview guidance card with exactly one dominant next action and a concise
   reason it is next.
5. Nearest confirmed deadlines, ordered by urgency without duplicating progress
   metrics already shown in the header.
6. On phase open, a **What matters now** explanation, one recommended action,
   nearest known deadline, and useful questions for the responsible professional.
7. Phase-specific tools and forms collapsed as optional details; opening the
   recommended action reveals and focuses the exact underlying record.
8. Expandable complete phase checklist, evidence, workload, contacts, Ask Cozy,
   history, and handoff status.

Empty phases shall say **Later** or **Nothing needed yet**, never `0/0`. Progress
shall reflect applicable outcomes, not completion of optional profile fields.

### 9.3 Task operations

The user shall be able to:

- create a task;
- edit title and description;
- change phase, priority, type, due date, and estimated cost;
- assign or unassign an eligible household member when the property has more
  than one eligible member;
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

Assignment is a secondary collaboration aid, not a required buyer input. For a
single-member property the assignee control is hidden. For a multi-member
property it is labeled **Handled by**, offers household members plus **No one
yet**, and never lists an agent, lender, attorney, inspector, or other external
professional. Professional responsibility is explained separately in guidance.

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

Templates are conditional guidance, not one rigid list. They shall be added
idempotently based on journey stage and known context. This table is the compact
plan overview; Section 14.15 defines the authoritative phase checklist content
and applicability requirements.

| Phase | Default action | Applicability |
| --- | --- | --- |
| Exploring | Add or confirm candidate property | Candidate journey |
| Exploring | Review known property facts and missing records | Always |
| Exploring | Estimate purchase and immediate post-close exposure | When sufficient property context exists |
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

First-30-day and days-31–90 templates may be generated early to preserve
continuity, but they shall remain in the collapsed “Saved for after closing”
group and shall not create pre-close notifications, Home feed items, featured
Ask Cozy prompts, or navigation promotions. They become actionable only after
the canonical close transition.

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

- Before an inspection report exists, the primary experience is an
  **Inspection-day guide**, not a scheduling-and-scope intake form. It shall
  explain what to inspect, what to ask, and which property-specific areas merit
  added attention based on the confirmed home snapshot and location context.
- The guide shall contain a durable whole-home checklist plus conditional
  modules for relevant facts such as age, basement, pool/spa, attached/common
  elements, water/sewer, roof, structure, and locally evidenced risks. A
  suggested module is guidance, not an assertion that a defect exists.
- The buyer can open a dedicated checklist-only print route. Printed output
  shall exclude the app shell, Buyer Plan header, progress, lifecycle controls,
  phase navigator, unrelated forms, and other closing-plan content.
- Appointment, access, attendee, scope, specialist, report-due, and reinspection
  records remain optional details and are collapsed until the buyer chooses to
  organize them or a recommendation requires them.
- The technical label **Inspection contingency deadline** shall be presented as
  **Last day to raise inspection concerns**, with contextual explanation when
  the contractual meaning matters.
- Buyer Plan shall display report state: none, processing, review pending,
  confirmed, or archived.
- Import opens the property-scoped Inspection Hub directly.
- Importing an inspection report cannot become the next action until the buyer
  records that the inspection occurred, indicates that a report is available,
  or a report/document already exists.
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

Before confirmed closing, Ask Cozy is a **closing copilot**. Featured prompts,
suggested follow-ups, answer ranking, action cards, and proactive guidance shall
lead with activities that help the buyer reach closing. Ask Cozy may record an
accepted issue for later, but shall not expand into generic homeowner education
or promote maintenance, renovation, refinance, savings, or recurring operations
unless the buyer explicitly asks. After closing, prompt policy transitions to
first-90-day homeowner guidance.

Ask Cozy shall not create a new `BUYER` account role or infer buyer status from
free-form text alone.

### 13.2 Buyer context provider

Add a bounded buyer-journey context provider containing:

- property ID and access role;
- entry path and ownership state;
- canonical dwelling/ownership/responsibility and confirmed feature summary;
- property age, source-qualified location, and bounded included-system/appliance
  age/readiness summary;
- buyer-plan ID, stage, status, and progress;
- target closing and move-in dates;
- checklist-section progress, applicability, and blockers;
- checklist applicability reasons plus the highest-value missing/conflicting
  property fact, without dumping the full property context;
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
| `BUYER_CONTRACT_TIMELINE` | Explain confirmed contract dates, sources, conflicts, and missing confirmations | “Which contract dates still need my confirmation?” |
| `BUYER_INSPECTION_REVIEW` | Summarize confirmed finding decisions | “Which inspection findings still need a decision?” |
| `BUYER_NEGOTIATION_READINESS` | Organize negotiation inputs | “What should I discuss with my agent about the inspection?” |
| `BUYER_FINANCING_READINESS` | Summarize purchase-loan, appraisal, rate-lock, and lender-condition status | “What financing item could delay closing?” |
| `BUYER_TITLE_ESCROW_READINESS` | Summarize recorded title, attorney/escrow, survey, HOA, and appointment status | “What is still open with title or escrow?” |
| `BUYER_DOCUMENT_READINESS` | Show expected/received documents | “Which closing records am I still missing?” |
| `BUYER_WALKTHROUGH_READINESS` | Prepare or summarize the final walkthrough checklist and issues | “Build my final walkthrough checklist.” |
| `BUYER_DISCLOSURE_FUNDS_READINESS` | Summarize recorded Closing Disclosure changes, questions, and funds readiness | “What changed in my Closing Disclosure?” |
| `BUYER_CLOSING_DAY_READINESS` | Summarize appointment, ID/document, funds, question, key, and possession checklist | “What do I need for closing day?” |
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
- What could delay or block my closing?

#### Closing scheduled

- What could block my closing readiness?
- Help me prepare for the final walkthrough.
- What should I confirm for insurance, utilities, and access?
- Which required closing documents or milestones are still incomplete?

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
- “Ask whether this affects closing”;
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

- Buyer-path signup copy shall lead with a seamless path to closing. Owning,
  maintaining, and protecting a home may be mentioned as future continuity, not
  as simultaneous work the buyer must configure.
- No separate buyer signup, role selector, or upgrade is required.
- Post-login transition copy shall reflect the selected buyer journey when one
  exists.

### 14.2 Buyer Closing Home and homeowner Home separation

- The buyer receives a dedicated Buyer Closing Home until closing is confirmed.
- The standard homeowner Home does not render for an active pre-close purchase
  property.
- Buyer Closing Home uses a buyer-specific overview DTO rather than composing
  itself from the generic homeowner feed.
- Buyer progress, next action, closing date, blockers, timeline, readiness
  lanes, documents, people, and Ask Cozy appear in the prescribed hierarchy.
- Buyer obligations still participate in canonical identity and deduplication,
  but generic homeowner ranking does not control the Buyer Closing Home layout.
- Buyer Closing Home has dedicated skeleton, missing-date, no-blocker, paused,
  cancelled, error-recovery, and offline/resume states.
- Desktop and mobile provide the same capabilities; mobile keeps the next action
  and nearest deadline visible without obscuring content.
- Owner-only cards, promotions, and feed items are not merely demoted; they are
  excluded from the Buyer Closing Home component tree and response payload.
- After confirmed closing, `/dashboard` switches to the standard homeowner Home
  and carries the acquisition history and accepted work forward.

### 14.3 Plan & Projects

- Before closing, the global entry is labelled “Closing Plan” and opens the
  active buyer plan directly; the generic project catalog is not the default.
- Related negotiation, repair, booking, and moving work appears grouped beneath
  it rather than as unrelated projects.
- Accepted post-close repair work is captured in a collapsed “Saved for after
  closing” group until the close transition.

### 14.4 Home Record

- Before closing, navigation uses the plain-language label “Documents” and
  opens the correct property transaction document page directly.
- Inspection, disclosures, title/closing records, warranties, and completed
  transaction milestones appear in a clear acquisition-history section.
- Private financial and transaction documents are not publicly shared by
  default.
- The broader Home Record taxonomy is progressively revealed after closing.

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
- Tools irrelevant to reaching closing do not appear in pre-close
  recommendations, shortcuts, onboarding, or proactive Ask Cozy prompts. They
  may remain available through an explicit search or direct route so
  progressive disclosure does not create a dead end for an intentional user
  request.

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

### 14.12 Existing tool portfolio review

The tool review covered the canonical desktop/mobile discovery catalogs,
property-scoped tool routes, workflow-only tools, legacy redirects, Buyer Plan,
Inspection Hub, Coverage, Moving Concierge, and backend buyer/Ask operations.
The decision rule is:

- **Reuse with buyer mode** when the existing tool owns the correct records and
  decision workflow.
- **Workflow-only** when a tool is useful only from a specific checklist item or
  finding and would add noise as a standalone buyer recommendation.
- **Buyer-only tool** when the job exists only because the user is purchasing
  and has a distinct closing artifact, lifecycle, and safety boundary.
- **Hidden before closing** when the tool is oriented to ongoing ownership and
  does not materially help the active purchase reach closing.

The reviewed disposition is:

| Existing capability or route family | Pre-close disposition | Required buyer treatment |
| --- | --- | --- |
| Inspection Hub / inspection report analyzer | Core buyer tool | Add inspection-phase checklist, specialist follow-up, negotiation/reinspection linkage, and direct Buyer Closing Home status |
| Negotiation Shield | Core buyer tool | Default to buyer-inspection mode from findings; write seller request/outcome back to the same obligation |
| Home Records, Quick Document Scan, property documents | Core buyer infrastructure | Present as transaction “Documents”; organize by contract, disclosures, inspection, financing, title, insurance, and closing |
| Coverage & Premium Review, Coverage Options, Risk Premium Optimizer | Reuse in buyer insurance mode | Focus on quote assumptions, effective date, lender/mortgagee requirements, bind status, and proof of insurance; hide renewal optimization |
| Moving Concierge | Reuse near closing | Generate canonical buyer tasks and show only date-sensitive move, utility, address, access, and possession actions |
| Property Brief / legacy buyer preview | Optional due-diligence tool | Present verified facts and explicit unknowns; never frame it as an inspection, appraisal, disclosure, or closing certification |
| Past Hazard Exposure and Around Your Home | Optional due-diligence tools | Surface only sourced property-relevant evidence or a material active signal; no unsupported value or safety conclusions |
| Property Tax Center | Optional due-diligence tool | Buyer mode explains recorded/official tax facts and likely reassessment questions; appeal workflow remains post-close |
| HOA Compliance and Permit Tracker | Conditional due-diligence tools | Launch only when HOA, open permit, permit history, unpermitted-work, or document context makes them relevant |
| Service Price Radar, Service Quote Decision, Price Finalization | Workflow-only | Launch from an inspection finding, specialist quote, negotiated repair, moving service, or closing task; preserve return/write-back context |
| Visual Inspector | Workflow-only | Use for user-captured condition evidence and walkthrough photos, never as a professional inspection substitute |
| Repair vs Replace, Do-Nothing Simulator, Home Upgrade Planner | Workflow-only exception | May support a specific accepted inspection finding or negotiation cost question; never promote as general pre-close ownership planning |
| Project Tracker | Workflow-only exception | Use only when a pre-close repair or seller commitment genuinely needs milestones/evidence; otherwise reveal after closing |
| Emergency Help | Always directly available | Keep accessible for actual urgent safety events but do not promote routine homeowner emergency preparation as closing work |
| Home Event Radar | Alert-only before closing | Surface a material, current, property-matched event when it may affect access, insurance, inspection, or closing; hide the generic monitoring catalog |
| Status Board, Guidance Overview, Home Timeline | Underlying integration only | Feed relevant facts/actions into Buyer Closing Home; do not expose parallel generic dashboards before closing |
| Ownership Costs, True Cost, Cost Explainer/Growth/Volatility, Budget Planner | Hidden before closing | Replace purchase needs with bounded purchase-financing and cash-to-close tools; reveal ownership budgeting after closing |
| Financing Center | Hidden before closing in current form | It is an equity/project-financing surface, not purchase financing; do not relabel it |
| Mortgage Refinance Radar and its Loan Estimate comparison | Hidden as a refinance tool | Reuse reviewed extraction/math primitives where appropriate, but create a separate purchase-loan contract, records, copy, conclusions, and analytics |
| Sell/Hold/Rent, Break-Even, Sale Case, Seller Prep, Value Tracker | Hidden before closing | Seller/owner strategy is irrelevant to executing the current purchase |
| Capital Timeline and Reserve Fund Planner | Hidden before closing | Reveal after closing; a future obligation may be saved silently but not promoted |
| Savings and Benefits, Hidden Asset Finder, Home Savings | Hidden before closing | Reveal after closing unless a specific program is required to complete the purchase and is explicitly linked by the user/professional |
| Renovations, DIY, Material Specs | Hidden before closing | Preserve accepted future work in “Saved for after closing”; do not launch planning journeys before close |
| Home Habit Coach, Seasonal Checklists, Plant Advisor, Appliance Oracle, Energy Audit | Hidden before closing | Ongoing ownership and lifestyle tools appear only after close |
| Home Briefing / Home Gazette, Home Digital Will, generic Home Records taxonomy | Hidden or simplified before closing | Use transaction-specific documents/status only; reveal the broader ownership framing after close |
| Coverage/insurance trend, Home Risk Replay beyond due diligence, neighborhood monitoring | Hidden unless transaction-relevant | No generic premium or continuous-monitoring promotion before close |

Legacy aliases and redirect-only routes are not separate tools and shall not
receive buyer cards. Duplicate catalog entries shall resolve to one canonical
buyer destination and one analytics identity.

### 14.13 Required buyer-only closing tools

Six buyer-only tools are required because no current tool owns their complete
purchase-specific workflow. They appear as modules or deep workspaces from
Buyer Closing Home and Buyer Plan; they do not create a separate “buyer tools”
catalog the user must browse.

| Buyer-only tool | Purpose and minimum output | Why an existing tool is insufficient |
| --- | --- | --- |
| **Contract & Contingency Tracker** | Extract or manually record accepted-contract dates; produce a user-confirmed timeline for earnest money, inspection, attorney review, financing, appraisal, title, HOA/document, sale-of-home, closing, and possession conditions | A generic Buyer Plan target date cannot own signed-source revisions, field confirmation, source citation, guarded write-back, or contingency lifecycle; the dedicated tracker now owns this boundary |
| **Purchase Financing & Loan Estimate Center** | Track application/underwriting/appraisal/rate-lock milestones; upload/extract or manually enter official purchase Loan Estimates; compare confirmed fields; record the buyer's selected offer and remaining lender conditions | Current Financing Center is owner equity/project financing; Refinance Radar has refinance assumptions and conclusions that must not be reused as purchase guidance |
| **Title, Escrow & Closing Document Center** | Track title/attorney/escrow contacts, title commitment and exceptions, survey/HOA requirements, deed/vesting questions, closing location, document readiness, and user-recorded professional review | Home Records stores files but does not manage buyer-specific title/escrow readiness or professional follow-up |
| **Final Walkthrough Companion** | Provide a mobile room/system checklist, agreed-repair verification, included-item verification, photo/video evidence, issue list, and agent/attorney escalation handoff | Inspection Hub is report-centered and does not own the time-sensitive final walkthrough or compare current condition with seller commitments |
| **Closing Disclosure & Cash-to-Close Review** | Upload/extract or manually enter the latest Closing Disclosure, compare confirmed fields with the selected Loan Estimate and contract credits, explain changes, track questions, and record user-confirmed final funds readiness | Document storage alone does not compare revisions or organize discrepancies; refinance comparison is the wrong transaction contract |
| **Closing Day Companion** | Provide time/place/participants, identification and funds-readiness checklist, wire-fraud safeguards, final questions, keys/access/possession checklist, signed-copy capture, and explicit close confirmation | No current tool owns the closing-day sequence or the authoritative transition from buyer to recent owner |

These tools provide preparation, organization, comparison, and evidence capture.
They do not review a contract as an attorney, determine loan eligibility, clear
title, validate wiring instructions, certify a walkthrough, approve a Closing
Disclosure, or declare that legal closing occurred. Material status remains
“user recorded” or “professional confirmed by user” unless a governed external
source is later integrated.

Loan Estimate and Closing Disclosure extraction are optional accelerators, not
prerequisites. Both tools shall support complete manual entry, partial save and
resume, field-level document/revision source, validation, and explicit user
confirmation before canonical write-back. OCR, PDF parsing, or external AI
failure shall never prevent the buyer from recording readiness, questions, or a
closing blocker.

Appraisal, insurance, inspection, moving, and repair-estimate experiences do
not need additional standalone buyer tools. They need buyer modes and the phase
checklist integration below.

### 14.14 Buyer phase checklist framework

The checklist is the buyer's primary guidance mechanism. Every phase shall have
a concise checklist embedded in Buyer Closing Home and the corresponding tool.
The buyer shall not need to know which product tool owns an action.

No phase checklist shall be a static list instantiated wholesale. The system
shall compose a property-specific checklist from canonical property context,
contract terms, transaction path, professional/document inputs, and discoveries
made during the journey. “Condo checklist,” “townhouse checklist,” and
“single-family checklist” are not three copied templates; they are outcomes of
one versioned applicability engine combining reusable modules.

Checklist requirements:

- one canonical `HomeBuyerTask` per obligation across checklist, tool, Ask Cozy,
  notification, and Buyer Closing Home;
- phase and section progress based only on applicable items;
- conditional composition for financed versus cash purchase, jurisdiction,
  attorney/title model, dwelling type, ownership form, responsibility scope,
  structure/features, HOA, well/septic, hazard context, new construction,
  inspection choices, and known contract terms;
- plain-language **why this matters**, **who normally handles it**, **due date or
  timing**, **completion criteria**, and **what to do if blocked**;
- user-facing states **Not started**, **In progress**, **Blocked**, **Done**, and
  **Not applicable**, mapped to canonical task status plus applicability; unknown
  applicability remains distinct from not applicable;
- optional assignment to an eligible buyer or co-buyer household member only;
  agents, lenders, attorneys/title/escrow professionals, inspectors, insurers,
  and other external contacts may be named as helpers but are not assignees;
- evidence requirement only when it materially improves continuity; a checkbox
  alone shall never be displayed as verified professional evidence;
- one primary action per item, direct route, exact entity context, and automatic
  return to the same checklist position;
- template version and provenance so regeneration adds newly applicable items
  without overwriting user edits or completed work;
- no phase may show dozens of equal-priority items at once: show **Next**,
  **Blocking**, and **Coming up**, with the complete checklist expandable. This
  is enforced with a hard visible-item cap (see §19.1), not left to editorial
  judgment alone, since a soft rule with no structural backstop is the surest
  way for this experience to drift back into a dense intake form;
- Ask Cozy may explain, locate, draft, assign, or update an item, but material
  completion and lifecycle transitions require explicit confirmation; and
- checklist completion is preparation progress, never a guarantee of legal,
  lending, title, insurance, inspection, or closing approval.

Every rendered phase shall apply progressive disclosure in this order:

1. **What matters now:** a short buyer-facing outcome, not a technical phase
   definition.
2. **Recommended next action:** one executable applicable task selected by
   priority, blockers, and due date.
3. **Nearest known deadline:** sourced from the applicable task or confirmed
   canonical milestone; target closing is a fallback, not a substitute for a
   nearer contingency.
4. **Helpful questions:** concise prompts the buyer can take to an agent,
   inspector, lender, attorney/title/escrow professional, insurer, or closing
   professional as appropriate.
5. **Optional records:** complete checklists, forms, notes, contacts, documents,
   and historical detail remain collapsed until requested or deep-linked.

The phase navigator shall use familiar outcome labels such as **Understand your
contract**, **Inspect the home**, **Prepare to fund & protect**, **Get ready to
close**, and **Close & get the keys**. Internal labels such as `DUE_DILIGENCE`,
`CONTRACT_CONTINGENCIES`, module counts, applicability deltas, lineage, and
revision machinery shall not be the primary buyer-facing language.

#### 14.14.1 Checklist composition layers

The applicability engine shall merge and deduplicate items from these layers:

1. **Universal transaction core:** contract dates, contacts, documents,
   inspection decision, closing logistics, explicit close confirmation.
2. **Transaction path:** financed/cash, existing/new construction, occupancy,
   possession timing, attorney/title/escrow model, and contract contingencies.
3. **Canonical dwelling classification:**
   `DETACHED_SINGLE_FAMILY`, `ATTACHED_SINGLE_FAMILY`, `TOWNHOUSE`,
   `CONDO_UNIT`, `APARTMENT_UNIT`, `DUPLEX`, `MULTI_FAMILY`,
   `MANUFACTURED_HOME`, `OTHER`, or `UNKNOWN`.
4. **Ownership and responsibility:** fee simple, condominium, cooperative,
   leasehold, association/common elements, and the recorded responsible party
   for roof, exterior, landscaping, shared systems, plumbing, HVAC, snow/ice,
   pests, and other scopes.
5. **Structure and spaces:** basement, crawl space, slab, attic, garage,
   balcony/deck/patio, private/shared yard, outbuildings, number of units, and
   finished or converted areas.
6. **Systems and site:** heating/cooling/fuel, electrical, plumbing, roof,
   chimney/fireplace, sump pump, pool/spa, irrigation, private well, septic,
   sewer, oil tank, solar, elevator, parking/storage, and other confirmed assets;
   installed/purchased/manufactured dates, service history, warranty, condition,
   and expected-expiry evidence determine age-sensitive system/appliance items.
7. **Location and exposure:** address, state, county, city, ZIP, jurisdiction,
   geocode confidence, climate/season, utility context, flood, wildfire,
   hurricane/coastal, drainage, radon, pest, freeze, wind, or other locally
   relevant review prompts, without asserting a hazard from proximity alone.
8. **Age, records, and compliance:** property year built and age band, known
   permits, open flags, additions/conversions, disclosures, HOA/condo records,
   inspection findings, and document-extracted facts. Property age may add
   age-relevant questions; it shall not be presented as proof of poor condition.
9. **Journey discoveries:** each confirmed inspection finding, seller
   commitment, appraisal condition, insurer question, title issue, lender
   condition, walkthrough observation, or revised contract term may add or
   resolve checklist items.

The engine shall use canonical Property Context facts and responsibility records
rather than introducing a second buyer-only property profile. A checklist rule
may consume multiple facts; `dwellingType` alone is never sufficient to infer
that a basement, HOA, private roof responsibility, septic system, or other
feature exists.

Property age, appliance/system age, and location are first-class applicability
inputs:

- **Property age** may tailor questions about prior renovations and permits,
  electrical/plumbing materials, foundation/basement, roof history, insulation,
  environmental-material context, sewer/service lines, and locally relevant
  safety requirements. Rules must combine age with known structure, location,
  records, or system facts and avoid declaring a defect from age alone.
- **Appliance/system age** may tailor remaining-warranty/document questions,
  inspection focus, specialist review, seller-history questions, replacement-
  exposure capture, and immediate post-close preservation. Use the canonical
  inventory item's installation/purchase date precision, identity, service
  history, verified evidence, and expected-expiry provenance. Never assume an
  appliance was installed when the property was built, and never label an item
  unsafe or end-of-life from age alone.
- **Location** may tailor jurisdictional attorney/title/escrow flow, local
  inspection or certificate questions, climate- and pest-relevant inspection
  modules, insurance questions, utility/private-system context, property-tax/
  HOA prompts, and closing logistics. Use confirmed or source-qualified
  location facts; proximity or regional prevalence is a question trigger, not a
  property-specific finding.

#### 14.14.2 Property-specific inspection examples

| Known context | Inspection/due-diligence modules added or changed |
| --- | --- |
| Detached single-family | Exterior envelope, roof, grading/drainage, foundation, attic/crawl/basement when present, private utilities/site features, trees/outbuildings when confirmed |
| Attached single-family or townhouse | Party/shared walls, water migration between attached units, fire separation, shared roof/exterior/drainage responsibility, HOA documents when applicable, private versus common decks/yards/parking |
| Condo unit | Unit interior and buyer-responsible systems, windows/doors responsibility, visible moisture from adjacent/common areas, balcony/storage/parking, HOA master insurance, reserves/assessments, rules and move requirements; common elements are tracked as association questions rather than represented as buyer-owned systems |
| Cooperative or leasehold unit | Unit condition plus governing documents, approval/lease obligations, maintenance responsibility, building-provided systems, and professional questions appropriate to the ownership form |
| Duplex or multi-family | Per-unit condition, common systems, fire separation/egress, utility metering, shared areas, occupancy/lease records when applicable, and responsibility across units |
| Manufactured home | Foundation/tie-down/skirting, transport/title classification questions, roof/envelope, park or land-lease terms when applicable, utility connections, and locally applicable inspection/certification records |
| Confirmed basement | Moisture intrusion, drainage, sump pump/backup, foundation walls, radon context, egress, finished-area permits, exposed utilities, and prior water evidence |
| Confirmed crawl space | Access, moisture/vapor barrier, pests, insulation, drainage, structural supports, plumbing, and ventilation/conditioning as applicable |
| Confirmed pool/spa | Barrier/ gate, visible condition, equipment, electrical bonding/GFCI questions, leaks, permits, and specialist review option |
| Confirmed private well/septic | Water quality/flow and well records; septic location, pumping/inspection records, capacity/condition, setbacks, and specialist review |
| Confirmed chimney/fireplace, oil tank, solar, generator, or other specialty system | Add only the corresponding evidence and specialist-review module; absence or unknown status never produces a completed item |
| HOA/association responsibility for roof or exterior | Replace buyer-owned component checks with visible-condition observations, association records, master policy, reserves/assessment questions, and responsibility confirmation |
| Older property with confirmed/unknown major-system dates | Add targeted history, permit, material, service-life, and specialist questions appropriate to known structure/location; do not infer defects or copy property age onto appliance ages |
| Older furnace, water heater, HVAC, roof, or included appliance with source-qualified age | Add age/warranty/service-history and inspection-focus questions for that item, while keeping condition and professional findings separate |
| Location with source-qualified climate, pest, radon, flood, wind, wildfire, freeze, coastal, or local compliance relevance | Add the relevant question/document/specialist module with source and boundary; do not state that the property is damaged, unsafe, uninsurable, or noncompliant |

These modules guide preparation and evidence capture; they do not expand a
general inspector's licensed scope or imply that ContractToCozy performed an
inspection. The buyer can add a specialist module, mark it not applicable with a
reason, or record that a professional advised it was unnecessary.

#### 14.14.3 Unknown, conflicting, and changing property facts

- Unknown is not false. If a high-value fact is missing, show one concise
  just-in-time question such as “Does this property have a basement?” with
  **Yes**, **No**, and **Not sure**.
- Unknown facts create a visible “Needs property detail” candidate only when the
  answer could materially change closing preparation. They do not inflate
  completion denominator or appear as overdue work.
- Conflicting facts from user input, listing/import, document extraction, or
  inspection remain unresolved and identify their sources; the engine shall not
  silently pick one.
- A user-confirmed fact updates canonical Property Context, not a checklist-only
  copy. Material extracted facts require confirmation before changing the
  checklist.
- Reuse trustworthy existing records before asking. Prefill source-qualified
  year built, location, and appliance/system dates from canonical property,
  inventory, document, and inspection records; show source and date precision
  and ask only for missing, stale, or conflicting information.
- Re-evaluate applicability when relevant property facts, documents, contract
  terms, findings, or responsibility records change.
- Newly applicable items are added once with an explanation such as “Added
  because you confirmed a finished basement.”
- Items that become not applicable leave active progress and reminders but keep
  history, evidence, and the reason for removal. Completed or user-authored work
  is never silently deleted.
- Recalculation never resets completion, assignment, notes, evidence, due-date
  overrides, or explicit user decisions.
- The overview returns used, missing, and conflicting fact keys so the UI can
  explain why each customized item is present or absent.

#### 14.14.4 Explain the benefit of accurate property details

The product shall explain the concrete benefit before asking for a property,
appliance/system, or location detail. Do not use generic copy such as “Complete
your profile for better results.” Each request shall state what will change and
what will not be assumed.

Required copy pattern:

> **Why we ask:** [detail] helps ContractToCozy [specific checklist benefit].
> You can choose **Not sure** and continue. We will not treat age or location as
> proof of a defect, hazard, or professional finding.

Examples:

| Detail requested | Required benefit explanation |
| --- | --- |
| Year built / approximate property age | “This helps us add age-relevant inspection and permit questions and avoid showing checks that do not fit this property. Age alone will not be treated as a defect.” |
| Appliance or system type and installation/purchase year | “This helps us focus the inspection checklist on the systems included with the purchase, ask for useful warranty/service records, and flag near-term questions without assuming the item needs replacement.” |
| Full address, county, or corrected location | “This helps us tailor local closing steps, title/attorney or escrow context, climate and specialist inspection questions, and insurance/document preparation. Regional context is not proof of a property-specific problem.” |
| Condo/townhouse/ownership responsibility | “This helps us separate what you should inspect or document inside the unit from what the association or another party maintains.” |
| Basement, well/septic, pool, chimney, oil tank, solar, or other feature | “This adds only the relevant inspection, document, specialist, and walkthrough checks and removes unrelated work.” |

After the user supplies or corrects a detail, show a compact, dismissible result
such as “Checklist updated: 4 basement checks added; 2 slab-only checks removed.”
Allow the user to view the exact changes and the facts that caused them. Never
use fear, completion-score pressure, or an inaccurate “required” label to obtain
optional details.

The current flat default checklist and title-based default-task detection are
insufficient. Checklist identity shall use stable template/action keys, not
English task titles.

### 14.15 Required phase checklists

The following are baseline checklist modules, not static lists. The composition
engine shall select, specialize, and order their items using Section 14.14,
remove irrelevant work, and allow unknown information without blocking first
value.

#### A. Contract setup and contingency checklist

- Upload or record the accepted contract and every material addendum/revision.
- Confirm property, buyer names, seller names, contract acceptance date, target
  closing date, and possession terms against the current source.
- Record earnest-money amount, recipient, method, and due date; capture receipt
  when available without instructing the buyer where to send funds.
- Record inspection, attorney-review, financing, appraisal, title, HOA/document,
  sale-of-home, and other known contingency deadlines.
- Record seller credits, included/excluded items, agreed repairs, and special
  closing conditions.
- Add agent, lender, attorney/title/escrow, inspector, and insurer contacts as
  they become known.
- Confirm every extracted date and term against the source; unresolved or
  conflicting dates become blockers, not silently chosen values.

#### B. Inspection and due-diligence checklist

- Select and schedule the inspection; record date, access, attendee, and report
  due timing.
- Confirm the chosen scope and any context-relevant specialist inspections such
  as radon, sewer/septic, well/water, pest, chimney, roof, structural, electrical,
  HVAC, pool, oil tank, mold, or environmental review.
- Prepare property-specific questions and known disclosures for the inspector.
- Upload/import the report and confirm extraction completeness.
- Review every safety/major finding and classify it as negotiation, accepted
  post-close work, verified fact, or dismissed with reason.
- Obtain specialist or repair estimates when a finding needs them.
- Record the buyer's professional discussion, requested seller resolution,
  seller response, credit/repair outcome, and any contingency decision.
- Schedule and record reinspection or documentary proof for agreed repairs when
  applicable.
- Resolve or explicitly disposition every material inspection item before its
  contingency deadline.

#### C. Purchase financing and appraisal checklist

- Record cash purchase or financing path; do not show lender steps to a cash
  buyer.
- Submit the loan application and track user-recorded requested documents.
- Upload and compare current official Loan Estimates on aligned loan amount,
  product, term, rate/lock, APR, payment, mortgage insurance, lender credits,
  loan costs, prepaid/escrow amounts, and cash to close.
- Record intent-to-proceed/selected lender as a buyer decision, not a platform
  recommendation.
- Track appraisal ordered, scheduled, completed, value/condition issue, and
  resolution status without presenting platform valuation as lender appraisal.
- Track underwriting requests, rate-lock expiration, homeowner-insurance proof,
  title conditions, final verification, and user-recorded clear-to-close status.
- Escalate any financing deadline or unresolved lender condition as a closing
  blocker.

#### D. Title, attorney/escrow, survey, and HOA checklist

- Confirm the responsible attorney, title company, settlement agent, or escrow
  contact according to the transaction context.
- Record earnest-money receipt/escrow confirmation when provided.
- Upload title commitment/preliminary report and record whether the buyer has
  reviewed questions with the appropriate professional.
- Track unresolved exceptions, liens, judgments, easements, ownership/vesting,
  deed-name, or legal-description questions only as user-recorded issues.
- Obtain or confirm survey requirements and upload the current survey when
  applicable.
- Obtain HOA/condo documents, fees, assessments, insurance, transfer steps, and
  approval/right-of-first-refusal status when applicable.
- Track municipal, permit, certificate-of-occupancy, septic/well, or other local
  closing requirements when known.
- Confirm closing appointment, format, location, required attendees, and
  possession/key timing.

#### E. Homeowners insurance checklist

- Gather the property and lender facts required for comparable quotes.
- Compare quote assumptions, deductibles, limits, exclusions, endorsements,
  replacement-cost basis, and applicable flood/wind/earthquake options without
  recommending regulated coverage.
- Resolve inspection, roof, electrical, plumbing, prior-loss, or carrier
  questions that could prevent binding.
- Select and bind a policy through the insurer/agent with an effective date that
  satisfies the recorded closing requirement.
- Provide mortgagee/lender details when applicable.
- Upload declarations/binder or proof of insurance and record delivery to the
  lender/closing professional when the user confirms it.

#### F. Final walkthrough checklist

- Schedule the walkthrough close enough to closing for the user's transaction
  and record attendees.
- Open the current contract terms, included/excluded items, seller commitments,
  inspection outcomes, repair evidence, and unresolved questions in one view.
- Confirm the property is accessible, substantially in the expected condition,
  and cleared according to the buyer's recorded agreement.
- Verify included fixtures/appliances and agreed personal property are present;
  record missing or substituted items.
- Verify agreed repairs visually or through supplied evidence; do not certify
  workmanship outside available evidence.
- Check for material new damage and test accessible lights, plumbing, HVAC,
  appliances, doors/windows, garage/access devices, smoke/CO devices, and other
  context-relevant systems without encouraging unsafe testing.
- Confirm utilities needed for the walkthrough are on and record meter/access
  details when useful.
- Capture room/system photos, notes, and an unresolved-issue list with exact
  contract/finding linkage.
- Route unresolved issues to the buyer's agent/attorney/closing professional;
  ContractToCozy shall not tell the buyer to close, delay, withhold funds, or
  exercise a legal remedy.

#### G. Closing Disclosure and funds-readiness checklist

- Upload the latest Closing Disclosure and confirm document revision/date.
- Compare it with the selected Loan Estimate and recorded contract credits;
  highlight changes without declaring them lawful or acceptable.
- Confirm buyer/property names, loan terms, projected payment, cash to close,
  credits, prorations, prepaid items, escrow funding, and material fees have been
  reviewed by the buyer.
- Record questions and user-confirmed resolution with lender/settlement
  professional.
- Confirm the buyer knows the required form and timing of funds from a trusted
  professional source.
- Display persistent wire-fraud protection: never trust changed emailed
  instructions; independently verify using a known phone number; the platform
  never supplies or validates destination account details.
- Record funds readiness without storing full bank account or wire credentials.

#### H. Closing-day checklist

- Confirm date, time, location/remote method, attendees, possession timing, and
  a trusted contact for last-minute issues.
- Prepare required identification and any user-recorded required documents.
- Confirm funds method and instructions were independently verified through a
  trusted channel; never display or transmit full wire credentials.
- Review the buyer's unresolved questions and blockers before the appointment.
- Track user-confirmed signing/copy receipt without interpreting legal effect.
- Confirm keys, remotes, codes, mailbox/access items, warranties/manuals, and
  possession arrangements when applicable.
- Capture final signed/closing records in transaction Documents.
- Require explicit user confirmation that the professional closing process is
  complete before setting the property to `RECENT_OWNER` and revealing the
  homeowner experience.

#### I. Move and possession checklist

- Confirm possession date separately from legal closing date.
- Coordinate mover, storage, cleaning, utility start, address changes, internet,
  insurance effective date, and essential delivery/access windows.
- Preserve critical transaction documents, identification, medications,
  valuables, and an essentials kit outside packed household goods.
- Confirm first-access keys/codes and a safe fallback if possession is delayed.
- Keep these actions secondary to unresolved closing blockers.

### 14.16 Buyer-aware tool discovery contract

Extend the canonical capability registry rather than hard-coding tool filters
independently in desktop, mobile, Home, Ask Cozy, and command search. Each tool
definition shall declare:

- `preCloseDisposition`: `CORE`, `CONTEXTUAL`, `WORKFLOW_ONLY`, `ALERT_ONLY`, or
  `HIDDEN`;
- supported buyer stages and checklist sections;
- applicability requirements and the reason the tool is relevant now;
- buyer label/description and buyer-mode destination when different from the
  owner presentation;
- source entity/checklist item required for workflow-only launch;
- whether direct intentional search remains allowed while proactive discovery
  is suppressed; and
- the canonical completion/write-back contract.

Buyer Closing Home, Closing Plan, mobile navigation, tool search, inline
recommendations, post-completion suggestions, command palette, and Ask Cozy
shall consume the same policy. A pre-close user shall never see a generic “View
all homeowner tools” recommendation. Buyer-only tools shall be discoverable by
the phase/checklist job they solve, not as a second unstructured catalog.

Buyer discovery metadata is additive. For `HOMEOWNER` mode or when buyer context
is absent, the registry shall preserve the existing capability ID, label,
destination, release/rollout behavior, readiness, safety tier, ordering,
completion contract, and discovery eligibility. Buyer suppression is evaluated
only for the selected pre-close purchase and shall never remove a homeowner tool
from the registry globally or from an owned property's catalog.

### 14.17 Approved Buyer Experience Redesign

The following interaction contract is normative for the primary Buyer
experience. It converts the capabilities in Sections 14.13–14.16 from
transaction-recording surfaces into a calm, personalized closing guide.

#### 14.17.1 Upfront home snapshot

Address onboarding shall capture the small set of common facts a buyer is
likely to know and that materially change near-term guidance:

- familiar home type;
- year built or approximate decade, from which property age is derived;
- bedroom and bathroom counts;
- basement configuration; and
- pool or spa presence.

The interaction shall be compact, prefilled when a source is available, and
permit **Not sure** rather than forcing a guess. It shall not become a general
property-profile questionnaire. Immediately after save, the product shall name
the inspection, document, or closing guidance that was personalized from those
answers.

#### 14.17.2 Make this plan fit my home

The current technical **Plan tailoring** and **Property-aware checklist**
presentation shall be replaced by **Make this plan fit my home**. This is a
one-time initialization before the closing phases, not a permanent transaction
phase or a checklist-diff administration tool.

The experience shall:

1. summarize the reliable facts already known;
2. ask only unanswered questions whose answers change an applicable action,
   inspection focus, document request, deadline, or professional question;
3. use familiar choices and explain the immediate benefit before input;
4. automatically apply safe additive personalization;
5. require review only when existing buyer work would be removed or materially
   changed; and
6. collapse to a small **Plan personalized** summary when no high-impact
   question remains.

Questions may cover HOA/shared responsibility, public versus private water and
sewer, septic, well, solar, fireplace/chimney, material additions or
renovations, and other confirmed features. They shall be conditional. For
example, roof/exterior responsibility is not asked for every buyer; it is asked
only when an attached, condo, cooperative, association, or conflicting-source
context makes the answer consequential.

User-facing copy shall not expose terms such as `dwellingType`, ownership-form
taxonomy, applicability delta, module count, template key, or generation
version. Question ordering shall be based on buyer impact and current-phase
urgency, not template evaluation or map order. The UI shall not silently
truncate a higher-value question because it appears after a fixed display
limit.

#### 14.17.3 Contract and deadline experience

The Contract & Contingency Tracker remains the canonical revision, provenance,
confirmation, and guarded milestone-write-back boundary. Its complete manual
record is not the primary Buyer experience.

The primary contract flow shall be:

1. upload, photograph, or select the current signed contract;
2. extract the dates and terms that can change buyer guidance;
3. present a concise review of only the items found or explicitly added;
4. explain each item in plain language, including why it matters, what the
   buyer should do, who can confirm it, and the consequence of delay;
5. allow **Confirm**, **Correct**, **Not sure**, or **Ask my professional**; and
6. update canonical milestones and reminders only after explicit confirmation.

The primary summary may show contract acceptance, closing, possession,
earnest-money, inspection, financing/appraisal, attorney-review, title, HOA, or
sale-of-home dates only when the item is supported by the current contract,
buyer input, or an explicit unresolved extraction candidate. Unknown
contingencies shall not render as active empty rows. Absence of a date is not
evidence that a contingency was waived, satisfied, or does not exist.

Buyer/seller names, credits, recipients, payment/delivery notes, included and
excluded items, repairs, possession terms, and special conditions remain
available under **View extracted contract details**. A detail may be promoted
into the primary experience when it changes an immediate inspection,
walkthrough, funds, possession, or deadline decision. Confirmation requirements
shall not force completion of unrelated administrative fields before a buyer
can preserve and confirm a critical deadline.

Manual entry remains a resumable fallback when extraction is unavailable or
incomplete, but it shall use the same concise, conditional presentation. The
product shall never claim that extraction or buyer confirmation constitutes
legal review.

#### 14.17.4 Guidance-first phase contract

Every Buyer Plan phase shall render in this order:

1. **Where you are now**;
2. **Your next best move**;
3. **Nearest important deadline**;
4. **Why this matters**;
5. **What to ask the responsible professional**;
6. **What can safely wait**; and
7. collapsed supporting records, forms, history, and advanced details.

The next action shall include a title, due date or timing, plain-language
rationale, consequence of delay, responsible party, suggested question, and
exactly one dominant CTA. An action that depends on an event shall not appear
before its prerequisite. For example, **Import inspection report** is eligible
only when an inspection is complete, a report is available, or the buyer
explicitly indicates possession of a report; before that point, the product
guides scheduling, preparation, scope, and deadline protection.

#### 14.17.5 Authoritative next-action selection

Buyer Closing Home and Buyer Plan shall consume the same property-scoped next-
action result. Before any task-level ranking runs, the selector shall first
check whether "Make this plan fit my home" (§9.2 item 1, §14.17.2 item 2) is
still incomplete for this property; if so, that one-time gate is the entire
result and no phase task is offered, per §9.2's requirement that it appear
before the closing phases. This gate is a status check against the checklist
composition's `setupStatus`, not a `HomeBuyerTask` row — it must never be
implemented as a phase-ordered task, since §14.17.2 explicitly prohibits
treating it as a permanent transaction phase.

Once personalization is complete, ranking shall consider current phase,
confirmed deadlines, prerequisites, completed/blocked work, purchase method,
property facts, available documents, inspection status, and time remaining, in
this order:

1. overdue or immediately risky confirmed deadline;
2. required prerequisite for the current phase;
3. current-phase preparation;
4. document upload after the underlying event or document availability; and
5. future planning.

The two surfaces shall not recommend conflicting actions. A missing or
unconfirmed input may produce a short confirmation action only when that answer
changes the recommendation.

#### 14.17.6 Buyer Home closing summary and urgency

Buyer Home is the buyer's closing status and decision summary, while Buyer Plan
is the complete execution guide. Home shall lead with **Your closing at
[address]**, current closing step, target date, days remaining, and one
plain-language status: on track, needs attention, or urgent. A description such
as **You are inspecting and learning about the home** may explain the current
step but shall not be the page title.

Urgency shall use both the due date and its relationship to the closing date.
Every urgent treatment includes a text label and absolute date; color is
supporting only. The reference thresholds are overdue/after closing or due in
three days as urgent, four to seven days as attention, eight to fourteen days
as upcoming, and later as neutral. Confirmed contractual severity may override
these display thresholds. Buyer Home shall not manufacture urgency from an
unconfirmed or synthetic date.

The selected next action appears exactly once. **Needs attention now** excludes
that action and remains an exception list rather than a second to-do list.
**Coming up** is limited to three unique confirmed dates, after which the buyer
can open the full closing guide.

#### 14.17.7 Inspection-day checklist and printing

The primary pre-report inspection value is a practical checklist the buyer can
view on a phone or print and take to the inspection. The checklist begins with
universal systems and safety observations, adds property-specific attention
areas from confirmed facts, and identifies useful questions for the inspector.
It does not ask the buyer to recreate the inspector's schedule, attendees,
scope, exclusions, or specialist notes before showing guidance.

**Print checklist** opens a dedicated printable representation of that guide,
not `window.print()` on the complete Buyer Plan. Print output includes the
property, checklist generation context, visible checklist items, questions,
and appropriate educational boundary language. Interactive chrome and all
unrelated closing content are excluded.

#### 14.17.8 Calm household collaboration

Most buyer actions are implicitly handled by the signed-in buyer. Do not show
an assignee dropdown on every action merely because the task model supports an
assignee. When only one eligible property member exists, no assignment control
is rendered. When multiple eligible household members exist, a compact
secondary **Handled by** control may assign the action to a member or **No one
yet**. External professionals are described under **Who can help** and are not
mixed into household assignment.

The control uses the canonical task assignment operation and existing task
assignee field. This UX change does not require another assignment table,
parallel task mutation, or duplicated person model.

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

enum BuyerChecklistSection {
  CONTRACT_CONTINGENCIES
  INSPECTION_DUE_DILIGENCE
  FINANCING_APPRAISAL
  TITLE_ESCROW_HOA
  INSURANCE
  FINAL_WALKTHROUGH
  CLOSING_DISCLOSURE_FUNDS
  CLOSING_DAY
  MOVE_POSSESSION
  POST_CLOSE_SAVED
}

enum BuyerEvidenceRequirement {
  NONE
  OPTIONAL
  REQUIRED
}

enum BuyerTaskApplicability {
  UNKNOWN
  APPLICABLE
  NOT_APPLICABLE
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

`BuyerJourneyStage` and `BuyerPlanPhase` are intentionally different concepts
despite overlapping labels:

- **Journey stage** is the buyer plan's single current lifecycle position. It
  controls Closing Journey Mode, Buyer Closing Home presentation, featured Ask
  Cozy prompts, lifecycle transitions, and which checklist section is emphasized.
- **Plan phase** is an individual task's target execution bucket. One plan may
  contain tasks from several phases simultaneously; future-phase tasks can be
  generated early and remain collapsed, non-promotional, or inactive until
  relevant.

Completing every task in a phase shall not automatically advance the journey
stage. Stage changes use the centralized transition policy and explicit
lifecycle evidence/confirmation. `CLOSED` and `HANDED_OFF` are journey stages,
not task phases. `RECURRING_HOME` is a task/handoff phase, not an active buyer
journey stage. Where both enums contain the same label, code shall not cast or
substitute one enum for the other; read models expose them with distinct field
names such as `currentJourneyStage` and `task.phase`.

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
checklistSection         BuyerChecklistSection?
templateKey              String?
templateVersion          String?
applicabilityRuleKey     String?
applicabilityReasonCodes String[] @default([])
applicabilityUsedFactKeys String[] @default([])
applicabilityMissingFactKeys String[] @default([])
applicabilityConflictedFactKeys String[] @default([])
applicabilityBasisHash   String?
applicabilityEvaluatedAt DateTime?
whyMatters               String?
completionCriteria       String?
blockedGuidance          String?
assignedContactId        String?
evidenceRequirement      BuyerEvidenceRequirement @default(NONE)
applicability            BuyerTaskApplicability @default(UNKNOWN)
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

### 15.7 Buyer checklist and tool records

Checklist definitions shall live as versioned code-owned templates. Generated
items remain canonical `HomeBuyerTask` rows with `templateKey`, section,
applicability result, user edits, lineage, and evidence. Do not create a second
checklist-item table.

Checklist composition shall read existing canonical property fields first,
including `DwellingType`, `OwnershipForm`, `FoundationType`,
`PropertyExteriorProfile`, `PropertyResponsibility`, installed systems,
`Property.yearBuilt`, address/city/state/ZIP/county/geocode and source-qualified
exposure facts, permits, documents, and confirmed inspection facts. Appliance
and system age shall come from canonical inventory identity, `installedOn`/
`purchasedOn` plus date precision/range, service history, warranty, verified
source, and expected-expiry provenance where available.

Do not add buyer-specific copies of year built, address/location, appliance age,
or system age. If an extracted or user-entered buyer detail improves a canonical
fact, write it through the governed Property Context or inventory confirmation
path and retain source/evidence. Approximate dates must preserve their precision
or range; they shall not be converted into false exact dates.
Where a required fact has no structured canonical owner, extend Property Context
with a typed field or typed profile rather than adding buyer-plan JSON. Expected
gaps include attic/garage/unit configuration and private-well, septic, chimney,
oil-tank, solar, generator, elevator, and similar specialty-system presence.
Unknown-capable enums/booleans are required; null/unknown shall never mean
absent. These are shared property facts that can benefit later homeowner
features, not buyer-only duplicates.

Persist the applicability decision provenance on generated tasks: rule key,
template version, reason codes, used/missing/conflicting fact keys, basis hash,
and evaluation time. This provenance explains customization and enables safe
recalculation when property facts change. Do not store a second copy of the
underlying property values on each task.

The buyer-only tools require normalized property-scoped records for:

- accepted-contract revisions and user-confirmed extracted dates/terms;
- purchase Loan Estimate offers/revisions and the user-selected comparison;
- Closing Disclosure revisions and field-level comparison to the selected Loan
  Estimate and recorded credits;
- final-walkthrough sessions, room/system observations, evidence, linked seller
  commitments/findings, and unresolved issues; and
- closing-day session state and explicit user close confirmation.

Use explicit models and typed fields for canonical dates, money, statuses,
source document IDs, revision lineage, and confirmations. Extraction payloads
may be retained as immutable provenance, but arbitrary JSON shall not become the
canonical transaction record. Title/escrow, insurance, appraisal, and moving
should use milestones, tasks, contacts, and documents unless a later concrete
workflow proves a separate record is necessary.

All new records shall be scoped to `propertyId` and buyer-plan/checklist ID,
carry created/updated timestamps, and preserve the source document revision.
Sensitive financial documents remain private by default. Full bank-account,
wire-routing, authentication, and identity-document secret values shall not be
stored in buyer tool records.

### 15.8 Moving model cleanup

Remove the separate `MovingPlan.completedTasks` execution source. Preferred
target:

- canonical moving tasks in `HomeBuyerTask`;
- moving inputs in `HomeBuyerChecklist.movingPreferencesJson`;
- optional immutable generation snapshot table or JSON only if regeneration
  provenance is useful.

Because there are no real users, remove obsolete `MovingPlan` fields/model and
all code references directly when the canonical implementation is ready. Do not
create data migration or compatibility logic.

### 15.9 Models not required

Do not add:

- `BUYER` to `UserRole`;
- a user-level permanent buyer segment;
- a second buyer task table;
- a generic arbitrary transaction JSON store as the canonical source;
- migration/backfill tracking tables;
- approval or pilot-admission tables.

### 15.10 Separate schema-cleanup exercise

The guidance-first redesign shall not remove database tables or columns merely
because a field is hidden from the primary UI. Schema cleanup is a separate,
evidence-based exercise performed after the retained buyer workflows and their
canonical data owners are stable.

Before removal, the cleanup must verify reads and writes across services, API
contracts, workers, analytics, Ask Cozy, notifications, tests, exports, audit/
evidence retention, and homeowner handoff. Candidate fields shall be classified
as required, optional professional record, derivable, duplicated, unused, or
legacy. Deprecate writes first, preserve or export valuable historical evidence,
then remove the confirmed unused schema and all code references in one bounded
cleanup change. Do not accumulate new persistence unless it supports a defined
buyer outcome or governed source-of-truth requirement.

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
- single-task assignment through the canonical household assignment command,
  with `null` representing **No one yet** and server authorization against the
  property's eligible members;
- completion evidence endpoint;
- unlink booking;
- dependency management if dependencies are implemented;
- restore custom task where supported.

Every mutation returns the updated overview fragment needed by the page.

### 16.5 Phase checklists and buyer-only tools

Add bounded services and routes for:

- list checklist sections with applicable-item progress, blockers, and next
  action;
- evaluate/re-evaluate compositional applicability from canonical property
  context without overwriting user work;
- return applicability reason codes, used/missing/conflicting fact keys, and at
  most one highest-value just-in-time property question per interaction;
- confirm a property answer through the canonical Property Context write path
  and return the exact checklist delta before/after recomposition;
- update checklist item status, assignment/contact, due date, notes, and
  evidence through the canonical task service;
- extract, confirm, and revise contract dates/terms with field-level source
  references;
- create/compare/select purchase Loan Estimate offers;
- create/compare Closing Disclosure revisions and record questions/resolution;
- create/update/complete walkthrough sessions and linked observations; and
- read/update the closing-day session and explicitly confirm close.

Every buyer-only tool write shall update the affected milestone/task/document
and return the Buyer Closing Home fragment needed for immediate reconciliation.
Extraction endpoints must separate proposed values from user-confirmed
canonical values.

### 16.6 Finding disposition

Finding mutation shall update the finding, linked buyer task, linked guidance
journeys, repair journey, and Home Action inside a transaction or compensating
idempotent workflow. Response returns all affected IDs and new states.

### 16.7 Ask Cozy

Ask operations call the same buyer services as the page. Ask shall not directly
write Prisma buyer records.

### 16.8 Error contract

Expected errors must return stable codes and appropriate statuses:

- `BUYER_PLAN_NOT_APPLICABLE` — 409 or intentional eligibility response;
- `BUYER_PLAN_READ_ONLY` — 403;
- `BUYER_PLAN_NOT_FOUND` — 404 only when creation is not appropriate;
- `INVALID_BUYER_TRANSITION` — 409;
- `INVALID_BUYER_ASSIGNEE` — 400;
- `INVALID_TASK_STATUS` — 400;
- `DEFAULT_TASK_DELETE_FORBIDDEN` — 409;
- `MILESTONE_CONFLICT` — 409;
- `FINDING_REVIEW_REQUIRED` — 409;
- `CHECKLIST_ITEM_NOT_APPLICABLE` — 409;
- `CONTRACT_FIELD_CONFIRMATION_REQUIRED` — 409;
- `PURCHASE_LOAN_COMPARISON_MISMATCH` — 409;
- `CLOSING_DISCLOSURE_REVISION_CONFLICT` — 409;
- `WALKTHROUGH_SESSION_NOT_READY` — 409;
- `CLOSE_CONFIRMATION_REQUIRED` — 409.

Do not expose Prisma validation errors as 500 responses.

### 16.9 Homeowner API preservation

- Existing homeowner endpoints, response fields, mutation meaning, permission
  checks, and error codes remain unchanged unless an additive optional field is
  explicitly documented.
- Buyer overview and buyer-only tool endpoints are separate bounded contracts;
  homeowner pages shall not depend on them.
- Shared property, document, household, coverage, booking, and Home Action
  services retain their current owner call contracts. Buyer adapters call those
  contracts rather than changing their meaning.
- New schema fields used only by buyers are nullable or have safe defaults so an
  owned property without buyer records behaves exactly as before.
- Read operations for owned properties shall not create buyer rows, milestones,
  tasks, contacts, checklist applicability, or lifecycle state.
- Closing handoff is additive and idempotent; it must not overwrite existing
  homeowner tasks, records, preferences, inventory, coverage, or household
  configuration with empty or buyer-default values.

---

## 17. Buyer Closing Home and canonical action integration

### 17.1 Source adapter

Add a canonical buyer-plan action source kind or a reviewed adapter under an
existing appropriate source family. Preferred explicit source:

```text
BUYER_PLAN
```

The source must support completion, defer/snooze where allowed, assignment, and
deep linking back to the exact buyer task or milestone. This adapter preserves
one action identity across Buyer Closing Home, Buyer Plan, Ask Cozy, documents,
inspection, moving, and the later homeowner handoff; it does not require the
pre-close page to use the generic homeowner feed.

### 17.2 Buyer Closing Home ranking rules

- Promote active pending/in-progress buyer tasks.
- Exclude completed, not-needed, and cancelled tasks.
- Keep the selected next action out of the attention and coming-up collections.
- Treat attention as a bounded exception state: blocked, overdue, or explicitly
  blocking and due within seven days. Incomplete alone is not attention.
- Compose upcoming dates from active task deadlines and unresolved milestones,
  de-duplicate equal labels/dates, sort chronologically, and bound the read
  result before presentation.
- Do not promote future low-priority or post-close tasks into pre-close modules.
- Prioritize known deadlines, safety findings, insurance effective date, final
  walkthrough, and immediate post-close access/safety work.
- Apply the same deduplication identity when a finding, guidance journey, and
  buyer task represent one obligation.
- Never duplicate a handed-off maintenance task and its buyer source task.

### 17.3 Dedicated read composition

Buyer Closing Home shall rank canonical buyer actions within its prescribed
closing-specific modules. It shall not call generic homeowner active-major-
moment selection or accept a generic homeowner feed as its page model. The
standard homeowner Home may use the same canonical action identity only after
confirmed closing, when accepted work is progressively handed forward.

### 17.4 Commands

Buyer Closing Home commands on buyer tasks shall reconcile with buyer-plan
state. Completing a closing-home action must update the same task shown in Buyer
Plan and Ask Cozy. After closing, any carried homeowner Home card must continue
to update that canonical obligation rather than create a duplicate.

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
| Edit target closing and move-in dates | No | Yes | Yes |
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
- Buyer Home's first viewport unmistakably identifies the selected purchase as
  a home closing, shows current closing status and days remaining, and does not
  use a current activity as the page title.
- The upfront home snapshot is normally completable in about one minute, reuses
  known facts, and does not require a buyer to know a technical classification.
- No primary Buyer section presents more than one dominant CTA.
- Buyer-facing step navigation does not display numbered **Phase N** labels.
- Every opened phase leads with what matters, one next action, one nearest known
  deadline, and useful professional questions before forms or complete lists.
- No open phase's action list shows more than a small, fixed number of items at
  once (6, per the reference implementation); any remainder stays behind an
  explicit "Show more" disclosure. This is a hard structural limit, not an
  editorial expectation, so a phase with many applicable checklist items can
  never read as a dense intake form.
- Primary phase experiences use plain language and explain unavoidable terms in
  context using a maintained closing-term glossary (contingency, escrow, earnest
  money, appraisal, underwriting, closing disclosure, title search/commitment,
  HOA, disclosure, walkthrough, possession, clear to close, binder, lien,
  encumbrance, and future additions as buyer confusion is observed); a term is
  explained inline the first time it appears in a given block of guidance copy,
  not on every repetition. Internal phase, composition, and persistence
  vocabulary is hidden.
- Detailed forms and advanced transaction fields are collapsed by default and
  may not count against primary progress merely because they are empty.
- Known canonical values are prefilled or reused; document upload is preferred
  over asking the buyer to transcribe the same information.
- A blank comprehensive contract form and unused contingency catalog are never
  the default contract experience.
- An unknown contingency never appears active, satisfied, waived, or expired
  until supported by a confirmed source or explicit buyer input.
- The closing date uses one compact editable summary rather than a dedicated
  full-width panel when no additional decision is required.
- Closing countdown never substitutes for the absolute date.
- Urgency always combines plain-language text, an absolute date, and optional
  color; it accounts for both days until the item is due and days until closing.
- The selected next action is not duplicated in attention or coming-up lists,
  and **Coming up** displays no more than three de-duplicated items.
- Status and priority never rely on color alone.
- Loading uses stable skeletons; no layout jump between plan and overview.
- Mutation buttons show pending state and prevent duplicate submissions.
- Optimistic updates are allowed only when rollback is reliable.
- Empty evidence/task sections explain why they matter and provide one direct
  action.
- Page copy uses buyer language appropriate to stage.
- Every property-detail request explains the immediate checklist benefit before
  input, offers **Not sure**, and avoids fear or profile-completion pressure.
- Buyer Closing Home and Buyer Plan display the same authoritative next action;
  prerequisite-dependent actions remain ineligible until their prerequisite is
  satisfied or explicitly reported by the buyer.
- Household assignment is hidden for a single eligible member and is a
  secondary **Handled by** control for multiple members; external professionals
  are never presented as task assignees.
- Printing an inspection checklist uses a checklist-only route and never prints
  the complete Buyer Plan or application shell.
- After property age, appliance/system age, location, responsibility, or feature
  data changes, show an understandable checklist delta with undo/correction
  access where the canonical fact remains user-editable.

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

### 19.6 P0 homeowner non-regression

Every implementation slice that touches shared code shall verify the affected
homeowner behavior before the slice is considered complete. The priority is
working functionality, not maximizing test count. Use the smallest durable set
of owner contract checks plus rendered route traversal needed to prove:

- an existing owner signs in and lands on the standard homeowner Home;
- owner navigation, property switching, direct deep links, and browser return
  behavior are unchanged;
- Plan & Projects, Home Record, Ask Cozy, tools, coverage, household,
  notifications, provider/booking, and canonical Home Action commands still
  load and write the same records;
- owned properties with no buyer plan perform no incidental buyer writes;
- an account owning one property and buying another gets the correct isolated
  experience for each selected property;
- buyer registry metadata does not change the homeowner tool catalog;
- shared schema/service changes preserve existing owner DTOs, permissions,
  error behavior, and idempotency; and
- post-close handoff adds acquisition history and accepted work without
  deleting, duplicating, resetting, or reclassifying existing homeowner data.

If a shared refactor is not required for buyer functionality, do not include it
in this initiative. A homeowner regression blocks completion of the responsible
slice and is fixed in that slice; this is a functional correctness condition,
not an organizational approval gate.

---

## 20. Analytics and product learning

No internal approval gate is required. Analytics exists to improve the product,
not to block development.

Track at minimum:

- buyer journey selected;
- Buyer Closing Home viewed/rendered;
- Buyer Closing Home next-action/blocker/readiness interaction;
- buyer plan created/opened;
- first buyer action viewed/completed;
- closing date recorded;
- inspection imported/confirmed;
- material finding classified;
- negotiation versus post-close decision;
- document uploaded/verified;
- household member invited/task assigned;
- multi-member **Handled by** control viewed/changed and single-member control
  correctly suppressed;
- inspection-day guide viewed and checklist print initiated/completed;
- deadline urgency band displayed and the associated action opened;
- buyer Ask prompt viewed/submitted/completed;
- Ask-to-buyer-action conversion;
- moving plan generated/task completed;
- closing recorded;
- first-30-day and day-90 completion;
- handoff completed;
- buyer advocacy/referral prompt shown/used/dismissed;
- closing-journey mode entered/exited;
- homeowner-only content incorrectly rendered before closing;
- attempts to reach intentionally undisclosed homeowner tools;
- post-close progressive-reveal engagement;
- homeowner route/API/tool failure rate segmented by release and selected mode;
- unexpected buyer-row creation from homeowner reads; and
- cross-property mode, cache, or navigation contamination;
- property-detail benefit explanation viewed;
- property age, appliance/system age, and location confirmed/corrected/not-sure;
  and
- checklist items added/removed after a property-context change, grouped by
  applicability reason.

Key product measures before real-user learning:

- zero regression in the protected homeowner functional walkthrough;
- zero buyer-plan writes from owned-property reads;
- zero account-wide buyer-mode leakage to another owned property;
- zero broken buyer CTAs;
- zero property-context loss across buyer navigation;
- one canonical task per obligation;
- one canonical closing/move date reused everywhere;
- complete buyer journey operable on mobile;
- no generic all-clear while actionable buyer work exists;
- no buyer mutation available above the user's property permission;
- no unresolved task silently lost during handoff;
- zero homeowner-mode transitions caused only by a scheduled date passing;
- zero owner-only promotional modules in the pre-close primary experience; and
- one-click access to Closing Plan and transaction Documents throughout the
  active purchase.

Buyer-friction measures to instrument from the first usable build:

- time from sign-in to first buyer-specific value;
- time and click count from Home to the next buyer action;
- buyer-plan load and mutation failure rate;
- address lookup fallback completion rate;
- upload retry and recovery rate;
- repeated-field prompt count;
- dead-end/empty-state exits;
- journey resume success after session interruption;
- abandonment before first plan open; and
- abandonment after an error or failed redirect.

---

## 21. Implementation plan

Implementation is organized as vertical slices. Each slice must leave a usable
product increment. Avoid building all backend layers before connecting the UI.
For every slice that changes shared code, the relevant Section 19.6 homeowner
functional checks are part of the slice's functional check. Buyer delivery may
not defer an introduced homeowner regression to a later cleanup slice.

### 21.0 Delivery status

| Slice | Status | Implemented scope | Remaining before slice completion |
| --- | --- | --- | --- |
| Slice 0 | Foundation implemented (`5cc65015`) | Direct Prisma schema correction; journey/task/evidence/applicability/milestone/contact types; `PRE_CLOSE` task-phase removal; stable keys; lifecycle transition policy; viewer-safe reads; frontend contract sweep | Complete bounded overview, milestone, contact, batch, evidence, and buyer-tool API response contracts as their vertical UI paths land; retain centralized error mapping |
| Slice 1 | Core increment implemented | Buyer purchase stage, closing/move dates, inspection status, and concern in trigger-first onboarding; compact upfront home snapshot for familiar home type, approximate year built/derived age, bedroom/bathroom counts, basement, and pool/spa with lookup reuse, safe unknown handling, canonical persistence, synchronous plan initialization, and immediate personalized first value | Complete rendered end-to-end browser verification, deepen property-fact correction/source presentation, and finish onboarding analytics review |
| Slice 2 | Core increment implemented | Server-derived dashboard mode; dedicated Buyer Closing Home redesigned as **Your closing at [address]** with current step, target date, countdown, status, five buyer-facing steps, one authoritative next action, bounded exception-only attention, at most three de-duplicated coming-up dates, Ask prompts, and direct closing-guide access; owner-only pause/resume and preserved paused state | Complete persistent navigation/journey-chip integration, buyer stage labels in property switching, richer error recovery, and rendered desktop/mobile verification |
| Slice 3 | In progress | Strict Buyer Plan overview; canonical task identity; date recalculation preserving user edits; five plain-language outcome steps; guidance-first overview and phase workspaces for contract, inspection, loan estimates/financing, title/escrow, insurance, final walkthrough, Closing Disclosure, and closing day; shared prerequisite-aware next action; collapsed supporting records; calm household **Handled by** assignment hidden for single-member properties | Remove the remaining visible **Phase N** labels from Buyer Plan and print output; complete create/edit/not-needed/cancel/delete/restore UI, explicit evidence completion, milestone/contact mutations, filters, batch operations, booking/cost/note controls, and rendered verification |
| Slice 4 | Core increment implemented | Versioned property-aware checklists; one-time **Make this plan fit my home** flow; concise contract/deadline review with field confirmation and confirmed-only write-back; inspection-day whole-home and property-specific guide; friendly **Last day to raise inspection concerns** label; report-import prerequisite; dedicated checklist-only print route; optional inspection logistics and administrative records hidden by default | Complete automated contract extraction and failure recovery, remaining composition catalog, blocker recovery, return continuity, phase-aware Ask context, and rendered end-to-end verification |
| Slices 5–6 | In progress | Buyer Ask reads plan status, next action, deadlines, contract timeline, inspection/document readiness, negotiation, costs, financing/title/insurance/walkthrough/disclosure/closing-day readiness, and supports confirmation-gated task, finding-disposition, move-status, lifecycle, closing-date, cancellation, pause, and resume commands; Moving Concierge projects canonical buyer tasks | Complete the remaining contextual Ask entry/presentation work and the remaining Slice 6 milestone, booking, collaboration, and notification scope |
| Slice 7 | Complete | Owner-only pause/resume with reminder suppression and preserved work; explicit professional close plus atomic purchase cancellation; mutually exclusive persisted lifecycle claims; cancellation stops active tasks/milestones while preserving completed work, documents, findings, and evidence; authorized close records an idempotent Home Record milestone with signed evidence and opens a first-90-day transition; day-91 handoff requires persisted ownership and resolved pre-close work; Recent Owner progressive reveal, governed advocacy, and deterministic desktop/mobile homeowner-continuity coverage | — |
| Slice 8 | In progress | Removed the orphaned global buyer-checklist card, route, and framework redirect; removed associated duplicate types and obsolete authentication copy; corrected user-segment terminology; expanded the route/CTA contract across the buyer-to-owner journey; retired duplicate Moving execution state and APIs; added accessible Buyer Plan loading and recoverable error states; corrected Buyer Closing Home readiness and mobile-continuation semantics; repaired zero-property account entry so neutral signup/welcome copy and an explicit owner/buyer journey choice lead into trigger-first onboarding instead of the generic property form; hardened that onboarding with compact full-address entry/autocomplete, synthetic-data removal, lookup location matching, and confirmation correction; added deterministic rendered buyer-to-recent-owner and two-owner-plus-active-purchase isolation traversals with desktop accessibility and mobile overflow coverage | Extend the rendered baselines through the Section 24 mutation, persistence, deep-link, permission, and database non-creation checks; finish site-wide copy/link, legacy helper, responsive, accessibility, and remaining empty/error-state audits |

Recent implementation evidence incorporated into this revision:

- `1882ceb1` — normalized Contract & Contingency Tracker workspace, revisions,
  field confirmations, contingencies, guarded reconciliation, API, UI, and tests;
- `331d244c` and `683da172` — owner-authorized pause/resume through Buyer Plan
  and confirmation-gated `BUYER_LIFECYCLE_UPDATE` Ask operations;
- `88207460` — broader deterministic Buyer Closing Copilot reads and
  confirmation-gated commands across contract, negotiation, cost, task,
  finding, move, and lifecycle domains; and
- `48c8ab7f` — five buyer-facing phase outcomes, guidance-first overview and
  opened-phase experience, nearest-deadline selection, professional questions,
  collapsed optional records, exact task reveal/focus, focused component tests,
  TypeScript validation, lint, and production build verification; and
- `0e26d548` — impact-ranked home personalization, pool/spa and basement
  guidance, concise contract-and-date confirmation, partial confirmed-field
  reconciliation, guidance-first phase detail, one prerequisite-aware
  next-action selector shared by Buyer Closing Home and Buyer Plan, and focused
  continuity regression coverage with backend/frontend build verification;
- `6fc234d6` — guidance-first operational workspaces for Loan Estimates,
  financing, title/escrow, homeowners insurance, final walkthrough, Closing
  Disclosure, and closing-day preparation, with administrative data hidden
  behind progressive disclosure;
- `9a53b115` — practical inspection-day guide, whole-home and property-specific
  checklists, friendly inspection-deadline language, optional logistics, and
  prerequisite-aware report import;
- `02fca2e0` and `2c57b1da` — closing-focused Buyer Home iterations culminating
  in the address-led closing summary, current step, countdown, bounded attention,
  de-duplicated coming-up dates, and five buyer-outcome steps;
- `0e0e2c23` — dedicated checklist-only printing and textual/color-supported
  urgency bands based on due date and days until closing; and
- `e8afc974` — calm household collaboration that hides assignment for a
  single-member property and exposes **Handled by** only for eligible household
  members on multi-member properties; and
- `4207f5b8`, `4b93964c`, `3bb7fe0b`, `e5c26cf1`, `209affad`, `348fc005` —
  Ask Cozy buyer-answer reliability hardening across all 18 `BUYER_*`
  operations: broadened intent-classifier phrasing coverage so buyers'
  natural closing questions (deadline risk, financing/title/document/
  walkthrough/disclosure/closing-day readiness, contract timeline, cost,
  and task-completion phrasing) resolve directly instead of falling back to
  a generic clarification prompt; added answer-copy-matching examples to the
  semantic answer-trust corpus so real generated answers — including empty
  and "nothing recorded" states — pass their own operation's relevance check
  instead of scoring closer to an unrelated operation; registered every
  `BUYER_*` operation's navigation-action and professional/wire-fraud
  boundary IDs in the trust-filter allowlists, which had never been extended
  for buyer operations and were silently stripping every buyer response's
  CTA and disclaimer; fixed `NOT_APPLICABLE`/`BLOCKED`/`NEEDS_ENTITY`/
  `NEEDS_CONFIRMATION` buyer results (cash-purchase not-applicable states,
  viewer-permission states, task-disambiguation states, and the
  review-before-confirming step on every buyer mutation flow) losing their
  navigation action because authoritative evidence was only ever attached
  for `ANSWERED`/`COMPLETED`/`READY_WITH_LIMITATIONS` results; and removed a
  frontend gap where `GROUPED_LIST` and `TABLE` blocks only rendered their
  action buttons for one hardcoded block ID. Verified with no regressions
  across the full `ask/` suite (44 files) and the HVAC decision-routing and
  governance suites.

#### 21.0.1 Buyer Experience Redesign delivery plan

The approved Section 14.17 redesign shall be delivered as five vertical
increments. Each increment must expose its buyer value end to end rather than
landing an unused schema or service layer.

1. **Upfront home snapshot.** Extend address onboarding and confirmation with
   basement and pool/spa, retain familiar home type, year built, bedrooms, and
   bathrooms, derive age, reuse lookup values, allow **Not sure**, persist to
   canonical Property Context, and show the resulting personalized guidance.
2. **Plan personalization.** Replace technical Plan tailoring with the one-time
   **Make this plan fit my home** flow; rank questions by current buyer impact,
   ask remaining facts conditionally, automatically apply safe additive
   checklist changes, and collapse completed setup.
3. **Contract and deadlines.** Make signed-document upload/select the primary
   entry, present extracted critical dates as plain-language confirmation
   cards, hide administrative fields, omit unsupported contingencies, preserve
   resumable manual fallback, and retain field-level provenance plus guarded
   canonical write-back.
4. **Guidance-first phases.** Apply the Section 14.17.4 hierarchy to every
   phase, ensure the recommended action focuses the exact supporting record,
   and prevent downstream actions such as report import from ranking before
   their prerequisite event.
5. **Continuity and verification.** Make Buyer Closing Home and Buyer Plan
   consume one authoritative next-action result; verify persistence across
   sign-out/browser restart, property switching, mobile/desktop, missing data,
   extraction failure, and paused/cancelled/closed lifecycle states; add bounded
   analytics for completion, correction, skip, recommendation acceptance, and
   abandonment.

#### 21.0.2 Buyer Experience Redesign implementation status

Status as of `e8afc974`:

| Increment | Status | Delivered | Remaining |
| --- | --- | --- | --- |
| 1. Upfront home snapshot | Core increment implemented | Familiar home type, approximate year built/derived age, optional bedrooms/bathrooms, basement, pool/spa, lookup reuse, safe unknown handling, canonical persistence, and immediate personalized first value are available in onboarding. | Complete rendered onboarding, persistence, correction/source, and analytics checks. |
| 2. Make this plan fit my home | Core increment implemented | The technical tailoring grid is replaced by a one-time guided flow that summarizes known facts, asks the highest-impact unanswered question in familiar language, allows **Not sure**, explains the benefit, automatically applies safe additions, requires review before removals, and collapses to **Plan personalized**. | Expand the consequential-question catalog, add richer recovery/return continuity and phase-aware Ask entry, and complete rendered desktop/mobile verification. |
| 3. Contract and deadlines | Core manual/linked-source increment implemented | The primary experience starts from the signed source, emphasizes only supported consequential dates, omits empty unsupported contingencies, hides administrative detail, supports per-field **Confirm / Correct / Not sure / Ask a professional**, preserves revision/provenance controls, and writes back only explicitly confirmed fields. | Implement automated extraction/population with clear extraction-failure recovery and complete the remaining rendered revision, correction, and write-back acceptance scenarios. |
| 4. Guidance-first phases | Core increment implemented | Every opened step leads with what matters now, one recommended action, why it matters, delay consequence, responsible professional, nearest reliable deadline, a suggested question, what can safely wait, and one focused CTA. Guidance-first workspaces now cover contract, inspection, Loan Estimates/financing, title/escrow, insurance, walkthrough, Closing Disclosure, and closing day; supporting records stay collapsed. | Remove remaining visible **Phase N** copy and complete full rendered step-by-step acceptance coverage. |
| 5. Shared next-action continuity and verification | Core selector, continuity UI, urgency, printing, and assignment increments implemented; rendered verification still outstanding | Buyer Closing Home and Buyer Plan both now consume the same "Make this plan fit my home" gate (§14.17.5): `getPlanOverview` computes `personalization` identically to `getBuyerClosingHome`, and the Buyer Plan page suppresses its phase next action while the gate is open, so a phase task is never offered alongside an unanswered high-impact personalization question. Buyer Home excludes that action from bounded attention and coming-up results, de-duplicates and limits upcoming dates, displays closing-relative urgency, and leads to the full guide. Inspection printing is isolated to a checklist-only route. Assignment uses the canonical household command and is hidden when collaboration is irrelevant. | Verify sign-out/browser restart, property switching, desktop/mobile rendering, missing data, extraction failure, paused/cancelled/closed states, deep-link return continuity, print rendering, multi-member assignment authorization, urgency thresholds, and bounded analytics. |

A subsequent audit against this FRD's own guidance-first principles (§5.11,
§14.17, §19.1) also found and closed two structural gaps that were previously
enforced only by editorial expectation: the plain-language term glossary (§19.1)
is now a maintained term list with an inline first-occurrence explainer, and the
"no dozens of items" rule (§14.14, §19.1) is now a hard visible-item cap with a
"Show more" disclosure rather than a convention that could silently regress.

This implementation did not remove database tables or columns. Contract
revision, provenance, confirmation, contingency, and milestone records remain
intentional supporting infrastructure hidden behind the calm primary
experience. Any schema removal remains a separate cleanup exercise under
Section 15.10 and requires an independent ownership and read/write audit.

This delivery plan does not authorize removal of contract revision,
confirmation, provenance, contingency, or milestone models merely because
their fields are hidden from the primary UI. Unused-table and column removal is
a separate schema-cleanup exercise under Section 15.10 and requires an
independent read/write/ownership audit.

The Slice 0 foundation is complete enough for vertical Slice 1 work, but the
minimum coherent release in Section 21.1 is not yet satisfied. No current
increment is a production-ready buyer release. Schema changes continue to be
made directly without migration files under the greenfield policy in Section 2.

### 21.1 Minimum coherent release and explicit cut line

The initiative may be implemented incrementally, but the first releasable buyer
experience must remain coherent from onboarding through explicit closing. It is
not sufficient to ship onboarding, Buyer Closing Home, Buyer Plan, and Ask Cozy
without the checklist data those surfaces depend on or without a safe transition
out of Closing Journey Mode.

The **minimum coherent release** includes:

1. **Slices 0–3 in full:** canonical schema/contracts, onboarding/first value,
   dedicated Buyer Closing Home/navigation, and a fully operable Buyer Plan.
2. **Slice 4 in full:** dynamic property-aware phase checklists plus Contract &
   Contingency Tracker with manual fallback and confirmed deadline write-back.
3. **Slice 4A core continuity:** inspection import/review, finding disposition,
   buyer Negotiation Shield mode, property Documents, evidence, and one
   canonical obligation per finding.
4. **Slice 5 core Ask operations only:** plan status, next action, deadlines,
   contract timeline, inspection, document readiness, checklist explanation,
   and confirmed task create/update/complete. Ask operations for a deferred
   specialized tool remain unavailable rather than simulating that tool.
5. **A minimal Slice 7 lifecycle subset delivered with the release:** pause,
   resume, cancel, explicit close confirmation, persisted switch from
   `BUYER_CLOSING` to homeowner mode, preservation of transaction evidence, and
   additive carry-forward of accepted work.
6. **Manual guidance for every closing phase:** financing/appraisal,
   title/escrow/HOA, insurance, walkthrough, Closing Disclosure/funds,
   closing-day, and move/possession remain usable as conditional checklist,
   milestone, contact, document, note, blocker, and assignment workflows even
   when their advanced tool workspace is deferred.
7. **P0 homeowner preservation and included-path polish:** the Section 19.6 and
   24.1 homeowner checks plus responsive, accessible, recoverable behavior for
   every included buyer path.

As of Version 1.45, the Contract & Contingency Tracker and its confirmed
deadline write-back are implemented, the minimum Slice 7 pause/resume/cancel/
close/preservation transition is implemented, and every Buyer Plan phase has a
manual guidance-first entry experience. These completed blockers do not by
themselves satisfy the cut line: onboarding personalization, full Buyer Plan
operations, remaining property-aware composition, contextual Ask presentation,
and included-path rendered/non-regression verification remain required.

The following are **deferrable enhancements** after that release:

- Slice 4B's automated purchase Loan Estimate extraction/comparison and richer
  title/escrow workspace, provided manual financing/title/insurance checklist
  and document workflows remain complete;
- Slice 4C's rich Final Walkthrough Companion, automated Closing Disclosure
  extraction/comparison, and full Closing Day Companion, provided mobile manual
  checklists, evidence upload, blocker capture, wire-fraud guidance, and explicit
  close confirmation remain complete;
- advanced Ask Cozy operations that depend on those deferred tool contracts;
- Slice 6's richer Moving Concierge consolidation, provider reconciliation,
  notification breadth, and collaboration refinements beyond the canonical
  manual checklist needed for closing;
- Slice 7's day-90 automation, full recurring handoff refinement, celebration,
  retention, and advocacy beyond the minimal safe close transition; and
- Slice 8 legacy removal that is unrelated to included-path correctness. Buyer
  copy, navigation, accessibility, responsive behavior, and homeowner
  non-regression for shipped paths are not deferrable.

If implementation stops before every minimum-release item is functional, the
result is an internal development increment, not a releasable buyer product.
This cut line guides sequencing and scope; it is not an approval or rollout gate.

### Slice 0 — Contracts and direct schema correction

**Implementation status:** Foundation implemented; bounded endpoint contracts
continue to be completed with the vertical slices that consume them.

**Goal:** Establish one canonical buyer target without compatibility scaffolding
while preserving the existing homeowner contract.

Backend/schema:

1. Extend buyer journey, task-status, task-type, completion, milestone, and
   contact, checklist-section, applicability, and evidence enums/models
   described in Section 15.
2. Add fields and relations to `HomeBuyerChecklist` and `HomeBuyerTask`.
3. Add `BuyerJourneyMilestone` and `BuyerJourneyContact`.
4. Remove or simplify the duplicate Moving execution model only when Slice 6
   connects generated moving tasks to the buyer plan.
5. Regenerate Prisma Client.
6. Do not create a migration script.
7. Make buyer-only fields nullable or safely defaulted and verify an existing
   owned property requires no buyer records.
8. Treat the `BuyerPlanPhase` expansion as an explicit code-contract sweep.
   Replace every phase use of legacy `PRE_CLOSE` across Prisma, backend buyer
   contracts/services, task types, admin analytics, frontend shared types, and
   Buyer Plan rendering/grouping. Update comparisons, defaults, serialization,
   filters, fixtures, and generated clients together.
9. Do not change the separate `PRE_CLOSE_NEGOTIATION` finding disposition while
   replacing the `PRE_CLOSE` task phase, and do not leave a compatibility alias
   that permits old and new task phases to coexist.

Contracts/services:

1. Create strict Zod request/response contracts for overview, tasks,
   milestones, lifecycle, contacts, phase checklists, evidence completion,
   buyer-only tools, and batch operations.
2. Define stable buyer action, checklist template, and milestone keys.
3. Centralize journey-stage derivation and valid transitions.
4. Centralize permissions in buyer services.
5. Define one deterministic checklist applicability contract compatible with
   canonical Property Context fact states: known, unknown, stale, and
   conflicted.
6. Preserve existing homeowner request/response contracts and service semantics;
   expose buyer behavior through additive contracts/adapters.

Functional check:

- An owner can create and retrieve one buyer plan with stage, milestones,
  contacts, and expanded task states.
- A viewer can read an existing plan without triggering a write.
- Existing homeowner reads/writes produce the same response meaning and create
  no buyer data.
- Type generation/build and a repository phase-reference sweep confirm that no
  task-phase call site still reads, writes, compares, defaults, or renders the
  removed `PRE_CLOSE` value.

### Slice 1 — Zero-friction onboarding and first value

**Implementation status:** In progress.

**Goal:** Create an accurate plan before the buyer reaches Home.

Frontend:

1. Refine journey choices and buyer-specific copy in onboarding.
2. Collect purchase stage, optional closing date, inspection status, optional
   move date, and immediate concern.
3. Show a buyer-specific confirmation summary.
4. Replace generic first-value result with buyer next action, deadline, evidence
   readiness, and Ask prompt.
5. Capture canonical dwelling type when known with a **Not sure** option; defer
   lower-value structure/system questions until the related phase rather than
   expanding onboarding.
6. Show detected address/location and available year-built facts with source and
   correction path; explain that accuracy tailors local and age-relevant checks.

Backend:

1. Extend entry-context capture payload for optional buyer anchors.
2. Create buyer plan and applicable templates immediately after entry-context
   capture.
3. Set target close/move milestones and calculate deadlines.
4. Keep unknown values unknown.
5. Seed only universal/core checklist items until enough property context exists
   to evaluate optional modules.
6. Reuse confirmed canonical property/location facts and keep imported or
   low-confidence age/location values proposed/unknown until governed
   confirmation rules are satisfied.

Functional check:

- A new user selecting “Buying existing” reaches a populated plan with the
  correct property and known date anchors in one uninterrupted flow.

### Slice 2 — Dedicated Buyer Closing Home and navigation

**Implementation status:** In progress. The first vertical path now derives
presentation mode on the server without writes, dispatches `/dashboard` to a
separate `BuyerClosingHome`, and reads a bounded closing overview while leaving
the existing homeowner renderer and its data contract intact. Navigation and
discovery-policy integration remain in this slice.

**Goal:** Make the closing journey impossible to lose and prevent homeowner
content from competing with it.

Frontend:

1. Remove the dead buyer-hero branch from dashboard legacy logic.
2. Add a thin server-derived dashboard dispatcher that leaves
   `UnifiedHomeSurface` as the homeowner renderer and selects a separate
   `BuyerClosingHome`; do not implement buyer cards inside or rewrite the
   homeowner renderer.
3. Build the closing header, next best action, blockers, timeline, readiness
   lanes, required documents, people/assignments, Ask Cozy, and collapsed
   post-close modules.
4. Add dedicated loading, empty, paused, error-recovery, and resume states.
5. Add persistent journey chip and mobile continue action.
6. Replace the pre-close generic Plan & Projects entry with direct “Closing
   Plan” navigation.
7. Add buyer stage to property selector labels.
8. Fix all buyer links to canonical property-scoped routes.
9. Exclude pre-close homeowner-only cards, feed items, promotions, shortcuts,
   and mobile catalog entries from the Buyer Closing Home component tree.
10. Route pre-close “Documents” directly to the selected property's transaction
   documents.
11. Extend the shared capability registry with the buyer-aware discovery
    contract and consume it across desktop/mobile discovery surfaces.
12. Keep buyer navigation and tool filtering scoped to selected
    `BUYER_CLOSING` mode; preserve owner catalog/navigation defaults exactly.

Backend:

1. Add a purpose-built Buyer Closing Home overview DTO and endpoint containing
   only the bounded data required by its modules.
2. Keep buyer tasks/milestones connected to canonical action identity for
   deduplication and cross-surface writes.
3. Reconcile closing-home commands with buyer task state.
4. Return one server-derived presentation mode to dashboard bootstrap,
   navigation,
   recommendations, and Ask Cozy.
5. Exclude generic homeowner feed and promotion payloads in Closing Journey
   Mode.
6. Return buyer tool disposition/applicability from the canonical discovery
   policy rather than duplicating UI filters.

Functional check:

- From login, the buyer reaches the correct selected property's plan in one
  click on desktop and mobile.
- `/dashboard` renders Buyer Closing Home—not `UnifiedHomeSurface`—for the
  selected active purchase.
- Pending buyer work prevents a false all-clear state; no-blocker state still
  shows the next closing preparation action.
- Maintenance, renovation, refinance, recurring ownership, and long-term
  savings content is absent from the pre-close primary experience.
- Selecting an owned property renders the existing homeowner Home, navigation,
  tool catalog, and data with no buyer dependency or incidental write.

### Slice 3 — Complete Buyer Plan workspace

**Implementation status:** In progress. The first vertical increment establishes
a strict, read-only overview endpoint and replaces separate core plan/member
loading with one property-scoped query. The workspace renders stage, progress,
milestones, workload, contacts, recent history, and a viewer-only state. One
server selector now provides Buyer Closing Home and Buyer Plan with the same
recommended action and structured guidance. Every opened phase leads with
**What matters now**, why the action matters, the consequence of delay, the
responsible professional, the nearest known deadline, a suggested question,
what can safely wait, and one focused CTA. Report-import, finding review, and
negotiation work cannot rank before inspection/report prerequisites exist.
Operational records remain collapsed until requested, and selecting the
recommendation opens the exact supporting record. Remaining task, evidence,
batch, contact/milestone mutation, and rendered acceptance work continues in
this slice.

**Goal:** Make the plan fully operable without hidden API-only capabilities.

Frontend:

1. Build one-query overview loading.
2. Implement stage header, readiness strip, next move, grouped tasks,
   phase checklist navigator, milestones, workload, contacts, and history.
3. Add create/edit/status/not-needed/cancel/delete/restore actions.
4. Add assignment, cost, booking, note, filter, and batch controls.
5. Replace “Complete with evidence” with explicit completion method and real
   evidence selection.
6. Add clear viewer read-only presentation.
7. Replace title-based default-task detection with stable template/action keys.
8. Render section progress from applicable checklist items and show Next,
   Blocking, Coming up, and expandable complete checklist views.

Backend:

1. Add overview and milestone/contact endpoints.
2. Apply runtime validation to all mutations.
3. Return stable expected error codes.
4. Make date recalculation respect completed/user-edited tasks.
5. Add versioned checklist template generation and applicability evaluation.
6. Ensure regeneration is idempotent and preserves edits, evidence, completion,
   and explicit not-applicable decisions.
7. Compose checklist items from universal, transaction, dwelling, ownership/
   responsibility, structure, systems/site, exposure, compliance, and journey-
   discovery modules.
8. Reuse canonical Property Context and persist explainable applicability
   provenance on each generated task.
9. Add the secondary, non-blocking property-detail prompt and before/after
   checklist delta presentation defined in Section 14.14.4.

Functional check:

- Every supported backend buyer task capability has an intentional UI path.
- Financed/cash, HOA/non-HOA, and known/unknown context produce different
  applicable checklists without duplicate obligations.

### Slice 4 — Phase checklists and Contract & Contingency Tracker

**Implementation status:** In progress. The first foundation increment adds a
versioned entry template for each required phase checklist and an explicit
preview/apply composition path over canonical Property Context. Initial rules
cover condo/association records, roof/exterior responsibility, confirmed
pool/spa context, property age combined with confirmed location, and recorded
HVAC age. Unknown or conflicting inputs remain outside the active delta and
produce benefit-explained correction questions. Buyer Plan now presents these
questions as the one-time **Make this plan fit my home** flow: it summarizes
known facts, asks the most consequential unanswered question in plain language,
allows **Not sure**, explains the guidance benefit, automatically applies safe
additions, and requires review before removing work. Pool/spa and basement
answers contribute direct inspection guidance. Applying a preview persists
rule/version/reason/fact/basis provenance and preserves completion, evidence,
assignment, notes, status decisions, and user-edited dates. A property-scoped
Contract & Contingency Tracker now owns normalized workspaces, numbered revisions,
field-level confirmations, and contingency records. The primary UI now starts
from the signed source, shows a concise summary of consequential dates, omits
empty unsupported contingencies, and keeps administrative terms under an
explicit detail disclosure. Buyers may resume a manual draft or link a
canonical contract document, save a newer revision without changing the active
timeline, and decide **Confirm / Correct / Not sure / Ask a professional** for
each displayed date. Confirmation supersedes the previous revision and
idempotently reconciles only explicitly confirmed contract, closing,
possession, and contingency fields. Existing user-edited dates are guarded,
and overdue confirmed active contingencies block the contract-review
obligation. Automated document extraction and its failure-recovery experience
remain future refinements; the safe manual/link-document path is implemented.

**Goal:** Replace the flat checklist with deadline-aware guidance and establish
the buyer's authoritative closing timeline.

1. Implement the nine versioned checklist templates in Section 14.15.
2. Implement the property-aware composition layers and example rules in Section
   14.14; do not ship static per-dwelling checklists.
3. Implement explicit property-age, appliance/system-age, and source-qualified
   location rules with age/location safety boundaries and date precision.
4. Add conditional applicability, property-detail questions, checklist delta
   explanations, and section progress to Buyer Closing Home and Buyer Plan.
5. Build Contract & Contingency Tracker with contract/addendum upload, proposed
   extraction, field-level source reference, user confirmation, revision
   handling, and manual fallback.
6. Create/update canonical milestones and tasks only from confirmed dates/terms.
7. Represent conflicts, missing deadlines, and expired unresolved
   contingencies as blockers with direct recovery actions.
8. Add checklist-to-tool deep links and exact return-position continuity.
9. Add checklist explanations and phase-aware Ask Cozy entry context.

Functional check:

- Uploading a revised contract proposes changed dates, requires field-level
  confirmation, updates eligible milestones/tasks once, and preserves completed
  or user-edited checklist work.
- Changing the canonical property from unknown to condo, townhouse with
  association roof responsibility, or detached home with basement recomposes
  the inspection/title/insurance checklist predictably and explains every delta.

### Slice 4A — Inspection, negotiation, documents, and repair continuity

**Implementation status:** In progress. The first continuity increment routes
Buyer Plan document imports to the canonical property Documents surface,
preserves an allowlisted property/task return contract through Documents and
every Inspection Hub hop, and restores/highlights the originating checklist
task on return. Finding reclassification now synchronizes the stable buyer task,
inspection/repair journeys and signals, finding lineage, and report counts in
one database transaction; completed work and user-edited dates remain
protected. The second increment adds a distinct buyer perspective to the existing
Negotiation Shield case system, idempotently links a pre-close case to one
canonical inspection finding, generates buyer-oriented professional discussion
points with explicit legal boundaries, and persists structured seller response
and outcome. Accepted credits and completed seller repairs close the linked
finding/task with evidence; accepted repairs move the task into verification,
rejections block it for an explicit buyer decision, and transferred work moves
the existing obligation into the first-30-days phase. The third increment lets
one request cover up to 20 confirmed findings while preserving one canonical
case per finding and surfacing conflicts instead of silently merging cases.
Seller outcomes can now select an attached Home Record document; the evidence
link is persisted on the negotiation outcome, inspection finding, and completed
buyer task. When the lifecycle reaches closed or a later ownership stage,
transferred first-30-days inspection work is immediately upserted into the
canonical maintenance queue with the same stable key used by day-91 handoff.
The fourth increment propagates an attached terminal-outcome document into the
existing major-repair guidance journey without auto-completing or skipping any
repair step. Seller-repair evidence attaches to outcome verification; accepted
credit evidence attaches to price finalization, with negotiation preparation as
a legacy-template fallback. Document verification state is preserved, a unique
evidence key makes retries converge on one artifact, and Buyer Plan finding cards
show the linked evidence and verification state. The fifth increment adds one
property-scoped inspection coordination record for the appointment, access,
attendees, report and contingency deadlines, specialist scope, property-specific
questions, and optional reinspection or repair proof. Buyer Plan now edits this
record directly. Saves idempotently synchronize the existing inspection-plan
task, inspection and contingency milestones, and one stable reinspection task;
completed or user-edited work remains protected. Property-aware inspection
module composition and broader obligation deduplication remain next. The sixth
increment composes six explainable inspection modules from canonical dwelling,
ownership responsibility, foundation/space, pool/site, confirmed-system, and
recorded exposure facts. Existing self-reported flood, hurricane, wildfire, and
historic-district flags now participate in Property Context with provenance and
correction paths. Buyer Plan displays only fact-supported recommendations,
keeps unknown or conflicted modules outside saved scope, and requires an explicit
deduplicating “Add module to plan” action. The seventh increment establishes
one durable Home Operations identity for every actionable inspection finding.
Buyer tasks now retain the canonical `OperationalWorkItem`; primary repair and
supporting follow-up guidance are registered as executions of that same
obligation. Closing and day-91 handoff reuse an existing guidance, project, or
maintenance execution before considering a new maintenance task, and any new
maintenance execution is linked back to the same work item. This prevents the
Buyer Plan, Guidance, Home Actions, and recurring Home feed from independently
materializing the same finding-resolution obligation.

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
   **Implemented:** actionable findings resolve through the stable
   `FINDING_RESOLUTION` work key and all downstream executions reuse it.
8. Implement the inspection checklist before/schedule/review/negotiate/
   reinspection flow and context-relevant specialist items. **In progress:**
   scheduling, scope/questions, report/contingency timing, and reinspection proof
   now share one canonical record and synchronize Buyer Plan work.
9. Add property-aware inspection modules for dwelling, ownership responsibility,
   foundation/spaces, confirmed systems/site features, and exposure context.
   **Implemented:** six versioned modules now produce explicit scope/questions
   with used, missing, and conflicted Property Context provenance.

Functional check:

- A report upload can be reviewed, classified, negotiated or accepted, and
  carried into repair/ownership without duplicate tasks or stale phase data.

### Slice 4B — Purchase financing, appraisal, title, escrow, and insurance

**Implementation status:** In progress. The first increment introduces a
property-scoped `BuyerPurchaseFinancingPlan`, deliberately separate from the
established-owner `PropertyFinancingProfile` and refinance workflows. Buyer
Plan now requires an explicit cash-or-financed decision, records who confirmed
it and when, completes the stable purchase-path checklist obligation, and
idempotently activates or suppresses stable loan-application, official Loan
Estimate, and lender-appraisal tasks. Cash buyers no longer see lender-only work
in active progress. The decision surface states that ContractToCozy does not
approve financing or certify clear-to-close status. The second increment adds a
purchase-only Loan Estimate Center with separate lender offers and numbered
revisions, strict partial manual drafts, resume/update, optional source-document
lineage, and explicit confirmation. Confirming a revision supersedes the prior
confirmed revision for that lender. Two current confirmed offers reuse only the
reviewed standardized comparison calculation to surface APR, payment, net-cost,
cash-to-close, five-year-cost, rate-lock, and comparability cautions without a
single-winner recommendation. The stable Loan Estimate checklist task moves to
in progress after one confirmed offer and completes with evidence after two.
The third increment reuses the reviewed Loan Estimate PDF/image parser only as
an optional, transient prefill: every proposed field retains confidence and
source-label metadata, page-set warnings remain visible, and no value is saved
or confirmed until the buyer reviews and submits the draft. It also records the
buyer-selected confirmed revision and separately records intent to proceed as a
buyer decision, never as a platform recommendation or approval. Selection
writes the exact offer/revision into the stable Loan Estimate task and advances
the lender-appraisal task to in progress; confirming a newer revision for the
same selected offer clears the stale selection for renewed buyer review. The
fourth increment adds a purchase-only
lender-readiness record after a current confirmed offer is selected. Buyers can
record appraisal ordered/scheduled/completed dates, value or property-condition
issues and resolution, underwriting state, and lender-requested conditions with
due dates and explicit blocking impact. Readiness is scoped to the exact
selected revision and resets when the buyer changes lenders or selects a newer
offer revision, preventing stale lender conditions from crossing offers. These
user-recorded facts reconcile the
stable appraisal task and canonical appraisal milestone: unresolved appraisal
issues or blocking lender conditions block readiness, while completion requires
a completed/resolved appraisal, every condition dispositioned, and an explicit
user record that the lender communicated clear-to-close. The product continues
to state that it does not perform appraisals, approve underwriting, or certify
clear-to-close status. The fifth increment adds a property-scoped Title, Escrow
& Closing Document Center for cash and financed buyers. It reuses canonical
buyer-journey contacts and property documents while recording title-report
receipt/professional-review state, survey and association applicability,
earnest-money confirmation, closing/possession logistics, local requirements,
and user-recorded issues with due dates and blocking impact. Those facts
idempotently reconcile stable title-contact, document-review, issue-resolution,
association-records, and closing-document work plus the canonical title/survey
milestone. Completion means the buyer recorded professional review and
dispositioned applicable preparation; it never represents platform legal
review, title clearance, or wire-instruction validation. The sixth increment
adds Buyer Coverage preparation without changing established-owner Coverage
semantics. Purchase quotes, comparable limits/deductibles, replacement-cost
basis, exclusions, endorsements, catastrophe options, source documents,
expiration, and insurer/lender requirements remain buyer-journey records and
are never presented as bound coverage or a platform recommendation. The buyer
explicitly selects a quote and may record binding only after confirming a
policy number and effective term with the insurer or agent. That binding
promotes the selected quote into the canonical `InsurancePolicy` and verified
term, preserving the actual actor in confirmation evidence; the binder is then
linked to that policy. Required effective date, lender/closing proof delivery,
and unresolved blocking requirements reconcile the stable insurance task and
canonical `INSURANCE_EFFECTIVE` milestone. Slice 4B's planned vertical
functionality is now established; conditional property/jurisdiction refinement
can continue incrementally while Slice 4C is next.

**Goal:** Give financed and cash buyers the correct conditional preparation
without rebranding homeowner financial tools.

1. Build Purchase Financing & Loan Estimate Center with a separate purchase
   contract, complete manual-entry/partial-save path, and reuse only reviewed
   document-extraction/math primitives.
2. Implement purchase Loan Estimate revision comparison, user selection, and
   financing/appraisal checklist write-back. Extraction pre-fills proposed
   fields but is never required to compare confirmed manual values.
3. Build Title, Escrow & Closing Document Center over canonical milestones,
   contacts, documents, and checklist tasks.
4. Add buyer insurance mode to Coverage with bind/effective-date/proof checklist
   integration.
5. Suppress financing/appraisal steps for cash purchases and activate
   jurisdiction/property-specific title, HOA, survey, well/septic, and local
   requirements only when applicable.
6. Keep all approval/clearance statuses user recorded and show professional
   boundaries at the decision point.

Functional check:

- A financed buyer compares two current purchase Loan Estimates and sees lender,
  appraisal, title, and insurance blockers; a cash buyer sees none of the lender
  workflow and keeps the same closing timeline.
- With OCR/AI unavailable, the financed buyer manually records both offers,
  saves partial work, resumes, confirms field sources, and completes the same
  comparison/checklist write-back.

### Slice 4C — Walkthrough, disclosure, funds, and closing day

**Implementation status:** In progress. The first increment adds a
property-scoped Final Walkthrough Companion. It schedules the appointment,
records access, utility readiness, attendees, room/area observations, safe
visible checks, photo/document evidence, and issues without representing a
professional inspection or condition certification. The workspace reads the
canonical property contract documents, pre-close inspection findings, seller
responses, negotiation outcomes, credits, and completion evidence rather than
copying them into a second transaction record. An observation marked as an
issue must have a corresponding escalation item, and completion requires every
observation to be reviewed and every issue to be routed or dispositioned.
Routed unresolved material issues remain on a separate blocking Buyer Plan task
even after the walkthrough record itself is complete. The stable walkthrough
task and canonical `FINAL_WALKTHROUGH` milestone reconcile idempotently with
bounded evidence that explicitly disclaims condition, repair, safety, and legal
certification. The second increment adds a property-scoped Closing Disclosure
& Cash-to-Close Review for financed purchases after a current confirmed Loan
Estimate is selected. It owns numbered draft/confirmed/superseded disclosure
revisions, complete manual entry and partial-save/resume, source attribution,
required-field confirmation, field-level deltas against the selected Loan
Estimate, and a separate comparison of seller credits with canonical accepted
negotiation outcomes. Funds readiness records only method, timing, readiness,
questions, and trusted-channel verification metadata; strict API contracts and
the UI prohibit full account, routing, wire-instruction, password, or security
credential storage. Confirmation reconciles a stable disclosure-review task,
the existing universal funds-readiness task, and the canonical
`CLOSING_DISCLOSURE` milestone with bounded user-attestation evidence. Optional
document extraction remains a future accelerator and cannot be required for
completion. The third increment completes the first Slice 4C vertical path with
a property-scoped Closing Day Companion. It reuses canonical Title & Escrow
appointment, possession, and trusted-contact context; displays canonical funds
readiness and unresolved blocking tasks; and saves attendees, required-document
labels, professional questions, identification/document readiness, signing and
copy receipt, signed-record evidence, access items, warranties/manuals, and
possession confirmation without storing identity secrets or full wire
credentials. The generic timeline editor can no longer set ownership or the
`CLOSED` stage. A separate strict confirmation requires the buyer to explicitly
report that the professional closing process is complete, requires the complete
Closing Day checklist and a signed closing record, rejects future completion
times, reconciles the stable closing-day task and canonical `CLOSING` milestone,
and atomically transitions the buyer plan to `CLOSED` with the property set to
`RECENT_OWNER`. Scheduled dates, signing, funds movement, clear-to-close, or
checklist progress never infer legal closing. Slice 4C is now complete for its
manual, non-extraction path; optional Closing Disclosure extraction remains a
future accelerator.

**Goal:** Make the final days before closing calm, mobile, evidence-backed, and
safe.

1. Build Final Walkthrough Companion with property/room sections, agreed-repair
   and included-item linkage, photo evidence, unresolved issues, and professional
   escalation handoff.
2. Build Closing Disclosure & Cash-to-Close Review with revision-aware
   comparison to the selected purchase Loan Estimate and contract credits plus
   complete manual-entry/partial-save fallback. Extraction remains optional and
   proposed fields require confirmation.
3. Add persistent wire-fraud safeguards and prohibit storage/display of full
   destination account or wire credentials.
4. Build Closing Day Companion with appointment, ID/document, funds-readiness,
   questions, keys/access/possession, and signed-copy checklist.
5. Require explicit close confirmation before the lifecycle transition and
   post-close reveal.
6. Reconcile all checklist/tool writes with Buyer Closing Home immediately.

Functional check:

- On mobile, the buyer completes a walkthrough, records an unresolved issue,
  reviews a changed Closing Disclosure, prepares for closing day, and remains in
  Closing Journey Mode until explicit professional-close confirmation is
  recorded by the user.
- With document extraction unavailable, the buyer can manually enter the latest
  Closing Disclosure revision, record questions/funds readiness, and continue
  the closing checklist without losing source or revision context.

### Slice 5 — Ask Cozy buyer copilot

**Implementation status:** In progress. Ask Cozy now has a bounded,
permission-scoped Buyer Plan context provider and prioritizes “What should I do
before closing?” over substitute homeowner recommendations. Deterministic buyer
operations cover plan status/next action, deadlines, contract timeline,
inspection and document readiness, negotiation readiness, costs, purchase
financing, title/escrow, insurance, walkthrough, Closing Disclosure/funds,
closing day, moving, task creation/update/completion, finding disposition, move
status, target closing-date change, purchase cancellation, and owner-authorized
pause/resume. Material writes use confirmation-gated executions and canonical
buyer services. Remaining Slice 5 work is primarily contextual entry points,
richer buyer-specific presentation, final prompt ranking, and complete rendered
operation coverage.

**Goal:** Make Ask Cozy a genuinely buyer-specific closing copilot before the
purchase is complete.

Backend:

1. Add the buyer context provider.
2. Register buyer plan, deadline, inspection, negotiation, document, cost,
   contract timeline, purchase financing, title/escrow, walkthrough, Closing
   Disclosure/funds, closing day, move, task, finding, and lifecycle operations.
3. Bind operations to canonical buyer services.
4. Add permission-aware confirmation cards for writes.
5. Update audience applicability and answer presentation.
6. Replace generic buyer prompt ranking with stage- and entity-aware prompts.
7. Suppress proactive homeowner scenarios before close and transition prompt
   policy only after the canonical close event.

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

**Implementation status:** In progress. The first vertical increment converts
Moving Concierge timeline generation into idempotent canonical `HomeBuyerTask`
rows in the `MOVE_IN` phase and `MOVE_POSSESSION` section. The rich Moving view
now receives canonical task IDs, projects completion from Buyer Plan state, and
updates each row through the same property-scoped buyer-task status command.
Regeneration preserves task completion, evidence, assignment, notes, and user
edits; Buyer Plan and Moving Concierge therefore share one task identity and one
progress count. The `MovingPlan.completedTasks` column, JSON snapshot completion
fields, and moving-specific bulk completion API have been removed; persisted
moving plans now contain generation content while `HomeBuyerTask` solely owns
execution state. Moving reads now honor viewer access while generation, saving,
completion, and deletion require contributor access. Remaining Slice 6 work adds
move filtering, milestone and booking reconciliation, co-buyer landing, and
deduplicated lifecycle-aware notifications.

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

**Implementation status:** Complete for the defined Slice 7 scope. Owner-only
pause and resume commands now conditionally claim an active/paused pre-close
journey, preserve all work, and stop or restore reminder eligibility without
changing task state. Buyer Plan exposes direct controls and Ask Cozy supports
the same operations through explicit confirmation. The cancellation increment
adds a strict, property-scoped purchase-cancellation command and Buyer Plan control.
Only active or paused pre-close journeys can be cancelled. The transaction
conditionally claims the lifecycle row, records the time and user-supplied
reason, cancels only active tasks and milestones, and returns under-contract
onboarding state to shopping. Completed work, completion evidence, documents,
findings, and outcomes remain intact. Professional close now uses the same
conditional-claim pattern, so close and cancel cannot both persist for the same
journey. The second vertical increment writes one idempotent
`BUYER_JOURNEY_COMPLETED` milestone to the permanent Home Record inside that
same authorized-close transaction. It retains the signed closing record as
linked evidence while labeling the outcome as homeowner-confirmed rather than
platform-verified. After persistence succeeds, Closing Day presents a
deduplicated welcome-home celebration and direct paths into the first-90-day
plan, Home Records, and Home Operations.
The third vertical increment removes scheduled-close fallback from day-91
handoff, so ownership automation cannot run before an explicit close persists.
At handoff time, unresolved pre-close tasks block the transition and Buyer Plan
offers explicit complete or not-needed decisions. Once the gate is clear, one
transaction conditionally claims the buyer journey, moves incomplete ownership
work into recurring Home care, records `HANDED_OFF` status and stage, and
promotes the same property from Recent Owner to Established Owner.
The fourth vertical increment adds a strict read-only `RECENT_OWNER` dashboard
presentation derived only from an active post-close plan, persisted ownership
start, and persisted Recent Owner onboarding state. It presents first-90-day
progress, carried-forward document and inspection evidence, and direct Plan,
Home Timeline, Home Records, Home Operations, and Ask paths above the normal
`UnifiedHomeSurface`. Recent owners therefore gain the full homeowner capability
set without re-onboarding, while buyer-specific Ask presentation yields to the
existing Recent Owner lifecycle prompts.
The fifth vertical increment adds governed advocacy only after demonstrated
first-90-day progress or verified Home Record value. Server eligibility blocks
the prompt for open material findings, blocked or urgent buyer work, and overdue
buyer deadlines; the homeowner renderer adds a second suppression gate for
`NOW`, `SOON`, safety-emergency, and blocked major-moment work. Eligible owners
may deep-link into the canonical household invitation flow or share a
property-independent recommendation link. The card is dismissible for 90 days,
limited to three impressions with a 14-day cooldown, and emits typed viewed,
dismissed, and actioned analytics.
The sixth vertical increment adds an environment-gated Recent Owner acceptance
route backed by deterministic Unified Home and lifecycle contracts. Desktop
coverage verifies carried-forward evidence, the first-90-day transition, the
unchanged homeowner Home surface, earned co-buyer/referral advocacy,
accessibility, 90-day dismissal persistence, and suppression by blocked urgent
home work. Mobile coverage verifies the same handoff and advocacy actions remain
usable without horizontal overflow. A real rendered review also corrected the
Recent Owner hero's explicit heading and metric contrast against its dark
gradient.

**Goal:** Convert transaction value into durable homeowner value.

1. Add explicit close and cancel transitions.
2. Present a polished closing celebration and first-90-day transition.
3. Atomically exit Closing Journey Mode only after the authorized close
   transition persists.
4. Progressively reveal first-90-day navigation, Home Record, Home Operations,
   and owner-oriented Ask Cozy guidance without re-onboarding.
5. Require resolution of stranded pre-close work before final handoff.
6. Move incomplete ownership work into recurring Home Operations idempotently.
7. Write a buyer-journey completion milestone to Home Record.
8. Preserve transaction evidence and outcomes.
9. Add tasteful, dismissible co-buyer/referral/recommendation prompts after
   meaningful success moments.

Functional check:

- The same property moves from under contract to recent owner to established
  owner without losing work, evidence, selected-property context, or navigation
  continuity.
- Verified in the deterministic Recent Owner acceptance route on desktop and
  mobile, including urgent-work suppression, persisted dismissal, homeowner
  surface continuity, automated accessibility, and responsive overflow checks.

### Slice 8 — Site-wide buyer polish and cleanup

**Implementation status:** In progress. The first cleanup increment removes the
orphaned `HomeBuyerChecklistCard`, the duplicate checklist DTOs it alone used,
and the unreferenced global `/dashboard/checklist` redirect that sent buyer work
into homeowner maintenance. Active API and integration documentation now
describes buyer applicability as a property-scoped purchase journey and owner
applicability as ownership care rather than a permanent user segment. A fast
route-contract gate now fails if the deleted global checklist path or card
returns, if a canonical buyer/owner route disappears, or if the onboarding,
Buyer Closing Home, Recent Owner, or buyer-return CTAs lose their property-
scoped destinations.

The second cleanup increment removes Moving Concierge's remaining duplicate
execution state. Saved moving-plan JSON is sanitized of top-level completion
IDs and per-task completion booleans, the obsolete Prisma completion array and
moving-specific bulk completion route/service/client are gone, and the rich
Moving view now completes or reopens the canonical buyer task directly with an
optimistic rollback on failure. Reopening through the shared status command also
clears stale completion evidence. Per the greenfield policy, the Prisma schema
was corrected directly without a migration file.

The third cleanup increment closes two route-audit blind spots on the buyer
entry path. It removes the remaining Next.js redirect for the retired global
`/dashboard/checklist` URL and deletes a tracked `login/page copy.tsx` artifact
that preserved an obsolete pre-MFA login flow and stale role destinations. The
buyer route contract now guards framework redirect configuration and duplicate
authentication route artifacts in addition to source callers and canonical
property-scoped CTAs.

The fourth cleanup increment replaces Buyer Plan's unlabeled loading spinner and
dead-end raw error text with the shared route-state presentation. Loading is now
announced as a busy polite status; failures are announced assertively, explain
that the property record remains safe, and offer both an in-place retry and a
property-scoped return path. The shared `RouteStateCard` now carries these live-
region semantics for all existing consumers, with runtime accessibility tests
and a Buyer Plan source-contract guard covering the recovery path.

The fifth cleanup increment removes false-positive readiness from Buyer Closing
Home. A lane now receives a completed indicator only when it contains actions
and all of them are complete; incomplete lanes show their open count, blocked
lanes retain explicit urgency, and empty lanes explain that no applicable action
exists yet instead of presenting `0 of 0` beside a green check. The overall
closing-plan bar now uses semantic progress values and text for assistive
technology. Rendered component tests cover all four lane states and the progress
contract.

The sixth cleanup increment replaces Buyer Closing Home's hand-rolled sticky
mobile button with the shared mobile action bar. The continuation now reserves
bottom-safe space, participates in the dashboard chat-collision contract, and
keeps the current buyer stage plus ranked next-action deadline visible without
scrolling. Paused journeys switch to explicit recovery copy rather than implying
that execution is still active. Rendered tests cover both active and paused
mobile continuation contracts and their property-scoped Closing Plan link.

The seventh cleanup increment repairs the new-account entry path. Signup retains
the shared `HOMEOWNER` technical role while welcoming buying, building,
exploring, and ownership journeys equally. The zero-property welcome now enters
trigger-first onboarding rather than the generic property form, and onboarding
requires an explicit journey choice instead of silently defaulting to owner.
Selecting **Buying existing** preserves the existing property creation, buyer
entry-context capture, and Closing Plan initialization sequence. A rendered
welcome regression and the route/CTA contract guard the handoff.

The eighth cleanup increment adds the first dedicated rendered Slice 8
traversals. A deterministic buyer scenario now clicks through neutral account
welcome, explicit **Buying existing** selection, address/dates/inspection
context, Buyer Closing Home, property-scoped Documents, Inspection, Ask, and
Closing Plan destinations, and an explicit professional-close confirmation
before Recent Owner and the standard Home renderer appear. Its elapsed target
date deliberately remains in Closing Journey Mode until confirmation. A second
scenario repeatedly switches between two established owned properties and an
active purchase, exercises browser-back continuity, proves exact homeowner
versus Buyer Closing Home renderer isolation, and verifies that owner reads do
not call buyer endpoints. Desktop coverage includes serious/critical automated
accessibility checks, while mobile coverage checks the journey choice, sticky
buyer continuation, property switcher, and horizontal overflow. These are
deterministic rendered regression baselines; the deeper mutation, persistence,
and database non-creation steps in Section 24 remain required before Slice 8 is
complete.

The ninth cleanup increment hardens the zero-property onboarding address path.
The oversized marketing treatment is reduced so journey and address tasks stay
visible at normal desktop zoom. Address autocomplete now fills a complete
street/city/state/ZIP form, while every field remains directly editable when
suggestions are unavailable. Production property enrichment no longer emits
synthetic Austin/Texas facts: unavailable providers leave facts unknown, and a
lookup result is discarded unless its state and ZIP match the submitted
address. The confirmation step now supports an explicit address correction and
clears enrichment when corrected so facts cannot migrate between properties.
The onboarding cookie contract also requires a complete location for every
source and preserves validated buyer dates, inspection status, and concern.

**Goal:** Remove legacy contradictions and deliver top-tier fit and finish.

1. Audit signup, login transition, Home, Plan & Projects, Home Record, provider,
   coverage, financing, Knowledge, notifications, breadcrumbs, mobile catalog,
   and empty states for buyer copy and links.
2. Audit every pre-close surface for homeowner-content leakage and every
   post-close surface for a smooth progressive reveal.
3. Remove obsolete `HOME_BUYER` segment documentation/comments where they imply
   a user-level role.
4. Remove dead `HomeBuyerChecklistCard` and legacy checklist redirects if no
   longer used.
5. Remove unused orchestration buyer helpers after the canonical adapter ships.
6. Remove duplicate Moving execution storage and APIs.
7. Run a route/CTA traversal across the complete buyer journey.
8. Conduct responsive and accessibility review on real rendered states.
9. Run the protected homeowner functional traversal for owner-only and
   owner-plus-active-buyer accounts and fix every regression in this slice.

Functional check:

- No buyer-specific page relies on a legacy global redirect or duplicate state
  owner.
- Existing homeowner routes and workflows remain functionally unchanged.

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
Slice 4: phase checklists + contract timeline
        ↓
Slice 4A: inspection + negotiation continuity
        ↓
Slice 4B: financing + title + insurance
        ↓
Slice 4C: walkthrough + disclosure + closing day
        ↓
Slice 5: Ask Cozy buyer copilot
        ↓
Slice 6: moving + services + household + notifications
        ↓
Slice 7: closing + handoff + advocacy
        ↓
Slice 8: site-wide polish + legacy removal
```

Slices 4A and 4B may proceed in parallel after Slice 4 checklist and revision
contracts stabilize. Slice 4C depends on the selected purchase-loan and contract
records from Slices 4 and 4B. Slice 5 may begin after Slice 4 and add operations
incrementally as 4A–4C land. Slice 6 depends on the canonical task model from
Slice 3. Slice 7 depends on lifecycle and handoff semantics from Slices 0–4C.
The minimal close-transition subset defined in Section 21.1 may ship before the
full 4B/4C workspaces, but it depends on Slice 4's canonical checklist/timeline
contracts and the manual closing-phase continuity required by that cut line.

---

## 23. Definition of done

Before any buyer completion item is considered, the P0 homeowner preservation
condition must be true:

- existing owned-property Home, Plan & Projects, Home Record, Ask Cozy, tools,
  coverage, household, notifications, booking/provider, property switching, and
  Home Action workflows remain functional with their prior semantics;
- an owned property with no buyer plan has no new dependency and receives no
  incidental buyer writes;
- one account can operate an owned property and a purchase property in the same
  session without mode, cache, navigation, permission, or data contamination;
- buyer metadata does not globally hide, reorder, relabel, reroute, or change
  readiness/completion behavior for homeowner tools; and
- closing handoff adds records/work without overwriting, resetting,
  duplicating, or deleting existing homeowner data.

Failure of any P0 condition means the initiative is not done even if all buyer
flows work.

The full home-buyer initiative is functionally complete when all of the
following are true. A first production release may use the narrower minimum
coherent release in Section 21.1, but it is not releasable unless that entire
cut line—including dynamic checklists, core buyer Ask Cozy, and the minimal
explicit close transition—is present. Deferred capabilities must have the
manual guidance or manual-entry behavior required by Section 21.1; an internal
increment is not a production release.

1. A buyer signs up as a homeowner and selects a purchase journey without a
   separate role or approval.
2. The buyer can add a candidate/purchase property, complete or safely skip the
   compact home snapshot, see the resulting personalized guidance, and
   optionally record closing/move dates.
3. A buyer plan is created before the first-value reveal.
4. For an active pre-close purchase, `/dashboard` renders the dedicated Buyer
   Closing Home with closing header, next action, blockers, timeline, readiness
   lanes, documents, people, Ask Cozy, and collapsed post-close obligations.
5. Closing Plan and transaction Documents are each reachable in one click on
   desktop and mobile throughout the active purchase.
6. All buyer-plan CTAs preserve property and return context.
7. Document upload opens the correct property documents workspace.
8. Contract, inspection, financing/appraisal, title/escrow/HOA, insurance,
   walkthrough, disclosure/funds, closing-day, and move/possession checklists
   render only applicable work with stable identity and section progress. Condo,
   townhouse, detached-home-with-basement, multi-family, manufactured-home, and
   specialty-system contexts produce materially different applicable items.
   Property age, source-qualified location, and each included appliance/system's
   own age/evidence further tailor relevant questions without being treated as
   defects or professional findings.
   Changing a canonical property fact recomposes the checklist with explained
   deltas while preserving completed and edited work.
   Every requested detail explains its concrete benefit and permits **Not sure**
   without blocking closing progress.
9. Contract revisions propose field-level changes, require confirmation, and
   update eligible deadlines without overwriting completed or edited work. The
   primary experience is upload-first, shows only supported critical dates,
   explains their buyer value, hides advanced administrative fields, and never
   renders an unknown contingency as active.
10. Inspection findings flow into negotiation or post-close work without
   duplication.
11. Purchase Financing & Loan Estimate Center is distinct from owner financing
    and refinance, cash buyers do not receive lender workflow, and financed
    buyers can manually enter, save, resume, compare, and confirm Loan Estimate
    data when extraction is unavailable or incomplete.
12. Title/Escrow, insurance, Final Walkthrough, Closing Disclosure/Funds, and
    Closing Day tools reconcile with the same canonical checklist and timeline.
    Closing Disclosure/Funds supports complete manual entry, partial save,
    revision comparison, source attribution, and confirmation without depending
    on AI, OCR, or PDF extraction.
13. The mobile walkthrough supports agreed-item linkage, evidence, unresolved
    issues, and professional handoff without claiming inspection authority.
14. Wire-fraud safeguards are persistent and no buyer tool stores or displays
    full wire/account credentials.
15. All task states, editing, assignment, evidence, booking, and custom-task
   capabilities are operable in the UI.
16. Moving tasks use the canonical buyer plan.
17. Ask Cozy offers stage-specific buyer prompts and can read and operate the
    buyer plan with proper confirmation and permissions.
18. Viewers can read; contributors can collaborate; owners control lifecycle
    and membership.
19. Pause/cancel stops reminders and prevents handoff.
20. Closing transitions the plan into a first-90-day homeowner experience only
    after explicit user confirmation of the completed professional close.
21. Handoff preserves history and moves every unresolved ownership obligation
    into canonical Home Operations or an explicit terminal disposition.
22. Before confirmed closing, the primary experience contains no generic
    homeowner maintenance, renovation, refinance, recurring operations,
    long-term savings, or owner-oriented promotional content.
23. The standard homeowner Home component and generic homeowner feed payload do
    not render for the selected active pre-close purchase.
24. Closing Journey Mode ends only after a persisted, authorized close
    transition, never because a target date passed.
25. Post-close homeowner capabilities are progressively revealed without a new
    account, re-onboarding, lost context, or data re-entry.
26. The experience is complete, accessible, and polished on mobile.
27. No database migration or data-migration script is committed.
28. **Make this plan fit my home** precedes the closing phases when material
    personalization remains, asks only consequential plain-language questions,
    and collapses after completion.
29. Every phase shows where the buyer is, one next move, nearest deadline, why
    it matters, what to ask, what can wait, and only then optional records.
30. Buyer Closing Home and Buyer Plan recommend the same action, and no action
    is ranked before its prerequisite event or state.
31. The primary onboarding, personalization, contract, and phase flows remain
    usable on mobile without a long equal-priority form or more than one
    dominant CTA per section.

---

## 24. Functional walkthrough for implementation review

Use both rendered scenarios as the primary working-product review, not merely a
source contract check.

### 24.1 Protected homeowner non-regression walkthrough

1. Sign in with an account that has an established owned property and no buyer
   plan.
2. Open `/dashboard` and verify the standard homeowner Home renderer, ranked
   actions, existing modules, navigation, property context, and empty/error
   states behave as before and no buyer endpoint is required.
3. Open Plan & Projects, create/update/complete representative work, and verify
   canonical Home Action reconciliation.
4. Open Home Record, upload/read/update a representative record, and verify the
   existing taxonomy, authorization, and return navigation.
5. Open Ask Cozy, run an established-owner read and confirmed-write scenario,
   and verify owner prompts/context are not replaced by closing prompts.
6. Open the homeowner tool catalog on desktop and mobile and verify existing
   labels, ordering, readiness, destinations, rollout behavior, and completion
   write-back for representative shared tools.
7. Exercise representative coverage, household, notification, provider/booking,
   and property-edit flows touched by shared buyer integrations.
8. Open existing direct deep links and verify refresh, browser back, return
   context, and permissions remain intact.
9. Confirm no buyer plan, task, milestone, contact, applicability, contract,
   walkthrough, or closing-session row was created by homeowner reads.
10. Repeat with an account owning two properties and verify switching preserves
    each property's existing Home state and cached data.
11. Add an active purchase property to the same account, switch repeatedly
    between owned and purchase properties, and verify exact homeowner versus
    Buyer Closing Home isolation with no navigation/query/data leakage.
12. Complete the buyer close transition and verify acquisition records and
    accepted work are additive while pre-existing homeowner records, tasks,
    preferences, coverage, inventory, household, and tool state are unchanged.

### 24.2 Buyer closing walkthrough

1. Create a homeowner account.
2. Select “Buying existing.”
3. Add an address, familiar home type, approximate year built, optional
   bedrooms/bathrooms, basement, pool/spa, closing date, move-in date, and
   inspection concern, using **Not sure** where appropriate.
4. Confirm the property and see buyer-specific first value that names how the
   home snapshot changed the guidance.
5. Open `/dashboard` and verify Buyer Closing Home leads with **Your closing at
   [address]**, current step, absolute target date, days until closing,
   plain-language status, five unnumbered buyer-outcome steps, one next action,
   bounded **Needs attention now**, at most three de-duplicated **Coming up**
   items, closing-guide access, and Ask Cozy without rendering homeowner Home.
6. Verify the pre-close navigation reads Home, Closing Plan, Documents, Ask
   Cozy, and Profile & Settings, and that the primary experience does not show
   maintenance, renovation, refinance, recurring operations, or long-term
   savings promotions.
7. Open Buyer Plan and verify the step navigator does not display **Phase N**.
   With one eligible member, verify no assignment dropdown appears. Invite a
   co-buyer, verify **Handled by** appears with household members and **No one
   yet**, assign an action, and verify external professionals are not choices.
8. Upload an accepted contract, review proposed extracted dates/terms with
   source references, confirm them, then upload a revision and verify only
   eligible milestones change.
9. Verify the financed-purchase checklist shows applicable contract,
   inspection, lender/appraisal, title, insurance, walkthrough, disclosure,
   closing-day, and move sections without exposing post-close work.
   - With dwelling type unknown, answer one just-in-time question and verify
     unknown candidates do not count as overdue or complete.
   - Confirm `CONDO_UNIT` plus association roof/exterior responsibility and
     verify unit, HOA/master-policy, common-element-question, parking/storage,
     and move-rule items appear while buyer-owned roof, lot, and basement items
     do not.
   - Change a test property to detached single-family with a basement, private
     well/septic, and pool; verify the condo-only items leave active progress and
     the correct basement, site, utility, and pool modules are added with reason
     explanations.
   - Add an approximate older year built, a source-qualified HVAC installation
     year, an unknown water-heater age, and a corrected county/location; verify
     each request explains its benefit, the HVAC and property/location modules
     update independently, and unknown appliance age is neither assumed nor
     counted complete/overdue.
   - Verify the recomposition preserves completed items, notes, assignments,
     evidence, and user-authored tasks and exposes used/missing/conflicting fact
     keys.
10. Before uploading an inspection report, open the inspection step and verify
    the whole-home and relevant property-specific checklist appears before
    optional scheduling details; verify **Last day to raise inspection
    concerns** replaces technical contingency copy; print it and confirm only
    the inspection guide is rendered. Verify report import is not recommended
    until inspection/report availability is recorded, then upload the report
    through the direct Inspection Hub route.
11. Confirm findings and classify one for negotiation and one for post-close
   work.
12. Revise the first finding to post-close and verify the existing task changes
   phase rather than duplicating.
13. Upload two purchase Loan Estimates, compare aligned fields, record a user
    selection, and verify appraisal/lender checklist write-back.
    Repeat with document extraction disabled: manually enter two estimates,
    partially save and resume one, confirm source/revision details, compare the
    aligned fields, and verify the same checklist write-back.
14. Record title/escrow contact and readiness, then bind and upload proof of
    insurance through buyer Coverage mode.
15. Complete a mobile final walkthrough with one agreed repair, photos, and one
    unresolved issue handed off to the buyer's professional contact.
16. Upload a revised Closing Disclosure, review changes against the selected
    Loan Estimate and contract credits, and record funds readiness without
    entering full wire credentials.
    Repeat with document extraction disabled: manually enter and partially save
    the disclosure, resume it, record a revision, generate buyer questions, and
    reach the same funds-readiness outcome without AI/OCR/PDF availability.
17. Ask Cozy: “What is blocking me before closing?” and verify its featured
    prompts do not promote homeowner scenarios.
18. Use Ask Cozy to explain the next checklist item and confirm assignment of
    one buyer task.
19. Generate moving actions and complete one from the buyer plan.
20. Link a provider booking to an applicable task and reconcile completion.
21. Let the scheduled closing time pass without confirming closure and verify
    that Closing Journey Mode remains active.
22. Open Closing Day Companion, complete appointment/ID/funds/questions/
    keys/records items, explicitly confirm the professional close completed,
    and verify `RECENT_OWNER`, progressive homeowner navigation, first-30-day
    copy, and carried inspection work.
23. Complete or disposition remaining pre-close work.
24. Trigger day-90 handoff and verify one canonical recurring task per unresolved
    ownership obligation.
25. Open Home and verify the normal homeowner experience retains the acquisition
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
- `apps/backend/src/services/buyerClosing/*` for checklist templates, contract,
  purchase financing, title/escrow, walkthrough, disclosure/funds, and
  closing-day services
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
- `apps/frontend/src/components/buyer/*` for the dedicated Buyer Closing Home
  composition, phase checklists, and buyer-only closing tool modules
- `apps/frontend/src/components/home/UnifiedHomeSurface.tsx` as a protected
  homeowner renderer; avoid buyer-condition changes inside it
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/buyer-plan/page.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/moving-concierge/page.tsx`
- `apps/frontend/src/components/MovingConcierge.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/ask/*`
- `apps/frontend/src/features/tools/capabilityCatalog.ts`
- `apps/frontend/src/features/tools/toolDiscoveryRegistry.ts`
- `apps/frontend/src/features/tools/propertyToolPresentationPolicy.ts`
- `apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts`
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
| `HB-SCOPE-001` | The first production release is the complete minimum coherent cut line; smaller combinations are internal increments and deferred automation retains manual guidance or entry | 21.1, 23 |
| `HB-IDENT-001` | Buyer remains a full `HOMEOWNER` account and a property-scoped journey | 3, 18 |
| `HB-IDENT-002` | One user may own one property and buy another without global-segment conflicts | 3, 8 |
| `HB-OWNER-001` | Existing homeowner functionality is a P0 protected contract and any regression blocks buyer completion | 1, 2, 5.10, 19.6, 23 |
| `HB-OWNER-002` | A thin property-scoped dispatcher selects Buyer Closing Home without rewriting or adding buyer dependencies to the homeowner renderer | 8.8, 14.2, Slice 2 |
| `HB-OWNER-003` | Shared tool-registry buyer metadata is additive and preserves the existing homeowner catalog contract | 14.16, 19.6 |
| `HB-OWNER-004` | Shared schema, APIs, services, permissions, reads, and writes preserve homeowner semantics and create no incidental buyer data | 15, 16.9, Slice 0 |
| `HB-OWNER-005` | Owned and purchase properties remain isolated across mode, navigation, cache, permissions, and data in one account/session | 5.10, 8.8, 19.6, 24.1 |
| `HB-OWNER-006` | Post-close handoff is additive and does not overwrite, reset, duplicate, delete, or reclassify existing homeowner data | 7.7–7.8, 16.9, 19.6, Slice 7 |
| `HB-ONB-001` | Buyer onboarding captures stage and optional lifecycle anchors with minimal friction | 7.2, Slice 1 |
| `HB-ONB-002` | Buyer plan exists before first-value reveal | 7.3, Slice 1 |
| `HB-HOME-001` | `/dashboard` renders a dedicated Buyer Closing Home for the selected active pre-close purchase instead of the standard homeowner Home | 7.4, 14.2, Slice 2 |
| `HB-HOME-002` | Buyer Closing Home follows the prescribed closing header, next action, blocker, timeline, readiness, document, people, Ask Cozy, and saved-for-later hierarchy | 7.4, 14.2 |
| `HB-HOME-003` | Generic homeowner feed, ranking, promotion, and owner-only payloads do not control or render in Buyer Closing Home | 7.4, 14.2, Slice 2 |
| `HB-FOCUS-001` | Before confirmed closing, the primary experience prioritizes only the seamless closing journey and suppresses homeowner-only content | 5.6, 7.4, 8, 14, Slice 2 |
| `HB-FOCUS-002` | Post-close obligations may be preserved before closing but remain collapsed, non-promotional, and non-notifying | 7.6, 9.6, 14.3 |
| `HB-NAV-001` | Buyer plan is reachable in one click from Home on desktop and mobile | 8, Slice 2 |
| `HB-NAV-002` | Every buyer CTA uses a direct property-scoped canonical route | 8.3 |
| `HB-NAV-003` | Property, entity, and return context survive every buyer workflow transition | 8.4–8.5 |
| `HB-PLAN-001` | One canonical buyer plan owns transaction, inspection, moving, and first-90-day work | 5.1, 9, 12 |
| `HB-PLAN-002` | Buyer task create/edit/status/assignment/evidence/booking operations are available in UI | 9.3–9.5 |
| `HB-PLAN-003` | Milestones and blockers are first-class, explainable records | 9.5, 9.7 |
| `HB-PLAN-004` | Default templates are stage- and context-applicable and idempotent | 9.6 |
| `HB-CHECK-001` | Every closing phase has a conditional, sectioned checklist backed by canonical buyer tasks | 14.14–14.15, Slice 3–4 |
| `HB-CHECK-002` | Checklist items explain purpose, responsibility, timing, completion, blockers, evidence, and direct next action | 14.14 |
| `HB-CHECK-003` | Checklist regeneration uses stable keys/versioning and preserves user edits, evidence, completion, and applicability decisions | 14.14, 15.7, Slice 3–4 |
| `HB-CHECK-004` | Checklists are dynamically composed from canonical dwelling, ownership/responsibility, structure, system/site, exposure, compliance, transaction, and journey-discovery facts | 14.14.1–14.14.2, 15.7, Slice 3–4 |
| `HB-CHECK-005` | Unknown, conflicting, and changing property facts produce explainable questions/deltas without false absence, denominator inflation, or lost user work | 14.14.3, 16.5, Slice 4 |
| `HB-CHECK-006` | Property age, individual appliance/system age with date precision/evidence, and source-qualified location are first-class checklist inputs without implying defect or professional findings | 14.14.1–14.14.4, 15.7, Slice 4 |
| `HB-EVID-001` | Completion distinguishes attestation, attached evidence, and verification | 9.4, 11 |
| `HB-INSP-001` | Inspection import, confirmation, disposition, and repair continuity use one obligation identity | 10 |
| `HB-INSP-002` | Finding reclassification transactionally updates existing linked work | 10.2, 16.6 |
| `HB-NEG-001` | Negotiation Shield has a buyer mode with write-back and professional boundaries | 10.3 |
| `HB-DOC-001` | Buyer documents use the canonical property document workspace and readiness states | 11 |
| `HB-MOVE-001` | Moving Concierge generates canonical buyer tasks rather than a second checklist | 12 |
| `HB-TOOL-001` | Existing tools receive buyer mode, workflow-only use, or pre-close suppression according to the audited disposition | 14.12 |
| `HB-TOOL-002` | Contract & Contingency Tracker owns confirmed contract revisions, sources, dates, terms, and milestone write-back | 14.13, 14.15A, Slice 4 |
| `HB-TOOL-003` | Purchase Financing & Loan Estimate Center is distinct from owner financing and refinance workflows | 14.13, 14.15C, Slice 4B |
| `HB-TOOL-004` | Title/Escrow Center and buyer Coverage mode track professional/document/insurance preparation without certifying approval | 14.13, 14.15D–E, Slice 4B |
| `HB-TOOL-005` | Final Walkthrough Companion provides mobile checklist, evidence, commitment linkage, and unresolved-issue professional handoff | 14.13, 14.15F, Slice 4C |
| `HB-TOOL-006` | Closing Disclosure/Funds and Closing Day tools provide revision-aware preparation, wire safeguards, and explicit close confirmation | 14.13, 14.15G–H, Slice 4C |
| `HB-TOOL-007` | Loan Estimate and Closing Disclosure workflows remain complete through manual entry, partial save/resume, source/revision tracking, validation, and confirmation when extraction is unavailable | 14.13, Slice 4B–4C, 23–24 |
| `HB-ASK-001` | Ask Cozy receives bounded canonical buyer context | 13.2 |
| `HB-ASK-002` | Ask Cozy supports buyer-specific read and confirmed-write operations | 13.3 |
| `HB-ASK-003` | Ask Cozy prompts vary by exact buyer stage and current entity context | 13.4–13.7 |
| `HB-SITE-001` | Buyer-aware copy and actions are consistent across all major site surfaces | 14 |
| `HB-DATA-001` | Schema directly supports stage, milestones, contacts, task states, and evidence | 15 |
| `HB-DATA-002` | No migration, backfill, dual-read, or permanent buyer-role model is introduced | 2, 15.9 |
| `HB-DATA-003` | Journey stage is the single lifecycle position while task phase is a per-task execution bucket; neither substitutes for or automatically advances the other | 15.2, Slice 0 |
| `HB-DATA-004` | Renaming task phase `PRE_CLOSE` updates every persisted enum, generated client, API contract, default, comparison, serializer, filter, fixture, analytics, and UI call site while preserving distinct `PRE_CLOSE_NEGOTIATION` semantics | 15.2, Slice 0 |
| `HB-API-001` | One buyer overview read model prevents query races and fragmented page loading | 16.1 |
| `HB-PERM-001` | Viewer, contributor, and owner behavior is consistent across buyer features | 18 |
| `HB-PERM-002` | Contributors may edit target closing and move-in dates but only owners may pause, resume, cancel, confirm closing, or otherwise change lifecycle state | 18 |
| `HB-LIFE-001` | Pause/cancel stops reminders and prevents recurring handoff | 7.9, 16.2 |
| `HB-LIFE-002` | Closing and day-90 handoff preserve history and strand no unresolved obligation | 7.7–7.8, Slice 7 |
| `HB-LIFE-003` | Closing Journey Mode ends only after an explicit persisted close transition, never from a scheduled date | 7.7, 8.7, Slice 7 |
| `HB-UX-001` | The complete buyer journey is responsive, accessible, fast, and reliable | 19 |
| `HB-UX-002` | Buyer flows minimize input and clicks, preserve context, recover from errors, and deliver first-session value even with missing data | 5.9, 7, 8, 19 |
| `HB-UX-003` | Every requested property detail explains the concrete checklist benefit, allows Not sure, and shows an understandable checklist delta after correction | 7.4, 14.14.4, 19.1 |
| `HB-UX-004` | Address onboarding captures a compact home snapshot, derives age from year built, reuses known facts, and immediately shows the guidance that changed | 7.2–7.3, 14.17.1, Slice 1 |
| `HB-UX-005` | Make this plan fit my home is a one-time, plain-language, impact-ranked personalization flow before the closing phases and collapses after completion | 9.2, 14.17.2, Slice 4 |
| `HB-UX-006` | The primary contract experience is upload-first, confirms only supported consequential dates, hides administrative detail, and does not represent unknown contingencies as active | 14.17.3, 19.1, Slice 4 |
| `HB-UX-007` | Every phase follows the guidance-first hierarchy and uses the same prerequisite-aware next action as Buyer Closing Home | 14.17.4–14.17.5, 17.2, 19.1, Slice 3–4 |
| `HB-ADV-001` | Advocacy prompts appear only after meaningful value and never interrupt urgent work | 14.11, Slice 7 |
