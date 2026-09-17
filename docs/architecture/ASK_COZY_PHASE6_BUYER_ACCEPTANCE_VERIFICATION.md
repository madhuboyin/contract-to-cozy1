# Ask Cozy Cross-Domain Interaction Rollout — Phase 6 Buyer Acceptance Scenario Verification

**Status:** Complete — all 10 acceptance scenarios (B01–B10) plus the Phase 6 exit criterion's "no undeclared item mutation" clause evaluated. **B06 revised 2026-09-17 after external review found the same "generic conflict message ≠ current state shown" defect already corrected in Phase 8's P04 and Phase 7's D07. B04 fixed across 2 rounds: round 1 (old/new-date disclosure + editableFields + single-target reconciliation) was re-scored FULL PASS→PARTIAL after external review found the reconciliation half only refreshed the single list the mutation was launched from; round 2, per an explicit user-scoped design decision, added a server-owned mutation-impact map that also refreshes `BUYER_PLAN_STATUS`/`BUYER_DEADLINES`/conditionally `BUYER_MOVE_STATUS`, plus a platform-wide confirm-replay fix, closing the gap back to PASS.**
**Verdict: Phase 6's exit criterion ("B01–B10 pass and the buyer operation family has no undeclared item mutation") is NOT currently met.** Originally scored 4 of 10 fully passing; after external review's B06 correction and B04's 2 rounds of fixes, now 4 of 10 pass fully, 3 pass partially with a specific, named gap, and 3 fail. The mutation-discipline half of the exit criterion does pass.
**Governs:** [Ask Cozy — Cross-Domain Interaction Rollout FRD](../product/ASK_COZY_CROSS_DOMAIN_INTERACTION_ROLLOUT_FRD.md) §10.3 (B01–B10) and §21 Phase 6's exit criterion.
**Builds on:** [Phase 0 Coverage Audit](ASK_COZY_PHASE0_COVERAGE_AUDIT.md) §4.10, which traced all 18 Buyer operations to the handler level. This document re-reads the code against each specific acceptance scenario rather than re-deriving the underlying evidence from scratch.
**Verification level: STATIC.** Every verdict below is derived from reading `askOrchestrator.service.ts`'s buyer handlers, `askDomainCommandRegistry.ts`, `HomeBuyerTask.service.ts`, and `buyerPurchaseLenderReadiness.service.ts` directly, plus the `tsc`-clean, test-green state confirmed in the Phase 0 audit. Nothing here is database- or browser-verified — no live Buyer Plan was exercised end to end.

| Field | Status |
| --- | --- |
| Audit coverage | Complete — all 10 acceptance scenarios (B01–B10) + mutation-discipline clause evaluated |
| Static (code-read) acceptance | 4 pass, 3 partial, 3 fail (scenarios); mutation-discipline clause passes separately |
| Runtime/browser acceptance | Not evaluated this session — no live database or browser exercised |
| Phase 6 exit criterion | **Not met** — 6 of 10 scenarios are partial or fail |

## Methodology

Each scenario's "required outcome" is quoted verbatim from FRD §10.3. Verdicts:
- **PASS** — the code does what the scenario requires, confirmed by direct reading.
- **PARTIAL** — part of the required outcome is met; a specific, named part is not.
- **FAIL** — the required outcome is not met, confirmed by direct reading (not by absence of evidence).
- Scoping notes are added where the scenario doesn't map to a single, unambiguous Buyer operation.

## B01 — Ask for current buyer-plan status

**Required:** "One scoped progress surface with current phase, blockers, counts and freshness."

**Verdict: PARTIAL.**

`buyerPlanStatusResult` (`askOrchestrator.service.ts:4599`) surfaces: progress percent/completed/total (`overview.journey.progress`), blocker count (`overview.blockers.length`), the exact next task, and freshness (`data.contextVersion`, a hash of the whole presentation payload). That's a real, scoped, single surface — not a list of disconnected facts.

