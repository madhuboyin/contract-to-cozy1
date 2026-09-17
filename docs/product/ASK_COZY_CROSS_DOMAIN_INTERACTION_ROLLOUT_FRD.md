# Ask Cozy — Cross-Domain Interaction Rollout FRD

**Version:** 1.1
**Date:** September 16, 2026
**Status:** Proposed follow-on requirements; implementation is not claimed
**Scope:** Apply the completed Ask Cozy interaction model beyond maintenance, domain by domain
**Predecessor:** [Ask Cozy — Interaction Model & UI FRD](ASK_COZY_INTERACTION_MODEL_UI_FRD.md)

**Governing addendum:** [Ask Cozy — Inline Workspace FRD](ASK_COZY_INLINE_WORKSPACE_FRD.md) changes the completion target from handoff-capable hybrid interaction to inline-complete normal homeowner journeys while preserving traditional pages and navigation as explicit user choices. Handoff requirements in this document continue to govern those optional transitions and approved exceptions.

**Revision 1.1:** Reorders delivery around an executable coverage audit, typed-dispatch coverage closure and five flagship interaction patterns; adds the Interaction Quality Harness; moves refinance ahead of Buyer; completes sell/hold/rent UX before adding goal families; and separates the read-only Attention MVP from dismiss/remind controls.

## 1. Purpose and authority

The predecessor FRD defined a shared interaction grammar and proved it through the maintenance vertical slice. That slice is the reference implementation, not the end of the product program.

This document defines the follow-on rollout for the remaining Ask Cozy feature families. It answers four questions the predecessor intentionally did not answer:

1. Which domain capabilities must receive the interaction model?
2. What user-visible behavior constitutes a complete rollout for each family?
3. In what sequence should the families be delivered?
4. Which decisions must be resolved before particular actions are exposed?

This FRD governs observable product behavior. It does not replace canonical domain rules, operation-registry policy, authorization, confirmation requirements, Skill contracts, existing domain FRDs, or the owning services' data-integrity rules.

Where this document and a domain FRD differ, implementation must inspect the current domain contract and report the discrepancy. Do not silently weaken a domain rule to make the interaction uniform.

## 2. Relationship to existing requirements

Read this document with:

- [Ask Cozy — Interaction Model & UI FRD](ASK_COZY_INTERACTION_MODEL_UI_FRD.md), which remains authoritative for result identity, declared actions, freshness, confirmation, reference context, handoff, accessibility and recovery.
- [Ask Cozy — Message-First FRD](ASK_COZY_MESSAGE_FIRST_FRD.md), which remains authoritative for turn processing, extraction, capability invocation, knowledge capture, proactive continuation and DecisionThread behavior.
- [Ask Cozy — Incremental Implementation Plan](../architecture/ASK_COZY_INCREMENTAL_IMPLEMENTATION_PLAN.md), which records the implementation history and current status of the shared foundation.
- [Ask operation registry](../../apps/backend/src/services/ask/askOperationRegistry.ts), which is the current inventory of registered Ask operations and their policy metadata.
- Each affected domain FRD, schema, service and Skill manifest.

The predecessor FRD's requirements are inherited. In particular, RES-001–005, FRESH-001–004, ACT-001–006, CONF-001–006, CTX-001–004, HAND-001–003, NEXT-001–002, ACCESS-001–003 and REC-001–003 apply to every slice where relevant and are not duplicated here.

Maintenance requirements MAINT-001–009 and acceptance scenarios A01–A24 remain the completed reference slice. This document does not reopen them.

## 3. Problem statement

Ask Cozy already exposes a broad operation registry. Many operations can route, read, calculate, prepare a command or invoke a canonical service. That does not establish that they provide the complete interaction model.

A domain is not considered rolled out merely because:

- its operation can be selected from a message;
- it returns one or more presentation blocks;
- a block links to a domain page;
- a generic confirmation card can submit its command;
- it appears in capability discovery or next actions; or
- a backend service and tests already exist.

The remaining product gap is interaction completeness: stable results, direct controls, exact targets, editable proposals where useful, current-state reconciliation, context-preserving handoff, truthful failure recovery, and continuity across turns and sessions.

## 4. Product outcome

A homeowner can start with an ordinary message or a visible control and complete supported work without learning the application's module structure. Every supported domain interaction:

- uses validated, declared components and actions;
- preserves the exact property, result, workflow and entity context;
- distinguishes original response, current view and current authoritative data;
- routes writes through the owning canonical service;
- confirms consequential changes with current inputs and current authorization;
- reconciles the originating surface after a successful change;
- hands off to a domain workspace without silently changing scope;
- returns to the Ask surface with context and position restored;
- presents partial, stale, unavailable and access-lost states honestly; and
- offers a small relevant next step only when one exists.

## 5. Definition of a completed domain rollout

**ROLL-001:** Every operation in a delivered family is classified as one of: read result, filter/refinement, conversational continuation, proposal, confirmed mutation, workflow continuation, navigation/handoff, proactive insight, internal capture, or boundary response.

**ROLL-002:** Every user-visible action declares interaction type, source result, property, exact target, registered operation when applicable, input requirements, availability and presentation. Free text may accompany an action but cannot be its only executable identity.

**ROLL-003:** Read results that benefit from scanning or comparison provide stable identity, full-collection semantics, accurate counts, supported filters/sort, bounded pagination or full-result access, freshness and refresh.

**ROLL-004:** Mutations use the existing confirmation and idempotency path, revalidate authorization and relevant versions, produce a truthful receipt, and reconcile every affected visible result without inviting duplicate execution.

**ROLL-005:** Editable proposals declare typed editable fields. An edit creates a newly validated proposal/version and invalidates prior consent. Operations that do not support editing must not display a decorative edit control.

**ROLL-006:** Continuations and row actions use canonical identity. Ambiguous references prompt for target selection; they never choose the first row, a fuzzy title or a different property.

**ROLL-007:** Domain handoff preserves every representable filter, sort, target and return anchor. Unsupported context is disclosed before or at handoff. Return revalidates affected data.

**ROLL-008:** Each slice includes keyboard, assistive-technology, narrow-width, partial-data, access-loss, stale-write, unknown-outcome and write-succeeded/read-refresh-failed coverage where applicable.

