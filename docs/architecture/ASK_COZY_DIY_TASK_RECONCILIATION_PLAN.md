# DIY Reverse Reconciliation (Maintenance Task to DIY Project) — Step 4 Implementation Plan

**Date:** October 6, 2026
**Status:** **Revision 2, after external review (October 6, 2026).** The review explicitly approved S4-2 and approved S4-1 to S4-12 subject to three corrections (the occurrence id, the deleted-task outcome, per-project outcomes) and one wording change, all incorporated here (§11 maps them). Approved and committed; slice 4a (schema, the atomic request, the worker handler, the project transitions) is pushed (§12); slice 4b (disclosure, recovery, page) is built and verified locally (§13); 4c is not started. It needs schema changes (two enum values on existing enums, one new enum, one nullable column, one index), applied by you with `prisma db push`.
**Parent design:** [`ASK_COZY_STATEFUL_GUIDE_DESIGN.md`](ASK_COZY_STATEFUL_GUIDE_DESIGN.md) §13, step 4 (P5; decision O12, approved October 6, 2026), D4, E8, review finding 8, methodology items 15, 17, 18, 19, 20
**Follows:** [`ASK_COZY_DIY_COMPLETION_OUTBOX_PLAN.md`](ASK_COZY_DIY_COMPLETION_OUTBOX_PLAN.md) (step 3, pushed; its rollout is yours). This plan reuses its outbox, worker handler boundary, authority policy, disclosure and recovery patterns.
**Method:** `AUDIT_METHODOLOGY.md` design items 11-20 and the section 7 adversarial pass (§8). Labels: **[Code-traced]** read, not run; **[Executed]** ran. Nothing in this document was executed; the findings are from reading and searching the code.

## 1. Goal and boundary

**Goal.** When the maintenance task a DIY project is linked to is completed somewhere other than through that project, the project should **follow, by what the completion actually said** (O12), durably and attributed to the person who completed the task, and the page should say plainly when it cannot follow. Today the link is one-sided: completing the task does nothing to the project, so an open project can sit beside a finished task indefinitely (E8).

**In scope:** a reconciliation request written atomically with the task's completion, a worker handler that applies O12's table to every open project linked to that task, the stored `completionBasis`, the indexed reverse lookup, a read-only disclosure on the project, recovery for a dead letter, creation-time validation of the link, and the rollout gates.

**Out of scope:** reopening a project when its task is reopened, cancelled or deleted (§3.6); changing any other completion path's behavior; the Ask guide (steps 5 and 6); a way for a person to close a project whose task was completed with an unknown mode (S4-2 names it as a follow-up, not built here); any incident change (O13).

## 2. What exists today

