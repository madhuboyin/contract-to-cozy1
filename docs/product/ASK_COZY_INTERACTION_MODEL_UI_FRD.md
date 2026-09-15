# Ask Cozy — Interaction Model & UI FRD

**Version:** 1.2
**Date:** September 13, 2026 (implementation status added September 14, 2026)
**Status:** Maintenance interaction corrections implemented — see §29 for scope and verification. Later-domain requirements remain separate; runtime validation is not claimed.
**Scope:** Ask Cozy inline interactions. Maintenance is the first implementation slice.

## 1. Purpose and authority

Homeowners can ask naturally or act directly. Cozy presents the simplest useful interface, preserves context, and makes changes clear and reviewable.

Ask Cozy is the primary intent surface. Responses can become interactive working surfaces. Structured domain workspaces remain available for deeper management. Filtering or acting on a result must not turn every interaction into another full response in the transcript.

This document specifies observable UI behavior and shared interaction requirements. It extends the message-first program with stateful results, declared item actions, editable proposals, and context-preserving handoffs. It does not replace domain business rules, security policies, confirmation requirements, or canonical records.

Labels used below:

- **Requirement:** intended behavior for implementation, not an assertion that it exists.
- **Verified baseline:** observed in the working tree during this review.
- **Open decision:** a material detail requiring resolution before its dependent behavior is implemented; unrelated work can proceed.

The scope and principles reflect the user's accepted review discussion. Detailed requirements below make those decisions reviewable; unresolved business semantics are identified in §16 instead of silently inferred.

## 2. Sources and verified baseline

Read alongside:

- [Message-First FRD](ASK_COZY_MESSAGE_FIRST_FRD.md), especially §§8, 22, 27–30, 33.
- [Ask Redo FRD](AI_HOME_CONCIERGE_ASK_REDO_FRD.md), especially §12.1 and the governed-command requirements.
- [Target Product & Architecture](../architecture/ASK_COZY_TARGET_PRODUCT_AND_ARCHITECTURE.md).
- [Incremental Implementation Plan](../architecture/ASK_COZY_INCREMENTAL_IMPLEMENTATION_PLAN.md), especially the structured-response and child-execution contracts.

| Verified baseline | Implication for this FRD |
| --- | --- |
| [Response contract](../../apps/backend/src/productFramework/ask/ask.contract.ts) already defines summaries, grouped lists, tables, timelines, comparisons, progress, evidence, and degraded states | Extend approved components; do not introduce arbitrary generated interfaces |
| Grouped-list items expose identity, display metadata and a link; shared actions currently expose identity, label, href and style | Item actions and typed interaction dispatch require explicit contract work |
| [AskWorkspace](../../apps/frontend/src/components/ask/AskWorkspace.tsx) renders ActionLink only when href exists | Adding an action label alone does not implement filtering or mutation |
| Confirmation is an execution-level object; the current confirmation card presents fields, consent, confirm and cancel | Reuse the confirmation mechanism and add validated editing; do not create a competing confirmation block or write path |
| [Operation registry](../../apps/backend/src/services/ask/askOperationRegistry.ts) declares maintenance complete/update as confirmation-required commands with CONTRIBUTOR floor | Both maintenance actions retain confirmation and owner/contributor access; viewers remain read-only |
| [Maintenance orchestration](../../apps/backend/src/services/ask/askOrchestrator.service.ts) queries canonical tasks, resolves scopes, produces counts, versions and source information | Preserve these semantics and domain service ownership when adding inline interactions |
| Existing links carry Ask return context | Extend and verify filter, selection and return-position continuity; do not claim complete handoff already exists |

The operation registry had pre-existing uncommitted changes at review time. Findings describe the inspected working tree, not an independently verified committed release. Older documents contain implementation snapshots; their line counts and completeness claims are not current verification.

Relationship to earlier scope: Message-First §28 limited that program's new presentation types and did not require this interaction redesign. This FRD adds behavior within approved response components and execution contracts. Dashboard redesign remains separate. Existing capture confirmation, durable domain storage, deterministic capability selection, and outside-chat correction requirements remain applicable.

## 3. Scope and delivery boundaries

| Scope layer | Included |
| --- | --- |
| Shared model specified now | Result identity/lifecycle, declared actions, freshness, confirmation/edit states, continuation, reference context, handoff, responsive access, error recovery, attention presentation and next-action selection |
| First implementation: maintenance | Inline pending results, supported filters, item selection, complete/reschedule with existing confirmation, authoritative reconciliation, explanation follow-up, full-result access, and management handoff |
| Design validation now | Event capture with uncertain dates and a persistent selling goal; confirm that shared contracts support them without making their full implementation part of maintenance |
| Subsequent implementation | General editable extraction proposals across domains, cross-domain attention aggregation, and expanded persistent-goal UI; preserve any existing capabilities during maintenance work |
| Excluded | Dashboard redesign, pinned or secondary workspaces, split-screen Ask, floating canvases, arbitrary generated UI, broad redesign/replacement of domain pages |

Small changes to a destination page to accept context or return to Ask are within the maintenance handoff scope. This does not authorize a broader page redesign. No release gates, feature flags, pilot cohorts or additional approval machinery are introduced.

## 4. Experience principles

**UI-001:** Natural-language input and direct controls are equal ways to act. Do not require a typed message for a visible supported operation.

**UI-002:** Compose approved components from validated data and declared actions. The model cannot provide executable code, arbitrary markup, authorization decisions or arbitrary write destinations.

**UI-003:** Prefer a short answer for a fact and a structured surface when comparison, scanning, editing or action benefits from it. Avoid duplicating the same answer in prose and cards.

**UI-004:** Conversation is not the system of record. Confirmed writes use canonical domain services; the receipt links to the owning record and its existing correction path.

**UI-005:** Provide a useful next step when one exists; otherwise allow the interaction to finish.

## 5. Result identity and state

**RES-001:** Each interactive surface has stable identity bound to its originating execution, block, property scope and canonical query. Item identity uses canonical record references, never row position or display title.

Maintain three distinct concepts:

| Layer | Meaning | Required behavior |
| --- | --- | --- |
| Original response | What Cozy answered, with original query/scope and observation time | Retained within existing conversation retention/deletion policies; refresh must not silently overwrite its meaning |
| Current view | Filters, sort, expanded rows, selection and loaded pages | May change in place without changing domain records |
| Current data | Latest successful authoritative read and its version/observation time | Used for current counts, membership and permitted operations |

**RES-002:** Normal presentation is compact: scope/filter label, count, and freshness text. Original response details are available on demand. Show specific change counts only when computed from a supported comparison; a timestamp alone proves no changes.

**RES-003:** A new question creates a response. A declared filter or refresh updates its target surface. If a typed request is confidently a refinement of the active read result, preserve the user message and acknowledge the update without appending a duplicate list. Ambiguous requests require target clarification.

**RES-004:** Browsing history does not automatically refetch every result. An older surface shows when it was observed and offers refresh. Interaction requiring current data revalidates that target. Preserve original-answer context when showing a refreshed view.

**RES-005:** View state survives navigation to a management page and back, and ordinary reload of the same session. It does not become a property fact. Cross-device synchronization of transient filters is not required in the first slice. Existing conversation deletion must clear associated view state; no separate indefinite transcript archive is introduced.

## 6. Result lifecycle and freshness

Result state is separate from Ask execution status and from task business status.

| State | Required presentation/behavior |
| --- | --- |
| Loading | Stable placeholder and scope; no available write controls based on incomplete data |
| Ready | Current result, totals, supported actions and observation time |
| Refreshing | Retain prior content and view state, indicate refresh; prevent conflicting operations on affected targets |
| Stale or historical | Indicate age or known invalidation; offer refresh; revalidate before write |
| Partial | Show available data and missing coverage; never label partial totals as complete |
| Empty | Distinguish no matching records from no recorded tasks; offer clear filters when relevant |
| Unavailable/error | Explain retrieval failure and supported retry; never substitute an empty result |
| Access lost | Remove inaccessible data from the active view and block further requests; preserve no usable write action |

**FRESH-001:** Revalidate on explicit refresh, return from a domain edit, known local mutation, and before preparing/executing a write. Recheck authorization and relevant domain version at confirmation. No arbitrary client freshness timeout substitutes for server validation.

**FRESH-002:** If the target materially changed after review, invalidate the old proposal and present the changed state for renewed review. If already completed, report that fact rather than executing again. Deleted, archived or inaccessible targets must not be silently substituted.

**FRESH-003:** Out-of-order fetches cannot overwrite a newer filter, property context or data revision. Background updates must not erase user input or steal focus.

**FRESH-004:** Do not promise live cross-session change detection without a supporting mechanism. v1 can discover external changes on refresh/revalidation. A live subscription is not required.

## 7. Declared action model

**ACT-001:** Separate interaction type, domain operation and target. For example: interaction `MUTATE_RECORD`, operation `MAINTENANCE_TASK_COMPLETE`, target the selected canonical task. `MARK_COMPLETE` is not a new universal interaction type.

| Interaction | Meaning |
| --- | --- |
| CONVERSATION_CONTINUE | Create a contextual question/response tied to the source result and selected entity |
| FILTER_RESULT | Update the target view/query; no domain write |
| MUTATE_RECORD | Prepare a registered domain operation with validated inputs |
| NAVIGATE | Open a supported destination with validated handoff context |
| CONFIRM | Submit the exact current proposal through existing confirmation |
| EDIT_PROPOSAL | Edit declared fields and request a newly validated proposal |
| REFRESH | Read current authorized data for the target scope |
| DISMISS | Apply an explicitly declared local or durable dismissal behavior |
| REMIND_LATER | Invoke the registered reminder/snooze behavior with required time/channel inputs |

These are conceptual interaction semantics; exact TypeScript/Zod names belong in the implementation design. Not every type must be implemented in maintenance v1.

**ACT-002:** The server owns allowed operations, target validation, role floor, side effects, persistence, confirmation and freshness policy. A response can reference this policy and explain it, but the browser/model cannot override it. Do not repeat the full policy definition in every card.

**ACT-003:** The logical contract carries action identity, type, source result, property/entity target, registered operation when applicable, validated input or input requirements, availability/reason, and presentation label. The dispatcher resolves trusted policy and returns a typed outcome. Unsupported actions fail visibly and safely.

**ACT-004:** Visually distinguish item commands, conversational suggestions and navigation. Use explicit labels. Show at most one primary action per local action group; secondary actions remain discoverable without an excessive chip list.

**ACT-005:** No side effects occur through filters or navigation. Dismissal must say what is hidden and for how long. Remind later must not silently reschedule the underlying task or enable a notification channel.

**ACT-006:** Disable duplicate submissions for an in-flight target and use existing server idempotency semantics. After a lost response, reconcile the original operation before retrying. Button disabling alone is insufficient.

## 8. Confirmation, editing and execution

**CONF-001:** Preserve domain-required confirmation. Maintenance complete and update currently require it. A row action opens a contextual review/input state; it does not perform the mutation first.

**CONF-002:** Show target, proposed changes, relevant side effects and destination before confirmation. Include existing required fields, such as project health outcome when completing a project follow-up. Optional fields do not become mandatory merely because the UI can collect them.

**CONF-003:** Editing uses declared typed fields with existing validation. Editing invalidates the previous confirmation version and consent; the server returns a new validated proposal. Confirming an older version cannot apply edited or stale input. Retain user edits after a validation error.

