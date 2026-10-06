# DIY Step and Project Transitions — Step 2 Implementation Plan

**Date:** October 6, 2026
**Status:** **Approved October 6, 2026: S2-1 to S2-9 at the recommended defaults (§11).** Nothing is built yet; implementation starts at slice 2a.
**Parent design:** [`ASK_COZY_STATEFUL_GUIDE_DESIGN.md`](ASK_COZY_STATEFUL_GUIDE_DESIGN.md) §13, step 2 (decisions O3, O10, O11, approved October 6, 2026), D3 and D8
**Follows:** [`ASK_COZY_DIY_TEMPLATE_REVISIONS_PLAN.md`](ASK_COZY_DIY_TEMPLATE_REVISIONS_PLAN.md) (step 1, implemented; its rollout is the owner's and is independent of this step's code)
**Method:** `AUDIT_METHODOLOGY.md` design items 11-20. Labels: **[Code-traced]** read, not run; **[Executed]** ran. Nothing in this document was executed.

## 1. Goal and boundary

**Goal.** Make every DIY step and project transition **actor-aware, version-checked, atomic, and consistent with the completion rule**, so a stale or racing request cannot overwrite newer state, a project cannot complete while steps are open, and the person who acted is the person recorded. This is the foundation the Ask guide's step commands need (design D8), and it also fixes the existing page.

**In scope:** `updateStep`, `completeProject` and `abandonProject` in the shared service and their routes, validators, client and page; the actor passed into the existing completion side effects; the schema columns this needs.

**Out of scope (later steps):** the completion outbox and the governed maintenance and incident effects (step 3: until then `DiyCompletionService` still completes a linked maintenance task and incident the old way, with the actor now passed through); maintenance-to-DIY reconciliation (step 4); any Ask surface (steps 5-6); `updateProject` (notes and photos), see S2-8.

## 2. What exists today

| # | Finding | Label |
| --- | --- | --- |
| T1 | `updateStep` reads the project and its steps, writes the project (`PLANNING` to `IN_PROGRESS`), then writes the step: two separate writes, no transaction, no check of the step's current status, no order check. Any step can be set to any status in any order, and the request carries no version. | Code-traced |
| T2 | `completeProject` checks "already completed", then updates, then runs `onComplete`: the check and the update are separate, nothing requires steps to be done, and notes are appended with a read-modify-write. The controller returns `homeEventId`. | Code-traced |
| T3 | `abandonProject` updates unconditionally (it can overwrite `COMPLETED` with `ABANDONED`) and records no actor. | Code-traced |
| T4 | The controllers pass no actor to these three service methods (`req.user.userId` goes only to analytics). `DiyCompletionService` creates the `HomeEvent` with `project.userId` and syncs the incident with `project.userId`. `HomeEventsService.createHomeEvent` already takes the actor as `userId` and stores it as `createdById`. | Code-traced |
| T5 | `DiyProjectStep` has no `updatedAt` and no actor. `DiyProject` has `updatedAt` (bumped only when the project row itself is written), `userId` (the creator) and no actor columns. | Code-traced |
| T6 | Request schemas: step `{ status, notes? }`, complete `{ actualMinutes?, actualMaterialCostCents?, notes? }`, abandon `{ hireOut }`. The page sends no version, and `DiyProjectStep` in the frontend types has no `updatedAt`. The page shows "Complete Project" when every **required** step is complete and ignores optional steps. | Code-traced |
| T7 | `ProjectStepList` offers Start step, Mark done and (for optional steps) Skip on any expanded step that is not done or skipped; it has no reopen. | Code-traced |
| T8 | A row created inside an open transaction is invisible to other connections until commit (reproduced on a scratch Postgres in step 1); the maintenance service's `updateTaskStatus` already uses a compare-and-swap on `updatedAt` as the pattern. | Executed (step 1) / Code-traced |

## 3. Target behavior

### 3.1 The claim: one row serializes everything about a project

Every step transition, completion and abandonment starts by **claiming the project row** with a conditional write, in one transaction:

```text
updateMany where { id, propertyId, status in (PLANNING, IN_PROGRESS), updatedAt = expected } set { updatedAt = now, ... }
```