**ROLL-009:** Each slice demonstrates relevant next-action behavior, including the valid outcome of no suggestion.

**ROLL-010:** Existing backend capability is recorded as baseline evidence, not treated as acceptance of the interactive experience.

## 6. Scope

### 6.1 Included

- Cross-domain application of the established result/action/confirmation grammar.
- Home-record capture, review, correction and document-promotion interactions.
- Property-record browsing for inventory, documents and property summaries.
- Buyer-plan status, deadlines, readiness, task actions and lifecycle interactions.
- Financial, ownership-cost, refinance, reserve and tax-readiness interactions.
- Coverage, incident and claim interactions.
- Decision and project interactions, including repair/replace, quote comparison, renovation readiness and seller preparation.
- Home intelligence, inspection, forecast, Home Actions and proactive insight interactions.
- Cross-domain attention aggregation and deterministic next-action selection.
- Dismiss, already-handled and remind-later behavior after domain policy is defined.
- Persistent-goal UI and additional goal-family rollout using DecisionThread.
- Minimal changes to domain workspaces needed for context-preserving handoff and return.

### 6.2 Excluded

- Reimplementing the completed maintenance slice.
- Replacing deterministic routing with unrestricted model routing.
- A universal domain-write endpoint or browser-owned authorization policy.
- Arbitrary generated forms, executable markup or model-selected write destinations.
- Replacing canonical domain records with conversation history.
- Broad dashboard or domain-page redesign.
- Provider marketplace or new service-provider integrations.
- A new notification channel enabled without explicit user choice and existing policy.
- Live subscriptions solely to avoid explicit refresh/revalidation.
- Cross-device synchronization of transient result controls unless a later requirement explicitly adds it.
- Adding new goal families without a canonical decision/workflow owner.

## 7. Capability-family inventory

This is a rollout inventory, not a claim that the listed operations are unimplemented. The operation registry and domain code determine the live baseline at implementation time.

| Track | Registered operations or capability area | Interaction target |
| --- | --- | --- |
| Completed reference | `MAINTENANCE_STATUS`, `MAINTENANCE_TASK_CREATE`, `MAINTENANCE_TASK_COMPLETE`, `MAINTENANCE_TASK_UPDATE` | No new rollout; use as reference |
| Records and capture | `INVENTORY_LOOKUP`, `DOCUMENT_LOOKUP`, `PROPERTY_SUMMARY`, `DOCUMENT_PROMOTION_REVIEW`, `DOCUMENT_PROMOTION_CONFIRM`, `MAJOR_EVENT_ENTRY`, `CAPTURE_FACT_CONFIRM`, `CAPTURE_EVENT_CONFIRM`, `CAPTURE_WARRANTY_CONFIRM`, `CAPTURE_EVIDENCE_CONFIRM` | Search/refine records, review extracted knowledge, edit/confirm/correct canonical records |
| Buyer journey | `BUYER_PLAN_STATUS`, `BUYER_DEADLINES`, `BUYER_DOCUMENT_READINESS`, `BUYER_INSPECTION_REVIEW`, `BUYER_TASK_COMPLETE`, `BUYER_TASK_CREATE`, `BUYER_TASK_UPDATE`, `BUYER_MOVE_STATUS`, `BUYER_FINANCING_READINESS`, `BUYER_TITLE_ESCROW_READINESS`, `BUYER_WALKTHROUGH_READINESS`, `BUYER_DISCLOSURE_FUNDS_READINESS`, `BUYER_CLOSING_DAY_READINESS`, `BUYER_CONTRACT_TIMELINE`, `BUYER_NEGOTIATION_READINESS`, `BUYER_COST_READINESS`, `BUYER_FINDING_DISPOSITION`, `BUYER_LIFECYCLE_UPDATE` | Stateful plan, deadlines, evidence, readiness and confirmed task/lifecycle actions |
| Financial and ownership | `SAVINGS_OPPORTUNITIES`, `OWNERSHIP_COSTS`, `REFINANCE_ANALYSIS`, `REFINANCE_RATE_MONITOR`, `CAPITAL_RESERVE_PLAN`, `PROPERTY_TAX_APPEAL_READINESS` | Assumptions, comparisons, missing-context capture, monitoring and decision continuation |
| Protection and claims | `COVERAGE_GAPS`, `COVERAGE_COMPARISON_STATUS`, `INCIDENT_CLAIM_STATUS`, `CLAIM_FILE`, `CLAIM_TRANSITION`, `INCIDENT_CONTINUATION` | Evidence-sensitive status, preparation, filing and lifecycle transitions |
| Decisions and projects | `REPLACEMENT_GUIDANCE`, `HVAC_DECISION_START`, `HVAC_DECISION_CONTINUE`, `HVAC_SPECIALIST_ENGAGE`, `HVAC_DECISION_SCENARIO`, `HVAC_DECISION_ABANDON`, `HVAC_PREFERENCE_SAVE`, `HVAC_PREFERENCE_FORGET`, `HVAC_DECISION_OUTCOME_REPORT`, `HVAC_DECISION_OUTCOME_VIEW`, `HVAC_DECISION_OUTCOME_UNLINK`, `GUIDANCE_JOURNEY_CREATE`, `QUOTE_COMPARISON_CREATE`, `QUOTE_COMPARISON_REVIEW`, `RENOVATION_PERMIT_READINESS`, `SELL_HOLD_RENT_ANALYSIS`, `SELLER_PREP_CHECKLIST`, `SELLER_PREP_ITEM_DECISION` | Long-lived decisions, editable assumptions/preferences, scenarios, outcomes and domain handoff |
| Home intelligence and work | `MAINTENANCE_FORECAST`, `INTELLIGENCE_ENVELOPE_QUERY`, `HOME_ACTIONS`, `OPERATIONAL_WORK_UPDATE`, `INSPECTION_FINDINGS`, `INSPECTION_FINDING_UPDATE`, `HOME_DEADLINE_MONITOR`, `HOME_CHANGE_SUMMARY` | Ranked attention, exact-source explanations, state transitions and proactive continuation |
| Household/action utilities | `HOUSEHOLD_INVITATION` | Exact recipient/role review, confirmation, receipt and correction path |
| Persistent goals | `SELL_HOLD_RENT_GOAL_CAPTURE` plus future explicitly registered goal-family operations | Durable progress and cross-session continuation; no invented generic goal write |
| Discovery and guidance | `CAPABILITY_DISCOVERY`, `GROUNDED_GUIDANCE` | Contextual navigation and evidence-grounded continuation, not arbitrary action execution |
| Boundaries | `EMERGENCY_BOUNDARY`, `UNSAFE_RESTRICTED_BOUNDARY`, `OUT_OF_SCOPE_BOUNDARY` | Safe terminal/help behavior; no stateful action surface unless explicitly supported |

