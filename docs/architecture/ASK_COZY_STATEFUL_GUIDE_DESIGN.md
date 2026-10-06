# Ask Cozy — Stateful GUIDE Design (Phase 3 design gate)

**Date:** October 6, 2026
**Status:** **Design for approval. Nothing is built and no schema is changed.** Implementation is blocked until the decisions in §10 are answered.
**Plan:** [`ASK_COZY_CONVERSATIONAL_PRESENTATION_IMPLEMENTATION_PLAN.md`](ASK_COZY_CONVERSATIONAL_PRESENTATION_IMPLEMENTATION_PLAN.md) §6
**Requirement authority:** `docs/product/ASK_COZY_INLINE_WORKSPACE_FRD.md` v1.187, Appendix C.11.8 (the eight decisions this document must resolve)
**Precedent reused:** [`ASK_COZY_GUIDED_JOURNEY_CONTINUATION_FRD.md`](../product/ASK_COZY_GUIDED_JOURNEY_CONTINUATION_FRD.md) (shipped; a stateful continuation over canonical state)
**Method:** `AUDIT_METHODOLOGY.md`, including the design-document items 11-20. Labels: **[Executed]** ran and observed, **[Code-traced]** read not run, **[Inferred]** extrapolated and flagged. No service, database or browser was run, so nothing about live data is established; in particular **whether any DIY template exists in production is unknown** (the repository seeds none; templates are authored through the admin module).

## 1. Summary and recommendation

**Do not build a new stepper store.** Everything C.11.8 asks for already exists in the DIY module in some form: author-reviewed step content with an editorial lifecycle, per-project step state that survives across sessions, completion side effects, and an eligibility boundary. A stateful Ask guide should be an **Ask continuation view plus confirmation-gated commands over that existing canonical workflow**, built the way the shipped guided-journey continuation was: a read operation keyed by an entity, writes only by declared actions, state read fresh each time, completion reported through the domain's own governed path.

Three things stand between that and a safe build, and they are the real content of this gate:

1. **The step source is only partly author-reviewed.** A `DiyProject` can be created from an admin template (reviewed) or from an AI-generated guide (not reviewed). Both produce the same `DiyProjectStep` rows (§3, E3).
2. **Completion has bugs a guide would amplify.** `DiyCompletionService` completes a linked maintenance task with a raw `updateMany`, bypassing the governed maintenance path, so a seasonal-linked task completed through DIY leaves its `SeasonalChecklistItem` and checklist counters stale. `completeProject` does not require the steps to be done. (§3, E6-E7; prerequisites P2, P3.)
3. **There is no step content for the reference scenario.** The furnace-filter task has one recorded description and no steps; nothing in the repository authors a "replace the furnace filter" DIY template (§5).

**Recommended first slice:** a read-only continuation of an **existing, template-sourced DIY project** in Ask, extended later with confirmation-gated step commands. Not a seasonal-task walkthrough, and not AI-generated guides.

## 2. How this document is organized

§3 evidence; §4 the eight C.11.8 decisions (D1-D8); §5 the reference scenario worked honestly; §6 contract and architecture impact, including schema; §7 prerequisites; §8 delivery slices and acceptance; §9 risks and the adversarial pass; §10 decisions requested; §11 out of scope.

## 3. What exists today