**What's missing:** "current phase" is not rendered anywhere in the result. `HomeBuyerTask.service.ts:160` defines `currentBuyerPhase(stage)`, mapping the plan's real `stage` field (`EXPLORING`/`OFFER_CONTRACT`/`DUE_DILIGENCE`/`CLOSING_PREP`) to a `BuyerPlanPhase` — the data exists and is computed by the underlying service, but `buyerPlanStatusResult` never reads or surfaces it. A homeowner gets "68% complete, 2 blockers" but never "You're in Due Diligence." Confirmed by direct grep: zero references to `stage`/`phase` anywhere in the handler.

## B02 — Filter deadlines and refine by phase

**Required:** "Same result identity; full-scope counts; no duplicate list."

**Verdict: FAIL.**

There is no phase-based filtering mechanism anywhere in `buyerDeadlinesResult` (`askOrchestrator.service.ts:4633`) — confirmed by direct grep for `stage`/`phase` in the function body (zero matches). The operation returns milestones and blockers unconditionally; its `GROUPED_LIST` block declares `filters: []`, the same empty-filters pattern found across every Buyer read in the Phase 0 audit (§4.10). There is no declared filter chip, no message-text phase parsing, and no "same result identity across a refinement" to test, because refinement by phase isn't implemented at all. This scenario cannot pass until phase-scoped filtering is built.

## B03 — Complete a buyer task

**Required:** "Exact task review/confirmation, one write, receipt and plan reconciliation."

**Verdict: PARTIAL.**

- *Exact task review/confirmation*: real. `buyerTaskCompleteResult` uses `maintenanceCompletionMatch`/exact single-match resolution, and the confirmation card shows task/current-status/actual-cost/recurrence fields before anything changes.
- *One write*: real. The shared `AskConfirmationReceipt` claim/lease/replay mechanism (confirmed platform-wide in the Phase 0 audit) makes a retried confirmation resolve to the already-completed result rather than writing twice.
- *Receipt*: real. `confirmBuyerTaskComplete` returns a `COMPLETED`/`WORKFLOW_PROGRESS` result with the task's real post-completion state.
- *Plan reconciliation*: **fails.** Confirmed by direct grep of `confirmBuyerTaskComplete` (Phase 0 audit §4.10): it does not populate `refreshedExecutions`. A still-visible `BUYER_PLAN_STATUS` result showing "2 blockers, 68% complete" does not update after this task is completed — the homeowner would have to re-ask to see the new progress. Maintenance's own `confirmMaintenanceTaskComplete` is the one place in the entire platform this mechanism is actually wired (Phase 0 §4.15); Buyer never adopted it.

## B04 — Update a deadline that affects another readiness view

**Required:** "Old/new date disclosed; all affected results refreshed or marked stale."

**Original verdict: FAIL.** (Corrected during the original pass — an earlier draft of this section claimed a partial pass by assuming `BUYER_TASK_UPDATE` mirrored `MAINTENANCE_TASK_UPDATE`'s real `editableFields` implementation. Direct re-reading of `buyerTaskUpdateResult`'s exact confirmation block showed it did not.)

- *Old/new date disclosed*: **originally failed.** `buyerTaskUpdateResult`'s confirmation `fields` array was `[{Task}, {Action}, ...(dueDate ? [{'New due date', dueDate}] : []), ...(assignee ? [...] : [])]` — only the **new** date was shown; there was no "Current due date" field, so a homeowner rescheduling a task never saw what it was changing from. `editableFields` was unconditionally `[]`. This was a materially different (weaker) implementation than `MAINTENANCE_TASK_UPDATE`'s own RESCHEDULE handling, which shows both "Current due date" as a read-only field and the new date via a real `editableFields` entry — confirmed by direct comparison of the two functions, not assumed from the pattern looking similar.
- *All affected results refreshed or marked stale*: **originally failed**, same confirmed gap as B03 — `confirmBuyerTaskUpdate` did not populate `refreshedExecutions`, so no other Buyer result (e.g. `BUYER_DEADLINES`, which the rescheduled task may appear in) was refreshed or marked stale after the reschedule succeeded.

