# `DIY_STEP_UPDATE`: Marking a Step Done or Skipping It From Ask — Step 6 Implementation Plan

**Date:** October 6, 2026
**Status:** **Draft, awaiting approval of S6-1 to S6-12 (§10).** Nothing in this plan is built. **It needs no schema change.**
**Parent design:** [`ASK_COZY_STATEFUL_GUIDE_DESIGN.md`](ASK_COZY_STATEFUL_GUIDE_DESIGN.md) §13, step 6 (sequencing row "2": decisions O3, O8, O10, O11), D3 (current step, skip rules), D5 (self-reported, never verified), D7 (no notes from Ask), D8 (authorization, concurrency, impact refresh)
**Follows:** steps 1 to 5, all pushed: revisions, transitions, completion outbox, reverse reconciliation and the read-only project guide ([`…PROJECT_GUIDE_PLAN`](ASK_COZY_DIY_PROJECT_GUIDE_PLAN.md) is the direct predecessor: this step adds the first write to it).
**Method:** `AUDIT_METHODOLOGY.md` design items 11-20 and the section 7 adversarial pass (§8); the project's Ask write-command rules (non-retrievable, read the traditional controller for hidden effects, declared-action-only starts guarded against `ASK_REFRESH`, allow-listed action ids, startup validators). Labels: **[Code-traced]** read, not run; **[Executed]** ran. Nothing in this document was executed.

## 1. Goal and boundary

**Goal.** From the project guide in Ask, a household member who can edit the property can **mark the current step done**, or **skip it when it is optional and carries no safety note**, through a confirmation, with the same version-checked, actor-attributed transition the project page uses. The guide then refreshes in place to the next step. What is recorded is the homeowner's own report ("marked done by you"); nothing here verifies the physical work (D5), and nothing here completes the project, touches a linked task, or writes a note.

**In scope:** the operation `DIY_STEP_UPDATE` with two actions (complete, skip) and its confirmation; the advancing actions on the guide card (and their rules); the confirm-time re-checks; the receipt; the impact refresh of the source guide and the project list; the skill, domain-command and registry entries; the viewer-filter hardening the trace found; the frontend focus and announcement behavior; tests and the owner-run Postgres script.