| # | Finding | Label |
| --- | --- | --- |
| E1 | `DiyProjectTemplate` has an editorial lifecycle `DRAFT → REVIEW → APPROVED → ACTIVE → ARCHIVED`, `approvedBy`/`approvedAt`, a `safetyLevel` (LOW/MODERATE/HIGH) and `permitRequirement`; capability-separated author, review and publish; HIGH-safety templates must be published by someone other than the approver; saving content does not publish (`ADMIN_MODULE_FRD.md` §10.6). `DiyTemplateStep` carries title, description, `safetyNote`, `tipNote`, `imageUrl`, `isOptional`, `estimatedMinutes`. | Code-traced |
| E2 | The same FRD lists "published revisions are immutable; corrections create new revisions" and "DIY revision includes steps, materials, tools, costs, safety level as one snapshot" as **PLANNED**. `adminUpdateTemplate` (`diy.service.ts:596`) deletes and recreates a template's steps in place and does not touch `status` or `approvedBy`. There is no revision column on the template. | Code-traced |
| E3 | `createProject` creates a project from `templateId` (requires `status: 'ACTIVE'`) **or** from `aiGuideId` (an LLM-generated guide whose `stepsJson` is validated for shape only). Both copy steps into `DiyProjectStep` inside one transaction; template steps record `templateStepId`, AI steps leave it null. Both paths run `evaluateDiyEligibility` (fail-closed; only reviewed, low-risk, non-regulated work) and `evaluateDiyApplicability`. | Code-traced |
| E4 | `DiyProjectStep` has `status` `PENDING \| IN_PROGRESS \| COMPLETED \| SKIPPED`, `notes`, `completedAt`, but **no `updatedAt`** and no `imageUrl`. `DiyProject` has `status` `PLANNING \| IN_PROGRESS \| COMPLETED \| ABANDONED \| HIRED_OUT`, `startedAt`, `completedAt`, `abandonedAt`, `maintenanceTaskId`, `incidentId`, `photoUrls`. | Code-traced |
| E5 | `updateStep` flips the project to `IN_PROGRESS` in one write and updates the step in a second, outside a transaction; it does not check step order, ownership of the step beyond the project, or the step's current status. Any step can be set to any status in any order. | Code-traced |
| E6 | `completeProject` does not require required steps to be complete. Its check "already completed" and the update are separate (not a compare-and-set). `DiyCompletionService.onComplete` then creates a `HomeEvent` (idempotency key `diy-complete-<id>`), sets a linked maintenance task `COMPLETED` with `propertyMaintenanceTask.updateMany`, and resolves a linked incident; failures are logged and swallowed. | Code-traced |
| E7 | The governed completion path is `PropertyMaintenanceTaskService.updateTaskStatus`: contributor floor, a compare-and-swap on `updatedAt`, a completion idempotency key, `completionDetails` (`completedAt`, `fulfillmentMode: 'DIY' \| 'PROVIDER'`, `notes`, `followUpNeeded`, `photoDocumentIds`), and `applyTaskCompletionSideEffects`, which completes the linked `SeasonalChecklistItem` and bumps the checklist's counters. The DIY raw update skips all of that. | Code-traced |
| E8 | The link between a DIY project and a maintenance task is **one-sided**: `DiyProject.maintenanceTaskId` exists; `PropertyMaintenanceTask` has no pointer back. Completing the task through the page or Ask does nothing to the project. | Code-traced |
| E9 | `DiyProjectStep.templateStepId` is written once and has **no reader** in the backend. | Code-traced |
| E10 | Ask's `DIY_PROJECTS` is a VIEWER-floor read; its skill manifest (autonomy 1, effects READ, no `TASK_GUIDE`) states that "starting, stepping through, completing and abandoning projects, and the AI guide, stay on the page" (FRD v1.58). | Code-traced |
| E11 | The shipped guided-journey continuation is the reusable pattern: an entity-keyed read (`entityType` launch context), writes only as declared, confirmation-gated, CONTRIBUTOR-floor commands that start only for their exact declared message and never on `ASK_REFRESH`; a context version that rejects a stale confirm; "already" receipts instead of second writes; refresh through `ASK_MUTATION_IMPACT_MAP`; "Ask never completes a step on the homeowner's word alone"; skip governed by a skip policy. | Code-traced (FRD text) |
| E12 | `AskExecution` is a conversation record: rows expire with the session (`ASK_RAW_CONVERSATION_RETENTION_DAYS`, default 30, max 365) and carry `parentExecutionId`/`linkedExecutionId`. It is not a place for durable domain progress. | Code-traced |
| E13 | `TASK_GUIDE` today has `eyebrow`, `chips`, `tip`, `main`, `history`, `notes` (max 4) and `actions` (max 6); no steps, progress or outline. `AskEntityType` is `PROPERTY \| MAINTENANCE_TASK \| INVENTORY_ITEM \| QUOTE \| DECISION_THREAD`. | Code-traced |
| E14 | Guidance journeys (`GuidanceJourneyStep`, `GuidanceStepEvidence`) have governed, proof-backed step completion, but their steps are decision and tool-launch steps (`toolKey`, `routePath`), not physical-task instructions. | Code-traced |

