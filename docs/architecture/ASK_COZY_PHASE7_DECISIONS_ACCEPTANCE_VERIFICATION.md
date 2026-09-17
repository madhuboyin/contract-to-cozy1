# Ask Cozy Cross-Domain Interaction Rollout — Phase 7 Decisions and Projects Acceptance Scenario Verification

**Status:** Complete — all 8 acceptance scenarios (D01–D08) evaluated. **D07 revised 2026-09-17 after external review found the same "generic conflict message ≠ current state shown" substitution already corrected in the Phase 8 document's P04.**
**Verdict: no outright failures, but only 2 of 8 scenarios pass fully.** Originally scored 3 of 8 fully passing. D07 is corrected here from PASS to PARTIAL: `confirmSellerPrepItemDecision`'s stale-write guard is real, but its conflict message is static boilerplate with zero item-specific dynamic content, so "current disposition shown" isn't actually satisfied — the same defect independently confirmed in Phase 8's P04 (`CLAIM_TRANSITION`) and Buyer's B06. The Decisions and projects track is still more mature than Buyer's own verification found — real per-thread freshness, real scenario persistence, real staleness signaling all exist — but now 6 of 8 scenarios pass only partially, each against a specific, named gap.
**Governs:** [Ask Cozy — Cross-Domain Interaction Rollout FRD](../product/ASK_COZY_CROSS_DOMAIN_INTERACTION_ROLLOUT_FRD.md) §13.3 (D01–D08). Phase 7's own exit criterion also covers F01–F08 (Financial); this document covers D01–D08 only, per the specific request that produced it.
**Builds on:** [Phase 0 Coverage Audit](ASK_COZY_PHASE0_COVERAGE_AUDIT.md) §4.7 (`SELL_HOLD_RENT_ANALYSIS`/`GOAL_CAPTURE`) and §4.11 (the other 17 Decisions-and-projects operations), which traced every operation to the handler level. This document re-reads the code against each specific acceptance scenario, including several confirm-time handler bodies not read in full during Phase 0.
**Verification level: STATIC.** Every verdict below is derived from reading `askOrchestrator.service.ts`'s HVAC/seller-prep/renovation confirm and propose handlers, `decisionThreadService.ts`, and `askOperationRegistry.ts` directly. Nothing here is database- or browser-verified — no live decision thread was exercised end to end.

| Field | Status |
| --- | --- |
| Audit coverage | Complete — all 8 acceptance scenarios (D01–D08) evaluated |
| Static (code-read) acceptance | 2 pass, 6 partial, 0 fail |
| Runtime/browser acceptance | Not evaluated this session — no live database or browser exercised |
| Phase 7 exit criterion ("applicable F01–F08 and D01–D08 scenarios pass") | **Not met** — 6 of 8 D-scenarios are only partial |

## Methodology

Same as the Phase 6 Buyer verification: PASS (fully confirmed by code), PARTIAL (part of the requirement met, a specific part isn't), FAIL (confirmed not met). Scoping notes where a scenario spans multiple operation families with different answers.

## D01 — Start and later resume an HVAC or sell/hold/rent decision

**Required:** "Same durable thread; current assumptions/evidence loaded."

**Verdict: PARTIAL.**

*Same durable thread*: real and well-engineered. `decisionThreadService.selectHvacDecisionThread` returns a `UNIQUE`/`AMBIGUOUS`/`NONE` discriminated union keyed on `(propertyId, decisionDefinitionId, primaryEntityType, primaryEntityId)`; `activeIdentityKey`'s own uniqueness constraint (confirmed via `abandonDecisionThread`'s comment: `ABANDONED` sets it to `null` specifically so it "frees up for a future create-or-resume") guarantees one active thread per subject. `HVAC_DECISION_START`'s "already active" branch and `HVAC_DECISION_CONTINUE` both resolve to the identical thread on a second ask. `SELL_HOLD_RENT_ANALYSIS` (post-§22 implementation) and `SELL_HOLD_RENT_GOAL_CAPTURE` share the same durable identity via `sellHoldRentDecisionFamilyAdapter`.