## 8. Shared cross-domain requirements

### 8.1 Result and view behavior

**XRES-001:** A result's stable identity includes operation, property, canonical scope and source execution. Results belonging to a durable workflow also include its canonical workflow identity.

**XRES-002:** Refining one dimension preserves compatible dimensions. A declared control expresses complete state for the dimensions it owns; it must not accidentally reset unrelated domain, entity, date or workflow scope.

**XRES-003:** The active surface shows applied scope, displayed-versus-total count where meaningful, observation time, partial/truncation disclosure and refresh availability.

**XRES-004:** A read that spans heterogeneous sources reports coverage per source or category. Missing sources cannot be interpreted as zero findings.

**XRES-005:** A result may update in place, but its original response remains available within normal conversation retention. Refresh and mutation reconciliation cannot relabel a new error as the original answer.

### 8.2 Actions and proposals

**XACT-001:** Domain operations must be selected from the operation registry or an approved domain action registry. Presentation metadata cannot create an operation.

**XACT-002:** A row may expose several actions, but only one is primary in its local group. Destructive, consequential and navigation actions are visually distinct.

**XACT-003:** Action availability is computed from current policy and business state. Disabled actions explain why when the reason is useful and safe to disclose.

**XPROP-001:** Proposal fields are domain-declared and typed. Initial supported field kinds may include text, long text, date, date range/precision, currency, decimal, enum, boolean and canonical record reference. Each new kind requires accessible rendering and server validation.

**XPROP-002:** The proposal shows current value, proposed value, source/evidence, affected record and material side effects. Unknown values remain unknown.

**XPROP-003:** Compound proposals identify independent effects. The homeowner can confirm only combinations the canonical operation supports atomically; the UI cannot imply partial atomicity that the backend lacks.

**XPROP-004:** A stale, expired or superseded proposal cannot execute. Recovery shows the current state and the supported route to prepare a new proposal.

### 8.3 Reconciliation and continuity

**XREC-001:** A successful mutation refreshes or invalidates each source result whose membership, totals, status or next actions may have changed.

**XREC-002:** When a write succeeds but a related read fails, retain the receipt, label the stale surfaces and offer read retry. Never recommend repeating the write.

**XREC-003:** A workflow continuation carries exact workflow/entity identity across sessions. Session state may accelerate lookup but cannot be the durable authority.

**XREC-004:** Deleted, merged, superseded or inaccessible records are not substituted. The result presents a truthful unavailable or redirected-to-canonical-record state.

### 8.4 Security and privacy

**XSEC-001:** Recheck property access, role floor, operation availability and target ownership before proposal preparation, edit, confirmation, retry and handoff data retrieval.

**XSEC-002:** Access loss removes usable sensitive content and action controls from the active surface. A prior client snapshot cannot remain an actionable disclosure.

**XSEC-003:** URLs contain bounded identifiers and supported filter values only. Do not include transcript text, evidence contents, private proposal values, credentials or unrestricted return URLs.

**XSEC-004:** Model output cannot assign authorization, confirmation policy, notification channel, recipient, canonical owner or write destination.

## 9. Track 1 — Home records, capture and correction

### 9.1 User outcome

A homeowner can find home records, report information naturally, review the interpreted structured record, correct it and reach its canonical history without losing conversational context.

### 9.2 Requirements

**REC-001:** Inventory, document and property-summary results use stable canonical identifiers, supported full-collection filtering and honest source coverage.

**REC-002:** A capture proposal displays the interpreted record type, property, provenance, confidence or uncertainty where useful, and every material value that will be written.

**REC-003:** Date precision remains first-class. Relative dates use the originating message timestamp and property timezone. Editing a season/year, range or approximate date cannot silently convert it to an exact day, and phrases such as “last summer” cannot be assigned a year when the supported interpretation remains materially ambiguous.

**REC-004:** Fact, event, warranty and evidence candidates retain parent/child execution identity and declared relationships. Confirming one candidate cannot implicitly confirm a sibling unless the canonical transaction explicitly defines that atomic group.

**REC-005:** General editable proposals support the field kinds actually required by registered capture writers. Domain adapters translate edits into canonical input; the browser never constructs raw persistence payloads.

**REC-006:** Correction creates the owning domain's supported revision/supersession record. It does not mutate history in place when the domain requires lineage.

**REC-007:** Document-promotion review distinguishes extracted suggestion, source document, canonical destination and conflict state. A promoted field remains traceable to its document/evidence.

**REC-008:** Duplicate detection presents the candidate and existing record relationship before confirmation. It does not silently drop a candidate or create two canonical records.

**REC-009:** Async-delivered capture proposals remain attached to the originating turn and session, preserve exact candidate identity and do not steal focus.

**REC-010:** Handoff to timeline, inventory, documents or property record opens the affected canonical record when it exists and restores the source proposal/result on return.

### 9.3 Acceptance scenarios

| ID | Scenario | Required outcome |
| --- | --- | --- |
| R01 | Filter inventory or documents, open a record and return | Same result/view restored and revalidated; no substituted record |
| R02 | Capture an approximate, ranged or materially ambiguous relative event date, then edit it | Precision/uncertainty retained; no invented year/day; old proposal version rejected |
| R03 | Capture an event with related warranty/evidence | Relationships explicit; only confirmed canonical effects occur |
| R04 | Proposed fact conflicts with current canonical value | Conflict shown with sources; supported correction/selection path offered |
| R05 | Correct a prior home event | New current revision and audit lineage; historical record retained |
| R06 | Delayed extraction finishes after the user continues chatting | Proposal appears on originating turn without duplicate or focus theft |
| R07 | Confirm succeeds but record-page refresh fails | Receipt remains; record link and read retry offered |
| R08 | Access is revoked while a proposal is open | Proposal content/actions redacted and write rejected |
| R09 | Same candidate is retried after a lost response | One canonical effect and truthful recovered receipt |
| R10 | No supported canonical writer exists | No editable/confirmable proposal; explain the limitation |