**FIXED, same session, 2026-09-17: `PARTIAL` (re-scored from an initial `PASS` after external review — see below).** Both halves now genuinely mirror `MAINTENANCE_TASK_UPDATE`'s own reference implementation rather than approximating it; the reconciliation half's own scope is narrower than "all affected results," matching Maintenance's own known limitation rather than exceeding it.

*Old/new date disclosed*: `buyerTaskUpdateResult`'s confirmation now shows `{ label: 'Current due date', value: humanDate(matched.dueAt) ?? 'Not scheduled' }` as a plain field for RESCHEDULE, with the proposed new date represented only via a real `editableFields` entry (`{ key: 'dueAt', label: 'New due date', type: 'DATE', value: dueDate }`) — not duplicated as read-only text, exactly Maintenance's own CONF-002/CONF-003 shape. Because the frontend's `ConfirmationCard` renders `editableFields` unconditionally for any operation (confirmed by direct read of `AskWorkspace.tsx`, no operation-specific gate), adding this field without also wiring server-side edit support would have rendered a working-looking "Edit" control that failed on every submission — `editAskConfirmation` (`askOrchestrator.service.ts`) was hardcoded to `MAINTENANCE_TASK_UPDATE` only. The fix therefore also generalizes `editAskConfirmation`: the shared access/status/role/version checks stay common, and a new `editBuyerTaskUpdateConfirmation` function (mirroring `MAINTENANCE_TASK_UPDATE`'s own edit path exactly — same optimistic status-and-version-guarded write, same `CONFIRMATION_EDITED` event) now handles `BUYER_TASK_UPDATE`'s reschedule edits against Buyer's own flat parameter shape and `prisma.homeBuyerTask` model. The duplicated yyyy-mm-dd-plus-real-calendar-date validation both edit paths needed is extracted once as `isValidDateEditInput`.

*All affected results refreshed or marked stale*: `confirmBuyerTaskUpdate` now calls the same reconciliation mechanism Maintenance uses, generalized from `refreshMaintenanceSourceExecution` to `refreshAskSourceExecution` (nothing about the original implementation was actually Maintenance-specific — it only read `parameters.sourceExecutionId`) — populating `refreshedExecutions` and, on a refresh failure, a `LIMITATION` block ("Saved; list could not refresh... ask 'What should I do next for this purchase?'"), the same CONF-005 shape Maintenance already had. `buyerTaskUpdateResult` now threads `sourceExecutionId` through from `envelope.launchContext?.sourceExecutionId`, matching `maintenance.update`'s own registration.

**Re-scored FULL PASS → PARTIAL 2026-09-17, external review.** `refreshAskSourceExecution` (`askOrchestrator.service.ts:10016`) reads a single `parameters.sourceExecutionId` string and refreshes at most one prior execution — this closes the specific "the list I clicked this reschedule from is now stale" gap, but "all affected results refreshed or marked stale" is a broader claim than that: another still-open Buyer result in the same conversation that also shows this task (e.g. `BUYER_PLAN_STATUS`, or a second `BUYER_DEADLINES` card the mutation wasn't launched from) is never touched. This is the exact same scope limitation [[project_ask_cozy_cross_domain_rollout_frd|Phase 1's Completed-reference re-verification]] already scores PARTIAL for the identical mechanism on Maintenance ("scoped to exactly one prior execution, not 'each source result whose membership, totals, status or next actions may have changed'") — scoring B04 as a clean PASS while Phase 1 scores the same underlying code PARTIAL was an internal inconsistency (per this series' own standard of scoring one mechanism the same way everywhere it's cited). The old/new-date-disclosure half of B04 remains a clean, unqualified PASS — only the reconciliation half is downgraded.