**CONF-004:** Cancel before submission writes nothing. Once submitted, do not label an action cancelled unless the backend confirms cancellation. Running, succeeded, failed and outcome-unknown states have distinct copy.

**CONF-005:** Successful domain mutation produces a concise receipt and an authoritative result reconciliation. A refresh failure after a successful write must say “Saved; list could not refresh,” preserve the receipt and offer read retry. Never invite the user to repeat a confirmed successful mutation.

**CONF-006:** Receipts remain available in the originating conversation under its normal retention rules. Provide the owning record link. Offer Undo only when an authorized domain reversal exists; otherwise use the supported correction/reopen path with its real semantics.

## 9. Maintenance first implementation

### 9.1 Query and filtering

**MAINT-001:** “Show pending maintenance” returns a single structured inline surface for the selected property. Reuse canonical open-status, priority, date/timezone and default exclusion rules. Pending is a user label for the existing open-task semantics, not a new database status.

**MAINT-002:** Show task title, due date or missing-date label, recorded priority, status and system/room when available. Do not invent dates, priority or risk. Distinguish a recorded urgent priority from overdue timing and from a safety recommendation.

**MAINT-003:** Filter changes update the same surface and query the full matching collection. Never filter only the currently rendered subset while implying a complete result. Show displayed-versus-total counts, load-more/full-result access and a clear-filter action. Preserve canonical sort unless the user selects another supported sort.

**MAINT-004:** “Show urgent only” uses the existing canonical urgent-priority interpretation, with the applied filter labeled. Do not silently combine overdue, high priority and safety risk into a new urgency score. Confirm the precise existing parser semantics during implementation; any discrepancy with this label belongs in §16.

### 9.2 Complete and reschedule

**MAINT-005:** Item selection passes exact identity. Completion sequence: select → gather required inputs → review/confirm → canonical mutation → receipt → reconcile current view. A completed occurrence leaves a pending-only result when it no longer matches. Counts come from authoritative resulting data, not arithmetic decrement. A recurring next occurrence may appear and must be identified accurately.

**MAINT-006:** Reschedule invokes existing maintenance update semantics. Show the current and proposed date and any recurrence consequences required by the domain. Do not treat an operational work-item identifier as interchangeable with a maintenance-task identifier. The adapter must resolve the canonical task and existing synchronization path.

**MAINT-007:** If a date change removes an item from the current filter, show a receipt explaining its new date and reconcile membership. If recurrence scope cannot be determined from the existing domain operation, ask for the supported scope before preparing confirmation; never infer a series-wide change.

### 9.3 Continuation and handoff

**MAINT-008:** “Why is this important?” on a row creates a new grounded response referring to that exact task and its evidence. It does not reset the source filter or start a mutation. Distinguish task instructions from inferred risk and unavailable evidence.

**MAINT-009:** “Open Maintenance” preserves property, representable filters and selected task. Return restores the source result, view and position, then revalidates affected data. See §11 for unsupported context handling.

Maintenance v1 is complete only when this whole interaction chain works; displaying richer cards alone is not completion.

## 10. Reference context and property boundaries

**CTX-001:** Continuations carry source execution/result and explicit selected entity references. Resolve “this task” from explicit selection or one unambiguous candidate, never the first visible row or fuzzy display-name match when several candidates exist.

**CTX-002:** Switching property does not retarget old results or proposals. Historical results keep their original scope visibly labeled. Acting on an older property's result requires returning to that explicit property context and revalidation; new queries use the newly selected property.

**CTX-003:** Filtering away the selected item clears active selection. A prepared proposal retains its explicit target but must visibly name it and revalidate before confirmation. Never substitute another row.

**CTX-004:** Goal continuation uses durable workflow identity where available, independent of conversation view identity. Do not infer permission to create tasks, contact providers or perform external actions from a goal statement.

## 11. Conversation and workspace handoff

**HAND-001:** Handoff logically includes source session/execution/result, property, supported filters/sort, selected record and return position. Use bounded validated context; do not put transcript text, credentials or private proposal fields into URLs.

**HAND-002:** A destination must acknowledge unsupported filters instead of silently dropping them. Preserve representable context and disclose what changed. A missing selected record opens an honest unavailable state or the authorized list, without selecting another record.

**HAND-003:** Returning restores context and refreshes as needed. A direct/deep link without return state still opens a useful domain page. Validate return destinations against supported internal routes; browser history is not authorization.

## 12. Capture and goal design checks

These scenarios validate the shared model now; they are not additional maintenance implementation deliverables.

### 12.1 “I replaced my roof last summer for $14,500.”

- Propose a home event, preserving a date range/precision rather than fabricating an exact date. Where season/year cannot be resolved reliably, retain uncertainty and ask the minimum necessary clarification.
- Show interpreted event, amount/currency, property and date precision with Edit, Confirm and Cancel.
- Editing date/cost returns a new validated proposal. No optional provider or receipt is required unless the canonical record requires it.
- Confirmation persists through the existing capture execution; receipt links to home history and correction.
- Do not also complete a maintenance task or create a warranty unless separately supported, matched and confirmed under applicable rules.
- For compound “I serviced it; was that expensive?” messages, answer and capture can proceed independently. Deduplicate capture against routed command inputs and preserve child-execution identity.
- Asynchronously delivered proposals remain attached to their originating turn; do not steal focus or duplicate an existing candidate. Existing async delivery limitations must be identified before extending that path.

### 12.2 “I'm thinking about selling next year.”

- Use existing goal/DecisionThread semantics to create or attach workflow bookkeeping without adding a material-write confirmation gate, as specified in Message-First §8.5.
- Present a compact goal/progress surface, known target timing, missing context and supported next steps.
- Resume the same goal from another session without duplicating it; a materially ambiguous existing goal prompts selection.
- Confirmation remains required for subsequent consequential domain actions. No automatic bookings, messages, listing changes or invented deadlines.
- The same result, action, context and freshness concepts apply; a goal needs no arbitrary generated UI.

## 13. Attention and next actions

**ATTN-001:** Shared attention surfaces distinguish immediate safety, time-bound obligations, maintenance priority, financial opportunity and uncertain/speculative concern. Reuse authoritative domain assessments; the presentation layer must not invent a universal risk score.

**ATTN-002:** Show why now, relevant source/time, and uncertainty. Missing or unavailable sources cannot imply “nothing needs attention.” Estimated savings are not guarantees and speculative damage is not known damage.

**ATTN-003:** Dismiss, already handled and remind later must have distinct declared effects. UI dismissal cannot mark maintenance complete. Required safety guidance is not suppressed through a generic presentation shortcut.

**ATTN-004:** Cross-domain ranking and all-property aggregation are subsequent scope, pending §16. The maintenance slice uses selected-property canonical task data.

**NEXT-001:** Evaluate supported next actions during response assembly and after material result changes, using capabilities, missing context, workflow and current business state. Reuse deterministic ranking/suppression; no additional LLM call is required by this rule.

**NEXT-002:** Show a small relevant set and allow none. Respect existing contract caps (including per-block action limits and response suggestion limits); do not multiply identical suggestions across blocks. Suppress completed, unauthorized, unavailable and repeated actions, while offering useful missing-context capture where supported.

## 14. Responsive behavior, accessibility and recovery

**ACCESS-001:** At narrow widths use readable stacked task rows; comparisons may retain accessible horizontal structure where necessary. Essential labels, values and actions must not disappear. Do not use hover-only controls.

**ACCESS-002:** All filters, item actions, inputs and confirmations work with keyboard and assistive technology. Use semantic headings/list/table structures, explicit field labels, visible focus and text alongside status colors.

**ACCESS-003:** Announce filter completion, count changes, validation failures and action outcomes without reading the entire result again. After row removal, focus moves to the next logical row action or result heading. Background refresh does not move focus. Receipts do not depend on a fleeting toast or animation.

**REC-001:** Loading, partial read, no matches, unavailable data, permission loss, stale proposal, validation error, write failure and unknown write outcome have distinct actionable states.

**REC-002:** Preserve filters and entered values across recoverable failures. Do not display success before confirmed execution. Do not permit offline/queued mutations in this slice; explain connectivity failures and reconcile submitted operations on reconnect.

**REC-003:** Invalid/unsupported response components show a safe fallback and supported recovery; they cannot expose raw executable payloads or silently masquerade as another result type.

## 15. Acceptance scenarios

| ID | Given / when | Required observable outcome |
| --- | --- | --- |
| A01 | Selected property has open tasks; ask for pending maintenance | One inline result, canonical counts, visible scope and source time |
| A02 | Result is truncated; choose urgent-only filter | Full-scope filtering, same result identity, accurate filtered total and no duplicate list |
| A03 | Type an unambiguous filter refinement | User message retained; target updates with a brief acknowledgement |
| A04 | Several results/tasks could match “this” | Clarification identifies the target before any action |
| A05 | Complete a non-recurring task | Review/confirmation precedes write; receipt; row/count reconcile to pending filter |
| A06 | Complete a recurring task | Domain recurrence runs once; resulting occurrence/counts displayed accurately |
| A07 | Reschedule beyond the current date filter | Reviewed old/new date; successful receipt and correct row membership |
| A08 | Cancel a prepared action | No domain mutation; prior result remains usable |
| A09 | Edit a proposal then submit its old confirmation | Old version rejected; edited validated proposal requires fresh confirmation |
| A10 | Another session changes/completes the task | Revalidation prevents stale write; show current state and required renewed review |
| A11 | Double-click confirm or lose the successful response | One domain effect; reconcile original execution and show truthful outcome |
| A12 | Write succeeds but list refresh fails | Success receipt retained; read-retry offered without repeating mutation |
| A13 | Viewer attempts completion or access is revoked mid-review | Server rejects write; UI reflects current permissions without data leakage |
| A14 | Switch properties while old result/proposal remains | No silent retargeting; explicit original scope and revalidation |
| A15 | Older filter fetch finishes after newer one | Newer scope/result remains displayed |
| A16 | Open Maintenance with filter/selection and return | Context/position restored; changed data revalidated; unsupported context disclosed |
| A17 | Source fails or only partial data is available | Unavailable/partial state, never false empty or “all clear” |
| A18 | Keyboard user completes final visible row | Outcome announced; logical focus retained; receipt accessible |
| A19 | Capture uncertain roof replacement date and edit cost | Precision retained, no premature write, renewed proposal and canonical receipt |
| A20 | Resume a selling goal in another conversation | Same durable goal identity; no duplicate goal or automatic consequential action |
| A21 | No relevant next action exists | Response completes without forced suggestions |
| A22 | Dismiss insight or request reminder | Declared persistence/notification effect; no accidental task completion/reschedule |
| A23 | Reload session or revisit historical result | View continuity where stored; original response meaning retained; freshness visible |
| A24 | Target is deleted or destination cannot represent a filter | Honest missing-target/context limitation; no substituted record |

A01–A18, A21, A23–A24 form the maintenance acceptance set where applicable. A19–A20 and A22 are shared-contract walkthroughs until their subsequent implementations are scheduled. Existing application safeguards remain mandatory in every slice.

## 16. Open decisions and implementation obligations

