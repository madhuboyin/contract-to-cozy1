# DIY Completion Effects Through the Outbox — Step 3 Implementation Plan

**Date:** October 6, 2026 (revision 3, after two external reviews the same day)
**Status:** **Revision 3, approved for implementation (October 6, 2026): S3-1 to S3-5, S3-7 to S3-9 and S3-11 as written; S3-6 and S3-10 as corrected in this revision (§3.6, §4).** Slice 3a-0 (measurement) is done (§12) slice 3a (backend and worker) is pushed (§13), slice 3b (disclosure, recovery, page) is pushed (§14), and slice 3c (the real-Postgres run through the actual worker job, and the runbook) is built and run locally (§15). The rollout itself is yours. One schema change (an enum value), applied by you.
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

1. **Worker import graph (C7).** Measured in 3a-0 (§12): both canonical services are already loaded by the worker today, so no new modules enter its graph. The remaining risk is the **production worker image replacing seven backend modules with stubs** (§12, F4), which the development closure does not reproduce; the 3c run applies the same stubs.
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

## 12. Slice 3a-0 record: measurements (October 6, 2026)

No product code was changed. Two throwaway scripts (in the scratchpad, not committed) computed static import closures and loaded the worker. The one environment change: the worker's **generated Prisma client was stale** (September 13, so it lacked every table added since), which made the worker `tsc` report 148 errors unrelated to this plan; I regenerated it locally with `npm run prisma:generate` in `apps/workers` (no database involved). Anyone running the worker gate must do the same first.

| # | Finding | Label |
| --- | --- | --- |
| F1 | **Neither canonical service adds anything to the worker.** `homeEvents.service.ts` (closure 70 backend files) and `PropertyMaintenanceTask.service.ts` (closure 367) are already in the worker's static closure: 0 files of either are new (the worker's closure is about 976 backend files). The maintenance service is reached through `homeOperationsReconciliation.job.ts`. Loading `worker.ts` for real (transpile-only, a placeholder database URL) loaded 4,007 modules in about 7.5 seconds and **both services were in the module cache**. This corrects plan item C7 and §9 risk 1: the feared new import graph does not exist; the file is named `PropertyMaintenanceTask.service.ts` (capital P), and a first pass that matched it case-insensitively on macOS miscounted it as new, which is why the check was repeated with real-case paths. | Executed (static closure and runtime load) |
| F2 | Baseline gates after regenerating the client: worker `tsc --noEmit` 0 errors; `tsc --project tsconfig.docker.json --noEmit` reported 0 (not the Docker build itself, and it reads backend declarations from `../backend/dist`); `lint:worker-import-boundary` PASS (142 files); the job and poller unit tests 39/39 (the one failure seen before regenerating was the stale client). | Executed |
| F3 | **No exhaustive dispatch test exists.** `processDomainEventsJob.test.js` does not iterate `DomainEventType`; an unhandled type is only discovered when an event of it is processed. The gate's dispatch test is new work. | Code-traced |
| F4 | **The production worker image overwrites seven backend modules with stubs** (`apps/workers/scripts/build-worker-backend-overrides.js`: error middleware, admin audit, notification, gemini, JobQueue, analytics schemas, property service). The maintenance service's closure contains five of them (error middleware, notification, gemini, JobQueue, analytics schemas); the home event service's, two (error middleware, analytics schemas). The error stub is a faithful `APIError`; the analytics stub only replaces zod schemas with pass-through parsers; the JobQueue stub returns null queues. The maintenance service's own file calls only the analytics emitter (lines 257, 702, 722); whether anything on the **transitive** completion path calls the notification, gemini or JobQueue stubs was not traced. | Code-traced; transitive calls unverified |
| F5 | `resolvePropertyAccess` uses the global client, not a transaction, and **performs a write** (it upserts a primary-owner membership for pre-household owners). It cannot be called inside the completion transaction as is. | Code-traced |
| F6 | `startServer()` already throws a FATAL error before `app.listen` for agent deployment readiness (`assertAgentDeploymentReadiness`); the DIY template check runs after listen and only warns. `/api/ready` is static ("ready" whenever the process serves). A throw before `listen` therefore also keeps the pod from becoming ready. | Code-traced |
| F7 | Both services run on the backend's own Prisma client inside the worker process (a second client with its own pool beside the worker's); this is how every `@worker-shared` service already behaves, not new. | Code-traced |

