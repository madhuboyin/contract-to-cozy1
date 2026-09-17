# Ask Cozy Cross-Domain Interaction Rollout — Phase 1 Completed-Reference (Maintenance) Re-Verification

**Status:** Complete.
**Verdict: the maintenance slice is, as every other track in this audit series has assumed, genuinely the strongest operation family in the registry** — but re-reading it against the same rigor bar applied everywhere else surfaces 2 real, narrow gaps even here: `MAINTENANCE_TASK_CREATE` has no reconciliation call at all (unlike its sibling `COMPLETE`/`UPDATE`), and the reconciliation those two siblings *do* have is scoped to exactly one prior card, not every visible result that could be affected.
**Governs:** [Ask Cozy — Cross-Domain Interaction Rollout FRD](../product/ASK_COZY_CROSS_DOMAIN_INTERACTION_ROLLOUT_FRD.md) §7's "Completed reference" row (`MAINTENANCE_STATUS`, `MAINTENANCE_TASK_CREATE`, `MAINTENANCE_TASK_COMPLETE`, `MAINTENANCE_TASK_UPDATE`), §8 (shared cross-domain requirements), §20 (interaction quality harness), and §21 Phase 1's exit criterion ("the maintenance journey has a recorded functional and interaction-quality baseline, with any unexecuted live scenarios distinguished from missing implementation").
**Why this document exists:** every other verification in this series has repeatedly cited maintenance as the reference every other track is measured against (the only real `editableFields` implementation, the only 2-of-30 confirmation-gated operations that populate `refreshedExecutions`, the only operation-level view-state mechanism in the registry). None of those citations were themselves re-verified end to end against maintenance's own confirm-time code — they were read once, early, during Phase 0 tracing. ROLL-010 says explicitly: "Existing backend capability is recorded as baseline evidence, not treated as acceptance of the interactive experience." This document applies that same warning to maintenance itself rather than exempting it.
**Verification level: STATIC.** Every claim below is derived from direct reads of `maintenanceResult`, `maintenanceTaskCreateResult`, `maintenanceTaskCompleteResult`, `maintenanceTaskUpdateResult`, `confirmMaintenanceTaskComplete`, `confirmMaintenanceTaskCreate`, `confirmMaintenanceTaskUpdate`, `refreshMaintenanceSourceExecution`, and `mergeMaintenanceViewContinuation` in `askOrchestrator.service.ts`. Nothing here is database- or browser-verified — consistent with every other document in this series, and itself an instance of the "unexecuted live scenarios distinguished from missing implementation" Phase 1's exit criterion asks for.

