# Ask Cozy Cross-Domain Interaction Rollout — Phase 8 Protection and Claims Acceptance Scenario Verification

**Status:** Complete — all 8 acceptance scenarios (P01–P08) evaluated. **Revised 2026-09-17 after external review corrected 3 of the original 5 PASS verdicts (P02, P04, P05); see the correction notes in each section. P04 FIXED 2026-09-17, per explicit user request to continue the same static-conflict-message fix already applied to Buyer's B06 into this track: a new `claimConflictDescription` now interpolates the claim's real current title/status, closing PARTIAL→PASS. P03 and P05 BOTH FIXED 2026-09-17: `CLAIM_FILE`'s missing-type branch now uses a real `captureRequests` GROUP form retaining the original message (mirroring `MAINTENANCE_TASK_CREATE`'s own pattern), closing P03 PARTIAL→PASS; both `confirmClaimFile`/`confirmClaimTransition` now call the same `reconcileAskExecutionSideEffects` mechanism Buyer's B03/B04 built, with `INCIDENT_CONTINUATION` as their sibling, closing P05 PARTIAL→PASS.**
**Verdict: 6 full passes, 1 partial pass, 1 scenario untestable because its precondition (a `DISMISS` control) doesn't exist anywhere in the app yet.** Originally scored 5 pass/2 partial/1 untestable; external review corrected 3 verdicts to 3/4/1; P04's fix brought it to 4/3/1; P03 and P05's fixes now net to 6/1/1. The corrections share one root cause: several verdicts credited a *related* platform mechanism (confirmation idempotency, a generic version-conflict guard) for satisfying a requirement it doesn't actually address (read-refresh recovery, dynamic current-state disclosure), or narrowed an acceptance criterion after finding the code didn't meet its literal, full wording. `CLAIM_TRANSITION`'s idempotent-replay handling (P04's already-solid half) remains the one genuinely Claims-specific piece of engineering found in this track — now paired with a genuinely dynamic conflict message, a real retained-value capture form, and a real sibling-refresh mechanism too.
**Governs:** [Ask Cozy — Cross-Domain Interaction Rollout FRD](../product/ASK_COZY_CROSS_DOMAIN_INTERACTION_ROLLOUT_FRD.md) §12.3 (P01–P08) and §21 Phase 8's exit criterion ("P01–P08 pass").
**Builds on:** [Phase 0 Coverage Audit](ASK_COZY_PHASE0_COVERAGE_AUDIT.md) §4.12, which traced all 6 Protection-and-claims operations to the handler level. This document re-reads the code against each specific acceptance scenario, including the `confirmClaimFile`/`confirmClaimTransition` bodies not read in full during Phase 0.
**Verification level: STATIC.** Every verdict below is derived from reading `askOrchestrator.service.ts`'s coverage/incident/claim handlers, `interactionDispatch.ts`, and (for P06's redaction claim) `AskWorkspace.tsx`, plus the platform-wide confirmation mechanism already verified in the Phase 0 audit (§2.5). Nothing here is database- or browser-verified.