| Item | Boundary / next step |
| --- | --- |
| Cross-domain attention ordering and property scope | Product decision needed before implementing aggregation; do not choose numerical weights or all-property behavior here |
| Reminder/dismissal duration and persistence per domain | Specify against existing domain policy before exposing either action; not necessary for maintenance complete/reschedule |
| Maintenance filter semantics | Trace the existing parser and domain definitions into typed filters. Preserve canonical meaning; flag discrepancies rather than redefining urgent or pending |
| Reschedule recurrence scope | Verify the maintenance update contract. If series/occurrence semantics remain materially ambiguous, resolve with product before implementing that branch |
| Handoff destination capabilities | Inspect actual route/filter support; add minimal context handling or disclose unsupported state as §11 requires |
| Storage/API design | Map result revisions, view persistence, action dispatch and editable proposal versions onto existing execution/receipt contracts; document required schema changes only after this mapping |

These are scoped decisions and engineering obligations, not approval gates or reasons to defer unrelated implementation. Do not create new infrastructure where existing domain/Ask mechanisms meet the requirement.

## 17. Validation and implementation handoff

This document was checked against the listed FRDs, architecture/plan excerpts, Graphify navigation and directly affected contracts/components. It does not claim runtime execution, current database readiness, or completion of these requirements.

Before code changes, trace maintenance read → typed action → proposal → confirmation → canonical service → recurrence/downstream reconciliation → response refresh → handoff. Update backend contracts, mirrored frontend types, dispatch/rendering and affected documentation together. Reuse the existing confirmation mechanism. If schema changes prove necessary, edit Prisma and generate its client when dependencies are available; the user creates/runs migrations.

Validate implementation primarily through domain/contract review and available lightweight static checks. Use focused environment-independent tests for filter targeting, stale-response ordering, proposal invalidation and reconciliation where available. Do not provision services or browser infrastructure to satisfy this FRD. Record unexecuted runtime/accessibility scenarios honestly, without treating an unavailable environment as a blocker.

Document-review checks: internal links resolve, requirement identifiers are unique, accepted scope is represented, maintenance has an end-to-end acceptance set, and subsequent capabilities are not silently included in its delivery scope.

## 18. Implementation status (2026-09-14)

Two §16 open items were resolved by tracing the code, not by product decision, and neither needs revisiting:

- **Reschedule recurrence scope (MAINT-007).** `PropertyMaintenanceTaskService.updateTask` holds one mutable `nextDueDate` per task row — there is no separate occurrence record. Rescheduling can only mean "change when it's next due"; there is no series-vs-occurrence ambiguity to resolve.
- **"Urgent" filter semantics (MAINT-004).** `highPriorityOnly` in `maintenanceResult()` (`askOrchestrator.service.ts`) matches `URGENT` **and** `HIGH` priority, not `URGENT` alone. Per MAINT-004 this is disclosed, not silently redefined (see below).

Shipped and typecheck/unit-test verified, **not yet browser/E2E-verified**:

| Requirement | What shipped | Where |
| --- | --- | --- |
| MAINT-003 (counts, clear-filter access) | GROUPED_LIST description now labels the priority filter when applied ("Priority filter: urgent and high priority"); "+N more" now links a dedicated "View all in Maintenance" action instead of the unrelated "Create a task" action (previously the only actions[0] candidate, silently wrong for overflow) | `askOrchestrator.service.ts` `maintenanceResult()` |
| MAINT-004 (label filters honestly) | Same description change as above | `askOrchestrator.service.ts` `maintenanceResult()` |
| HAND-001/002 (handoff carries filter state) | "Open Maintenance" / "View all in Maintenance" hrefs now carry `priority=true` / `filter=overdue` — params `MaintenancePageClient.tsx` already read but Ask never sent. `dueSoonOnly`/date/system/room filters still have no destination-page equivalent and remain description-only (acknowledged, not silently dropped) | `askOrchestrator.service.ts` `maintenanceResult()` |
| RES-001/ACT-001/ACT-003 (item-level declared actions, canonical identity) | New `GroupedListItemActionSchema` (`id`, `label`, `message`, `style`) + `entityType` on `GroupedListItemSchema`, mirrored in frontend `types.ts` as `AskGroupedListItemAction`. Maintenance rows carry Complete/Reschedule item actions for open tasks when the viewer can manage them. Buttons call the existing `ask()` path with `launchContext.entityType`/`entityId` set to the exact task — this is the same declared-action shape ACT-001/ACT-003 called out as missing contract work, scoped to maintenance only per §3's delivery boundary (not a generic cross-domain action system) | `ask.contract.ts`, `apps/frontend/src/features/ask/types.ts`, `AskWorkspace.tsx` |
| RES-001 (canonical ID resolution, not fuzzy match) | `maintenanceTaskCompleteResult`/`maintenanceTaskUpdateResult` now resolve `launchContext.entityId` (when `entityType === 'MAINTENANCE_TASK'`) directly against the task list before falling back to fuzzy title matching — previously `launchContext.entityId` reached `resolveAskEntityState`'s confidence scoring but never the handler itself, so a button click with only a canned message ("Complete this task") would have failed to resolve any task via `maintenanceCompletionMatch`'s fuzzy subject-token matching | `askOrchestrator.service.ts` (`launchMaintenanceTaskId`, `maintenanceTaskUpdateResult`, the `maintenance.complete`/`maintenance.update` registrations) |