## 10. Track 2 — Buyer journey

### 10.1 User outcome

A buyer can understand the current plan, deadlines, document and readiness gaps, act on an exact task or finding, and return from deeper workspaces without losing plan context.

### 10.2 Requirements

**BUY-001:** Buyer results visibly bind to the purchase property and active Buyer Plan. A homeowner property or an inactive/ambiguous plan cannot be treated as the active purchase plan.

**BUY-002:** Status and deadline results provide stable identity, grouped/full-collection counts, canonical due dates, source freshness and supported filters.

**BUY-003:** Task create, complete and update actions use exact task identity, current plan revision and existing required fields. Completing a task cannot silently resolve a finding, contingency or lifecycle stage.

**BUY-004:** Inspection findings and disposition actions distinguish informational review, negotiated disposition and canonical task creation. Each effect requires its registered operation and applicable confirmation.

**BUY-005:** Financing, title/escrow, walkthrough, disclosure/funds, closing-day, negotiation and cost readiness surfaces show known, missing, conflicted and unavailable inputs without inventing readiness.

**BUY-006:** Contract timeline dates retain source and revision. A date edit or write-back presents old/new value, affected task/deadline and downstream consequence before confirmation.

**BUY-007:** Buyer lifecycle updates name the current and proposed stage and any effects on task visibility, reminders or readiness. Stage change does not bypass domain approvals.

**BUY-008:** Handoff preserves active plan, selected task/finding, supported phase/status/date filters and return position.

**BUY-009:** Next actions prioritize unresolved blockers and time-bound obligations using existing domain policy; they do not invent urgency or legal conclusions.

**BUY-010:** Viewer/contributor/owner capabilities remain distinct. Sensitive financing and transaction information follows existing access policy.

### 10.3 Acceptance scenarios

| ID | Scenario | Required outcome |
| --- | --- | --- |
| B01 | Ask for current buyer-plan status | One scoped progress surface with current phase, blockers, counts and freshness |
| B02 | Filter deadlines and refine by phase | Same result identity; full-scope counts; no duplicate list |
| B03 | Complete a buyer task | Exact task review/confirmation, one write, receipt and plan reconciliation |
| B04 | Update a deadline that affects another readiness view | Old/new date disclosed; all affected results refreshed or marked stale |
| B05 | Several findings could match “handle this” | Target clarification before disposition or task creation |
| B06 | Contract revision changes during review | Stale proposal blocked; current date/state shown for renewed review |
| B07 | Open a buyer workspace and return | Plan, filter, selection and position restored; changed data revalidated |
| B08 | Required source document is missing | Honest missing-context state and supported document/capture action |
| B09 | User lacks permission for financial detail | No leakage; read/action surface reflects current role |
| B10 | No relevant next step exists | Plan response completes without generic suggestions |

## 11. Track 3 — Financial and ownership decisions

### 11.1 User outcome

A homeowner can understand calculations, assumptions, missing inputs and decision options, adjust supported assumptions, start or manage monitoring, and reach the owning financial workspace.

### 11.2 Requirements

**FIN-001:** Financial results separate recorded facts, user-provided assumptions, external observations, estimates and recommendations.

**FIN-002:** Currency, rate, term, date and range values retain units and precision through presentation and editing.

**FIN-003:** Editable scenario assumptions recalculate through the canonical analysis service and produce a new result revision; editing assumptions is not a domain write unless the owning operation explicitly saves them.

**FIN-004:** Savings and ownership-cost totals disclose included categories, observation period, missing coverage and whether values are estimated or recorded.

**FIN-005:** Refinance analysis and monitoring are separate actions. Viewing or calculating an opportunity cannot enable a monitor or notification channel.

**FIN-006:** Monitor creation/editing declares threshold, timing, channel and persistence according to existing notification policy and requires any confirmation mandated by that operation.

**FIN-007:** Tax-appeal and reserve-readiness results distinguish preparation guidance from filing, payment, provider contact or other external action.

**FIN-008:** Financial next actions are suppressed when inputs are unavailable, the action is already active/completed, or the estimated benefit does not meet the domain's own eligibility rules.

**FIN-009:** Handoff carries property, scenario/analysis identity and supported assumptions without placing sensitive values in URLs.

### 11.3 Acceptance scenarios

| ID | Scenario | Required outcome |
| --- | --- | --- |
| F01 | Ask whether refinancing is worthwhile | Decision result separates facts, assumptions, estimates and missing inputs |
| F02 | Edit a supported rate or term assumption | Recalculated revision; original analysis available; no fact silently overwritten |
| F03 | Supply a missing mortgage fact | Canonical capture path and refreshed analysis/readiness |
| F04 | Enable a rate monitor | Explicit threshold/channel review; no monitor created by analysis alone |
| F05 | External rates or property facts changed | Refresh shows changed inputs and invalidates stale recommendation where material |
| F06 | Savings data is only partially available | Partial totals and missing coverage, never a false complete savings amount |
| F07 | Open the owning financial tool and return | Same analysis context restored and revalidated |
| F08 | Estimated benefit is unavailable or not meaningful | No forced action; explain the limiting input or result |

## 12. Track 4 — Protection, incidents and claims

### 12.1 User outcome

A homeowner can understand protection gaps and incident/claim state, collect required information, review consequential submissions and continue an exact incident safely.

### 12.2 Requirements

**PROT-001:** Coverage results distinguish verified policy facts, inferred gaps, comparison limitations and unavailable documents. Absence of evidence is not proof of no coverage.

**PROT-002:** Claim and incident results bind to exact canonical incident/claim identity. Similar dates, titles or affected assets require clarification.

**PROT-003:** Filing or transitioning a claim presents the target, current state, proposed state, evidence included, missing required fields and external consequences before confirmation.