- Zero rows means the project is closed (`DIY_PROJECT_CLOSED`) or the caller's token is stale (`DIY_STALE`), told apart by one follow-up read of the current state.
- Because the claim writes the project row, concurrent step updates and a completion queue behind each other (row lock, then they re-evaluate against committed state, as proven in step 1). That is what makes the completion rule safe: the completion reads the steps **after** it holds the project row, and no step can change underneath it.
- Every successful step transition bumps `DiyProject.updatedAt`, so the project's token also changes whenever any step changes. A completion or abandonment built on a page that is out of date is rejected and the person reloads.

### 3.2 Step transitions (enforced by the service)

| From | To | Allowed when |
| --- | --- | --- |
| `PENDING` | `IN_PROGRESS` | always (also moves the project from `PLANNING` to `IN_PROGRESS`, sets `startedAt`) |
| `PENDING`, `IN_PROGRESS` | `COMPLETED` | always; records `completedAt` and `completedByUserId` |
| `PENDING`, `IN_PROGRESS` | `SKIPPED` | **only** if the step is optional **and** has no safety note |
| `COMPLETED`, `SKIPPED` | `IN_PROGRESS` | the **reopen** correction; clears `completedAt` and `completedByUserId` |
| anything else (for example back to `PENDING`, or any change in a closed project) | refused | `DIY_STEP_TRANSITION_NOT_ALLOWED` or `DIY_PROJECT_CLOSED` |

Not enforced: **order**. Design D3 makes "current step" a presentation rule (the first non-terminal step), and the page lets a person open any step; the service checks validity of the transition, not sequence (S2-4).

**Idempotent by resulting state.** If the step is already in the requested status the call returns the step with `alreadyApplied: true` and changes nothing, even if the caller's token is stale (a double click, a retry). Notes sent with a same-status request update the notes only while the step is open.

### 3.3 Version tokens

- `DiyProjectStep.updatedAt` is added and returned on every step in the project detail and in every step response.
- Requests carry the token the caller last saw: `expectedUpdatedAt` (ISO string) on step updates, and on complete and abandon the **project's** `updatedAt`. It is **required** (S2-2). A missing or stale token gets `409 DIY_STALE` with the current `status` and `updatedAt` so the page can reload and say what changed.
- The step write is itself conditional: `updateMany where { id, projectId, status: <seen>, updatedAt: <expected> }`, so even a step changed by a path that does not claim the project row cannot be overwritten (methodology item 19: the commit re-verifies the claim).

### 3.4 Completion rule (decision O11)

`completeProject` succeeds only when, **inside the claiming transaction**, every required step is `COMPLETED` and every optional step is `COMPLETED` or `SKIPPED`. Otherwise `409 DIY_PROJECT_STEPS_INCOMPLETE` with the ids and titles of the open steps. There is no "finish early" path. A project with no steps is not blocked by this rule.

### 3.5 Abandon and hire out

Conditional on an open project and the project token; records the actor; `HIRED_OUT` versus `ABANDONED` as today. Abandoning a completed or already closed project is refused (`DIY_PROJECT_CLOSED`), where today it silently overwrites the status.

### 3.6 Actor (decision O10)

The controller passes `req.user.userId` to the service. It is recorded on every transition (§4) and passed to the existing completion effects: the `HomeEvent` is created with the **acting** user (its `createdById`) instead of the project's creator, the incident work-item sync uses the actor, and the idempotency key `diy-complete-<id>` is unchanged. The maintenance and incident status writes remain raw until step 3 (this plan does not claim to fix them).

### 3.7 Responses and errors

New error codes (all `409` except where noted): `DIY_STALE`, `DIY_PROJECT_CLOSED`, `DIY_STEP_TRANSITION_NOT_ALLOWED`, `DIY_PROJECT_STEPS_INCOMPLETE`; a missing token is `400` from validation. Step responses gain `updatedAt` and `alreadyApplied`; project detail steps gain `updatedAt`; the completion response is unchanged (`homeEventId`).

## 4. Schema (all by editing `prisma/schema.prisma`; the owner runs `prisma db push`; no migration scripts)

| Change | Why |
| --- | --- |
| `DiyProjectStep.updatedAt DateTime @default(now()) @updatedAt` | the version token (existing rows take the default) |
| `DiyProjectStep.completedByUserId String?` | who completed the step (approved O10) |
| `DiyProject.completedByUserId String?` | who completed the project (approved O10) |
| **`DiyProjectEvent`** (append-only: `id`, `projectId`, `stepId?`, `actorUserId`, `type`, `fromStatus`, `toStatus`, `at`) with `@@index([projectId, at])` | **new, needs approval (S2-1).** O10 names only the two columns above, which attribute *completion*. Skip, reopen, start, abandon and hire out would have no recorded actor. One ledger written in the same transaction as each transition covers all of them and is also the history the Ask guide can show |