**What this changes in the plan**

1. **The handler boundary (proposed, S3-11):** a pure handler module `services/diy/diyCompletionEffects.ts` with **no service imports** (only types), taking the injected dependencies of §3.2, and a separate adapters module `services/diy/diyCompletionEffectsAdapters.ts` that wires `HomeEventsService`, the maintenance core and Prisma. The worker dispatches through `ProcessDomainEventsDeps` like every other handler. Because F1 removes the import-graph argument, **the maintenance extraction is justified only by §3.6 (no public way to complete a task without the access check)**, not by import size, and stays as small as that: a module-private function called by `updateTaskStatus` after its check and by the adapter.
2. **In-transaction access (F5):** a read-only, transaction-capable variant of the access check is added (membership lookup and the legacy owner check, **no auto-create write**); `resolvePropertyAccess` keeps its behavior for everything else. A legacy owner with no membership row is accepted by the ownership check without writing one.
3. **Fatal enum check (F6):** placed in `startServer()` before `listen`, next to the agent readiness assertion, using a catalog query for the enum label (`pg_enum` joined to `pg_type` for `DomainEventType`), with a message naming `prisma db push`.
4. **Worker gate (F2, F3):** the gate is the existing four checks plus the **new exhaustive dispatch test**, with the local precondition that the worker's Prisma client is regenerated.
5. **Stubs (F4):** the 3c run, and a new unit-level check in 3a, load the handler's adapters **with the same seven stubs applied** (as the scratch script does with `require.cache`), so a completion that depends on a stubbed module is caught before the image is built, not in production. The transitive-call question is answered by that run, not by this trace.

**Not done here:** the Docker image build, a boot of the built `dist`, and any database. The closure scripts can be committed as a worker tool if you want the measurement repeatable.

## 13. Slice 3a record: backend and worker (October 6, 2026)

**Built.** The enum value `DIY_PROJECT_COMPLETED` (not applied to any database); `completeProject` now verifies the actor's CONTRIBUTOR access **inside its transaction** (a new read-only, transaction-capable `hasPropertyRoleWithin`, which does not write the membership row `resolvePropertyAccess` can create), and writes the outbox row in the same transaction with a snapshot (project, property, actor, completed-at, title, category, minutes, cost, linked task); the inline `DiyCompletionService` and its raw maintenance and incident writes are **deleted**; the pure handler `diyCompletionEffects.ts` (preflight, typed outcomes, every effect attempted after preflight, retry-safe), the adapters module wiring the home event service and the maintenance core, and `TerminalDomainEventError` plus a job change that dead-letters it at once; the maintenance status write split into the public `updateTaskStatus` (access check first) and a **private** `completeTaskCore`, reachable for DIY completion only through `completeMaintenanceTaskForDiyOutbox`; a fatal start-up check in `startServer()` before `listen`; the job's dispatch case. The controller response and the page are slice 3b.

**Validation**