| Field | Status |
| --- | --- |
| Audit coverage | Complete — all 8 acceptance scenarios (P01–P08) evaluated |
| Static (code-read) acceptance | 6 pass, 1 partial, 1 untestable (P08 — precondition doesn't exist yet) |
| Runtime/browser acceptance | Not evaluated this session — no live database or browser exercised |
| Phase 8 exit criterion ("P01–P08 pass") | **Not met** — 1 of 8 scenarios is only partial (P02), plus P08 untestable |

## Methodology

Same as the Phase 6/7 verifications: PASS (fully confirmed by code), PARTIAL (part of the requirement met, a specific part isn't), FAIL (confirmed not met). Where a scenario is satisfied by a platform-wide mechanism rather than something Claims-specific, that's noted explicitly — it's still a real pass, just not evidence of extra engineering effort in this track.

## P01 — Ask about coverage with a missing/unverified policy

**Required:** "Explicit uncertainty and supported document/capture next step."

**Verdict: PASS.**

Confirmed on both relevant operations. `coverageResult` (`COVERAGE_GAPS`) keeps `NO_COVERAGE`/`COVERAGE_UNCLEAR`/`EXPIRED`/`EXPIRING_SOON`/`EVIDENCE_MISSING` as genuinely distinct groups and states outright that "Unknown records remain separate from confirmed gaps" — never collapsing "unverified" into "no coverage." It also offers a real `captureRequests`-based next step (via `evaluateFeatureContext`, `featureKey: 'COVERAGE_INTELLIGENCE'`) for the `COVERAGE_UNCLEAR` case specifically. `coverageComparisonStatusResult` (`COVERAGE_COMPARISON_STATUS`) has its own honest `BASELINE_REQUIRED` state: "No verified policy on file yet... Add and verify your policy first," with a direct link to the comparison workspace. Neither operation infers coverage from an unverified record.

## P02 — Several incidents could match a continuation

**Required:** "Clarify exact incident before showing or mutating claim state." (FRD §12.3 P02, verbatim — the FRD conjoins both halves with "or," not "specifically at mutation time.")

**Verdict: PARTIAL — corrected from an original PASS after external review.**

**Correction:** the original pass was reached by narrowing the acceptance criterion to only its mutation half after finding the code didn't satisfy the "showing" half — the verdict below restores the literal, full requirement.

*Mutating claim state*: genuinely clarified. `claimTransitionResult` uses `exactEntityMatch` against the message, and when it doesn't resolve to exactly one claim, returns `NEEDS_ENTITY` with a `GROUPED_LIST` of the open claims and an explicit "Use the exact claim title" instruction — no status change happens on an ambiguous match.

*Showing claim state*: **not clarified, confirmed by direct re-read.** `incidentContinuationResult` (`INCIDENT_CONTINUATION`) takes **no message parameter at all** — confirmed by its own signature (`async function incidentContinuationResult(propertyId: string)`) — so it has no mechanism to interpret "continue with that one" as referring to a specific prior incident. It unconditionally returns the 10 most recent incidents *and* the 10 most recent claims (`askOrchestrator.service.ts:3037–3049`) — real claim titles and statuses, genuinely "shown" — with no clarification step before that list, including the claims section, is displayed. The FRD's own wording is "before showing **or** mutating," not "before mutating, or before showing if that's also implemented" — `INCIDENT_CONTINUATION` is exactly the operation this scenario is written to probe (it's literally named for incident continuation), and it doesn't clarify before showing.

Scored PARTIAL: the mutation half is real, Claims-specific engineering; the showing half is a confirmed, literal miss against the FRD's own conjunctive wording, not a scope note.

## P03 — Prepare a claim with missing required information

**Required:** "Retain entered values; request only canonical required inputs."

**Original verdict: PARTIAL.**

*Request only canonical required inputs*: real. `claimFileResult` requires exactly one thing — the incident type, parsed via `claimTypeFromMessage` — before it will even build a confirmation; it does not demand fields it doesn't need (the title is derived automatically from the message once a type is found).

*Retain entered values*: **originally failed.** `claimFileResult`'s missing-type branch returned `durableFreeTextClarification('CLAIM_FILE', ...)` — confirmed by direct reading (`askOrchestrator.service.ts:510`) that this helper carries forward only `candidateOperationIds`/`expiresAt`; it had no field for the original message text or any extracted partial value. Contrast with `MAINTENANCE_TASK_CREATE`'s missing-input branch, which uses a real `captureRequests` `GROUP` form with `currentAnswer: Object.fromEntries(...)` explicitly pre-filling whatever was already extracted. If a homeowner's first message ("My roof leaked during the storm, ceiling damage in the guest room...") didn't happen to match a recognized incident-type pattern, none of that detail survived into the clarification round-trip — the homeowner had to retype the whole thing, not just add the missing type.

**FIXED, 2026-09-17.** `claimFileResult`'s missing-type branch now returns a real `captureRequests` `CLAIM_FILE_INPUTS` `GROUP` form, mirroring `MAINTENANCE_TASK_CREATE`'s own pattern exactly: `currentAnswer.description` is pre-filled with the original message verbatim, and `currentAnswer.title` is pre-filled when the message contains an explicit "titled X"/"called X" phrase (the same regex `claimTitleFromMessage` already used). The incident-type field is `SINGLE_SELECT`, options generated from a single, now-hoisted `CLAIM_TYPE_LABELS` map (previously a function-local object inside `claimTitleFromMessage`) so the form's options and the label text can never drift apart. `claimFileResult` gained a `suppliedInput?: ClaimFileWorkflowInput` parameter (mirroring `maintenanceTaskCreateResult`'s own signature); a new branch in `submitAskCapture` (the platform's generic capture-answer dispatcher) validates the submitted answer against a new `ClaimFileWorkflowInputSchema` and resumes `claimFileResult` with it, exactly as `MAINTENANCE_TASK_CREATE`'s own branch does. `CLAIM_FILE` had no live "workflow version" to check for drift the way Maintenance's task list does (nothing about the property invalidates a not-yet-created draft claim), so `expectedContextVersion` is just the issuing capture request's own `requirementId` — the platform's generic `active` check (requirementId + captureKey match) is the only guard this needed.

**Verification: 6 new unit tests** in `tests/ask/claimFileCaptureRetention.test.js` (an unrecognized message returns the capture form with the original message retained as `currentAnswer.description`; an explicit "titled X" phrase is retained as `currentAnswer.title`; a recognized incident type still goes straight to confirmation, unaffected; resuming with a `suppliedInput` answer builds the confirmation from the structured answer rather than re-parsing the original message; an omitted optional title falls back to the incident-type label; `ClaimFileWorkflowInputSchema` requires `type`/`description` but not `title`). `tsc --noEmit` clean, fresh-parse clean. **Not** database- or browser-verified — `claimFileResult` and the `submitAskCapture` dispatch branch are both directly testable without a database (no Prisma reads in the missing-type path), but the end-to-end capture-request round trip through the API layer was not exercised live.

**Revised verdict: `PASS`.** Both halves of the requirement are now genuinely met.

## P04 — Claim state changes in another session before confirmation

**Required:** "Stale transition blocked; current state shown."

**Original verdict: PARTIAL — corrected from an original PASS after external review; the stale-block half is real, "current state shown" is not.**

*Stale transition blocked*: genuinely strong, and stronger than most other confirm handlers verified in this audit series. `confirmClaimTransition` (`askOrchestrator.service.ts:9744`) re-fetches the claim fresh, recomputes a version hash, and throws `ASK_CONTEXT_VERSION_CONFLICT` on a genuine mismatch. Critically, the guard is `parameters.claimContextVersion !== currentVersion && claim.status !== nextStatus` — it does **not** false-positive-block a retried confirmation that lands on a claim already in the target status (a lease-reclaim replay scenario): `claim.status === nextStatus ? await ClaimsService.getClaim(...) : await ClaimsService.updateClaim(...)` re-reads rather than errors or re-applies when the transition already happened. This is real idempotent-replay handling on top of the generic freshness check, not just the platform-wide baseline — and it's the one piece of this track's engineering that's genuinely Claims-specific rather than an inherited platform mechanism.

*Current state shown*: **originally not satisfied, confirmed by direct re-read of the thrown message and its downstream rendering.** The conflict was thrown as `new Error('This claim changed while confirmation was open. Review its current status and try again.')` — a **static string with zero claim-specific dynamic content**: no interpolated status, title, or any other current field value, unlike `MAINTENANCE_TASK_UPDATE`'s own conflict path, whose `maintenanceConflictDescription(task)` genuinely interpolated the task's real current title/status/priority/due date into its message. The generic error-catch wrapper every confirm handler shares renders this as a `WORKFLOW_PROGRESS` block with `details: []` and `actions: []` hardcoded empty — `description` (the error message) is the *only* dynamic field, and for Claims that field carried no per-claim data at all.

**FIXED, 2026-09-17, per explicit user request to continue the same defect fix into Protection/Decisions after Buyer's B06: `PASS`.** A new `claimConflictDescription` (pure, exported), mirroring `maintenanceConflictDescription`'s own shape, now interpolates the claim's real current title and status: a `CLOSED` claim is named explicitly (the one status here analogous to Maintenance/Buyer's "already completed" terminal case), every other status falls back to naming the claim's current status plainly (e.g. "is now under review").

**Verification: 3 new unit tests** in `tests/ask/claimAndSaleReadinessConflictDescription.test.js` (a closed claim names the closure explicitly; every other status interpolates correctly; an unrecognized status degrades gracefully to a humanized string rather than throwing). All pass, alongside a clean `tsc --noEmit` and fresh-parse check. Not independently tested at the `confirmClaimTransition` call-site level (composes a live Prisma lookup) — same STATIC-verification boundary applied throughout this audit series. **Not** database- or browser-verified.

Scored PASS: both halves of the two-part requirement are now genuinely real.

## P05 — Claim submission succeeds and refresh fails

**Required:** "Durable receipt; no repeat-submit instruction; read retry offered."

**Verdict: PARTIAL — corrected from an original PASS after external review.**

**Correction:** the original pass substituted `confirmAskExecution`'s confirmation-claim idempotency (protection against *this same confirm attempt* being retried or racing another attempt) for read-refresh recovery (the scenario's actual subject: the write already succeeded once, cleanly, and a *separate, subsequent read* — e.g., a list the homeowner was viewing — fails to refresh afterward). These are different failure modes with different mechanisms; Maintenance's `MAINTENANCE_TASK_COMPLETE`/`UPDATE` are the concrete example of the mechanism this scenario is actually asking about (`refreshMaintenanceSourceExecution`, confirmed in the Completed-reference re-verification document), and Claims has no equivalent.