No change to `DiyProject.updatedAt` (it already exists and is now bumped by step transitions). The `completionBasis` column and the `maintenanceTaskId` index belong to step 4.

## 5. Code changes by path

| Path | Change |
| --- | --- |
| `diy.service.ts` `updateStep` | One transaction: claim the project (§3.1), load the step, apply §3.2, conditional step write, ledger row, project `PLANNING` to `IN_PROGRESS`; returns the step with its new token. Takes `actorUserId` and the expected token |
| `diy.service.ts` `completeProject` | One transaction: claim, verify the completion rule over the steps read in the same transaction, set `COMPLETED`, `completedAt`, `completedByUserId`, notes, ledger; then `onComplete(project, actor)` after commit as today |
| `diy.service.ts` `abandonProject` | Conditional claim, actor, ledger |
| `diyCompletion.service.ts` `onComplete` | Takes the actor: `HomeEvent` `userId` and the incident sync actor |
| `diy.controller.ts` | Pass `req.user.userId`, tokens and bodies through; map the new errors |
| `diy.validators.ts` | `expectedUpdatedAt` required on the three request schemas |
| Frontend `types`, `api` client | `updatedAt` on `DiyProjectStep` and the project detail; tokens in the three calls; the step call returns the step |
| `projects/[id]/page.tsx`, `ProjectStepList`, `ProjectCompleteSheet` | send tokens; on `DIY_STALE` reload and say "This project changed while you were working. We've refreshed it."; handle `DIY_PROJECT_STEPS_INCOMPLETE`; show "Complete Project" only when the rule holds, with a hint ("2 optional steps left: do them or skip them") when only optional steps remain; add **Reopen** for completed and skipped steps; hide Skip for steps with a safety note |

## 6. Behavior changes and data