**PROT-004:** The interface does not claim that an insurer, provider or emergency service has been contacted unless the canonical integration confirms it.

**PROT-005:** Emergency and safety boundaries remain visible and cannot be dismissed through a generic presentation action.

**PROT-006:** Evidence upload/attachment uses existing document/evidence ownership and never exposes private contents through handoff URLs or analytics.

**PROT-007:** A successful transition reconciles claim status, incident continuation and related attention items. A later read failure cannot erase the receipt.

**PROT-008:** Coverage comparison actions do not imply equivalence when terms, limits or exclusions remain unmatched.

### 12.3 Acceptance scenarios

| ID | Scenario | Required outcome |
| --- | --- | --- |
| P01 | Ask about coverage with a missing/unverified policy | Explicit uncertainty and supported document/capture next step |
| P02 | Several incidents could match a continuation | Clarify exact incident before showing or mutating claim state |
| P03 | Prepare a claim with missing required information | Retain entered values; request only canonical required inputs |
| P04 | Claim state changes in another session before confirmation | Stale transition blocked; current state shown |
| P05 | Claim submission succeeds and refresh fails | Durable receipt; no repeat-submit instruction; read retry offered |
| P06 | Access is revoked during review | Sensitive proposal/evidence redacted and action rejected |
| P07 | Comparison lacks equivalent terms | Limitation visible; no unsupported “better coverage” conclusion |
| P08 | Safety guidance is present with a dismissible financial insight | Safety guidance remains; dismissal affects only the declared insight |

## 13. Track 5 — Decisions, projects and seller preparation

### 13.1 User outcome

A homeowner can continue a long-lived decision, inspect scenarios and assumptions, save supported preferences, record an outcome and move between Ask and a specialized workspace without losing decision identity.

### 13.2 Requirements

**DEC-001:** Decision surfaces bind to a canonical DecisionThread or owning project/case when one exists. Conversation session identity is never the durable workflow identity.

**DEC-002:** Scenario comparisons retain the same assumptions, evidence version and units across options. A missing option value cannot be normalized into a false comparison.

**DEC-003:** Saving or forgetting a preference is a declared domain action with exact scope and receipt. A conversational statement is not persisted as preference unless the registered operation supports it.

**DEC-004:** Specialist engagement shows the relevant decision and evidence scope and does not imply human/provider contact when the operation invokes only an internal specialist runtime.

**DEC-005:** Abandoning a decision, unlinking an outcome or changing seller-prep disposition explains what remains in history and what future recommendations will change.

**DEC-006:** Quote creation/review distinguishes supplier-provided facts, normalized values, assumptions and recommendation. No booking or acceptance occurs without a separately supported action.

**DEC-007:** Renovation readiness distinguishes an existing tracked case from prospective permit/tax/licensing guidance. The two features cannot share an operation identity merely because both mention renovation.

**DEC-008:** Seller-prep checklist and item decisions use canonical case/item identity, reconcile checklist progress and preserve sell/hold/rent DecisionThread continuity.

**DEC-009:** Direct analysis and goal capture may attach to the same durable decision only when the domain's identity policy says they represent the same active workflow.

### 13.3 Acceptance scenarios

| ID | Scenario | Required outcome |
| --- | --- | --- |
| D01 | Start and later resume an HVAC or sell/hold/rent decision | Same durable thread; current assumptions/evidence loaded |
| D02 | Edit a scenario assumption | New comparison revision; original retained; no canonical fact silently changed |
| D03 | Save then forget a scoped preference | Exact scope disclosed; receipts; subsequent decision refresh reflects change |
| D04 | Record an outcome after the source action changed | Revalidate linkage; clarify or reject stale target |
| D05 | Open quote/seller/decision workspace and return | Workflow, selected item/scenario and position restored |
| D06 | Abandon a decision | History retained according to domain rules; active next actions suppressed |
| D07 | Seller-prep item changes in another session | Stale item action blocked; current disposition shown |
| D08 | Prospective renovation question has no tracked case | Route to distinct supported guidance or limitation, not tracked-case readiness |

## 14. Track 6 — Home intelligence and proactive attention

### 14.1 User outcome

A homeowner receives one coherent, trustworthy view of what needs attention, can understand why, and can take only actions whose domain meaning and persistence are explicit.

### 14.2 Requirements

**ATT-101:** Aggregate immediate safety, time-bound obligations, maintenance priority, financial opportunity and uncertain/speculative concern without converting them into a fabricated universal risk score.

**ATT-102:** Every item carries owning domain, source, observation time, reason for attention, uncertainty, property and canonical target where one exists.

**ATT-103:** Ordering is deterministic and policy-owned. Model prose may explain a ranked item but cannot set its priority.

**ATT-104:** Selected-property and all-property modes are distinct. All-property mode must label property on every item and cannot merge records across properties.

**ATT-105:** Similar signals from several producers are grouped or deduplicated without hiding materially different evidence, deadlines or actions.

**ATT-106:** `DISMISS` hides only the declared presentation item for the declared duration/scope. It never resolves the underlying domain object.

**ATT-107:** `ALREADY_HANDLED` invokes a domain operation only when one exists. Otherwise it records only the explicitly defined feedback/presentation effect and says so.

**ATT-108:** `REMIND_LATER` requires a supported time and existing allowed channel. It does not enable notifications, reschedule a task or alter the underlying due date.

**ATT-109:** Safety guidance and legally/time-critical obligations cannot be suppressed by a generic dismissal policy. Any domain-specific acknowledgement follows that domain's requirements.

**ATT-110:** Home Actions, inspection findings, forecasts, deadlines, changes and envelope insights reconcile after canonical mutations and source updates.

**ATT-111:** An exact-source explanation is available for each actionable item. Missing evidence yields a limitation, not a generated rationale presented as fact.

### 14.3 Acceptance scenarios