Verified via: `apps/backend` and `apps/frontend` full `tsc --noEmit` (clean), plus targeted backend unit tests (`askMaintenancePresentation`, `askMaintenanceTaskInput`, `askMaintenanceSuggestedPrompt`, `askSeasonalMaintenance`, `askGovernance`, `askEnvelopeAndRankingBoundary` — 48/48 passing, one test's source-matching regex updated to the new registration line). No browser/Playwright run performed against this change.

**Not yet started:** CONF-003 edit-versioning verification, FRESH-001/002 revalidation-at-confirmation verification, RES-003 filter-refinement-without-duplicate-list (whether `askFollowUpContext.ts`'s existing rewrite path already avoids appending a duplicate card, or needs frontend rendering changes), and the full A01–A18/A21/A23–A24 acceptance-scenario walk.

## 19. Implementation status, round 2 (2026-09-14)

Traced the four items §18 left open. Two turned out to already exist (built generically for every Ask confirmation, not maintenance-specific, predating this FRD); two were real gaps, now fixed.

**Already correct — verified by reading the code, not built this round:**

- **FRESH-001/002 (revalidate before write, invalidate a stale proposal).** `confirmMaintenanceTaskComplete`/`confirmMaintenanceTaskUpdate` (`askOrchestrator.service.ts`) both re-fetch the task at confirm-time and compare `maintenanceTaskVersion(current)` against the version captured when the proposal was shown, throwing `ASK_CONTEXT_VERSION_CONFLICT` on a mismatch. The generic `confirmAskExecution` wrapper catches that and lands the execution on a distinct "This changed before it could be confirmed" terminal state (never a false success).
- **CONF-004/CONF-005 (no accidental double-write, distinct completed/changed states).** `confirmMaintenanceTaskComplete` distinguishes "already completed by this exact execution" (via a `completionIdempotencyKey` stored on the task, replayed idempotently) from "completed or cancelled by someone else" (version-conflict path) — satisfies A06 (recurring completes once), A10 (stale write blocked), and A11 (double-click/lost-response reconciles to one effect) without any change needed.

**Real gaps found and fixed this round:**

- **MAINT-006 (reschedule must show current vs. proposed date and recurrence consequence).** The reschedule confirmation only ever showed the *new* due date. Added a "Current due date" field and, for a recurring task, a "Recurrence" field disclosing that only the next due date changes (consistent with §18's MAINT-007 finding: one mutable `nextDueDate`, no series concept to preserve or break). `askOrchestrator.service.ts`, `maintenanceTaskUpdateResult()`.
- **RES-003/MAINT-003 (filter refinement must not duplicate the list).** Confirmed the gap was real: every message — including "only show urgent" — always created a brand-new `AskExecution` and thus a brand-new full response card; `askFollowUpContext.ts`'s existing rewrite only affected internal routing, never signaled the frontend. Fixed by: (1) a new `isFilterRefinement` flag on `AskFollowUpResolution`, true only for the existing `isFilterContinuation` branch — never for entity/pagination/specialist/monitor continuations, which are legitimately separate answers; (2) a new `continuesExecutionId` field on the response contract (`ask.contract.ts`, mirrored in frontend `types.ts`), populated from that flag; (3) `AskWorkspace.tsx` now drops a superseded execution's card from the live view (nothing is deleted server-side — a session-history reload sees the same collapsed view) and labels the continuation "Updated view" instead of "Cozy response". This is a live-rendering collapse, not literal single-result-identity reuse (RES-001's three-layer model would need a real "current view mutates in place against one persisted result" mechanism to go further — flagged, not built).

**Flagged, not built — needs a scope decision:** CONF-002/CONF-003 (editable confirmation proposals — "Edit" a field, invalidating the old version, before confirming). Checked every confirmation type in the app, not just maintenance: none has an edit affordance today (`ConfirmationCard` in `AskWorkspace.tsx` renders fields as read-only `<dd>` text). Building this is a generic, cross-cutting feature affecting every confirmable command, not a maintenance-only fix, and A09 in the acceptance table depends on it existing at all. Left unbuilt pending an explicit decision on whether it belongs in this slice.

**Acceptance-scenario walk (§15), code-traced this round — no browser/E2E run:**

| ID | Status | Basis |
| --- | --- | --- |
| A01 | Pass (pre-existing) | `maintenanceResult()` already returns one scoped, counted result |
| A02 | Pass | Server-side full-collection filtering pre-existing; duplicate-list issue fixed this round |
| A03 | Pass | "Updated view" label + card collapse, this round |
| A04 | Pass (pre-existing) | `askFollowUpContext.test.js`: entity continuation refuses multi-candidate guesses |
| A05 | Pass (pre-existing) | `confirmMaintenanceTaskComplete` |
| A06 | Pass (pre-existing) | Idempotency key + recurring next-due-date in receipt |
| A07 | Pass | Current/new date shown, this round |
| A08 | Pass (round 5) | `cancelAskExecution` uses a guarded conditional update (`status: 'NEEDS_CONFIRMATION'` in the WHERE), never touches the domain record; `supportsCancelBeforeExecution` is true for every command including both maintenance ones — see §22 |
| A09 | Pass (round 3, concurrency-hardened round 6) | Editable-proposal UI shipped round 3 for maintenance reschedule; round 6 closed a concurrency gap where the edit-vs-edit and edit-vs-confirm races could apply stale input despite the version check — see §23 point 1. This table row was stale after round 3 (still read "Gap") until this correction |
| A10 | Pass (pre-existing) | Version-conflict check in both confirm handlers |
| A11 | Pass (pre-existing) | Confirmation-receipt claim/lease + idempotency key |
| A12 | Pass (round 5, corrected round 6) | Confirmed the underlying gap was real; fixed via `refreshAskExecutionAfterConflict` + `childExecutions` merge (§22). Round 5's fix silently swallowed a refresh failure with no "Saved; list could not refresh" disclosure at all, and also lost `continuesExecutionId` on refresh — both corrected in §23 points 2-3 |
| A13 | Pass (pre-existing) | VIEWER-role rejection in both confirm handler and `confirmAskExecution`'s role-floor check |
| A14 | Pass (round 5) | Deep-link `propertyMismatch` auto-corrects the selected property before loading the exact historical session/execution; combined with round 4's session-staleness guard and confirm-time revalidation — see §22 |
| A15 | Pass (round 4) | Confirmed real (missing item-action disable + no session-staleness guard in `ask()`), both fixed — see §21 |
| A16 | Partial | Filter forwarding fixed this round; return scroll/selection position not verified |
| A17 | Pass (round 5) | Traced the generic skill-context composer: a required-provider load failure sets composed-context status `BLOCKED`, which `askOrchestrator.service.ts` gates on before any presentation code runs — a false empty list cannot reach the homeowner. See §22 |
| A18 | Pass (round 4) | Confirmed real (no post-completion focus target); fixed via `ExecutionCard` extraction — see §21. Announcement was already correct pre-existing |
| A21 | Pass (round 5) | Confirmed real (unconditional suggestions offered even to a VIEWER, or with zero matching tasks); fixed with conditional gating — see §22 |
| A23 | Partial | Reload-consistent view collapse (this round); no staleness/age indicator on a historical result |
| A24 | Pass (pre-existing) | Both confirm handlers explicitly error when the task is missing |

Verified via: `apps/backend` and `apps/frontend` full `tsc --noEmit` (clean), plus 35/35 targeted backend unit tests (`askFollowUpContext`, `askEnvelopeAndRankingBoundary`, `capabilityInvokePolicyEnforcement`, `askMaintenancePresentation`, `askMaintenanceTaskInput`). No browser/Playwright run performed.

## 20. Implementation status, round 3 (2026-09-14): CONF-002/CONF-003 built

§19 flagged editable confirmation proposals as a generic, cross-cutting feature affecting every confirmable command and left it unbuilt pending a scope decision. Built now, deliberately scoped to the one case maintenance v1 actually needs (rescheduling), not a generic per-operation form-field system:

- **Contract**: `AskConfirmationSchema` gained `editableFields` — typed `{ key, label, type: 'DATE', value }` entries, distinct from the existing read-only `fields` display array. `EditAskConfirmationSchema` (`confirmationVersion`, `edits: Record<string, string>`) is the new submit shape — deliberately carries no consent/idempotency key, since editing never performs the domain write itself.
- **Backend**: `editAskConfirmation()` (`askOrchestrator.service.ts`) rejects an edit against a stale `confirmationVersion` exactly like confirming does, validates the new date, then rebuilds the confirmation at `version + 1` — never mutates the open version in place. `POST /ask/executions/:executionId/confirm/edit`. Maintenance's reschedule confirmation now declares `nextDueDate` as its one editable field (its "New due date" row moved out of the static `fields` display into `editableFields`, so it isn't shown twice).
- **Frontend**: `ConfirmationCard` renders each editable field as a value + "Edit" toggle; editing swaps in a date input with Save/Cancel. A validation error retains the typed value (CONF-003) rather than resetting it. The idempotency-key `useState` was previously a one-time lazy initializer keyed off the confirmation version at mount — since editing is the first thing that changes `confirmation.version` while the same card stays mounted, this was changed to a `useEffect` that resyncs whenever the version changes, so a post-edit confirm doesn't reuse a stale key.
- **A09 (acceptance table) is now Pass** for the maintenance-reschedule case specifically: editing the date bumps the version; attempting to confirm with the pre-edit version number is rejected as `ASK_CONFIRMATION_NOT_ACTIVE` (the same generic version-mismatch check `confirmAskExecution` already applied). Not yet true for any other confirmable command — none has editable fields declared.

Verified via: `apps/backend` and `apps/frontend` full `tsc --noEmit` (clean), plus the complete `apps/backend/tests/ask/*.test.js` suite (597/598 passing, 1 pre-existing skip, 0 failures — confirms the ~34 confirmation object literals mechanically updated for the new required `editableFields` field didn't regress anything). No browser/Playwright run performed against the edit UI itself.

## 21. Implementation status, round 4 (2026-09-14): A15 and A18 gaps closed

§19 marked A15 (out-of-order responses) and A18 (keyboard focus after row completion) as unverified gaps. Traced both in `AskWorkspace.tsx`; both were real.

**A15 — two distinct gaps found and fixed:**

- The maintenance item-action buttons (Complete/Reschedule, added in round 1) call `ask()` directly but, unlike every other `ask()`-triggering control in the file (Send, "Try again", the skill-handoff suggestion), had no `disabled={loading}`. `BlockView` now takes an `itemActionsDisabled` prop wired to `loading`.
- A genuine FRESH-003/CTX-002 violation: `ask()` had no guard against its own response landing after the homeowner switched property/session mid-flight. Switching property already resets `executions` and starts a new session (a separate `useEffect`), but the in-flight request's response, when it arrived, was appended into whatever the *current* array was at that moment — leaking an old property's answer into the new property's transcript. Fixed by capturing `requestedSessionId` at call time and comparing it against `activeSessionRef.current` (an existing ref this component already uses elsewhere to track "the current live session") before appending; a stale response is now silently discarded rather than shown.

**A18 — real gap, fixed:** `useAutoFocusFirstControl` only ever fires on a sub-card's *mount* (ConfirmationCard, ClarificationCard, etc.). When a confirmation resolves to COMPLETED, that card unmounts — its focused Confirm button removed from the DOM — and nothing moved focus anywhere afterward, so a keyboard/screen-reader user's focus silently reverted to `<body>`. (Outcome *announcement* was already handled correctly by an existing generic `aria-live="polite"` region — only focus was missing.) Fixed by extracting the per-execution card into its own `ExecutionCard` component (previously inline JSX in a `.map()`, which cannot itself call hooks) with an effect that, once nothing else is claiming focus for that turn (no pending property selection/capture/clarification/confirmation) and this execution was the one just acted on, focuses the first focusable action in the settled result — falling back to the response heading (`tabIndex={-1}`) when a block has no action link.

Verified via: `apps/frontend` full `tsc --noEmit` (clean). No dedicated component tests exist for `AskWorkspace.tsx` (frontend test coverage here is route-matching only); no browser/Playwright run performed against the actual focus behavior or the property-switch race.

## 22. Implementation status, round 5 (2026-09-14): A08, A12, A14, A17, A21 traced

Traced the five remaining "not re-verified"/"plausible pass" rows. Three were genuine passes on inspection; two (A12, A21) were real gaps, now fixed.

**A08 — pass, no change needed.** `cancelAskExecution` (`askOrchestrator.service.ts`) guards its update with `where: { status: 'NEEDS_CONFIRMATION' }` rather than an unconditional write, so it can never race a concurrent confirm into cancelling an already-applied mutation, and it never touches the domain record itself — only the Ask execution's own status. `supportsCancelBeforeExecution` is hardcoded `true` for every entry in `ASK_DOMAIN_COMMAND_REGISTRY`, including `MAINTENANCE_COMPLETE`/`MAINTENANCE_UPDATE`.

**A14 — pass, no change needed.** A deep link whose `initialPropertyId` differs from the currently selected property sets `propertyMismatch`, which forces `selectedPropertyId` to the link's property *before* loading — so acting on an older property's result already requires (and gets) an explicit return to that property's context, matching CTX-002. Combined with round 4's session-staleness guard (no stale cross-property leakage) and the pre-existing confirm-time revalidation (round 2), this holds without new work.

**A17 — pass, no change needed.** Traced `skillContextComposer.ts`: a required context provider's `load()` throwing (or timing out) is caught and sets the composed context's `terminalStatus` to `UNAVAILABLE`/`TIMED_OUT`, which rolls up to an overall `BLOCKED` composed-context status when the failed provider was required. `askOrchestrator.service.ts` checks `composedContext.status === 'BLOCKED'` and short-circuits into an `UNAVAILABLE`/`BLOCKED` operation result *before* any handler (including `maintenanceResult()`) ever runs — a context-load failure cannot reach presentation code that might render it as a false empty list.

**A12 — real gap, fixed.** Confirmed the underlying premise was missing entirely: no mechanism refreshed a *different*, still-visible execution (e.g. the "pending maintenance" list) after a row action's mutation completed elsewhere — MAINT-005's "reconcile current view" step didn't exist, so a completed task kept showing as pending in its original list until the homeowner manually re-asked. Fixed by wiring together two mechanisms that already existed for other purposes rather than inventing new ones:
- `ConfirmCapabilityResult` (confirm-handler return shape) gained an optional `refreshedExecutions?: AskExecutionResponse[]`.
- `confirmMaintenanceTaskComplete`/`confirmMaintenanceTaskUpdate` now call a new small helper, `refreshMaintenanceSourceExecution`, which re-runs `refreshAskExecutionAfterConflict` (already existed, previously only reachable from a capture-conflict error path) against the list execution the row action was clicked from — best-effort: any failure is swallowed so it can never turn a successful mutation into an error (CONF-005).
- The frontend threads a new `launchContext.sourceExecutionId` (the clicked-from execution's own id) through `ask()` when an item action fires, and `updateExecution` now merges `childExecutions` into the existing card with a matching `executionId` instead of ignoring them — the same `childExecutions` slot conversational-capture already populates, reused rather than duplicated. A12 acceptance is now literal: the original list updates in place; nothing is left in a stale pending state.

**A21 — real gap, fixed.** `maintenanceResult()`'s suggestions were an unconditional, hardcoded three-item array — offered even to a VIEWER (who cannot create a task, an authorization the UI itself already enforces elsewhere) and even with zero overdue/due-soon tasks to actually show. Fixed by gating each suggestion on whether it would do something real: "Show overdue tasks only" only when an overdue task exists and the query isn't already overdue-filtered; "What maintenance is due soon?" only with a genuine due-soon task; "Create a maintenance task" only for a contributor/owner and not already mid-creation-flow. An empty array is now a legitimate, reachable outcome.

One test broke and was fixed as part of this round: `askEnvelopeAndRankingBoundary.test.js` asserts an exact regex match against the `maintenance.complete` registration's literal source line — adding the new `sourceExecutionId` argument changed that line's text, so the regex was updated to match.

Verified via: `apps/backend` and `apps/frontend` full `tsc --noEmit` (clean), plus the complete `apps/backend/tests/ask/*.test.js` suite (598 tests, 597 passing, 1 pre-existing skip, 0 failures). No browser/Playwright run performed against the actual list-reconciliation or suggestion behavior.

## 23. External review response (2026-09-14)

An external review of rounds 1–5 raised six findings. Five identified real, confirmed defects (fixed below); the sixth confirmed that this document's own existing "Partial" labeling for A16/A23 was already accurate and needed no correction.

**1. Confirmation editing was not concurrency-safe (CONF-003/A09) — fixed, and a second race was found and fixed alongside it.** `editAskConfirmation`'s final write was an unconditional `update`-by-id after an earlier, separate version read — two concurrent edits could both pass the check and both write, with the loser's response falsely claiming its edit was saved. Fixed by converting to `updateMany` guarded by `parametersJson: { path: ['confirmationVersion'], equals: input.confirmationVersion } }` in the `where` clause (the same JSON-path pattern already used in `adminWorkerJobs.service.ts`), so a losing concurrent edit now fails loudly (`ASK_CONFIRMATION_NOT_ACTIVE`) instead of silently. Investigating this surfaced a second, more serious instance of the identical root cause in `confirmAskExecution` itself: its own version check compared against a snapshot read at the top of the function, but the claim transaction that followed only guarded on `status`, not on that version — a concurrent edit landing in between would go undetected, and the domain write would then apply the stale, pre-edit `parameters` object as if it were the reviewed proposal. Fixed with the identical JSON-path guard added to the claim's own `updateMany`.

**2. A failed refresh was indistinguishable from nothing-to-refresh, so CONF-005's required "Saved; list could not refresh" text could never appear (A12) — fixed.** `refreshMaintenanceSourceExecution` returned `[]` on both "no source to refresh" and "refresh attempt failed." Changed its return shape to `{ refreshedExecutions, attemptedAndFailed }`; both `confirmMaintenanceTaskComplete` and `confirmMaintenanceTaskUpdate` now push a `LIMITATION` block reading "Saved; list could not refresh" plus a concrete, non-repeating recovery suggestion ("What maintenance is pending?") onto the receipt when `attemptedAndFailed` is true. The mutation's own success is never touched by this — only disclosure of the stale list.

**3. Refreshing an execution silently dropped `continuesExecutionId`, un-suppressing an already-superseded card (RES-003/MAINT-003) — fixed.** `refreshAskExecutionAfterConflict`'s `resultJson` overwrite never read or preserved the field that marks an execution as continuing (superseding) an earlier one. Refreshing a filter-continuation execution as part of the new A12 mechanism would silently clear that field, making the frontend's duplicate-card suppression treat the original, now-stale card as visible again. Fixed by reading the row's existing `continuesExecutionId` before overwriting and carrying it forward unchanged. The review's second point here — that reusing this function generally conflates "original response" and "current data" (RES-001's three-layer model) — is accepted as a real, pre-existing characteristic of `refreshAskExecutionAfterConflict` (it predates this FRD, originally built for capture-conflict recovery) rather than something fixed in this pass: for the specific MAINT-005 reconciliation use case, MAINT-005 itself explicitly calls for the current view to update in place ("reconcile current view"), so overwrite-in-place is the intended behavior there specifically, not a bug. A fully general original/current versioning model (e.g. a separate immutable snapshot per execution) would be a materially larger undertaking than this fix and is not implemented.

**4. Filter refinement deleted the superseded execution's own question from view, not just its answer (RES-001) — fixed.** The duplicate-card suppression built in round 4 removed the entire superseded `<article>` from the live render, including its user-message bubble — losing conversation history, not just avoiding a duplicate list. RES-001 requires the original response to remain retained ("refresh must not silently overwrite its meaning"). Fixed: the superseded execution's question bubble now always renders; its response content collapses behind a `<details>` disclosure ("Superseded by a refinement below · view original response") instead of either disappearing or rendering a second live, actionable list. Item actions inside a collapsed historical view are inert (`itemActionsDisabled`), since acting on stale data still requires seeing the current state first.

**5. The declared item-action contract carried no interaction type or registered operation (ACT-001/ACT-003) — partially fixed.** `GroupedListItemActionSchema` was `{ id, label, message, style }` — a canned message string with no typed identity, which is real: ACT-001 requires interaction type, domain operation and target to be separated, and ACT-003 requires the registered operation to be part of the contract. Added `interactionType` (the full ACT-001 enum, so a future `FILTER_RESULT`/`REMIND_LATER` item action needs no schema change) and `operationId` (a plain string, deliberately not importing the `AskOperationId` union from the services layer into this contract module) to the schema, and populated both on the two existing maintenance item actions (`MUTATE_RECORD` / `MAINTENANCE_TASK_COMPLETE` and `MAINTENANCE_TASK_UPDATE`). **Not fixed, and not attempted in this pass**: the review's second point that dispatch still routes through the generic `ask()` text pipeline rather than a typed per-interaction-type dispatcher, and that inline filter/refresh item actions and a per-item "why is this important?" explanation (MAINT-008) remain unbuilt. Building a genuine typed dispatcher matching all nine ACT-001 interaction types is a materially larger, cross-cutting undertaking than annotating the existing mechanism, and was not undertaken here; the server already owns authorization/validation/execution regardless of how the client labels the action (ACT-002), so this is a contract-completeness gap, not a security or correctness one.

**6. Handoff and historical freshness remain partial — confirmed accurate, no change.** The review noted this document already discloses A16/A23 as "Partial" for full filter/selection/return-position continuity and historical-freshness presentation. That disclosure is correct and stands; no code changed for this point.

Verified via: `apps/backend` and `apps/frontend` full `tsc --noEmit` (clean), plus the complete `apps/backend/tests/ask/*.test.js` suite. The new JSON-path concurrency guards (points 1) rely on a pattern with an existing working precedent elsewhere in this codebase (`adminWorkerJobs.service.ts`) but were not exercised against a live database — the project's configured dev Postgres was not reachable in this environment, and per this FRD's own §17 guidance, no database was provisioned to satisfy that. This is a real, disclosed verification gap for point 1 specifically. No browser/Playwright run was performed against any of these six fixes.

## 24. External review response, round 2 (2026-09-14)

A follow-up review of §23 found the edit-vs-confirm race (point 1) was only half closed, plus one new gap. Both fixed.

**Edit-vs-confirm race, second half.** §23's fix guarded `editAskConfirmation`'s write on `parametersJson.confirmationVersion` matching, but not on `status`. `confirmAskExecution`'s claim transaction moves `status` to `RUNNING` without ever touching `confirmationVersion` — so once a confirm had claimed the execution, a concurrent edit's version-only guard still matched (the version genuinely hadn't changed) and could silently overwrite `parametersJson`/`resultJson` while the confirmed mutation was executing or had already completed, corrupting the row into an inconsistent completed-but-shows-a-confirmation-card state. Fixed by adding `status: 'NEEDS_CONFIRMATION'` to the same guarded `where` clause — any status transition away from `NEEDS_CONFIRMATION` (claimed, completed, expired) now makes the edit's write match nothing, exactly like a superseded version does.

**Editing did not invalidate consent (CONF-003).** `ConfirmationCard`'s `consent` checkbox state was never reset when `confirmation.version` changed — its resync effect only touched `editValues`/`editingKey`/`editError`/the idempotency key. A homeowner who had already checked consent, then edited the proposed date, could click Confirm against the edited proposal without ever re-affirming consent for it. Fixed by adding `setConsent(false)` to that same version-keyed effect.

Verified via: `apps/backend` and `apps/frontend` full `tsc --noEmit` (clean), plus the complete `apps/backend/tests/ask/*.test.js` suite. Same live-database caveat as §23 applies to the status-guard change. No browser/Playwright run performed.

**On the review's third point** ("documenting a gap does not resolve it," re: typed action dispatch, inline filter/refresh controls, item-level explanations, original/current response separation, full handoff/freshness): agreed as a general principle. These remain genuinely unbuilt, not merely undocumented, and each is a materially sized feature in its own right rather than a bug fix — building all of them in one uncoordinated pass risks the same kind of half-finished, re-discovered-later defects this review cycle has been finding. Which of these (if any) to build next is a scope/priority decision, asked of the user rather than assumed. The user chose three: typed action dispatch, inline filter/refresh controls plus item-level explanations, and original/current response separation — built in §25.

## 25. Typed dispatch, inline controls, and original/current separation (2026-09-14)

Three of the five items §24 left as an open scope question, built this round.

**Typed action dispatch (ACT-001/ACT-003).** `GroupedListItemActionSchema.operationId` (added §21) was previously only decorative metadata — dispatch still relied on free-text pattern matching over the canned message, same as any other turn. Added `launchContext.operationId` to the request contract and a `declaredItemActionOperationId` check in `createAskExecution`, validated against `ASK_OPERATION_DEFINITIONS` before use, at the top of the existing `forcedOperationId` priority chain (the same mechanism `focusedOperationForLaunchContext` already uses for Home Actions/HVAC/inventory launch contexts — reused, not a new dispatcher). The frontend now sends every declared item action's own `operationId` through `launchContext`, so a click routes directly to its registered operation instead of depending on NLU correctly re-deriving it from text. This is a routing hint only, not an authorization bypass (ACT-002) — every role/target/confirmation check downstream of operation selection is unchanged.

**Inline filter chips and item-level explanations (ACT-001 FILTER_RESULT; MAINT-008).** Added a declared `filters` array to `GroupedListBlockSchema` (`{ id, label, message, active }`); `maintenanceResult()` populates four (All open / Overdue / Due soon / Urgent) with `message` set to phrasing `askFollowUpContext.ts`'s existing filter-continuation matcher already recognizes, so a chip click reuses the same server-side full-collection re-query and RES-003 duplicate-card suppression as typing "only show overdue" — no new dispatch path, just a clickable affordance for an existing one. Rendered as a chip row under the block header, `active` chip disabled and visually distinct. Also added a "Why is this important?" item action (`CONVERSATION_CONTINUE`) to every open maintenance row, available to a VIEWER (unlike Complete/Reschedule) since it performs no mutation — the message quotes the exact task title so `groundedGuidanceResult` (which takes no entity-id parameter at all, only free text) has enough context to ground the answer; declaring `operationId: 'GROUNDED_GUIDANCE'` and forcing it (per the typed-dispatch point above) avoids the message accidentally matching the generic maintenance pattern for a task titled e.g. "Annual maintenance inspection."

**Explicit refresh control (FRESH-001/RES-004; ACT-001 REFRESH).** Added `POST /ask/executions/:executionId/refresh`, exposing `refreshAskExecutionAfterConflict` (previously reachable only from a capture-conflict error path) as a homeowner-initiated action. A small "Refresh" button now sits in every response card's header, disabled while refreshing or while another request is in flight.

**Original/current response separation (RES-001).** The three-layer model requires an execution's original response to remain retrievable after a refresh, not silently overwritten. Rather than a new database column on the high-traffic `AskExecution` table (real migration risk on a row written on every single turn), the original snapshot is stored as a new key, `originalResponse: { blocks, observedAt }`, inside the *existing* `resultJson` JSON blob — no schema change, no `prisma db push` required for this to take effect. A new shared helper, `preservedOriginalResponse()`, is called at all four `resultJson` write sites (initial creation, `refreshAskExecutionAfterConflict`, `confirmAskExecution`'s completion write, `editAskConfirmation`'s write): it reuses whatever `originalResponse` a row already has, or stamps one fresh only if this is the row's first-ever result. The frontend shows a "View original response" disclosure whenever `originalResponse` exists and the row has actually changed since creation (`updatedAt !== createdAt`), keeping the common never-refreshed case uncluttered. **Not done**: `confirmAskExecution`'s own expiry/conflict error-path writes do not yet call the preservation helper (lower-traffic edge-case terminal states, not exercised by the maintenance flows this session built); a fully general "current view" layer (client-side filter/sort/expansion state independent of a server re-query) is not built — for this architecture, "current view" and "current data" remain the same thing, refetched together, which is disclosed rather than claimed as fully separated per RES-001's literal three distinct layers.

Verified via: `apps/backend` and `apps/frontend` full `tsc --noEmit` (clean, including mechanical `filters: []` insertion across the 55 pre-existing `GROUPED_LIST` construction sites this required, the same pattern as `editableFields` in §20), plus the complete `apps/backend/tests/ask/*.test.js` suite. No browser/Playwright run performed against any of these — in particular, the filter chips' and "why is this important" action's actual NLU routing behavior, and the refresh button's real network round-trip, are unverified live.

## 26. Filter chip and refresh correctness fixes (2026-09-14)

§25 shipped filter chips, item explanations, and an explicit refresh control without fully working through their interaction with the existing follow-up-resolution machinery. A review found three real defects; all three shared enough of a root cause (declared controls weren't actually bound to the execution they were rendered on) that fixing findings 1 and 2 together was more correct than fixing either alone.

**1 & 2. Filter chips couldn't clear a filter, and weren't bound to their source result.** Two compounding bugs in the same mechanism:
- `askFollowUpContext.ts`'s filter-continuation branch always concatenated the prior turn's raw text with the new message (`"${prior.message}. ${input.message}"`). Starting from "Show overdue maintenance" and clicking "All open" produced "Show overdue maintenance. Now show all open maintenance tasks" — which still contains "overdue," so `maintenanceResult()`'s regex-based flag parsing kept the overdue filter applied despite the click intending to clear it.
- `findRecentPriorExecution` always resolved against "the most recent execution in this session," with no way to pin a specific one. The frontend's `onFilterClick` also never told the server which card the click came from at all. Combined, after any intervening turn, clicking a filter chip on an older result could silently resolve against the wrong prior execution.

Fixed together: `resolveAskFollowUpMessage` and `findRecentPriorExecution` gained an optional `declaredSourceExecutionId`/`pinnedExecutionId`, sourced from `launchContext.sourceExecutionId` (which the frontend's `onFilterClick` now actually sets, fixing point 2). When present, resolution targets that exact execution — scoped to the same session/property/reusable-status bounds as before, just pinned instead of "most recent" — and a pin that fails to resolve returns no continuation at all rather than silently falling back to the recency heuristic (fails closed, not wrong). When present, the filter-continuation branch also skips concatenation entirely and uses the chip's message as-is (fixing point 1): a declared chip is a complete, self-sufficient specification of the filter state, unlike an organic typed follow-up ("only show urgent" typed after "show plumbing maintenance"), which still needs the prior text's context and still concatenates exactly as before — confirmed unchanged against the existing `askFollowUpContext.test.js` coverage for that case. A known, disclosed trade-off: because a chip's message no longer carries the prior turn's scope/room words, clicking a filter chip after establishing a scope via free text (e.g. "show plumbing maintenance" then "Overdue") now resets scope rather than preserving it — chips only replace the status/priority dimension they represent.

**3. Refresh had no session-staleness guard.** The explicit "Refresh" button called `updateExecution(response.data)` unconditionally, unlike `ask()`, which (since round 4) discards a response if the homeowner switched property/session while it was in flight. Fixed identically: `ExecutionCard` now receives `activeSessionRef` and compares it against the execution's own `sessionId` before merging a refresh response, discarding silently on a mismatch.

Verified via: `apps/backend` and `apps/frontend` full `tsc --noEmit` (clean), plus the complete `apps/backend/tests/ask/*.test.js` suite — including re-confirming the pre-existing filter-continuation-concatenation test still passes unchanged (it has no `declaredSourceExecutionId`, so it correctly stays on the concatenation path this fix preserves for organic follow-ups). No browser/Playwright run performed; the actual chip-click round trip remains unverified live.

## 27. Response-history preservation, explicit view state, and handoff reconciliation (2026-09-14)

An external review found §25's `preservedOriginalResponse()` covered only success/refresh/edit paths, that "current view" and "current data" (RES-002/RES-003) were never actually separated as §25 disclosed, and that the Ask→Maintenance handoff (§9.3, §11) silently dropped filters it could not carry over and never revalidated a source result after a Maintenance-side edit. This closes all three, in the order the review itself recommended: preservation first, then explicit view state, then handoff reconciliation built on top of it.

**1. Response-history preservation, every outcome (RES-001).** `preservedOriginalResponse()` is replaced by `preservedExecutionHistory(existingResultJson, freshBlocks)`, applied at all 24 `resultJson`-writing sites in `askOrchestrator.service.ts` (verified by exhaustive script, zero remaining), not just the four §25 covered. It returns `{ originalResponse, continuesExecutionId }`, spread directly into each write:
- an already-stamped `originalResponse` on the row survives forever — success, refresh, edit, expiry, conflict, cancellation, and recovery writes all preserve it identically;
- a row with no stamp yet but a real previous answer in `resultJson.blocks` promotes that answer to `originalResponse`, so an expiry/conflict/cancellation write can never mislabel its own error/expired blocks as the "original" (the review's specific complaint about the `confirmAskExecution` conflict path at the old line 10935);
- only a row with neither an existing stamp nor a previous answer (a genuinely first-ever write) stamps the fresh blocks as original.

`requestAskCorrection`, which creates a new execution row rather than updating one, calls `preservedExecutionHistory(null, ...)` — correctly starting fresh rather than inheriting a prior row's history. Historical controls remain non-executable and access/deletion rules are unchanged; this only changes which blocks are labeled `originalResponse`, never who can see or act on a row.

**2. Explicit view state, separate from data (RES-002/RES-003/RES-004).** Per the user's storage guidance ("no new table is automatically necessary... existing execution JSON and appropriately scoped view storage may be sufficient"), view state is stored as a new `viewState` key inside the existing `parametersJson` blob (internal) and mirrored into `resultJson`/the response contract (public), not a new Prisma model or column — no `prisma db push` required. Shape (`MaintenanceViewState`): `{ resultId, domainScopePhrase, dateScopePhrase, statusFilter, selectedTaskId, revision }`.
- `resultId` is a stable identity for the interactive result, independent of the execution row it currently lives on — minted once (`randomUUID()`) and carried forward across every filter-chip turn that continues the same result; only "Clear all filters" or a genuinely new question mints a new one.
- `mergeMaintenanceViewContinuation(priorViewState, message)` (extracted from `maintenanceResult()`, unit-tested directly) is the one place chip semantics are decided: the four status chips (All open / Overdue / Due soon / Urgent) retain the prior turn's `domainScopePhrase`/`dateScopePhrase` and replace only the status dimension — implementing the user's explicit worked-example decision that "All open" retains HVAC and the date scope rather than clearing them. A fifth chip, **Clear all filters** (`/\bclear all filters\b/i`), is the only control that resets everything, added to the GROUPED_LIST block's `filters` array whenever any scope/date filter is active.
- `revision` increments on every write to the same `resultId`, giving a basis for a consumer to detect a stale copy of a result (the client-side comparison-and-reject using this field is not yet wired — see below).
- `selectedTaskId` is carried in the shape and cleared on "Clear all filters," but no click-to-select gesture exists yet to set it from the UI — the field is structurally ready, not yet driven live.
- `maintenance.status`'s capability handler loads the prior view state via `loadMaintenanceViewState(sourceExecutionId, userId)` (reading `parametersJson.viewState` off the pinned source row, scoped to that user) when `launchContext.sourceExecutionId` is present, so a chip click re-queries with the merged, structured filters rather than re-parsing concatenated raw text.

**Disclosed as not built**, per this session's practice of disclosing rather than overclaiming: expanded-row/pagination-position tracking (no UI concept for it exists anywhere in the app yet); automatic client-side reload-restoration of `viewState` (exposed on the contract, not yet auto-reapplied on mount); end-to-end revision-based staleness rejection (the `revision` field is computed, stored, and incremented server-side, but no client comparison-and-reject logic consumes it yet); a real selection gesture for `selectedTaskId`.

**3. Handoff and return reconciliation (HAND-001–003).** The Maintenance page gained two new URL filters that were previously silently dropped at handoff: `filter=due-soon` (matching the backend's 30-day window exactly) and `system=<term>` (case-insensitive substring match against title/description/assetType/serviceCategory), both threaded through `splitAndSortTasks`'s new `dueSoonOnly`/`systemScope` options and `MaintenancePageClient.tsx`'s URL parsing. `maintenanceHrefParams` now sets both when applicable, alongside the pre-existing `priority`/`filter=overdue`. Date-range and room-scope filters still have no destination equivalent and are **not** silently dropped: the GROUPED_LIST block's description text now explicitly names which active filter(s) "will not carry over to the Maintenance page" whenever a timeframe or room scope is set, so the disclosure happens at the Ask side before the homeowner ever navigates, not just left implicit in the original filter list.

On return, `AskWorkspace.tsx`'s session-restoration effect now calls `api.refreshAskExecution(initialExecutionId)` after scrolling the return anchor into view, replacing the restored card with a freshly re-queried one — revalidating the source result against current data (e.g., a task rescheduled out of "due this month" in Maintenance is reflected, with an updated count) rather than relying on the stored history snapshot alone, which was the review's specific complaint about the old load-from-history-only behavior. This does not yet select a substitute task if the previously-selected one was deleted or access was revoked; it surfaces whatever the revalidated query now returns and relies on the "no substitute selection" default rather than guessing.

**4. Tests.** `apps/backend/tests/ask/maintenanceViewStateContinuity.test.js` (new): 3 tests for `preservedExecutionHistory` (fresh stamp, permanent retention, never mislabeling a fresh error as original) and 4 for `mergeMaintenanceViewContinuation` (no-op without prior state; retain-domain-and-date-while-replacing-status; switching status correctly clears the prior status word rather than appending; "Clear all filters" opts out of merging) — both functions are pure and imported directly, no Prisma mocking needed. `apps/backend/tests/ask/askFollowUpContext.test.js` gained 2 tests for stale-response/pinned-resolution rejection: a declared `sourceExecutionId` resolves against that exact row without concatenating its message, and a declared `sourceExecutionId` that fails to resolve fails closed (no continuation) rather than falling back to "most recent in session." `captureConfirmWriteSafety.test.js`'s hardcoded source-slice window was widened (800→1700 chars past the conflict-catch anchor) to account for the added preservation call; the assertion itself (that the write still reloads via `findFirstOrThrow` before applying its conflict update) is unchanged. **Not added**: a dedicated automated test for the Maintenance handoff URL construction (due-soon/system param forwarding) — verified by `tsc --noEmit` and manual code reading only, since a lightweight test target (without heavy page-level DOM/router mocking) wasn't identified.

## 28. Refresh view-state loss, invisible return-trip failures, and view-state status honesty (2026-09-14)

A follow-up external review of §27 found the new view-state mechanism was not actually reached by every caller that needed it, and that the return-trip revalidation's own failures were still invisible.

**1. Refresh lost the stored view context (RES-002/RES-003).** `refreshAskExecutionAfterConflict` (the one function behind the explicit Refresh button, the automatic post-mutation refresh, and the Ask-workspace return-trip revalidation) called `executeOperation` with no `launchContext` at all. `maintenance.status`'s capability handler only loads the stored `viewState` via `loadMaintenanceViewState` when `envelope.launchContext?.sourceExecutionId` is present (§27), so every refresh silently discarded domain/date scope, minted a fresh `resultId`, and reset `revision` to 1 — exactly the review's cited "HVAC this month → Urgent → Refresh" regression. Fixed by passing `launchContext: { surface: 'ASK_REFRESH', sourceExecutionId: execution.id }` — the row refreshes against its own already-stored view state, so scope, `resultId`, and `revision` continuity now survive a refresh, an automatic post-mutation refresh, and the Maintenance return-trip revalidation identically, since all three share this one function. **Known narrow trade-off, not fixed here:** `isClearAllFilters` in `mergeMaintenanceViewContinuation` is decided by re-matching `/\bclear all filters\b/i` against the stored `execution.message` text; refreshing a row that was itself created by a "Clear all filters" click re-matches that same phrase every time, so that one row's `resultId` is re-minted on every subsequent refresh instead of staying stable. Every other row (the vastly more common case — any status/domain-specific result) is unaffected, since its stored message never matches the clear-all phrase. Solving this fully needs a caller-supplied "this is a refresh, not a new filter turn" bit threaded independently of message content, which was judged out of scope for this round's three findings.

**2. Return-trip refresh failures were invisible (FRESH-001/HAND-003).** `AskWorkspace.tsx`'s return-trip revalidation (§27) caught failures with `.catch(() => undefined)`, leaving the pre-edit view visible with no signal that revalidation had failed at all. Fixed: the catch now classifies the failure via the same `askFailureCode()` helper already used elsewhere in this file, and a new `returnRevalidationIssue` state feeds `ExecutionCard`'s existing `refreshError`/retry UI (the one the explicit Refresh button already renders — reused, not duplicated) as that card's *initial* error state. A generic failure shows the existing retry-capable message; `ASK_EXECUTION_NOT_FOUND`/`ASK_PERMISSION_REQUIRED`/`ASK_PROPERTY_NOT_FOUND` (access or the row itself genuinely gone) show a distinct "could not be confirmed as current — it may have been removed, or your access to this home may have changed" message with the Refresh button disabled, since retrying an access-loss failure would just fail identically. The same access-loss classification and disabled-retry behavior was also applied to the manual Refresh button's own failure path, which previously showed the same generic message and an always-enabled retry regardless of cause.

**3. View-state/handoff completion scope confirmed, not changed.** The reviewer's third point restated §27's own disclosed gaps (no click-to-select gesture for `selectedTaskId`; no client-side revision-based staleness rejection; no expansion/pagination-position tracking; no automatic reload-restoration of `viewState`) as still-open rather than as a new defect — §27 already disclosed each of these explicitly rather than claiming RES-002 through RES-004 fully closed. No code change corresponds to this point; the disclosure stands as previously written, now cross-referenced here so it is not mistaken for something this round's fixes closed.

Verified via: `apps/backend` and `apps/frontend` full `tsc --noEmit` (clean); the complete `apps/backend/tests/ask/*.test.js` suite (unchanged pass count from §27, since the two fixes here reuse `mergeMaintenanceViewContinuation` and `askFailureCode` exactly as already tested, without new branches inside either). **Not added**: a dedicated test exercising `refreshAskExecutionAfterConflict`'s self-referencing `launchContext` end-to-end — doing so would require building new Prisma-mocking test infrastructure for a function no existing test file touches, which was judged disproportionate to a one-field fix; verified instead by code reading and by the existing `mergeMaintenanceViewContinuation`/`loadMaintenanceViewState` unit coverage of the logic it now actually reaches. No browser/Playwright run performed; the disabled-Refresh-button-on-access-loss state and the return-trip error message are both unverified live.

Verified via: `apps/backend` and `apps/frontend` full `tsc --noEmit` (clean); `apps/frontend` Jest for the touched Maintenance-page files (34/34 passing); the complete `apps/backend/tests/ask/*.test.js` suite run twice — once mid-round (597/598 passing, 1 pre-existing skip, one confirmed-flaky unrelated test in a from-scratch full run that passed cleanly in isolation) and once as a final combined check after all of this section's changes. No browser/Playwright run performed against any of this; the chip-click merge behavior, the Clear-all-filters control, the due-soon/system Maintenance filters, and the return-trip revalidation are all unverified live.


## 29. Completed review corrections: refresh lifecycle and local view continuity (September 14, 2026)

This section supersedes the remaining-fix disclosures in §§27–28 for the four issues raised in the latest review. It describes implemented behavior, not a claim that later-domain portions of this FRD or live runtime acceptance have been completed.

### Refresh outcomes and access loss

Refresh issues are controlled by `AskWorkspace` and rendered through `ResultRevalidationBoundary`; they are not copied into mount-only component state. An asynchronous return-refresh failure is therefore visible after the result card has mounted. Starting a retry clears the previous transient error, and successful revalidation leaves no stale error message. Pending revalidation disables conflicting item actions and filters.

Access-loss failures remove affected property results, original snapshots, proposal inputs and actions from the active transcript state, clear the session's local view metadata, and remove affected pending-work entries. Cards show an unavailable notice with no record content or actionable controls. In-flight responses for that denied property cannot repopulate it. Existing server authorization remains authoritative; browser state grants no permissions.

The manual, return and source-result refresh paths share the same backend read mechanism. Frontend request tokens cover session switches and newer result requests; tokens cannot become valid again after resetting a session. Revision-aware merges reject older result revisions, including child executions returned after a mutation. The backend refresh write uses conditional timestamp/status/revision checks so a slower read cannot replace a newer saved result or command transition.

### Stable identity and explicit refresh intent

Maintenance continuation now distinguishes `FILTER` from `REFRESH`. Refreshing a stored “Clear all filters” message does not replay a new filter command. Clearing filters and refreshing both retain the existing result identity; only a genuinely new result receives a new identity. Stored domain/date scope continues to drive the read, and successful refresh advances the revision.

### Local view state and handoff

`resultViewState.ts` and `useResultView.ts` keep selection, expanded task details, visible item counts per section and the return offset separate from server query/data state. Only identifiers and UI preferences are stored in browser session storage, keyed by session, property and stable result identity; response content is never copied into that store. Cross-device synchronization is not required.

The Maintenance result now provides Select task, Show/Hide details and Show more controls. Pagination here exposes more of the already-returned section; backend truncation still has an honest full-result Maintenance link. Filtering is still performed against the canonical full collection, not this displayed page. Restoring a session or replacing an execution with a refinement of the same result restores the local controls. Reconciliation clears a selected task or expanded detail when it leaves the returned result instead of selecting a substitute. The canonical server sort is retained; no new user sort policy is introduced.

Maintenance links carry supported source filters and the explicit selected task (a row-specific task link takes precedence over selection). Return anchors restore the selected row/focus when it remains present, otherwise the saved response position, and revalidate the source result. The last active session/result can also resume on ordinary same-tab reload after an authorized history load. Deleting a conversation clears its local result metadata; authorized history loads prune metadata for results no longer returned. Existing disclosed limitations for destination date/room filters remain visible at handoff rather than silently changing their meaning.

The previous server `selectedTaskId` field is not the authority for local selection: the implemented local `ResultView.selectedTaskId` owns it and supplies exact task identity for handoff and unambiguous selected-task continuations. This avoids turning transient browser selection into domain knowledge or requiring a new database schema.

### Validation

Focused environment-independent tests cover error props arriving after mount, access-loss redaction, restoration of selection/expanded details/page, selection removal after filtering, session cleanup, stale revision rejection, request invalidation, original-response preservation, filter merging, and refresh after Clear all filters. Validation completed: backend and frontend `tsc --noEmit --incremental false` passed; 30 focused backend tests passed; 16 frontend tests across four suites passed (including the seven new result-continuity component/helper tests); `git diff --check` passed. Existing domain authentication, confirmation and mutation paths remain in place; no migration or service setup is introduced.

Browser navigation against a running application and live-database race execution were not performed. These limitations must remain distinguished from the component tests and static/code-path checks recorded for this change.

## 30. Declared-action routing, unvalidated return link, system-scope handoff drift, and organic-refinement identity (2026-09-14)

A further external review found four defects independent of §§27–29's refresh/view-continuity work: two in routing/handoff (one security-relevant), one in cross-page filter membership, and one in the same declared-vs-organic distinction §26 introduced but didn't fully thread through.

**1. "Why is this important?" wasn't reliably bound to the selected task (MAINT-008/CTX-001).** Two compounding defects, verified by reproducing the reviewer's exact example ("Why is 'Annual maintenance inspection' important?" routing to MAINTENANCE_STATUS instead of GROUNDED_GUIDANCE):
- `createAskExecution`'s `shouldForceOperation` gate applied the same conservative "only override when the classifier found nothing confident" rule to every source of `forcedOperationId`, including `declaredItemActionOperationId` — despite that variable's own comment already calling it "the highest-priority source here, since it is server-declared authoritative identity... not an inference." A confidently-but-wrongly-routed message could silently override a declared control. Fixed by adding `declaredItemActionOperationId` to the gate's unconditional-force OR-clause, alongside the existing REMOTE_FALLBACK/`contextualOperationId` conditions (which keep their narrower, intentionally "soft nudge" behavior — this fix does not touch `followUp.forcedOperationId`'s or the capability-hint's existing gating, only the one signal documented as needing none).
- Even once GROUNDED_GUIDANCE is correctly selected, `groundedGuidanceResult` dropped the launch entity id entirely — `answerGroundedAsk` only ever saw free message text and selected facts across the WHOLE property, so two tasks sharing a near-identical title were indistinguishable to it. Rather than changing `answerGroundedAsk`'s Gemini-backed claim-selection pipeline (out of scope for this fix, and higher-risk), `groundedGuidanceResult` now resolves the exact task record (scoped to the launch `entityId`/propertyId) when present, folds its title/category/assetType/room into the question text sent onward (so the existing token-overlap fact selector can actually favor the right system's facts), and adds a dedicated "Maintenance record (exact task)" evidence line naming the specific row. A missing/inaccessible task falls back to the prior message-only behavior rather than failing the turn.

**2. Maintenance accepted an unvalidated `returnTo` (HAND-003, security).** `MaintenancePageClient.tsx`'s back link rendered the raw `returnTo` query parameter as its `href` with no validation, while `resolveDashboardBackHref`/`resolveToolReturnHref` (`backNavigation.ts`) already exist and are used by every other tool page specifically to constrain a return link to an in-app `/dashboard` path and block open redirects. Fixed by routing `returnTo` through `resolveDashboardBackHref(returnTo, '')`: a valid in-app path is used as before, and an invalid one now falls through to the page's other back-link branches (guidance continuity, `from=status-board`/`seasonal`/`risk-assessment`) instead of rendering an attacker-controlled destination.

**3. A system-filter handoff could silently change result membership (HAND-002/A16).** Ask's HVAC scope matches any of `hvac`, `furnace`, `air conditioner`, `heat pump`, `boiler` across eight fields (title, description, category, asset type, service category, inventory item, room, season); the handoff sent only `system=hvac`, and the Maintenance page matched the single literal word `hvac` against four fields (title/description/assetType/serviceCategory) — so a furnace-only task could appear in Ask's result and vanish after "Open Maintenance," with no disclosure. Two changes, since full symmetry isn't achievable (the Maintenance page's task list has no `category`/room/season/inventory-item data available client-side at all — a data-shape gap, not just a missed field reference, and out of scope to fix by widening an API response here): the handoff now sends the whole alias group as a comma-joined `system=hvac,furnace,air conditioner,heat pump,boiler`, and `splitAndSortTasks`'s `systemScope` filter matches on any of them (closing the gap for the common case where the synonym appears in one of the four available fields); and the GROUPED_LIST description now explicitly discloses, whenever a system/category filter is active, that it "carries over as an approximate keyword match there, so a few tasks may appear or disappear" — distinct from the existing "will not carry over at all" disclosure for date-range/room, since this filter genuinely does carry over, just imprecisely.

**4. Organic typed refinements didn't retain stable result identity (RES-001/RES-003/A03).** `askFollowUpContext.ts`'s filter-continuation branch already discovers `sourceExecutionId` correctly for an organic typed refinement (e.g. typing "only show urgent tasks" after a maintenance list, no chip clicked) — but `createAskExecution`'s dispatch call only ever forwarded the CLIENT's own `launchContext`, which carries no `sourceExecutionId` for a typed message (only a declared chip sets that itself). `maintenance.status`'s handler only loads stored `viewState` when `launchContext.sourceExecutionId` is present, so every organic refinement minted a fresh `resultId` and reset `revision` — and since `resultViewState.ts` (§29) keys local selection/expansion/pagination by `resultId`, those controls reset instead of updating in place, exactly for the one continuation path (typed, not clicked) that previously had no coverage. Fixed by merging `followUp.sourceExecutionId` into the effective `launchContext` sent to `executeOperation`, preferring an already-client-declared one when present (for a declared chip, the two are already the same value, since pinned resolution found the row by that id in the first place — this only fills the gap for organic follow-ups, and does not change declared-chip behavior).

**Tests.** Added two `splitAndSortTasks` tests in `taskDisplay.test.ts` for the comma-joined `systemScope` matching (multi-term alias match, and the single-bare-term case unchanged). **Not added**: a test for the `shouldForceOperation` gate fix or the organic-refinement `launchContext` merge — both are local consts inside `createAskExecution`'s ~700-line body, not extractable pure functions, and building the Prisma/routing-cascade mocking needed to exercise them in isolation was judged disproportionate to a several-line conditional fix; verified instead by code reading and the full regression suite.

Verified via: `apps/backend` and `apps/frontend` full `tsc --noEmit` (clean); the complete `apps/backend/tests/ask/*.test.js` suite (608/609 passing, 1 pre-existing skip); frontend maintenance-page Jest suite (36/36, including the 2 new tests). No browser/Playwright run performed; the corrected "Why is this important?" routing, the blocked open-redirect back link, the widened system-scope match, and the organic-refinement identity fix are all unverified live.

## 31. Full-collection truncation, concurrent-write safety, access-loss redaction, and stale-confirmation UX (2026-09-14)

A functional-certification review (13 acceptance scenarios pass; 8 fail) found five P1 and three P2 defects, none overlapping with §§27–30's view-state/handoff work. Certification gate: A01, A02, A07, A10, A11, A13, A17, A24 (fail) → this round's fixes; A03–A09/A12/A14–A18/A21/A23 (pass) unaffected.

**1. Results silently excluded tasks after the first 50 (full-collection filtering).** `maintenanceTaskContext.provider.ts` sliced the canonical task list to a flat 50 *before* `maintenanceResult()` ever filtered or counted it, reasoning that "the adapter renders at most 50 records" (a per-section **display** limit applied *after* filtering) meant the source data could be bounded the same way. It could not: `includeCompleted: true` pulls in years of completed/cancelled history that competed with open tasks for the same 50 slots, so a genuinely open, urgent task could simply fall outside the slice — wrong totals, false "no matches," missing urgent/overdue tasks. Fixed: the provider now maps the *full* canonical list and only bounds it if the composer's own context budget would otherwise be exceeded, keeping every active (non-completed/cancelled) task first — only completed/cancelled history is trimmed — and discloses truncation via new `wasTruncated`/`totalTaskCount` fields (`maintenanceResult`'s SUMMARY block appends "Only N of M total maintenance records could be loaded..." with `CAUTION` tone when true). This surfaced a second, harder constraint: `maintenance/skill.manifest.ts`'s `contextBudget.maxEntities: 60` — a generic scaffold default, not sized for a domain where one task is one entity — meant any property past 60 total tasks hit `BUDGET_EXCEEDED` and failed the entire (required, `DETERMINISTIC`, never LLM-facing) `MAINTENANCE_STATUS` operation outright. Raised to `skillRegistry.ts`'s own `PLATFORM_CONTEXT_BUDGET_MAXIMUMS` ceiling (`maxEntities`/`maxFacts`: 100, `maxSerializedBytes`: 256,000) — a genuine platform-wide governance limit enforced across every Skill (`skillPlatformFoundation.test.js` asserts none exceed it) that an initial attempt to raise further (1,000/1,000/450,000) correctly failed against. The provider now enforces both a byte budget (110,000, leaving headroom under the skill total for the optional seasonal-checklist-context provider) and a hard 100-task count ceiling, whichever binds first.

**2. Rescheduling could overwrite a concurrent change (no compare-and-swap).** `confirmMaintenanceTaskUpdate` checked the task's version before writing, but `PropertyMaintenanceTaskService.updateTask` performed an unconditional `update()` by id — a concurrent write landing in the gap between that check and this write was silently overwritten, unlike `updateTaskStatus` (completion), which already guards its write with `updateMany({ where: { id, updatedAt } })`. Fixed identically: `updateTask` now guards its write the same way, throwing a distinguishable `CONCURRENT_TASK_UPDATE`-coded error on a lost race (verified by the existing `propertyMaintenanceTaskStatusParity.test.js`, whose Prisma mock already implemented the exact `updateMany` CAS semantics this fix now actually exercises).

**3. Revoked access didn't redact an open confirmation.** The backend correctly rejects a confirmation/edit/cancel once property access is revoked, but `ConfirmationCard` only displayed the raw error message — the stale task details, proposal, consent checkbox, and Confirm/Cancel buttons stayed fully rendered and usable. The existing access-loss redaction (blanking blocks/proposal/consent/actions, clearing local view state, dropping pending-work entries) was only ever triggered from `refreshResult`'s own catch block. Fixed: the redaction logic is extracted into `redactAccessLostResult`, threaded down through `ExecutionCard` as `onAccessLost`, and `ConfirmationCard`'s `confirm`/`cancel`/`saveEdit` catch blocks now call it whenever `askFailureCode()` returns an access-lost code — the same classification `refreshResult` already used, reused rather than duplicated.

**4. Stale confirmation recovery didn't show current state (FRESH-002/A10).** A detected conflict became a generic "This changed before it could be confirmed... Ask this question again" regardless of what actually happened — never saying whether another session had already completed the task, cancelled it, or just moved its date. A fully generic fix (a fresh proposal regenerated per-operation) would require redesigning all 25 confirmation-capable commands; scoped instead to the maintenance domain commands the review's example concerns: a new `maintenanceConflictDescription(task)` helper names the *current* task state explicitly ("already completed in another session," "was cancelled," or "is now due {date}"), applied at `confirmMaintenanceTaskUpdate`'s and `confirmMaintenanceTaskComplete`'s version-conflict throws and at the new CAS-race catch from fix 2. A structurally identical, unrelated Buyer Plan (`homeBuyerTask`) conflict message was left untouched — out of scope for this review.

**5. "Why is this important?" wasn't genuinely grounded in the selected task (CTX-001), refined from §30's fix.** Three residual gaps in the prior round's fix: the guidance engine received only the task's title/category/asset/room, not its own `description` field (task-specific rationale); the evidence line stamped the current request time instead of the task's own recorded `updatedAt`; and a launch entity that failed to resolve (deleted, wrong property) silently fell back to an unscoped answer with no indication the specific task was missing. Fixed: the task's `description` (truncated) is folded into the grounded question text; the evidence item now uses `task.updatedAt`; and a resolution failure (`taskAnchorMissing`) prepends an explicit disclosure to the answer body and sets `CAUTION` tone, rather than silently presenting a property-wide answer as task-specific.

**6. Room-filter continuity was lost (A-series, P2).** Room scope was derived fresh every turn from the raw task list + message text but never stored in `MaintenanceViewState` — unlike domain/date, so any status-chip continuation (e.g. "Show Kitchen maintenance" → "Urgent") silently broadened the result to every room. A room-only result (no domain/date scope) also lacked a "Clear all filters" chip despite having a real, clearable filter active. Fixed: `roomScopePhrase` added to `MaintenanceViewState` (optional, so a pre-existing stored row without it degrades to "no room scope" rather than throwing), merged forward in `mergeMaintenanceViewContinuation` alongside domain/date, and included in the "Clear all filters" chip's visibility condition.

**7. Empty states were conflated (P2).** "No recorded maintenance tasks" and "tasks exist but none match these filters" both rendered as the same "No matching maintenance records were found." Fixed: the SUMMARY title now distinguishes `context.totalTaskCount === 0` ("No maintenance tasks are recorded for this home yet") from a real zero-match filter result ("No maintenance tasks match these filters") — `totalTaskCount` reflects the true canonical total independent of any provider-level truncation from fix 1.

**8. Unknown write outcome had misleading recovery (P2).** Once a confirmation was claimed, the execution transitioned to `RUNNING`, but its `resultJson.confirmation` was left populated (the claim transaction only touches `status`/`reasonCode`) — so re-fetching a stuck execution still showed `ConfirmationCard`'s "Confirmation required" over a command that might already be running or done, and nothing in the UI could trigger the recovery path the backend already supports (`confirmAskExecution`'s `recoveringClaim` branch, reachable only by resubmitting a confirm request — a passive read can never advance it, which is exactly why "Check action status" used to just return the same `RUNNING` state). Fixed: `ConfirmationCard` now renders only when `status === 'NEEDS_CONFIRMATION'`; a new `PendingOutcomeCard` renders instead when `status === 'RUNNING'` with a confirmation still present, and its "Check status" button resubmits `confirmAskExecution` with the same `confirmationVersion` (a fresh idempotency key is fine — the receipt-recovery match is keyed on `inputHash`, derived from `confirmationVersion`/consent/binding/params, not the idempotency key) — a genuine, safe retry via the existing lease-reclaim + domain-idempotency guarantees, not a duplicate action. `reclaimOrphanedRunningExecution`'s own exclusion of claimed executions was deliberately left unchanged (it defers to this exact recovery path by design); this fix makes that path actually reachable from the UI.

**Tests.** `maintenanceViewStateContinuity.test.js` gained 2 tests for room-scope continuity (retained through a status chip; a pre-existing stored row with no `roomScopePhrase` field degrades gracefully). `propertyMaintenanceTaskStatusParity.test.js`'s existing tests now exercise the real `updateMany`-based CAS path (its mock already implemented the correct semantics). **Not added**: a live concurrency test that actually races two `updateTask` calls (the existing mock/unit-test infrastructure isn't set up for genuine concurrent execution); a test for the access-loss redaction wiring in `ConfirmationCard` (would need React Testing Library component mounting, not present in this file's existing test setup); a test for `PendingOutcomeCard`'s resubmit-based recovery. All four verified by code reading and the full regression suite instead.

Verified via: `apps/backend` and `apps/frontend` full `tsc --noEmit` (clean, after correcting an initial `contextBudget` overshoot that `skillPlatformFoundation.test.js` caught); the complete `apps/backend/tests/ask/*.test.js` suite plus `tests/unit/propertyMaintenanceTaskStatusParity.test.js` (613/614 passing, 1 pre-existing skip). No browser/Playwright run performed; the redacted `ConfirmationCard`, the `PendingOutcomeCard` resubmit flow, the richer conflict messages, and the room-scope/empty-state/truncation-disclosure copy are all unverified live.
