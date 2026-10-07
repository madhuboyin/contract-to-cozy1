# Previous Step, Reopen, Finish, Stop and Recover From Ask — Step 7 Implementation Plan

**Date:** October 6, 2026
**Status:** **Draft, awaiting approval of S7-1 to S7-14 (§10).** Nothing in this plan is built. **It needs no schema change.**
**Parent design:** [`ASK_COZY_STATEFUL_GUIDE_DESIGN.md`](ASK_COZY_STATEFUL_GUIDE_DESIGN.md) §8 "Step 3" (previous-step read view, `REOPEN`, `DIY_PROJECT_COMPLETE`, `DIY_PROJECT_ABANDON`, recovery command), D3 (previous, abandon, complete), D4 (what completion affects), D5 (self-reported), D8 (authorization inside the transaction, outbox, recovery by an explicit confirmed action), decisions O3, O4, O10, O11, O12, O13
**Follows:** steps 1 to 6, all pushed. Step 6 ([`…STEP_COMMANDS_PLAN`](ASK_COZY_DIY_STEP_COMMANDS_PLAN.md)) is the direct predecessor and supplies the pattern this plan reuses and extends: declared actions on the guide card, a propose and a confirm handler, an in-transaction role check, an Ask policy evaluated inside the service transaction, a canonical-snapshot context version, an "already" receipt, an impact refresh.
**Method:** `AUDIT_METHODOLOGY.md` design items 11-20 and the section 7 adversarial pass (§8); the Ask write-command rules (non-retrievable, read the traditional controller for hidden effects, declared-action-only starts guarded against `ASK_REFRESH`, allow-listed action ids, startup validators). Labels: **[Code-traced]** read, not run; **[Executed]** ran. Nothing in this document was executed.

## 1. Goal and boundary

**Goal.** From the DIY project guide in Ask, a household member who can edit the property can: look back at a step they already finished (read only); **reopen** it; **finish the project** once every step is resolved; **stop it or hand it off to a professional**; and, when the records that follow a completion failed to update, **ask for them to be recorded again**. Each change is confirmation-gated, uses the same service call the project page uses, and is attributed to the person. What is recorded is the person's own report; nothing here verifies the work (D5).

**Out of scope:** starting a step ("Start step" has no Ask counterpart); step notes and photos (D7); entering actual time, cost or notes at completion from Ask (§3.4); creating a project from Ask; un-completing or un-stopping a project (no such operation exists anywhere in the product); changing an incident (O13); verifying or "upgrading" any self-reported completion. **Still blocked on O7:** no production template exists, so none of this is reachable by a real project until the first template is authored and published.

## 2. What exists today