| Check | Result | Kind |
| --- | --- | --- |
| Handler tests: both effects with actor and keys; event type by category; no linked task; cross-property terminal before any home event; deleted task skip; already-completed task; home event ok then maintenance fails (retry creates no second home event); maintenance ok then home event fails (no second completion, so no second roll-forward); a failing effect does not stop the other; both race outcomes after the pre-read; malformed snapshots terminal | 15 pass (with boundary and start-up tests) | Executed |
| Completion transaction on the shared fake: one outbox row with the key, scope, actor and snapshot; a failing insert rolls the completion back; a revoked member and a viewer are refused with nothing written; losing access after commit does not matter | pass | Executed |
| Maintenance split: `updateTaskStatus` still refuses a viewer and writes nothing; the internal export skips the second check but keeps the compare-and-swap and idempotent replay | 4 pass | Executed |
| Worker gate: exhaustive dispatch over every `DomainEventType`; DIY event reaches the injected handler and stores its outcome; retryable errors back off; terminal errors dead-letter at once, recognized by flag; adapters load and run under the seven production stubs | 7 pass (5 dispatch, 2 stubs) | Executed |
| Production-style build: `npm run build` for the backend, the stub overrides, `tsc --project tsconfig.docker.json`, `tsc-alias`; the built job imports under a `@worker-shared` link, the stubs are in effect, and the default DIY handler path dead-letters a malformed event (`npm run smoke:built-worker`, now a repeatable script) | pass (913 modules loaded in about 0.6 s) | Executed |
| Backend and worker `tsc`; `lint:worker-import-boundary` | clean; PASS (142 files) | Executed |
| Real Postgres (scratch 15, the 2a-era schema plus the enum value): the whole step 2 script (13) and the template revisions script (18) still pass after the service change; three new checks (16 total): the outbox row and snapshot on a real database, a viewer and a non-member refused with **not even the claim written**, one row per key, and a forced database failure on the last write rolling back the completion, the ledger row and the outbox row together | 34 pass | Executed |
| Mutation checks: outbox insert failure swallowed (1 fails); access check removed (2); cross-property treated as a skip (1); post-race re-read removed (2); stop at the first failure (2); home event created before preflight (5); `updateTaskStatus` without its access check (1); terminal detection removed (2); dispatch case removed (1) | each caught; originals restored (a first attempt at the outbox mutant broke compilation and was redone as a type-safe one) | Executed |
| Wider runs: DIY, Ask DIY and incident-reconciliation suites; the worker unit suite | 172 pass; worker 634 of 638, the 4 failures in risk-calculation mocks, a Dockerfile text assertion and two date-based fund tests, none in code this slice touches (not compared against a clean checkout) | Executed |

**Findings**

1. **`FOLLOW_UP_DUE` has no handler** though `claimFollowUpDue.poller.ts` emits it for every due claim: each event dead-letters after 8 attempts. Found by the new exhaustive test; **not changed** (a product decision); listed in the test as a known gap and in the runbook.
2. **The scratch seed needed a household member** once access is checked in the transaction: the real database refused the second actor until one was seeded, which is the check working. A pre-household owner (no membership row) is accepted without a row being written.
3. **A pre-existing completion limitation, unchanged:** the governed maintenance completion writes the status with a compare-and-swap and then runs side effects; a crash between them means a retry replays by key and does not re-run the side effects. The handler cannot see that.
4. The worker's generated Prisma client was stale (so the local worker gate must regenerate it first); `lint:notification-boundary` fails on three unrelated job files that predate this work.

**Not run:** the Docker image build itself, the worker against a database, the governed maintenance side effects through the worker (seasonal sync, recurring roll-forward), the lease-reclaim and duplicate-delivery runs (3c), and any browser. 3a is not safe to deploy alone: the page still reads `homeEventId` from the completion response (now always null) until 3b.

## 14. Slice 3b record: disclosure, recovery and the page (October 6, 2026)

