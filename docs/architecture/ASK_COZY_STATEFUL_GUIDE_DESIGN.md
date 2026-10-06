# Ask Cozy — Stateful GUIDE Design (Phase 3 design gate)

**Date:** October 6, 2026 (revision 2 after review)
**Status:** **Design for approval. Not approved. Nothing is built and no schema is changed.** Implementation is blocked until the decisions in §10 are answered.
**Plan:** [`ASK_COZY_CONVERSATIONAL_PRESENTATION_IMPLEMENTATION_PLAN.md`](ASK_COZY_CONVERSATIONAL_PRESENTATION_IMPLEMENTATION_PLAN.md) §6
**Requirement authority:** `docs/product/ASK_COZY_INLINE_WORKSPACE_FRD.md` v1.188, Appendix C.11.8 (the eight decisions this document must resolve)
**Precedent reused:** [`ASK_COZY_GUIDED_JOURNEY_CONTINUATION_FRD.md`](../product/ASK_COZY_GUIDED_JOURNEY_CONTINUATION_FRD.md) (shipped; a stateful continuation over canonical state)
**Method:** `AUDIT_METHODOLOGY.md`, including the design-document items 11-20. Labels: **[Executed]** ran and observed, **[Code-traced]** read not run, **[Inferred]** extrapolated and flagged. No service, database or browser was run, so nothing about live data is established; in particular **whether any DIY template exists in production is unknown** (the repository seeds none; templates are authored through the admin module).

## 0. Revision 2: response to review

Revision 1 was reviewed and **not approved**. The central recommendation (durable progress in the DIY domain, Ask as a continuation view, AI-generated guides excluded, existing projects as the entry, read-only before writes, self-reported completion, no photo gate, additive `TASK_GUIDE`, seasonal mapping deferred) was accepted. The review found that several existing DIY defects had been treated as acceptable boundaries when they are prerequisites. Every blocking point is resolved below.

| # | Review finding | Resolution in this revision |
| --- | --- | --- |
| 1 | A revision number does not make an edited template reviewed; an ACTIVE template can be edited in place | §4 D1 and O2 rewritten: published content becomes **immutable revisions with their own approval record**, or material edits atomically return the template to DRAFT and clear approval. A bare numeric column is withdrawn. **No Ask guide, including the read-only slice, may call content author-reviewed until this is in place** |
| 2 | Project ownership and household authorization unresolved; "parity" is not automatically acceptable | New §4 D8 and decision **O10**. New finding E15: the DIY page's mutation routes have **no household role floor at all** |
| 3 | Completion attribution wrong for delegated actors | E16, P3 and D8: the acting user is carried through every step, project, home-event, maintenance, incident and receipt write |
| 4 | A read must not re-drive failed writes | The read-repair design is **withdrawn**. D8 now requires a durable outbox with explicit effect status and a confirmation-gated recovery action; the guide read only discloses |
| 5 | Status-only concurrency is too weak (ABA) | D8: add `updatedAt` to `DiyProjectStep`; commands validate **expected status and expected version** |
| 6 | Optional-step semantics ambiguous; "finish early" undermines the invariant | D3 rewritten: current step is the first non-terminal step in authored order; required steps must be `COMPLETED`; optional steps `COMPLETED` or explicitly `SKIPPED`; "finish early" **removed** |
| 7 | Help child turns repeat what the guide already shows | D6 rewritten: **local disclosure only** in v1; child-turn help deferred until authored help exists; the "anything else becomes a normal turn" line removed |
| 8 | Reverse maintenance-to-DIY reconciliation cannot be guide-only | D4/D8 and decision **O12**: a reconciliation path on maintenance completion, by fulfillment mode, with an indexed reverse lookup; the guide only discloses |
| 9 | Incident completion needs the same audit | New finding E17 and decision **O13**: the incident side effects are audited; the recommended default is that DIY completion no longer resolves incidents automatically |

## 1. Summary and recommendation

**Do not build a new stepper store.** The DIY module already holds what C.11.8 asks for in some form: step content with an editorial lifecycle, per-project step state that survives across sessions, completion side effects and an eligibility boundary. A stateful Ask guide should be an **Ask continuation view plus confirmation-gated commands over that canonical workflow**, built as the shipped guided-journey continuation was.

But the workflow is **not yet safe to expose**. Six things must be true first, and they make up the prerequisites (§7), in the order the review set:

1. Template content that Ask calls "reviewed" must be provably reviewed (immutable revisions or re-review on edit).
2. The ownership and household-permission model must be decided, and the page's missing role floor fixed.
3. Step and project transitions must be actor-aware and concurrency-safe.
4. Project completion side effects must be durable, attributed and honest about what they claim (maintenance and incidents).
5. Reverse maintenance-to-DIY reconciliation must exist outside the guide.
6. Only then: a read-only guide, then step commands, then completion and abandonment.

**The furnace-filter scenario cannot be a stateful guide** until reviewed step content exists (§5).

## 2. How this document is organized

§0 review response; §3 evidence; §4 the eight C.11.8 decisions (D1-D8); §5 the reference scenario worked honestly; §6 contract and architecture impact, including schema; §7 prerequisites; §8 sequencing and acceptance; §9 risks and the adversarial pass; §10 decisions requested; §11 out of scope.

## 3. What exists today