## 4. The eight C.11.8 decisions

### D1. Canonical step source, authoring governance, versioning (C.11.8 item 1)

**Decision:** the only step source Ask may present as a guide is **an admin-authored `DiyProjectTemplate` in `ACTIVE` status, as snapshotted into a `DiyProject`'s steps**. Eligible means: `project.templateId` is set, `project.aiGuideId` is null, every step has `templateStepId`, and the template currently satisfies `evaluateDiyEligibility` and is still `ACTIVE`.

- **AI-generated guides are excluded** (E3). Their steps are not author-reviewed, which C.11.8 item 1 forbids. Such a project keeps its page link and is not offered as a guide in Ask. This is a presentation boundary, not a change to the page.
- **Safety instructions** are the step's `safetyNote` and the template's `safetyLevel` and `permitRequirement`. Every step with a `safetyNote` shows it before the action that advances the step, never behind a disclosure. HIGH-safety and any template failing the eligibility boundary are not guided (the boundary already fails them closed at project creation).
- **Help branches:** none authored in v1 (D6).
- **Media:** none in v1. `DiyTemplateStep.imageUrl` exists but is not copied into `DiyProjectStep` (E4) and cannot be recovered by `templateStepId` because template edits recreate step ids (E2, E9).
- **Versioning.** The project's step snapshot is the version a homeowner works against, so in-flight projects are stable against later template edits. Two gaps remain: (a) an ACTIVE template's steps can be replaced without returning to review (E2), so "author-reviewed" is a statement about the lifecycle, not about the exact text served; (b) there is no record of which revision a snapshot came from. **Minimal remedy (decision O2):** add `DiyProjectTemplate.revision Int @default(1)`, increment it on any content update, and record `DiyProject.templateRevision Int?` at snapshot time. This is the smallest schema change that lets a guide say "this guide was corrected after you started" and offer a refresh. The stronger remedy (immutable published revisions, re-review on edit) is the ADMIN module's PLANNED work and is **not** a prerequisite for a read-only first slice.
- **Stale-source rule (no schema needed):** on every read the guide re-checks that the template is still `ACTIVE` and still eligible. If not, the guide shows "This guide has been withdrawn" with the page link, and **step-advancing actions are not offered**. Read-only viewing of the snapshot is allowed so a homeowner mid-job can finish reading, with the withdrawal message above the step.

### D2. Where progress lives (C.11.8 item 2)

**Decision: canonical domain workflow state**, i.e. `DiyProjectStep.status` and `DiyProject.status`. Not execution-local, not session-local.

Reason: executions and sessions expire (E12, default 30 days), a guide must resume across sessions and devices, and the page already reads and writes the same rows, so any copy in Ask would diverge. Ask holds **no progress state**. The continuation view reads current rows each time (as the journey continuation does). A historical execution keeps the guide as it was shown (IW-CONV-PRES-003); its block records the step and project status at render time, and the existing result-revalidation boundary offers a refresh when the live state differs.

### D3. Pause, resume, previous, skip, abandon, stale source, completion (item 3)