| ID | Scenario | Required outcome |
| --- | --- | --- |
| T01 | Several domains have active attention items | Deterministic categorized ordering with source/time/uncertainty |
| T02 | Same underlying issue appears from two producers | Honest grouping/deduplication with all material evidence retained |
| T03 | Switch from selected-property to all-property view | Property labels and boundaries preserved; no cross-property action retargeting |
| T04 | Dismiss a financial opportunity | Exact duration/scope disclosed; domain state unchanged |
| T05 | Mark an item already handled where no domain completion exists | No fabricated completion; defined presentation/feedback effect only |
| T06 | Remind later without an enabled channel | Ask for or explain supported channel choice; do not enable silently |
| T07 | Dismiss near a safety item | Safety guidance remains visible |
| T08 | Source becomes unavailable | Item becomes partial/unavailable; no “all clear” state |
| T09 | Complete underlying work from another surface | Attention item reconciles without duplicate action |
| T10 | No actionable items remain | Honest completion/empty state with no forced suggestion |

## 15. Track 7 — Persistent goals and cross-session progress

### 15.1 User outcome

A homeowner can state a supported long-lived goal, return later from another session, see progress and missing context, and take explicitly supported next steps without duplicate workflows or automatic consequential actions.

### 15.2 Requirements

**GOAL-001:** A goal family is eligible only when a canonical DecisionThread adapter or equivalent workflow owner defines durable identity, create/resume rules and supported progress state.

**GOAL-002:** Adding a goal family requires an explicit registered operation and extraction contract. Do not route several unrelated goals through `SELL_HOLD_RENT_GOAL_CAPTURE`.

**GOAL-003:** Goal extraction must reach the family-specific confidence/ambiguity policy. Ambiguous existing workflows prompt selection; low-confidence statements do not create a thread silently.

**GOAL-004:** Goal creation/resumption is independent of Ask session identity. Same-session pointers are caches only.

**GOAL-005:** The goal surface shows known target timing, progress, assumptions, open questions, missing context, recent material changes and supported next actions.

**GOAL-006:** Vague follow-ups may resolve against an active goal only when the family and target are unambiguous. Otherwise ask the homeowner to choose.

**GOAL-007:** Creating workflow bookkeeping alone does not require material-write confirmation. Consequential actions reached from the goal retain their own confirmation and authorization rules.

**GOAL-008:** Abandon, pause, resume and completion semantics are domain-declared. Presentation controls cannot invent them.

**GOAL-009:** The first follow-on goal family should reuse an existing registered DecisionFamilyAdapter and canonical domain workflow. Refinance is the documented candidate; final selection must be verified against current code and product priority before implementation.

### 15.3 Acceptance scenarios

| ID | Scenario | Required outcome |
| --- | --- | --- |
| G01 | State a supported goal in ordinary language | One durable workflow created or resumed under the family confidence policy |
| G02 | Repeat the goal in another session | Same active workflow; no duplicate thread |
| G03 | Two materially distinct active goals could match | Selection required before continuation |
| G04 | Give a vague follow-up with one unambiguous active goal | Continue exact thread using bounded structured state, not raw transcript replay |
| G05 | Goal leads to a consequential domain action | Separate proposal/confirmation; no automatic booking/message/write |
| G06 | Pause or abandon the goal | Domain-defined state and effect disclosed; history retained as required |
| G07 | Goal assumptions or evidence change | Progress/next actions re-evaluated and stale proposal invalidated |
| G08 | Unsupported life goal is stated | Helpful boundary/guidance; no generic or wrong-family thread created |

## 16. Household invitation

**HH-001:** Invitation review names property, recipient, role, expiry where applicable and resulting access before confirmation.

**HH-002:** Recipient identity must come from validated user input and the canonical invitation service, not model inference.

**HH-003:** Duplicate, expired, revoked and already-accepted invitations produce distinct outcomes.

**HH-004:** The receipt provides the supported revoke/manage path. Ask cannot claim delivery if the owning service reports only creation or an unknown delivery outcome.

## 17. Handoff requirements by destination

Before a domain slice is complete, record a handoff capability map with:

| Field | Required evidence |
| --- | --- |
| Destination route | Validated internal route and canonical property/workflow scope |
| Supported filters | Exact parameter names, value grammar and matching semantics |
| Unsupported filters | User-visible disclosure and expected membership difference |
| Selected entity | Canonical type/id and honest missing-target behavior |
| Return state | Session/execution/result plus bounded local view anchor |
| Revalidation | Which source results refresh after destination-side changes |
| Access failure | Safe destination and source-surface redaction behavior |

No slice may claim handoff completion from the presence of an `href` alone.

## 18. Responsive and accessible behavior

**XA11Y-001:** All direct controls have accessible names describing the action and target. Repeated row actions must not be distinguishable only by visual position.

**XA11Y-002:** Structured comparisons preserve header/value relationships at narrow widths and with assistive technology. If transformed to cards, the same labels and units remain available.

**XA11Y-003:** Proposal edits expose field-level validation and retain input after recoverable failure. Focus moves to the error summary or field according to existing application conventions.

**XA11Y-004:** After filtering, mutation reconciliation or access redaction, focus moves to the next logical control or result heading and the material change is announced without rereading the entire surface.

**XA11Y-005:** Proactive items do not steal focus when inserted. Newly available content is announced only when appropriate to its urgency and the application's notification policy.

## 19. Analytics and observability

Instrumentation must use existing analytics, Ask execution, capability, receipt and domain-event mechanisms where possible.

At minimum, implementation must make it possible to measure:

- result created, refined, refreshed and handed off;
- direct control versus typed continuation;
- proposal prepared, edited, confirmed, cancelled, expired and conflicted;
- mutation succeeded, failed, recovered or reached unknown outcome;
- source-result reconciliation success/failure;
- handoff return and context-restoration success;
- dismiss/already-handled/remind-later effect and scope;
- goal created, resumed, selected, paused/abandoned and completed where supported;
- access-loss and stale-target rejection; and
- next action shown, invoked, suppressed or absent.

Analytics must not contain transcript text, document contents, sensitive proposal values or unrestricted identifiers beyond existing approved conventions.

## 20. Interaction quality harness

Correctness is necessary but does not establish that an interaction is understandable, efficient or pleasant. Each flagship journey therefore has a repeatable quality review in addition to its functional acceptance scenarios.

**QLT-001:** Maintain golden homeowner journeys for maintenance action, conversational record capture, refinance decisioning, sell/hold/rent continuation and the read-only attention experience.