| # | Finding | Label |
| --- | --- | --- |
| E1 | `DiyProjectTemplate` has an editorial lifecycle `DRAFT → REVIEW → APPROVED → ACTIVE → ARCHIVED`, `approvedBy`/`approvedAt`, `safetyLevel`, `permitRequirement`; capability-separated author, review and publish; HIGH-safety templates published by someone other than the approver; saving content does not publish (`ADMIN_MODULE_FRD.md` §10.6). `DiyTemplateStep` carries title, description, `safetyNote`, `tipNote`, `imageUrl`, `isOptional`, `estimatedMinutes`. | Code-traced |
| E2 | The same FRD lists "published revisions are immutable; corrections create new revisions" and "DIY revision includes steps, materials, tools, costs, safety level as one snapshot" as **PLANNED**. `adminUpdateTemplate` (`diy.service.ts:596`) deletes and recreates steps, materials and tools in place and changes core fields without touching `status`, `approvedBy` or `approvedAt`; the update schema accepts steps, safety level and permit requirement and **no** lifecycle field. So an ACTIVE, approved template can be materially edited with no re-review, and `createProject` (which needs only `status: 'ACTIVE'`) will snapshot the new, unreviewed content. There is no revision column. | Code-traced |
| E3 | `createProject` creates a project from `templateId` (requires `ACTIVE`) **or** `aiGuideId` (an LLM guide whose `stepsJson` is validated for shape only). Both copy steps into `DiyProjectStep` in one transaction; template steps record `templateStepId`, AI steps leave it null. Both run `evaluateDiyEligibility` (fail-closed: reviewed, low-risk, non-regulated work) and `evaluateDiyApplicability`. | Code-traced |
| E4 | `DiyProjectStep` has `status` `PENDING \| IN_PROGRESS \| COMPLETED \| SKIPPED`, `notes`, `completedAt`, but **no `updatedAt`**, no actor and no `imageUrl`. `DiyProject` has `status` `PLANNING \| IN_PROGRESS \| COMPLETED \| ABANDONED \| HIRED_OUT`, timestamps, `userId`, `maintenanceTaskId`, `incidentId`, `photoUrls`, `updatedAt`, and **no index on `maintenanceTaskId`**. | Code-traced |
| E5 | `updateStep` flips the project to `IN_PROGRESS` in one write and the step in a second, outside a transaction; it does not check step order or the step's current status. Any step can be set to any status in any order. | Code-traced |
| E6 | `completeProject` does not require required steps to be complete. Its "already completed" check and its update are separate. `DiyCompletionService.onComplete` then creates a `HomeEvent` attributed to `project.userId` (key `diy-complete-<id>`), sets a linked maintenance task `COMPLETED` with a raw `updateMany`, and sets a linked incident `RESOLVED` with a raw `updateMany`; failures are logged and swallowed. | Code-traced |
| E7 | The governed maintenance completion is `PropertyMaintenanceTaskService.updateTaskStatus`: contributor floor, a compare-and-swap on `updatedAt`, a completion idempotency key, `completionDetails` (`completedAt`, `fulfillmentMode: 'DIY' \| 'PROVIDER'`, `notes`, `followUpNeeded`, `photoDocumentIds`), and `applyTaskCompletionSideEffects`, which completes the linked `SeasonalChecklistItem` and bumps the checklist counters. The DIY raw update skips all of it. | Code-traced |
| E8 | The DIY-to-task link is one-sided: `DiyProject.maintenanceTaskId`; `PropertyMaintenanceTask` has no pointer back. Completing the task through the page or Ask does nothing to the project. | Code-traced |
| E9 | `DiyProjectStep.templateStepId` is written once and has no reader. | Code-traced |
| E10 | Ask's `DIY_PROJECTS` is a VIEWER-floor read; the `diy` skill manifest (autonomy 1, effects READ, no `TASK_GUIDE`) states that "starting, stepping through, completing and abandoning projects, and the AI guide, stay on the page" (FRD v1.58). | Code-traced |
| E11 | The shipped guided-journey continuation: an entity-keyed read, writes only as declared, confirmation-gated CONTRIBUTOR-floor commands that start only for their exact declared message and never on `ASK_REFRESH`; a context version that rejects a stale confirm; "already" receipts; refresh through `ASK_MUTATION_IMPACT_MAP`; "Ask never completes a step on the homeowner's word alone"; skip governed by a skip policy. | Code-traced (FRD text) |
| E12 | `AskExecution` is a conversation record that expires with its session (`ASK_RAW_CONVERSATION_RETENTION_DAYS`, default 30, max 365) and carries `parentExecutionId`/`linkedExecutionId`. It is not a place for durable domain progress. | Code-traced |
| E13 | `TASK_GUIDE` today has `eyebrow`, `chips`, `tip`, `main`, `history`, `notes` (max 4), `actions` (max 6); no steps, progress or outline. `AskEntityType` is `PROPERTY \| MAINTENANCE_TASK \| INVENTORY_ITEM \| QUOTE \| DECISION_THREAD`. | Code-traced |
| E14 | Guidance journeys have governed, proof-backed step completion, but their steps are decision and tool-launch steps, not physical-task instructions. | Code-traced |
| **E15** | **The DIY page's project routes use `propertyAuthMiddleware` only.** `requireHouseholdRole` is not used anywhere in `diy.routes.ts`, although the middleware's own comment says viewers "never mutate" property surfaces. So a household viewer with property access can create, patch, step, complete and abandon projects through the API. | Code-traced |
| **E16** | The controllers pass no actor to `updateStep`, `completeProject` or `abandonProject` (the user id goes only to analytics). The completion `HomeEvent` and the incident work-item sync both use `project.userId`, the creator, not the person who acted. Projects are looked up by `projectId` and `propertyId` only, so any member with property access can act on another member's project. | Code-traced |
| **E17** | **Incident side effects of DIY completion.** `onComplete` sets the incident `RESOLVED` with a raw `updateMany` from any non-terminal status (including `DETECTED` and `EVALUATED`), bypassing `IncidentService.setStatus`, which would also archive the incident's guidance journey and carry the actor. `IncidentService.setStatus` itself applies any status it is given; **no allowed-transition table was found** for incidents. Then `syncIncidentWorkItem` runs: for `RESOLVED` or `MITIGATED` it walks the linked operational work item through `REPORTED_COMPLETE` to `VERIFIED` with `SYSTEM` transitions and records an operational outcome. So **a self-reported DIY completion currently produces a `VERIFIED` work item**, which contradicts D5. | Code-traced |
| **E18** | A durable outbox already exists: `DomainEvent` (unique `idempotencyKey`, `status` `PENDING \| PROCESSING \| PROCESSED \| FAILED \| DEAD_LETTER`, attempts, lease and `availableAt`) with a workers poller that dispatches by `DomainEventType` (an enum, so a new value is a schema change). A reconciliation-failure ledger (`OperationalWorkReconciliation`, `recordReconciliationFailure`, `listPendingReconciliations`) also exists for work items. | Code-traced |