| Semantic | Design |
| --- | --- |
| Start | Out of v1. The project must already exist (created on the page, with eligibility and applicability). Creating one from Ask is a later, confirmation-gated command (slice 5). |
| Current step | The first non-terminal **required** step in order, derived from canonical state, never remembered by Ask. The page can change steps out of order (E5), so Ask reads state and does not assume a cursor. |
| Pause / resume | **No pause state exists and none is added.** Pausing is leaving: the step stays `IN_PROGRESS` and the project stays `IN_PROGRESS`. Resume is reopening the continuation from the project list, a pinned result, or a launch, on any device. The guide says where the homeowner left off from canonical state. |
| Previous | A **read-only** view of an earlier step (outline plus that step's text). It changes nothing. Re-opening a completed step to work on it again is a confirmation-gated `REOPEN` correction (slice 3). |
| Skip | Only `isOptional` steps and only through a confirmed command. A required step cannot be skipped silently; a step carrying a `safetyNote` cannot be skipped. This mirrors the guidance engine's rule (E11). |
| Abandon / hire out | Existing `abandonProject` semantics (`ABANDONED` or `HIRED_OUT`), as a confirmation-gated command with no silent effect on a linked task. Slice 4. |
| Complete a step | A confirmed command; see D5 for what it claims. |
| Complete the project | A confirmed command, allowed only when every required step is `COMPLETED` or `SKIPPED` (optional). See P2: today the service does not enforce this, so enforcement must be shared, not Ask-only. |
| Stale / conflicted | Commands carry a context version (step id, step status, project status, template revision when O2 is approved) and apply with a **conditional write on the expected status** (D8), so a changed target is rejected and an already-applied one returns an "already" receipt. |

### D4. What completion affects (item 4)

- **A step completion affects the DIY step only.** It never completes a maintenance task, seasonal item, incident or home record.
- **Project completion** goes through the existing DIY completion (a `HomeEvent` badged as homeowner-completed, a linked maintenance task, a linked incident), **after P3 is done**: the linked task must be completed through `PropertyMaintenanceTaskService.updateTaskStatus` (governed, idempotent, with `fulfillmentMode: 'DIY'`), so its seasonal item and counters follow (E6, E7). Until P3 lands, the guide must not offer project completion for a project with a linked maintenance task or incident; it offers the page.
- **Reverse direction (E8).** If the task is completed elsewhere, the project stays open. The guide's read must detect "linked task already completed" and say so, offering to close the project, rather than keep showing open steps. This needs no new pointer for the read (the project holds the task id) but means the reconciliation runs from the guide's side only; a task-side pointer is **not** proposed (O-note in §10).

### D5. Proof policy for physical completion (item 5)

- **A guide records what the homeowner reported, never verifies.** Step and project completion are "marked done by you" and are stored and spoken of as self-reported, consistent with the `USER_REPORTED` home-event badge and the journey rule that completing a step is not certifying the physical outcome (E11).
- **Wording alone never advances state.** Only a declared action's exact message, confirmed, mutates; typed "I finished" is an ordinary question and gets a normal answer with the action offered. `ASK_REFRESH` never writes (E11).
- **Evidence is optional and attached through existing paths**: at the last step the guide offers the existing attach-evidence control and, on project completion, passes `photoDocumentIds` and `fulfillmentMode: 'DIY'` to the governed maintenance completion when a linked task exists. A photo is described as "attached", never as proof the work is correct.
- **No photo gate in v1** (O4). A gate would exclude homeowners and prove only that a photo exists.
- v1 covers LOW-safety, non-regulated work only (the eligibility boundary), so the consequence of a false self-report is bounded to the homeowner's own records.

### D6. Contextual help as child turns (item 6)

- Help is a `CONVERSATION_CONTINUE` action that creates a **child execution** (`parentExecutionId` already exists, E12) with a launch context carrying `{ projectId, stepId, contextVersion }`. The child is read-only and cannot carry a mutation. The parent guide and the canonical step are untouched, so **help cannot advance the step**; only the step commands can.
- v1 help answers only from recorded content (the step's text, `safetyNote`, `tipNote`) and the existing deterministic routing; **no LLM** (consistent with the standing "LLM is the last resort" rule) and no authored help branches. Anything outside that is a normal Ask turn. Safety-first routing already applies to any child turn.
- Returning to the step re-runs the continuation read from canonical state.

### D7. Capture and confirmation integration (item 7)

- A fact discovered during a guide (for example a filter size) is **not guide state and not a home fact**. It enters the existing governed capture and confirmation path (Property Context catalog, `AskCaptureReceipt`), as in C.11.7. The guide never writes a property fact and never silently persists an inference.
- Step notes (`DiyProjectStep.notes`) are DIY-domain data and are **not written from Ask in v1**.
- Every Ask write is a registered command with confirmation, authorization, idempotency and reconciliation, as for every other command (`askDomainCommandRegistry.ts`). No shadow record is created.

### D8. History, access loss, roles, idempotency, reconciliation, mobile, accessibility (item 8)

- **Roles:** reading the guide is VIEWER floor; every command is CONTRIBUTOR floor, with the same property-level authorization the page uses. (The service finds a project by `projectId` and `propertyId` only, so any member with property access can act on any member's project; Ask keeps parity and does not tighten it.)
- **Access loss:** re-resolved on every read and refresh; a lost-access result renders the stored guide read-only with actions disabled and no live data, using the existing `onAccessLost` path.
- **Idempotency and conflict.** `DiyProjectStep` has no `updatedAt` (E4). Rather than add one, **commands apply a conditional write on the expected status** (`updateMany` where `id`, `projectId` and `status = expected`), in one transaction with the project's own transition. Replays find the target status already set and return an "already" receipt with no second effect. Project completion is a conditional write on `status`, with the home-event and maintenance writes keyed (`diy-complete-<id>`; a completion idempotency key for the maintenance call).
- **Reconciliation:** after a command, `ASK_MUTATION_IMPACT_MAP` refreshes the source continuation view and the `DIY_PROJECTS` list (and the seasonal/maintenance views when a linked task was completed).
- **Partial failure in completion (E6).** Today project completion commits and the side effects can fail silently. The design requires the completion command to report each effect's outcome; a project that is `COMPLETED` while its linked task is not must be visible and **re-driven idempotently** by the next guide read or an explicit "finish recording" action, using the same idempotency keys, not by a new table or worker.
- **Mobile and accessibility:** one step per view; the safety note above the action; a real `<button>` for each action; the progress text stated in words ("Step 2 of 6, 1 done"), not only as a bar; `aria-current="step"` on the outline's current step; focus returns to the new step heading after a confirmed command; reduced motion honored; keyboard-only path for every action, including the confirmation. These are acceptance criteria in §8, not yet implemented behavior.

## 5. The reference scenarios, worked honestly

**Furnace-filter guidance.** The seasonal catalog records one description ("Check and replace HVAC filters every month…"), a priority, a time and a cost, and **no steps**. No DIY template for it is authored anywhere in the repository (searched `prisma/*.sql`, `prisma/*.ts` and `src/data`), and the only link between the seasonal catalog and DIY is the boolean `isDiyPossible` on a seasonal template; there is no `taskKey`-to-template mapping (searched `src/services/seasonal`, `src/data/seasonalTaskTemplates.json` and the Ask seasonal builder). So **today it cannot be a stateful guide**, and inventing steps would break C.11.8. To make it one the owner must: (1) have the content team author, review and publish a LOW-safety "Replace a furnace filter" DIY template through the admin workflow; (2) decide how a seasonal task finds it (O5). Only then does a homeowner reach it by starting a DIY project from that template (page, then later Ask), optionally linked to the seasonal task's maintenance task.

**Winter plan and home safety.** Neither has steps and neither is a candidate. Home-safety items are a checklist of things to know, not a procedure; the existing grouped list is the correct presentation.

## 6. Contract and architecture impact

| Area | Impact | Approval needed |
| --- | --- | --- |
| **Response contract** | Extend `TASK_GUIDE` additively rather than add a block type: optional `progress { current, total, completed, label }` and optional `outline[]` (step id, title, state), and a rendered "Step N of M" that is truthful because it derives from canonical state (contrast Phase 1, where "Task N of M" was a false claim). Absent fields mean today's guide. Old stored executions parse unchanged. | Yes (O1) |
| **Operations** | New read `DIY_PROJECT_GUIDE` (VIEWER, entity-keyed; routes through `focusedOperationForLaunchContext` like `DECISION_THREAD`). New commands `DIY_STEP_UPDATE` (complete, skip optional, reopen) and later `DIY_PROJECT_COMPLETE`, `DIY_PROJECT_ABANDON` (CONTRIBUTOR, confirmation-gated, non-routable, correction modes declared). New `AskEntityType` `DIY_PROJECT`. | Yes |
| **Skill and governance** | The `diy` skill manifest changes from autonomy 1 and READ to include the write effects and `TASK_GUIDE`; this **reverses the FRD v1.58 decision** that stepping through projects stays on the page (O8). Governance validators, `KNOWN_UNGOVERNED_OPERATIONS` (not needed if the skill owns the operations), the startup-registry test, `OPERATION_BOUNDARIES` and `OPERATION_ACTION_IDS` allow-lists (exact ids), and the interaction coverage matrix all need entries. | Yes (O8) |
| **Frontend** | `TaskGuideBlock` renders progress and outline from the declared fields only; no inference of step state; actions keep declared styles. | n/a |
| **Schema** | **No schema change is required for the read-only slice or for step commands.** One recommended addition (O2): `DiyProjectTemplate.revision`, `DiyProject.templateRevision`. Optional later: copy `imageUrl` onto `DiyProjectStep` for media; `DiyProjectStep.updatedAt` is *not* needed given the conditional-write design. Per repository policy the Prisma schema is edited and applied with `prisma db push`; no migration scripts. | Yes (O2) |
| **Existing behavior changes** | P2 (completion requires required steps), P3 (governed maintenance completion), P4 (transactional `updateStep`) change what the **page** does too. | Yes (O3) |

## 7. Prerequisites (before any write command ships)

| ID | Prerequisite | Why | Type |
| --- | --- | --- |
| **P1** | Content: author, review and publish at least one LOW-safety DIY template through the admin workflow (the furnace-filter one, if that scenario is the goal) | There is no step content to guide; production content is unknown | Content, owner |
| **P2** | `completeProject` requires every required step to be `COMPLETED` or `SKIPPED` (or an explicit, recorded "finish early"), with the completion check and update as one conditional write | E6; a guide that shows "step 2 of 6" must not let the project complete at step 2 | Service fix, behavior change on the page |
| **P3** | `DiyCompletionService` completes a linked maintenance task through `PropertyMaintenanceTaskService.updateTaskStatus` (idempotency key, `fulfillmentMode: 'DIY'`, `photoDocumentIds`) instead of `updateMany`; effect failures reported, not swallowed | E6, E7; otherwise a seasonal-linked DIY completion leaves the seasonal item and counters stale | Service fix |
| **P4** | `updateStep` becomes one transaction with a conditional write on the expected status | E5; two-write failure window and no concurrency control | Service fix |
| **P5** | Decide and implement the reverse-direction check (E8): the guide read flags a linked task already completed elsewhere | Items 11/20 of the methodology; otherwise the guide misreports an already-finished job | Ask-side read |

P2-P4 are fixes the DIY page needs regardless of Ask, and are the same kind of "completion parity" prerequisite the journey continuation required (its Phase 0).

## 8. Delivery slices and acceptance

| Slice | Content | Acceptance (all must be tests unless noted) |
| --- | --- | --- |
| **0** | P2, P3, P4, P5 with tests; P1 content started by the owner | Concurrent completion yields one effect; a seasonal-linked completion completes its seasonal item and counters; a failed effect is reported and re-driven by key; steps cannot complete a project early |
| **1** | Read-only `DIY_PROJECT_GUIDE` + additive `TASK_GUIDE` progress/outline; entry from a `DIY_PROJECTS` row; template-sourced projects only | AI-guide and non-eligible projects are refused with a page link; withdrawn template shows the withdrawal message and offers no advancing action; current step derived from state, not remembered; old stored executions unchanged; viewer sees no write action; progress words correct; skill, allow-list, registry and startup validators pass; component tests for outline, `aria-current`, focus; **runtime unverified** unless a browser run is separately approved |
| **2** | `DIY_STEP_UPDATE` (complete, skip optional, reopen) | Typed wording never writes; `ASK_REFRESH` never writes; stale confirm rejected; replay returns "already" with no second effect; required and `safetyNote` steps cannot be skipped; receipt says "marked done by you"; impact map refreshes the source view and list |
| **3** | Previous-step read view and `REOPEN` correction | Viewing an earlier step changes no state; reopen is confirmed and idempotent |
| **4** | `DIY_PROJECT_COMPLETE` / `DIY_PROJECT_ABANDON` | Completion only when P2 holds; linked task completed through the governed path; abandon leaves a linked task untouched; partial effect failures visible and re-driven |
| **5** | Help child turns; optionally project creation from Ask; seasonal-to-DIY entry (O5) | Child turn is read-only and cannot mutate; the parent step is unchanged; creation reuses the same eligibility and applicability checks |

## 9. Risks and the adversarial pass

**Principal risks:** invented or AI-sourced steps presented as reviewed (D1); a guide that lets the project complete early (P2); stale seasonal state after DIY completion (P3); presenting self-reported completion as verification (D5); a page behavior change surprising homeowners (O3); an ACTIVE template edited after approval without notice (E2).

**Methodology items applied to this design**

- *11, reuse of an existing field:* `DiyProjectStep.status` and `notes` have exactly the consumers in `diy.service.ts` (and the Ask `DIY_PROJECTS` read for counts); `templateStepId` has none (E9), so the design neither depends on nor changes its meaning.
- *12, a worked example must not manufacture precision:* §5 states that the furnace-filter task has no steps and no template, instead of showing an illustrative stepper.
- *14, idempotency scoped to "did this operation run":* step commands are idempotent by target status (the state the command produces), and project completion by the keyed home-event and maintenance writes, not by filtering on "currently active" rows.
- *15, persist intent before the risk window:* confirmed commands use the existing confirmation receipt, written before the domain call; the completion re-drive relies on the persisted `COMPLETED` project state plus keys, not on an in-memory task.
- *16, uniqueness granularity:* no new uniqueness constraint is introduced.
- *17, synchronizing independent operations:* project and maintenance-task completion are reconciled **after commit and idempotently** (read-driven re-drive), not by each checking the other during its own write.
- *20, a relationship needs a pointer on both sides:* E8 is exactly this gap. The design reconciles from the guide's side only and records the one-sided link as accepted, not as solved (O6).

**Falsification checks:**

- *"No schema change is needed for step commands."* Falsifier: a command that cannot detect a concurrent change. Mitigation is the conditional write on expected status (D8); the residual risk is an ABA sequence (pending → in progress → pending) between read and write, which yields at worst a redundant but valid transition, since the target status is what the command asserts. [Inferred; to be exercised by a concurrency test in slice 2.]
- *"Only template-sourced projects are guideable."* Falsifier: a project with `templateId` set whose steps were edited later. Steps are copied at creation and the page can change status, notes and photos only, not step text [Code-traced: `updateStep` patch is `status` and `notes`], so snapshot text equals the template text at creation.
- *"The page, not Ask, is the only other writer of step state."* Falsifier: another caller that writes `diyProjectStep`. Searched `apps/backend/src` and `apps/workers/src`: step rows are created and updated only in `diy.service.ts` (lines 245, 356, 490); `diyProject` is written only there and in `diyCompletion.service.ts` [Code-traced]. `AdminCreateTemplateSchema` carries no `status` or approval field, so template edits cannot change lifecycle state through the admin update [Code-traced].
- *"Executions expire so progress cannot live there."* Falsifier: a retention setting that is unbounded. The setting is capped at 365 days, so it is bounded.

## 10. Decisions requested

Each has a recommended default; **nothing starts until these are answered.**

| ID | Decision | Recommended |
| --- | --- | --- |
| **O1** | Extend `TASK_GUIDE` with optional `progress` and `outline` (no new block type) | Yes |
| **O2** | Add `DiyProjectTemplate.revision` and `DiyProject.templateRevision` (`prisma db push`, no migration) | Yes, in slice 1, so "corrected after you started" is possible from the start |
| **O3** | Accept the page behavior changes in P2 (completion requires required steps), P3 and P4 | Yes; they are correctness fixes |
| **O4** | Proof policy: self-reported only, optional evidence, no photo gate in v1 | Yes |
| **O5** | How a seasonal task finds a DIY template: (A) tag convention, (B) a column on the seasonal template, (C) defer and start guides only from the DIY project list | **C** for v1 |
| **O6** | Accept reconciling project-to-task from the guide's side only, with no task-side pointer | Yes for v1; revisit if tasks completed elsewhere leave many open projects |
| **O7** | Who authors and publishes the first LOW-safety template, and which one | Owner/content team; the furnace filter if that scenario is the goal |
| **O8** | Reverse the FRD v1.58 decision that stepping through DIY projects stays on the page, for template-sourced projects only | Yes, scoped as above |
| **O9** | Help in v1 is recorded text only, no authored branches and no LLM | Yes |

## 11. Out of scope

AI-generated guides in Ask; any HIGH or MODERATE safety project; regulated or permitted work; authored help branches; step media; step-level evidence; a seasonal-to-DIY mapping (until O5); canonical gas-service capture and the ASSESS flow (Phase 4); a notes editor in Ask; changing who may act on a household member's project; the ADMIN module's immutable-revision work.