| # | Finding | Label |
| --- | --- | --- |
| W1 | `completeProject(projectId, propertyId, payload, { actorUserId, expectedUpdatedAt })` already checks CONTRIBUTOR **inside** its transaction, claims the open project at the **project's** version token, refuses while any required step is not `COMPLETED` or any optional step is untouched (`DIY_PROJECT_STEPS_INCOMPLETE`), and in the same transaction writes the completion, the ledger row and the outbox event `DIY_PROJECT_COMPLETED` (key `diy-project-completed:<projectId>`). Its optional payload is `actualMinutes`, `actualMaterialCostCents`, `notes`. | Code-traced |
| W2 | **The controller adds one hidden effect:** an `ACTION_COMPLETED` analytics event (`complete_project`, FINANCIAL / DIY_DECISION). The page's response says the records are being recorded (`effects: 'RECORDING'`): the home event and any linked maintenance task are created later by the worker. | Code-traced |
| W3 | `abandonProject(projectId, propertyId, hireOut, { actorUserId, expectedUpdatedAt })` claims the open project and writes `ABANDONED` or `HIRED_OUT`, the ledger row and `abandonedAt`. **It has no in-transaction role check** (only the route's middleware before it), the revocation window step 6 closed for step updates. The controller adds an `ACTION_COMPLETED` analytics event (`abandon_project`, with `hireOut`). It touches no linked task. | Code-traced |
| W4 | **There is no way back from a closed project.** `claimOpenProject` refuses any status other than `PLANNING` and `IN_PROGRESS` (`DIY_PROJECT_CLOSED`), and no service method reopens a project. Stopping, handing off and finishing are therefore irreversible in the product. | Code-traced |
| W5 | `retryCompletionEffects` and `retryTaskReconciliation` re-queue a **dead-lettered** outbox row (same row, conditional on its status and version, who and when recorded in its payload). They check the role with `prisma`, **outside** any transaction. The view objects `describeCompletionEffects` and `describeTaskLink` already carry `canRecover`. The worker is the only trigger. | Code-traced |
| W6 | The step transition table already allows `COMPLETED` or `SKIPPED` to `IN_PROGRESS` (event `STEP_REOPENED`, clearing `completedAt` and `completedByUserId`). Step 6's Ask policy refuses every target but `COMPLETED` and `SKIPPED`, so Ask cannot reopen today. | Code-traced |
| W7 | Today's guide, when every step is resolved, shows a SUMMARY "Every step is resolved. Finish the project on the project page." with a page link. A finished project (`COMPLETED`, `ABANDONED`, `HIRED_OUT`) answers with a `PROJECT_FINISHED` refusal summary. The guide's source read carries no completion-effects status. | Code-traced |
| W8 | A `TASK_GUIDE` block holds at most **6** actions. The card today carries up to three (Mark done, Skip, Open), so there is room for about three more and no more. | Code-traced |
| W9 | The viewer filter hides a mutation-looking action only if its id or label starts with a listed verb. `reopen` and `skip` were added in step 6; **`finish`, `stop`, `abandon` and `hand` (as in "Hand off") are not on the list.** | Code-traced |
| W10 | Step 6's Ask policy is a boolean `requireCurrentGuideStep` on `updateStep`, evaluated inside the transaction after the project claim, over a guide source read with the transaction client and share-locked governance rows. Reopen, finish and stop need different rules, so the option has to become a named policy. | Code-traced |
| W11 | `DiyProject.incidentId` exists. Completion deliberately does not touch an incident (O13). A project's linked maintenance task **is** completed by the worker (mode `DIY`) after a normal completion, which is a material downstream effect the confirmation must name. | Code-traced |
| W12 | Everything here stays unreachable for real projects until O7. | Code-traced |

## 3. Target behavior

### 3.1 Previous-step view (read only)

On a guide whose project has at least one finished step before the one being shown, the card carries **"Previous step"** (a read action). It launches `DIY_PROJECT_GUIDE` with `entityType: 'DIY_STEP'`, the step id and `actionId: 'VIEW'`. The handler answers with the same card shape, **main** showing that step's text, a summary that says plainly what it is ("Step 2 of 4 · done. You are on step 3."), the step's safety note as the block directly above, and the actions **"Previous step"** (the nearest earlier finished step, if any) and **"Back to step 3"** (the real current step). For a contributor or owner it also carries **"Reopen this step"** (§3.2). The outline keeps marking the **real** current step with `aria-current`; the viewed step is named in the text, not by a new marker. **No contract change.** Nothing is written; a spy and, in 7D, database triggers prove it. Because a refresh restores the focus fields, the view survives a refresh; once a reopen makes the viewed step the current one, the same view renders as the ordinary current-step card.

### 3.2 Reopen (the step operation's third action)

`DIY_STEP_UPDATE` gains a third declared action, **"Reopen this step"** (exact message `Reopen this step.`, `actionId: 'REOPEN'`, target `IN_PROGRESS`), offered only from the previous-step view. It reuses the operation, handlers, command, impact map and receipts of step 6 (so the registry gains no entry for it). Rules, evaluated at propose and again **inside the transaction** by the Ask policy `REOPEN_FINISHED_STEP`: the step is finished (`COMPLETED` or `SKIPPED`); the project is open; the guide is current or superseded, **not withdrawn**; the person can edit. The confirmation repeats the step's safety note and says what changes: "This puts the step back in progress. The guide returns to it, and steps you finished after it stay finished." The ledger records `STEP_REOPENED`; the service clears the completion fields. Receipt: "Reopened by you."

### 3.3 The shared policy option

`updateStep`'s `requireCurrentGuideStep: boolean` becomes `askPolicy?: 'ADVANCE_CURRENT_STEP' | 'REOPEN_FINISHED_STEP'`, evaluated by the same pure module (`askStepPolicy.ts`) inside the transaction after the project claim. Only Ask passes it; the page passes none. The step 6 tests are updated for the new name, and every step 6 mutant is re-run.

### 3.4 Finish the project

`DIY_PROJECT_COMPLETE`, a new operation, one action: **"Finish this project"** (exact message `Finish this project.`, `entityType: 'DIY_PROJECT'`, the project id, `actionId: 'COMPLETE'`). It appears in the all-resolved summary, for a person who can edit, on a guide that is current or superseded (never withdrawn: the page remains the way to finish a project whose guide was withdrawn). It is not offered while any step is open.

- **Propose** re-checks access, the guide gate, that every step is resolved, and shows a confirmation whose **consequence text names what follows**: "This records the project as finished, on your word. Cozy will then add it to your home history, and, if this project is linked to a maintenance task, mark that task done as a do-it-yourself job. Nothing about any incident changes. Those updates happen in the background and can take a little while." A linked task and its current state are listed as fields (from the same read that builds the page's task-link panel). **No actual time, cost or notes are collected from Ask** (D7, O4); the receipt says they can be added on the project page.
- **Confirm** calls `completeProject` with the actor, the **proposed project token** and the Ask policy `COMPLETE_PROJECT` (project open, guide current or superseded and not withdrawn, evaluated inside the transaction; the service's own check that no step is open stays). It then emits the page's analytics event (`complete_project`, `source: 'ask'`) only after a real write.
- **Receipt** (`WORKFLOW_PROGRESS`): "Finished by you" and the honest status from `describeCompletionEffects` at that moment, normally "Recording your completion." It never says the home record or the task update exists yet, and never says verified.

### 3.5 Stop or hand off

`DIY_PROJECT_ABANDON`, a new operation with two actions: **"Stop this project"** (status `ABANDONED`) and **"Hand this off to a pro"** (status `HIRED_OUT`). To avoid putting an irreversible button beside "Mark this step done", the guide card carries one quiet read action, **"Stop or hand off"**, which opens a short read-only view (a SUMMARY, plus the two confirm-launching actions and "Back to the guide") explaining the difference. Each action then opens its own confirmation.

- The confirmation says, in bold terms, that **this cannot be undone in Cozy**, that steps and notes are kept, that a linked maintenance task is **not changed**, that no incident changes, and (for hand-off) that **it does not book or contact anyone**.
- Offered on any guide state for a person who can edit, **including a withdrawn guide** (stopping is the sensible exit from one); never on a finished project. Inside the transaction the service re-checks the role (new) and the open project; no guide rule applies, because this is not an advance.
- Confirm calls `abandonProject` with the actor and the **proposed project token**, then emits the page's analytics event (`abandon_project`, `hireOut`, `source: 'ask'`). Receipt: "Project stopped" or "Handed off", with "Nothing else was changed."

### 3.6 Recovery

`DIY_COMPLETION_RECOVER`, a new operation, two actions on the **finished-project view** of the guide: **"Record my completion again"** (the completion outbox event) and **"Update my linked task again"** (the task reconciliation event). Each is offered only when the matching view reports `canRecover` (a dead-lettered event) for a person who can edit. The finished-project view is read-only and gains a plain status line ("Recording your completion", "Completion recorded", "Some records could not be updated"), read from the same status functions the page uses.

- Confirm calls `retryCompletionEffects` or `retryTaskReconciliation`. **Both gain a transaction-bound role check** around the conditional re-queue (page callers benefit too). The receipt says only that the request was **queued again** and that the records update in the background; it never says it worked. The worker remains the only trigger, and a pending, processing, failed-but-retrying or processed event is left alone.

### 3.7 Viewer filter

`finish`, `stop`, `abandon` and `hand` are added to the audience filter's mutation verbs, as **defense in depth only**; the emit-time role gate and the in-transaction checks are the controls.

### 3.8 The safety note and the actions

Every answer that carries a step-changing or reopen action has **that action's step safety note directly before the card** (for the previous-step view, the viewed step's note). The adjacency test on the final trust-validated sequence is generalized from "the current step" to "the step the card shows". The finish, stop and recover confirmations have no step safety note; they repeat their own consequences.

## 4. Service changes (the canonical service is the authority)

1. `updateStep`: `requireCurrentGuideStep` becomes `askPolicy` with `ADVANCE_CURRENT_STEP` and `REOPEN_FINISHED_STEP` (§3.3).
2. `completeProject`: optional `askPolicy: 'COMPLETE_PROJECT'`, evaluated after the claim, on a guide source read with the transaction client and share-locked governance rows (the helper from step 6).
3. **`abandonProject`: a CONTRIBUTOR check inside its transaction, for every caller** (the page gains the same 403 `DIY_ACCESS_REVOKED`).
4. `retryCompletionEffects` and `retryTaskReconciliation`: the role check moves inside a transaction that also performs the conditional re-queue.
5. A pure `projectViewPolicy` (or additions to `askStepPolicy.ts`) for the previous-step selection and the finished-project view model, with no database access.

## 5. Slices

| Slice | Content | Gate |
| --- | --- | --- |
| **7-0** | A trace, no behavior change: how `actionId` and `entityType` survive a refresh for a view launched on `DIY_STEP`; the `confirmation` fields and consequence rendering; the cancellation and correction-mode copy for irreversible commands; the skill reversibility validators; how the guide handler can read effect status without writing; the exact verb filter | Findings in §12 |
| **7A** | Backend and frontend: the policy rename and `REOPEN_FINISHED_STEP`; the previous-step view; the Reopen action; tests and mutation checks | Governance, registry and Ask suites; `tsc`; `next build`; frontend Ask suite |
| **7B** | Backend and frontend: the finish and stop/hand-off operations, the service changes 2 and 3, the options view; analytics parity; tests and mutation checks | Same |
| **7C** | Backend and frontend: the finished-project view with effect status and the recovery operation, service change 4; tests and mutation checks | Same |
| **7D** | An owner-run real-Postgres script (all four tracks, with database triggers on every touched table and real concurrency), read-only queries and the runbook; **written, not run here** | Your gate |

**Each of 7A, 7B and 7C ships on its own** and is committed only on your instruction. Registry counts move with them: 7B adds two operations, adapters and domain commands, 7C adds one (operations 125 to 128, adapters 108 to 111, domain commands 48 to 51), and the `diy` skill's reversibility becomes `IRREVERSIBLE` in 7B.

## 6. Validation plan

| Check | Kind (when run) |
| --- | --- |
| The previous-step view: only for a finished step before the current one; the nearest earlier finished step; Back returns to the real current step; the safety note of the viewed step is above the card; **writes nothing** (a spy, and in 7D triggers) | Test |
| Reopen: offered only from that view, to a person who can edit, on an open project and a non-withdrawn guide; typed wording, a near-miss and `ASK_REFRESH` never write; refused inside the transaction when the project closed, the guide was withdrawn, the step is no longer finished, or the role was revoked; a replay is "already"; the ledger shows `STEP_REOPENED`; the completion fields are cleared | Test, on the shared fake |
| Finish: offered only when every step is resolved, on a current or superseded guide, to a person who can edit; the consequence text names the home record, the linked task and "no incident change"; refused inside the transaction when a step was reopened meanwhile (`DIY_PROJECT_STEPS_INCOMPLETE`), the project closed, the guide withdrawn, or the role revoked; exactly one outbox event and one ledger row; a replay is "already" with no second event; **analytics emitted once and only after a real write** | Test |
| Stop and hand off: the options view is read-only; each confirmation says irreversible, names the untouched linked task and incident, and (hand-off) that nobody is booked; the in-transaction role check refuses a revoked person (**also for the page path**); a **write spy proves a linked task is untouched**; analytics parity; refused on a finished project | Test |
| Recovery: offered only when `canRecover`; confirm re-queues only a dead letter; a pending, failed-retrying, processing or processed event is left alone; the receipt never claims success; both service methods refuse a revoked person inside the transaction | Test |
| Trust and viewers: every new action id is allow-listed and survives the validator; a viewer's final answer carries none of Finish, Stop, Hand off, Reopen, Recover even if a producer emitted them; adjacency on the final sequence for every card | Test |
| Registry, skill, adapter, coverage matrix, certification corpus, semantic packages, audience policy, impact map, startup validators and the counted assertions | Test (governance, registry and Ask suites) |
| Frontend: the new actions render in their declared styles and launch exactly the declared command; the previous-step card and the finished-project view render from the producer's fields; focus and the status announcement behave as in step 6 | Test, jest |
| Mutation checks (examples): reopen of an unfinished step; finish with a step open; stop offering Finish on a withdrawn guide; abandon without the role check; analytics before the write; recovery of a non-dead event; the viewer filter verbs removed; the safety note dropped from the previous-step view; a linked task touched by stop | Executed in 7A to 7C |
| Real Postgres: the real confirm paths, triggers on every table touched, the outbox row, locks and concurrency, a stopped project's linked task untouched | 7D: **written, owner-run, not run here** |

## 7. Rollout

No schema change, no worker change, no new flag. Deploy the backend, then the frontend, per slice. **Behavior changes for the project page:** the stop/hand-off endpoint now refuses a viewer or removed member (403), and the two recovery endpoints check the role inside their transaction. Because the `diy` skill gains irreversible operations, watch the first start for a registry-validation failure. Expect nothing visible in production until O7.

## 8. Adversarial pass (methodology section 7) [Code-traced; the answers to be tested]

- **A stale "Finish this project" card.** A step was reopened (on the page, or by Ask in another tab) after the card was drawn: the context version changes and, if that is bypassed, `completeProject` refuses inside its transaction while the project row is held.
- **Finishing twice, or from two places.** The outbox key is unique per project and the claim serializes; the second attempt sees a closed project and answers "already", never a second event.
- **Stopping a project that is being finished.** The loser sees `DIY_PROJECT_CLOSED` and gets a plain conflict answer.
- **Irreversibility.** There is no un-stop or un-finish (W4), so these are the weightiest confirmations Ask has for DIY: the text says so, the action sits behind a read-only options view, and the decision on who may use them is explicit (S7-6).
- **Linked task and incident.** Finish completes the linked task (through the existing outbox, mode `DIY`, not a new path); stop leaves it alone; neither changes an incident (O13). The confirmation names each. The reverse hook of step 4 (task completion looking for open projects) finds the finished project closed and does nothing.
- **Self-report.** Every receipt says it is the person's report. The skill's evaluation cases pin that no operation upgrades it; the linked task's completion keeps its `DIY` mode and the home event its self-reported badge (D5, unchanged).
- **Revocation.** A member removed between confirm and write is refused by the in-transaction check for reopen, finish, stop and recovery alike.
- **Viewer.** No emit, no filter match needed, and an in-transaction refusal: three layers, only the last is authorization.
- **Withdrawn guide.** Offers no advance, no reopen, no finish; offers stop and hand-off (the exit) and the page link; the previous-step view is still readable.
- **Page and Ask racing.** Same service and tokens: the loser gets a stale or closed answer.
- **Raw writers.** The two raw task writers that bypass governed completion (recall resolve, inspection "met") are not changed here; they are a known follow-up.
- **Overclaim check (methodology item 9).** "Ask never changes an incident" is true of these operations, not of the product. "Recorded again" is a statement about queueing, not success. "Irreversible" is a statement about Cozy's own operations, not the real world.
- **Registry breadth.** Three new operations on a skill that already writes: the counted tests and the start-up validators are the controls, and a missed entry crash-loops the backend.

## 9. Risks

1. Irreversible actions inside a conversational surface: the wording, the options view and the role decision (S7-6) carry the risk.
2. Action budget on the card (six) and the clutter of a card that carries many actions.
3. The registry and counted-test breadth across three operations.
4. Focus and announcement behavior, provable only in a browser.
5. The page changes (403 for a revoked stopper, in-transaction recovery checks) surprise someone: they are listed in the rollout note.
6. Production emptiness (O7).

## 10. Decisions (each with the recommended default)

| # | Decision | Recommendation |
| --- | --- | --- |
| **S7-1** | Scope: previous-step view, reopen, finish, stop and hand off, recovery, delivered as **three independently shipped tracks** (7A reopen and previous view; 7B finish, stop, hand off; 7C recovery) plus one owner-run script (7D) | Yes |
| **S7-2** | The previous-step view is a read launch of `DIY_PROJECT_GUIDE` on `entityType DIY_STEP` (`actionId VIEW`); it walks back one finished step at a time; **no contract change**, the outline keeps marking the real current step | Yes |
| **S7-3** | Reopen is a third action of `DIY_STEP_UPDATE` (no new operation), offered only from the previous-step view, only on an open project and a non-withdrawn guide; the `requireCurrentGuideStep` boolean becomes the named `askPolicy` | Yes |
| **S7-4** | `DIY_PROJECT_COMPLETE`: confirmation names the home record, the linked task and "no incident change"; **no actual time, cost or notes from Ask** (D7, O4); the receipt reports the honest effect status; not offered on a withdrawn guide | Yes |
| **S7-5** | `DIY_PROJECT_ABANDON` with Stop and Hand off, **behind a read-only options view**, not beside the step buttons; offered on any guide state including withdrawn; the confirmation says irreversible, names the untouched linked task and incident, and that hand-off books nobody | Yes |
| **S7-6** | **Who may stop or hand off or finish from Ask:** CONTRIBUTOR and up, matching the page (O10). The alternative, OWNER only for these irreversible operations, is stricter than the page and would make the same action available on the page but not in Ask | **CONTRIBUTOR (parity); your call: choose OWNER if you want Ask stricter** |
| **S7-7** | `DIY_COMPLETION_RECOVER` with two actions, only on the finished-project view, only when `canRecover`; the receipt says "queued again", never "recorded"; the worker stays the only trigger | Yes |
| **S7-8** | Service changes: `askPolicy`; `completeProject` policy; **`abandonProject` role check inside its transaction (page too)**; recovery methods' role check inside their transaction (page too) | Yes |
| **S7-9** | Analytics parity for finish and stop (`source: 'ask'`), emitted only after a real write; none for step updates or recovery (the page emits none) | Yes |
| **S7-10** | Add `finish`, `stop`, `abandon`, `hand` to the viewer verb list as defense in depth only | Yes |
| **S7-11** | The `diy` skill's reversibility becomes `IRREVERSIBLE`; correction modes for finish, stop and recover are declared empty (there is no correction); registry counts as in §5 | Yes |
| **S7-12** | The finished-project view reads effect status (read-only) and states it in words; no read repairs or retries anything | Yes |
| **S7-13** | Verification as in §6: jest and the backend suites now, mutation checks per track, the real-Postgres script written and owner-run (not provisioned or run here), no browser, focus behavior reported unverified | Yes |
| **S7-14** | No schema change, no worker change, no new flag; backend then frontend per track; accept that nothing is reachable in production until O7 | Yes |