## 4. The eight C.11.8 decisions

### D1. Canonical step source, authoring governance, versioning (item 1)

**Decision:** the only step source Ask may present as a guide is **content from an admin-authored template revision that was approved, as snapshotted into a `DiyProject`'s steps**. A project is guideable only if `templateId` is set, `aiGuideId` is null, every step has `templateStepId`, the project records which approved revision it copied, and the template still satisfies `evaluateDiyEligibility`. AI-generated guides are excluded (E3): their steps are not author-reviewed.

**Review provenance must be made true first (review finding 1; E2).** A revision number alone only says which text was copied, not that it was reviewed. One of two designs is required (**O2**):

- **O2-A, immutable published revisions (recommended).** Publishing creates an append-only `DiyTemplateRevision` record holding the full content snapshot (core fields, steps, materials, tools, costs, safety level, permit requirement) and its `approvedBy`/`approvedAt`/`publishedBy`/`publishedAt` (and `retiredAt`). The editable template is a working draft. `createProject` snapshots from the **latest published revision**, never from the live draft, and records `DiyProject.templateRevisionId`. A project is "author-reviewed" because it points at an approved revision, provably and per project, without depending on a global invariant. This is also the ADMIN module's own PLANNED requirement ("DIY revision includes steps, materials, tools, costs, safety level as one snapshot").
- **O2-B, material edit returns to DRAFT (acceptable fallback).** Any change to steps, materials, tools, costs, difficulty, safety level or permit requirement atomically increments a `revision`, sets `status` back to `DRAFT`, and clears `approvedBy`, `approvedAt` and publication state, so `ACTIVE` always implies "the last approved content". New projects cannot snapshot an unreviewed edit because the template is no longer `ACTIVE`. This depends on the invariant holding at every write site, and loses who approved a past revision once approval is cleared; a separate `approvedRevision` or revision log is then needed for audit. Today approval is attached to the template, not to a content snapshot (see the falsification checks in §9).

A lighter variant of B binds the approval to content: `APPROVE` stores an `approvedContentHash`, and publish and `createProject` refuse content whose current hash differs. It avoids resetting the lifecycle on every edit but still needs a stored record of what was approved, which is why O2-A is preferred.

Either way, **projects that predate the change and carry no revision record are not guideable** in Ask (their approval cannot be shown). Safety instructions are the step's `safetyNote` plus the revision's `safetyLevel` and `permitRequirement`; a step's `safetyNote` is always shown above the action that advances it, never behind a disclosure. HIGH-safety templates, and any content failing the eligibility boundary, are not guided. Media: none in v1 (`imageUrl` is not copied into `DiyProjectStep`, E4).

**Stale-source rule.** On every read the guide checks that the project's revision is not retired for safety and still satisfies eligibility. If it is retired or ineligible, the guide shows "This guide has been withdrawn" with the page link and **offers no step-advancing action**; the snapshot stays readable so a homeowner mid-job can finish reading. If a **newer approved revision** exists, the guide discloses "A corrected version of this guide is available" (a read-only disclosure; it does not migrate the project). A draft that is under review does not withdraw in-flight guides.

### D2. Where progress lives (item 2)

**Decision: canonical domain workflow state**: `DiyProjectStep.status` and `DiyProject.status`. Not execution-local, not session-local. Executions and sessions expire (E12) and the page reads and writes the same rows. Ask holds no authoritative progress. The guide block carries a **rendered snapshot** (`progress`, `outline`, and an `asOf` time) for history and display only; **it never owns progress**, and every command re-reads canonical state, so a stale rendering can never be the source of a write. A historical execution keeps what was shown (IW-CONV-PRES-003); the existing result-revalidation boundary offers a refresh when live state differs.

### D3. Pause, resume, previous, skip, abandon, stale source, completion (item 3)

Optional-step semantics (review finding 6) are defined first:

- **Current step** = the first non-terminal step in **authored order**, whether required or optional. Terminal means `COMPLETED` or `SKIPPED`.
- **Required** steps must be `COMPLETED` before the project can complete. They cannot be skipped.
- **Optional** steps must be `COMPLETED` or explicitly `SKIPPED` before the project can complete (no untouched optional steps; decision **O11**).
- A step carrying a `safetyNote` **cannot be skipped**, even if optional.
- There is **no "finish early"** path. The only other way a project closes without all steps is the server-verified reconciled closure in D4, which is not a user choice.