*Durable receipt*: real. Both `confirmClaimFile` and `confirmClaimTransition` produce a genuine `WORKFLOW_PROGRESS` block with the claim's actual post-write state (`askOrchestrator.service.ts:9720–9760`).

*No repeat-submit instruction*: real — neither receipt's `suggestions` or `actions` tell the homeowner to resubmit anything.

*Read retry offered*: **originally not satisfied, confirmed by direct re-read.** Neither handler called any refresh/reconciliation mechanism at all — both `return { result, artifactType, artifactId }` with no `refreshedExecutions` field, confirmed by direct read of both functions in full. Each receipt's only action was a bare `{ id: 'open-claim', label: 'Open claim', href: ..., style: 'PRIMARY' }` — a general navigation link to the claim's own page, not a scoped "the list you were viewing couldn't refresh; here's how to see its current state" affordance the way Maintenance's `LIMITATION` block ("Saved; list could not refresh... ask 'What maintenance is pending?'") provides.

**FIXED, 2026-09-17, by reusing B04's `ASK_MUTATION_IMPACT_MAP`/`reconcileAskExecutionSideEffects` mechanism** (the same server-owned sibling-refresh infrastructure Buyer's B03/B04 built and Buyer's B02 relies on) rather than inventing a second one. `CLAIM_FILE` and `CLAIM_TRANSITION` both now declare `INCIDENT_CONTINUATION` as their sole sibling in `ASK_MUTATION_IMPACT_MAP` — it is the one read in this track whose membership or claim-state display can change from either mutation (it shows the 10 most recent incidents *and* the 10 most recent claims, per P02's own finding below). Both `confirmClaimFile` and `confirmClaimTransition` now call `reconcileAskExecutionSideEffects` and return its `refreshedExecutions`; on a refresh failure, each pushes a new `LIMITATION` block ("Saved; list could not refresh... ask 'Show my recorded claims'/'Show my open claims'") onto the receipt, mirroring `confirmBuyerTaskUpdate`'s own established failure-disclosure pattern exactly. `CLAIM_FILE`/`CLAIM_TRANSITION`'s `allowedBlockTypes` (registry) and the owning `incident-claim` Skill's manifest `allowedResultBlocks` and evaluation `expectedBlockTypes` were all extended to declare `LIMITATION` — the same 3-site drift class the earlier sell/hold/rent fix found, checked proactively this time rather than discovered as a separate bug afterward.

