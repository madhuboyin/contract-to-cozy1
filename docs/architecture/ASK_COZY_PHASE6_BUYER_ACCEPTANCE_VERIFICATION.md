# Ask Cozy Cross-Domain Interaction Rollout — Phase 6 Buyer Acceptance Scenario Verification

**Status:** Complete — all 10 acceptance scenarios (B01–B10) plus the Phase 6 exit criterion's "no undeclared item mutation" clause evaluated.
**Verdict: Phase 6's exit criterion ("B01–B10 pass and the buyer operation family has no undeclared item mutation") is NOT currently met.** 4 of 10 scenarios pass fully, 2 pass partially with a specific, named gap, and 4 fail. The mutation-discipline half of the exit criterion does pass.
**Governs:** [Ask Cozy — Cross-Domain Interaction Rollout FRD](../product/ASK_COZY_CROSS_DOMAIN_INTERACTION_ROLLOUT_FRD.md) §10.3 (B01–B10) and §21 Phase 6's exit criterion.
**Builds on:** [Phase 0 Coverage Audit](ASK_COZY_PHASE0_COVERAGE_AUDIT.md) §4.10, which traced all 18 Buyer operations to the handler level. This document re-reads the code against each specific acceptance scenario rather than re-deriving the underlying evidence from scratch.
**Verification level: STATIC.** Every verdict below is derived from reading `askOrchestrator.service.ts`'s buyer handlers, `askDomainCommandRegistry.ts`, `HomeBuyerTask.service.ts`, and `buyerPurchaseLenderReadiness.service.ts` directly, plus the `tsc`-clean, test-green state confirmed in the Phase 0 audit. Nothing here is database- or browser-verified — no live Buyer Plan was exercised end to end.

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

**Verdict: FAIL.** (Corrected during this pass — an earlier draft of this section claimed a partial pass by assuming `BUYER_TASK_UPDATE` mirrored `MAINTENANCE_TASK_UPDATE`'s real `editableFields` implementation. Direct re-reading of `buyerTaskUpdateResult`'s exact confirmation block shows it does not.)

- *Old/new date disclosed*: **fails.** `buyerTaskUpdateResult`'s confirmation `fields` array is `[{Task}, {Action}, ...(dueDate ? [{'New due date', dueDate}] : []), ...(assignee ? [...] : [])]` — only the **new** date is shown; there is no "Current due date" field, so a homeowner rescheduling a task never sees what it's changing from. `editableFields` is unconditionally `[]`. This is a materially different (weaker) implementation than `MAINTENANCE_TASK_UPDATE`'s own RESCHEDULE handling, which shows both "Current due date" as a read-only field and the new date via a real `editableFields` entry — confirmed by direct comparison of the two functions, not assumed from the pattern looking similar.
- *All affected results refreshed or marked stale*: **fails**, same confirmed gap as B03 — `confirmBuyerTaskUpdate` does not populate `refreshedExecutions`, so no other Buyer result (e.g. `BUYER_DEADLINES`, which the rescheduled task may appear in) is refreshed or marked stale after the reschedule succeeds.

## B05 — Several findings could match "handle this"

**Required:** "Target clarification before disposition or task creation."

**Verdict: PASS.**

`buyerFindingDispositionResult` (`askOrchestrator.service.ts:5392`) uses `maintenanceCompletionMatch` for entity resolution; when it doesn't resolve to exactly one finding (or the action word is ambiguous), it returns `NEEDS_ENTITY` with a `GROUPED_LIST` of the open findings and an explicit instruction ("Say negotiation, post-close, verified fact, or dismissed") rather than guessing. No disposition or task creation happens on an ambiguous match — confirmed by direct reading, matching ROLL-006 exactly.

## B06 — Contract revision changes during review

**Required:** "Stale proposal blocked; current date/state shown for renewed review."

**Verdict: PASS, with a scoping note.**

`BUYER_CONTRACT_TIMELINE` itself is a pure read with no domain command — there is no direct "edit the contract" confirmation flow to test this scenario against literally. The underlying mechanism it's really testing — a confirmation rejected because the record changed after the review card was shown — is real and verified elsewhere in the Buyer family: `confirmBuyerTaskUpdate`/`confirmBuyerTaskComplete`/`confirmBuyerFindingDisposition` all carry a real per-entity version (`buyerTaskVersion`, `matched.buyerDispositionAt`) checked against the value captured at propose time, on top of the platform-wide `confirmAskExecution` mechanism (atomic version re-check inside the claim transaction, `ASK_CONTEXT_VERSION_CONFLICT` on drift — confirmed platform-wide in Phase 0 §2.5). A stale Buyer confirmation is genuinely blocked, and the retry path re-reads current state rather than replaying stale data. Scored PASS on the mechanism the scenario is really probing; flagged that "contract revision" specifically has no directly testable write path in the current operation family.

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
| B04 | Reschedule discloses old/new date, refreshes affected views | **FAIL** — only the new date is shown, no editable field, reconciliation not wired |
| B05 | Ambiguous finding → target clarification | **PASS** |
| B06 | Stale confirmation blocked, current state shown | **PASS** (mechanism verified; no direct contract-edit path to test literally) |
| B07 | Workspace round-trip restores plan/filter/selection/position | **FAIL** — no view-state mechanism exists for Buyer |
| B08 | Missing source document handled honestly | **PASS** |
| B09 | Role-appropriate read/action surface | **PASS** (interpretive) |
| B10 | No forced suggestions when nothing is relevant | **FAIL** — suggestions are always static |
| — | No undeclared item mutation | **PASS** |

**4 full passes, 2 partial passes, 4 fails, out of 10 scenarios.** The FRD's own Phase 6 exit criterion ("B01–B10 pass") is not met as of this verification. The gaps cluster around two of the same platform-wide findings the Phase 0 audit already identified — the missing `refreshedExecutions` reconciliation (B03, B04) and the absence of a Maintenance-style view-state mechanism outside that one track (B07) — plus Buyer-specific gaps not previously scored against a concrete scenario: no phase-based filtering (B02), a weaker old/new-value disclosure than Maintenance's own reference implementation (B04), and unconditional suggestion text (B10).
