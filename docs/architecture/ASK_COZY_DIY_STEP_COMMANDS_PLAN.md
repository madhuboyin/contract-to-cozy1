# `DIY_STEP_UPDATE`: Marking a Step Done or Skipping It From Ask — Step 6 Implementation Plan

**Date:** October 6, 2026
**Status:** **Approved with three corrections, now incorporated (§3.2, §3.9, §10): S6-1 to S6-4 and S6-6 to S6-12 approved; S6-5 approved with transaction-bound authorization and the atomic Ask policy guard.** The 6-0 trace is recorded in §12; **6a (backend) and the 6b frontend change are built and recorded in §13, uncommitted; 6c (script, queries, runbook) is written, owner-run, not executed.** **It needs no schema change.**
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
| W10 | **`updateStep` has no transaction-bound role check.** It claims the project row, checks the step token and applies the transition table, but authorization happens before it (route middleware on the page, the propose and confirm handlers in Ask). Project completion and the outbox adapters already check `hasPropertyRoleWithin(tx, ...)` inside their transactions (`DIY_ACCESS_REVOKED`); the step path does not. A revocation between the check and the write is therefore possible for every caller, page included. | Code-traced |
| W11 | **Claiming the project row does not serialize against template governance or against the page.** `claimOpenProject` serializes writers of the project row. Withdrawal and supersession write the template revision row and the template head (`diyTemplateRevision.service.ts`), not the project row, and a page update to a different step is only ordered by the project claim. So "the guide is still guideable" and "this is still the first non-terminal step" checked before the transaction can change before it. | Code-traced |
| W9 | **Nothing in this step can run for a real project yet** (G9, O7). | Code-traced |

## 3. Target behavior

### 3.1 The actions on the guide

For a guide that passes the step 5 gate, when the viewer of the answer is a **CONTRIBUTOR or OWNER** and the guide's source state is **CURRENT or SUPERSEDED** (never **WITHDRAWN**: a withdrawn guide offers no step-advancing action, per D1), the `TASK_GUIDE` card carries, for the **current step only**:

- **"Mark this step done"** (`PRIMARY`): a declared `START_WORKFLOW` action: exact message `Mark this step done.`, `operationId: 'DIY_STEP_UPDATE'`, `entityType: 'DIY_STEP'`, `entityId` the current step's id.
- **"Skip this step"** (`QUIET`): the same shape with the exact message `Skip this step.`, **only if** the step is optional **and** has no safety note.

Viewers see the guide exactly as in step 5, with no such action (it is not emitted for them, and the pattern filter is hardened as a second layer, §3.6). The page link "Open this project" stays.

### 3.2 The operation (propose, confirm)

`DIY_STEP_UPDATE` follows the `GUIDANCE_STEP_SKIP` pattern: non-routable, family `COMMAND`, floor `CONTRIBUTOR`, reached only by its declared actions.

**Propose** (the handler): refuses unless the launch context is `entityType 'DIY_STEP'`, `operationId 'DIY_STEP_UPDATE'`, `surface` is not `ASK_REFRESH`, and the **message equals one of the two canned messages exactly** (so typed wording never writes, and a refresh never proposes). It then checks, each with a fixed refusal and nothing written: the user is a contributor or owner; the step exists in this property; the project is open; **the project still passes the guide gate** (strict step match included) and is not withdrawn; **the step is still the current step** (a stale card for an earlier step is refused as "this step has moved on"); and, for skip, the step is optional and has no safety note. A step already in the target status returns an **"already" receipt** with no confirmation. Otherwise it returns a confirmation: the step and project as fields, **the step's safety note repeated as a field when it has one**, a consequence line, a `contextVersion` built from the canonical guide snapshot (§3.2.1) and the step's version token in the parameters.

