# DIY Completion Effects Through the Outbox — Step 3 Implementation Plan

**Date:** October 6, 2026 (revision 3, after two external reviews the same day)
**Status:** **Revision 3, approved for implementation (October 6, 2026): S3-1 to S3-5, S3-7 to S3-9 and S3-11 as written; S3-6 and S3-10 as corrected in this revision (§3.6, §4).** Slice 3a-0 (measurement, no behavior change) is approved to begin first, and the final handler dependency boundary is chosen after it. Nothing else is built. One schema change (an enum value), applied by you.
**Parent design:** [`ASK_COZY_STATEFUL_GUIDE_DESIGN.md`](ASK_COZY_STATEFUL_GUIDE_DESIGN.md) §13, step 3 (P4; decisions O3 and O13, approved October 6, 2026), D8, E6, E7, E17, E18
**Follows:** [`ASK_COZY_DIY_STEP_TRANSITIONS_PLAN.md`](ASK_COZY_DIY_STEP_TRANSITIONS_PLAN.md) (step 2, pushed; its rollout is yours)
**Method:** `AUDIT_METHODOLOGY.md` design items 11-20, plus its section 7 adversarial pass (§8). Labels: **[Code-traced]** read, not run; **[Executed]** ran. Nothing in this document was executed.

## 1. Goal and boundary

**Goal.** When a DIY project is completed, the things that should follow (a home event, the linked maintenance task) happen **durably, once, attributed to the person who completed it, and visibly**: a crash or a failure leaves a retryable record instead of a silent loss, integrity problems stop loudly instead of being accepted, and a stuck effect can be re-driven only by an explicit action, never by a read.

**In scope:** `completeProject` (writes the outbox row in its own transaction), a worker handler with narrow injected dependencies, removal of the inline effects and of the raw incident writes, a read-only disclosure of effect status including legacy projects, a recovery action for dead-lettered events, the page changes these need, and the gates that must pass before the producer can ship.

**Out of scope:** reverse reconciliation when a maintenance task is completed elsewhere (step 4, O12); the Ask guide, its read operation and its confirmed recovery operation (later; this step builds the service and route that operation will call); any change to how incidents are resolved (O13); an operator "retry now" for an event that is still retrying (a separate administrative mechanism, not built here).

## 2. What exists today

| # | Finding | Label |
| --- | --- | --- |
| C1 | `completeProject` commits the completion, then calls `DiyCompletionService.onComplete` inline, after the transaction. A crash or a failed write between the two loses the effects with no record. Each effect's failure is caught, logged and swallowed. | Code-traced |
| C2 | `onComplete` creates the home event through `HomeEventsService.createHomeEvent` (key `diy-complete-<projectId>`, actor as `createdById` since step 2), then sets `DiyProject.homeEventId`. `createHomeEvent` uses the global client, not a caller's transaction, and does follow-up writes after the insert, so it cannot join the completion transaction. | Code-traced |
| C3 | A linked maintenance task is set `COMPLETED` with a raw `updateMany`: no access check, no completion details, no idempotency key, no `applyTaskCompletionSideEffects` (seasonal item and counters), and a recurring task is not rolled forward. The governed `PropertyMaintenanceTaskService.updateTaskStatus` does all of that and is idempotent per `completionIdempotencyKey`. | Code-traced |
| C4 | A linked incident is set `RESOLVED` with a raw `updateMany` from any non-terminal status, then `syncIncidentWorkItem` walks its work item to `VERIFIED`. A self-reported completion becomes verified evidence (E17). | Code-traced |
| C5 | The durable outbox exists: `DomainEvent` (unique `idempotencyKey`, status, attempts, lease, `availableAt`) and `DomainEventsService.emit(input, db)` accepts a transaction client. The worker polls every 30 seconds, claims with a 15-minute lease renewed by heartbeat, retries with backoff (1, 2, 5, 10, 30, then 60 minutes), and dead-letters after 8 attempts. A handler that throws is retried; one that returns is marked `PROCESSED` by a guarded write. **`FAILED` means "failed, will be retried automatically at `availableAt`"; only `DEAD_LETTER` is terminal.** | Code-traced |
| C6 | `DomainEventType` is a Prisma enum, so a new event type is a schema change; the worker's dispatch throws on an unhandled type, which becomes a retry and eventually a dead letter. A `DomainEvent` insert with a value the database enum lacks fails. | Code-traced |
| C7 | The worker job is built around a **bounded dependency interface** (`ProcessDomainEventsDeps`, one optional function per handler, with default implementations), and has unit tests (`apps/workers/tests/unit/processDomainEventsJob.test.js`, `domainEventsPoller.test.js`). Workers reach backend code through `@worker-shared`; the Docker build compiles the whole backend and links it; `npm run lint:worker-import-boundary` checks the alias imports resolve. Backend modules loaded by the worker use the backend's own `lib/prisma` singleton. The workers import neither `HomeEventsService` nor `PropertyMaintenanceTaskService` today, and the size of their import graph has not been measured. | Code-traced (the negative is a search result) |
| C8 | The page reads `homeEventId` from the completion response and shows a link only when the project has one. The controller returns `{ homeEventId: project.homeEventId }`. | Code-traced |
| C9 | `updateTaskStatus(userId, taskId, 'COMPLETED', ..., completionIdempotencyKey, completionDetails)` first calls `getTask(userId, taskId, 'CONTRIBUTOR')` (an access check), returns the task unchanged when the same key already completed it, compare-and-swaps on `updatedAt`, and throws "changed by a concurrent update" when it loses (unless the winner used the same key). It does not special-case a task already completed under a different key. The core after the access check is a separate concern from the check. | Code-traced |
| C10 | The route that completes a project is behind the property-access middleware with a CONTRIBUTOR floor (P0), so the person completing is authorized for the property at the moment of the transaction. | Code-traced |