| Semantic | Design |
| --- | --- |
| Start | Out of v1. The project must already exist (created on the page). Creating one from Ask is a later, confirmation-gated command. |
| Pause / resume | No pause state exists and none is added. Pausing is leaving; the step and project stay `IN_PROGRESS`. Resume is reopening the guide from the project list or a pinned result on any device, from canonical state. |
| Previous | A **read-only** view of an earlier step. It changes nothing. Re-opening a completed step is a confirmation-gated `REOPEN` correction. |
| Skip | Only optional steps without a `safetyNote`, only via a confirmed command. |
| Abandon / hire out | Existing `abandonProject` semantics (`ABANDONED` or `HIRED_OUT`), confirmation-gated, with no silent effect on a linked task. |
| Complete a step / project | Confirmed commands; completion claims nothing about verification (D5). Project completion only when the invariant above holds. |
| Stale / conflicted | Commands carry an expected status **and** expected version (D8) and are rejected if either changed; an already-applied command returns an "already" receipt. |

### D4. What completion affects, and reverse reconciliation (item 4)

- **A step completion affects the DIY step only.** It never completes a maintenance task, seasonal item, incident or home record.
- **Project completion** records a project completion plus its governed effects through a durable outbox (D8). The effects are: a `HomeEvent` badged as homeowner-completed and attributed to the **acting user**; completion of a linked maintenance task through `PropertyMaintenanceTaskService.updateTaskStatus` (governed, idempotent, actor-aware, `fulfillmentMode: 'DIY'`, optional `photoDocumentIds`), so the seasonal item and counters follow (E7); and **no automatic incident resolution** unless O13 says otherwise.
- **Incidents (review finding 9; E17).** DIY completion is self-reported, while resolving or mitigating an incident currently produces a `VERIFIED` work item and an outcome record. A self-reported completion must not become verified evidence. **Recommended default (O13):** DIY project completion no longer changes incident status; an incident-linked project may be guided in Ask but its completion stays on the page until the incident owner decides whether DIY completion is sufficient evidence and what status it maps to. If the owner instead wants automatic resolution, the minimum is `IncidentService.setStatus` with the actor (which also archives the guidance journey), an allowed-source-status rule that excludes `DETECTED` and `EVALUATED`, an explicit decision that a `VERIFIED` work item is acceptable for self-reported work, and idempotency keyed to the project.
- **Reverse reconciliation (review finding 8; E8; O12).** The system must not rely on the guide to notice a task completed elsewhere. Maintenance completion (`applyTaskCompletionSideEffects`, where seasonal sync already lives) gets a reconciliation step that looks up open projects by `maintenanceTaskId` (an **indexed** reverse lookup; no task-side pointer is required) and applies, by the completion's `fulfillmentMode`:

  | Task completed with | Linked open project |
  | --- | --- |
  | `PROVIDER` | Transition to `HIRED_OUT` (no completion claim, steps untouched) |
  | `DIY`, and all required steps are done | Complete the project through the same governed completion (idempotent) |
  | `DIY`, required steps still open | **Reconciled closure**, server-verified: the project closes as `COMPLETED` with a recorded basis `LINKED_TASK` (a stored field), steps left as they were. This is not user-chosen "finish early"; the basis is read from the task record |
  | No mode or unknown | No automatic transition; disclosed as "needs review" and left open |

  The guide **discloses** any unresolved inconsistency; it is not the only place the condition is noticed and it **does not repair anything on read**.

### D5. Proof policy for physical completion (item 5)

- A guide records what the homeowner reported and never verifies. Step and project completion are "marked done by you", stored and described as self-reported, consistent with the `USER_REPORTED` home-event badge and the journey rule that completing a step is not certifying the physical outcome (E11). Given E17, the design also requires that **no downstream effect upgrades self-reported completion to verified**.
- **Wording alone never advances state.** Only a declared action's exact message, confirmed, mutates; typed "I finished" is an ordinary question. `ASK_REFRESH` never writes.
- Evidence is optional and attached through existing paths (the attach-evidence control; `photoDocumentIds` on the governed maintenance completion). A photo is described as "attached", never as proof the work is correct. **No photo gate in v1** (O4).
- v1 covers only LOW-safety, non-regulated work (the eligibility boundary), so a false self-report affects the homeowner's own records.

### D6. Contextual help (item 6; review finding 7)

**v1: local disclosure only.** The step's `tipNote` is a local "Show tip" disclosure and its `safetyNote` is always visible (D1). No child execution is created, because the only recorded help content already renders in the guide and a child turn would add history without help. Child-turn help is **deferred until authored help content exists** (a small set of deterministic help intents with reviewed responses, owned by the template revision). A homeowner can still type a question; that is an ordinary Ask turn, not "guide help", it is routed like any other message, and it **cannot change step state** because only declared, confirmed step commands do.

### D7. Capture and confirmation integration (item 7)

- A fact discovered during a guide (for example a filter size) is not guide state and not a home fact. It enters the existing governed capture and confirmation path (Property Context catalog, `AskCaptureReceipt`), as in C.11.7. The guide never writes a property fact and never silently persists an inference.
- Step notes (`DiyProjectStep.notes`) are DIY-domain data and are **not written from Ask in v1**; neither are photos or notes displayed in v1 (so the notes-visibility question in D8 is not triggered yet).
- Every Ask write is a registered command with confirmation, authorization, idempotency and reconciliation (`askDomainCommandRegistry.ts`); no shadow record exists.