**What's missing:** "current assumptions/evidence loaded" is not met. Direct grep of both `hvacDecisionStartResult` and `hvacDecisionContinueResult` (`askOrchestrator.service.ts`) found **zero** `EVIDENCE` or `ASSUMPTIONS` block pushes in either function, despite `HVAC_DECISION_START`'s own registry entry declaring both as allowed block types. What *is* shown on resume: verdict, reason codes, confidence label, and any saved `PREFERENCE_REFERENCE` — real, but not the same thing as evidence citations or stated modeling assumptions. A homeowner resuming a decision sees the recommendation and why it might have changed, but not what facts or assumptions it's actually built on.

## D02 — Edit a scenario assumption

**Required:** "New comparison revision; original retained; no canonical fact silently changed."

**Verdict: PASS.**

`confirmHvacDecisionScenario` (`askOrchestrator.service.ts:10375`) calls `decisionThreadService.createHvacScenario(scenarioThread.id, userId, {...})`, which returns a real, persisted `scenario`/`scenarioSnapshot` (confirmed by its own `scenario.id` being used as the confirmation's `artifactId` — not an ephemeral, discard-after-display computation). The resulting `scenarioComparisonBlock` explicitly shows **both** the thread's existing `currentRecommendationSnapshot` (labeled "Current recommendation," unmodified) **and** the new scenario's own verdict side by side — a direct, literal match for "new comparison revision; original retained." Both propose- and confirm-time copy state explicitly that the recorded decision is never overwritten ("It never overwrites the recorded decision" / description text at confirm time). No canonical fact is touched — the scenario read/write path never calls `decisionThreadService`'s own recommendation-supersession functions.

## D03 — Save then forget a scoped preference

**Required:** "Exact scope disclosed; receipts; subsequent decision refresh reflects change."

**Verdict: PARTIAL — a confirmed asymmetry between save and forget.**

*Exact scope disclosed*: real, on both sides. Propose-time (`hvacPreferenceSaveResult`) discloses "Who can see this" (Household summary), "Used for" (HVAC repair/replace decisions), and "Expires" (12 months or explicit forget) before confirmation.

*Receipts*: real, on both sides, and genuinely well-written. `confirmHvacPreferenceSave` returns a `PREFERENCE_REFERENCE` block per saved preference with `confirmedAt`/`summary`/`visibility`. `confirmHvacPreferenceForget` returns a `WORKFLOW_PROGRESS` block whose description explicitly discloses the refresh promise: "Affected decisions will be recalculated the next time you open them" (or "No active decision used this preference" when nothing was affected) — the receipt itself states the exact mechanism confirmed below, not just that the preference was removed.

*Subsequent decision refresh reflects change*: **confirmed true for forget only.** `confirmHvacPreferenceForget` explicitly calls `decisionThreadService.markThreadsStaleByIds(affectedThreadIds, 'PREFERENCE_REVOKED')` — this directly marks every affected `DecisionThread`'s `contextStatus` stale, so the next `HVAC_DECISION_CONTINUE` read recomputes and discloses the change via `WHY_NOW`/`RECOMMENDATION_CHANGE`. **`confirmHvacPreferenceSave` has no equivalent call** — direct reading of the full function found no `markThreadsStaleByIds` or any other staleness signal. Saving a new preference does not itself mark any thread stale, so a thread's recommendation is not guaranteed to reflect a just-saved preference until something else (a fact change, a manual resume) triggers a recompute. This is a real, specific, confirmed asymmetry — not a guess from absence of evidence.

## D04 — Record an outcome after the source action changed

**Required:** "Revalidate linkage; clarify or reject stale target."

**Verdict: PASS.**

*Revalidate linkage*: `confirmHvacDecisionOutcomeReport` (and `confirmHvacDecisionOutcomeUnlink`) re-checks `parameters.hvacDecisionContextVersion !== await hvacDecisionThreadVersionFingerprint(candidate.data.decisionThreadId)` and throws `ASK_CONTEXT_VERSION_CONFLICT` on drift — the same atomic-freshness pattern verified platform-wide, applied here specifically to the thread the outcome is being attached to.

*Clarify or reject stale target*: `hvacDecisionOutcomeUnlinkResult` requires a genuinely disputable outcome (`REPORTED`/`CORROBORATED`/`VERIFIED` status) to exist before it will even propose a dispute confirmation — a stale or already-resolved target returns `NOT_APPLICABLE`, not a fabricated dispute option.

## D05 — Open quote/seller/decision workspace and return

**Required:** "Workflow, selected item/scenario and position restored."

**Verdict: PARTIAL, and the answer differs by operation family.**

There is no Decisions-and-projects equivalent of `MaintenanceViewState` (`askOrchestrator.service.ts:1520`, confirmed absent during the Phase 6 Buyer verification and re-confirmed here by the same grep returning nothing for this track) — no conversational `resultId`/filter/position cache exists anywhere in this family, same gap already found in Buyer (B07).

What *does* restore "workflow and selected item" is each operation's own durable, property-scoped identity, which stands in for an explicit cache without actually being one:
- HVAC: `selectHvacDecisionThread`'s identity key means re-asking about a specific system after visiting its workspace resolves to the *same* thread automatically.
- Seller prep: `PropertySaleCaseService.getCase` reads the one active sale case per property — there's only ever one to restore.
- Quote comparison: `quoteComparisonReviewResult` reads the most-recently-updated workspace (`orderBy: {updatedAt: 'desc'}`) — implicitly "the" current one, no selection state needed.

None of these restore **position** (which scenario tab was open, which section of a checklist was scrolled to, or any Ask-conversation-level state) — that half of the requirement is unmet everywhere in this track, same as Buyer.

## D06 — Abandon a decision

**Required:** "History retained according to domain rules; active next actions suppressed."

**Verdict: PARTIAL.**

*History retained*: real and carefully engineered. `decisionThreadService.abandonDecisionThread` (`decisionThreadService.ts:722`) is a version-guarded lifecycle transition (`updateMany` conditioned on `version: thread.version`, throws `DecisionThreadVersionConflictError` on a race) that sets `lifecycleStatus: 'ABANDONED'` and clears `activeIdentityKey` to `null` specifically so the identity "frees up for a future create-or-resume" (the function's own comment) — the thread row itself is never deleted, and its full history stays queryable.

*Active next actions suppressed*: **not implemented.** `abandonDecisionThread` touches only the `DecisionThread` row — confirmed by direct reading, it makes no call into `HomeAction`, `OperationalWorkItem`, or any suppression/feedback service. `HVAC_SPECIALIST_ENGAGE`'s own `homeActionOrigin` linkage (Phase 0 §4.11) shows HVAC decisions can originate from a Home Action; abandoning the decision thread does nothing to that Home Action, which could keep recommending the same repair/replace decision the homeowner just walked away from.

## D07 — Seller-prep item changes in another session

**Required:** "Stale item action blocked; current disposition shown."

**Verdict: PARTIAL — corrected from an original PASS after external review; the same defect independently found in Phase 8's P04 and Buyer's B06.**

*Stale item action blocked*: genuinely real. `confirmSellerPrepItemDecision` (`askOrchestrator.service.ts:9797`) re-fetches the item fresh from the database, recomputes `sellerPrepItemContextVersion(item)`, and throws `ASK_CONTEXT_VERSION_CONFLICT` if it no longer matches the version captured at propose time. The stale action is genuinely blocked before `PropertySaleCaseService.setItemDecision` is ever called.

*Current disposition shown*: **not satisfied, confirmed by direct re-read.** The conflict is thrown as `new Error('This checklist item changed while confirmation was open. Review it and try again.')` (line 9812) — a static string with no interpolated disposition, status, or any other item-specific value. This is the identical pattern found in Phase 8's `confirmClaimTransition` (P04) and Buyer's `confirmBuyerTaskUpdate` (B06): the shared generic error-catch wrapper (`askOrchestrator.service.ts:11579–11634`) renders the result as a `WORKFLOW_PROGRESS` block with `details: []` and `actions: []` hardcoded empty, so "review it" is an instruction, not a display. Only `MAINTENANCE_TASK_COMPLETE`/`UPDATE`'s `maintenanceConflictDescription` genuinely interpolates real current-record values into the conflict message anywhere in this codebase.

Scored PARTIAL: the block itself is real and correctly engineered; the disclosure half of the requirement is confirmed absent.

## D08 — Prospective renovation question has no tracked case

**Required:** "Route to distinct supported guidance or limitation, not tracked-case readiness."

**Verdict: PARTIAL.**

*Not tracked-case readiness*: real. `renovationPermitReadinessResult`'s empty-case branch returns an honest `NEEDS_CONTEXT` limitation ("No active renovation case is recorded... those records cannot establish the scope of new work") rather than fabricating a readiness verdict from raw Permit Tracker records — confirmed during Phase 0 §4.11 and re-verified here.

*Route to distinct supported guidance*: **not implemented.** Confirmed by grep across the whole file: `RENOVATION_PERMIT_READINESS` is the only operation that references renovation at all. The empty-case branch's only two actions are "Start renovation planning" and "Review permits" — both still inside the same tracked-case-adjacent workflow, not a genuinely separate guidance destination. `GUIDANCE_JOURNEY_CREATE`'s own scope-matching (Phase 0 §4.11) has no renovation-specific branch either. A prospective, non-tracked renovation question has nowhere distinct to go — it either starts a case or hits the same limitation again.

## Summary

| ID | Required outcome | Verdict |
| --- | --- | --- |
| D01 | Resume: same thread, current assumptions/evidence loaded | **PARTIAL** — thread identity real; EVIDENCE/ASSUMPTIONS blocks never rendered |
| D02 | Scenario edit: new revision, original retained, no silent fact change | **PASS** |
| D03 | Save/forget preference: scope, receipts, refresh reflects change | **PARTIAL** — forget marks threads stale; save does not |
| D04 | Outcome report: revalidate linkage, reject stale target | **PASS** |
| D05 | Workspace round-trip: workflow/item/scenario/position restored | **PARTIAL** — durable identity substitutes for restoration; no position cache anywhere |
| D06 | Abandon: history retained, next actions suppressed | **PARTIAL** — history retention real; no Home Action suppression |
| D07 | Seller-prep item changed elsewhere: stale action blocked, current disposition shown | **PARTIAL** — corrected from PASS: block is real; disposition-shown fails (static conflict message, same defect as Phase 8's P04 and Buyer's B06) |
| D08 | No tracked renovation case: distinct guidance, not fabricated readiness | **PARTIAL** — honest limitation shown; no distinct guidance destination exists |

**2 full passes, 6 partial passes, 0 outright fails, out of 8 scenarios.** Originally scored 3/5/0 before external review corrected D07. This track remains genuinely more mature than Buyer's — every partial pass here fails on one specific, narrow, well-defined gap rather than lacking the underlying mechanism entirely, and the platform's more sophisticated safety mechanisms (per-thread staleness marking, disputable-outcome gating, scenario-revision persistence with original-retained disclosure) still live here. The recurring theme across the partials is under-disclosure and under-propagation, not fabrication or missing safety: assumptions/evidence exist but aren't shown (D01); a staleness signal exists but only fires from one of two related actions (D03); durable identity substitutes for, but doesn't fully deliver, position restoration (D05); a real lifecycle transition doesn't reach into the one adjacent system (Home Actions) it plausibly should (D06); a stale-write guard exists but its conflict message carries no current-record data (D07, the newly-corrected finding — also true of Claims' P04 and Buyer's B06, suggesting this is a platform-wide gap rather than a Decisions-specific one); and one track (renovation) has no distinct destination for a whole category of question (D08).