**Verification: 6 new tests** — 1 in `tests/ask/buyerMutationImpactReconciliation.test.js` (both operations declare the `INCIDENT_CONTINUATION` sibling) and 4 in a new `tests/ask/claimReconciliationGovernance.test.js` (both confirm handlers call `reconcileAskExecutionSideEffects` and return `refreshedExecutions`; the registry declares `LIMITATION` for both operations; the Skill manifest and evaluation both declare it too) plus 1 combined manifest/evaluation check. `tsc --noEmit` clean, fresh-parse clean. **Not** database- or browser-verified — a live write-then-refresh-failure round trip against `INCIDENT_CONTINUATION` was not exercised against a live database this session.

**Revised verdict: `PASS`.** All 3 required elements are now genuinely met.

## P06 — Access is revoked during review

**Required:** "Sensitive proposal/evidence redacted and action rejected."

**Verdict: PASS, via the inherited platform mechanism.** Verdict unchanged after external review, but the evidence trail was incomplete — the original pass cited only backend access rechecks, when XSEC-002 ("a prior client snapshot cannot remain an actionable disclosure") is fundamentally about what the *client* does with content it already has in memory, not only whether the backend rejects a stale action. Corrected below to cite the actual redaction path.

*Backend*: every Protection-and-claims read (`coverageResult`, `coverageComparisonStatusResult`, `incidentClaimStatusResult`) opens with `ensurePropertyAccess(userId, propertyId)`, so a lost property/household role is caught on the very next read. Confirm-time role re-verification is likewise inherited from the generic `confirmAskExecution` role-rank check against each command's declared `roleFloor` (`CONTRIBUTOR` for both `CLAIM_FILE` and `CLAIM_TRANSITION`), so a rejected action is genuinely rejected server-side, not just hidden client-side.