- **In-flight projects.** A project that is `IN_PROGRESS` with unresolved optional steps could be completed before; after this it cannot until those steps are completed or skipped (approved O11). The rollout notes gain a read-only query that lists such projects; there is no backfill and nothing is changed for them.
- **Old browser tabs** that do not send a token get `400` until refreshed. The page is the only client; there is no compatibility layer (the repository's "keep it simple" rule).
- **Abandon** can no longer overwrite a completed project's status.
- Existing steps take `updatedAt = now()` when the column is added; nothing else is rewritten.
- Ask's `DIY_PROJECTS` read and Ask itself are unaffected.

## 7. Tests and validation

1. **Unit, database-free** (the shared fake gains project, step and ledger delegates and a conditional `updateMany` on steps): every row of the §3.2 table, allowed and refused; skip refused for a required step and for an optional step with a safety note; reopen clears completion; project `PLANNING` to `IN_PROGRESS` on the first start; stale token gives `DIY_STALE` with the current state; same-status retry is `alreadyApplied` and writes nothing; completion refused with open required steps and with unresolved optional steps, allowed with all resolved and with no steps; abandon refused on a closed project and conditional on the token; actor recorded on the step, the project and the ledger; the `HomeEvent` carries the actor (a contributor other than the creator completes the project); a failure part-way rolls back the claim, the step and the ledger.
2. **Concurrency** against the fake's serialized transactions: two simultaneous completions of one step yield one transition and one `alreadyApplied`; a completion racing a reopen yields either a refused completion or a reopen that follows it, never a completed project with an open step; two stale writers cannot both win.
3. **Mutation checks** on each rule (drop the claim, drop the token compare, drop the completion rule, allow skip of a safety-note step, drop the actor).
4. **Real Postgres** by extending the guarded scratch script: the same race and rule cases through real row locking, `updatedAt` precision round trip (a token that survives JSON and Postgres `timestamp(3)`), and the ledger.
5. **Frontend component tests** for the page: token sent, stale reload message, incomplete-project hint and gating, reopen, skip hidden for safety-note steps, error surfaces.
6. Typecheck, `next build`, and the existing DIY suites.

**Not run by these:** the real HTTP stack, a browser, production data.

## 8. Risks and the adversarial pass

- **A token that does not round-trip.** `updatedAt` is `timestamp(3)` in Postgres and an ISO string in JSON; a mismatch would reject every write. Covered by test 4.
- **Contention on the project row.** All step writes for one project now serialize. That is intended (a handful of household members), but it is a behavior to watch.
- **A completion that reads steps before another step commits.** Prevented by claiming the project row first and reading the steps in the same transaction (§3.1); tested in test 2.
- **Methodology items:** *14*, idempotency is by resulting status, not "currently active"; *15*, the ledger row is written in the same transaction as the transition, so the intent is never lost; *16*, no new uniqueness; *17*, step and project writes serialize on one row, not by checking each other; *19*, every write is conditional on the observed state, so a stale writer fails whole; *20*, the actor is stored on both the step and the project, and the ledger names both.
- **Falsification checks to run first:** that no code other than `diy.service.ts` writes `diyProjectStep` (re-verified in step 1: only there); that nothing reads `DiyProject.updatedAt` as "last edited by the creator" (to be searched in slice 2a).

## 9. Slices

| Slice | Deliverable |
| --- | --- |
| 2a | Schema edit, service transitions, completion service actor, unit and concurrency tests with mutation checks |
| 2b | Controller, validators, frontend types, client and page, with component tests |
| 2c | Scratch Postgres extension, rollout notes (the in-flight-projects query and the owner's `db push` step), plan record |

Each slice is reported with what was run and not run, and nothing is committed or pushed without your instruction. Step 2 does not depend on step 1's rollout having run; both are additive, and step 2 does not touch template content.

## 10. Decisions (all answered at the recommended default; see §11)

| ID | Decision | Recommended |
| --- | --- | --- |
| **S2-1** | Attribution: the two approved columns (`completedByUserId` on steps and projects) **plus** an append-only `DiyProjectEvent` ledger for every transition (start, complete, skip, reopen, project complete, abandon, hire out) | Add the ledger. Without it skip, reopen and abandon have no recorded actor, and the Ask guide would have no history to show |
| **S2-2** | Version tokens: `updatedAt` on steps and the project, **required** in step, complete and abandon requests, stale gives `409 DIY_STALE`; every step transition touches the project row | Yes |
| **S2-3** | The transition table in §3.2, including reopen for completed and skipped steps and idempotent same-status retries | Yes |
| **S2-4** | The service does **not** enforce step order | Yes (order stays a presentation rule) |
| **S2-5** | Completion requires required steps `COMPLETED` and optional steps `COMPLETED` or `SKIPPED` (O11), shown to in-flight projects with a hint and listed by a read-only query | Yes |
| **S2-6** | Until step 3, completion still performs the raw maintenance and incident writes (now with the actor passed to the home event and incident sync) | Yes, stated plainly in the release notes |
| **S2-7** | Abandon is conditional on an open project and the project token | Yes |
| **S2-8** | `updateProject` (replace-all notes and photos) is left as it is for now; it has no actor and can lose a concurrent edit | Defer, noted as a known limitation |
| **S2-9** | Old tabs without a token fail with `400` until refreshed, no compatibility layer | Yes |

## 11. Approval record (October 6, 2026)

The owner approved **S2-1 through S2-9 at the recommended defaults**:

| ID | Approved |
| --- | --- |
| S2-1 | The two approved columns plus the append-only `DiyProjectEvent` ledger for every transition |
| S2-2 | `updatedAt` tokens on steps and the project, required in the three requests, stale gives `409 DIY_STALE`, every step transition touches the project row |
| S2-3 | The §3.2 transition table, including reopen and idempotent same-status retries |
| S2-4 | The service does not enforce step order |
| S2-5 | Completion requires required steps `COMPLETED` and optional steps `COMPLETED` or `SKIPPED`; in-flight projects get a hint and are listed by a read-only query |
| S2-6 | Until step 3, completion still performs the raw maintenance and incident writes, with the actor passed to the home event and incident sync |
| S2-7 | Abandon is conditional on an open project and the project token |
| S2-8 | `updateProject` is left as it is, noted as a known limitation |
| S2-9 | Old tabs without a token fail with `400` until refreshed; no compatibility layer |

**Release constraint carried forward.** Slices 2a (service) and 2b (routes, validators and page) must ship together: with 2a alone the service requires a token that the page does not yet send, so step updates on the existing page would be refused.