**Confirm** (the confirm capability handler): re-checks access and the guide gate, re-reads the guide snapshot, rejects a changed `contextVersion` (an early, friendly stale answer; unless the step is already in the target status), and calls `diyService.updateStep` with the **actor, the target status, the step's version token and the Ask policy `requireCurrentGuideStep`** (§3.9). **The checks before the call are advisory; the transaction inside the service is the final authority** on role, guideability and currency. Its refusals (`DIY_STALE`, `DIY_PROJECT_CLOSED`, `DIY_STEP_TRANSITION_NOT_ALLOWED`) are mapped to the confirmation conflict codes with plain copy. It then refreshes the source guide and the project list (§3.5).

### 3.2.1 The context version

`contextVersion` is a sha256 over a deterministic serialization of the **canonical guide snapshot**, built by one pure function used by both propose and confirm, never a subset assembled in the handler:

- project id, status and `updatedAt`;
- the current step's identity (its id and step number, or "none");
- the current step's status and `updatedAt`;
- a **steps fingerprint**: the ordered list of `(stepId, status, updatedAt)` for every step, so a change to any other step changes the version;
- the revision's id, `contentHash`, retirement state and reason, and the template's **current head identity** (`publishedRevisionId`), so a withdrawal, supersession or correction changes the version.

It exists to give an early, plain "this changed, look again" answer. It does not authorize or guard the write.

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