**FIXED (2nd round), same session, 2026-09-17: `PASS`.** Per an explicit user design decision (scoped in detail before implementation, not inferred), added a server-owned, operation-level "mutation impact" map (`ASK_MUTATION_IMPACT_MAP`, `askOrchestrator.service.ts`) declaring which sibling READ operations a mutation may affect — conservative by design, since XREC-001's own text says "may have changed," not "definitely changed for this exact record," so refreshing an unaffected sibling is a harmless no-op re-render, not a correctness bug. `BUYER_TASK_UPDATE` declares `BUYER_PLAN_STATUS`/`BUYER_DEADLINES` unconditionally, plus `BUYER_MOVE_STATUS` when the specific task being rescheduled is itself `taskType === 'MOVE'` (the same field `buyerMoveStatusResult` already filters on). At confirm time, `refreshImpactedSiblingExecutions` queries same-user/same-session/same-property `AskExecution` rows for those sibling operation ids, restricted to terminal read statuses (excluding `NEEDS_CONFIRMATION`/`RUNNING` — a live confirmation must never be silently re-run out from under the homeowner), excludes any row whose operationId is a registered domain command (defense in depth against ever treating a mutation/proposal as a refreshable read), and keeps only the most-recent row per sibling operation (an older, superseded ask for the same read isn't worth refreshing). Each surviving target is refreshed via the same `refreshAskExecutionAfterConflict` re-run mechanism Maintenance's reference implementation already uses, via `Promise.allSettled` so one sibling's failure can never block the others. `confirmBuyerTaskUpdate` now calls a new `reconcileAskExecutionSideEffects`, which runs both the explicit `sourceExecutionId` refresh and the sibling-impact refresh together and merges their results — capped, via a new `capReconciledChildExecutions`, to `AskExecutionResponseSchema`'s existing `childExecutions` max of 3 (1 explicit source + 3 possible siblings would otherwise exceed it on a move-task reschedule; the explicit source always keeps its slot, siblings fill what's left). Deliberately **not** client-supplied: the server already has the authoritative `userId`/`sessionId`/`propertyId`, and a client-supplied list would still need the server to decide which operations are eligible siblings — a client hint could be added later purely as a performance optimization, but correctness stays server-owned.

**Self-caught replay bug, fixed in the same round:** `confirmAskExecution`'s idempotency-replay branch (`previous.status === 'COMPLETED'`) used to return the stored execution bare, with no `childExecutions` at all — a client that submitted the original confirm, had the mutation genuinely succeed, but never saw the response (a dropped connection) and retried, would get the already-completed result but silently lose every sibling refresh, even though the retry is otherwise fully safe (protected by the same `AskConfirmationReceipt` idempotency this branch already guards). Fixed by calling `reconcileAskExecutionSideEffects` on replay too, using the execution row's own persisted `parametersJson` — this reruns only the read-only reconciliation step and redelivers its result inline; it never replays the mutation itself, which the idempotency receipt was already correctly preventing. This is a platform-wide fix (the branch is shared by every operation, not Buyer-specific) — it also closes the identical, previously-unnoticed gap for Maintenance's own existing single-target reconciliation on a confirm replay.

