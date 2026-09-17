# Ask Cozy Cross-Domain Interaction Rollout — Phase 8 Protection and Claims Acceptance Scenario Verification

**Status:** Complete — all 8 acceptance scenarios (P01–P08) evaluated.
**Verdict: 5 full passes, 2 partial passes, 1 scenario untestable because its precondition (a `DISMISS` control) doesn't exist anywhere in the app yet.** This is the strongest track verified so far — most passes come from generic platform mechanisms (confirmation freshness, access re-verification, honest degradation) that Protection and claims inherits cleanly, plus one genuinely well-engineered piece of idempotent-replay handling specific to `CLAIM_TRANSITION`.
**Governs:** [Ask Cozy — Cross-Domain Interaction Rollout FRD](../product/ASK_COZY_CROSS_DOMAIN_INTERACTION_ROLLOUT_FRD.md) §12.3 (P01–P08) and §21 Phase 8's exit criterion ("P01–P08 pass").
**Builds on:** [Phase 0 Coverage Audit](ASK_COZY_PHASE0_COVERAGE_AUDIT.md) §4.12, which traced all 6 Protection-and-claims operations to the handler level. This document re-reads the code against each specific acceptance scenario, including the `confirmClaimFile`/`confirmClaimTransition` bodies not read in full during Phase 0.
**Verification level: STATIC.** Every verdict below is derived from reading `askOrchestrator.service.ts`'s coverage/incident/claim handlers and `interactionDispatch.ts` directly, plus the platform-wide confirmation mechanism already verified in the Phase 0 audit (§2.5). Nothing here is database- or browser-verified.

## Methodology