### D8. Ownership, authorization, concurrency, effects, history, access loss, mobile, accessibility (item 8)

**Authorization and ownership (review finding 2; E15, E16; decision O10).** `DiyProject` carries both `propertyId` and `userId`, but the page's routes enforce property access only, with no role floor (E15), and services look projects up by `projectId` and `propertyId` (E16). That is not a safe baseline to inherit. The questions the owner must answer:

1. Is a DIY project **property-shared** or **user-owned**?
2. May every household viewer read step text, progress and status? (v1 Ask shows none of notes or photos.)
3. May every contributor complete, reopen, abandon or hire out another member's project?
4. Who is the **actor** attributed on each write?

**Recommended default (O10): property-shared, with explicit floors and real attribution.** Read (steps, status, progress): any member with property access (VIEWER and up). Mutate (step transitions, complete, abandon): CONTRIBUTOR and up. Notes, photos and attachments are not exposed in Ask v1, so no privacy rule is needed yet. Every write records the **acting user** (attribution columns `completedByUserId` on `DiyProjectStep` and `DiyProject`), and that actor is carried into the home event, the maintenance completion, any incident action, the confirmation receipt and the audit. **Independent of Ask, the page must gain `requireHouseholdRole('CONTRIBUTOR')` on its mutation routes** (E15): that is a security fix, listed as prerequisite P0.

**Concurrency (review finding 5).** Status alone cannot detect `PENDING → IN_PROGRESS → PENDING` or a notes-only change. So:

- Add `updatedAt DateTime @default(now()) @updatedAt` to `DiyProjectStep`. `DiyProject` already has `updatedAt`.
- Every command applies one conditional write, `updateMany where { id, projectId, status = expected, updatedAt = expectedVersion }`, in one transaction with the project's own transition, and fails with a conflict if zero rows match. This is the maintenance service's existing compare-and-swap pattern (E7).
- Replays find the target status already set and return an "already" receipt with no second effect; idempotency is by resulting state, not by filtering on "currently active" rows.

**Completion effects: durable, attributed, never re-driven by a read (review finding 4; E6, E18).** The single completion mechanism is a **transactional outbox**:

- In the same transaction as the project's conditional `COMPLETED` write, insert a `DomainEvent` (new `DomainEventType`, `idempotencyKey` `diy-project-completed:<projectId>`, payload with project id, actor, completion basis and linked ids).
- A worker consumer performs each effect through its governed service with its own idempotency key (home event, maintenance completion), with the platform's retry, lease and `DEAD_LETTER` handling.
- Effect status is explicit: the guide reads the project plus the `DomainEvent` row's status and **discloses** it ("Recording your completion", "Some records could not be updated"). A `DEAD_LETTER` or `FAILED` event is recoverable only by an **explicit, confirmation-gated "Finish recording completion" action** that re-enqueues under the same key. A guide read never writes, never retries and never repairs.
- Consequence for the page (owner decision O3): the page's `completeProject` response currently returns `homeEventId`; with the outbox it is unset until the consumer runs (the poller default is 30 seconds). If that is unacceptable, the alternative is to create the home event inside the completion transaction when `createHomeEvent` can run in a caller's transaction, leaving only the maintenance effect on the outbox. This is flagged, not assumed.
- Two triggers for the same effect (an inline attempt plus a worker) are **not** used (methodology item 18): the outbox is the only path.

**History, access loss, mobile, accessibility.** Access is re-resolved on every read and refresh; a lost-access result renders the stored guide read-only with actions disabled, via the existing `onAccessLost` path. `ASK_MUTATION_IMPACT_MAP` refreshes the source guide and `DIY_PROJECTS` (and linked maintenance and seasonal views) after a command. One step per view; the safety note above the action; real buttons; progress in words ("Step 2 of 6, 1 done"), not only a bar; `aria-current="step"` in the outline; focus returns to the new step heading after a confirmed command; reduced motion honored; every action, including confirmation, reachable by keyboard. These are acceptance criteria (§8), not yet implemented behavior.

## 5. The reference scenarios, worked honestly

**Furnace-filter guidance.** The seasonal catalog records one description ("Check and replace HVAC filters every month…"), a priority, a time and a cost, and **no steps**. No DIY template for it is authored anywhere in the repository (searched `prisma/*.sql`, `prisma/*.ts` and `src/data`), and the only link between the seasonal catalog and DIY is the boolean `isDiyPossible` on a seasonal template; there is no `taskKey`-to-template mapping (searched `src/services/seasonal`, `src/data/seasonalTaskTemplates.json` and the Ask seasonal builder). So **today it cannot be a stateful guide**, and inventing steps would break C.11.8. To make it one: a **named** content owner authors, reviews and publishes a LOW-safety "Replace a furnace filter" template through the admin workflow (O7); the mapping from a seasonal task is deferred (O5); a homeowner then starts a DIY project from it on the page. A repository fixture can test the feature but is not approved production content.

**Winter plan and home safety.** Neither has steps and neither is a candidate; the existing grouped list is the correct presentation.

## 6. Contract and architecture impact