| # | Finding | Label |
| --- | --- | --- |
| R1 | `DiyProject.maintenanceTaskId` has **no index** and the task has no pointer back, so the "indexed reverse lookup" O12 requires does not exist. | Code-traced |
| R2 | `createProject` stores whatever `maintenanceTaskId` the client sends (`z.string().optional()`), **without checking that the task exists or belongs to the project's property**. The reverse lookup, and step 3's completion handler, can only trust a link that was validated when it was made. | Code-traced |
| R3 | Maintenance tasks reach `COMPLETED` through exactly four writers: (1) `completeTaskCore` (behind `updateTaskStatus`: the maintenance controller, Ask's maintenance confirmation, Home Action completion, the project tracker, the seasonal checklist); (2) `updateTask` with a status patch (its own compare-and-swap, then the same side-effect helper); (3) `recalls.service.ts` raw `updateMany` when a recall match is resolved; (4) `inspectionReadiness.service.ts` raw `updateMany` when an inspection check is `MET`. Writers 3 and 4 skip the governed path entirely (no seasonal sync, no counters, no completion details). | Code-traced |
| R4 | **Only the Home Action rich-completion path (`homeActionCompletion.service.ts`) passes `fulfillmentMode`.** The maintenance controller's status endpoint, Ask's confirmation, the project tracker, the seasonal checklist and `updateTask` pass none. So under O12 as approved, **most task completions today have an unknown mode and would leave the linked project open and disclosed**, not closed. This is the single most important fact for deciding whether step 4 delivers what you expect (S4-2). | Code-traced |
| R5 | When a mode is passed it is stored in `task.completionMetadata.fulfillmentMode` (with `recordedByUserId`, the completion key and the other details). | Code-traced |
| R6 | Step 3's DIY completion handler completes the linked task through the governed core with mode `DIY`; that completion would, with step 4, itself ask for reconciliation of **other** open projects linked to the same task. The completing project is already `COMPLETED`, so it is not reconciled again. Nothing prevents several projects linking one task. | Code-traced |
| R7 | The project transition mechanism from step 2 (`claimOpenProject`, version bump, ledger rows) and the completion rule (`openStepsForCompletion`) exist and are reusable for a system-driven transition; the claim accepts "no expected version". `DiyProjectEventType` has `PROJECT_COMPLETED`, `PROJECT_ABANDONED`, `PROJECT_HIRED_OUT`. | Code-traced |
| R8 | The governed completion writes the status with a compare-and-swap **without a transaction**, then runs side effects. A reconciliation request written after the status write, outside it, could be lost by a crash in between (methodology item 15). | Code-traced |
| R9 | The worker job, its injected dependency interface, the exhaustive dispatch test and the terminal-error capability exist (step 3). `FOLLOW_UP_DUE` remains a known unhandled type. | Code-traced / Executed |

## 3. Target behavior

### 3.1 The request: atomic with the task's completion, only when it can matter

In both governed writers (`completeTaskCore` and `updateTask`), the transition into `COMPLETED` and the request below happen in **one transaction**, in this order:

1. An **indexed** lookup finds the open DIY projects linked to the task (`maintenanceTaskId`, status `PLANNING` or `IN_PROGRESS`), capped at 25 (§3.2 explains the cap). **If there are none, nothing more happens** (the common case: one cheap indexed read).
2. If there are some, a **unique reconciliation occurrence id** (a UUID) is generated **inside the transaction** and merged into the task's `completionMetadata` as `reconciliationOccurrenceId` **in the same compare-and-swap write** that completes the task. It is deliberately not derived from `lastCompletedDate` or any caller-supplied value: a caller can send the same completion date for several cycles of a recurring task, and a date-derived key would make a legitimate later completion collide with the earlier event and roll the whole task completion back.
3. After the write succeeds (a lost compare-and-swap writes nothing and emits nothing), a `DomainEvent` of type `DIY_TASK_COMPLETED_RECONCILE` is inserted: key `diy-task-reconcile:<taskId>:<occurrenceId>`, `propertyId`, and a payload that **snapshots what the completion said**: task id, property id, occurrence id, the completing user, `completedAt`, `fulfillmentMode` (or null), the completion key (or null), and the **ids of the open projects found in step 1**.

The occurrence id stored on the task is also the **pointer** that disclosure (§3.3) and recovery (§3.4) follow from a project to its exact event: project, to its task, to `completionMetadata.reconciliationOccurrenceId`, to the event key. (For a recurring task it names the latest occurrence, which is the one a person is looking at.) In the same transaction the completing user's access is verified with the read-only transaction-capable check from step 3, so the worker can rely on durable, authorized intent (the same policy as step 3 §3.6) and use the user only for attribution. A failed insert rolls the task completion back (S4-5 weighs this).

### 3.2 The handler: durable state decides, per snapshotted project, with persisted outcomes

A pure handler with injected dependencies (the step 3 boundary), run by the worker:

1. **Preflight, before any write:** the snapshot is well formed. The task is then read:
   - **The task no longer exists** (deleted after the event was written; `DiyProject.maintenanceTaskId` is an unconstrained string, so the projects still point at it): the event ends with the typed **terminal skip** `TASK_DELETED`. It is a normal, final end (the event is `PROCESSED`, not retried and not dead-lettered), **no project is changed**, and the link is not hidden: the disclosure shows `NEEDS_REVIEW` (§3.3).
   - **The task is no longer `COMPLETED`** (reopened meanwhile): outcome `TASK_NO_LONGER_COMPLETED` for the whole event, nothing applied.
   - **The task's property differs from the snapshot's:** a **terminal** integrity failure, dead-lettered at once.
2. **For each project id in the snapshot** (the ids found when the request was written; at most 25, and any open project beyond the cap is simply not snapshotted and is covered by the disclosure, not silently dropped), independently, **skipping any project that already has a final outcome recorded on the event**. One project's failure does not stop the others; the event fails at the end if any project failed, and a retry or a recovery touches only the projects without a final outcome:

| Snapshot mode | Project open, and… | Action | Ledger | Home event | Outcome recorded |
| --- | --- | --- | --- | --- | --- |
| `PROVIDER` | any steps | `HIRED_OUT`, steps untouched, basis `LINKED_TASK` | `PROJECT_HIRED_OUT` | none | `HIRED_OUT` |
| `DIY` | the completion rule holds (required steps completed, optional completed or skipped) | the **normal project completion** (basis `STEPS`), including its own outbox event, so the home event is recorded and the task effect finds the task already done | `PROJECT_COMPLETED` | yes (via step 3's event) | `COMPLETED` |
| `DIY` | required steps still open | **Reconciled closure**: `COMPLETED`, basis `LINKED_TASK`, steps left as they were, `completedByUserId` the completing user | new `PROJECT_CLOSED_BY_LINKED_TASK` | none | `CLOSED_BY_LINKED_TASK` |
| none or unknown | any | **no transition** | none | none | `NEEDS_REVIEW` |
| any | the project is no longer open (finished or stopped by the person first) | nothing | none | none | `ALREADY_CLOSED` |

3. **Per-project outcomes are persisted, bounded, on the event.** After each project the handler records its outcome in the event's own payload as `projectOutcomes: { <projectId>: <outcome> }`, at most one entry per snapshotted project (so at most 25). `HIRED_OUT`, `COMPLETED`, `CLOSED_BY_LINKED_TASK`, `NEEDS_REVIEW` and `ALREADY_CLOSED` are **final** and are never revisited; a project whose attempt failed has no final entry (it may carry `FAILED`, which is not final). The retry of a failed event and the recovery of a dead-lettered one therefore re-attempt **only** the failed and not-yet-attempted projects. A project that is `NEEDS_REVIEW` stays so: nothing about it changes by retrying.
4. Every transition goes through the step 2 claim, so it serializes with the person's own writes and bumps the version (a stale page gets `DIY_STALE` on its next write, as intended). The actor on the ledger and on `completedByUserId` is the user who completed the task.

The home event is deliberately not created for the two linked-task closures: the task's own completion is the record, and a home event saying a project was completed by the homeowner when its steps were not done would claim more than is known (S4-3).

### 3.3 Disclosure (read-only), from durable state

The project read gains `taskLink`, derived from the project, its linked task, and the reconcile event reached through the task's `reconciliationOccurrenceId`, with fixed copy, and **never writes**:

| Situation | `taskLink` state | What the page says |
| --- | --- | --- |
| No linked task id, or the task is not completed | none | nothing |
| Project open, task completed, its event pending, processing or retrying | `UPDATING` | "Your linked task was completed. Updating this project." |
| Project open, task completed, and the project's recorded outcome is `NEEDS_REVIEW`, **or no event exists** (a completion by a path this step does not hook, or before this release) | `NEEDS_REVIEW` | "Your linked task was marked complete, but not from this project, and we can't tell whether you did the work or hired someone, so this project is still open. Review the project and confirm whether you completed the work or hired a professional." |
| Project open and its linked task **no longer exists** (the lookup returned nothing, or the event ended `TASK_DELETED`) | `NEEDS_REVIEW` | "The task this project was linked to no longer exists, so we can't tell whether the work was done. Review the project and confirm whether you completed the work or hired a professional." |
| Project open, the event dead-lettered with this project not yet resolved | `NEEDS_ATTENTION`, with recovery | "Some updates from your linked task could not be applied." and **Finish updating** |
| Project closed with basis `LINKED_TASK` | `CLOSED_BY_TASK` | "Closed because your linked task was completed." (`DIY`, steps not all done) or "Closed because a pro completed your linked task." (hired out) |

The missing-task case is shown, not hidden, precisely because `maintenanceTaskId` is not a foreign key: a failed lookup is information, not a reason to say nothing. Because `NEEDS_REVIEW` is computed from the task's current state, it also covers completions by the two raw writers (R3), by pre-release completions, and by anything this plan does not hook, without a sweep and without a write. The wording avoids telling the person to recreate a missing classification by hand ("finish it, or stop it"); it asks them to review and confirm, which is also where the S4-2 follow-up (a person-confirmed close, or the mode on ordinary completion) would attach.

### 3.4 Recovery: dead letters only

The same rules as step 3 §3.5: a service method (CONTRIBUTOR, checked in the service as well as the route) that resets **the same event row** from `DEAD_LETTER` to `PENDING`, conditional on status and version, recording `recovery: { count, lastBy, lastAt }` in the payload (alongside, never replacing, the snapshot and `projectOutcomes`), a no-op for every other state. Route `POST /properties/:propertyId/diy/projects/:projectId/task-reconciliation/retry`. The event is found through the project's task and its stored `reconciliationOccurrenceId`; there is no new column. Because the handler skips projects with a final outcome (§3.2), recovery re-drives **only** the projects that failed or were never attempted.

### 3.5 Creation-time validation (R2)

`createProject` verifies that a supplied `maintenanceTaskId` exists **and belongs to the same property**, and rejects otherwise (`DIY_TASK_NOT_FOUND`, 400/404 as the other lookups do). It does not refuse a task that is already `COMPLETED` (a person may start a project for a task they have already ticked off); such a project simply shows `NEEDS_REVIEW` until finished. Projects created before this release are not re-validated; the handler's integrity preflight and step 3's cover them.

### 3.6 What reconciliation deliberately does not do

- **No reopening.** A project closed by its task stays closed if the task is later reopened, cancelled or deleted; projects have no reopen, and a task change after the fact is not evidence about the project. The page copy for a closed-by-task project says what it was closed by, so the history is honest.
- **No inference.** An unknown mode never becomes DIY or PROVIDER from context (who completed it, whether photos were attached, the task's source).
- **No sweep and no backfill.** Open projects whose linked tasks were completed before this release get no automatic transition and no event; they show `NEEDS_REVIEW`. A read-only query lists them (§5).
- **No incident or verified-evidence effect** (O13).

## 4. Schema (all `prisma db push`, no migration scripts)

(The occurrence id lives in the existing `completionMetadata` JSON on the task and the outcomes in the existing event payload, so neither needs a column.)

1. `DomainEventType`: add `DIY_TASK_COMPLETED_RECONCILE`.
2. New enum `DiyCompletionBasis { STEPS LINKED_TASK }` and `DiyProject.completionBasis DiyCompletionBasis?` (null for projects closed before this release or never closed; set to `STEPS` by the normal completion from now on; set to `LINKED_TASK` for both linked-task closures, including `HIRED_OUT`, so the page can tell "you stopped this" from "your task closed this").
3. `DiyProjectEventType`: add `PROJECT_CLOSED_BY_LINKED_TASK`.
4. `@@index([maintenanceTaskId])` on `DiyProject` (the reverse lookup).

All additive; no data is rewritten. After the push, regenerate the Prisma client in `apps/backend` and `apps/workers`.

## 5. Rollout order (same rules as step 3, §4 of its plan)

1. Apply the schema (`prisma db push`), regenerate clients.
2. **Worker gate** (typecheck, boundary lint, exhaustive dispatch test, stubbed-module test, production-style build and `npm run smoke:built-worker`), then deploy and restart the worker. **The backend must not emit the new event before a worker that handles it is running.**
3. Real-Postgres acceptance (4c) before enabling the producer when a scratch database exists; otherwise record the gap.
4. Deploy the backend. **Its start-up check is extended to fail when either new enum value is missing** (`DIY_PROJECT_COMPLETED` and `DIY_TASK_COMPLETED_RECONCILE`), because the hook runs inside every maintenance completion that has a linked open project: a missing value would fail those completions, so the backend refuses to start instead.
5. Deploy the frontend.

**Read-only queries for the runbook** (nothing is changed): open projects whose linked task is already completed, split by whether the task recorded a mode (these become `NEEDS_REVIEW`); how many tasks link more than one open project; reconcile events by status.

## 6. Slices

| Slice | Content | Gate |
| --- | --- | --- |
| **4a** | Schema; the index; creation-time link validation; the atomic request in `completeTaskCore` and `updateTask` (with the transaction wrapper and the in-transaction access check); the pure handler, its adapters and the worker dispatch case; the system-driven transitions in the DIY service (hire out, reconciled closure, and normal completion reuse) with `completionBasis`; `completionBasis: STEPS` on the normal completion; the extended start-up check; unit tests on the fake with mutation checks | The worker gate of step 3, plus an updated stubbed-module test; **must ship with 4b** |
| **4b** | `taskLink` disclosure on the project read; recovery service and route; frontend types, client, page copy and recovery action; tests | With 4a |
| **4c** | Guarded real-Postgres run through the real worker job and the real maintenance completion; runbook; the read-only queries | Before the producer is enabled, or the gap recorded |

## 7. Validation plan

| Check | Kind (when run) |
| --- | --- |
| The request is written in the same transaction as the task's `COMPLETED` write, only on a real transition into completed and only when an open linked project exists; a failing insert rolls the task completion back; a task with no linked project writes no event and no occurrence id | Test, fake and Postgres |
| **Recurring task, same completion date supplied for two cycles:** each completion gets its own occurrence id and its own event, the second does not collide or roll back, and `completionMetadata` points at the latest; a lost compare-and-swap emits nothing | Test, fake and Postgres |
| Each rule of the table: `PROVIDER` hires out with steps untouched and no home event; `DIY` with the rule holding completes normally (basis `STEPS`, outbox event, task effect `ALREADY_DONE`); `DIY` with steps open closes with basis `LINKED_TASK`, steps untouched, no home event; unknown mode changes nothing and reports `NEEDS_REVIEW` | Test |
| Several open projects linked to one task are each handled; one failing does not stop the others, and the retry touches only those still open | Test |
| A project already closed (by the person, concurrently) is `ALREADY_CLOSED`; the person's stale page then gets `DIY_STALE`; a transition and a person's write on the same project serialize | Test, fake and Postgres |
| Task reopened before the worker runs: nothing applied; **task deleted after the event was written: `TASK_DELETED`, the event processed (not retried, not dead-lettered), no project changed, and the disclosure shows `NEEDS_REVIEW`**; task on another property: terminal dead letter before any write; duplicate delivery changes nothing | Test, fake and Postgres |
| **Per-project outcomes:** one event over several projects records a bounded outcome per snapshotted id; a failing project leaves the others' outcomes final; the retry and the recovery re-attempt only failed and never-attempted projects, never one already `HIRED_OUT`, `COMPLETED`, `CLOSED_BY_LINKED_TASK`, `NEEDS_REVIEW` or `ALREADY_CLOSED`; recovery keeps the snapshot and the outcomes; more than 25 linked open projects snapshot 25 and disclose the rest | Test, fake and Postgres |
| The actor leaving the household after the task completion does not strand the reconciliation; the access check in the maintenance transaction refuses a viewer exactly as `updateTaskStatus` does | Test |
| Disclosure: every row of §3.3, including "task completed, no event", the deleted-task row and the closed-by-task copy, with the review-and-confirm wording; the read performs no write (a spy) | Test |
| Recovery: dead letters only, the same row once, payload metadata, viewers refused; the route floor | Test |
| `createProject` rejects a task that does not exist or is on another property and accepts one on the same property, including an already-completed one | Test |
| The start-up check fails for either missing enum value; the exhaustive dispatch test includes the new type; the handler loads under the seven production stubs | Worker gate |
| The existing maintenance, Ask maintenance, Home Action completion and seasonal suites still pass with the transaction wrapper | Executed in 4a |
| Mutation checks: request emitted outside the transaction; emitted for a non-transition; occurrence id derived from the completion date; mode inferred when unknown; steps changed by a linked-task closure; home event created for a linked-task closure; the open-project filter dropped; the task-still-completed check dropped; a deleted task treated as retryable or as success-with-changes; outcomes not persisted or final outcomes revisited on retry; preflight after a write | Executed in 4a |
| Real Postgres through the real job and real governed maintenance completion (recurring task, seasonal item, several projects) | 4c |

## 8. Adversarial pass (methodology section 7) [Code-traced; the answers to be tested]

- **The mode is usually unknown (R4).** The design is followed as approved, which means most completions disclose rather than transition. If you expected automatic closure for ordinary completions, this plan will disappoint; S4-2 states it and offers the follow-up.
- **Two raw writers (R3).** Recall resolution and inspection `MET` complete tasks without any hook. They are covered only by the disclosure. They also skip the seasonal sync and counters, which is a separate inconsistency worth your attention; this plan does not change them.
- **Blast radius of the hook.** It runs inside every governed task completion, but writes only when an open linked project exists and costs one indexed read otherwise. A failure rolls the completion back (atomic, S4-5); a missing enum value would trigger it, hence the fatal start-up check.
- **Transaction wrapper on a heavily used service (risk).** The compare-and-swap moves into a transaction. The side effects stay after it, exactly as today, so nothing slower or longer runs inside the transaction; existing suites and a real-Postgres run must show the status, counters and seasonal behavior unchanged.
- **Reconciliation racing the person.** Both go through the project claim; whichever commits first wins and the other sees a closed project (`ALREADY_CLOSED`, or `DIY_PROJECT_CLOSED` for the person).
- **A loop between the two reconciliations (R6).** Step 3's handler completing the task triggers the reverse request only for other open projects on that task; the originating project is already closed. No cycle.
- **Recurring tasks (S4-4, a prominently tested case).** Each completion gets its own generated occurrence id, so each cycle reconciles its own open project and a caller repeating a completion date cannot collide. A project linked to a recurring task that completes on schedule while the project is still in progress will, with mode `DIY` and steps open, be closed by the task's routine completion. That is the already-decided O12 behavior; it is named here, tested explicitly, and will be documented in the rollout notes because it is surprising.
- **A deleted task.** `maintenanceTaskId` is not a foreign key, so deletion leaves a dangling id. The event ends with a typed terminal skip and the projects stay open and disclosed; neither the handler nor the page treats "not found" as "nothing to say".
- **Partial success over several projects.** Persisted per-project outcomes make a retry or a recovery safe: finals are never redone, and a project that was already hired out cannot be completed by a later retry.
- **A project created for an already-completed task** is allowed (S3.5) and shows `NEEDS_REVIEW`; it is never auto-closed because no completion event follows.
- **Overclaim check (methodology item 9).** "Covers every completion path" would be false; the disclosure covers them, the automatic transition does not, and §3.3 says which is which. "Recovery retries only what failed" depends on the outcomes being written after each project; a crash between a project's transition and its outcome write is safe only because every transition is idempotent by project state (an already-closed project reports `ALREADY_CLOSED`), and a test pins that.

## 9. Risks

1. The unknown-mode majority (R4): the feature will mostly disclose.
2. The transaction wrapper in the maintenance service.
3. A worker deploy order mistake (the fatal start-up check covers the enum, nothing enforces worker-before-backend).
4. Recurring tasks closing an in-progress DIY project on schedule (S4-4).

## 10. Decisions (each with the recommended default)

| # | Decision | Recommendation |
| --- | --- | --- |
| **S4-1** | Hook the two governed writers atomically; do not hook the two raw writers (they supply no mode anyway); cover them by disclosure; **track the two raw writers as a named follow-up** (they also bypass the seasonal sync and counters) | Approved at review |
| **S4-2** | **Explicitly approved at review.** Apply O12 exactly as approved (no inference: never infer `DIY` or `PROVIDER`). Accept that most completions today carry no mode and will disclose `NEEDS_REVIEW`. **Follow-up, not built:** decide between a person-confirmed "close this project" (its own basis; not "finish early", since the person states the task is the evidence) and adding the mode to ordinary task completion, using the 4c counts | Approved; decide the follow-up after the 4c queries |
| **S4-3** | A linked-task closure (`HIRED_OUT` or `LINKED_TASK`) creates no home event; `DIY` with the rule holding goes through the normal completion and its home event | Yes |
| **S4-4** | A routine completion of a recurring task closes a linked in-progress project when the mode is `DIY` and steps are open | Yes, as specified in O12; named so it is a decision |
| **S4-5** | The request is written in the same transaction as the task's completion, so a failed insert fails the completion (atomic, item 15), **keyed by a unique occurrence id generated in the transaction and stored in the task's `completionMetadata`**, never by a date; alternative: best-effort after commit, which can lose the intent | Atomic, approved at review |
| **S4-6** | Authority: the completing user's access is verified inside that transaction; the worker relies on the durable intent and uses the user for attribution; the handler checks integrity only | As step 3 |
| **S4-7** | Schema: the four changes in §4; `completionBasis` is `LINKED_TASK` for both linked-task closures | Yes |
| **S4-8** | Disclosure states and copy of §3.3, read-only, including "completed, no event" and a missing linked task as `NEEDS_REVIEW`, with the review-and-confirm wording | Yes |
| **S4-9** | Recovery for dead letters only, same row once, metadata in the payload, a route per §3.4; it re-drives only projects without a final outcome | Yes |
| **S4-10** | `createProject` validates the linked task (exists, same property); already-completed tasks allowed; no re-validation of older projects | Yes |
| **S4-11** | No reopening of a project when its task changes later; no sweep and no backfill; a read-only query lists open projects whose task was already completed | Yes |
| **S4-12** | Rollout as §5, with the start-up check extended to both enum values; 4c before the producer when a scratch database exists, otherwise the gap recorded | Yes |
| **S4-13** | *(added at review)* **Deleted linked task:** a typed terminal skip `TASK_DELETED` (event processed, projects unchanged, `NEEDS_REVIEW` disclosed) | Yes |
| **S4-14** | *(added at review)* **Per-project outcomes** persisted on the event, bounded to the snapshotted ids (cap 25); final outcomes are never revisited; retry and recovery touch only failed or never-attempted projects | Yes |

## 11. How this revision answers the review

| Review point | Where |
| --- | --- |
| 1. Unique occurrence id, not `lastCompletedDate`; stored in `completionMetadata`; the pointer for disclosure and recovery | §3.1, §3.3, §3.4, S4-5, §7 |
| 2. Deleted task: typed terminal skip, projects unchanged, `NEEDS_REVIEW` shown | §3.2, §3.3, S4-13 |
| 3. Persisted bounded per-project outcomes; recovery retries only failed or open projects | §3.2, §3.4, S4-14, §7 |
| S4-1 raw writers as a named follow-up | S4-1 |
| S4-2 explicitly approved; no inference; decide the follow-up from the 4c counts | S4-2 |
| S4-4 recurring-task case prominently tested and documented | §8, §7 |
| Unknown-mode wording | §3.3 |

## 12. Slice 4a record: schema, the atomic request, the worker handler and the transitions (October 6, 2026)

**Built.**

- **Schema** (not applied to any database): `DomainEventType.DIY_TASK_COMPLETED_RECONCILE`; `DiyProjectEventType.PROJECT_CLOSED_BY_LINKED_TASK`; the enum `DiyCompletionBasis { STEPS, LINKED_TASK }` and `DiyProject.completionBasis`; `@@index([maintenanceTaskId])`.
- **The request** (`diyTaskReconciliationRequest.ts`) in both governed writers: in one transaction, an indexed lookup of open linked projects (this property, this task, capped at 25, oldest first); only if some exist, a unique UUID occurrence id merged into the task's `completionMetadata` in the same compare-and-swap, then the event, keyed by that id, carrying a snapshot (task, property, occurrence, the completing user, completion time, the recorded mode or null, the completion key or null, the project ids). The public paths verify the user's access inside the transaction; the internal DIY completion export skips that check exactly as before. A lost compare-and-swap emits nothing; a failed insert fails the completion.
- **The worker handler** (`diyTaskReconciliation.ts`, pure) and its adapters, dispatched by the job: the preflight (deleted task: the typed final skip `TASK_DELETED`; reopened task; another property: terminal), then each snapshotted project without a final outcome, recording each outcome on the event before the next project.
- **The transitions** in `diy.service.ts`: `reconcileProjectFromLinkedTask` (unknown mode: no write; `PROVIDER`: hired out with basis `LINKED_TASK`; `DIY` with the completion rule holding: the normal completion with its outbox event; `DIY` with steps open: a closure with basis `LINKED_TASK`, steps untouched, no outbox event), all behind the step 2 claim. The normal completion now records basis `STEPS` too, through a shared `writeCompletion`.
- **`createProject` validates the linked task** (it must exist on the same property; an already-completed task is allowed).
- **The fatal start-up check** now requires both outbox enum values.

**Validation**

| Check | Result | Kind |
| --- | --- | --- |
| Handler tests: every outcome passed through and recorded in order; unknown mode passed as null; deleted task a final skip; reopened task applies nothing; another property terminal before any project; malformed snapshots terminal (including more than 25 projects); partial failure leaves the others final and names only the failed project; a retry or recovery redoes only failed or never-attempted projects and skips every final outcome including `NEEDS_REVIEW`; duplicate ids once; the handler imports only the terminal-error class | 10 pass | Executed |
| Transition tests on the shared fake: hire-out (ledger actor, steps untouched, no outbox); `DIY` completing normally (basis `STEPS`, one outbox event); `DIY` closing by the linked task (basis `LINKED_TASK`, the task's completion time, steps untouched, no outbox); unknown mode writes nothing, not even the claim; closed and missing projects; the version bump makes a stale page get `DIY_STALE`; a race with the person finishing the project yields one completion and one outbox event; the link check at creation | 9 pass (19 with the handler) | Executed |
| Producer tests on the real maintenance service with an observable transaction: lookup, compare-and-swap and event in that order inside one transaction; the snapshot and the stored occurrence id; the lookup's filter, cap and order; no linked project means no id and no event; no event for a non-transition or a lost swap; a failing insert prevents the commit; **a recurring task completed twice with the same supplied date gets two distinct ids and events with no collision**; the in-transaction access check (public path refuses a viewer, the helper refuses an unverified actor); the internal export keeps its exemption and still requests reconciliation for other open projects, with its options argument in the right position however few arguments the caller passes; the generic edit path requests reconciliation with an unknown mode and no key, and a non-status edit never looks | 11 pass | Executed |
| Mutation checks (11): occurrence id constant; requested without a transition; closed projects included; unknown mode inferred as DIY; linked-task closure writing the home-event outbox; final outcomes revisited; deleted task treated as failure; cross-property check removed; in-transaction access check removed; creation-time link check removed; hire-out leaving the basis unset | each caught; originals verified identical afterwards | Executed |
| Worker gate: exhaustive dispatch (now including the new type); the job reaches the reconciliation handler and stores its outcomes; a terminal error dead-letters at once and a retryable one backs off; the adapters load and run under the seven production stubs; worker `tsc`; import-boundary lint (142 files); the production-style build and the smoke test, now covering both DIY event types | pass | Executed |
| Runtime module count of the job: 1,897 before, 1,906 after (the reconciliation adapters and `diy.service` add 9 modules) | measured | Executed |
| Existing maintenance suites after the transaction change: 36 files that touch the maintenance service | 2 test fakes needed an update (one lacked `$transaction`, one a `diyProject` default in the shared transactional fake); 4 other failures are in unrelated areas (an assertion on an extra field, a boolean, a text check, a missing frontend file) | Executed |

**A defect in my own process, found and fixed.** The first run of the mutation checks used a shell loop that did not split the file list under the shell in use, so no backups were made and the restores silently did nothing: all twelve mutants were applied at once and the results were meaningless. The files were returned to their intended state by applying the exact inverse of each mutation, verified (no markers left, `tsc` clean, the full set of 80 tests passing), and the checks were rerun from a script with verified backups and a comparison after every restore. Nothing mutated was kept.

**Not run:** the real-Postgres acceptance (4c), including the atomicity of the request with the task completion and the transaction wrapper's effect on the real maintenance side effects; the disclosure, recovery and page (4b); the Docker image build and the Pi image; Redis and the poller. **4a must ship with 4b**, and the producer must not be enabled before the worker (the rollout file).

## 13. Slice 4b record: disclosure, recovery and the page (October 6, 2026)

**Built.** Backend: a pure `describeTaskLink` (every row of §3.3, fixed copy, the review-and-confirm wording); the project read now carries `taskLink` beside `completionEffects`, found through the linked task's stored occurrence id and **read-only**; `retryTaskReconciliation` (CONTRIBUTOR, checked in the service as well as the route; dead letters only, the same row once, `recovery` metadata in the payload next to the snapshot and the per-project outcomes, and only when this project's own outcome is not already final) with the route `POST /properties/:propertyId/diy/projects/:projectId/task-reconciliation/retry`; the dead-letter reset is now one shared helper for both recoveries. One correction to the earlier disclosure: a project **closed from its linked task writes no outbox event on purpose**, so `describeCompletionEffects` now treats "completed, no event" as legacy only when the project has no completion basis (otherwise it says nothing). Frontend: types, client, and the page: a panel above the steps for each state, a **Finish updating** button only for people who can write and only for a dead letter, polling (every 10 seconds, at most 12 looks, no promised time) while a task update is under way, and the project's own controls unchanged.

**Validation**

| Check | Result | Kind |
| --- | --- | --- |
| Disclosure mapping: every row, including a missing task shown as "needs review", a retrying `FAILED` event as updating, a completed task with no event or occurrence id as "needs review", an event that is not about this project, a dead letter with a final outcome (not recoverable), closed by the task (completed and hired out), a project the person completed (nothing); the copy asks the person to review and confirm and never says "finish it" or "stop it"; the occurrence id and outcome are read from progress or the final outcome (the final one wins) | pass | Executed |
| Service tests on the shared fake: each state disclosed and found through the occurrence id with a spy proving the read writes nothing and shows no raw error; deleted and foreign tasks; the closed-by-task read leaves the completion-effects disclosure silent; recovery resets only a dead letter (same row, snapshot and outcomes kept, who, when and count recorded); every other state and a final outcome untouched with no conditional write even attempted; two simultaneous recoveries reset once; a viewer, a stranger and another property refused; the route floor | 12 pass; the role-floor suite lists the new route | Executed |
| Page tests: updating (no action, no time), needs review (review-and-confirm wording, the project's own controls still present), needs attention with the action that re-queues and reloads, a viewer without the action, a failed recovery's error, closed by the task with no recording panel, nothing to say, polling bounded at 13 reads and stopping when the state changes | 9 pass (45 across the DIY page, sheet, list and rules suites) | Executed |
| Mutation checks: 10 backend (retrying event hidden; missing task hidden; recovery offered for a final outcome; no-event hidden; foreign event trusted; the read writes; recovery ignoring the dead-letter rule; recovery dropping its metadata; a linked-task closure read as legacy; no access check) and 5 frontend (action shown to viewers; action shown whenever writable; polling unbounded; panel never rendered; not polling while updating) | 15 of 15 caught; originals verified identical to backups after each | Executed |
| Backend `tsc`; `next build`; the DIY, maintenance and incident-reconciliation suites; the wider frontend run | clean; compiled; 266 pass; 471 pass with the same 5 unrelated suites (10 tests) failing as before | Executed |

**Two process notes.** The first frontend mutation run reported every mutant as surviving only because jest prints per-test results for a single file and my filter read nothing for two; with `--verbose` all five were caught. And, as in 4a, every mutation run used a script with verified backups and a comparison after each restore.

**Not run:** the real-Postgres acceptance of any of step 4 (4c): the request's atomicity with the task completion, the worker through the real job, recovery on a real `timestamp(3)` version; a browser; the Docker and Pi images. **4a and 4b are now complete as code and must ship together; 4c is the remaining gate before the producer is enabled.**