## 3. Target behavior

### 3.1 One transaction, one outbox row

`completeProject` keeps its transaction (claim, rule check, `COMPLETED` write, ledger row). **Inside it**, `DomainEventsService.emit` inserts one `DomainEvent`: type `DIY_PROJECT_COMPLETED`, `idempotencyKey` `diy-project-completed:<projectId>`, `propertyId`, `userId` = the actor, and a payload that is a **snapshot of what was completed**: project id, property id, actor, `completedAt`, title, category, actual minutes and material cost, and the linked maintenance task id. If the insert fails the whole completion rolls back: no completed project without its record. The inline `onComplete` call and the post-commit re-read are removed.

### 3.2 The handler: narrow, injected, typed

The handler lives in its own small module with **no imports of backend service graphs**; everything it touches comes through an injected interface, the same pattern the job already uses:

```text
processDiyProjectCompletedEvent(event, deps)
  deps.findHomeEvent / deps.createHomeEvent   (home event adapter, keyed)
  deps.linkHomeEvent(projectId, homeEventId)  (conditional write: only where homeEventId is null)
  deps.getTask(taskId)                        (id, propertyId, status)
  deps.completeTask(input)                    (governed maintenance completion, no access check; see 3.6)
  returns a per-effect outcome
```

The default adapters wrap the canonical operations. **Where an operation cannot be called without pulling in a broad service graph, its domain core is extracted into a small injectable function** and both the service and the adapter call it (for maintenance, the part of `updateTaskStatus` after the access check, §3.6). A first step of slice 3a **measures the worker's transitive import closure before and after** and the extraction is chosen from that measurement, not assumed.

**Preflight first.** Before either effect runs, the handler validates everything that can fail terminally: the snapshot is well formed, and the linked task (if any) exists and belongs to the snapshot's property. A cross-property task dead-letters **before** the home event is created, so an integrity failure never leaves a half-applied completion. A task that no longer exists is recorded as a typed skip. Only after preflight passes does the handler attempt each effect, **even if an earlier one failed**; it throws if any failed, so the event retries and the retry skips what is already done. Outcomes are **typed**, stored as `processingOutcome` on success and named in `lastError` on failure:

| Effect | Outcome | Meaning | Event result |
| --- | --- | --- | --- |
| Home event | `DONE` / `ALREADY_DONE` | Created, or the keyed event already existed | continue |
| Maintenance | `DONE` | Completed through the governed path | continue |
| Maintenance | `ALREADY_DONE` | Task is `COMPLETED` (found on the pre-read, or on the **re-read after a race**, §3.3) | continue |
| Preflight | `SKIPPED_TARGET_MISSING` | The task row no longer exists (deleted) | home event only; typed skip for the task |
| Preflight | `INTEGRITY_CROSS_PROPERTY` | The task exists but its property is not the snapshot's | **terminal failure before any effect: dead-letter at once**, never a skip |
| Maintenance | `CONFLICT_STATE` | After a lost race the task is in a state other than `COMPLETED` | fail (retried; reaches the dead letter if it persists) |
| Maintenance | `NOT_AUTHORIZED` | Not produced by this design (§3.6): authority is captured at commit | n/a |
| Any | `UNEXPECTED` | Anything else | fail (retried) |

The job gains one small, tested capability: a handler may throw a **terminal** error that dead-letters immediately instead of consuming eight attempts. It is used only for `INTEGRITY_CROSS_PROPERTY`.

**Incident: nothing (O13).** The raw update and `syncIncidentWorkItem` are deleted. A DIY completion never changes an incident or creates verified evidence.

### 3.3 The race after the pre-read

The handler reads the task, then calls the governed completion. Another actor can complete it in between. If the governed call reports a concurrent change, or the task is found already `COMPLETED` under a different key, the handler **re-reads the task**: `COMPLETED` is recorded `ALREADY_DONE` (no retry, no second roll-forward, no counter bump); any other state is `CONFLICT_STATE`. A transition that already succeeded elsewhere is never retried forever.

### 3.4 Disclosure (read-only) and the states a person sees

The project detail gains `completionEffects`, derived only from the event row and the project, with **fixed copy** (the raw `lastError` is never shown):

| Event state | Presentation | Recovery offered |
| --- | --- | --- |
| *(no row; project not completed)* | nothing | none |
| `PENDING`, `PROCESSING` | "Recording your completion" | none |
| `FAILED` (retries remaining) | "Recording your completion" (still working on it) | **none**: it retries automatically, and a reset would hide the retry count and could postpone dead-lettering indefinitely |
| `DEAD_LETTER` | "Some records could not be updated" | **"Finish recording"** |
| `PROCESSED` | "Completion recorded" | none |
| *(no row; project completed before this release)* | **"Completion was recorded before effect tracking was added. Related record updates are not verified here."** | none (no history is reconstructed) |

The legacy state is told apart by the project (`COMPLETED`, no outbox row) and is distinct from "not applicable" and from "processed under the new system". **No read writes anything.**

### 3.5 Recovery: dead letters only

`retryCompletionEffects(projectId, propertyId, actor)` (CONTRIBUTOR floor) resets **the same event row** to `PENDING` (attempts 0, `availableAt` now) with a write conditional on `status = DEAD_LETTER`. Any other state is a no-op that returns the current state: it never touches `PENDING`, `PROCESSING`, `FAILED` or `PROCESSED`, so it cannot compete with automatic retry. Two simultaneous requests reset the row once. The same write records **bounded recovery metadata in the event's existing payload** (`recovery: { count, lastBy, lastAt }`, the count incremented, only the latest actor and time kept), conditional on both the status and the `updatedAt` it read, so two simultaneous requests cannot both apply and a concurrent worker write cannot be overwritten; no schema column is needed. It never creates a second row and never runs an effect itself: the worker is the only trigger (methodology item 18). Route: `POST /api/properties/:propertyId/diy/projects/:id/completion-effects/retry`. The page shows "Finish recording" only for `DEAD_LETTER`. Resetting attempts is acceptable here because a dead letter is already terminal and the action is deliberate and visible; who reset it, when and how many times is durable on the row (and also logged). The Ask confirmed operation wrapping this comes later.

### 3.6 Authority: verified at the mutation boundary, then durable intent (decision S3-6)

Two options, decided explicitly:

- **A. Re-authorize the actor at worker time.** Access lost between completion and the worker run leaves a completed project permanently without its home event or task completion.
- **B. Treat the committed outbox row as durable, already-authorized intent** and execute without a second check, **keeping the real actor for attribution** (recommended, as corrected at review).