| Field | Status |
| --- | --- |
| Audit coverage | Complete — all 8 requirement clusters (§8's shared cross-domain requirements, mapped onto the 4 Completed-reference operations) evaluated |
| Static (code-read) acceptance | 6 pass, 2 partial, 0 fail |
| Runtime/browser acceptance | Not evaluated this session — no live database or browser exercised |
| Phase 1 exit criterion ("a recorded functional and interaction-quality baseline...") | **Met** — this document is that record; the 2 partials are the "unexecuted live scenarios distinguished from missing implementation" the criterion itself asks for |

## Methodology

There is no dedicated acceptance-scenario table for maintenance — §6.2 explicitly excludes "reimplementing the completed maintenance slice" from this FRD's rollout scope, and §7's own table says "no new rollout; use as reference." So instead of scoring against a T/B/D/F/P-style list, this document scores maintenance against the shared cross-domain requirements (§8: XRES/XACT/XPROP/XREC/XSEC) it is meant to exemplify, plus the golden-journey shape Phase 1's own bullet names directly: "query → filter → select → prepare reschedule → edit → confirm → reconcile → exact-task explanation → handoff → return." Same PASS/PARTIAL/FAIL convention as the rest of the series.

## Query, filter, select (XRES-001–004, ROLL-006)

**Verdict: PASS.**

`maintenanceResult` fetches the canonical full task set via `loadCanonicalMaintenanceTaskSet` rather than a platform-bounded composed-skill-context subset — the code's own comment explains this was a fix (MAINT-003/A02): a property with 101 matching urgent tasks now reports 101 and can surface any of them, not just whichever 100 fit in a bounded context. Truncation is disclosed, not silent: `GROUPED_LIST`'s description states "Showing up to {MAX_RESULT_ITEMS} items per section," and a dedicated "View all in Maintenance" link is always the first action on any section, giving genuine full-result access — this is one of only two disclosed exceptions to the undisclosed item-cap pattern found repeated across the other 75 operations in Phase 0's cross-cutting findings. The empty-vs-filtered distinction required by XRES-003 is explicit: `canonicalTaskSet.totalTaskCount === 0` ("no tasks recorded for this home yet") is a materially different message from filters matching nothing — the code comment notes this used to collapse into one identical string before a fix. Entity resolution for row actions bypasses fuzzy matching entirely: a "Complete"/"Reschedule" click carries a canonical `taskId`/`launchTaskId` via `launchContext`, resolved directly (`tasks.find((task) => task.id === launchTaskId)`), with `maintenanceCompletionMatch`'s scored free-text fallback (score ≥ 35 and a clear margin over the runner-up) reserved for conversational references — an ambiguous match returns `NEEDS_ENTITY`/`NEEDS_CLARIFICATION`, never a guess.

## Filter continuity and refinement (XRES-002)

**Verdict: PASS.**

`mergeMaintenanceViewContinuation` reconstructs a status-chip continuation's effective query from the *prior turn's structured, previously-parsed* domain/date/room phrases, not by concatenating raw conversation text — the code comment documents this was itself a fix for a bug where a cleared status filter stayed stuck. Clicking "Overdue" replaces only the status dimension; an established domain scope ("hvac") or room scope survives untouched. "Clear all filters" is the one control that resets everything, and it's offered only when there's an actual non-default scope worth clearing — not unconditionally.

## Prepare, edit, confirm (ROLL-005, XPROP-001–004)

**Verdict: PASS — the only genuinely complete implementation of these requirements found anywhere in the 77-operation registry.**

`MAINTENANCE_TASK_UPDATE`'s `RESCHEDULE` path is the sole operation across every track verified in this series with a real `editableFields` implementation that also discloses the *current* value being changed, not just the new one: `fields` includes `{ label: 'Current due date', value: humanDate(match.nextDueDate) }` alongside the proposed date carried in `editableFields`, plus an explicit disclosure of the recurrence consequence ("only this next due date changes," not the whole pattern) when the task repeats. This is exactly the gap Buyer's `BUYER_TASK_UPDATE` was found missing during the Phase 6 acceptance verification (B04) — maintenance is the reference implementation that comparison was made against, and re-reading it directly here confirms the comparison was accurate. Clarification round-trips for `MAINTENANCE_TASK_CREATE`/`MAINTENANCE_TASK_COMPLETE` preserve prior partial input via `currentAnswer: Object.fromEntries(Object.entries(candidate).filter(...))` — the richer capture pattern that Protection's `CLAIM_FILE` (P03) was found lacking.

## Confirm-time integrity: stale writes, idempotent replay (ROLL-004, XPROP-004)

**Verdict: PASS — stronger than anywhere else re-read in this series, including a race-condition class not addressed anywhere else.**

`confirmMaintenanceTaskComplete` and `confirmMaintenanceTaskUpdate` both recognize a retried confirmation that already succeeded (`completedByThisExecution`/`appliedByThisExecution`, keyed to `ask:${execution.id}:maintenance-...`) and safely re-serve the existing outcome instead of erroring or reapplying — the same idempotent-replay discipline Protection's `confirmClaimTransition` (P04) was found to have, confirmed here as not unique to Claims. Genuine conflicts produce `maintenanceConflictDescription`, which names the *specific* thing that changed (already completed elsewhere, cancelled, or a named status/priority/date delta) rather than a generic "something changed" — the code's own comment documents this was a fix for exactly that generic-message complaint.

`confirmMaintenanceTaskUpdate` goes further than any other confirm handler read in this audit series: it passes `expectedUpdatedAt: current.updatedAt` through to `PropertyMaintenanceTaskService.updateTask`'s own compare-and-swap, explicitly to pin the write's baseline to the version this handler already validated — closing a real TOCTOU window between the handler's own version check and the service's internal read, which the code comment documents as a previously-real bug ("a write landing between the check above and updateTask's internal read was silently adopted as updateTask's own baseline and succeeded against it — overwriting a version nobody actually reviewed"). No other confirmation-gated operation re-read across this entire series pins a downstream service call to a specific expected version this way; every other race-condition finding in this series has been about the *absence* of such a guard, not a working example of one.

## Reconcile (XREC-001, XREC-002)

**Verdict: PARTIAL — real and honestly disclosed on failure, but narrower than the other findings in this document, and inconsistent across the 3 mutating operations.**

`confirmMaintenanceTaskComplete` and `confirmMaintenanceTaskUpdate` both call `refreshMaintenanceSourceExecution`, which re-runs the *one specific* prior list execution the mutation's row-action was launched from (`parameters.sourceExecutionId`) and returns it as `refreshedExecutions` — as of this document's own writing (2026-09-17), this was the only reconciliation mechanism found working anywhere in the 77-operation registry (confirmed again here, not just cited from Phase 0). **Update (same day, later in the engagement):** the Buyer B04 remediation generalized this exact function (renamed `refreshAskSourceExecution`) and wired `confirmBuyerTaskUpdate` to call it too — Maintenance is no longer the only operation family using this mechanism, though the mechanism's own scope limitation described below (item 2) applies identically to Buyer's use of it; see `ASK_COZY_PHASE6_BUYER_ACCEPTANCE_VERIFICATION.md`'s B04 section, re-scored PARTIAL for this same reason. Failure handling is genuinely honest: `attemptedAndFailed` is a distinct flag from "nothing to refresh," specifically because — per the code's own comment — a failed refresh used to be indistinguishable from no-op, which meant the required "Saved; list could not refresh" recovery text (XREC-002) could never actually render. It now does, as a `LIMITATION` block naming the concrete non-repeating recovery step ("ask 'What maintenance is pending?' to see its current state").

Two real gaps, both found by reading the confirm handlers directly rather than assuming parity across the three siblings:

1. **`confirmMaintenanceTaskCreate` calls no refresh mechanism at all** — it returns a bare `{ result, artifactType, artifactId }` with no `refreshedExecutions`. If a homeowner is viewing a filtered pending-tasks list through Ask and creates a new task via a separate turn, that list will not reflect the new task without a fresh ask. `COMPLETE` and `UPDATE` both reconcile; `CREATE` — the operation XREC-001 arguably applies to most directly, since it changes a list's *membership*, not just one row's status — does not.
2. **Even where reconciliation exists, it is scoped to exactly one prior execution**, not "each source result whose membership, totals, status or next actions may have changed" as XREC-001's literal text requires. Completing a maintenance task that's also linked to a Home Action via `workItem` (confirmed to exist as a real link in `homeActionsResult`'s item `meta`) does not refresh any open `HOME_ACTIONS` card in the same conversation — only the one `MAINTENANCE_STATUS`-family card the click originated from.

Neither gap is severe — the mechanism that exists is real, deliberate engineering (both are documented via in-code comments describing exactly what problem they solve, not silent gaps), and both failure modes degrade honestly (a stale list, clearly labeled as possibly stale via the next ask, never a fabricated success). But "the reference implementation reconciles everything" would overstate what's actually there, and this document exists specifically to check that overstatement rather than assume it.

## Exact-task explanation, permission, access (XSEC-001, ROLL-006)

**Verdict: PASS.**

All three mutating operations check `access.role === HouseholdRole.VIEWER` and block with an explained `ASK_PERMISSION_REQUIRED` before any candidate parsing or preparation begins — permission is the first gate, not a late-stage confirm-time surprise. "Why is this important?" is deliberately routed as an unforced, `VIEWER`-available `GROUNDED_GUIDANCE` continuation rather than pinned to a mutation-only operation, with the code comment explaining the distinction was intentional (MAINT-008).

## Handoff and return (ROLL-007, HAND-001/002)

**Verdict: PARTIAL — an honest, disclosed partial, not a silent one.**

Handoff to the Maintenance page carries real, working query parameters: `priority=true`, `filter=overdue`/`filter=due-soon`, and `system=<phrase>` (the whole alias group, not just the first match — a documented fix for tasks vanishing from the destination page). What does *not* carry over — date-range and room scope, since the Maintenance page's own client-side filter has no equivalent fields — is stated explicitly in the block description ("the date filter and the room filter will not carry over to the Maintenance page") rather than silently dropped, and the system/category filter that *does* carry over is flagged as an approximate keyword match, not a guaranteed-identical result set, since the two sides check different fields. This is a genuinely careful implementation of ROLL-007's disclosure obligation ("unsupported context is disclosed before or at handoff") — but the underlying requirement (ROLL-007's "preserves every representable filter, sort, target and return anchor") is still not fully met, since two real filter dimensions simply have nowhere to land on the destination page. Scored PARTIAL to reflect that the disclosure is excellent but the preservation itself is incomplete — the same distinction drawn for Financial's F07 elsewhere in this series.

## Return: position/view-state restoration (ROLL-007 return leg)

**Verdict: PASS — the only implementation of this requirement anywhere in the registry, confirmed directly.**

`MaintenanceViewState` (`resultId`, `domainScopePhrase`, `dateScopePhrase`, `roomScopePhrase`, `statusFilter`, `selectedTaskId`, `revision`) is minted once per distinct query and carried forward unchanged across every filter-chip click and refresh of that same interactive result, persisted in the execution's own `parametersJson` and loaded by `loadMaintenanceViewState`. This is the mechanism every other track's B07/D05/F07 findings measured against and found absent — re-reading it here confirms it really does what those other documents assumed: a homeowner mid-filter who refreshes or continues the conversation gets the same view back, not a reset to an unscoped default.

## Summary

| Requirement cluster | FRD basis | Verdict |
| --- | --- | --- |
| Query/filter/select, full-collection correctness, entity resolution | XRES-001–004, ROLL-006 | **PASS** |
| Filter continuity across a refinement | XRES-002 | **PASS** |
| Editable proposals, current-vs-proposed disclosure, value retention on clarify | ROLL-005, XPROP-001–004 | **PASS** — the reference implementation other tracks are measured against, confirmed accurate |
| Stale-write blocking, idempotent replay, race-condition closure | ROLL-004, XPROP-004 | **PASS** — a TOCTOU-closing compare-and-swap found nowhere else in the registry |
| Reconciliation of affected visible results, honest refresh-failure disclosure | XREC-001, XREC-002 | **PARTIAL** — real and honest where it exists; `CREATE` has none; even `COMPLETE`/`UPDATE`'s refresh is scoped to one prior card, not every affected result |
| Permission gating, exact-task explanation | XSEC-001, ROLL-006 | **PASS** |
| Handoff filter/scope preservation and disclosure | ROLL-007, HAND-001/002 | **PARTIAL** — disclosure is excellent; two real filter dimensions still don't round-trip |
| Return position/view-state restoration | ROLL-007 (return leg) | **PASS** — the only such mechanism in the 77-operation registry |

**6 of 8 requirement clusters pass cleanly, 2 are honest partials — no outright fail.** This confirms the premise every other document in this series has relied on (maintenance as the strongest, most-audited reference), while adding two findings that hadn't been surfaced by only citing it in passing: `MAINTENANCE_TASK_CREATE`'s missing reconciliation call, and the single-card scope of the reconciliation that does exist. Both are narrow and honestly-degrading rather than silent, consistent with the general engineering discipline visible throughout this file's own review-history comments (MAINT-003 through MAINT-008, "External review [P1]/[P2]" citations) — but Phase 1's exit criterion asks for a recorded baseline, not an assumed one, and this document is that baseline actually being checked rather than only cited.