*Frontend*: `redactAccessLostResult` (`apps/frontend/src/components/ask/AskWorkspace.tsx:2036`), confirmed by direct read, is a real, non-trivial client-side redaction — on an access-lost failure it blanks `blocks`/`originalResponse`/`confirmation`/`clarification`/`captureRequests`/`suggestions`/`skillHandoff`/`viewState` for **every** execution belonging to the now-inaccessible property (not only the one that triggered the check), clears the session-storage view cache, and drops pending-work entries for that property. The code's own comment documents this was extracted specifically because a confirmation card's stale proposal/consent/Confirm button used to stay fully rendered and usable after a backend rejection, with redaction previously wired only into the refresh path. This is the mechanism that actually satisfies "a prior client snapshot cannot remain an actionable disclosure," and it should have been part of the original evidence trail. Nothing Claims-specific was found beyond this — same platform-floor caveat as P05, now cited across both layers rather than one.

**Coverage gap, not scored against the verdict:** this document verifies `redactAccessLostResult`'s existence and behavior by direct code read only. No frontend component test exercises the redaction path end to end (e.g., confirming a rendered `ConfirmationCard` actually disappears/blanks after a simulated access-lost response) — that would need a browser or component-test harness this session doesn't have.

## P07 — Comparison lacks equivalent terms

**Required:** "Limitation visible; no unsupported 'better coverage' conclusion."

**Verdict: PASS.**

`coverageComparisonStatusResult` models `equivalenceStatus` as `BASELINE`/`EQUIVALENT`/`NON_EQUIVALENT`/`INDETERMINATE`/`MIXED` — confirmed during Phase 0 §4.12 and re-verified here — and never collapses an unmatched-terms comparison into an implied "better" verdict; the summary body states the real equivalence label (including "Not enough confirmed facts to tell" for `INDETERMINATE`) rather than a naked recommendation.

## P08 — Safety guidance is present with a dismissible financial insight

**Required:** "Safety guidance remains; dismissal affects only the declared insight."

**Verdict: Untestable as written — the scenario's own precondition doesn't exist yet.**