**Built.** Backend: a pure `describeCompletionEffects` (fixed copy; retrying `FAILED` is "recording", only a dead letter offers recovery, a completed project with no outbox row is legacy-unknown); `getProjectWithCompletionEffects` (the project read now carries `completionEffects`; **read-only**); `retryCompletionEffects` (CONTRIBUTOR, checked in the service as well as the route; resets the **same row** only from `DEAD_LETTER`, conditional on status and version, attempts to zero, and records `recovery: { count, lastBy, lastAt }` in the event's own payload); the route `POST /properties/:propertyId/diy/projects/:projectId/completion-effects/retry`; the completion response is now `{ homeEventId, effects: 'RECORDING' }`. Frontend: types, client (`retryDiyCompletionEffects`, the new completion response), the sheet no longer expects a home event id, and the project page shows the recording, recorded, needs-attention (with "Finish recording" for people who can write) and legacy states, polls a bounded number of times while recording (every 10 seconds, at most 12 times, no promised time), keeps the home-event link, and says an incident-linked completion did not change the incident.

**Validation**

| Check | Result | Kind |
| --- | --- | --- |
| Backend disclosure and recovery tests on the shared fake: the state mapping; every outbox state disclosed with a spy proving the read writes nothing and never shows `lastError`; recovery resets only a dead letter (same row, attempts zero, snapshot kept, actor, time and count recorded); every other state untouched, with no conditional write even attempted; two simultaneous recoveries reset once; a second recovery increments the count; a viewer, a stranger and another property's project refused; the route floor and the response | 8 pass; the route-floor suite now lists the new route (17 pass) | Executed |
| Backend mutation checks: recovery also resets `FAILED`; recovery write not conditional on status; `FAILED` shown as needs attention; legacy shown as recorded; recovery drops its metadata; the read writes; recovery without an access check | 7 of 7 caught; originals restored | Executed |
| Frontend page tests: recording (no action, no time promised); needs attention with the action, which re-queues and reloads; a viewer sees the message but not the action; a failed recovery shows its error; recorded with a home event; legacy copy; open project shows nothing; incident note present and absent; the sheet saves, reloads and shows "recording" with the project version sent; polling while recording, stopping once recorded, and bounded at 13 reads | 12 pass (35 across the DIY page, sheet and list suites) | Executed |
| Frontend mutation checks: action offered while recording; action offered to viewers; polling unbounded; incident note removed; polling continues after recorded | 5 of 5 caught | Executed |
| Real Postgres (scratch 15): every outbox state disclosed with the event row's version unchanged by the read; recovery on a real `timestamp(3)` version resets once under two simultaneous requests, leaves every other state untouched, keeps the snapshot, never adds a row, refuses a stranger | 18 pass in the step script | Executed |
| Backend `tsc`; `next build`; the DIY, maintenance-split and incident-reconciliation suites; the wider frontend run | clean; compiled; 175 pass; 462 pass, with the same 5 unrelated suites (10 tests) failing as before | Executed |

**A defect found while testing.** The first polling effect re-armed only when the project object changed identity, so a reload that returned an equal project would silently stop the polling; it now uses an explicit counter.

**Not run:** a browser; the worker end to end against the page (3c); the recovery against a live dead letter. **3a and 3b are now complete as code; the release train in `DIY_COMPLETION_OUTBOX_ROLLOUT.md` still applies, and the real-Postgres acceptance through the actual job (3c) is still open.**

## 15. Slice 3c record: the real worker job against real Postgres (October 6, 2026)

**Built.** `apps/workers/tests/scratch/diyCompletionOutbox.scratch.js` (13 checks, guarded like the earlier scratch scripts: a local URL whose database name contains "scratch", never port 5433). It runs the **real** completion service, the **real** `processDomainEventsJob` with its default dependencies, the real handler and adapters, the real home event service and the real governed maintenance completion against an empty throwaway Postgres 15 with the current schema. `WORKER_STUBS=1` re-runs it with the seven backend modules the production image replaces with stubs, which answers the question left open in §12 F4.

**Validation (scratch Postgres 15, `scratch_c2c_3c`; nothing touched your data)**

| Check | Result | Kind |
| --- | --- | --- |
| **Happy path:** the completion writes one `PENDING` outbox row and nothing inline; the real job processes it; the home event exists with the actor, type and key and is linked to the project; the task is `COMPLETED` through the governed path (completion key, `recordedByUserId`, `fulfillmentMode: DIY`, actual cost), its **recurring due date rolled forward**, its **seasonal item completed and checklist counter incremented**, and a **radar reconciliation request** emitted; the linked **incident is untouched** (still `ACTIVE`, no `resolvedAt`) | pass | Executed |
| **Duplicate delivery:** the same event delivered again: outcome `ALREADY_DONE` for both effects, one home event, no second roll-forward, no second counter bump | pass | Executed |
| **Partial failure:** the home event insert refused (a database trigger) after the task completed: event `FAILED` with backoff and a `HOME_EVENT` message; the retry creates the home event and completes nothing twice | pass | Executed |
| **Dead letter and recovery:** a persistent failure walks the real backoff to `DEAD_LETTER` at 8 attempts; recovery re-queues the same row (count 1, actor recorded); the next run processes it and the page state becomes recorded | pass | Executed |
| **Two workers racing** for one event: one claims, the other finds it taken; one home event; `attempts` is 1 | pass | Executed |
| **Lease:** an expired lease is reclaimed and processed (attempts 2); an unexpired lease is not touched | pass | Executed |
| **A handler overlapping its own retry** (two concurrent runs of the real handler): one home event, the task completed once, the seasonal counter moved once, a third run converges to `ALREADY_DONE` | pass | Executed |
| **Integrity and edges:** a task on another property dead-letters on the first attempt with **no home event created**; a deleted task is a typed skip with the home event still created; no linked task is `NOT_LINKED` and a non-improvement category is a `MAINTENANCE` event; a task someone else already completed is left alone with its due date and the seasonal counter unchanged; the actor removed from the household after completion does not strand the effects, and the home event is still attributed to them | pass | Executed |
| Stability: 8 runs without stubs and 8 with the production stubs, plus the first runs | 13 of 13 each, no errors logged | Executed |
| **Under the production stubs** (error middleware, audit, notification, gemini, job queue, analytics schemas, property service): the whole path above, including seasonal sync, radar request, the adherence signal and the work item sync | pass; nothing on this path depended on a stubbed module | Executed |
| Negative controls on the real database: the already-completed short circuit removed (5 checks fail); the home event created without lookup or key (11); the job's claim made non-atomic (1: with keyed effects the second worker still adds nothing, so only the claim count shows it, which is defense in depth); preflight moved after the home event (6); the handler stopping at its first failure (1) | each caught; originals restored | Executed |

**Test defects found and fixed along the way (not product defects).** Raw `now()` in a non-UTC session wrote local time into UTC `timestamp(3)` columns, so an "unexpired" lease was already expired; an `availableAt` reset to the database's `now()` could round up past the job's clock and make a redelivered event miss its run (the intermittent failure, found by repeating the stubbed run six times); a test that called the handler directly left its outbox row open for the next test; scratch ids that were not UUIDs made the analytics emitter log an error.

**Answers to earlier open questions.** §12 F4 (transitive calls into stubbed modules): none of the stubs affected the completion path as exercised. §8 stale-handler (item 19): the keyed effects and the claim held under real concurrency. §2 C9 / §13 finding 3 (side effects after the compare-and-swap): not exercised here, because no crash was injected between the status write and its side effects.

**Not run:** the Docker image build and the Raspberry Pi (ARM) image; Redis and BullMQ (the job was invoked directly, not by the 30-second poller); the radar reconciliation request being consumed; a crash between the maintenance status write and its side effects; production-sized data; a browser; paths this run did not use (a task whose `actionKey` is a project follow-up, other maintenance sources).

**Step 3 is complete as code and as local verification. The rollout steps are yours (`docs/operations/DIY_COMPLETION_OUTBOX_ROLLOUT.md`), and §4's rule holds: the enum, then the worker, then this acceptance where a scratch database exists, then the backend.**