The route middleware's CONTRIBUTOR check (C10) runs **before** the completion transaction, so on its own it leaves a revocation window and is not the authorization of record. Therefore **`completeProject` verifies the actor's access at the mutation boundary, inside the transaction that writes the completion and the outbox row** (the same role rule the middleware applies, evaluated against the committed household state; the 3a code trace picks the existing function and records it). It **snapshots `actorUserId`, `propertyId`, `projectId` and the linked task id** into the payload. The worker then relies on that durable, authorized intent, uses the actor **only for attribution**, and checks **integrity** (the task belongs to the snapshot's property, §3.2), not permission. No system actor is introduced.

The maintenance operation's core (compare-and-swap, idempotency key, completion details, side effects) is extracted so the adapter can call it without the second access check. **The extracted core is internal**: it is not a public method of `PropertyMaintenanceTaskService`, is importable only from the DIY completion adapter's module, and a test pins that the public service surface still has no way to complete a task without its access check and that `updateTaskStatus` still refuses a viewer. Ordinary callers cannot bypass the check.

### 3.7 The page, and what we do not promise

The completion response becomes `{ homeEventId: null, effects: 'PENDING' }`. The sheet says the completion is saved and records are being updated. The project page shows the home-event link once `homeEventId` exists and the disclosure in §3.4. **No ETA is shown**: the worker polls on a 30-second interval, but queue delay, a poll in progress, backoff, a deployment or load can all make it longer, so the copy says "Recording…" and, once done, "Completion recorded". For an incident-linked project the completion note says the linked incident was **not** changed and is updated from the incident.

## 4. Rollout order and the activation question (decision S3-10)

3a and 3b are **one release train deployed sequentially**, not one simultaneous deploy. The order, with what each misordering does:

1. **Apply the enum** (`prisma db push`) and regenerate clients in `apps/backend` and `apps/workers`. *If the backend ships before this:* **the backend fails its start-up and readiness check** (below) and does not take traffic, so completion can never reach production knowing it will fail.
2. **Deploy the worker image** that understands `DIY_PROJECT_COMPLETED`, restart it, and confirm it booted and dispatches (the worker gate in §6).
3. **Run the real-Postgres acceptance (3c) against a scratch database before enabling the producer, when one is available.** It is the only check of atomicity, leasing and duplicate delivery. **If no scratch database is available, that is recorded in the rollout notes as a known gap: atomicity, leasing and duplicate-delivery behavior are unverified against Postgres at the point the producer goes live**, and the rollout does not describe any later run as validation of an already-safe rollout.
4. **Deploy the backend** (producer, recovery route, read projection). *If the worker is missing at this point:* events wait, retry and dead-letter after 8 attempts (hours); they are recoverable with §3.5, and the page says so.
5. **Deploy the frontend** disclosure.

No feature flag (you control the order, and this repository avoids flags). The protection against a misorder is **fatal, not advisory**: the backend's start-up check queries the database for the `DIY_PROJECT_COMPLETED` enum value and **fails start-up (and the readiness probe, if one exists; the 3a trace records which)** when it is missing, with a message naming the `prisma db push` step. This deliberately makes a backend deployed ahead of the enum fail to start rather than serve completions it knows will fail. If you would rather have an enforced activation switch for the worker-missing case, say so; it would be a temporary switch removed after rollout.

## 5. Schema

One change, additive: `DIY_PROJECT_COMPLETED` added to `DomainEventType`. No new table or column. Effect state needs nothing more: it is derived from the event's `status`, `attempts`, `payload.processingOutcome` and `lastError`.

## 6. Slices

| Slice | Content | Gate |
| --- | --- | --- |
| **3a-0 (spike, no behavior change)** | Measure the worker's transitive import closure and what initializes on import for the two canonical operations; decide the extraction. Add the exhaustive dispatch test over every `DomainEventType`. | Measurement recorded in the plan |
| **3a** | Enum value; the handler with injected dependencies and typed outcomes; the terminal-error capability in the job; the dispatch case; the maintenance core extraction; the outbox insert in the completion transaction; removal of the inline effects and the incident writes; start-up enum check; unit tests on the fake with mutation checks | **Worker gate (must pass before the producer ships):** worker `tsc`; production worker build (`build:docker` path); `lint:worker-import-boundary`; the boot/import smoke test (the built worker loads with the handler and no backend-only module initializing); the exhaustive dispatch test; the dependency-injected job path invokes the handler |
| **3b** | `completionEffects` in the project detail (including legacy); the recovery service and route; the controller response; frontend types, client, sheet and page (recording, dead letter, recover, legacy, incident note); tests | With 3a |
| **3c** | Guarded real-Postgres run through the real `processDomainEventsJob` (atomic rollback, lease reclaim, double delivery, recovery, the recurring-task and seasonal effects), rollout runbook | Run **before the producer is enabled** (§4 step 3) when a scratch database is available; if not, the gap is recorded, not implied closed. It is separate from the worker gate above, which has no database dependency |

**3a and 3b are one release train, deployed sequentially with the worker image first, in the order of §4.**

## 7. Validation plan

| Check | Kind (when run) |
| --- | --- |
| Completion writes the event in the same transaction; a failing insert leaves the project open | Test, fake |
| Home event succeeds and maintenance fails: the retry creates no second home event | Test, fake |
| Maintenance succeeds and the home event fails: the retry causes no second recurring roll-forward | Test, fake |
| The task becomes completed between the pre-read and the governed call: `ALREADY_DONE`, no retry; it moved to another state: `CONFLICT_STATE` | Test, fake |
| Cross-property linked task: terminal dead-letter at once (not a skip); deleted task: `SKIPPED_TARGET_MISSING`; already completed: `ALREADY_DONE` | Test, fake and job |
| Access is verified inside the completion transaction: an actor whose access was revoked before the mutation is refused and nothing is written; the payload snapshots actor, property, project and task ids; the actor losing access **after** commit does not stop the effects (policy B) | Test, fake |
| The extracted maintenance core is not on the public service surface; `updateTaskStatus` still refuses a viewer | Test |
| Cross-property task: dead-lettered at preflight with **no home event created** | Test, fake and job |
| No incident or work-item write happens on completion | Test, spy on writes |
| A read of the project in every outbox state performs no write; the legacy state shows the fixed copy; "not completed" shows nothing | Test, spy |
| Recovery changes only `DEAD_LETTER`; `PENDING`, `PROCESSING`, `FAILED` and `PROCESSED` are untouched; two simultaneous requests reset once; a viewer is refused; the payload records actor, time and a recovery count that increments, without losing the snapshot | Test |
| The start-up check **fails** (does not warn) when the enum value is missing, and passes when present; a completion with the insert failing rolls back | Test, fake |
| Exhaustive dispatch over every `DomainEventType`; the injected job path calls the handler; the built worker boots with it | Worker gate |
| Mutation checks: outbox insert moved outside the transaction; inline effect reintroduced; incident write reintroduced; recovery resetting `FAILED`; recovery creating a new row; handler stopping at the first failure; maintenance called without the key; cross-property treated as a skip; the post-race re-read removed | Executed in 3a/3b |
| Real Postgres through `processDomainEventsJob` | 3c |
| `npm run typecheck` (backend and workers), `next build`, affected Jest, backend and worker suites, the startup registry validators | Each slice |

## 8. Adversarial pass (methodology section 7) [Code-traced; the answers to be tested]

- **Partial failure, both directions.** Covered by the two retry tests in §7, each asserting no duplicate and no second roll-forward.
- **Access revoked around the completion.** Access is verified in the completion transaction, so a revocation before the mutation is refused; one after commit does not strand the effects (policy B), and the integrity check, not a permission check, protects the task.
- **Cross-property or tampered linkage.** Dead-letters at once with a typed code; never accepted.
- **Stale handler (item 19).** A handler that outlives its lease while a second attempt starts: both effects are keyed (home event key, task completion key, conditional `homeEventId` write), so the second cannot add a record. On Postgres in 3c.
- **Recurring task.** Governed completion rolls its due date forward and fires the seasonal sync; the raw update never did. A behavior change, named in S3-9.
- **Recovery race and repeated resets.** Conditional on `DEAD_LETTER`; a `FAILED` event is never reset, so automatic backoff and the retry count are not disturbed, and repeated clicks cannot postpone dead-lettering.
- **Read-time writes.** The disclosure reads only; a spy test asserts it.
- **Producer before consumer.** The enum case stops the backend from starting; the worker-missing case is recoverable and disclosed (§4).
- **Legacy projects.** Told apart from "none needed" with honest copy; nothing reconstructed.
- **Overclaim check on this revision (methodology item 9).** "Policy B is safe" now rests on the in-transaction access check this plan adds (§3.6), not on the route middleware alone; the P0 floor test is cited, not replaced. "No flag needed" rests on you controlling the deploy order, and the fatal start-up check is what enforces the enum half of it; nothing in code enforces worker-before-backend.

## 9. Risks

1. **Worker import graph (C7).** A broken import could crash-loop the worker at boot (this repository has had that failure). Mitigated by the 3a-0 measurement, the injected boundary and the worker gate before any producer ships.
2. **Latency.** The home-event link appears after the next worker cycle at the earliest; no promise is made.
3. **Retry copy.** Failure text is fixed; the real error stays in `lastError` and the logs for you.
4. **Refactoring the maintenance operation.** The extraction touches a heavily used service; the change is a split at the existing access-check boundary and is pinned by the existing task tests plus a new one for the viewer refusal.

## 10. Decisions (each with the recommended default)

| # | Decision | Recommendation |
| --- | --- | --- |
| **S3-1** | Both effects (home event and maintenance task) go through the outbox; the completion response no longer carries the home event id | Approved at review |
| **S3-2** | Maintenance completes through the governed operation with the actor, `fulfillmentMode: 'DIY'` and the project's key; typed outcomes; the post-pre-read race re-reads the task (§3.2, §3.3) | Yes |
| **S3-3** | Delete the raw incident update and `syncIncidentWorkItem` from DIY completion (O13); the page says the incident was not changed | Approved at review |
| **S3-4** | `completionEffects` is a read-only disclosure with fixed copy and the states in §3.4 (auto-retrying `FAILED` is "recording", `DEAD_LETTER` is "could not be updated", legacy is "not verified here") | Yes |
| **S3-5** | Recovery applies to `DEAD_LETTER` only, resets the same row once, and never touches a retrying event; an operator "retry now" is a separate future mechanism | Yes |
| **S3-6** | **Authority: verified in the completion transaction, then durable intent (policy B)**; the payload snapshots actor, property, project and task ids; the worker checks integrity and uses the actor only for attribution; the extracted maintenance core is internal and not callable from the public service surface | Policy B, as corrected |
| **S3-7** | No backfill; legacy completed projects show the honest "not verified here" copy | Yes |
| **S3-8** | Schema: only the enum value `DIY_PROJECT_COMPLETED` | Yes |
| **S3-9** | Accept the behavior changes: the home-event link appears after the next worker cycle (no ETA); a linked recurring task now rolls forward and fires seasonal sync; an incident-linked completion no longer resolves the incident | Yes |
| **S3-10** | Rollout order is §4 (one release train, sequential); no feature flag; a missing enum value **fails backend start-up and readiness**; 3c runs before the producer is enabled when a scratch database exists, otherwise the gap is recorded. Alternative: a temporary activation switch | No flag, fatal check |
| **S3-11** | Narrow injected handler dependencies, the terminal-error capability in the job, and the worker gate in §6 (including the exhaustive dispatch test) before any producer can ship | Yes |

## 11. How this revision answers the review

| Review point | Where |
| --- | --- |
| 1. No manual recovery for retrying `FAILED` | §3.4, §3.5, S3-4, S3-5 |
| 2. Cross-property is an integrity failure; typed outcomes | §3.2 |
| 3. Race after the pre-read | §3.3 |
| 4. Worker import verification before deployment | §6 worker gate, S3-11 |
| 5. Narrow adapters, not broad service graphs | §3.2, §6 (3a-0), S3-11 |
| 6. Authority after the transaction | §3.6, S3-6 |
| Review 2.1 Authorization at the mutation boundary; internal maintenance core | §3.6, S3-6 |
| Review 2.2 Fatal enum check | §4, S3-10 |
| Review 2.3 Preflight before any effect | §3.2 |
| Review 2.4 Durable recovery attribution | §3.5 |
| Review 2.5 Release-train and 3c-before-producer wording | §4, §6 |
| 7. Honest legacy disclosure | §3.4, S3-7 |
| 8. Explicit rollout order | §4, S3-10 |
| 9. No 30-second promise | §3.7, S3-9 |
| Additional validation | §7 |