| Area | Impact | Approval |
| --- | --- | --- |
| **Response contract** | Extend `TASK_GUIDE` additively: optional `progress { current, total, completed, label, asOf }` and optional `outline[]` (step id, title, state). They are a rendered snapshot; **the block does not own progress**, and no action trusts them. Absent fields mean today's guide, so old stored executions parse unchanged. | O1 |
| **Operations** | Read `DIY_PROJECT_GUIDE` (VIEWER, entity-keyed, routed like `DECISION_THREAD`). Commands `DIY_STEP_UPDATE` (complete, skip optional, reopen), later `DIY_PROJECT_COMPLETE`, `DIY_PROJECT_ABANDON`, and the recovery command `DIY_COMPLETION_RECORD_RETRY` (CONTRIBUTOR, confirmation-gated, non-routable, correction modes declared). New `AskEntityType` `DIY_PROJECT`. | Yes |
| **Skill and governance** | The `diy` skill manifest moves from autonomy 1 and READ to include write effects and `TASK_GUIDE`, **reversing FRD v1.58** for eligible template-sourced projects (O8). Governance validators, `OPERATION_BOUNDARIES` and `OPERATION_ACTION_IDS` allow-lists (exact ids), the interaction coverage matrix and the startup-registry test need entries. | O8 |
| **Frontend** | `TaskGuideBlock` renders progress and outline from declared fields only; no inference; actions keep declared styles. | n/a |
| **Schema (all `prisma db push`, no migration scripts)** | **Required before any guide:** O2 (`DiyTemplateRevision` and `DiyProject.templateRevisionId`, or the O2-B fields). **Required before step commands:** `DiyProjectStep.updatedAt`; `DiyProjectStep.completedByUserId` and `DiyProject.completedByUserId`. **Required for reconciliation (O12):** `@@index([maintenanceTaskId])` on `DiyProject` and a stored `completionBasis` (`STEPS`, `LINKED_TASK`). **Required for the outbox:** a new `DomainEventType` value and its worker handler. | O2, O10, O12 |
| **Existing behavior changes (the page too)** | Role floor (P0); template immutability (P1); actor-aware, concurrency-safe transitions (P3); completion requires the invariant (P3); outbox-based effects, maintenance via the governed path, incident behavior per O13 (P4); maintenance-to-DIY reconciliation (P5). | O3 |

## 7. Prerequisites, in the order the review set

| ID | Prerequisite | Why | Type |
| --- | --- | --- | --- |
| **P0** | Add `requireHouseholdRole('CONTRIBUTOR')` to the DIY mutation routes | E15: a viewer can mutate today | Security fix. **Implemented October 6, 2026** (§12) |
| **P1** | Template immutability or re-review, with revision provenance (O2) | E2: otherwise no Ask surface may call content reviewed | Admin and service change |
| **P2** | Decide ownership and household permissions (O10) and record attribution columns | E15, E16 | Decision plus schema |
| **P3** | Actor-aware, version-checked step and project transitions in the shared service; `updateStep` in one transaction; completion requires required steps `COMPLETED` and optional steps `COMPLETED` or `SKIPPED` | E5, E6, review findings 3, 5, 6 | Service fix, page behavior change |
| **P4** | Completion effects through the outbox: governed maintenance completion with the actor, home event with the actor, incident behavior per O13; effect failures visible and recoverable by a confirmed action | E6, E7, E17, E18 | Service fix, worker handler |
| **P5** | Reverse maintenance-to-DIY reconciliation by fulfillment mode, with the indexed lookup (O12) | E8, review finding 8 | Service change |
| **P6** | Content: a named owner (O7) authors, reviews and publishes the first LOW-safety template | There is no step content; production content is unknown | Content, owner |

P0 can ship immediately and independently. P1-P5 are the same kind of "completion parity" prerequisite the journey continuation required (its Phase 0).

## 8. Sequencing and acceptance

| Step | Content | Acceptance (tests unless noted) |
| --- | --- | --- |
| **0a** | P0 and P1 | A viewer's mutation attempt is rejected; a material template edit cannot yield an `ACTIVE` template with stale approval (O2-B) or cannot change a published revision (O2-A); `createProject` snapshots only approved content and records the revision |
| **0b** | P2 | Authorization matrix tests for viewer, contributor and owner against own and others' projects; actor recorded on every write |
| **0c** | P3 | ABA sequence (`PENDING → IN_PROGRESS → PENDING`) rejects a stale command; concurrent commands yield one effect; project cannot complete with a required step open or an optional step untouched; `updateStep` is atomic |
| **0d** | P4 | Completion inserts an outbox event in the same transaction; each effect is keyed and idempotent; a failed effect is visible and recoverable only by the confirmed recovery command; **no read performs a write** (a spy on write methods during a guide read); no incident change unless O13 says so; no `VERIFIED` produced by self-reported completion |
| **0e** | P5 | `PROVIDER` completion hires out the project; `DIY` completion with open steps produces a `LINKED_TASK` reconciled closure; unknown mode produces a disclosed, unchanged project; the reverse lookup is indexed |
| **1** | Read-only `DIY_PROJECT_GUIDE` and additive `TASK_GUIDE` progress and outline; entry from a `DIY_PROJECTS` row; revision-backed, template-sourced projects only | AI-guide, pre-revision and ineligible projects refused with a page link; retired revision shows the withdrawal and no advancing action; "corrected version available" disclosure; current step derived from state, not remembered; `progress` is a snapshot with `asOf`; old stored executions unchanged; viewer sees no write action; skill, allow-list, registry and startup validators pass; component tests for outline, `aria-current`, focus; **runtime unverified** unless a browser run is separately approved |
| **2** | `DIY_STEP_UPDATE` | Typed wording never writes; `ASK_REFRESH` never writes; stale confirm rejected (status and version); replay returns "already"; required and safety-note steps cannot be skipped; receipt says "marked done by you"; impact map refreshes source guide and list |
| **3** | Previous-step read view, `REOPEN`, `DIY_PROJECT_COMPLETE`, `DIY_PROJECT_ABANDON`, recovery command | Viewing an earlier step changes nothing; completion only when the invariant holds; abandon leaves a linked task untouched |
| **4** | Help, only when it adds more than the existing disclosure | Authored, deterministic help content exists and is reviewed |
| **5** | Seasonal-to-DIY mapping (O5), project creation from Ask | Same eligibility and applicability checks as the page |