Same as the Phase 6/7 verifications: PASS (fully confirmed by code), PARTIAL (part of the requirement met, a specific part isn't), FAIL (confirmed not met). Where a scenario is satisfied by a platform-wide mechanism rather than something Claims-specific, that's noted explicitly — it's still a real pass, just not evidence of extra engineering effort in this track.

## P01 — Ask about coverage with a missing/unverified policy

**Required:** "Explicit uncertainty and supported document/capture next step."

**Verdict: PASS.**

Confirmed on both relevant operations. `coverageResult` (`COVERAGE_GAPS`) keeps `NO_COVERAGE`/`COVERAGE_UNCLEAR`/`EXPIRED`/`EXPIRING_SOON`/`EVIDENCE_MISSING` as genuinely distinct groups and states outright that "Unknown records remain separate from confirmed gaps" — never collapsing "unverified" into "no coverage." It also offers a real `captureRequests`-based next step (via `evaluateFeatureContext`, `featureKey: 'COVERAGE_INTELLIGENCE'`) for the `COVERAGE_UNCLEAR` case specifically. `coverageComparisonStatusResult` (`COVERAGE_COMPARISON_STATUS`) has its own honest `BASELINE_REQUIRED` state: "No verified policy on file yet... Add and verify your policy first," with a direct link to the comparison workspace. Neither operation infers coverage from an unverified record.

## P02 — Several incidents could match a continuation

**Required:** "Clarify exact incident before showing or mutating claim state."

**Verdict: PASS, with a scoping note.**

`incidentContinuationResult` (`INCIDENT_CONTINUATION`) takes **no message parameter at all** — confirmed by its own signature (`async function incidentContinuationResult(propertyId: string)`) — so it has no mechanism to interpret "continue with that one" as referring to a specific prior incident; it just lists the 10 most recent incidents and claims unconditionally. The scenario's actual requirement — clarify before *mutating* claim state — is real and confirmed on the operation that actually mutates: `claimTransitionResult` uses `exactEntityMatch` against the message, and when it doesn't resolve to exactly one claim, returns `NEEDS_ENTITY` with a `GROUPED_LIST` of the open claims and an explicit "Use the exact claim title" instruction — no status change happens on an ambiguous match. Scored PASS on the mechanism the scenario is actually probing (clarify before mutating); noting that `INCIDENT_CONTINUATION` itself has no matching logic to test, since it isn't a targeted operation.

## P03 — Prepare a claim with missing required information

**Required:** "Retain entered values; request only canonical required inputs."

**Verdict: PARTIAL.**

*Request only canonical required inputs*: real. `claimFileResult` requires exactly one thing — the incident type, parsed via `claimTypeFromMessage` — before it will even build a confirmation; it does not demand fields it doesn't need (the title is derived automatically from the message once a type is found).

*Retain entered values*: **fails.** `claimFileResult`'s missing-type branch returns `durableFreeTextClarification('CLAIM_FILE', ...)` — confirmed by direct reading (`askOrchestrator.service.ts:510`) that this helper carries forward only `candidateOperationIds`/`expiresAt`; it has no field for the original message text or any extracted partial value. Contrast with `MAINTENANCE_TASK_CREATE`'s missing-input branch, which uses a real `captureRequests` `GROUP` form with `currentAnswer: Object.fromEntries(...)` explicitly pre-filling whatever was already extracted. If a homeowner's first message ("My roof leaked during the storm, ceiling damage in the guest room...") doesn't happen to match a recognized incident-type pattern, none of that detail survives into the clarification round-trip — the homeowner has to retype the whole thing, not just add the missing type.

## P04 — Claim state changes in another session before confirmation

**Required:** "Stale transition blocked; current state shown."

**Verdict: PASS.**

`confirmClaimTransition` (`askOrchestrator.service.ts:9521`) is a precise, well-engineered match, stronger than most other confirm handlers verified in this audit series. It re-fetches the claim fresh, recomputes a version hash, and throws `ASK_CONTEXT_VERSION_CONFLICT` ("This claim changed while confirmation was open. Review its current status and try again.") on a genuine mismatch. Critically, the guard is `parameters.claimContextVersion !== currentVersion && claim.status !== nextStatus` — it does **not** false-positive-block a retried confirmation that lands on a claim already in the target status (a lease-reclaim replay scenario): `claim.status === nextStatus ? await ClaimsService.getClaim(...) : await ClaimsService.updateClaim(...)` re-reads rather than errors or re-applies when the transition already happened. This is real idempotent-replay handling on top of the generic freshness check, not just the platform-wide baseline.

## P05 — Claim submission succeeds and refresh fails

**Required:** "Durable receipt; no repeat-submit instruction; read retry offered."

**Verdict: PASS, via the inherited platform mechanism — not something built specifically for Claims.**

Both `confirmClaimFile` and `confirmClaimTransition` produce a real, durable `WORKFLOW_PROGRESS` receipt with the claim's actual post-write state and a working "Open claim" link. Neither has any claim-specific write-succeeded/read-failed handling beyond what every confirmation-gated operation already inherits from `confirmAskExecution`'s own generic conflict-recovery path (verified in Phase 0 §2.5): a concurrent or retried attempt is guarded to only touch an execution still `RUNNING`, and a losing/late attempt re-reads and returns the actual current state rather than fabricating an `EXPIRED` result over a real success. This is a genuine pass, but it's the platform floor, not Claims-specific engineering — unlike P04's idempotent-replay handling, which *is* Claims-specific.

## P06 — Access is revoked during review

**Required:** "Sensitive proposal/evidence redacted and action rejected."

**Verdict: PASS, via the inherited platform mechanism.**

Every Protection-and-claims read (`coverageResult`, `coverageComparisonStatusResult`, `incidentClaimStatusResult`) opens with `ensurePropertyAccess(userId, propertyId)`, so a lost property/household role is caught on the very next read — no cached "sensitive proposal or evidence content" is served from client state alone. Confirm-time role re-verification is likewise inherited from the generic `confirmAskExecution` role-rank check against each command's declared `roleFloor` (`CONTRIBUTOR` for both `CLAIM_FILE` and `CLAIM_TRANSITION`). Nothing Claims-specific was found beyond this — same platform-floor caveat as P05.

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
| P02 | Ambiguous incident: clarify before mutating | **PASS** (scoped to `CLAIM_TRANSITION`; `INCIDENT_CONTINUATION` has no matching logic at all) |
| P03 | Missing claim info: retain values, ask only what's needed | **PARTIAL** — only-required-inputs passes; nothing retains prior message content |
| P04 | Stale claim transition blocked, idempotent on replay | **PASS** — genuinely Claims-specific engineering, not just the platform floor |
| P05 | Write succeeds, read fails: durable receipt, no repeat-write | **PASS** (platform-wide mechanism, inherited) |
| P06 | Access revoked mid-review: redact, reject | **PASS** (platform-wide mechanism, inherited) |
| P07 | Non-equivalent comparison: no false "better coverage" | **PASS** |
| P08 | Safety guidance survives a dismiss; dismissal scoped | **UNTESTABLE** — `DISMISS` doesn't exist yet (Phase 9 scope) |

**5 of 7 testable scenarios pass fully, 1 partial, 1 scenario (P08) can't be evaluated until `DISMISS` exists.** This is the cleanest track verified in this series. The one real, Protection-and-claims-specific gap is P03: `CLAIM_FILE`'s clarification path uses the platform's simpler `durableFreeTextClarification` helper rather than the richer `captureRequests`/`currentAnswer` pattern other operations (`MAINTENANCE_TASK_CREATE`, `HOME_DEADLINE_MONITOR`) already use to preserve partial input across a clarification round-trip — a specific, fixable gap, not a missing mechanism (the richer pattern already exists elsewhere in the same file). The remaining passes split evenly between genuine Claims-specific engineering (P04's idempotent-replay handling) and the solid platform floor every confirmation-gated operation already inherits (P05, P06).