**QLT-002:** Record turns to outcome, direct-control activations to outcome, clarification count, confirmation count, navigation count and recoverable errors encountered. These observations diagnose regressions; they are not universal KPI targets and never justify removing a domain-required confirmation.

**QLT-003:** Record whether the interaction lost property, entity, result, proposal or durable-workflow context; appended a duplicate live surface; repeated a completed action; or required the homeowner to rediscover a module.

**QLT-004:** Review information hierarchy, progressive disclosure, action hierarchy, density, conversation rhythm, transition continuity, mutation feedback, empty/degraded states and narrow-width behavior.

**QLT-005:** The primary next action, when one exists, is visually and semantically clear. Secondary actions remain available without presenting every possible action at equal weight.

**QLT-006:** Structured surfaces support the conversation rather than overwhelming it. The initial state shows the minimum information needed to understand the result and decide what to do next.

**QLT-007:** A functionally correct journey still fails quality review when it introduces unnecessary turns, forms, pages, confirmations or repeated context gathering relative to the established baseline.

**QLT-008:** Do not invent numeric pass thresholds without evidence from real use. Initially preserve annotated baselines and compare changes for regression, with reviewer reasoning recorded alongside measurements.

**QLT-009:** Repeated successful patterns become a small Ask Cozy interaction-design reference—component usage, hierarchy, copy and transition guidance—not a parallel architecture or arbitrary generated design system.

**QLT-010:** Browser review covers desktop, narrow viewport and keyboard-only use when an existing runnable environment is available. Slow request, failed request, stale target and property-switch behavior are exercised where the environment supports them. Lack of such an environment is reported, not hidden or worked around by provisioning one solely for this review.

## 21. Delivery phases

The sequence deliberately proves five different product capabilities before broad rollout: act, remember, decide, continue and anticipate.

### Phase 0 — Executable operation and interaction coverage audit

- Generate or mechanically verify a coverage matrix from the live `AskOperationId` registry rather than maintaining a document-only inventory.
- Classify every operation in §7 against ROLL-001.
- Record interaction class, canonical owner, role floor, current UI surface, typed dispatch path, confirmation/edit behavior, freshness/version source, idempotency, reconciliation, handoff and static/database/browser verification level.
- Record which operations already meet the shared interaction requirements and which require product or engineering work.
- Add a drift check so a newly registered user-visible operation cannot remain unclassified silently.
- Resolve conflicts between current code, domain FRDs and this document before implementation.

**Exit:** an executable or mechanically checked coverage matrix with no unclassified user-visible operation and no status inferred solely from the presence of a backend handler.

### Phase 0.5 — Typed-dispatch coverage closure

- Audit every live direct control against the existing typed item dispatcher and the dedicated filter, refresh, confirmation/edit and navigation paths.
- Preserve the current separation of concerns: confirmation/editing may remain on ConfirmationCard endpoints, navigation may remain a validated link, and record mutations may continue through AskExecution when that is required for receipt/reconciliation/history.
- Ensure no rendered live control reaches an `UNSUPPORTED` outcome. A conceptual interaction type may remain unsupported only when no live control exposes it or when its blocking domain policy is explicitly documented.
- Keep exhaustiveness checks so a new interaction type fails validation until assigned a safe dispatch outcome.

**Exit:** every rendered direct control has a tested typed outcome; no generic text-routing fallback is the sole identity of a declared action.

### Phase 1 — Interaction quality harness and maintenance flagship journey

- Establish §20's golden-journey format and baseline the completed maintenance slice.
- Review the full maintenance journey: query → filter → select → prepare reschedule → edit → confirm → reconcile → exact-task explanation → handoff → return.
- Include desktop, narrow viewport, keyboard-only, failed/slow request, stale target and property-switch variants when an existing runnable environment is available.
- Treat the predecessor FRD's existing unit, component, database and browser evidence as baseline; do not describe already-implemented A16/A23 continuity or typed dispatch as new implementation.

**Exit:** the maintenance journey has a recorded functional and interaction-quality baseline, with any unexecuted live scenarios distinguished from missing implementation.

### Phase 2 — Records, conversational capture and correction

- Implement §9, including general typed proposal fields needed by the selected capture writers.
- Prove related-candidate, conflict, correction, async-delivery and canonical-record handoff behavior.
- Preserve temporal ambiguity and date precision; do not turn “last summer” into a specific year/day unless the supported interpretation is sufficiently grounded.
- Add the capture journey to the interaction quality harness.

**Exit:** R01–R10 pass for the selected canonical record types; unsupported writers remain explicitly non-actionable; the capture quality baseline is recorded.

### Phase 3 — Refinance decision experience

- Deliver `REFINANCE_ANALYSIS` as the first focused §11 slice before the broader Buyer family.
- Separate recorded facts, editable scenario assumptions, external observations, estimates and recommendations.
- Support missing-context capture, recalculation, explanation, financial-workspace handoff and a separately declared monitor action.
- Editing an analysis assumption must not silently overwrite a canonical mortgage fact or enable monitoring.
- Add the refinance journey to the interaction quality harness.

**Exit:** F01–F05, F07 and F08 pass for refinance, with monitor creation remaining a separate explicit action and the quality baseline recorded.

### Phase 4 — Sell/hold/rent persistent-decision UX completion

- Treat the existing DecisionThread create-or-resume and non-duplication implementation as baseline, not new backend work.
- Complete and validate the user experience for progress, target timing, assumptions, open questions, missing context, changes since the prior visit and supported next actions.
- Exercise cross-session return and unambiguous vague follow-up behavior.
- Resolve whether direct `SELL_HOLD_RENT_ANALYSIS` attaches to an existing active family thread before changing that path.
- Add the persistent-decision journey to the interaction quality harness.

**Exit:** the relevant D01/D05/D07 and G02/G04/G07 scenarios pass for sell/hold/rent at the level claimed; live model/browser limitations remain explicit.

### Phase 5 — Read-only “What needs my attention?” MVP

- Implement the non-mutating portion of §14: aggregation, category, deterministic ordering, property boundary, exact source, observation time, uncertainty, explanation and existing domain action/navigation.
- Do not expose `DISMISS`, `ALREADY_HANDLED` or `REMIND_LATER` in this phase.
- Avoid a universal risk score and preserve required safety guidance.
- Add the attention journey to the interaction quality harness.