## 9. Risks and the adversarial pass

**Principal risks:** calling unreviewed text "reviewed" (D1); a viewer mutating via the page API (E15); wrong actor attribution (E16); a self-reported completion becoming verified evidence (E17); stale confirm succeeding (D8); read-time mutation (withdrawn); page behavior changes surprising homeowners (O3); an effects outbox with 30-second latency changing what the page returns.

**Methodology items applied**

- *11, reuse of a field:* `DiyProjectStep.status` and `notes` have exactly the consumers in `diy.service.ts` and the Ask `DIY_PROJECTS` counts; `templateStepId` has none (E9); `DomainEvent` and `OperationalWorkReconciliation` are reused with their existing consumers' semantics unchanged (a new event type does not alter existing handlers).
- *12, worked example:* §5 states that the furnace-filter task has no steps and no template instead of showing an illustrative stepper.
- *13, "never blocks" versus "merges into the same response":* the outbox means completion effects are **not** in the completion response; the response says so ("Recording…"). The inline alternative is named, not blended.
- *14, idempotency scoped to the operation:* step commands by resulting state plus version; project completion by the unique outbox key; each effect by its own domain key (home event key, maintenance completion key). No lookup filters on "currently active".
- *15, persist intent before the risky operation:* the outbox row is written in the same transaction as the completion, before any effect runs, so a crash between completion and effect leaves a retryable record.
- *16, uniqueness granularity:* the only new uniqueness is the outbox `idempotencyKey`, one per project completion; a project completes once, so the grain matches. Revision numbers are unique per template.
- *17, synchronizing independent operations:* project and maintenance completion reconcile **after commit, asynchronously, from durable state** (outbox and the maintenance-side reconciliation), not by each checking the other during its own write.
- *18-19, one claim and a re-verified commit:* the outbox is the only trigger; the worker's lease already exists; each effect's commit is keyed and idempotent, so a slow, reclaimed handler cannot add a second effect.
- *20, a relationship needs a pointer on both sides:* no task-side column, but the reverse lookup is **indexed and actually invoked** on maintenance completion (O12), so the relationship resolves from either side's completion.

**Falsification checks**

- *"A viewer can mutate DIY projects today."* Falsifier: a role floor elsewhere in the stack. `requireHouseholdRole` is absent from `diy.routes.ts`; `propertyAuthMiddleware` only resolves access [Code-traced]. Not exercised against a running API.
- *"No allowed-transition table exists for incidents."* Falsifier: a guard in `IncidentService` or a validator. `setStatus` applies any status and `upsertIncident` has its own logic; I did not find a transition table, but did not exhaustively search every incident caller. Stated as "not found", not "none exists".
- *"An ACTIVE template can be edited without re-review."* Falsifier: a hook, trigger or governance route that resets approval on update. `adminUpdateTemplate` and `AdminUpdateTemplateSchema` show none, and I read `transitionDiyTemplate` (`adminContentGovernance.service.ts`): it moves status only on an explicit author, review or publish action (guarded by an allowed-from list), sets `approvedBy` and `approvedAt` on `APPROVE`, clears them on return to `DRAFT`, and **does not bind the approval to the content being approved** (no content hash or revision is read or stored). So approval is attached to the template, not to a content snapshot [Code-traced]. Not exercised against a database.
- *"Executions expire so progress cannot live there."* The retention setting is bounded at 365 days.
- *"Only `diy.service.ts` writes step rows."* Searched `apps/backend/src` and `apps/workers/src`; step rows are created and updated only at `diy.service.ts` lines 245, 356 and 490 [Code-traced].

## 10. Decisions requested

Nothing starts until these are answered. Changes from revision 1 are marked.

| ID | Decision | Recommended |
| --- | --- | --- |
| **O1** | Extend `TASK_GUIDE` additively with `progress` and `outline`; the block is a snapshot and never owns progress | Yes (approved in principle, with the snapshot rule) |
| **O2** *(changed)* | How template content becomes provably reviewed: **A** immutable published revision records, or **B** material edits atomically return the template to DRAFT and clear approval. A bare revision column is withdrawn | **A**; B acceptable. Blocks every Ask guide, including read-only |
| **O3** | Accept page behavior changes: role floor, completion invariant, version-checked transitions, outbox effects (including the `homeEventId` response timing), maintenance via the governed path | Yes, after the points in O10-O13 |
| **O4** | Proof: self-reported only, optional evidence, no photo gate | Yes (approved) |
| **O5** | Seasonal-to-DIY mapping | Defer; start from existing DIY projects (approved) |
| **O6** *(superseded)* | Guide-only reconciliation is **not** accepted; replaced by O12 | n/a |
| **O7** *(changed)* | A **named** product and content owner for the first LOW-safety template, and which template | Required for any production slice; a fixture is for tests only |
| **O8** | Reverse the FRD v1.58 decision for eligible, revision-backed, template-sourced projects only, and only after O2, O10 and the prerequisites | Yes, scoped |
| **O9** *(changed)* | Help in v1: local disclosure only; child-turn help deferred until authored help exists; no LLM | Yes |
| **O10** *(new)* | Project ownership and household permissions: property-shared, VIEWER read, CONTRIBUTOR mutate, attribution columns, role floor on the page | Property-shared with those floors |
| **O11** *(new)* | Optional steps must be completed or explicitly skipped before project completion | Yes |
| **O12** *(new)* | Maintenance-to-DIY reconciliation by fulfillment mode (`PROVIDER` hires out; `DIY` closes through governed completion or a server-verified `LINKED_TASK` closure; unknown stays open and disclosed) and the stored `completionBasis` | Yes |
| **O13** *(new)* | Incidents: should DIY completion resolve the linked incident? | **No** automatic change in v1 (self-reported must not become `VERIFIED`); incident-linked completion stays on the page until the incident owner decides |