**Corrected during 6b after reading `ExecutionCard`:** the answer card already moves focus when an execution is just updated and settled (ACCESS-003: the answer heading in the calm shell, otherwise the first focusable control). A second focus effect inside the guide card would be overridden by that one (child effects run before the parent's), so 6b does not add one. It does two smaller things instead:

- **Focus lands on the guide's own heading.** In a stepped guide (an `outline` is present) the card heading carries a `data-task-guide-heading` marker and `tabIndex={-1}` (focusable by script, never a tab stop); `ExecutionCard`'s existing effect prefers that marker when it is present, so the new step is read before its buttons. Every other answer, and a task guide without an outline (the seasonal guide), is unchanged. The effect still re-runs only when the execution's status or `updatedAt` changes, so opening the tip, or any unrelated re-render, moves nothing.
- **The position is announced.** In a stepped guide the progress sentence is a polite status (`role="status"`), so a screen reader hears the new position when the card refreshes in place. It says nothing on first render.

Reduced motion needs nothing (no animation). **Real-browser focus and screen-reader behavior are unverified**; jest in jsdom checks the DOM contract only.

### 3.9 The service changes: authorization and Ask's narrower policy inside the transaction

`diyService.updateStep` is extended (this is the canonical service, so the page benefits from the first change too):

1. **Transaction-bound authorization, for every caller.** The first statement inside the transaction is `hasPropertyRoleWithin(tx, actorUserId, propertyId, 'CONTRIBUTOR')`, refusing with `DIY_ACCESS_REVOKED` (403), **before the idempotent early return** (a revoked person gets no receipt). This is the same helper and error that completion and the outbox adapters already use.
2. **An optional Ask policy `requireCurrentGuideStep`** on the context. When set, inside the same transaction and **after the project row is claimed**, the service re-reads the guide source with the transaction client and requires: the project is open (the claim already requires it); the project passes the step 5 gate (`evaluateProjectGuide`, strict step match included) and its source state is not WITHDRAWN (`DIY_GUIDE_NOT_CURRENT`, 409); **the target step is the first non-terminal step** by authored order (`DIY_STEP_NOT_CURRENT`, 409); and, for skip, the step is optional with no safety note (`DIY_STEP_TRANSITION_NOT_ALLOWED`, from the table, restated in the policy so the rule is checked even if the table changes). **The canonical transition table still performs the actual transition**; the policy only narrows what Ask may do. The page passes no policy, so its behavior (out-of-order updates included) is unchanged apart from item 1.
3. **Withdrawal is read, and optionally locked, in the transaction.** The policy reads the revision and template head with the transaction client. Because withdrawal and supersession write those rows (W11), the plan asks 6a-0 to confirm whether a share lock on them is practical; if it is, the policy takes it so a concurrent withdrawal cannot commit between the read and the commit. If it is not, the residual is stated exactly: a withdrawal that commits during the few statements of the transaction is not seen, and the recorded step is still a true record of what the person reported.
4. The policy is a pure predicate over the in-transaction snapshot plus the step and requested status, exported and unit-tested without a database; the service wires it. The same snapshot function feeds §3.2.1.

### 3.10 The viewer filter is defense in depth, not authorization

The audience filter hardening (§3.6) is a second layer that removes a mutation-looking action from a viewer's answer. **Authorization is the emit-time role gate, the propose and confirm role checks, and above all the in-transaction role check of §3.9.** No test or document counts the filter as the control.

## 4. Schema

**None.** The transition, the version token and the ledger exist (step 2).

## 5. Slices

| Slice | Content | Gate |
| --- | --- | --- |
| **6-0** | **Done, recorded in §12.** A trace, no behavior change: how a `START_WORKFLOW` action on a `TASK_GUIDE` reaches the handler (which launch fields survive), the confirm-card rendering of fields, the domain-command and confirm-handler registries and their counted tests, the skill write-effects validators, and the exact verbs of the mutation filter | Findings recorded in §12 |
| **6a** | Backend: **the service changes of §3.9 first (transaction-bound role check, the Ask policy, the snapshot function), then** the guide handler gains the user and emits the actions (§3.1, §3.7); the operation, propose and confirm handlers, the domain command, the receipt; the impact map; the skill moves to write effects (S6-7); the registration chain; the filter hardening; tests and mutation checks | Governance, registry, startup-registry and Ask suites; `tsc` |
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
| **Atomicity (new):** with the Ask policy set, a project step update is refused inside the transaction when the actor's role was revoked, the project closed, the guide was withdrawn or corrupted, the step is no longer the first non-terminal step, or skip is no longer allowed, each with nothing written, using a fake whose reads change between the pre-check and the transaction; the same role refusal for the page path without the policy; the idempotent early return comes after the role check | Test, on the shared fake |
| **Context version:** changes when any other step, the project version, the revision's hash or retirement, or the head changes; unchanged by irrelevant fields; identical for propose and confirm on the same state | Test |
| Mutation checks (added): role check moved after the early return or removed; policy skipped on confirm; "first non-terminal" replaced by "this step exists"; the context version reduced to step id/status/version | Executed in 6a |
| Real Postgres: the real confirm and transition and the triggers | 6c: **written, owner-run, not run here** |

## 7. Rollout

No schema push, no worker. Deploy the backend, then the frontend. The `diy` skill's existing enable flag applies. Because the skill now declares write effects, the start-up registry validation must pass before the backend serves: watch the first start. Expect **nothing visible in production until O7** (a published template and a project started from it).

## 8. Adversarial pass (methodology section 7) [Code-traced; the answers to be tested]

- **A stale card.** A person opens the guide, someone else marks the step done on the page, the person presses "Mark this step done": the propose step sees the step already done and answers "already", or sees it is no longer current and refuses; the confirm re-checks and the service's token refuses anything that slipped between.
- **Marking an earlier or later step.** Ask offers only the current step's action and re-checks it is still current at propose and confirm, so Ask cannot be used to mark steps out of order, although the page can (the service allows it); that asymmetry is deliberate and recorded.
- **A guide that became ineligible or withdrawn mid-job, or a different step changed by the page, between confirm's check and the write.** The pre-checks and `contextVersion` are advisory; the policy of §3.9 re-checks currency, guideability and the current step inside the transaction after the project claim, so none of these can slip through the gap the earlier draft left. A withdrawn guide offers no advancing action and a confirm that arrives after withdrawal is refused.
- **The viewer hole (W6).** The emit-time gate is primary; the pattern hardening is defense in depth only; both tested on the final sequence. Revocation between confirm and write is closed by the in-transaction role check (§3.9).
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
| **S6-1** | Scope: `DIY_STEP_UPDATE` with **complete** and **skip** only. Reopen, the previous-step view, project complete and abandon, and the recovery command are step 7 (the design's row 3) | Approved |
| **S6-2** | One operation, entity `DIY_STEP`, the action chosen by the exact canned message; declared-action-only; non-routable; guarded against `ASK_REFRESH` | Approved |
| **S6-3** | The actions live on the guide card, for the current step only, for contributors and owners only, only when the guide is current or superseded; skip only for an optional step without a safety note | Approved |
| **S6-4** | The safety note stays a caution block directly before the card; the advancing action sits inside the card; the confirmation repeats the note; adjacency tested on the final trust-validated sequence | Approved |
| **S6-5** | **Approved with corrections.** Propose and confirm re-check access, the guide gate, current step and the canonical-snapshot `contextVersion` as advisory early answers; **the service verifies CONTRIBUTOR access inside the mutation transaction (for every caller) and enforces the optional `requireCurrentGuideStep` policy inside it (project open, revision guideable and not withdrawn, first non-terminal step, skip allowed); the canonical transition table still performs the transition**; replays return "already" | Approved |
| **S6-6** | Receipt wording "Marked done by you" / "Skipped by you", self-reported, no verification claim; the all-resolved note points to the page | Approved |
| **S6-7** | The `diy` skill moves to `autonomyLevel: 2`, effects `['READ', 'WRITE']`, `MATERIAL`, `PARTIALLY_REVERSIBLE`; a `CONTRIBUTOR` domain command with correction mode `REOPEN` declared and not offered; the FRD v1.58 "reads only" note is superseded for template-sourced projects only | Approved |
| **S6-8** | Impact map: `DIY_STEP_UPDATE` refreshes `DIY_PROJECT_GUIDE` and `DIY_PROJECTS` | Approved |
| **S6-9** | Harden the audience mutation-verb filter with `skip` and `reopen`, **described as defense in depth, never as the authorization mechanism** | Approved |
| **S6-10** | Frontend: focus the card heading and announce the position when a guide updates in place with a changed position; nothing otherwise | Approved |
| **S6-11** | Verification as in §6: jest and the backend suites now; the real-Postgres script written and owner-run (not provisioned or run here); no browser; focus behavior reported unverified in a real browser | Approved |
| **S6-12** | No schema change, no worker, no new flag; backend then frontend; accept that nothing is reachable in production until O7 | Approved |

## 12. The 6-0 trace (read-only; nothing run)

| # | Finding | Effect on the plan |
| --- | --- | --- |
| T1 | A `TASK_GUIDE` block's actions use the block-level action schema: `START_WORKFLOW` requires `message` and `operationId`, forbids `href`, and may carry `entityType`, `entityId` and `actionId`; the block allows up to six actions. The guided-journey precedent put its skip action on a list row (`interactionType: 'MUTATE_RECORD'`, `entityType: 'GUIDANCE_STEP'`); this plan uses the block-level shape instead. | Confirms §3.1's shape. The plan's choice to select the action by exact message stays; `actionId` (COMPLETE or SKIP) is carried as well and must match the message, which the propose guard checks. |
| T2 | The precedent's propose handler guards exactly as §3.2 says (`launchContext.operationId`, `surface !== 'ASK_REFRESH'`, `message.trim() === CANNED`), refuses viewers with a boundary, returns an "already" receipt for a step already in the target state, and builds `NEEDS_CONFIRMATION` with `contextVersion`, `parameters` (including a 30-minute `confirmationExpiresAt`), a SUMMARY block and a `confirmation` object with `fields`, `editableFields: []`, `confirmLabel` and `consentText`. | Reuse the shape; the safety note goes in `fields` and in the SUMMARY block. |
| T3 | Confirm handlers register by adapter key through `registerConfirmCapabilityHandler`, receiving `{ userId, execution, access, parameters, command }`, and may return `refreshedExecutions`. The registry test asserts **47** domain commands today and that the confirm-handler registry has no validation issues. | The count becomes 48; the test comment list gets the new entry. |
| T4 | `TASK_GUIDE` actions **are** passed through the audience filter (`filterBlockActions` lists `TASK_GUIDE`); the filter tests id and label against `MUTATION_ACTION_PATTERN`. `mark` and `complete` match; `skip` and `reopen` do not. The same filter's owner-only pattern does not affect contributors. | Confirms W6 and §3.6, and that the hardening reaches the guide card. |
| T5 | Skill validation: `skillRegistry.ts` requires `autonomyLevel >= 2` for any skill whose effects include WRITE or EXTERNAL_TRANSMISSION; the guided-journey skill is `autonomyLevel: 2` with `['READ', 'WRITE']`. Its adapter list, evaluation `expectedAdapters`/`expectedCanonicalCalls` and `skillAdapterRegistry` (kind `MUTATION_PREPARATION`) all name the new adapter. | Confirms S6-7. The DIY skill needs: manifest allowed adapter, evaluation case and expected lists, adapter registry entry (`'diy.step-update'`), SKILL.md write stance. |
| T6 | The precedent's registration files outside the handler: orchestrator, operation registry (`definition(..., 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', adapter, ['SUMMARY','WORKFLOW_PROGRESS','BOUNDARY'])`), semantic packages, trust certification corpus, interaction coverage matrix (`canonicalOwner`), audience policy, answer trust policy (action ids), domain command registry, `ASK_MUTATION_IMPACT_MAP`, capability bridge, plus tests `askTrustArchitecture`, `askInteractionCoverageMatrix`, `askGovernance`, `skillTaxonomyExpansion`. | The 6a checklist; the operation's allow-listed action ids are added to `OPERATION_ACTION_IDS`, the coverage matrix entry must name `DIY_STEP_UPDATE`, and `startupRegistryValidation.test.js` runs before any push. |
| T7 | Withdrawal and supersession are written by `diyTemplateRevision.service.ts` onto the revision row and the template head. Project writers claim only the project row. The existing precedent and the page path perform no in-transaction role check for step updates. | Basis for W10, W11 and §3.9. Open for 6a-0: whether a share lock on the revision and head rows is practical (table names and the writer's locking behavior are not yet read). |

Everything above is **code-traced, not executed.**

## 13. Record of 6a (backend) and 6b (frontend)

**6a-0 result.** A share lock on the revision and template rows is practical: the governance writers (`diyTemplateRevision.service.ts`) update `diy_template_revisions` then `diy_project_templates` with plain row updates, so a `SELECT ... FOR SHARE` in the same order, inside the step transaction, makes a concurrent withdrawal or supersession wait for it. The lock lives in the revision service (`shareLockGovernanceRows`), because a repository guard requires that service to be the only source file naming that table. **The lock statements are checked against the fake only (recorded, in order); real locking behavior is for 6c on real Postgres and is unexecuted.**

**What was built** (all **[Executed]** as tests unless stated):
- `services/diy/askStepPolicy.ts` (pure): `currentStepOf`, `guideSnapshot`/`guideContextVersion` (the canonical snapshot of §3.2.1), `evaluateAskStepPolicy` (guide gate, not withdrawn, first unfinished step, skip rule, only COMPLETED/SKIPPED offered).
- `diyService.updateStep`: the in-transaction CONTRIBUTOR check as the first statement for every caller (before the idempotent early return; `DIY_ACCESS_REVOKED`), and the optional `requireCurrentGuideStep` policy evaluated after the project row is claimed, on a guide source read with the transaction client and share-locked governance rows (`DIY_GUIDE_NOT_CURRENT`, `DIY_STEP_NOT_CURRENT`, `DIY_STEP_TRANSITION_NOT_ALLOWED`). The transition table still performs the transition; the page passes no policy. New reads `readGuideSource` (any client) and `getProjectGuideSourceForStep`.
- `ask/handlers/diyStepUpdate.handler.ts`: propose (declared action, canned message, action id agreement, `ASK_REFRESH` guard, viewer, step lookup, "already", the policy, a confirmation with the repeated safety note) and confirm (role, early context-version check, `updateStep` with the actor, the **proposed** step token and the policy, service refusals mapped to confirmation conflict codes, receipt, impact refresh).
- The guide card (`buildProjectGuideBlocks`, `canAdvance`): Mark done for the current step, Skip only for an optional step with no safety note, only for a contributor or owner, never on a withdrawn guide, only when the safety block is directly above. The registered guide handler reads the role per request.
- The registry chain (operation, non-routable list, domain command with `REOPEN` declared, trust boundaries and action ids, audience policy, five semantic maps, certification corpus, coverage matrix, adapter registry, capability bridge, impact map) and the `diy` skill (autonomy 2, READ+WRITE, MATERIAL, PARTIALLY_REVERSIBLE, WORKFLOW_PROGRESS, evaluation, SKILL.md). The audience filter's verb list gained `skip` and `reopen` (defense in depth only).
- Frontend (6b, jest only): the guide heading is the focus target of the existing just-updated focus behavior (**plan §3.8 was corrected: no second focus effect**), the progress sentence is a polite status in a stepped guide, and nothing else changes.

**Verification [Executed unless noted].**
- New tests: `tests/unit/diyAskStepPolicy.test.js` (12), `tests/ask/diyStepUpdate.test.js` (18), `src/components/ask/__tests__/diyStepActions.test.tsx` (9). Updated expectations: operation count 125, adapters 108, domain commands 48, the diy skill's stance in the step 5 test, and the matrix and allow-list test lists.
- **Mutation checks: 22 backend mutants, 21 killed, 1 survives by design** (M22: the guard "emit actions only if the safety block is directly above" cannot be violated by the current builder, which always emits the block first; the adjacency test on the final sequence is the real control). M11 (live token instead of the proposed one) first SURVIVED, exposed a gap, got its own test, and is now killed. Frontend: 6 mutants (one invalid, redone), all killed after adding a "same execution re-rendered" test that exposed that focus-on-every-render had survived.
- Suites: `npm run test:ask:chunked` 1903 of 1910 pass; the 6 failures are in the same six files proven failing on clean HEAD in earlier steps (askGovernance routing, askImportGraphGuardrails, askRawSuggestionProducers (inventory and recordConfirm handlers, not mine), askRoutingCalibration, healthGapCapture, skillEvaluationRegistry); the earlier record counted 7 tests, this run shows 6, **not re-proved on a clean worktree this time**. `tests/unit/diy*.test.js` 197 of 197 after moving the lock (one guard failed first and led to that move). Backend and workers `tsc` clean. Frontend `next build` succeeds; `src/components/ask` jest shows only the 5 known failures (`maintenanceShelves` 4, `displayPatterns` 1).
- **Not run:** real Postgres (the share locks, the transaction ordering, `FOR SHARE` waits), a browser (focus, screen reader), the built-worker smoke, the full frontend and worker suites.

**Honest limits.** Nothing here is reachable for a real project until a first template is published (O7). The in-transaction checks are proved against a serialized fake, not against concurrent Postgres transactions. The DIY skill's enable flag is unchanged; its start-up validators passed in tests, not at a real boot.

**Remaining:** none for the step except the owner's run of 6c (§14) and the open items below.

## 14. Record of 6c

Written, **not executed**: `apps/backend/tests/scratch/diyStepUpdate.scratch.js` (8 tests: the real stack end to end; what a command writes, by database triggers; the policy and the in-transaction role check against real rows; **the share locks with real concurrent transactions**; two concurrent confirmations; the page interleaved with Ask; a withdrawn guide), `apps/backend/prisma/diy-step-update-inflight.pgadmin.sql` (8 read-only queries, including invariants) and `docs/operations/DIY_STEP_UPDATE_ROLLOUT.md`. **Checked:** the script's syntax, its skip and refuse guards, and that its module graph loads (it must load the Ask orchestrator first and keep the stubbed modules' real exports; both mistakes were found and fixed while checking); against a closed port every test fails only with the connection error. **Not checked:** every database assertion, the lock timing, the queries.

Open items carried forward: O7 (no usable production guide until the first template); the share-lock behavior is unproven on real Postgres until the owner runs 6c; step 7 (reopen, previous-step view, project complete and abandon, recovery); the raw-task writers that bypass governed completion; the Ask-failure comparison against a clean worktree was not repeated this slice.