**Out of scope (the design's next row, which becomes step 7):** reopening a step (declared as a correction mode, not offered); the read-only previous-step view; `DIY_PROJECT_COMPLETE` and `DIY_PROJECT_ABANDON`; the recovery command for a dead-lettered completion; starting a step ("Start step" has no Ask counterpart: marking done from pending is allowed by the service and is all Ask offers); step notes and photos (D7); creating a project from Ask. **Still blocked on O7:** there is no production template, so none of this is reachable by a real project until the first template is authored and published.

## 2. What exists today

| # | Finding | Label |
| --- | --- | --- |
| W1 | The service transition already exists and is what the page calls: `diyService.updateStep(projectId, propertyId, stepId, { status }, { actorUserId, expectedUpdatedAt })`. It claims the project row, checks the step's version token, applies the transition table (skip only an optional step without a safety note), records the actor and a ledger row, and returns `{ step, alreadyApplied }`; its refusals carry `DIY_STALE`, `DIY_PROJECT_CLOSED`, `DIY_STEP_TRANSITION_NOT_ALLOWED`, `DIY_TOKEN_REQUIRED`. | Code-traced |
| W2 | **The traditional controller adds no other effect** for a step update (it returns the service result; analytics are emitted for project completion and abandonment only). So Ask repeats nothing beyond the service call (write rule 2). | Code-traced |
| W3 | The precedent for a confirmation-gated write on one step of a record is `GUIDANCE_STEP_SKIP` (commit `fe1c025e`): an operation of family `COMMAND`, `CONTRIBUTOR` floor, non-routable, registered in `askDomainCommandRegistry` with refusal copy and a correction mode, a propose handler (declared-action-only guard, access check, state checks, a context-version hash, a confirmation with fields) and a confirm handler (`registerConfirmCapabilityHandler`: access, re-read, version check, the service call, an "already" receipt, a receipt block, and `reconcileAskExecutionSideEffects`), plus `ASK_MUTATION_IMPACT_MAP` entries that refresh the source views. Its files are the registration checklist (25 files). | Code-traced |
| W4 | A write skill is declared `autonomyLevel: 2`, `effects: ['READ', 'WRITE']`, `materiality: 'MATERIAL'`, `reversibility: 'PARTIALLY_REVERSIBLE'` (`guidance-overview` after its Phase 3). The `diy` skill is today `autonomyLevel: 1`, effects `['READ']`, which FRD v1.58 recorded as "reads only"; this step reverses that for template-sourced projects (O8). | Code-traced |
| W5 | The refresh of a source view after a write runs the original handler with `surface: 'ASK_REFRESH'` and the stored focus fields (`entityType`, `entityId`, ...), so a guide execution refreshes to the new state with no extra plumbing, **provided** the guide handler is a pure read (it is: step 5). | Code-traced |
| W6 | **The viewer filter is pattern-based and has a hole for this step.** A block-level action is hidden from a `VIEWER` only if its id or label starts with one of a fixed list of mutation verbs (`add`, `complete`, `mark`, `set`, `update`, ...). **`skip` is not in the list**, so "Skip this step" would not be hidden from a viewer by the filter. The guided-journey skip action has the same latent gap; it is covered there only because the producer emits it only for contributors. | Code-traced |
| W7 | A block-level action that looks like a mutation also needs the household role established by the audience policy, and its id must be in the operation's allow-list (`OPERATION_ACTION_IDS`), or the trust pipeline strips it silently. `START_WORKFLOW` actions on a `TASK_GUIDE` carry `message`, `operationId`, `entityType` and `entityId` (the seasonal guide already does this). | Code-traced |
| W8 | The step-5 guide handler has no user in hand (`diyProjectGuideResult(propertyId, launchContext)`), so it cannot yet tell who may act. Its envelope does carry the user, and `ensurePropertyAccess(userId, propertyId)` returns the role (the journey continuation uses exactly this). | Code-traced |
| W9 | **Nothing in this step can run for a real project yet** (G9, O7). | Code-traced |

## 3. Target behavior

### 3.1 The actions on the guide

For a guide that passes the step 5 gate, when the viewer of the answer is a **CONTRIBUTOR or OWNER** and the guide's source state is **CURRENT or SUPERSEDED** (never **WITHDRAWN**: a withdrawn guide offers no step-advancing action, per D1), the `TASK_GUIDE` card carries, for the **current step only**:

- **"Mark this step done"** (`PRIMARY`): a declared `START_WORKFLOW` action: exact message `Mark this step done.`, `operationId: 'DIY_STEP_UPDATE'`, `entityType: 'DIY_STEP'`, `entityId` the current step's id.
- **"Skip this step"** (`QUIET`): the same shape with the exact message `Skip this step.`, **only if** the step is optional **and** has no safety note.

Viewers see the guide exactly as in step 5, with no such action (it is not emitted for them, and the pattern filter is hardened as a second layer, §3.6). The page link "Open this project" stays.

### 3.2 The operation (propose, confirm)

`DIY_STEP_UPDATE` follows the `GUIDANCE_STEP_SKIP` pattern: non-routable, family `COMMAND`, floor `CONTRIBUTOR`, reached only by its declared actions.

**Propose** (the handler): refuses unless the launch context is `entityType 'DIY_STEP'`, `operationId 'DIY_STEP_UPDATE'`, `surface` is not `ASK_REFRESH`, and the **message equals one of the two canned messages exactly** (so typed wording never writes, and a refresh never proposes). It then checks, each with a fixed refusal and nothing written: the user is a contributor or owner; the step exists in this property; the project is open; **the project still passes the guide gate** (strict step match included) and is not withdrawn; **the step is still the current step** (a stale card for an earlier step is refused as "this step has moved on"); and, for skip, the step is optional and has no safety note. A step already in the target status returns an **"already" receipt** with no confirmation. Otherwise it returns a confirmation: the step and project as fields, **the step's safety note repeated as a field when it has one**, a consequence line, a `contextVersion` hash (step id, status, version, project status) and the step's version token in the parameters.

**Confirm** (the confirm capability handler): re-checks access and the guide gate, re-reads the step, rejects a changed `contextVersion` (unless the step is already in the target status), and calls `diyService.updateStep` with the **actor, the target status and the step's version token** captured at propose time. The service stays the final authority: its refusals (`DIY_STALE`, `DIY_PROJECT_CLOSED`, `DIY_STEP_TRANSITION_NOT_ALLOWED`) are mapped to the confirmation conflict codes with plain copy. It then refreshes the source guide and the project list (§3.5).

### 3.3 The receipt (D5)

A `WORKFLOW_PROGRESS` receipt: **"Marked done by you"** or **"Skipped by you"**, with the step and project, and the sentence "This is recorded as your report; Cozy doesn't check the work." An "already" receipt says "Already marked done" with "Nothing was changed." If that action resolved the last step, the receipt adds "Every step is resolved. Finish the project on the project page." (completion from Ask is step 7).

### 3.4 What a step command does not do

It changes the **step and the project's own version and status only** (the first activity on a pending step starts the project, as on the page): no maintenance task, no seasonal item, no incident, no home event, no notes, no photos. No outbox event is written (the completion outbox belongs to project completion).

### 3.5 Refresh

`ASK_MUTATION_IMPACT_MAP`: `DIY_STEP_UPDATE` refreshes `DIY_PROJECT_GUIDE` and `DIY_PROJECTS`. The guide execution you were looking at re-runs as a pure read and shows the next step. A refresh failure is disclosed on the receipt and never fails the write.

### 3.6 Viewer filter hardening

`skip` (and `reopen`, for step 7) are added to the mutation verbs the audience filter recognizes, so a viewer's answer cannot carry a "Skip ..." action through a producer mistake. The role gate at emit time remains the primary control.

### 3.7 The safety note and the advancing action (the reconsideration S5-6 required)

The structure stays: the step's safety note is a caution block **immediately before** the guide card, and the advancing actions sit **inside the card, below** it, so the note is always above the action. Three additions make that structural rule hold up under change: (1) a test on the **final, trust-validated block sequence** that any answer containing an advancing action also contains the current step's safety note directly before the card, when the step has one; (2) the confirmation card repeats the note, so it is seen again at the moment of acting; (3) the guide handler **does not emit** the advancing actions if the safety block could not be emitted (it always emits it when a note exists, so this is a guard against a future change).

### 3.8 The frontend

When the same guide card updates in place (a refresh after a confirmed command) and the current position changes, **focus moves to the card's heading** (made programmatically focusable) and the progress sentence, which becomes a polite live status, announces the new position. Nothing moves on first render, on a refresh that changes nothing, or on opening the tip. Reduced motion needs nothing (no animation).

## 4. Schema

**None.** The transition, the version token and the ledger exist (step 2).

## 5. Slices

| Slice | Content | Gate |
| --- | --- | --- |
| **6-0** | A trace, no behavior change: how a `START_WORKFLOW` action on a `TASK_GUIDE` reaches the handler (which launch fields survive), the confirm-card rendering of fields, the domain-command and confirm-handler registries and their counted tests, the skill write-effects validators, and the exact verbs of the mutation filter | Findings recorded in §12 |
| **6a** | Backend: the guide handler gains the user and emits the actions (§3.1, §3.7); the operation, propose and confirm handlers, the domain command, the receipt; the impact map; the skill moves to write effects (S6-7); the registration chain; the filter hardening; tests and mutation checks | Governance, registry, startup-registry and Ask suites; `tsc` |
| **6b** | Frontend: focus and announcement on in-place update; jest tests and mutation checks | `next build`; the frontend Ask suites |
| **6c** | An owner-run real-Postgres script (the real confirm path, the real transition, database triggers proving exactly which tables a command writes), read-only queries and the runbook; **written, not run here** | Your gate |

**6a and 6b ship together.** The backend must not emit the actions before the frontend can handle them only in the sense of focus; the actions themselves render with today's frontend, so the order is not critical.

## 6. Validation plan

| Check | Kind (when run) |
| --- | --- |
| The actions: offered only to a contributor or owner, only on the current step, only for a guide that is current or superseded (never withdrawn, never a refusal); skip only for an optional step with no safety note; exact messages, operation, entity type and entity id | Test |
| **Typed wording never writes:** the exact canned message typed in the box, a near-miss, and a launch from `ASK_REFRESH` each answer with the boundary and write nothing; the operation is not message-routable | Test |
| Propose refusals, each writing nothing: viewer, unknown step, step in another property, finished project, withdrawn or refused guide, a step that is no longer current, skip of a required step, skip of a safety-note step | Test |
| The confirmation: fields, the repeated safety note, the version token and context hash, an "already" receipt when the step is already in the target status | Test |
| Confirm: stale `contextVersion` rejected; a step changed by someone else (`DIY_STALE`); a project closed meanwhile; a replay returns "already" with **no second ledger row**; actor attributed; the service's refusals mapped to plain copy | Test, on the shared fake |
| **What a command writes, exactly:** the step, the project's version and status, one ledger row; no outbox event, no task, no home event, no incident | Test with a write spy |
| The impact refresh: the source guide and the list refresh; a refresh failure is disclosed and does not fail the write | Test |
| Receipt wording: "marked done by you" and "skipped by you", never "verified" or "completed" for the project; the all-resolved note | Test |
| **Adjacency and viewer safety on the final trust-validated sequence:** every answer carrying an advancing action carries the safety block directly before the card; a viewer's final answer has no advancing action even if a producer emitted one (the hardened filter) | Test |
| Skill, domain command, adapter, coverage matrix, certification, semantic packages, audience policy, allow-lists with the exact action ids, startup-registry validators, the counted assertions (operations, adapters, confirm handlers, domain commands) | Test (governance, registry and Ask suites) |
| Frontend: focus moves to the heading and the status announces the new position when a guide updates in place; nothing moves on first render, an unchanged refresh or the tip; the actions render with their declared styles | Test, jest |
| Mutation checks: skip allowed for a required or safety-note step; the actions offered to viewers or on a withdrawn guide; typed wording writing; the `ASK_REFRESH` guard removed; the version token dropped; replay writing a second ledger row; the safety block dropped or moved after the card; the receipt saying "verified"; the impact refresh dropped; focus moving on first render | Executed in 6a/6b |
| Real Postgres: the real confirm and transition and the triggers | 6c: **written, owner-run, not run here** |

## 7. Rollout

No schema push, no worker. Deploy the backend, then the frontend. The `diy` skill's existing enable flag applies. Because the skill now declares write effects, the start-up registry validation must pass before the backend serves: watch the first start. Expect **nothing visible in production until O7** (a published template and a project started from it).

## 8. Adversarial pass (methodology section 7) [Code-traced; the answers to be tested]

- **A stale card.** A person opens the guide, someone else marks the step done on the page, the person presses "Mark this step done": the propose step sees the step already done and answers "already", or sees it is no longer current and refuses; the confirm re-checks and the service's token refuses anything that slipped between.
- **Marking an earlier or later step.** Ask offers only the current step's action and re-checks it is still current at propose and confirm, so Ask cannot be used to mark steps out of order, although the page can (the service allows it); that asymmetry is deliberate and recorded.
- **A guide that became ineligible or withdrawn mid-job.** The gate is re-run at propose and confirm; a withdrawn guide offers no advancing action and a confirm that arrives after withdrawal is refused.
- **The viewer hole (W6).** Closed twice: no emit for viewers, and the pattern hardened; both tested on the final sequence.
- **Replays and double confirmation.** The service is idempotent by resulting state; a second confirmation yields an "already" receipt and no second ledger row.
- **Self-report.** Nothing says "verified"; the receipt says so in words, and the skill's evaluation cases pin that no operation upgrades a step report.
- **The page and Ask racing.** Both use the same service and the same version tokens; the loser gets `DIY_STALE` and plain copy.
- **Overclaim check (methodology item 9).** "Read-only" was true of step 5; this step makes the `diy` skill a writer. That reversal of FRD v1.58 is stated, limited to projects that pass the reviewed-guide gate, and has its own tests. "Ask only offers the current step" is a statement about what Ask offers, not about what the service permits.
- **Registry breadth.** The write adds the domain command and confirm handler on top of the read operation's chain; the counted tests and the start-up validators are the controls, and a missed entry crash-loops the backend (this repository has had that).

## 9. Risks

1. The registry and counted-test breadth, and start-up validators, for a write operation on an existing skill.
2. The confirm-card and refresh plumbing: the guide must refresh in place, which depends on the stored launch context (traced in 6-0).
3. Focus management is the one piece that can only be proven in a browser; it is tested in jest with the limits stated.
4. Production emptiness (O7): the whole step is unreachable until content exists.

## 10. Decisions (each with the recommended default)

| # | Decision | Recommendation |
| --- | --- | --- |
| **S6-1** | Scope: `DIY_STEP_UPDATE` with **complete** and **skip** only. Reopen, the previous-step view, project complete and abandon, and the recovery command are step 7 (the design's row 3) | Yes |
| **S6-2** | One operation, entity `DIY_STEP`, the action chosen by the exact canned message; declared-action-only; non-routable; guarded against `ASK_REFRESH` | Yes |
| **S6-3** | The actions live on the guide card, for the current step only, for contributors and owners only, only when the guide is current or superseded; skip only for an optional step without a safety note | Yes |
| **S6-4** | The safety note stays a caution block directly before the card; the advancing action sits inside the card; the confirmation repeats the note; adjacency tested on the final trust-validated sequence | Yes |
| **S6-5** | Propose and confirm both re-check access, the guide gate, that the step is still current and its version; the service is the final authority; replays return "already" | Yes |
| **S6-6** | Receipt wording "Marked done by you" / "Skipped by you", self-reported, no verification claim; the all-resolved note points to the page | Yes |
| **S6-7** | The `diy` skill moves to `autonomyLevel: 2`, effects `['READ', 'WRITE']`, `MATERIAL`, `PARTIALLY_REVERSIBLE`; a `CONTRIBUTOR` domain command with correction mode `REOPEN` declared and not offered; the FRD v1.58 "reads only" note is superseded for template-sourced projects only | Yes |
| **S6-8** | Impact map: `DIY_STEP_UPDATE` refreshes `DIY_PROJECT_GUIDE` and `DIY_PROJECTS` | Yes |
| **S6-9** | Harden the audience mutation-verb filter with `skip` and `reopen`; emit-time role gating stays primary | Yes |
| **S6-10** | Frontend: focus the card heading and announce the position when a guide updates in place with a changed position; nothing otherwise | Yes |
| **S6-11** | Verification as in §6: jest and the backend suites now; the real-Postgres script written and owner-run (not provisioned or run here); no browser; focus behavior reported unverified in a real browser | Yes |
| **S6-12** | No schema change, no worker, no new flag; backend then frontend; accept that nothing is reachable in production until O7 | Yes |