The *safety* half is real: `EMERGENCY_BOUNDARY` (and every `*_BOUNDARY` operation) is static, non-async content with zero action or suggestion surface (Phase 0 §4.14) — there is no dismissal control anywhere near it to interact with, by construction. But the *dismissible financial insight* half of this scenario has nothing to test against: `DISMISS` is not implemented anywhere in the application. Confirmed during Phase 0 Stage 1: `interactionDispatch.ts`'s `resolveItemActionDispatch` maps `DISMISS` to `{kind: 'UNSUPPORTED', reason: 'This action is not available yet.'}` platform-wide — this is explicitly Phase 9 scope per the FRD's own §21 (`DISMISS`/`ALREADY_HANDLED`/`REMIND_LATER` implementation, gated on the §22 policy decisions for dismissal semantics). There is no Protection-and-claims-specific dismiss mechanism to fail or pass independently of that platform-wide gap. Scored as its own category rather than forced into PASS/FAIL: the half that exists is solid; the half the scenario is actually about cannot be evaluated until Phase 9.

## Summary

| ID | Required outcome | Verdict |
| --- | --- | --- |
| P01 | Missing/unverified policy: uncertainty + capture step | **PASS** |
| P02 | Ambiguous incident: clarify before showing OR mutating | **PARTIAL** — mutation-clarify (`CLAIM_TRANSITION`) real; `INCIDENT_CONTINUATION` shows claim state unconditionally, with no clarification |
| P03 | Missing claim info: retain values, ask only what's needed | **PASS** (fixed) — `CLAIM_FILE_INPUTS` captureRequests form now pre-fills the original message as `description` (and any explicit title), mirroring `MAINTENANCE_TASK_CREATE` |
| P04 | Stale claim transition blocked, current state shown | **PASS** (fixed) — stale-block is genuinely Claims-specific idempotent-replay engineering; "current state shown" now real via new `claimConflictDescription` |
| P05 | Write succeeds, read fails: durable receipt, no repeat-write, read retry offered | **PASS** (fixed) — reuses B04's `ASK_MUTATION_IMPACT_MAP`/`reconcileAskExecutionSideEffects`; `INCIDENT_CONTINUATION` declared as the sole sibling for both `CLAIM_FILE`/`CLAIM_TRANSITION` |
| P06 | Access revoked mid-review: redact, reject | **PASS** (platform-wide mechanism, inherited across both backend access rechecks and frontend `redactAccessLostResult`) |
| P07 | Non-equivalent comparison: no false "better coverage" | **PASS** |
| P08 | Safety guidance survives a dismiss; dismissal scoped | **UNTESTABLE** — `DISMISS` doesn't exist yet (Phase 9 scope) |

**6 of 7 testable scenarios pass fully, 1 partial, 1 (P08) can't be evaluated until `DISMISS` exists.** Originally scored 5/1/1; external review corrected P02, P04, and P05 to 3/4/1; P04's fix (2026-09-17, per explicit user request to continue the same defect fix already applied to Buyer's B06 into this track) brought it to 4/3/1; P03 and P05's fixes (2026-09-17) now net to 6/1/1. This track's one genuinely well-engineered, Claims-specific mechanism is `CLAIM_TRANSITION`'s idempotent-replay handling (P04's already-solid half) — real, now paired with a genuinely dynamic conflict message (`claimConflictDescription`), a real retained-value capture form (`CLAIM_FILE_INPUTS`), and a real sibling-refresh mechanism (`ASK_MUTATION_IMPACT_MAP`) too. The one remaining scenario (P02) still has a "generic platform mechanism ≠ the specific thing being asked about" substitution: clarifying before a *mutation* is not clarifying before a *read* — `INCIDENT_CONTINUATION` still shows claim state unconditionally, with no message parameter to disambiguate against. P05's own substitution (idempotent confirmation-claim protection is not read-refresh recovery) is now closed, by reusing the exact mechanism Buyer's B03/B04 built rather than inventing a second one. The same static-conflict-message pattern P04 had is fixed in all 3 places it was found — Buyer's B06, Decisions' D07, and this document's P04 — closing what was, until that fix, a platform-wide gap outside Maintenance's own 2 handlers. P03's own gap — `CLAIM_FILE`'s clarification path using the platform's simpler `durableFreeTextClarification` helper rather than the richer `captureRequests`/`currentAnswer` pattern — is now closed too, mirroring `MAINTENANCE_TASK_CREATE`'s own reference implementation.