**Verification: 11 new unit tests** in `tests/ask/buyerMutationImpactReconciliation.test.js` covering the pure, extracted pieces directly: `ASK_MUTATION_IMPACT_MAP`'s declared Buyer siblings; `siblingOperationIdsForBuyerTaskUpdate`'s move-task conditional (adds/doesn't add `BUYER_MOVE_STATUS`); `selectSiblingRefreshTargets`'s no-operationId exclusion, command-operation exclusion, most-recent-per-operation dedup, and empty-input case; `capReconciledChildExecutions`'s cap-of-3 behavior (source always kept, siblings truncated; no-source case; below-cap case). All pass, alongside a clean `tsc --noEmit`, a fresh-parse check, and the full pre-existing Ask suite. The DB-heavy orchestration around these pure pieces (`refreshImpactedSiblingExecutions`'s actual Prisma query, the replay branch's end-to-end behavior against a live idempotency receipt) is **not** independently exercised — same STATIC-verification boundary applied throughout this audit series. **Not** database- or browser-verified — a live multi-card Buyer conversation (reschedule a task with `BUYER_PLAN_STATUS`/`BUYER_DEADLINES`/`BUYER_MOVE_STATUS` all previously asked about in the same session) was not exercised end to end.

**Verification level: 9 new unit tests** — 5 in `tests/ask/dateEditInputValidation.test.js` covering `isValidDateEditInput` directly (well-formed dates, non-string values, malformed shapes, an out-of-range month rejected, and one genuinely surprising finding verified by direct execution before asserting it: JS's `Date` constructor silently rolls a nonexistent day-of-month like `2026-02-30` over into `2026-03-02` rather than producing `NaN` — a pre-existing characteristic of Maintenance's own original validation, extracted here verbatim rather than introduced or silently fixed by this change, and explicitly disclosed rather than asserted away) — plus the 4 already-existing test-count contribution from this session's other extracted helpers in the same suite run. All pass, alongside a clean `tsc --noEmit` and a direct fresh-parse check. **Not** database- or browser-verified — the actual edit-submission round trip (does clicking "Edit" → "Save" on a Buyer reschedule confirmation genuinely persist and re-render correctly) was not exercised against a live database or browser this session.

## B05 — Several findings could match "handle this"

**Required:** "Target clarification before disposition or task creation."

**Verdict: PASS.**

`buyerFindingDispositionResult` (`askOrchestrator.service.ts:5392`) uses `maintenanceCompletionMatch` for entity resolution; when it doesn't resolve to exactly one finding (or the action word is ambiguous), it returns `NEEDS_ENTITY` with a `GROUPED_LIST` of the open findings and an explicit instruction ("Say negotiation, post-close, verified fact, or dismissed") rather than guessing. No disposition or task creation happens on an ambiguous match — confirmed by direct reading, matching ROLL-006 exactly.

## B06 — Contract revision changes during review

**Required:** "Stale proposal blocked; current date/state shown for renewed review."

**Verdict: PARTIAL — corrected from an original PASS after external review; the same defect independently found in Phase 8's P04 and Phase 7's D07.**

`BUYER_CONTRACT_TIMELINE` itself is a pure read with no domain command — there is no direct "edit the contract" confirmation flow to test this scenario against literally. The underlying mechanism it's really testing — a confirmation rejected because the record changed after the review card was shown — is scoped here to the closest directly-testable analogue: `confirmBuyerTaskUpdate`/`confirmBuyerTaskComplete`/`confirmBuyerFindingDisposition`.

*Stale proposal blocked*: genuinely real. All three carry a real per-entity version (`buyerTaskVersion`, `matched.buyerDispositionAt`) checked against the value captured at propose time, on top of the platform-wide `confirmAskExecution` mechanism (atomic version re-check inside the claim transaction, `ASK_CONTEXT_VERSION_CONFLICT` on drift — confirmed platform-wide in Phase 0 §2.5).

*Current date/state shown*: **not satisfied, confirmed by direct re-read.** `confirmBuyerTaskUpdate`'s conflict is thrown as `new Error('This task changed while the confirmation was open. Review its current status and try again.')` (`askOrchestrator.service.ts:10161`) — a static string with zero task-specific dynamic content (no title, no current due date, no current status). This is the identical pattern independently found in Phase 8's `confirmClaimTransition` (P04) and Phase 7's `confirmSellerPrepItemDecision` (D07): the shared generic error-catch wrapper (`askOrchestrator.service.ts:11579–11634`) renders `details: []` and `actions: []` hardcoded empty regardless of operation, so "review its current status" is an instruction to look elsewhere, not a display of the current state itself. Only `MAINTENANCE_TASK_COMPLETE`/`UPDATE`'s dynamic `maintenanceConflictDescription` genuinely interpolates real current-record values anywhere in this codebase — a pattern this scenario's own comparable Buyer handlers do not share.

Scored PARTIAL: the retry path does genuinely re-read and act on current state internally (it isn't fooled by stale data), and the block itself is real — but nothing is actually *shown* to the homeowner about what changed, so "current date/state shown for renewed review" is not met. Also retained: "contract revision" specifically has no directly testable write path in the current operation family, so this verdict is scoped to the closest analogue, not a literal contract-edit flow.

## B07 — Open a buyer workspace and return

**Required:** "Plan, filter, selection and position restored; changed data revalidated."

**Verdict: FAIL.**

Confirmed by direct grep: there is no Buyer-equivalent of `MaintenanceViewState` (`askOrchestrator.service.ts:1520`) — no `resultId`, no stored filter/selection/position, no lookup keyed off `launchContext.sourceExecutionId` for any Buyer read. `MAINTENANCE_STATUS` is the one operation in the entire 77-operation registry with this mechanism (Phase 0 §4.15's own finding). Several Buyer operations do carry real, targeted outbound hrefs (`?taskId=` on `BUYER_PLAN_STATUS`/`BUYER_DEADLINES`/`BUYER_TASK_UPDATE`/`BUYER_COST_READINESS`, `?filter=MOVE` on `BUYER_MOVE_STATUS`) — a homeowner can navigate *to* the right place — but nothing restores the Ask conversation's own prior filter/selection/scroll position when they come back, and there is no revalidation-on-return mechanism distinct from just re-asking the question fresh.

## B08 — Required source document is missing

**Required:** "Honest missing-context state and supported document/capture action."

**Verdict: PASS.**

Confirmed across multiple independent Buyer operations, not just one: `buyerFinancingReadinessResult`'s `UNKNOWN`/no-readiness branch ("Purchase financing has not been recorded yet... select a confirmed Loan Estimate"), `buyerTitleEscrowReadinessResult`'s no-workspace branch, `buyerWalkthroughReadinessResult`'s not-scheduled branch, `buyerDisclosureFundsReadinessResult`'s no-Closing-Disclosure branch, and `buyerContractTimelineResult`'s no-confirmed-revision branch all return an honest `READY_WITH_LIMITATIONS`/`NEEDS_CONTEXT` state with a specific action pointing at where to add the missing record — none of them fabricate readiness or silently treat the missing record as "not applicable."

## B09 — User lacks permission for financial detail

**Required:** "No leakage; read/action surface reflects current role."

**Verdict: PASS, with an interpretive note.**

*Action surface*: confirmed strict. All 5 Buyer command operations (`TASK_COMPLETE`/`CREATE`/`UPDATE`, `FINDING_DISPOSITION`, `LIFECYCLE_UPDATE`) check `access.role === HouseholdRole.VIEWER` and return `BLOCKED` **before any data lookup**, at both propose- and confirm-time independently.

*Read surface*: `buyerFinancingReadinessResult`'s data source, `BuyerPurchaseLenderReadinessService.get`, asserts only a `VIEWER` minimum (`buyerPurchaseLenderReadiness.service.ts:90`) — a Viewer sees the same lender-condition detail a Contributor or Owner would. This is not a leak in the sense of bypassing a declared boundary: `BUYER_FINANCING_READINESS`'s own registry entry declares `VIEWER` as its role floor, and this is the *uniform* pattern across all 13 Buyer read operations (every one is `VIEWER`-floor; every one of the 5 commands is `CONTRIBUTOR`-floor) — a deliberate, consistent "Viewer reads everything, Contributor+ writes" model, not something forgotten specifically for financial data. Read as "current role" meaning the property-level household role (not a separate financial-sensitivity tier), the requirement is met. Flagged as an interpretive call, not a certainty, since BUY-010's phrase "sensitive financing... follows existing access policy" could also be read as calling for a stricter tier that doesn't exist in the code.

## B10 — No relevant next step exists

**Required:** "Plan response completes without generic suggestions."

**Verdict: FAIL.**

Confirmed by direct reading of the terminal return statements: `buyerPlanStatusResult` always returns `suggestions: ['What is due before closing?', 'Which transaction documents are missing?']` regardless of whether `overview.nextAction` is present and regardless of blocker count — including the case where there is genuinely no open task and no blocker. `buyerCostReadinessResult` always returns the same 2 suggestions whether or not any costed tasks exist. This pattern held across every Buyer read checked — suggestions are a static pair keyed to the *operation*, not conditionally derived from whether a relevant next step actually exists for *this* response. ROLL-009's "the valid outcome of no suggestion" is not implemented anywhere in the Buyer family.

## Phase 6 exit criterion, second clause: "no undeclared item mutation"

**Verdict: PASS.**

All 5 Buyer command operations are registered in `askDomainCommandRegistry.ts` (confirmed in Phase 0 Stage 1) and dispatch exclusively through the canonical `confirmCapabilityInvoke`/`confirmAskExecution` path — there is no ad hoc write, no ability for presentation metadata to trigger a mutation outside the registered command set (XACT-001, verified platform-wide across all 77 operations during Phase 0 Stage 2, not assumed for Buyer specifically). Nothing found during this verification pass or the underlying Phase 0 tracing contradicts this.

## Summary

| ID | Required outcome | Verdict |
| --- | --- | --- |
| B01 | Buyer-plan status: phase, blockers, counts, freshness | **PARTIAL** — phase never surfaced despite being computed |
| B02 | Filter deadlines by phase | **FAIL** — no phase filtering exists |
| B03 | Complete a task: review, one write, receipt, reconciliation | **PARTIAL** — reconciliation not wired |
| B04 | Reschedule discloses old/new date, refreshes affected views | **PASS** (2 rounds of fixes) — round 1: current due date + real `editableFields`; round 2: server-owned `ASK_MUTATION_IMPACT_MAP` refreshes `BUYER_PLAN_STATUS`/`BUYER_DEADLINES`/conditionally `BUYER_MOVE_STATUS`, capped to `childExecutions`' max of 3, plus a platform-wide confirm-replay fix so a retried confirm still redelivers reconciliation; 11 new unit tests |
| B05 | Ambiguous finding → target clarification | **PASS** |
| B06 | Stale confirmation blocked, current state shown | **PARTIAL** — corrected from PASS: block is real; current-state-shown fails (static conflict message, same defect as Phase 8's P04 and Phase 7's D07); no direct contract-edit path to test literally |
| B07 | Workspace round-trip restores plan/filter/selection/position | **FAIL** — no view-state mechanism exists for Buyer |
| B08 | Missing source document handled honestly | **PASS** |
| B09 | Role-appropriate read/action surface | **PASS** (interpretive) |
| B10 | No forced suggestions when nothing is relevant | **FAIL** — suggestions are always static |
| — | No undeclared item mutation | **PASS** |

**4 full passes, 3 partial passes, 3 fails, out of 10 scenarios.** Originally scored 4/2/4; external review corrected B06 (PASS→PARTIAL); the B04 round-1 fix corrected B04 (FAIL→PASS); a second external review then re-scored B04 (PASS→PARTIAL) for a reconciliation-scope overclaim; a round-2 B04 fix (server-owned mutation-impact map, per an explicit scoped design decision) closes that gap too, netting to 4/3/3. The FRD's own Phase 6 exit criterion ("B01–B10 pass") is not met as of this verification. The remaining gaps cluster around two of the same platform-wide findings this audit series has now identified across multiple tracks — the total absence of any reconciliation for B03 (unlike B04, which now has both an explicit-target AND a sibling-impact mechanism), the absence of a Maintenance-style view-state mechanism outside that one track (B07), and the static, non-dynamic conflict message every confirm handler except Maintenance's shares (B06, confirmed the same root cause as Phase 8's P04 and Phase 7's D07) — plus Buyer-specific gaps not previously scored against a concrete scenario: no phase-based filtering (B02), and unconditional suggestion text (B10).