## 11. Out of scope

AI-generated guides in Ask; any HIGH or MODERATE safety project; regulated or permitted work; authored help branches and child-turn help; step media; step-level evidence; a seasonal-to-DIY mapping (until O5); canonical gas-service capture and the ASSESS flow (Phase 4); a notes editor and notes or photo display in Ask; the ADMIN module's wider revision tooling beyond what O2 requires; changing project creation or the AI guide path.

## 12. P0 implementation record (October 6, 2026)

P0 was implemented on its own, independent of the design approval, because it fixes a standing authorization gap (E15) on the existing DIY page.

**Changed**

- `apps/backend/src/routes/diy.routes.ts`: `requireHouseholdRole('CONTRIBUTOR')` now follows `propertyAuthMiddleware` on the six property-scoped routes that write: create project, patch project, patch step, complete, abandon, and generate AI guide (it stores a `DiyAiGuide` for the property and spends AI budget). The floor precedes body validation, so a viewer gets 403 regardless of the body. Left open: every GET, and `POST .../diy/decision` (a scoring call that reads the skill profile and writes nothing). Admin routes are unchanged (they have their own role, MFA and capability gate).
- `apps/backend/tests/unit/diyMutationRoleFloor.test.js` (new): runs the real router's handler chains against a stubbed access lookup. For each of the six routes a viewer gets 403 before the controller and a contributor or owner is not refused by the floor; no access still gets 404; reads stay open to viewers; and a guard test requires that **every** non-read route under `/properties/:propertyId/diy` refuses a viewer, so a future write route cannot ship without the floor.

**Validation**

| Check | Result | Kind |
| --- | --- | --- |
| New test against the fixed routes | 15 pass, 0 fail | Executed |
| Same test against the original `diy.routes.ts` (negative control) | 8 pass, 7 fail (the six viewer refusals and the guard) | Executed |
| Existing DIY and property-auth tests (`diyCapabilityActivation`, `diyAiGuideGeneration`, `diyHireRequiredBoundary`, `diyProjectsCapabilitySlice`, `propertyAuthMiddlewareMetrics`) | 32 pass, 0 fail | Executed |
| Backend `npm run typecheck` | clean | Executed |

**Not run:** the real HTTP stack, a database, or a browser. The handler chains ran with a stubbed access lookup, not Express.

**Known consequence, fixed in the frontend follow-up below.** After P0 the DIY pages still showed their controls to viewers [Code-traced]: a viewer's step update was awaited without a catch (an unhandled rejection), and a viewer's "Stop this project" swallowed the 403 (`.catch(() => null)`) and then navigated away as if it had worked.

### 12.1 Frontend follow-up: viewer controls (October 6, 2026)

**Rule.** `householdRole` is on a property only for household members (the owner's own properties carry none), so `canWrite = householdRole !== 'VIEWER'`. The server's role floor stays the authority; the client only stops offering controls a viewer cannot use. While the properties list is loading, write controls stay hidden (no flash for a viewer); if the list cannot be loaded or the property is not in it, the server decides (not treated as a viewer).

**Changed (frontend only)**

- New `lib/property/propertyWriteAccess.ts` (pure rule), `lib/property/usePropertyWriteAccess.ts` (reads the cached properties list through the existing `['userProperties']` query) and `components/features/diy/ViewOnlyNotice.tsx`.
- Project page: a viewer sees the steps, safety notes and recorded notes read-only, with a notice, and no "Mark done", "Start step", "Skip", note box, "Complete Project" or "I'll hire a pro instead". `ProjectStepList` gained a `readOnly` prop.
- Template page: the button reads "View only" and is disabled for a viewer, with the notice. DIY hub and the property DIY tool page: no "Describe your project" generator (and no "Start Project" for a pending guide) for a viewer, with the notice.
- **Error handling (all roles).** A failed "stop this project" now stays on the page and shows the error instead of navigating away; a failed step update shows the error instead of an unhandled rejection; the hub's create-from-guide shows a toast on failure.

**Validation**

| Check | Result | Kind |
| --- | --- | --- |
| New tests: access rule (3), read-only step list (2), project, template and hub pages for viewer and contributor, plus the two error fixes (9) | 14 pass | Component-tested |
| Page tests against the original project page (negative control) | 3 fail (viewer controls, failed stop, failed step update), 6 pass | Component-tested |
| `next build` | compiled and type-checked (it first caught a real type error: `APIResponse` is a union with an error shape, now narrowed) | Static |
| `jest` on `src/lib/property`, `src/components/features`, `src/app` | 246 pass, 1 fail: `propertyContextForm.test.ts` (a source-text check on the unrelated property create/edit pages; those files are untouched) | Component-tested |

**Not run:** a browser, so layout and the notice's appearance are unverified. Not covered by a test: the property DIY tool page's viewer branch (built and type-checked only), and the complete sheet, which is reachable only through the now-hidden button.