**Exit:** T01–T03 and T08–T10 pass without depending on unresolved attention-control semantics.

### Phase 6 — Buyer journey

- Implement §10 across buyer read, task/action and lifecycle operations after the list, capture, decision, persistent-workflow and attention primitives have proven reusable.
- Reuse maintenance's list/action/reconciliation grammar while preserving Buyer Plan revisions and domain requirements.

**Exit:** B01–B10 pass and the buyer operation family has no undeclared item mutation.

### Phase 7 — Remaining decisions, projects and seller preparation

- Implement the remaining approved portions of §§11 and 13, including ownership/savings, HVAC, quote comparison, renovation readiness and seller-prep interactions.
- Generalize editable scenario assumptions without turning analysis inputs into silent canonical writes.

**Exit:** applicable F01–F08 and D01–D08 scenarios pass for the delivered slices.

### Phase 8 — Protection and claims

- Implement §12 only after lower-risk slices have proven the shared interaction grammar.
- Include evidence/privacy review, exact incident/claim targeting, stale transitions, access loss and unknown-outcome recovery.

**Exit:** P01–P08 pass.

### Phase 9 — Full attention controls

- Resolve the product decisions in §22 for dismissal, already-handled and reminder semantics.
- Implement `DISMISS`, `ALREADY_HANDLED` and `REMIND_LATER` only for domains with explicit duration, scope, persistence, channel and underlying-record effects.
- Reuse the read-only Attention MVP; do not create a second aggregation surface.

**Exit:** T04–T07 pass and every exposed control has a tested typed dispatch outcome.

### Phase 10 — Additional persistent goal families

- Verify the selected family's canonical adapter and identity policy.
- Register a distinct goal operation and implement §15 without altering the sell/hold/rent identity contract.

**Exit:** G01–G08 pass for at least one additional goal family.

Phases may proceed in parallel only where their shared contract changes do not overlap. A phase does not need a release flag or staged cohort solely because it is a phase in this document.

## 22. Open product decisions

These decisions block only their dependent behavior:

| Decision | Required before |
| --- | --- |
| Cross-domain attention category precedence and tie-breaking | Phase 5 aggregation |
| Selected-property versus all-property default and switching behavior | Phase 5 all-property view |
| Dismiss duration, scope and persistence by domain/category | Phase 9 `DISMISS` exposure |
| Meaning of already handled for domains without a canonical completion operation | Phase 9 `ALREADY_HANDLED` exposure |
| Reminder duration presets, custom-time support and allowed channels | Phase 9 `REMIND_LATER` exposure |
| Whether direct sell/hold/rent analysis attaches to an existing family thread | Phase 4 analysis/thread convergence |
| First additional goal family | Phase 10 implementation |
| Whether direct analysis attaches to an existing family thread | Each later decision-family rollout |
| Which proposal field types are justified by the first capture slices | Phase 2 shared proposal contract |
| Which destination filters warrant API expansion versus honest disclosure | Each domain handoff |

Do not invent these answers in implementation. Unrelated tracks may proceed.

## 23. Validation strategy

Each phase must provide:

1. Requirements-to-operation coverage mapping.
2. Contract validation for backend schemas and mirrored frontend types.
3. Focused tests for pure targeting, view-state, proposal-version and reconciliation logic.
4. Domain service tests for authorization, idempotency, stale versions and canonical writes where an environment-independent setup exists.
5. Component-level coverage for keyboard/focus, access redaction, validation retention and result continuity where practical.
6. Interaction-quality review against the applicable §20 golden journey.
7. Browser acceptance for the phase's representative vertical slice when an existing runnable environment is available.
8. Honest disclosure of database, provider, worker, browser or external-integration scenarios not executed.

Do not provision new services or weaken safeguards solely to satisfy this FRD. Runtime unavailability does not convert a code-path review into an executed acceptance test.

## 24. Cross-domain acceptance gates

A phase cannot be marked complete until all applicable gates pass:

| Gate | Required proof |
| --- | --- |
| Identity | Exact property/result/workflow/entity targeting; ambiguous references clarify |
| Read integrity | Full-scope filtering/counts or explicit partial/truncation disclosure |
| Freshness | Refresh and pre-write revalidation; out-of-order responses rejected |
| Proposal integrity | Typed validation, version invalidation and consent reset after edit |
| Write safety | Canonical service, current authorization/version, idempotency and truthful unknown-outcome recovery |
| Reconciliation | Source and dependent results updated or marked stale; receipt retained on refresh failure |
| Handoff | Supported context preserved, unsupported context disclosed, safe return and revalidation |
| Accessibility | Keyboard, labels, focus and announcements verified for representative flow |
| Privacy | Access loss redacts; URLs/analytics avoid sensitive contents |
| Next action | Relevant bounded set or intentionally none; no unauthorized/unavailable action |
| Interaction quality | Golden journey reviewed; unnecessary turns/forms/navigation and lost context recorded; no unexplained regression from baseline |

## 25. Definition of done for the program

The cross-domain interaction rollout is complete when:

- every user-visible `AskOperationId` is classified by the executable coverage matrix and either covered by a delivered domain slice, intentionally retained as a simple terminal/read response, or explicitly excluded with rationale;
- every declared direct control has a typed dispatch outcome and no live control falls into an unsupported branch;
- every confirmation-capable operation has current-state, stale-version, duplicate-submit, unknown-outcome and receipt behavior appropriate to its domain;
- all implemented handoffs have destination capability maps and tested return behavior;
- the read-only attention experience is delivered before dismissal/reminder controls, and those controls are implemented only after their policy decisions are recorded;
- the sell/hold/rent persistent-decision experience has a quality baseline before additional goal-family expansion;
- at least one additional persistent-goal family is delivered without duplicating or weakening sell/hold/rent behavior;
- the flagship golden journeys have recorded quality baselines and unexplained interaction regressions are resolved;
- the representative acceptance scenarios in each delivered track pass at the level actually claimed; and
- documentation distinguishes implemented behavior, code-path/static verification, database verification and browser/runtime verification.

Completion does not require the excluded dashboard redesign, arbitrary generated UI, live subscriptions or universal goal support.
